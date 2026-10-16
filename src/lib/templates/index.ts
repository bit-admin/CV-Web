// The templates a CV can be typeset with. Each renders the whole workspace to a .tex file and reports its page
// geometry to the layout check and the preview sync; all of them read the same data model.
import type { CVTemplateId, CVWorkspace } from "../types";
import { CLASSIC_LAYOUT, renderClassicLatex } from "./classic";
import type { TemplateLayout } from "./shared";
import { TIMELINE_LAYOUT, renderTimelineLatex } from "./timeline";

export type CVTemplate = {
  id: CVTemplateId;
  name: string;
  /** One line for the template picker. */
  description: string;
  layout: TemplateLayout;
  render: (workspace: CVWorkspace) => string;
  /** Hints in the header editor, on how this template shows the name and the contacts. */
  headerNotes: { name: string; contacts: string };
  /** Hint under a section's title field. */
  titleNote: string;
};

export const TEMPLATES: CVTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Section titles in a left column, name beside the contacts.",
    layout: CLASSIC_LAYOUT,
    render: renderClassicLatex,
    headerNotes: {
      name: "Long names shrink automatically to fit beside the contact block.",
      contacts: "Right-aligned, one per line"
    },
    titleNote: "Press Enter to break the title over two lines in the left column."
  },
  {
    id: "timeline",
    name: "Timeline",
    description: "Centred name, dates beside a ruled timeline.",
    layout: TIMELINE_LAYOUT,
    render: renderTimelineLatex,
    headerNotes: {
      name: "The name is centred; long names shrink automatically to fit the page width.",
      contacts: "Listed as personal data, one per line"
    },
    titleNote: "Titles run across the page on one line, so line breaks are joined."
  }
];

export const DEFAULT_TEMPLATE_ID: CVTemplateId = "classic";

export function isTemplateId(value: unknown): value is CVTemplateId {
  return TEMPLATES.some((template) => template.id === value);
}

export function templateById(id: CVTemplateId | undefined): CVTemplate {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0];
}

/** The workspace's template; data saved before templates existed uses Classic. */
export function workspaceTemplate(workspace: CVWorkspace): CVTemplate {
  return templateById(workspace.template);
}
