import { useRef, useState } from "react";
import { parseSyncCode } from "../lib/syncCrypto";
import {
  Check,
  CloudAlert,
  CloudCheck,
  CloudUpload,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileUp,
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

const CODE_FILE = "cv-forge-sync-code.txt";

/** Saves the sync code as a small text file the user can keep or open on another device. */
function downloadCode(code: string) {
  const text = [
    "CV Forge sync code",
    "",
    code,
    "",
    "Keep this file private: anyone with this code can read your synced CVs.",
    "To sync another device, open CV Forge there, click “Sync devices”, choose “Join with a code”",
    "and paste the code, or open this file.",
    "",
    `Site: ${window.location.origin}`,
    `Saved: ${new Date().toLocaleString()}`,
    ""
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = CODE_FILE;
  anchor.click();
  URL.revokeObjectURL(url);
}

function CodeBox({ code }: { code: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="sync-code">
      <code aria-label="Sync code">{shown ? code : code.replace(/[0-9A-Z]/g, "•")}</code>
      <span className="sync-code-actions">
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
        <button type="button" className="secondary-button" onClick={() => downloadCode(code)}>
          <Download size={14} />
          Download
        </button>
      </span>
    </div>
  );
}

const FACTS = [
  { icon: ShieldCheck, text: "Encrypted in your browser: the server cannot read your CVs." },
  { icon: KeyRound, text: "No account: the sync code is the only key. Keep it private." },
  { icon: Timer, text: "Synced data unused for 180 days is deleted; this browser’s copy stays." }
];

type StartTab = "create" | "join";

const TABS: Array<{ id: StartTab; icon: typeof CloudUpload; title: string; hint: string }> = [
  { id: "create", icon: CloudUpload, title: "Create a sync code", hint: "First device to sync" },
  { id: "join", icon: Link2, title: "Join with a code", hint: "Already syncing elsewhere" }
];

function StartSync({ sync }: { sync: CVSync }) {
  const [tab, setTab] = useState<StartTab>("create");
  const [input, setInput] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const join = async (code: string) => {
    setBusy(true);
    setConnectError(await sync.connect(code));
    setBusy(false);
  };

  return (
    <div className="sync-panel">
      <p className="sync-lead">
        Keep your CVs and versions the same on every computer you use. Sync is optional: without it, everything stays in
        this browser only.
      </p>

      <div className="sync-tabs" role="tablist" aria-label="How to start syncing">
        {TABS.map(({ id, icon: Icon, title, hint }, i) => (
          <button
            key={id}
            ref={(element) => void (tabRefs.current[i] = element)}
            type="button"
            role="tab"
            id={`sync-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`sync-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className="sync-tab"
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              const next = TABS[(i + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
              setTab(next.id);
              tabRefs.current[TABS.indexOf(next)]?.focus();
            }}
          >
            <Icon size={16} />
            <span>
              <strong>{title}</strong>
              <small>{hint}</small>
            </span>
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <div className="sync-tab-panel" role="tabpanel" id="sync-panel-create" aria-labelledby="sync-tab-create">
          <p>
            Use this on the first device you sync. A new sync code is created and the CVs in this browser are uploaded.
            Then enter the code on your other devices.
          </p>
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
            <CloudUpload size={14} />
            {busy ? "Creating…" : "Create a sync code"}
          </button>
        </div>
      ) : (
        <div className="sync-tab-panel" role="tabpanel" id="sync-panel-join" aria-labelledby="sync-tab-join">
          <p>
            Paste the sync code from a device that already syncs (open <strong>Synced</strong> in its top bar), or open the
            code file you downloaded there.
          </p>
          <form
            className="sync-connect"
            onSubmit={(event) => {
              event.preventDefault();
              void join(input);
            }}
          >
            <input
              className="text-input"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setConnectError(null);
              }}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              aria-label="Sync code"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <button type="submit" className="primary-button" disabled={busy || !input.trim()}>
              <Link2 size={14} />
              {busy ? "Joining…" : "Join"}
            </button>
          </form>
          <div className="sync-join-extra">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const code = (await file.text()).match(/[0-9A-Za-z]{4}(?:[-\s][0-9A-Za-z]{4}){7}/)?.[0];
                if (!code || !parseSyncCode(code)) {
                  setConnectError("No sync code was found in that file.");
                  return;
                }
                setInput(parseSyncCode(code)!);
                void join(code);
              }}
            />
            <button type="button" className="text-button" disabled={busy} onClick={() => fileRef.current?.click()}>
              <FileUp size={13} />
              Open a code file
            </button>
            <small className="sync-note">CVs already in this browser are added to the synced ones.</small>
          </div>
          {connectError && <small className="sync-error">{connectError}</small>}
        </div>
      )}

      <ul className="sync-facts">
        {FACTS.map(({ icon: Icon, text }) => (
          <li key={text}>
            <Icon size={14} />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SyncPanel({ sync }: { sync: CVSync }) {
  const confirm = useConfirm();
  if (!sync.enabled) return <StartSync sync={sync} />;

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
          Click <strong>Sync devices</strong> at the top, then <strong>Join with a code</strong>.
        </li>
        <li>Paste this sync code, or open the file from <strong>Download</strong>:</li>
      </ol>
      <CodeBox code={sync.state.code!} />
      <small className="sync-note">Keep the code private: it is the only key to your synced CVs. Download it or save it in a password manager: if it is lost, the synced copy cannot be recovered.</small>

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
