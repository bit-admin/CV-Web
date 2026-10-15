import { describe, expect, it } from "vitest";
import { createSampleWorkspace } from "./document";
import { analyzeLayout, locateSnippet, type PdfPageText, type PdfTextRun } from "./layoutAnalysis";

const PAGE = { width: 595.28, height: 841.89 };
const BODY_LEFT = 137.5;
const BODY_RIGHT = 530;

/** A text line `top` points below the page top. */
function line(top: number, text: string, left = BODY_LEFT, right = left + text.length * 4.5, fontSize = 10): PdfTextRun {
  return { text, x: left, y: PAGE.height - top, width: right - left, fontSize };
}

function page(runs: PdfTextRun[]): PdfPageText {
  return { ...PAGE, runs };
}

function filledLines(from: number, to: number): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  for (let top = from; top <= to; top += 24) {
    runs.push(line(top, "Body text", BODY_LEFT, BODY_RIGHT - 60));
  }
  return runs;
}

describe("layout analysis", () => {
  it("reports a page left blank because the next entry did not fit", () => {
    const issues = analyzeLayout([
      page([line(60, "Header", 51, 300, 30), ...filledLines(100, 300)]),
      page([line(40, "Robust Deep Hedging under Market Microstructure Noise"), ...filledLines(60, 700)])
    ]);

    const gap = issues.find((issue) => issue.kind === "page-gap");
    expect(gap?.page).toBe(1);
    expect(gap?.snippet).toBe("Robust Deep Hedging under Market Microstructure Noise");
    expect(gap?.rect?.height).toBeGreaterThan(0.4);
  });

  it("does not report a gap before a new language version starts", () => {
    const issues = analyzeLayout([
      page([line(60, "Header", 51, 300, 30), ...filledLines(100, 300)]),
      page([line(60, "小林春香", 51, 300, 30), ...filledLines(100, 700)])
    ]);

    expect(issues.filter((issue) => issue.kind === "page-gap")).toHaveLength(0);
  });

  it("reports an almost empty last page", () => {
    const issues = analyzeLayout([page(filledLines(40, 760)), page(filledLines(40, 64))]);

    expect(issues.map((issue) => issue.kind)).toContain("short-last-page");
  });

  it("reports a paragraph whose last line holds a single word", () => {
    const issues = analyzeLayout([
      page([
        ...filledLines(40, 760).slice(0, 5),
        line(400, "Developed a simulation framework for comparing classical delta", BODY_LEFT + 20, BODY_RIGHT),
        line(412, "hedging.", BODY_LEFT + 20),
        ...filledLines(500, 760)
      ])
    ]);

    const short = issues.find((issue) => issue.kind === "short-line");
    expect(short?.title).toContain("hedging.");
    expect(short?.snippet).toContain("classical delta hedging.");
  });

  it("explains a date that wrapped onto its own line", () => {
    const issues = analyzeLayout([
      page([
        ...filledLines(40, 300),
        line(400, "Rising Star in Quantitative Finance, North American Quantitative", BODY_LEFT + 10, BODY_RIGHT),
        line(412, "2025.03", BODY_LEFT + 10)
      ])
    ]);

    expect(issues.find((issue) => issue.kind === "short-line")?.title).toBe("Date “2025.03” wrapped onto its own line");
  });

  it("does not call a year ending a sentence a wrapped date", () => {
    const issues = analyzeLayout([
      page([
        ...filledLines(40, 300),
        line(400, "Mei Lin, Haruka Kobayashi, Anthony Lau. A Sparse Grid Approach to Multi-Asset", BODY_LEFT + 10, BODY_RIGHT),
        line(412, "2024.", BODY_LEFT + 10)
      ])
    ]);

    expect(issues.find((issue) => issue.kind === "short-line")?.title).toBe("Only “2024.” on the last line");
  });

  it("does not flag short lines that start a new paragraph", () => {
    const issues = analyzeLayout([
      page([
        ...filledLines(40, 300),
        line(400, "A full line of text that reaches the right margin of the body", BODY_LEFT + 20, BODY_RIGHT),
        line(412, "GPA 3.9", BODY_LEFT + 5)
      ])
    ]);

    expect(issues.filter((issue) => issue.kind === "short-line")).toHaveLength(0);
  });

  it("maps PDF text back to the section that contains it, ignoring markup and hyphenation", () => {
    const workspace = createSampleWorkspace();
    const target = locateSnippet(workspace, "Rising Star in Quantitative Finance, North American Quantitative Finance Associ-");

    expect(target?.language).toBe("en");
    expect(workspace.languages[0].document.blocks.find((block) => block.id === target?.blockId)?.type).toBe("dated-list");
  });
});
