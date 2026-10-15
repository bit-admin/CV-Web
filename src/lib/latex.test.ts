import { describe, expect, it } from "vitest";
import { sampleCv } from "../data/sampleCv";
import { createSampleWorkspace, migrateCvData, migrateDocumentToWorkspace, normalizeDocument, normalizeWorkspace } from "./document";
import { escapeLatex, inlineLatex, renderLatex } from "./latex";
import type { CVBlock, CVDocument, CVLanguageCode, CVWorkspace } from "./types";

function documentWithBlocks(blocks: CVBlock[]): CVDocument {
  return {
    version: 2,
    header: {
      name: "Ada Lovelace",
      suffix: "Ph.D.",
      contacts: ["ada@example.com"]
    },
    blocks
  };
}

function workspaceWithDocument(document: CVDocument, code: CVLanguageCode = "en"): CVWorkspace {
  return {
    version: 3,
    activeLanguage: code,
    languages: [
      { code: "en", label: "English", enabled: code === "en", document: code === "en" ? document : documentWithBlocks([]) },
      { code: "zh", label: "Chinese", enabled: code === "zh", document: code === "zh" ? document : documentWithBlocks([]) },
      { code: "ja", label: "Japanese", enabled: code === "ja", document: code === "ja" ? document : documentWithBlocks([]) }
    ]
  };
}

describe("LaTeX renderer", () => {
  it("escapes LaTeX control characters in user text", () => {
    expect(escapeLatex("A&B_50% {x} $5 #1 ~ ^ \\")).toBe(
      "A\\&B\\_50\\% \\{x\\} \\$5 \\#1 \\textasciitilde{} \\textasciicircum{} \\textbackslash{}"
    );
  });

  it("supports bold and italic inline markup while escaping content", () => {
    expect(inlineLatex("**A&B** wrote _50% alpha_ in `Python_3`")).toBe(
      "\\textbf{A\\&B} wrote \\textit{50\\% alpha} in {\\MonoSmallFont Python\\_3}"
    );
  });

  it("renders migrated sample data as editable document blocks", () => {
    const tex = renderLatex(migrateDocumentToWorkspace(migrateCvData(sampleCv)));

    expect(tex).toContain("\\section{Education}");
    expect(tex).toContain("Department of Statistics, University of Toronto");
    expect(tex).toContain("\\section{Working\\\\Papers}");
    expect(tex).toContain("\\section{Professional\\\\Experience}");
    expect(tex).toContain("\\pubListStart");
    expect(tex).toContain("\\skillListStart");
  });

  it("renders every block template through the fixed style", () => {
    const tex = renderLatex(
      workspaceWithDocument(
        documentWithBlocks([
          {
            id: "credential",
            type: "credential",
            title: "Credentials",
            entries: [{ title: "University", location: "City", subtitle: "Degree", period: "2020", bullets: ["Thesis"] }]
          },
          {
            id: "role",
            type: "role",
            title: "Roles",
            entries: [{ title: "Company", location: "Remote", period: "2021", bullets: ["Built systems"] }]
          },
          {
            id: "project",
            type: "project",
            title: "Projects",
            entries: [{ title: "Compiler", organization: "Lab", period: "2022", bullets: ["Rendered PDFs"] }]
          },
          {
            id: "numbered",
            type: "numbered-list",
            title: "Papers",
            items: ["**Ada Lovelace**. Notes on computation."]
          },
          {
            id: "dated",
            type: "dated-list",
            title: "Awards",
            items: [{ text: "Best Paper, Research Society", date: "2023" }]
          },
          {
            id: "label-values",
            type: "label-value-list",
            title: "Skills",
            items: [{ label: "Programming", value: "", codeItems: ["TypeScript", "LaTeX"] }]
          },
          {
            id: "grouped",
            type: "grouped-list",
            title: "Service",
            groups: [{ label: "Reviewer for", items: ["_Journal A_", "_Journal B_"] }]
          },
          {
            id: "free",
            type: "free-text",
            title: "References",
            text: "Available upon request."
          }
        ])
      )
    );

    expect(tex).toContain("\\eduHeading");
    expect(tex).toContain("\\internHeading");
    expect(tex).toContain("\\projHeading");
    expect(tex).toContain("\\pubListStart");
    expect(tex).toContain("\\awardListStart");
    expect(tex).toContain("\\item \\emph{Best Paper}, Research Society \\hfill 2023");
    expect(tex).toContain("{\\MonoSmallFont TypeScript}");
    expect(tex).toContain("\\phantom{\\emph{Reviewer for}:}");
    expect(tex).toContain("Available upon request.");
  });

  it("renders editable line breaks in section titles", () => {
    const tex = renderLatex(
      workspaceWithDocument(
        documentWithBlocks([
          {
            id: "working",
            type: "numbered-list",
            title: "Working\nPapers",
            items: ["Paper"]
          }
        ])
      )
    );

    expect(tex).toContain("\\section{Working\\\\Papers}");
  });

  it("preserves block order while omitting hidden and empty blocks", () => {
    const tex = renderLatex(
      workspaceWithDocument(
        documentWithBlocks([
          { id: "first", type: "free-text", title: "First", text: "One" },
          { id: "hidden", type: "free-text", title: "Hidden", text: "Two", hidden: true },
          { id: "empty", type: "free-text", title: "Empty", text: "" },
          {
            id: "empty-credential",
            type: "credential",
            title: "Empty Credential",
            entries: [{ title: "", location: "", subtitle: "", period: "", bullets: [""] }]
          },
          { id: "second", type: "free-text", title: "Second", text: "Three" }
        ])
      )
    );

    expect(tex.indexOf("\\section{First}")).toBeLessThan(tex.indexOf("\\section{Second}"));
    expect(tex).not.toContain("\\section{Hidden}");
    expect(tex).not.toContain("\\section{Empty}");
    expect(tex).not.toContain("\\section{Empty Credential}");
  });

  it("migrates malformed legacy services without crashing", () => {
    const document = migrateCvData({
      ...sampleCv,
      services: [{ label: "Reviewer for" }]
    });

    expect(() => renderLatex(migrateDocumentToWorkspace(document))).not.toThrow();
    expect(renderLatex(migrateDocumentToWorkspace(document))).not.toContain("undefined");
  });

  it("normalizes stored v2 documents", () => {
    const document = normalizeDocument({
      version: 2,
      header: { name: "Ada", suffix: 7, contacts: ["ada@example.com", 5] },
      blocks: [
        { id: "", type: "grouped-list", title: "", groups: [{ label: "Reviewer", items: undefined }] },
        { id: "bad", type: "unknown", title: "Bad" }
      ]
    });

    expect(document?.header.suffix).toBe("");
    expect(document?.header.contacts).toEqual(["ada@example.com", ""]);
    expect(document?.blocks).toHaveLength(1);
    expect(document?.blocks[0]?.title).toBe("Service");
  });

  it("normalizes stored v3 workspaces and fills missing language slots", () => {
    const workspace = normalizeWorkspace({
      version: 3,
      activeLanguage: "fr",
      languages: [
        {
          code: "en",
          enabled: true,
          document: documentWithBlocks([{ id: "en", type: "free-text", title: "English", text: "English only" }])
        }
      ]
    });

    expect(workspace?.activeLanguage).toBe("en");
    expect(workspace?.languages.map((language) => language.code)).toEqual(["en", "zh", "ja"]);
    expect(workspace?.languages.find((language) => language.code === "zh")?.enabled).toBe(false);
  });

  it("creates a sample workspace with all three languages enabled", () => {
    const workspace = createSampleWorkspace();

    expect(workspace.languages.map((language) => [language.code, language.enabled])).toEqual([
      ["en", true],
      ["zh", true],
      ["ja", true]
    ]);
    expect(workspace.languages.find((language) => language.code === "zh")?.document.header.name).toBe("小林春香");
  });

  it("renders enabled languages in order and omits disabled languages", () => {
    const workspace = createSampleWorkspace();
    workspace.languages.find((language) => language.code === "zh")!.enabled = false;

    const tex = renderLatex(workspace);

    expect(tex).toContain("\\section{Education}");
    expect(tex).not.toContain("\\begin{chineseCV}");
    expect(tex).toContain("\\begin{japaneseCV}");
    expect(tex.indexOf("\\begin{englishCV}")).toBeLessThan(tex.indexOf("\\begin{japaneseCV}"));
    expect(tex).toContain("\\newpage");
  });

  it("includes CJK font declarations", () => {
    const tex = renderLatex(createSampleWorkspace());

    expect(tex).toContain("\\PassOptionsToPackage{fontset=none}{ctex}");
    expect(tex).toContain("\\usepackage[scheme=plain]{ctex}");
    expect(tex).toContain("\\setmainfont{SabonLTStd}");
    expect(tex).toContain("\\newfontfamily\\Calluna{Calluna}");
    expect(tex).toContain("\\newfontfamily\\CronosLt{CronosProLT}");
    expect(tex).toContain("\\setCJKmainfont{Simsun.ttc}");
    expect(tex).toContain("\\setCJKfamilyfont{zhfangsong}{Fangsong.ttf}");
    expect(tex).toContain("\\setCJKfamilyfont{jpmincho}{yumin.ttf}");
    expect(tex).toContain("\\setCJKfamilyfont{jptitle}{yumindb.ttf}");
    expect(tex).not.toContain("\\CJKBreak");
    expect(tex).not.toContain("cvForgeFontspecStub");
    expect(tex).not.toContain("cvForgeXeCJKStub");
    expect(tex).toContain("\\begin{chineseCV}");
    expect(tex).toContain("\\begin{japaneseCV}");
  });

  it("renders Chinese and Japanese sample text while escaping percentages", () => {
    const tex = renderLatex(createSampleWorkspace());

    expect(tex).toContain("毕业成绩位列本届前 3\\%。");
    expect(tex).toContain("合成指値注文板環境");
    expect(tex).toContain("18\\% 削減");
  });

  it("lays sections out as breakable lists that page-break between entries", () => {
    const entry = { title: "Company", location: "Remote", period: "2021", bullets: ["Built systems"] };
    const tex = renderLatex(
      workspaceWithDocument(
        documentWithBlocks([{ id: "role", type: "role", title: "Roles", entries: [entry, { ...entry, title: "Second" }] }])
      )
    );

    expect(tex).not.toContain("\\sectionBlock");
    expect(tex).toContain("\\begin{cvSection}{\\section{Roles}}");
    expect(tex).toContain("\\end{cvSection}");
    expect(tex.match(/\\begin\{cvEntry\}/g)).toHaveLength(2);
    expect(tex).toMatch(/\\end\{cvEntry\}\n\n\\cvEntryBreak\n\\begin\{cvEntry\}/);
    expect(tex).toContain("\\cvHeadingBox{\\begin{tabular}[t]{p{13.74cm}}");
  });

  it("lets only entries too long for one page break between their bullets", () => {
    const longBullets = Array.from({ length: 30 }, (_, i) => `Bullet ${i} `.repeat(14));
    const tex = renderLatex(
      workspaceWithDocument(
        documentWithBlocks([
          {
            id: "role",
            type: "role",
            title: "Roles",
            entries: [
              { title: "Short", location: "", period: "", bullets: ["One line"] },
              { title: "Long", location: "", period: "", bullets: longBullets }
            ]
          }
        ])
      )
    );

    expect(tex.match(/\\begin\{cvEntry\}/g)).toHaveLength(1);
    expect(tex.match(/\\begin\{cvLongEntry\}/g)).toHaveLength(1);
  });

  it("keeps the first two and the last list items together when breaking lists", () => {
    const tex = renderLatex(
      workspaceWithDocument(
        documentWithBlocks([{ id: "papers", type: "numbered-list", title: "Papers", items: ["A", "B", "C", "D", "E"] }])
      )
    );

    expect(tex).toContain("\\item A\n\n\\item B\n\n\\cvEntryBreak\n\\item C\n\n\\cvEntryBreak\n\\item D\n\n\\item E");
  });

  it("forces a page break before sections marked to start on a new page", () => {
    const tex = renderLatex(
      workspaceWithDocument(
        documentWithBlocks([
          { id: "first", type: "free-text", title: "First", text: "One", pageBreakBefore: true },
          { id: "second", type: "free-text", title: "Second", text: "Two", pageBreakBefore: true }
        ])
      )
    );

    expect(tex.match(/\\cvSectionPageBreak\n/g)).toHaveLength(1);
    expect(tex).toContain("\\cvSectionPageBreak\n\\begin{cvSection}{\\section{Second}}");
  });

  it("keeps the page break option when normalizing stored documents", () => {
    const document = normalizeDocument({
      version: 2,
      header: {},
      blocks: [
        { id: "a", type: "free-text", title: "A", text: "x", pageBreakBefore: true },
        { id: "b", type: "free-text", title: "B", text: "y" }
      ]
    });

    expect(document?.blocks[0]?.pageBreakBefore).toBe(true);
    expect(document?.blocks[1]).not.toHaveProperty("pageBreakBefore");
  });
});
