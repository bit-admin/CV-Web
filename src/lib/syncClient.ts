import type { CVPayload, SyncCipher, SyncPayload, SyncTransport, VersionPayload } from "./sync";
import { decryptItem, encryptItem, type SyncKeys } from "./syncCrypto";
import type { SyncErrorBody, SyncRequest, SyncResponse } from "./syncProtocol";
import { normalizeWorkspace } from "./document";

/** Requests this small may outlive the page (sent while it is being hidden or closed). */
const KEEPALIVE_BYTES = 60_000;

export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function errorMessage(status: number, body: SyncErrorBody | null): string {
  if (status === 404) return "No synced data exists for this sync code. It may have been deleted, or expired after 180 days without use.";
  if (status === 401 || status === 403) return "The sync service rejected this sync code.";
  if (status === 413) return body?.error ?? "Sync storage for this code is full.";
  if (status === 429 || status >= 500) return "The sync service is busy or over its daily limit. Sync will try again later.";
  return body?.error ?? `Sync failed (HTTP ${status}).`;
}

async function request(keys: SyncKeys, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/sync/${keys.syncId}`, {
      ...init,
      cache: "no-store",
      headers: { ...init.headers, Authorization: `Bearer ${keys.token}` }
    });
  } catch {
    throw new SyncHttpError(0, "Offline: changes will sync when the connection is back.");
  }
  // A Cloudflare WAF challenge (its clearance cookie expired) answers with a challenge page, not the Worker.
  if (response.headers.get("cf-mitigated") === "challenge") {
    throw new SyncHttpError(response.status, "Cloudflare's security check has expired. Reload the page to continue syncing.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as SyncErrorBody | null;
    throw new SyncHttpError(response.status, errorMessage(response.status, body));
  }
  return response;
}

export function httpTransport(keys: SyncKeys): SyncTransport {
  return {
    async sync(body: SyncRequest) {
      const text = JSON.stringify(body);
      const response = await request(keys, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
        keepalive: text.length < KEEPALIVE_BYTES
      });
      return (await response.json()) as SyncResponse;
    }
  };
}

export async function wipeRemote(keys: SyncKeys): Promise<void> {
  await request(keys, { method: "DELETE" });
}

/** Checks decrypted data before it reaches the library: it comes from another device and maybe another app version. */
function readPayload(value: unknown): SyncPayload {
  const record = value as Record<string, unknown> | null;
  const workspace = record ? normalizeWorkspace(record.workspace) : null;
  if (!record || !workspace) throw new Error("Synced data could not be read. Update the app on all devices.");
  const time = (key: string) => (typeof record[key] === "number" ? (record[key] as number) : Date.now());
  if (record.type === "cv") {
    const payload: CVPayload = {
      type: "cv",
      name: typeof record.name === "string" && record.name.trim() ? record.name : "Untitled CV",
      createdAt: time("createdAt"),
      updatedAt: time("updatedAt"),
      workspace
    };
    return payload;
  }
  if (record.type === "version" && typeof record.cvId === "string") {
    const payload: VersionPayload = {
      type: "version",
      cvId: record.cvId,
      label: typeof record.label === "string" ? record.label : "Synced version",
      kind: record.kind === "auto" ? "auto" : "manual",
      createdAt: time("createdAt"),
      workspace
    };
    return payload;
  }
  throw new Error("Synced data could not be read. Update the app on all devices.");
}

export function aesCipher(keys: SyncKeys): SyncCipher {
  return {
    encrypt: (id, payload) => encryptItem(keys.key, id, payload),
    decrypt: async (id, blob) => readPayload(await decryptItem(keys.key, id, blob))
  };
}
