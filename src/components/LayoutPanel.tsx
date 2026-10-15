import { useState } from "react";
import { CheckCircle2, ChevronUp, CircleAlert, Eye, EyeOff, FileMinus, PanelBottom, WrapText } from "lucide-react";
import type { LayoutIssue, LayoutIssueKind } from "../lib/layoutAnalysis";

const kindIcon: Record<LayoutIssueKind, typeof WrapText> = {
  "page-gap": PanelBottom,
  "short-last-page": FileMinus,
  "short-line": WrapText
};

const kindLabel: Record<LayoutIssueKind, [string, string]> = {
  "page-gap": ["page gap", "page gaps"],
  "short-last-page": ["short last page", "short last pages"],
  "short-line": ["short line", "short lines"]
};

const kindOrder: LayoutIssueKind[] = ["page-gap", "short-last-page", "short-line"];

type DockProps = {
  issues: LayoutIssue[];
  /** Layout results are for an older compile than the current content. */
  outdated: boolean;
  analysed: boolean;
  activeIssueId: string | null;
  showHints: boolean;
  compileError: { message: string; log: string } | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleHints: () => void;
  onSelect: (issue: LayoutIssue) => void;
};

/** The strip along the bottom of the preview: compile errors and layout suggestions. */
export function LayoutDock({
  issues,
  outdated,
  analysed,
  activeIssueId,
  showHints,
  compileError,
  expanded,
  onToggleExpanded,
  onToggleHints,
  onSelect
}: DockProps) {
  const [showLog, setShowLog] = useState(false);
  const sorted = [...issues].sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || a.page - b.page);
  const counts = kindOrder.map((kind) => [kind, issues.filter((issue) => issue.kind === kind).length] as const).filter(([, n]) => n > 0);

  return (
    <div className={`dock${expanded && issues.length > 0 ? " dock--open" : ""}`}>
      {compileError && (
        <div className="dock-error" role="alert">
          <div className="dock-error-head">
            <CircleAlert size={14} />
            <strong>Compile failed</strong>
            <span>{compileError.message}</span>
            <button type="button" className="link-button" onClick={() => setShowLog((value) => !value)}>
              {showLog ? "Hide log" : "Show log"}
            </button>
          </div>
          {showLog && <pre className="dock-log">{compileError.log}</pre>}
        </div>
      )}

      <div className="dock-bar">
        <button
          type="button"
          className="dock-toggle"
          aria-expanded={expanded}
          disabled={issues.length === 0}
          onClick={onToggleExpanded}
        >
          {issues.length === 0 ? (
            <CheckCircle2 size={14} className="dock-ok" />
          ) : (
            <ChevronUp size={14} className="dock-chevron" />
          )}
          <strong>Layout check</strong>
          {!analysed ? (
            <span className="dock-muted">Runs after each compile</span>
          ) : issues.length === 0 ? (
            <span className="dock-muted">No page gaps or short last lines</span>
          ) : (
            <span className="dock-counts">
              {counts.map(([kind, n]) => {
                const Icon = kindIcon[kind];
                return (
                  <span key={kind} className={`count-chip count-chip--${kind}`}>
                    <Icon size={12} />
                    {n} {kindLabel[kind][n === 1 ? 0 : 1]}
                  </span>
                );
              })}
            </span>
          )}
          {outdated && analysed && <span className="dock-muted dock-outdated">· from the last compile</span>}
        </button>
        {issues.length > 0 && (
          <button type="button" className="dock-action" onClick={onToggleHints} aria-pressed={showHints}>
            {showHints ? <EyeOff size={13} /> : <Eye size={13} />}
            {showHints ? "Hide markers" : "Show markers"}
          </button>
        )}
      </div>

      {expanded && issues.length > 0 && (
        <ul className="dock-list">
          {sorted.map((issue) => {
            const Icon = kindIcon[issue.kind];
            return (
              <li key={issue.id}>
                <button
                  type="button"
                  className={`layout-issue layout-issue--${issue.kind}${issue.id === activeIssueId ? " active" : ""}`}
                  onClick={() => onSelect(issue)}
                >
                  <Icon size={14} />
                  <span>
                    <strong>{issue.title}</strong>
                    <small>{issue.detail}</small>
                  </span>
                  <em>p. {issue.page}</em>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
