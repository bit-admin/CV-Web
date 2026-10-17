import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_SYNC_STATE, pendingChanges, runSync, untouchedStarterCV, type SyncLocal, type SyncState, type SyncStats } from "./sync";
import { aesCipher, httpTransport, SyncHttpError, wipeRemote } from "./syncClient";
import { deriveSyncKeys, generateSyncCode, parseSyncCode, type SyncKeys } from "./syncCrypto";

const STATE_KEY = "cv-forge-sync-v1";
const LOCK_NAME = "cv-forge-sync";
/** Wait this long after the last edit before syncing… */
const IDLE_MS = 15_000;
/** …but no longer than this after the first unsynced edit. */
const MAX_WAIT_MS = 90_000;
/** Returning to the tab pulls only when the last sync is older than this. */
const STALE_MS = 30_000;
const RETRY_MS = 5 * 60_000;

export type SyncStatus = "off" | "idle" | "syncing" | "error";

function readState(): SyncState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<SyncState>) : null;
    if (!value || typeof value.code !== "string" || !parseSyncCode(value.code)) return EMPTY_SYNC_STATE;
    return {
      code: value.code,
      lastSeq: typeof value.lastSeq === "number" ? value.lastSeq : 0,
      items: typeof value.items === "object" && value.items !== null ? value.items : {},
      lastSyncAt: typeof value.lastSyncAt === "number" ? value.lastSyncAt : null
    };
  } catch {
    return EMPTY_SYNC_STATE;
  }
}

function writeState(state: SyncState): void {
  if (state.code) localStorage.setItem(STATE_KEY, JSON.stringify(state));
  else localStorage.removeItem(STATE_KEY);
}

/** Runs `fn` while no other tab of this app is syncing. */
async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? locks.request(LOCK_NAME, fn) : fn();
}

function describeError(error: unknown): string {
  if (error instanceof SyncHttpError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Sync failed.";
}

export type CVSync = ReturnType<typeof useSync>;

/**
 * Optional sync of the library through the sync Worker. Pulls when the page
 * opens or comes back into view, and pushes a little after edits stop.
 * `changeSignal` changes whenever the library might have changed.
 */
export function useSync(local: SyncLocal, changeSignal: readonly unknown[], notify: (text: string, tone?: "info" | "error") => void) {
  const [state, setState] = useState(readState);
  const [status, setStatus] = useState<SyncStatus>(() => (readState().code ? "idle" : "off"));
  const [error, setError] = useState<string | null>(null);
  const keysRef = useRef<{ code: string; keys: SyncKeys } | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const localRef = useRef(local);
  localRef.current = local;

  const keysFor = useCallback(async (code: string) => {
    if (keysRef.current?.code !== code) keysRef.current = { code, keys: await deriveSyncKeys(code) };
    return keysRef.current.keys;
  }, []);

  /** One sync with `start` (the stored state unless given), keeping the result only if `code` is still current. */
  const perform = useCallback(
    async (start: SyncState | null, create = false, skip?: ReadonlySet<string>): Promise<SyncStats> => {
      return exclusive(async () => {
        // Another tab may have synced (or turned sync off) meanwhile.
        const initial = start ?? readState();
        if (!initial.code) throw new Error("Sync is off.");
        const keys = await keysFor(initial.code);
        const save = (next: SyncState) => {
          if (start === null && readState().code !== initial.code) return;
          writeState(next);
          setState(next);
        };
        const { stats } = await runSync({
          state: initial,
          local: localRef.current,
          transport: httpTransport(keys),
          cipher: aesCipher(keys),
          create,
          skip,
          save
        });
        return stats;
      });
    },
    [keysFor]
  );

  const syncNow = useCallback(
    (reason: "auto" | "manual" = "auto"): Promise<void> => {
      if (!readState().code) return Promise.resolve();
      if (running.current) return running.current;
      setStatus("syncing");
      running.current = perform(null)
        .then((stats) => {
          setStatus("idle");
          setError(null);
          if (stats.conflicts > 0) {
            notify(
              `${stats.conflicts === 1 ? "A CV was" : `${stats.conflicts} CVs were`} also edited on another device. Your edits are kept as a version named “Edits replaced by another device”.`
            );
          } else if (reason === "manual") {
            notify("Synced.");
          }
        })
        .catch((cause: unknown) => {
          if (!readState().code) {
            setStatus("off");
            return;
          }
          setStatus("error");
          setError(describeError(cause));
          if (reason === "manual") notify(describeError(cause), "error");
        })
        .finally(() => {
          running.current = null;
        });
      return running.current;
    },
    [notify, perform]
  );

  /** Turns sync on with a new code, uploading this browser's library. */
  const enable = useCallback(async () => {
    const code = generateSyncCode();
    setStatus("syncing");
    try {
      await perform({ ...EMPTY_SYNC_STATE, code }, true);
      setStatus("idle");
      setError(null);
      return true;
    } catch (cause) {
      writeState(EMPTY_SYNC_STATE);
      setState(EMPTY_SYNC_STATE);
      setStatus("off");
      notify(describeError(cause), "error");
      return false;
    }
  }, [notify, perform]);

  /** Connects to an existing sync space; this browser's CVs are merged into it. */
  const connect = useCallback(
    async (input: string): Promise<string | null> => {
      const code = parseSyncCode(input);
      if (!code) return "That is not a sync code. It has 32 letters and digits, like K7QD-9M2X-…";
      setStatus("syncing");
      try {
        // A browser never used before only has the sample CV: replace it instead of adding it.
        const starter = untouchedStarterCV(await localRef.current.snapshot());
        const stats = await perform({ ...EMPTY_SYNC_STATE, code }, false, starter ? new Set([starter]) : undefined);
        if (starter) await localRef.current.apply([{ id: starter, payload: null }]);
        setStatus("idle");
        setError(null);
        notify(`Connected. ${stats.received} item${stats.received === 1 ? "" : "s"} received.`);
        return null;
      } catch (cause) {
        writeState(EMPTY_SYNC_STATE);
        setState(EMPTY_SYNC_STATE);
        setStatus("off");
        return describeError(cause);
      }
    },
    [notify, perform]
  );

  /** Stops syncing in this browser. Local and synced data stay. */
  const disconnect = useCallback(() => {
    writeState(EMPTY_SYNC_STATE);
    setState(EMPTY_SYNC_STATE);
    setStatus("off");
    setError(null);
  }, []);

  /** Deletes the synced copy for every device, then stops syncing here. */
  const wipe = useCallback(async () => {
    const code = readState().code;
    if (!code) return;
    try {
      await exclusive(async () => wipeRemote(await keysFor(code)));
      disconnect();
      notify("Synced data deleted. The CVs in this browser are unchanged.");
    } catch (cause) {
      notify(describeError(cause), "error");
    }
  }, [disconnect, keysFor, notify]);

  const enabled = Boolean(state.code);

  // Pull when the page opens, comes back into view or back online.
  const lastSyncAt = useRef(state.lastSyncAt);
  lastSyncAt.current = state.lastSyncAt;
  useEffect(() => {
    if (!enabled) return;
    void syncNow();
    const stale = () => !lastSyncAt.current || Date.now() - lastSyncAt.current > STALE_MS;
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && stale()) void syncNow();
    };
    const handleOnline = () => void syncNow();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [enabled, syncNow]);

  // Push a little after edits stop, and before the page is hidden. Changes
  // made by sync itself also land here; they leave nothing to push, so no request is made.
  const firstChange = useRef<number | null>(null);
  const flush = useCallback(async () => {
    firstChange.current = null;
    if (!readState().code) return;
    const pending = pendingChanges(await localRef.current.snapshot(), readState().items);
    if (pending.length > 0) await syncNow();
  }, [syncNow]);
  useEffect(() => {
    if (!enabled) return;
    firstChange.current ??= Date.now();
    const wait = Math.max(0, Math.min(IDLE_MS, firstChange.current + MAX_WAIT_MS - Date.now()));
    const timer = window.setTimeout(() => void flush(), wait);
    const handleHide = () => {
      if (document.visibilityState === "hidden" && firstChange.current !== null) void flush();
    };
    document.addEventListener("visibilitychange", handleHide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, flush, ...changeSignal]);

  // Retry after a failure that may be temporary.
  useEffect(() => {
    if (status !== "error") return;
    const timer = window.setTimeout(() => void syncNow(), RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [status, syncNow]);

  // Another tab turned sync on or off, or synced.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STATE_KEY && event.key !== null) return;
      const next = readState();
      setState(next);
      setStatus((current) => (next.code ? (current === "off" ? "idle" : current) : "off"));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return { state, status, error, enabled, enable, connect, disconnect, wipe, syncNow };
}
