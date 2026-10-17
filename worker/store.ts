import {
  ITEM_ID_PATTERN,
  MAX_BLOB_CHARS,
  MAX_PUSH_ITEMS,
  MAX_SPACE_CHARS,
  PAGE_CHARS,
  type SyncItem,
  type SyncRequest,
  type SyncResponse
} from "../src/lib/syncProtocol";

// The storage of one sync space, kept free of Cloudflare APIs so tests can run
// it on Node's SQLite. The Durable Object serializes requests, so a request
// reads and writes without interleaving with another.

export type SqlRow = Record<string, string | number | null | ArrayBuffer>;

export interface SqlRunner {
  query(sql: string, ...bindings: unknown[]): Iterable<SqlRow>;
  /** Runs `fn` atomically: a throw rolls back every write it made. */
  transaction<T>(fn: () => T): T;
}

export class SyncError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** Deleted items are remembered this long, so other devices learn about the deletion. */
export const TOMBSTONE_MS = 90 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Space = {
  auth: string;
  seq: number;
  chars: number;
  /** Deletions up to this seq were forgotten; a client that synced before it must start over. */
  floor: number;
  purged: number;
  lastSeen: number;
};

export class SyncStore {
  private ready = false;

  constructor(
    private readonly sql: SqlRunner,
    private readonly now: () => number = Date.now
  ) {}

  private ensureSchema(): void {
    if (this.ready) return;
    this.sql.query(`CREATE TABLE IF NOT EXISTS space (
      one INTEGER PRIMARY KEY CHECK (one = 1),
      auth TEXT NOT NULL,
      seq INTEGER NOT NULL,
      chars INTEGER NOT NULL,
      floor INTEGER NOT NULL,
      purged INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    )`);
    this.sql.query(`CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL,
      deleted INTEGER NOT NULL,
      blob TEXT,
      chars INTEGER NOT NULL,
      updated INTEGER NOT NULL
    )`);
    this.sql.query("CREATE INDEX IF NOT EXISTS items_seq ON items (seq)");
    this.ready = true;
  }

  /** Forget the schema check, after the Durable Object deleted all its storage. */
  reset(): void {
    this.ready = false;
  }

  private space(): Space | null {
    const [row] = [...this.sql.query("SELECT auth, seq, chars, floor, purged, last_seen FROM space WHERE one = 1")];
    if (!row) return null;
    return {
      auth: String(row.auth),
      seq: Number(row.seq),
      chars: Number(row.chars),
      floor: Number(row.floor),
      purged: Number(row.purged),
      lastSeen: Number(row.last_seen)
    };
  }

  private authorize(authHash: string, create: boolean): Space {
    const space = this.space();
    if (!space) {
      if (!create) throw new SyncError(404, "No synced data exists for this sync code.");
      const now = this.now();
      this.sql.query(
        "INSERT INTO space (one, auth, seq, chars, floor, purged, last_seen) VALUES (1, ?, 0, 0, 0, ?, ?)",
        authHash,
        now,
        now
      );
      return { auth: authHash, seq: 0, chars: 0, floor: 0, purged: now, lastSeen: now };
    }
    if (space.auth !== authHash) throw new SyncError(403, "This sync code does not match the synced data.");
    return space;
  }

  /** When the space was last used, or null when it does not exist. */
  lastSeen(): number | null {
    this.ensureSchema();
    return this.space()?.lastSeen ?? null;
  }

  sync(authHash: string, request: SyncRequest): SyncResponse {
    validate(request);
    // Outside the transaction: a rejected request must not roll the schema back.
    this.ensureSchema();
    return this.sql.transaction(() => {
      const space = this.authorize(authHash, Boolean(request.create));
      const now = this.now();
      if (now - space.purged >= DAY_MS) this.purgeTombstones(space, now);

      const accepted: SyncResponse["accepted"] = [];
      const conflicts: SyncItem[] = [];
      for (const item of request.items) {
        const [current] = [...this.sql.query("SELECT seq, deleted, blob, chars FROM items WHERE id = ?", item.id)];
        const currentSeq = current ? Number(current.seq) : 0;
        if (currentSeq !== item.baseSeq) {
          conflicts.push(current ? toItem(item.id, current) : { id: item.id, seq: 0, deleted: true });
          continue;
        }
        if (item.deleted && !current) {
          // Nothing to delete: the item never reached the server.
          accepted.push({ id: item.id, seq: 0 });
          continue;
        }
        const chars = item.deleted ? 0 : item.blob!.length;
        space.chars += chars - (current ? Number(current.chars) : 0);
        if (space.chars > MAX_SPACE_CHARS) {
          throw new SyncError(413, "Sync storage for this code is full. Delete old versions or CVs, then sync again.");
        }
        space.seq += 1;
        this.sql.query(
          `INSERT INTO items (id, seq, deleted, blob, chars, updated) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET seq = excluded.seq, deleted = excluded.deleted, blob = excluded.blob,
             chars = excluded.chars, updated = excluded.updated`,
          item.id,
          space.seq,
          item.deleted ? 1 : 0,
          item.deleted ? null : item.blob!,
          chars,
          now
        );
        accepted.push({ id: item.id, seq: space.seq });
      }

      // A client that last synced before forgotten deletions gets every live item instead.
      const reset = request.since < space.floor || request.since > space.seq;
      const since = reset ? 0 : request.since;
      const written = new Set(accepted.map((item) => item.id));
      const changes: SyncItem[] = [];
      let chars = 0;
      let more = false;
      let lastSeq = since;
      const rows = this.sql.query(
        `SELECT id, seq, deleted, blob FROM items WHERE seq > ? ${since === 0 ? "AND deleted = 0" : ""} ORDER BY seq`,
        since
      );
      for (const row of rows) {
        if (chars >= PAGE_CHARS) {
          more = true;
          break;
        }
        lastSeq = Number(row.seq);
        if (written.has(String(row.id))) continue;
        const item = toItem(String(row.id), row);
        chars += item.blob?.length ?? 0;
        changes.push(item);
      }

      this.sql.query(
        "UPDATE space SET seq = ?, chars = ?, floor = ?, purged = ?, last_seen = ? WHERE one = 1",
        space.seq,
        space.chars,
        space.floor,
        space.purged,
        now
      );
      return {
        seq: more ? lastSeq : space.seq,
        ...(reset && { reset }),
        ...(more && { more }),
        accepted,
        conflicts,
        changes
      };
    });
  }

  private purgeTombstones(space: Space, now: number): void {
    const cutoff = now - TOMBSTONE_MS;
    const [row] = [...this.sql.query("SELECT max(seq) AS seq FROM items WHERE deleted = 1 AND updated < ?", cutoff)];
    if (row?.seq !== null && row?.seq !== undefined) {
      this.sql.query("DELETE FROM items WHERE deleted = 1 AND updated < ?", cutoff);
      space.floor = Math.max(space.floor, Number(row.seq));
    }
    space.purged = now;
  }

  /** Checks the code before the Durable Object deletes everything. */
  authorizeWipe(authHash: string): void {
    this.ensureSchema();
    this.authorize(authHash, false);
  }
}

function toItem(id: string, row: SqlRow): SyncItem {
  return Number(row.deleted)
    ? { id, seq: Number(row.seq), deleted: true }
    : { id, seq: Number(row.seq), deleted: false, blob: String(row.blob) };
}

function validate(request: SyncRequest): void {
  const bad = (message: string) => new SyncError(400, message);
  if (typeof request !== "object" || request === null) throw bad("Invalid request.");
  if (!Number.isSafeInteger(request.since) || request.since < 0) throw bad("Invalid `since`.");
  if (!Array.isArray(request.items) || request.items.length > MAX_PUSH_ITEMS) throw bad("Invalid `items`.");
  const ids = new Set<string>();
  for (const item of request.items) {
    if (typeof item !== "object" || item === null || typeof item.id !== "string" || !ITEM_ID_PATTERN.test(item.id)) {
      throw bad("Invalid item id.");
    }
    if (ids.has(item.id)) throw bad("Duplicate item id.");
    ids.add(item.id);
    if (!Number.isSafeInteger(item.baseSeq) || item.baseSeq < 0) throw bad("Invalid `baseSeq`.");
    if (typeof item.deleted !== "boolean") throw bad("Invalid `deleted`.");
    if (!item.deleted && (typeof item.blob !== "string" || item.blob.length === 0)) throw bad("Missing item data.");
    if (!item.deleted && item.blob!.length > MAX_BLOB_CHARS) throw new SyncError(413, "A CV or version is too large to sync.");
  }
}
