import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  HardDrive,
  History,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { createSampleWorkspace } from "../lib/document";
import { contentKey, createEmptyWorkspace, describeChanges, loadWorkingCopy, type CVVersion } from "../lib/library";
import type { CVLibrary } from "../lib/useLibrary";
import { useConfirm } from "./ConfirmDialog";
import { Kbd, MOD } from "./ui";
import type { CVWorkspace } from "../lib/types";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function formatWhen(time: number, now = Date.now()): string {
  const minutes = Math.round((now - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return relative.format(-minutes, "minute");
  if (minutes < 60 * 24) return relative.format(-Math.round(minutes / 60), "hour");
  return new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function ChangeList({ changes, empty }: { changes: string[]; empty: string }) {
  if (changes.length === 0) {
    return <small className="version-changes version-changes--empty">{empty}</small>;
  }
  const shown = changes.slice(0, 4);
  return (
    <small className="version-changes">
      {shown.join(" · ")}
      {changes.length > shown.length && ` · +${changes.length - shown.length} more`}
    </small>
  );
}

function InlineRename({ value, onSave, onCancel }: { value: string; onSave: (value: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <form
      className="inline-rename"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <input
        autoFocus
        value={draft}
        aria-label="New name"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
      />
      <button type="submit" className="icon-button" aria-label="Save name" title="Save name">
        <Check size={14} />
      </button>
      <button type="button" className="icon-button" aria-label="Cancel" title="Cancel" onClick={onCancel}>
        <X size={14} />
      </button>
    </form>
  );
}

export function LibraryModal({ library, workspace }: { library: CVLibrary; workspace: CVWorkspace }) {
  const { index, active, store, revision } = library;
  const [selectedId, setSelectedId] = useState(active.id);
  const [versions, setVersions] = useState<CVVersion[] | null>(null);
  const [label, setLabel] = useState("");
  const [renamingCV, setRenamingCV] = useState(false);
  const [renamingVersion, setRenamingVersion] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  const selected = index.cvs.find((cv) => cv.id === selectedId) ?? active;
  const isActive = selected.id === active.id;
  const current = isActive ? workspace : loadWorkingCopy(selected.id);
  const sortedCVs = [...index.cvs].sort((a, b) => b.updatedAt - a.updatedAt);

  useEffect(() => {
    let cancelled = false;
    store.list(selected.id).then(
      (list) => !cancelled && setVersions(list),
      () => !cancelled && setVersions([])
    );
    return () => {
      cancelled = true;
    };
  }, [revision, selected.id, store]);

  // Follow the open CV when it changes (new, duplicated, restored).
  useEffect(() => setSelectedId(active.id), [active.id]);

  const latest = versions?.[0];
  const unsaved = current && latest ? describeChanges(latest.workspace, current) : [];
  const upToDate = Boolean(current && latest && contentKey(current) === contentKey(latest.workspace));

  return (
    <div className="library">
      <div className="library-columns">
        <section className="library-cvs" aria-label="Your CVs">
          <h3>Your CVs</h3>
          <ul className="library-cv-list">
            {sortedCVs.map((cv) => (
              <li key={cv.id}>
                <button
                  type="button"
                  className={`library-cv${cv.id === selected.id ? " selected" : ""}`}
                  aria-current={cv.id === active.id ? "true" : undefined}
                  onClick={() => {
                    setSelectedId(cv.id);
                    setRenamingCV(false);
                  }}
                  onDoubleClick={() => library.openCV(cv.id)}
                >
                  <FileText size={14} />
                  <span>
                    <strong>{cv.name}</strong>
                    <small>Edited {formatWhen(cv.updatedAt)}</small>
                  </span>
                  {cv.id === active.id && <em>Open</em>}
                </button>
              </li>
            ))}
          </ul>
          <div className="library-new">
            <button type="button" className="text-button" onClick={() => library.createCV("Untitled CV", createEmptyWorkspace())}>
              <FilePlus2 size={13} />
              New blank CV
            </button>
            <button type="button" className="text-button" onClick={() => library.createCV("Sample CV", createSampleWorkspace())}>
              <FilePlus2 size={13} />
              New from sample
            </button>
          </div>
        </section>

        <section className="library-detail" aria-label={`Versions of ${selected.name}`}>
          <div className="library-detail-head">
            {renamingCV ? (
              <InlineRename
                value={selected.name}
                onCancel={() => setRenamingCV(false)}
                onSave={(name) => {
                  library.renameCV(selected.id, name);
                  setRenamingCV(false);
                }}
              />
            ) : (
              <h3 title={selected.name}>{selected.name}</h3>
            )}
            <div className="library-detail-actions">
              {!isActive && (
                <button type="button" className="primary-button" onClick={() => library.openCV(selected.id)}>
                  <FolderOpen size={14} />
                  Open
                </button>
              )}
              <button type="button" className="icon-button" aria-label="Rename CV" title="Rename CV" onClick={() => setRenamingCV(true)}>
                <Pencil size={14} />
              </button>
              <button type="button" className="icon-button" aria-label="Duplicate CV" title="Duplicate CV" onClick={() => library.duplicateCV(selected.id)}>
                <Copy size={14} />
              </button>
              <button
                type="button"
                className="icon-button icon-button--danger"
                aria-label="Delete CV"
                title={index.cvs.length <= 1 ? "The only CV cannot be deleted" : "Delete CV and its versions"}
                disabled={index.cvs.length <= 1}
                onClick={async () => {
                  const count = versions?.length ?? 0;
                  const ok = await confirm({
                    title: `Delete “${selected.name}”?`,
                    message: `The CV and ${count === 1 ? "its version" : `all ${count} of its versions`} are removed from this browser. This cannot be undone.`,
                    confirmLabel: "Delete CV",
                    tone: "danger"
                  });
                  if (ok) void library.deleteCV(selected.id);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <form
            className="version-save"
            onSubmit={(event) => {
              event.preventDefault();
              void library.saveNamedVersion(label, selected.id).then((version) => version && setLabel(""));
            }}
          >
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Name this version, e.g. “Sent to ACME”"
              aria-label="Version name"
            />
            <button type="submit" className="secondary-button" disabled={upToDate && latest?.kind === "manual"}>
              <Save size={14} />
              Save version
            </button>
          </form>

          <ol className="version-list">
            <li className="version version--current">
              <History size={14} />
              <span>
                <strong>{isActive ? "Current (editing)" : "Current"}</strong>
                {latest ? (
                  <ChangeList changes={upToDate ? [] : unsaved} empty={upToDate ? "Same as the latest version" : "Changes not listed"} />
                ) : (
                  <small className="version-changes version-changes--empty">No versions yet. Save one before big edits or before sending the CV.</small>
                )}
              </span>
            </li>
            {versions?.map((version, i) => (
              <li key={version.id} className="version">
                <span className={`version-dot version-dot--${version.kind}`} aria-hidden="true" />
                <span>
                  {renamingVersion === version.id ? (
                    <InlineRename
                      value={version.label}
                      onCancel={() => setRenamingVersion(null)}
                      onSave={(name) => {
                        void library.renameVersion(version, name);
                        setRenamingVersion(null);
                      }}
                    />
                  ) : (
                    <strong>
                      {version.label}
                      {version.kind === "auto" && <em className="version-badge">Auto</em>}
                    </strong>
                  )}
                  <time dateTime={new Date(version.createdAt).toISOString()}>{formatWhen(version.createdAt)}</time>
                  <ChangeList
                    changes={describeChanges(versions[i + 1]?.workspace ?? null, version.workspace)}
                    empty={versions[i + 1] ? "No content changes" : "Oldest version"}
                  />
                </span>
                <span className="version-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    title="Replace the current content with this version (the current state is kept as a version)"
                    disabled={upToDate && i === 0}
                    onClick={() => void library.restoreVersion(version)}
                  >
                    <RotateCcw size={13} />
                    Restore
                  </button>
                  <button type="button" className="icon-button" aria-label="Open as a new CV" title="Open as a new CV" onClick={() => library.versionAsNewCV(version)}>
                    <Copy size={14} />
                  </button>
                  <button type="button" className="icon-button" aria-label="Rename version" title="Rename (keeps it from being pruned)" onClick={() => setRenamingVersion(version.id)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                    aria-label="Delete version"
                    title="Delete version"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Delete version “${version.label}”?`,
                        message: "The current content of the CV is not affected. This cannot be undone.",
                        confirmLabel: "Delete version",
                        tone: "danger"
                      });
                      if (ok) void library.deleteVersion(version);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <p className="library-hint">
            Automatic versions are saved before your first edit of a visit, every 10 minutes while you edit, and before
            imports, resets and restores. The latest 20 are kept; named versions are never removed. Press{" "}
            <Kbd>{`${MOD}S`}</Kbd> to save a version at any time.
          </p>
        </section>
      </div>

      <footer className="library-footer">
        <span>
          <HardDrive size={14} />
          {store.persistent
            ? "Stored only in this browser. Clearing site data deletes it, so keep a backup."
            : "This browser cannot keep versions after the page closes. Back up to keep them."}
        </span>
        <span className="library-footer-actions">
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void library.importBackup(file);
            }}
          />
          <button type="button" className="ghost-button" onClick={() => importRef.current?.click()}>
            <Upload size={14} />
            Import backup
          </button>
          <button type="button" className="secondary-button" onClick={() => void library.exportBackup()}>
            <Download size={14} />
            Back up all CVs
          </button>
        </span>
      </footer>
    </div>
  );
}
