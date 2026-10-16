import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  contentKey,
  createBackup,
  createCV as addCV,
  createId,
  createVersionStore,
  defaultVersionLabel,
  loadWorkingCopy,
  parseBackup,
  readIndex,
  removeWorkingCopy,
  saveVersion as storeVersion,
  saveWorkingCopy,
  updateIndex,
  type BackupCV,
  type CVMeta,
  type CVVersion,
  type CVVersionKind,
  type LibraryIndex
} from "./library";
import { cvItemId, versionItemId, type CVPayload, type LocalChange, type SyncLocal, type SyncPayload } from "./sync";
import type { CVWorkspace } from "./types";

/** Edits within this long of the latest version do not trigger an automatic one. */
const AUTOSAVE_INTERVAL_MS = 10 * 60 * 1000;
const AUTOSAVE_IDLE_MS = 3000;
const NOTICE_MS = 3000;

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function requestPersistentStorage() {
  // Asks the browser not to evict the library under storage pressure.
  navigator.storage?.persist?.().catch(() => undefined);
}

export type CVLibrary = ReturnType<typeof useLibrary>;

/**
 * Owns the CV library: which CV is open, its working copy on disk, and its
 * versions. `onSwitched` runs after another CV (or a restored version) has
 * replaced the workspace.
 */
export function useLibrary(
  initialIndex: LibraryIndex,
  workspace: CVWorkspace,
  setWorkspace: (workspace: CVWorkspace) => void,
  onSwitched: () => void
) {
  const store = useMemo(createVersionStore, []);
  const [index, setIndex] = useState(initialIndex);
  // Each tab keeps its own open CV; the index only remembers the last one for the next visit.
  const [activeId, setActiveId] = useState(initialIndex.activeId);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const saved = useRef({ id: activeId, key: contentKey(workspace) });
  // The state each CV was in when this page opened it, kept as a version on its first edit.
  const sessionStart = useRef<{ id: string; workspace: CVWorkspace } | null>({ id: activeId, workspace });

  const active: CVMeta = index.cvs.find((cv) => cv.id === activeId) ?? index.cvs[0];
  // The latest values, for sync, which runs across renders.
  const latest = useRef({ index, activeId, workspace });
  latest.current = { index, activeId, workspace };

  const notify = useCallback((text: string, tone: "info" | "error" = "info") => setNotice({ text, tone }), []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const changeIndex = useCallback(
    (mutate: (draft: LibraryIndex) => void) => {
      try {
        setIndex((current) => updateIndex(current, mutate));
      } catch {
        notify("Could not update the CV list: browser storage is full or blocked.", "error");
      }
    },
    [notify]
  );

  // Other tabs may add, rename or delete CVs.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      const next = event.key === null || event.key.startsWith("cv-forge-library") ? readIndex() : null;
      if (next) setIndex(next);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Write the working copy on every change.
  useEffect(() => {
    const key = contentKey(workspace);
    if (!saveWorkingCopy(activeId, workspace)) {
      notify("Could not save: browser storage is full. Delete old CVs or versions, or back up and clear.", "error");
      return;
    }
    if (saved.current.id === activeId && saved.current.key !== key) {
      changeIndex((draft) => {
        const meta = draft.cvs.find((cv) => cv.id === activeId);
        if (meta) meta.updatedAt = Date.now();
      });
    }
    saved.current = { id: activeId, key };
  }, [activeId, changeIndex, notify, workspace]);

  const saveVersion = useCallback(
    async (label: string, kind: CVVersionKind, cvId = activeId, snapshot = workspace): Promise<CVVersion | null> => {
      try {
        const version = await storeVersion(store, cvId, snapshot, label, kind);
        if (version) setRevision((value) => value + 1);
        return version;
      } catch {
        notify("Could not save a version: browser storage is full or blocked.", "error");
        return null;
      }
    },
    [activeId, notify, store, workspace]
  );

  // Automatic versions: the state before this visit's first edit, then one
  // every AUTOSAVE_INTERVAL_MS while editing continues.
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const start = sessionStart.current;
      if (start && start.id === activeId && contentKey(start.workspace) !== contentKey(workspace)) {
        sessionStart.current = null;
        await saveVersion("Before editing", "auto", activeId, start.workspace);
        return;
      }
      const [latest] = await store.list(activeId).catch(() => []);
      if (latest && Date.now() - latest.createdAt >= AUTOSAVE_INTERVAL_MS) {
        await saveVersion("Autosave", "auto");
      }
    }, AUTOSAVE_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [activeId, saveVersion, store, workspace]);

  const saveNamedVersion = useCallback(
    async (label: string, cvId = activeId) => {
      const snapshot = cvId === activeId ? workspace : loadWorkingCopy(cvId);
      if (!snapshot) return null;
      const version = await saveVersion(label.trim() || defaultVersionLabel(Date.now()), "manual", cvId, snapshot);
      if (version) {
        requestPersistentStorage();
        notify(`Saved version “${version.label}”`);
      } else {
        notify("No changes since the last version.");
      }
      return version;
    },
    [activeId, notify, saveVersion, workspace]
  );

  const switchTo = useCallback(
    (id: string, next: CVWorkspace, remember = true) => {
      saved.current = { id, key: contentKey(next) };
      sessionStart.current = { id, workspace: next };
      latest.current = { ...latest.current, activeId: id, workspace: next };
      setActiveId(id);
      setWorkspace(next);
      if (remember) changeIndex((draft) => void (draft.activeId = id));
      onSwitched();
    },
    [changeIndex, onSwitched, setWorkspace]
  );

  const openCV = useCallback(
    (id: string) => {
      if (id === activeId) return;
      const next = loadWorkingCopy(id);
      if (!next) {
        notify("This CV could not be read from browser storage.", "error");
        return;
      }
      switchTo(id, next);
    },
    [activeId, notify, switchTo]
  );

  const createCV = useCallback(
    (name: string, source: CVWorkspace, open = true) => {
      try {
        const { index: next, meta } = addCV(index, name, structuredClone(source));
        setIndex(next);
        if (open) switchTo(meta.id, loadWorkingCopy(meta.id) ?? source);
        return meta;
      } catch {
        notify("Could not create the CV: browser storage is full or blocked.", "error");
        return null;
      }
    },
    [index, notify, switchTo]
  );

  const duplicateCV = useCallback(
    (id: string) => {
      const meta = index.cvs.find((cv) => cv.id === id);
      const source = id === activeId ? workspace : loadWorkingCopy(id);
      if (meta && source) createCV(`${meta.name} (copy)`, source);
    },
    [activeId, createCV, index.cvs, workspace]
  );

  const renameCV = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      changeIndex((draft) => {
        const meta = draft.cvs.find((cv) => cv.id === id);
        if (meta) meta.name = trimmed;
      });
    },
    [changeIndex]
  );

  const deleteCV = useCallback(
    async (id: string) => {
      if (index.cvs.length <= 1) return;
      if (id === activeId) {
        const fallback = index.cvs.find((cv) => cv.id !== id && loadWorkingCopy(cv.id));
        if (!fallback) return;
        openCV(fallback.id);
      }
      changeIndex((draft) => {
        draft.cvs = draft.cvs.filter((cv) => cv.id !== id);
      });
      removeWorkingCopy(id);
      const versions = await store.list(id).catch(() => []);
      await store.remove(versions.map((version) => version.id)).catch(() => undefined);
      setRevision((value) => value + 1);
    },
    [activeId, changeIndex, index.cvs, openCV, store]
  );

  // ── Sync ────────────────────────────────────────────────

  const syncLocal = useMemo((): SyncLocal => ({
    async snapshot() {
      const items = new Map<string, SyncPayload>();
      const { index: current, activeId: openId, workspace: openWorkspace } = latest.current;
      for (const meta of (readIndex() ?? current).cvs) {
        const copy = meta.id === openId ? openWorkspace : loadWorkingCopy(meta.id);
        if (!copy) continue;
        items.set(cvItemId(meta.id), { type: "cv", name: meta.name, createdAt: meta.createdAt, updatedAt: meta.updatedAt, workspace: copy });
      }
      for (const version of await store.all()) {
        const { id, cvId, label, kind, createdAt, workspace: snapshot } = version;
        items.set(versionItemId(id), { type: "version", cvId, label, kind, createdAt, workspace: snapshot });
      }
      return items;
    },

    async apply(changes: LocalChange[]) {
      const refused = new Set<string>();
      const cvId = (id: string) => id.slice("cv:".length);
      const upserts = changes.filter((change) => change.id.startsWith("cv:") && change.payload);
      const deletions = changes.filter((change) => change.id.startsWith("cv:") && !change.payload);
      let next = readIndex() ?? latest.current.index;
      let openId = latest.current.activeId;

      for (const { id, payload } of upserts) {
        const { name, createdAt, updatedAt, workspace: copy } = payload as CVPayload;
        if (!saveWorkingCopy(cvId(id), copy)) throw new Error("Browser storage is full.");
        next = updateIndex(next, (draft) => {
          const meta = draft.cvs.find((cv) => cv.id === cvId(id));
          if (meta) Object.assign(meta, { name, createdAt, updatedAt });
          else draft.cvs.push({ id: cvId(id), name, createdAt, updatedAt });
        });
        if (cvId(id) === openId) switchTo(openId, copy, false);
      }

      for (const { id, payload } of changes.filter((change) => change.id.startsWith("v:"))) {
        if (payload?.type === "version") {
          const { cvId: owner, label, kind, createdAt, workspace: snapshot } = payload;
          await store.put({ id: id.slice("v:".length), cvId: owner, label, kind, createdAt, workspace: snapshot });
        } else {
          await store.remove([id.slice("v:".length)]);
        }
      }

      // Deletions last, so CVs that arrived in the same sync can take the place of a deleted open one.
      for (const { id } of deletions) {
        const remaining = next.cvs.filter((cv) => cv.id !== cvId(id));
        if (!next.cvs.some((cv) => cv.id === cvId(id))) continue;
        const fallback = remaining.find((cv) => loadWorkingCopy(cv.id));
        if (!fallback) {
          refused.add(id);
          continue;
        }
        if (cvId(id) === openId) {
          openId = fallback.id;
          switchTo(fallback.id, loadWorkingCopy(fallback.id)!, false);
        }
        next = updateIndex(next, (draft) => {
          draft.cvs = draft.cvs.filter((cv) => cv.id !== cvId(id));
        });
        removeWorkingCopy(cvId(id));
      }

      setIndex(next);
      setRevision((value) => value + 1);
      return refused;
    },

    async keepConflictCopy(id: string, local: CVPayload) {
      await store.put({
        id: createId("v"),
        cvId: id,
        label: "Edits replaced by another device",
        kind: "manual",
        createdAt: Date.now(),
        workspace: structuredClone(local.workspace)
      });
    }
  }), [store, switchTo]);

  const restoreVersion = useCallback(
    async (version: CVVersion) => {
      const current = version.cvId === activeId ? workspace : loadWorkingCopy(version.cvId);
      if (current) {
        await saveVersion(`Before restoring “${version.label}”`, "auto", version.cvId, current);
      }
      const restored = structuredClone(version.workspace);
      if (!saveWorkingCopy(version.cvId, restored)) {
        notify("Could not restore: browser storage is full.", "error");
        return;
      }
      switchTo(version.cvId, restored);
      changeIndex((draft) => {
        const meta = draft.cvs.find((cv) => cv.id === version.cvId);
        if (meta) meta.updatedAt = Date.now();
      });
      notify(`Restored “${version.label}”. The previous state was kept as a version.`);
    },
    [activeId, changeIndex, notify, saveVersion, switchTo, workspace]
  );

  const versionAsNewCV = useCallback(
    (version: CVVersion) => {
      const cvName = index.cvs.find((cv) => cv.id === version.cvId)?.name ?? "CV";
      createCV(`${cvName} – ${version.label}`, version.workspace);
    },
    [createCV, index.cvs]
  );

  const renameVersion = useCallback(
    async (version: CVVersion, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      // Naming an automatic version keeps it from being pruned.
      await store.put({ ...version, label: trimmed, kind: "manual" });
      setRevision((value) => value + 1);
    },
    [store]
  );

  const deleteVersion = useCallback(
    async (version: CVVersion) => {
      await store.remove([version.id]);
      setRevision((value) => value + 1);
    },
    [store]
  );

  const exportBackup = useCallback(async () => {
    const cvs: BackupCV[] = [];
    for (const meta of index.cvs) {
      const current = meta.id === activeId ? workspace : loadWorkingCopy(meta.id);
      if (!current) continue;
      const versions = await store.list(meta.id).catch(() => []);
      cvs.push({
        name: meta.name,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        workspace: current,
        versions: versions.map(({ label, kind, createdAt, workspace: snapshot }) => ({ label, kind, createdAt, workspace: snapshot }))
      });
    }
    download(`cv-forge-backup-${new Date().toISOString().slice(0, 10)}.json`, createBackup(cvs));
  }, [activeId, index.cvs, store, workspace]);

  const importBackup = useCallback(
    async (file: File) => {
      const parsed = parseBackup(await file.text());
      if (typeof parsed === "string") {
        notify(parsed, "error");
        return;
      }
      let next = index;
      try {
        for (const cv of parsed) {
          const taken = next.cvs.some((meta) => meta.name === cv.name);
          const created = addCV(next, taken ? `${cv.name} (imported)` : cv.name, cv.workspace);
          next = created.index;
          for (const version of cv.versions) {
            await store.put({ ...version, id: createId("v"), cvId: created.meta.id });
          }
        }
      } catch {
        notify("The backup was only partly imported: browser storage is full.", "error");
      }
      setIndex(next);
      setRevision((value) => value + 1);
      notify(`Imported ${parsed.length} CV${parsed.length === 1 ? "" : "s"}.`);
    },
    [index, notify, store]
  );

  return {
    index,
    active,
    store,
    revision,
    notice,
    notify,
    saveVersion,
    saveNamedVersion,
    openCV,
    createCV,
    duplicateCV,
    renameCV,
    deleteCV,
    restoreVersion,
    versionAsNewCV,
    renameVersion,
    deleteVersion,
    exportBackup,
    importBackup,
    syncLocal
  };
}
