import { createEmptyDocument, createSampleWorkspace, migrateDocumentToWorkspace, normalizeWorkspace } from "./document";
import { clearStoredDocument, loadStoredWorkspace } from "./storage";
import type { CVBlock, CVLanguageDocument, CVWorkspace } from "./types";

// A browser-local library of CVs, each with saved versions.
//
// Working copies are written on every edit, so they stay in localStorage
// (synchronous, read at boot) under one key per CV: two tabs editing
// different CVs never overwrite each other. Versions are full snapshots and
// can add up, so they live in IndexedDB, which has far more room.

export type CVMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type LibraryIndex = {
  version: 1;
  activeId: string;
  cvs: CVMeta[];
};

export type CVVersionKind = "manual" | "auto";

export type CVVersion = {
  id: string;
  cvId: string;
  label: string;
  kind: CVVersionKind;
  createdAt: number;
  workspace: CVWorkspace;
};

const INDEX_KEY = "cv-forge-library-v1";
const CV_KEY_PREFIX = "cv-forge-cv:";
const DB_NAME = "cv-forge";
const VERSION_STORE = "versions";
/** Automatic versions kept per CV; manual versions are never pruned. */
export const MAX_AUTO_VERSIONS = 20;

export function createId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function createEmptyWorkspace(): CVWorkspace {
  return migrateDocumentToWorkspace(createEmptyDocument());
}

/**
 * JSON with sorted keys and without `hidden: false`, so the same content
 * compares equal whether or not it went through normalization.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => {
    if (key === "hidden" && item === false) return undefined;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return item;
  });
}

/** Content identity of a workspace, ignoring which language tab is open. */
export function contentKey(workspace: CVWorkspace): string {
  return canonical(workspace.languages);
}

// ── Library index and working copies (localStorage) ───────

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizeIndex(value: unknown): LibraryIndex | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.cvs)) {
    return null;
  }
  const cvs = record.cvs.flatMap((item): CVMeta[] => {
    if (typeof item !== "object" || item === null) return [];
    const meta = item as Record<string, unknown>;
    if (typeof meta.id !== "string") return [];
    return [{
      id: meta.id,
      name: typeof meta.name === "string" && meta.name.trim() ? meta.name : "Untitled CV",
      createdAt: typeof meta.createdAt === "number" ? meta.createdAt : Date.now(),
      updatedAt: typeof meta.updatedAt === "number" ? meta.updatedAt : Date.now()
    }];
  });
  if (cvs.length === 0) {
    return null;
  }
  const activeId = typeof record.activeId === "string" && cvs.some((cv) => cv.id === record.activeId)
    ? record.activeId
    : cvs[0].id;
  return { version: 1, activeId, cvs };
}

export function readIndex(): LibraryIndex | null {
  return normalizeIndex(readJson(INDEX_KEY));
}

function writeIndex(index: LibraryIndex): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

/**
 * Read-modify-write of the index. Reading fresh from storage keeps changes
 * another tab made (a CV it created, say) instead of overwriting them.
 */
export function updateIndex(fallback: LibraryIndex, mutate: (index: LibraryIndex) => void): LibraryIndex {
  const index = structuredClone(readIndex() ?? fallback);
  mutate(index);
  if (!index.cvs.some((cv) => cv.id === index.activeId)) {
    index.activeId = index.cvs[0]?.id ?? "";
  }
  writeIndex(index);
  return index;
}

export function loadWorkingCopy(id: string): CVWorkspace | null {
  return normalizeWorkspace(readJson(`${CV_KEY_PREFIX}${id}`));
}

/** Returns false when the browser refused the write (storage full or blocked). */
export function saveWorkingCopy(id: string, workspace: CVWorkspace): boolean {
  try {
    localStorage.setItem(`${CV_KEY_PREFIX}${id}`, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

export function removeWorkingCopy(id: string): void {
  localStorage.removeItem(`${CV_KEY_PREFIX}${id}`);
}

/** Adds a CV to the library and stores its working copy. */
export function createCV(fallback: LibraryIndex, name: string, workspace: CVWorkspace): { index: LibraryIndex; meta: CVMeta } {
  const now = Date.now();
  const meta: CVMeta = { id: createId("cv"), name: name.trim() || "Untitled CV", createdAt: now, updatedAt: now };
  saveWorkingCopy(meta.id, workspace);
  const index = updateIndex(fallback, (draft) => {
    draft.cvs.push(meta);
  });
  return { index, meta };
}

/**
 * Loads the library at boot. The first time, the single CV the app stored
 * before (any storage generation) becomes "My CV".
 */
export function loadLibrary(): { index: LibraryIndex; workspace: CVWorkspace } {
  const index = readIndex();
  if (index) {
    // The last-open CV, or the first one whose working copy is readable.
    const order = [index.activeId, ...index.cvs.map((cv) => cv.id).filter((id) => id !== index.activeId)];
    for (const id of order) {
      const workspace = loadWorkingCopy(id);
      if (workspace) {
        return { index: id === index.activeId ? index : updateIndex(index, (draft) => void (draft.activeId = id)), workspace };
      }
    }
  }

  const workspace = loadStoredWorkspace() ?? createSampleWorkspace();
  const now = Date.now();
  const meta: CVMeta = { id: createId("cv"), name: "My CV", createdAt: now, updatedAt: now };
  const created: LibraryIndex = { version: 1, activeId: meta.id, cvs: [meta] };
  if (saveWorkingCopy(meta.id, workspace)) {
    try {
      writeIndex(created);
      clearStoredDocument();
    } catch {
      // Storage is unavailable; the app still works for this session.
    }
  }
  return { index: created, workspace };
}

// ── Versions (IndexedDB) ──────────────────────────────────

export type VersionStore = {
  list(cvId: string): Promise<CVVersion[]>;
  /** Every version of every CV. */
  all(): Promise<CVVersion[]>;
  put(version: CVVersion): Promise<void>;
  remove(ids: string[]): Promise<void>;
  /** False when versions only last until the page is closed. */
  persistent: boolean;
};

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Storage transaction aborted"));
  });
}

function idbVersionStore(): VersionStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = () => {
    db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(VERSION_STORE, { keyPath: "id" });
        store.createIndex("cvId", "cvId");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return db;
  };

  return {
    persistent: true,
    async list(cvId) {
      const store = (await open()).transaction(VERSION_STORE).objectStore(VERSION_STORE);
      const versions = await promisify(store.index("cvId").getAll(cvId) as IDBRequest<CVVersion[]>);
      return versions.sort((a, b) => b.createdAt - a.createdAt);
    },
    async all() {
      const store = (await open()).transaction(VERSION_STORE).objectStore(VERSION_STORE);
      return promisify(store.getAll() as IDBRequest<CVVersion[]>);
    },
    async put(version) {
      const transaction = (await open()).transaction(VERSION_STORE, "readwrite");
      transaction.objectStore(VERSION_STORE).put(version);
      await done(transaction);
    },
    async remove(ids) {
      if (ids.length === 0) return;
      const transaction = (await open()).transaction(VERSION_STORE, "readwrite");
      const store = transaction.objectStore(VERSION_STORE);
      ids.forEach((id) => store.delete(id));
      await done(transaction);
    }
  };
}

export function memoryVersionStore(): VersionStore {
  const versions = new Map<string, CVVersion>();
  return {
    persistent: false,
    async list(cvId) {
      return [...versions.values()].filter((v) => v.cvId === cvId).sort((a, b) => b.createdAt - a.createdAt);
    },
    async all() {
      return [...versions.values()].map((version) => structuredClone(version));
    },
    async put(version) {
      versions.set(version.id, structuredClone(version));
    },
    async remove(ids) {
      ids.forEach((id) => versions.delete(id));
    }
  };
}

export function createVersionStore(): VersionStore {
  return typeof indexedDB === "undefined" ? memoryVersionStore() : idbVersionStore();
}

/**
 * Saves a version unless it would duplicate the latest one, then prunes old
 * automatic versions. Returns the new version, or null when nothing changed.
 */
export async function saveVersion(
  store: VersionStore,
  cvId: string,
  workspace: CVWorkspace,
  label: string,
  kind: CVVersionKind,
  now = Date.now()
): Promise<CVVersion | null> {
  const existing = await store.list(cvId);
  const latest = existing[0];
  if (latest && contentKey(latest.workspace) === contentKey(workspace)) {
    // Naming the unchanged state promotes the automatic version instead of duplicating it.
    if (kind === "manual" && latest.kind === "auto") {
      const promoted = { ...latest, kind, label };
      await store.put(promoted);
      return promoted;
    }
    return null;
  }

  const version: CVVersion = {
    id: createId("v"),
    cvId,
    label: label.trim() || defaultVersionLabel(now),
    kind,
    createdAt: Math.max(now, (latest?.createdAt ?? 0) + 1),
    workspace: structuredClone(workspace)
  };
  await store.put(version);

  const autos = [version, ...existing].filter((item) => item.kind === "auto");
  await store.remove(autos.slice(MAX_AUTO_VERSIONS).map((item) => item.id));
  return version;
}

export function defaultVersionLabel(time: number): string {
  return `Version of ${new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}

// ── Change summaries ──────────────────────────────────────

function blockKey(block: CVBlock): string {
  return `${block.type}:${block.title.trim().toLowerCase()}`;
}

function blockContent(block: CVBlock): string {
  const { id: _id, hidden: _hidden, ...rest } = block;
  return canonical(rest);
}

function languageChanges(older: CVLanguageDocument | undefined, newer: CVLanguageDocument | undefined): string[] {
  if (!newer?.enabled) {
    return older?.enabled ? ["removed language"] : [];
  }
  if (!older?.enabled) {
    return ["added language"];
  }

  const changes: string[] = [];
  if (canonical(older.document.header) !== canonical(newer.document.header)) {
    changes.push("edited header");
  }

  // Match sections by id first (edits keep it), then by type and title (an import makes new ids).
  const olderBlocks = older.document.blocks;
  const unmatched = new Set(olderBlocks);
  const matched = newer.document.blocks.map((block) => {
    const previous = olderBlocks.find((item) => item.id === block.id && unmatched.has(item))
      ?? olderBlocks.find((item) => blockKey(item) === blockKey(block) && unmatched.has(item));
    if (previous) unmatched.delete(previous);
    return { block, previous };
  });

  const title = (block: CVBlock) => block.title.trim() || "Untitled";
  for (const { block, previous } of matched) {
    if (!previous) {
      changes.push(`added ${title(block)}`);
    } else if (blockContent(previous) !== blockContent(block)) {
      changes.push(`edited ${title(block)}`);
    } else if (Boolean(previous.hidden) !== Boolean(block.hidden)) {
      changes.push(`${block.hidden ? "hid" : "showed"} ${title(block)}`);
    }
  }
  unmatched.forEach((block) => changes.push(`removed ${title(block)}`));

  const order = (blocks: Array<CVBlock | undefined>) => blocks.flatMap((block) => (block ? [block.id] : [])).join();
  const kept = matched.filter((item) => item.previous);
  if (order(kept.map((item) => item.previous)) !== order(olderBlocks.filter((block) => !unmatched.has(block)))) {
    changes.push("reordered sections");
  }
  return changes;
}

/** Short, human-readable list of what changed from `older` to `newer`. */
export function describeChanges(older: CVWorkspace | null, newer: CVWorkspace): string[] {
  if (!older) {
    return [];
  }
  const multilingual = newer.languages.filter((language) => language.enabled).length > 1
    || older.languages.filter((language) => language.enabled).length > 1;

  return newer.languages.flatMap((language) => {
    const previous = older.languages.find((item) => item.code === language.code);
    const changes = languageChanges(previous, language);
    return multilingual ? changes.map((change) => `${language.code.toUpperCase()}: ${change}`) : changes;
  });
}

// ── Backup files ──────────────────────────────────────────

export const BACKUP_FORMAT = "cv-forge-library";

export type BackupCV = {
  name: string;
  createdAt: number;
  updatedAt: number;
  workspace: CVWorkspace;
  versions: Array<Pick<CVVersion, "label" | "kind" | "createdAt" | "workspace">>;
};

export function createBackup(cvs: BackupCV[], now = Date.now()): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: now, cvs }, null, 2);
}

/** Parses a backup file. Returns an error message when the file is not a usable backup. */
export function parseBackup(text: string): BackupCV[] | string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "This file is not valid JSON.";
  }
  const record = value as Record<string, unknown> | null;
  if (!record || record.format !== BACKUP_FORMAT || !Array.isArray(record.cvs)) {
    return "This is not a CV Forge backup. To import CV content, use “Generate CV with AI” → step 2.";
  }

  const cvs = record.cvs.flatMap((item): BackupCV[] => {
    const cv = item as Record<string, unknown> | null;
    const workspace = cv ? normalizeWorkspace(cv.workspace) : null;
    if (!cv || !workspace) return [];
    const versions = (Array.isArray(cv.versions) ? cv.versions : []).flatMap((entry): BackupCV["versions"] => {
      const version = entry as Record<string, unknown> | null;
      const snapshot = version ? normalizeWorkspace(version.workspace) : null;
      if (!version || !snapshot) return [];
      return [{
        label: typeof version.label === "string" ? version.label : "Imported version",
        kind: version.kind === "auto" ? "auto" : "manual",
        createdAt: typeof version.createdAt === "number" ? version.createdAt : Date.now(),
        workspace: snapshot
      }];
    });
    return [{
      name: typeof cv.name === "string" && cv.name.trim() ? cv.name : "Imported CV",
      createdAt: typeof cv.createdAt === "number" ? cv.createdAt : Date.now(),
      updatedAt: typeof cv.updatedAt === "number" ? cv.updatedAt : Date.now(),
      workspace,
      versions
    }];
  });
  return cvs.length > 0 ? cvs : "The backup contains no readable CVs.";
}
