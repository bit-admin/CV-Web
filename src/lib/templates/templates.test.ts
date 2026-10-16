import { describe, expect, it } from "vitest";
import { createSampleWorkspace, normalizeWorkspace } from "../document";
import { analyzeLayout } from "../layoutAnalysis";
import { renderLatex } from "../latex";
import type { CVBlock, CVWorkspace } from "../types";
import { TEMPLATES, templateById, workspaceTemplate } from ".";
import { contactLabel } from "./timeline";

function englishSample(template?: CVWorkspace["template"]): CVWorkspace {
  const workspace = createSampleWorkspace();
  workspace.languages.forEach((language) => (language.enabled = language.code === "en"));
  if (template) workspace.template = template;
  return workspace;
}

function withBlocks(workspace: CVWorkspace, blocks: CVBlock[]): CVWorkspace {
  workspace.languages[0].document.blocks = blocks;
  return workspace;
}

describe("templates", () => {
  it("typesets a workspace without a template with Classic", () => {
    const workspace = englishSample();
    expect(workspace.template).toBeUndefined();
    expect(workspaceTemplate(workspace).id).toBe("classic");
    expect(renderLatex(workspace)).toContain("\\begin{cvSection}{\\section{Education}}");
  });

  it("typesets with the workspace's template", () => {
    const tex = renderLatex(englishSample("timeline"));
    expect(tex).toContain("\\begin{cvTimeline}{Education}");
    expect(tex).not.toContain("\\begin{cvSection}");
    expect(tex).toContain("\\usepackage{longtable}");
    expect(tex).toContain("\\usepackage[implicit=false]{hyperref}");
  });

  it("keeps a known template through normalization and drops an unknown one", () => {
    const stored = JSON.parse(JSON.stringify(englishSample("timeline")));
    expect(normalizeWorkspace(stored)?.template).toBe("timeline");
    expect(normalizeWorkspace({ ...stored, template: "fancy" })).not.toHaveProperty("template");
  });

  it("falls back to Classic for an unknown id", () => {
    expect(templateById(undefined).id).toBe("classic");
    expect(TEMPLATES.map((template) => template.id)).toEqual(["classic", "timeline"]);
  });
});

describe("Timeline template", () => {
  it("lists contacts as labelled personal data, with links", () => {
    const workspace = englishSample("timeline");
    workspace.languages[0].document.header.contacts = ["(+1) 617-555-1948", "ada@example.com", "github.com/ada", "London, UK"];
    const tex = renderLatex(workspace);

    expect(tex).toContain("\\begin{cvTimeline}{Personal Data}");
    expect(tex).toContain("\\cvRow{\\cvLabel{Phone}}{(+1) 617-555-1948}");
    expect(tex).toContain("\\cvRow{\\cvLabel{Email}}{\\href{mailto:ada@example.com}{ada@example.com}}");
    expect(tex).toContain("\\cvRow{\\cvLabel{GitHub}}{\\href{https://github.com/ada}{github.com/ada}}");
    // A contact of unclear kind has no label.
    expect(tex).toContain("\\cvRow{}{London, UK}");
  });

  it("labels contacts by kind in each language", () => {
    expect(contactLabel("ada@example.com", "zh")).toBe("邮箱");
    expect(contactLabel("+81 3-1234-5678", "ja")).toBe("電話");
    expect(contactLabel("https://www.linkedin.com/in/ada", "ja")).toBe("LinkedIn");
    expect(contactLabel("example.org", "en")).toBe("Web");
    expect(contactLabel("Toronto, Canada", "en")).toBe("");
  });

  it("renders entries as timeline rows with bullets, and lists as rows or paragraphs", () => {
    const tex = renderLatex(
      withBlocks(englishSample("timeline"), [
        {
          id: "e",
          type: "credential",
          title: "Education",
          entries: [{ title: "Uni", location: "Kyoto", subtitle: "B.Sc.", period: "2012 - 2016", bullets: ["One", ""] }]
        },
        { id: "p", type: "numbered-list", title: "Working\nPapers", items: ["A paper.", "Another."] },
        { id: "s", type: "label-value-list", title: "Skills", items: [{ label: "Code", value: "", codeItems: ["Python", "C++"] }] },
        { id: "h", type: "free-text", title: "Hidden", text: "x", hidden: true },
        { id: "r", type: "free-text", title: "References", text: "On request.", pageBreakBefore: true }
      ])
    );

    expect(tex).toContain(
      "\\cvRow{2012 - 2016}{%\n    \\cvEntryTitle{B.Sc.} \\hfill Kyoto \\newline\n    Uni\n    \\cvBullets{\n      \\item One}}"
    );
    // A two-line Classic title is one line in a full-width heading.
    expect(tex).toContain("\\section{Working Papers}\n\n\\begin{cvPapers}\nA paper.\n\nAnother.\n\\end{cvPapers}");
    expect(tex).toContain("\\cvRow{\\cvLabel{Code}}{{\\MonoSmallFont Python}, {\\MonoSmallFont C++}.}");
    expect(tex).not.toContain("Hidden");
    expect(tex).toContain("\\cvSectionPageBreak\n\\section{References}\n\nOn request.");
  });

  it("joins a Chinese two-line title without a space", () => {
    const workspace = createSampleWorkspace();
    workspace.template = "timeline";
    workspace.languages.forEach((language) => (language.enabled = language.code === "ja"));
    expect(renderLatex(workspace)).toContain("\\section{査読付き論文}");
  });
});

describe("layout check per template", () => {
  const A4 = { width: 595.28, height: 841.89 };
  const run = (text: string, x: number, y: number, fontSize = 10) => ({ text, x, y, width: text.length * 5, fontSize });

  it("reads Timeline pages with Timeline geometry", () => {
    // Text down to where Timeline's taller bottom margin begins: a full Timeline page, but a gap for Classic.
    const lines = Array.from({ length: 44 }, (_, index) => run("Entry text that fills the line across the page width.", 95, 765 - index * 12.4));
    const pages = [{ ...A4, runs: lines }, { ...A4, runs: [run("The next entry", 95, 765)] }];
    const gaps = (id: "classic" | "timeline") => analyzeLayout(pages, templateById(id).layout).filter((issue) => issue.kind === "page-gap");
    expect(gaps("timeline")).toEqual([]);
    expect(gaps("classic")).toHaveLength(1);
  });
});
