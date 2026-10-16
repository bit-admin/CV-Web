// Wire format between the browser and the sync Worker. Shared by both sides.
//
// A sync space holds encrypted items. Each change bumps a space-wide counter
// (`seq`) and stamps the item with it, so a client asks for "everything after
// the seq I last saw". Writes are compare-and-swap: an item is only replaced
// when the client names the seq it last saw for it.

/** `cv:<id>` is a CV's name and working copy; `v:<id>` is one saved version. */
export const ITEM_ID_PATTERN = /^(cv|v):[A-Za-z0-9_-]{1,80}$/;
export const SYNC_ID_PATTERN = /^[0-9a-f]{32}$/;

/** Largest encrypted item, in base64 characters (the store's row limit is 2 MB). */
export const MAX_BLOB_CHARS = 1_500_000;
/** Total encrypted data one sync space may hold, in base64 characters. */
export const MAX_SPACE_CHARS = 20_000_000;
/** Most items one request may write. */
export const MAX_PUSH_ITEMS = 200;
/** Largest request body the Worker accepts, in bytes. */
export const MAX_REQUEST_BYTES = 8_000_000;
/** Roughly how much encrypted data one response carries before it asks the client to continue. */
export const PAGE_CHARS = 4_000_000;

export type SyncItem = {
  id: string;
  seq: number;
  deleted: boolean;
  /** Encrypted payload; absent when deleted. */
  blob?: string;
};

export type PushItem = {
  id: string;
  /** The seq the client last saw for this item, 0 if it never saw it. */
  baseSeq: number;
  deleted: boolean;
  blob?: string;
};

export type SyncRequest = {
  /** Return changes made after this seq. */
  since: number;
  /** Create the space when it does not exist yet (turning sync on). */
  create?: boolean;
  items: PushItem[];
};

export type SyncResponse = {
  /** Pass as `since` next time. */
  seq: number;
  /** The client's `since` predates the deletions the space still remembers: `changes` lists every live item instead. */
  reset?: boolean;
  /** More changes remain: ask again with `since: seq`. */
  more?: boolean;
  /** Items written, with their new seq. */
  accepted: Array<{ id: string; seq: number }>;
  /** Items not written because they changed since `baseSeq`: the current server state. */
  conflicts: SyncItem[];
  /** Other items changed after `since`. */
  changes: SyncItem[];
};

export type SyncErrorBody = { error: string };
