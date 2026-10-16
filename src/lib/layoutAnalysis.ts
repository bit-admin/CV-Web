import { CLASSIC_LAYOUT } from "./templates/classic";
import type { TemplateLayout } from "./templates/shared";
import type { CVBlock, CVLanguageCode, CVWorkspace } from "./types";
import { markupToPlainText } from "./markup";

// Post-compile layout check. The compiled PDF's text positions are inspected
// to spot layout problems that are easy to fix in the editor: pages left
// partly blank because the next entry did not fit, a nearly empty last page,
// and paragraphs whose last line holds only a word or two.

const PT_PER_CM = 72 / 2.54;

/** One run of text as reported by pdf.js, in PDF points (origin bottom-left). */
export type PdfTextRun = {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
};

export type PdfPageText = {
  width: number;
  height: number;
  runs: PdfTextRun[];
};

/** Rectangle in page fractions (0-1, origin top-left) for drawing overlays. */
export type LayoutRect = { x: number; y: number; width: number; height: number };

export type LayoutIssueKind = "page-gap" | "short-last-page" | "short-line";

export type LayoutIssue = {
  id: string;
  kind: LayoutIssueKind;
  /** 1-based page number. */
  page: number;
  title: string;
  detail: string;
  /** Text used to find the section the issue belongs to. */
  snippet?: string;
  rect?: LayoutRect;
};

type Line = {
  y: number;
  left: number;
  right: number;
  fontSize: number;
  text: string;
};

const PAGE_GAP_MIN_FILL = 0.8;
const SHORT_LAST_PAGE_FILL = 0.25;
const FULL_LINE_RATIO = 0.85;
const SHORT_LINE_RATIO = 0.18;
const SHORT_LINE_MAX_CHARS = 14;
const HEADER_FONT_SIZE = 20;
// A date-column value such as "2025.03", "2019 - 2023" or "2023.09 - Present"
// (but not a year ending a sentence, like "2024.").
const DATE_ONLY = /^\d{4}([./]\d{1,2})?(\s*[-–—~～]\s*(\d{4}([./]\d{1,2})?|present|至今|现在|現在))?$/i;

function geometry(page: PdfPageText, layout: TemplateLayout) {
  const top = layout.topCm * PT_PER_CM;
  const bottom = page.height - layout.bottomCm * PT_PER_CM;
  const bodyLeft = layout.bodyLeftCm * PT_PER_CM;
  const bodyRight = (layout.pageWidthCm - layout.rightCm) * PT_PER_CM;
  return { top, bottom, bodyLeft, bodyRight, bodyWidth: bodyRight - bodyLeft };
}

/** Groups text runs into visual lines (top to bottom), measured from the page top. */
function linesOf(page: PdfPageText, minX: number, maxY: number): Line[] {
  const runs = page.runs
    .filter((run) => run.text.trim().length > 0 && run.x >= minX)
    .map((run) => ({ ...run, top: page.height - run.y }))
    .filter((run) => run.top <= maxY)
    .sort((a, b) => a.top - b.top || a.x - b.x);

  const lines: Line[] = [];
  for (const run of runs) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - run.top) < Math.max(2, run.fontSize * 0.3)) {
      // Runs that touch belong to the same word; a visible gap is a space.
      const spaced = run.x - line.right > run.fontSize * 0.15;
      line.text = `${line.text}${spaced ? " " : ""}${run.text}`;
      line.left = Math.min(line.left, run.x);
      line.right = Math.max(line.right, run.x + run.width);
      line.fontSize = Math.max(line.fontSize, run.fontSize);
    } else {
      lines.push({ y: run.top, left: run.x, right: run.x + run.width, fontSize: run.fontSize, text: run.text });
    }
  }
  return lines.map((line) => ({ ...line, text: line.text.replace(/\s+/g, " ").trim() }));
}

function isHeaderPage(page: PdfPageText): boolean {
  return page.runs.some((run) => run.fontSize >= HEADER_FONT_SIZE && run.text.trim().length > 0);
}

function linesToSave(gap: number, lineHeight: number): number {
  return Math.max(1, Math.round(gap / lineHeight));
}

function truncate(value: string, length = 48): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

/** Layout issues of a PDF typeset with a template of the given geometry. */
export function analyzeLayout(pages: PdfPageText[], layout: TemplateLayout = CLASSIC_LAYOUT): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  pages.forEach((page, index) => {
    const pageNumber = index + 1;
    const { top, bottom, bodyLeft, bodyRight, bodyWidth } = geometry(page, layout);
    const textHeight = bottom - top;
    // Everything inside the text area (page numbers sit below it).
    const allLines = linesOf(page, 0, bottom);
    const bodyLines = linesOf(page, bodyLeft - 8, bottom);
    if (allLines.length === 0) {
      return;
    }

    const lineHeight = Math.max(10, (allLines.find((line) => line.fontSize < HEADER_FONT_SIZE)?.fontSize ?? 10) * 1.2);
    const lastLine = allLines[allLines.length - 1];
    const usedBottom = lastLine.y + lastLine.fontSize * 0.3;
    const fill = Math.min(1, Math.max(0, (usedBottom - top) / textHeight));
    const next = pages[index + 1];
    const endsDocument = !next || isHeaderPage(next);
    const gapRect: LayoutRect = {
      x: layout.leftCm * PT_PER_CM / page.width,
      y: usedBottom / page.height,
      width: (bodyRight - layout.leftCm * PT_PER_CM) / page.width,
      height: Math.max(0, bottom - usedBottom) / page.height
    };

    if (!endsDocument && fill < PAGE_GAP_MIN_FILL) {
      const nextLines = linesOf(next, geometry(next, layout).bodyLeft - 8, geometry(next, layout).bottom);
      const nextEntry = nextLines[0]?.text ?? "";
      const free = linesToSave(bottom - usedBottom, lineHeight);
      issues.push({
        id: `gap-${pageNumber}`,
        kind: "page-gap",
        page: pageNumber,
        title: `Page ${pageNumber} is ${Math.round((1 - fill) * 100)}% empty at the bottom`,
        detail: nextEntry
          ? `The next entry (“${truncate(nextEntry)}”) did not fit in the ~${free} free lines and moved to page ${pageNumber + 1}. Shorten that entry or the content above it, reorder sections, or use “Start on new page” on a section.`
          : `About ${free} lines are free before page ${pageNumber + 1}.`,
        snippet: nextEntry || undefined,
        rect: gapRect
      });
    }

    if (endsDocument && index > 0 && !isHeaderPage(page) && fill < SHORT_LAST_PAGE_FILL) {
      const used = linesToSave(usedBottom - top, lineHeight);
      issues.push({
        id: `short-${pageNumber}`,
        kind: "short-last-page",
        page: pageNumber,
        title: `Last page holds only ~${used} line${used === 1 ? "" : "s"}`,
        detail: `Trimming about ${used} line${used === 1 ? "" : "s"} elsewhere (see short lines below) would remove page ${pageNumber}.`,
        snippet: allLines[0]?.text,
        rect: gapRect
      });
    }

    // Short last lines: a nearly full line followed by a continuation line
    // holding only a word or two.
    for (let i = 1; i < bodyLines.length; i += 1) {
      const previous = bodyLines[i - 1];
      const line = bodyLines[i];
      const sameParagraph = line.y - previous.y < previous.fontSize * 1.6;
      const continuation = line.left >= previous.left - 1 && line.left - previous.left < 30;
      const previousFull = previous.right >= bodyLeft + bodyWidth * FULL_LINE_RATIO;
      const shortLine = line.right - line.left < bodyWidth * SHORT_LINE_RATIO && line.text.length <= SHORT_LINE_MAX_CHARS;
      const nextLine = bodyLines[i + 1];
      const lastOfParagraph = !nextLine || nextLine.left < line.left - 1 || nextLine.y - line.y >= line.fontSize * 1.6;

      if (sameParagraph && continuation && previousFull && shortLine && lastOfParagraph) {
        issues.push({
          id: `line-${pageNumber}-${i}`,
          kind: "short-line",
          page: pageNumber,
          ...(DATE_ONLY.test(line.text)
            ? {
                title: `Date “${line.text}” wrapped onto its own line`,
                detail: "Shorten the text before it by a few words so the date fits on the line above."
              }
            : {
                title: `Only “${truncate(line.text, 24)}” on the last line`,
                detail: `Cut about ${line.text.length + 1} characters from this paragraph to pull it up and save a line.`
              }),
          snippet: `${previous.text} ${line.text}`,
          rect: {
            x: (line.left - 2) / page.width,
            y: (line.y - line.fontSize) / page.height,
            width: (line.right - line.left + 4) / page.width,
            height: (line.fontSize * 1.3) / page.height
          }
        });
      }
    }
  });

  return issues;
}

// ── Mapping issues back to the editor ──────────────────────

export type LayoutTarget = { language: CVLanguageCode; blockId: string };

function letters(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function blockText(block: CVBlock): string {
  switch (block.type) {
    case "credential":
      return block.entries.map((e) => [e.title, e.location, e.subtitle, e.period, ...e.bullets].join(" ")).join(" ");
    case "role":
      return block.entries.map((e) => [e.title, e.location, e.period, ...e.bullets].join(" ")).join(" ");
    case "project":
      return block.entries.map((e) => [e.title, e.organization, e.period, ...e.bullets].join(" ")).join(" ");
    case "numbered-list":
      return block.items.join(" ");
    case "dated-list":
      return block.items.map((item) => `${item.text} ${item.date}`).join(" ");
    case "label-value-list":
      return block.items.map((item) => `${item.label} ${item.value} ${(item.codeItems ?? []).join(" ")}`).join(" ");
    case "grouped-list":
      return block.groups.map((group) => `${group.label} ${group.items.join(" ")}`).join(" ");
    case "free-text":
      return block.text;
  }
}

/** Finds the enabled section whose text contains the snippet (ignoring spacing, punctuation and hyphenation). */
export function locateSnippet(workspace: CVWorkspace, snippet: string): LayoutTarget | null {
  const needle = letters(snippet);
  if (needle.length < 4) {
    return null;
  }

  // Try the full snippet first, then its tail and head (a line can span two bullets).
  const candidates = [needle, needle.slice(-24), needle.slice(0, 24)].filter((value) => value.length >= 4);
  for (const candidate of candidates) {
    for (const language of workspace.languages) {
      if (!language.enabled) {
        continue;
      }
      for (const block of language.document.blocks) {
        if (!block.hidden && letters(`${block.title} ${markupToPlainText(blockText(block))}`).includes(candidate)) {
          return { language: language.code, blockId: block.id };
        }
      }
    }
  }
  return null;
}
