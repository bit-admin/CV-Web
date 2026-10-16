import { createSampleWorkspace } from "./document";
import { canonical, describeChanges, type CVVersionKind } from "./library";
import type { PushItem, SyncItem, SyncRequest, SyncResponse } from "./syncProtocol";
import type { CVWorkspace } from "./types";

// Two-way sync of the CV library with a sync space.
//
// Every CV (`cv:<id>`: name and working copy) and every version (`v:<id>`) is
// one item. The client remembers, per item, the seq and content hash it last
// agreed on with the server (its "base"). Comparing the local content and the
// remote change against that base tells who changed what:
//   - only one side changed: that side wins;
//   - both changed a CV: the remote copy wins and the local one is kept as a
//     version, so no edit is ever lost;
//   - a CV deleted on one side and edited on the other: the edit wins.
// Each request pushes local changes and pulls remote ones at once; the server
// only accepts a write whose base seq is still current (compare-and-swap).

export type CVPayload = {
  type: "cv";
  name: string;
  createdAt: number;
  updatedAt: number;
  workspace: CVWorkspace;
};

export type VersionPayload = {
  type: "version";
  cvId: string;
  label: string;
  kind: CVVersionKind;
  createdAt: number;
  workspace: CVWorkspace;
};

export type SyncPayload = CVPayload | VersionPayload;

export type SyncBase = { seq: number; hash: string };

export type SyncState = {
  /** The canonical sync code, or null when sync is off. */
  code: string | null;
  lastSeq: number;
  /** What this browser and the server last agreed on, per item. Absent: nothing (or a deletion). */
  items: Record<string, SyncBase>;
  lastSyncAt: number | null;
};

export const EMPTY_SYNC_STATE: SyncState = { code: null, lastSeq: 0, items: {}, lastSyncAt: null };

export type LocalChange = { id: string; payload: SyncPayload | null };

/** The library as sync sees it. */
export interface SyncLocal {
  /** Every CV and version, by item id. */
  snapshot(): Promise<Map<string, SyncPayload>>;
  /** Applies remote changes; returns the ids it had to leave as they are (deleting the last CV). */
  apply(changes: LocalChange[]): Promise<Set<string>>;
  /** Keeps the local copy of a CV that the remote copy is about to replace. */
  keepConflictCopy(cvId: string, local: CVPayload): Promise<void>;
}

export interface SyncTransport {
  sync(request: SyncRequest): Promise<SyncResponse>;
}

export interface SyncCipher {
  encrypt(id: string, payload: SyncPayload): Promise<string>;
  decrypt(id: string, blob: string): Promise<SyncPayload>;
}

export type SyncStats = { sent: number; received: number; conflicts: number };

/** Most requests one sync makes before stopping (it continues on the next one). */
const MAX_ROUNDS = 8;
/** Encrypted data sent per request, in base64 characters. */
const PUSH_BUDGET = 3_000_000;
const MAX_ITEMS_PER_PUSH = 100;

/** cyrb53: a fast 53-bit string hash, enough to tell content apart. */
function hashString(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ char, 2654435761);
    h2 = Math.imul(h2 ^ char, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The workspace minus which language tab happens to be open. */
function workspaceContent({ activeLanguage: _active, ...rest }: CVWorkspace) {
  return rest;
}

/** Content identity of an item. Edit times are left out: they change without the content changing. */
export function payloadHash(payload: SyncPayload): string {
  return hashString(
    canonical(
      payload.type === "cv"
        ? { type: payload.type, name: payload.name, createdAt: payload.createdAt, workspace: workspaceContent(payload.workspace) }
        : { ...payload, workspace: workspaceContent(payload.workspace) }
    )
  );
}

export function cvItemId(cvId: string): string {
  return `cv:${cvId}`;
}

export function versionItemId(versionId: string): string {
  return `v:${versionId}`;
}

/** Items whose local content differs from the last agreed state. */
export function pendingChanges(local: Map<string, SyncPayload>, base: Record<string, SyncBase>): string[] {
  const ids = new Set([...local.keys(), ...Object.keys(base)]);
  return [...ids].filter((id) => {
    const payload = local.get(id);
    return (payload ? payloadHash(payload) : null) !== (base[id]?.hash ?? null);
  });
}

/**
 * The id of the CV a browser starts with when it was never used: the
 * unchanged sample and no versions. Connecting such a browser should not add
 * it to the synced library.
 */
export function untouchedStarterCV(local: Map<string, SyncPayload>): string | null {
  if (local.size !== 1) return null;
  const [[id, payload]] = [...local];
  if (payload.type !== "cv" || (payload.workspace.template ?? "classic") !== "classic") return null;
  return describeChanges(createSampleWorkspace(), payload.workspace).length === 0 ? id : null;
}

type Decision =
  | { action: "agree"; hash: string | null }
  | { action: "apply"; hash: string | null }
  | { action: "keep-local" }
  | { action: "conflict"; hash: string };

/** What to do with a remote change, given the local content and the last agreed state. */
export function decide(local: SyncPayload | undefined, remote: SyncPayload | null, base: SyncBase | undefined): Decision {
  const localHash = local ? payloadHash(local) : null;
  const remoteHash = remote ? payloadHash(remote) : null;
  if (localHash === remoteHash) return { action: "agree", hash: remoteHash };
  const localChanged = localHash !== (base?.hash ?? null);
  if (!localChanged) return { action: "apply", hash: remoteHash };
  // Both sides changed. An edit beats a deletion, whichever side made it.
  if (!remote) return { action: "keep-local" };
  if (!local) return { action: "apply", hash: remoteHash };
  if (local.type === "cv" && remote.type === "cv") return { action: "conflict", hash: remoteHash! };
  // Versions only change by renaming: take the remote name.
  return { action: "apply", hash: remoteHash };
}

function setBase(items: Record<string, SyncBase>, id: string, seq: number, hash: string | null): void {
  if (hash === null) delete items[id];
  else items[id] = { seq, hash };
}

/**
 * Runs one sync: pushes local changes, pulls remote ones, and resolves
 * conflicts, in as many requests as it takes (up to MAX_ROUNDS). `save` is
 * called with the new state after every request, so progress survives a
 * failure halfway.
 */
export async function runSync(options: {
  state: SyncState;
  local: SyncLocal;
  transport: SyncTransport;
  cipher: SyncCipher;
  create?: boolean;
  /** Items to leave out of this sync. */
  skip?: ReadonlySet<string>;
  save: (state: SyncState) => void;
  now?: () => number;
}): Promise<{ state: SyncState; stats: SyncStats }> {
  const { local, transport, cipher, save, now = Date.now } = options;
  let state = structuredClone(options.state);
  const stats: SyncStats = { sent: 0, received: 0, conflicts: 0 };
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const snapshot = await local.snapshot();
    const pending = pendingChanges(snapshot, state.items).filter((id) => !options.skip?.has(id));

    const items: PushItem[] = [];
    const sentHashes = new Map<string, string | null>();
    let budget = PUSH_BUDGET;
    for (const id of pending) {
      if (items.length >= MAX_ITEMS_PER_PUSH) break;
      const payload = snapshot.get(id);
      const baseSeq = state.items[id]?.seq ?? 0;
      if (!payload) {
        items.push({ id, baseSeq, deleted: true });
        sentHashes.set(id, null);
        continue;
      }
      const blob = await cipher.encrypt(id, payload);
      if (items.length > 0 && blob.length > budget) break;
      budget -= blob.length;
      items.push({ id, baseSeq, deleted: false, blob });
      sentHashes.set(id, payloadHash(payload));
    }

    const response = await transport.sync({ since: state.lastSeq, ...(options.create && round === 0 && { create: true }), items });
    stats.sent += response.accepted.length;

    const base = response.reset ? {} : { ...state.items };
    for (const { id, seq } of response.accepted) setBase(base, id, seq, sentHashes.get(id) ?? null);

    // Conflicts first: a later entry for the same id in `changes` is the same state.
    const incoming = new Map<string, SyncItem>();
    for (const item of [...response.conflicts, ...response.changes]) incoming.set(item.id, item);
    const remote = new Map<string, SyncPayload | null>();
    for (const item of incoming.values()) {
      remote.set(item.id, item.deleted || !item.blob ? null : await cipher.decrypt(item.id, item.blob));
    }

    // Decide against the local state as it is now: it may have changed during the request.
    const current = incoming.size > 0 ? await local.snapshot() : snapshot;
    const changes: LocalChange[] = [];
    const appliedHashes = new Map<string, { seq: number; hash: string | null }>();
    let conflicted = false;
    for (const item of incoming.values()) {
      // An echo of a write this browser made (pulls are paged, so it can come back later).
      const known = base[item.id];
      if (known && known.seq >= item.seq) continue;
      const payload = remote.get(item.id) ?? null;
      const decision = decide(current.get(item.id), payload, base[item.id]);
      switch (decision.action) {
        case "agree":
          setBase(base, item.id, item.seq, decision.hash);
          break;
        case "keep-local":
          // Pushed again next round, against the deletion's seq.
          base[item.id] = { seq: item.seq, hash: "deleted" };
          conflicted = true;
          break;
        case "conflict":
          await local.keepConflictCopy(item.id.slice(3), current.get(item.id) as CVPayload);
          stats.conflicts += 1;
          conflicted = true;
          changes.push({ id: item.id, payload });
          appliedHashes.set(item.id, { seq: item.seq, hash: decision.hash });
          break;
        case "apply":
          changes.push({ id: item.id, payload });
          appliedHashes.set(item.id, { seq: item.seq, hash: decision.hash });
          break;
      }
    }
    stats.received += changes.length;
    const refused = changes.length > 0 ? await local.apply(changes) : new Set<string>();
    for (const [id, { seq, hash }] of appliedHashes) {
      if (refused.has(id)) {
        base[id] = { seq, hash: "deleted" };
        conflicted = true;
      } else {
        setBase(base, id, seq, hash);
      }
    }

    state = { ...state, lastSeq: response.seq, items: base, lastSyncAt: now() };
    save(state);

    const unsent = pending.length > items.length;
    if (!response.more && !unsent && !conflicted && !response.reset) break;
  }
  return { state, stats };
}
