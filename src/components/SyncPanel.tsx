import { useState } from "react";
import {
  Check,
  CloudAlert,
  CloudCheck,
  CloudUpload,
  Copy,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Link2,
  RefreshCw,
  ShieldCheck,
  Timer,
  Trash2,
  Unplug
} from "lucide-react";
import type { CVSync } from "../lib/useSync";
import { useConfirm } from "./ConfirmDialog";
import { formatWhen } from "./LibraryModal";

/** The sync button in the top bar: where data is, and the way into sync settings. */
export function SyncButton({ sync, onClick }: { sync: CVSync; onClick: () => void }) {
  const { status, state, error } = sync;
  const title =
    status === "off"
      ? "Your CVs are saved only in this browser. Click to sync them with your other devices."
      : status === "error"
        ? `${error ?? "Sync failed"} Click for details.`
        : state.lastSyncAt
          ? `Saved in this browser and synced ${formatWhen(state.lastSyncAt)}. Click for sync settings.`
          : "Click for sync settings.";
  return (
    <button type="button" className={`sync-button sync-button--${status}`} title={title} onClick={onClick}>
      {status === "off" && (
        <>
          <HardDrive size={14} />
          <span>Saved locally</span>
          <span className="sync-button-cta">
            <CloudUpload size={14} />
            Sync devices
          </span>
        </>
      )}
      {status === "idle" && (
        <>
          <CloudCheck size={14} />
          <span>Synced</span>
        </>
      )}
      {status === "syncing" && (
        <>
          <RefreshCw size={14} className="sync-spin" />
          <span>Syncing…</span>
        </>
      )}
      {status === "error" && (
        <>
          <CloudAlert size={14} />
          <span>Sync paused</span>
        </>
      )}
    </button>
  );
}

function CodeBox({ code }: { code: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="sync-code">
      <code aria-label="Sync code">{shown ? code : code.replace(/[0-9A-Z]/g, "•")}</code>
      <button type="button" className="secondary-button" onClick={() => setShown(!shown)}>
        {shown ? <EyeOff size={14} /> : <Eye size={14} />}
        {shown ? "Hide" : "Show"}
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const FACTS = [
  { icon: ShieldCheck, text: "Encrypted in your browser before upload. The server cannot read your CVs." },
  { icon: KeyRound, text: "No account: a private sync code is the only key. Anyone with it can read your CVs." },
  { icon: Timer, text: "Synced data unused for 180 days is deleted. Your browser’s copy is never affected." }
];

export function SyncPanel({ sync }: { sync: CVSync }) {
  const [input, setInput] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const confirm = useConfirm();

  if (!sync.enabled) {
    return (
      <div className="sync-panel">
        <p className="sync-lead">
          Keep your CVs and versions the same on every computer you use. Sync is optional: without it, everything stays in
          this browser only.
        </p>
        <ul className="sync-facts">
          {FACTS.map(({ icon: Icon, text }) => (
            <li key={text}>
              <Icon size={15} />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <h3>How do you want to start?</h3>
        <div className="sync-choices">
          <section className="sync-choice">
            <span className="sync-choice-icon">
              <CloudUpload size={18} />
            </span>
            <h4>Start syncing from this browser</h4>
            <p>Choose this if you have not used sync before. You get a sync code to enter on your other devices.</p>
            <button
              type="button"
              className="primary-button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("create");
                await sync.enable();
                setBusy(null);
              }}
            >
              <CloudUpload size={14} />
              {busy === "create" ? "Creating…" : "Create a sync code"}
            </button>
          </section>

          <section className="sync-choice">
            <span className="sync-choice-icon">
              <Link2 size={18} />
            </span>
            <h4>Join with an existing code</h4>
            <p>Already syncing on another device? Open Sync there, copy its code and paste it here.</p>
            <form
              className="sync-connect"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy("join");
                setConnectError(await sync.connect(input));
                setBusy(null);
              }}
            >
              <input
                className="text-input"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setConnectError(null);
                }}
                placeholder="XXXX-XXXX-XXXX-XXXX-…"
                aria-label="Sync code"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className={input.trim() ? "primary-button" : "secondary-button"} disabled={busy !== null || !input.trim()}>
                {busy === "join" ? "Joining…" : "Join"}
              </button>
            </form>
            {connectError ? (
              <small className="sync-error">{connectError}</small>
            ) : (
              <small className="sync-note">CVs already in this browser are added to the synced ones.</small>
            )}
          </section>
        </div>
      </div>
    );
  }

  const { status } = sync;
  return (
    <div className="sync-panel">
      <div className={`sync-status sync-status--${status}`}>
        {status === "error" ? <CloudAlert size={18} /> : status === "syncing" ? <RefreshCw size={18} className="sync-spin" /> : <CloudCheck size={18} />}
        <span>
          <strong>{status === "syncing" ? "Syncing…" : status === "error" ? "Sync paused" : "This browser is synced"}</strong>
          <small>
            {status === "error"
              ? sync.error
              : sync.state.lastSyncAt
                ? `Last synced ${formatWhen(sync.state.lastSyncAt)}. Changes sync shortly after you stop editing.`
                : "Not synced yet."}
          </small>
        </span>
        <button type="button" className="secondary-button" disabled={status === "syncing"} onClick={() => void sync.syncNow("manual")}>
          <RefreshCw size={14} />
          Sync now
        </button>
      </div>

      <h3>Add another device</h3>
      <ol className="sync-steps">
        <li>Open CV Forge on the other device.</li>
        <li>
          Click <strong>Sync devices</strong> at the top, then <strong>Join with an existing code</strong>.
        </li>
        <li>Paste this sync code:</li>
      </ol>
      <CodeBox code={sync.state.code!} />
      <small className="sync-note">Keep the code private: it is the only key to your synced CVs. Save it somewhere safe, such as a password manager.</small>

      <h3>If a CV is edited on two devices</h3>
      <p>The edit that syncs first is kept; the other device saves its own edits as a version named “Edits replaced by another device”, so nothing is lost.</p>

      <footer className="sync-footer">
        <button
          type="button"
          className="ghost-button"
          onClick={async () => {
            const ok = await confirm({
              title: "Stop syncing in this browser?",
              message: "The CVs in this browser and the synced copy both stay. You can join again with the sync code.",
              confirmLabel: "Stop syncing"
            });
            if (ok) sync.disconnect();
          }}
        >
          <Unplug size={14} />
          Stop syncing this browser
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
