// CVs that exercise every part of the LaTeX template, used by build-runtime-assets.mjs to find the TeX Live files a
// compile needs and to check that the trimmed package produces identical PDFs. Extend this when the template
// gains a feature these do not reach.
import { createEmptyBlock, createSampleWorkspace } from "../src/lib/document";
import { renderLatex } from "../src/lib/latex";
import type { CVBlockType, CVLanguageCode, CVWorkspace } from "../src/lib/types";

const BLOCK_TYPES: CVBlockType[] = [
  "credential",
  "role",
  "project",
  "numbered-list",
  "dated-list",
  "label-value-list",
  "grouped-list",
  "free-text"
];

/** Inline markup, every LaTeX special character, typographic and accented characters, and CJK text. */
const STRESS_TEXT =
  "**Bold** _italic_ `code_x` A&B 50% $5 #1 {x} ~ ^ \\ é ü ß ñ — – “quoted” ‘s’ … € £ © ° ± × → • 李明 東京大学 カタカナ";

function fillStrings<T>(value: T): T {
  if (typeof value === "string") return STRESS_TEXT as T;
  if (Array.isArray(value)) return value.map(fillStrings) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, key === "id" || key === "type" ? item : fillStrings(item)])
    ) as T;
  }
  return value;
}

function withLanguages(codes: CVLanguageCode[]): CVWorkspace {
  const workspace = createSampleWorkspace();
  workspace.languages.forEach((language) => (language.enabled = codes.includes(language.code)));
  return workspace;
}

function stressWorkspace(): CVWorkspace {
  const workspace = withLanguages(["en", "zh", "ja"]);
  for (const language of workspace.languages) {
    language.document.header.name = "Maximilian Alexander Wolfeschlegelsteinhausen-Bergerdorff";
    language.document.header.contacts.push(STRESS_TEXT);
    BLOCK_TYPES.forEach((type, index) => {
      const block = fillStrings(createEmptyBlock(type));
      block.title = `Stress ${type}`;
      block.pageBreakBefore = index === 3;
      language.document.blocks.push(block);
    });
  }
  return workspace;
}

export function coverageCvs(): Record<string, string> {
  return {
    en: renderLatex(withLanguages(["en"])),
    zh: renderLatex(withLanguages(["zh"])),
    ja: renderLatex(withLanguages(["ja"])),
    all: renderLatex(withLanguages(["en", "zh", "ja"])),
    stress: renderLatex(stressWorkspace())
  };
}
