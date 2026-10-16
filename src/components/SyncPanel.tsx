import { useState } from "react";
import { Check, Cloud, CloudOff, Copy, Eye, EyeOff, KeyRound, Link2, RefreshCw, Trash2, Unplug } from "lucide-react";
import type { CVSync } from "../lib/useSync";
import { useConfirm } from "./ConfirmDialog";
import { formatWhen } from "./LibraryModal";

export function syncLabel(sync: CVSync): { text: string; tone: "ok" | "busy" | "error" | "local"; title: string } {
  if (sync.status === "off") return { text: "Saved locally", tone: "local", title: "Every change is saved in this browser. Click to set up sync." };
  if (sync.status === "syncing") return { text: "Syncing…", tone: "busy", title: "Syncing with your other devices" };
  if (sync.status === "error") return { text: "Sync paused", tone: "error", title: sync.error ?? "Sync failed" };
  return {
    text: "Synced",
    tone: "ok",
    title: sync.state.lastSyncAt ? `Saved in this browser and synced ${formatWhen(sync.state.lastSyncAt)}` : "Saved in this browser"
  };
}

function CodeBox({ code }: { code: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="sync-code">
      <code aria-label="Sync code">{shown ? code : code.replace(/[0-9A-Z]/g, "•")}</code>
      <button type="button" className="icon-button" aria-label={shown ? "Hide code" : "Show code"} title={shown ? "Hide code" : "Show code"} onClick={() => setShown(!shown)}>
        {shown ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Copy code"
        title="Copy code"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export function SyncPanel({ sync }: { sync: CVSync }) {
  const [input, setInput] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  if (!sync.enabled) {
    return (
      <div className="sync-panel">
        <p>
          Sync keeps your CVs and versions the same on every browser you use. It is optional: without it, everything stays
          only in this browser.
        </p>
        <ul className="sync-points">
          <li>
            <KeyRound size={14} />
            <span>
              A <strong>sync code</strong> is the only key. There is no account. Anyone with the code can read your CVs, so keep
              it private. If you lose it, the synced copy cannot be recovered (this browser’s CVs are not affected).
            </span>
          </li>
          <li>
            <Cloud size={14} />
            <span>
              Data is <strong>encrypted in your browser</strong> before it is uploaded; the server only stores ciphertext. Synced
              data unused for 180 days is deleted.
            </span>
          </li>
        </ul>

        <div className="sync-actions">
          <section>
            <h3>First device</h3>
            <p>Create a sync code and upload the CVs in this browser.</p>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await sync.enable();
                setBusy(false);
              }}
            >
              <Cloud size={14} />
              Turn on sync
            </button>
          </section>
          <section>
            <h3>Another device</h3>
            <p>Enter the code from your first device. CVs in this browser are added to the synced ones.</p>
            <form
              className="sync-connect"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setConnectError(await sync.connect(input));
                setBusy(false);
              }}
            >
              <input
                className="text-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="XXXX-XXXX-XXXX-…"
                aria-label="Sync code"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="secondary-button" disabled={busy || !input.trim()}>
                <Link2 size={14} />
                Connect
              </button>
            </form>
            {connectError && <small className="sync-error">{connectError}</small>}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="sync-panel">
      <div className={`sync-status sync-status--${sync.status}`}>
        {sync.status === "error" ? <CloudOff size={16} /> : <Cloud size={16} />}
        <span>
          <strong>{sync.status === "syncing" ? "Syncing…" : sync.status === "error" ? "Sync paused" : "Sync is on"}</strong>
          <small>
            {sync.status === "error"
              ? sync.error
              : sync.state.lastSyncAt
                ? `Last synced ${formatWhen(sync.state.lastSyncAt)}`
                : "Not synced yet"}
          </small>
        </span>
        <button type="button" className="secondary-button" disabled={sync.status === "syncing"} onClick={() => void sync.syncNow("manual")}>
          <RefreshCw size={14} />
          Sync now
        </button>
      </div>

      <h3>Your sync code</h3>
      <p>Enter it on another device to sync it too. Keep it private: it is the only key to your synced CVs.</p>
      <CodeBox code={sync.state.code!} />

      <p className="library-hint">
        Changes sync shortly after you stop editing and whenever you come back to this tab. If a CV was edited on two
        devices at once, the newer synced edit is shown and the other is kept as a version.
      </p>

      <footer className="library-footer">
        <button
          type="button"
          className="ghost-button"
          onClick={async () => {
            const ok = await confirm({
              title: "Stop syncing in this browser?",
              message: "The CVs in this browser and the synced copy both stay. You can reconnect with the sync code.",
              confirmLabel: "Disconnect"
            });
            if (ok) sync.disconnect();
          }}
        >
          <Unplug size={14} />
          Disconnect this browser
        </button>
        <button
          type="button"
          className="ghost-button sync-danger"
          onClick={async () => {
            const ok = await confirm({
              title: "Delete the synced data?",
              message: "The synced copy is deleted from the server for all devices, and sync stops. The CVs in each browser are not affected.",
              confirmLabel: "Delete synced data",
              tone: "danger"
            });
            if (ok) await sync.wipe();
          }}
        >
          <Trash2 size={14} />
          Delete synced data
        </button>
      </footer>
    </div>
  );
}
