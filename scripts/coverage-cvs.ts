// CVs that exercise every part of every LaTeX template, used by build-runtime-assets.mjs to find the TeX Live files a
// compile needs and to check that the trimmed package produces identical PDFs. Extend this when the template
// gains a feature these do not reach.
import { createEmptyBlock, createSampleWorkspace } from "../src/lib/document";
import { renderLatex } from "../src/lib/latex";
import { TEMPLATES } from "../src/lib/templates";
import { DELIMITER_COMMANDS, MATH_COMMANDS, validateMath } from "../src/lib/markup";
import type { CVBlockType, CVLanguageCode, CVTemplateId, CVWorkspace } from "../src/lib/types";

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

/** A formula touching each math font: Sabon letters, digits and operator names, Computer Modern Greek, symbols and
 * large operators, AMS symbols, and the math alphabets. */
const STRESS_MATH =
  "$\\alpha_i^2 + \\log x \\le \\sum_{k=1}^{n} \\frac{a_k}{\\sqrt{b}} \\in \\mathbb{R} \\checkmark \\mathcal{O}(\\mathbf{v}) \\mathfrak{g} \\mathsf{s} \\mathtt{t}$";

/** Inline markup, every LaTeX special character, typographic and accented characters, CJK text, and a formula. */
const STRESS_TEXT =
  `**Bold** _italic_ \`code_x\` A&B 50% \\$5 #1 {x} ~ ^ \\\\ é ü ß ñ — – “quoted” ‘s’ … € £ © ° ± × → • 李明 東京大学 カタカナ ${STRESS_MATH}`;

/** Email and web contacts become \\href links; these include the characters escaped in a link target. */
const STRESS_LINKS = ["first.last+cv@example.co.uk", "https://example.com/a_b~c?q=50%&r=1#top", "github.com/ada_l"];

/** One use of a whitelisted math command (see `validateMath`). */
function mathSample(name: string, spec: { args: number; text?: boolean; optional?: boolean }): string {
  const command = `\\${name}`;
  if (name === "limits" || name === "nolimits") return `\\sum${command}_{i}^{n}`;
  if (name === "not") return `${command}=`;
  if (/^(big|Big|bigg|Bigg)[lr]?$/.test(name)) return `${command}( ${command}\\langle`;
  if (name === "sqrt") return `\\sqrt{x} \\sqrt[3]{x}`;
  if (spec.args === 0) return DELIMITER_COMMANDS.has(name) ? `\\left${command} x \\right${command}` : command;
  return command + (spec.text ? "{ab}" : "{x}").repeat(spec.args);
}

/** Every whitelisted math command, in text, script and scriptscript style, plus the escaped single-character
 * commands and delimiters. Fonts are loaded per size, so all three sizes are needed. */
function mathCoverageText(): string {
  const formulas = [...MATH_COMMANDS].map(([name, spec]) => mathSample(name, spec));
  // Punctuation and digits come from the math italic and roman fonts at each size, Greek too.
  formulas.push("10^{0.5}, x_{i,j}; \\alpha \\boldsymbol{\\alpha}");
  formulas.push("a\\,b\\;c\\:d\\!e\\ f \\{ \\} \\| \\$ \\% \\& \\# \\_", "\\left( x \\right) \\left/ x \\right/ \\left[ x \\right] \\left< x \\right> \\left. x \\right|");
  const lines: string[] = [];
  for (const formula of formulas) {
    const error = validateMath(formula);
    if (error) throw new Error(`coverage formula $${formula}$ is rejected by validateMath: ${error}`);
    lines.push(`$${formula}$ $x^{${formula}}$ $x^{x^{${formula}}}$`);
  }
  return lines.join("\n");
}

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
    language.document.header.name = `Maximilian Alexander Wolfeschlegelsteinhausen-Bergerdorff ${STRESS_MATH}`;
    language.document.header.contacts.push(...STRESS_LINKS, STRESS_TEXT);
    BLOCK_TYPES.forEach((type, index) => {
      const block = fillStrings(createEmptyBlock(type));
      block.title = `Stress ${type}`;
      block.pageBreakBefore = index === 3;
      language.document.blocks.push(block);
    });
    const math = createEmptyBlock("free-text");
    if (math.type === "free-text") math.text = mathCoverageText();
    math.title = "Stress math";
    language.document.blocks.push(math);
  }
  return workspace;
}

function withTemplate(workspace: CVWorkspace, template: CVTemplateId): CVWorkspace {
  workspace.template = template;
  return workspace;
}

/** Every coverage CV in every template, as `<template>-<cv>`. */
export function coverageCvs(): Record<string, string> {
  const cvs: Record<string, string> = {};
  for (const { id } of TEMPLATES) {
    cvs[`${id}-en`] = renderLatex(withTemplate(withLanguages(["en"]), id));
    cvs[`${id}-zh`] = renderLatex(withTemplate(withLanguages(["zh"]), id));
    cvs[`${id}-ja`] = renderLatex(withTemplate(withLanguages(["ja"]), id));
    cvs[`${id}-all`] = renderLatex(withTemplate(withLanguages(["en", "zh", "ja"]), id));
    cvs[`${id}-stress`] = renderLatex(withTemplate(stressWorkspace(), id));
  }
  return cvs;
}
