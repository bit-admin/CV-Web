import { DurableObject } from "cloudflare:workers";
import { MAX_REQUEST_BYTES, SYNC_ID_PATTERN, type SyncRequest, type SyncResponse } from "../src/lib/syncProtocol";
import { SyncError, SyncStore, type SqlRow } from "./store";

// Only /api/* reaches this script (`run_worker_first` in wrangler.jsonc); every
// other request is served from static assets without running it.

export interface Env {
  ASSETS: Fetcher;
  SYNC: DurableObjectNamespace<SyncSpace>;
}

/** A sync space unused this long is deleted. */
const EXPIRY_MS = 180 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

function attempt<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    if (error instanceof SyncError) return { ok: false, status: error.status, error: error.message };
    throw error;
  }
}

/** One per sync code: holds that code's encrypted CVs and versions in SQLite. */
export class SyncSpace extends DurableObject<Env> {
  private readonly store: SyncStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    this.store = new SyncStore({
      query: (query, ...bindings) => sql.exec(query, ...bindings) as Iterable<SqlRow>,
      transaction: (fn) => ctx.storage.transactionSync(fn)
    });
  }

  async sync(authHash: string, request: SyncRequest): Promise<Result<SyncResponse>> {
    const result = attempt(() => this.store.sync(authHash, request));
    if (result.ok) await this.scheduleExpiry();
    return result;
  }

  async wipe(authHash: string): Promise<Result<null>> {
    const result = attempt(() => this.store.authorizeWipe(authHash));
    if (!result.ok) return result;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.store.reset();
    return { ok: true, value: null };
  }

  // Moving the alarm is a storage write, so it only moves once a day.
  private async scheduleExpiry(): Promise<void> {
    const due = Date.now() + EXPIRY_MS;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || due - current > DAY_MS) await this.ctx.storage.setAlarm(due);
  }

  async alarm(): Promise<void> {
    const lastSeen = this.store.lastSeen();
    if (lastSeen !== null && Date.now() - lastSeen < EXPIRY_MS) {
      await this.ctx.storage.setAlarm(lastSeen + EXPIRY_MS);
      return;
    }
    await this.ctx.storage.deleteAll();
    this.store.reset();
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function handleSync(request: Request, env: Env, syncId: string): Promise<Response> {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]{20,100})$/)?.[1];
  if (!token) return json({ error: "Missing sync token." }, 401);
  const authHash = await sha256Hex(token);
  const space = env.SYNC.get(env.SYNC.idFromName(syncId));

  if (request.method === "DELETE") {
    const result = await space.wipe(authHash);
    return result.ok ? json({ ok: true }) : json({ error: result.error }, result.status);
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > MAX_REQUEST_BYTES) return json({ error: "Request too large." }, 413);
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) return json({ error: "Request too large." }, 413);
  let body: SyncRequest;
  try {
    body = JSON.parse(text) as SyncRequest;
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  const result = await space.sync(authHash, body);
  return result.ok ? json(result.value) : json({ error: result.error }, result.status);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/sync\/([^/]+)$/);
    if (match) {
      if (!SYNC_ID_PATTERN.test(match[1])) return json({ error: "Not found." }, 404);
      return handleSync(request, env, match[1]);
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
