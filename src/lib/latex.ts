// Entry point for LaTeX generation: renders a workspace with its template (see `templates/`).
import type { CVWorkspace } from "./types";
import { workspaceTemplate } from "./templates";

export { cjkFontGroups, contactLink, escapeLatex, inlineLatex, type CJKFontGroup } from "./templates/shared";

/** The full .tex file for the workspace, typeset with its template. */
export function renderLatex(workspace: CVWorkspace): string {
  return workspaceTemplate(workspace).render(workspace);
}
