import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Eye, EyeOff, FileMinus, PanelBottom, WrapText } from "lucide-react";
import type { LayoutIssue, LayoutIssueKind } from "../lib/layoutAnalysis";

const kindIcon: Record<LayoutIssueKind, typeof WrapText> = {
  "page-gap": PanelBottom,
  "short-last-page": FileMinus,
  "short-line": WrapText
};

const kindOrder: LayoutIssueKind[] = ["page-gap", "short-last-page", "short-line"];

type LayoutPanelProps = {
  issues: LayoutIssue[];
  activeIssueId: string | null;
  showHints: boolean;
  onToggleHints: () => void;
  onSelect: (issue: LayoutIssue) => void;
};

export function LayoutPanel({ issues, activeIssueId, showHints, onToggleHints, onSelect }: LayoutPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const sorted = [...issues].sort(
    (a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || a.page - b.page
  );

  if (issues.length === 0) {
    return (
      <div className="layout-panel layout-panel--clean">
        <CheckCircle2 size={14} />
        <span>Layout check: no blank page gaps or short last lines found.</span>
      </div>
    );
  }

  return (
    <div className="layout-panel">
      <div className="layout-panel-header">
        <button
          type="button"
          className="layout-panel-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <strong>Layout check</strong>
          <span className="layout-count">
            {issues.length} suggestion{issues.length === 1 ? "" : "s"}
          </span>
        </button>
        <button
          type="button"
          className="layout-hint-toggle"
          onClick={onToggleHints}
          aria-pressed={showHints}
          title={showHints ? "Hide markers on the preview" : "Show markers on the preview"}
        >
          {showHints ? <EyeOff size={13} /> : <Eye size={13} />}
          {showHints ? "Hide markers" : "Show markers"}
        </button>
      </div>
      {expanded && (
        <ul className="layout-issue-list">
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
                  <em>p.{issue.page}</em>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
