// LaTeX helpers shared by every template: escaping and inline markup, contact links, the font setup (Latin, math,
// Chinese and Japanese families) and the hyperref setup.
import type {
  CVBlock,
  CVLanguageCode,
  CVLanguageDocument,
  CVWorkspace,
  CredentialEntry,
  ProjectBlockEntry,
  RoleEntry
} from "../types";
import { indexOutsideAtoms, parseMarkup, type MarkupNode } from "../markup";

export const LANGUAGE_RENDER_ORDER: CVLanguageCode[] = ["en", "zh", "ja"];

/** CJK font sets the template loads; each is tens of megabytes, so only the ones a workspace needs are declared and fetched. */
export type CJKFontGroup = "zh" | "ja";

const CJK_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u;

/**
 * The Chinese fonts are the CJK main font, so they are needed for a Chinese CV and for any CJK text in an
 * English one; the Japanese environment selects its own families.
 */
export function cjkFontGroups(workspace: CVWorkspace): Record<CJKFontGroup, boolean> {
  const enabled = (code: CVLanguageCode) => workspace.languages.find((language) => language.code === code && language.enabled);
  const english = enabled("en");
  return {
    zh: Boolean(enabled("zh")) || (english !== undefined && CJK_TEXT.test(JSON.stringify(english.document))),
    ja: Boolean(enabled("ja"))
  };
}

const LATEX_SPECIALS: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "$": "\\$",
  "&": "\\&",
  "#": "\\#",
  "%": "\\%",
  "_": "\\_",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}"
};

export function escapeLatex(value: string): string {
  return value.replace(/[\\{}$&#%_~^]/g, (char) => LATEX_SPECIALS[char] ?? char);
}

function renderMarkup(nodes: MarkupNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return escapeLatex(node.text);
        case "bold":
          return `\\textbf{${renderMarkup(node.children)}}`;
        case "italic":
          return `\\textit{${renderMarkup(node.children)}}`;
        case "code":
          return `{\\MonoSmallFont ${escapeLatex(node.text)}}`;
        case "math":
          // A formula that would not compile is shown as typed instead of failing the whole CV.
          return node.error ? escapeLatex(`$${node.source}$`) : `$${node.source}$`;
      }
    })
    .join("");
}

/** Converts a field's inline markup (see `markup.ts`) to LaTeX. */
export function inlineLatex(value: string): string {
  return renderMarkup(parseMarkup(value));
}

export function hasText(value: string): boolean {
  return value.trim().length > 0;
}

export function cleanItems(items: string[]): string[] {
  return items.filter(hasText);
}

export function finalPunctuation(language: CVLanguageCode): string {
  return language === "en" ? "." : "。";
}

export function terminalPunctuation(value: string, language: CVLanguageCode): string {
  return /[.!?。！？]$/.test(value.trim()) ? "" : finalPunctuation(language);
}

export function splitDatedText(value: string, language: CVLanguageCode): { title: string; detail: string } {
  const separators = language === "en" ? [",", "，"] : ["，", ","];

  for (const separator of separators) {
    const index = indexOutsideAtoms(value, separator);

    if (index > 0) {
      const detail = value.slice(index + separator.length).trimStart();
      const joiner = separator === "," ? ", " : separator;

      return {
        title: value.slice(0, index),
        detail: detail.length ? `${joiner}${detail}` : ""
      };
    }
  }

  return { title: value, detail: "" };
}

export function credentialEntryHasContent(entry: CredentialEntry): boolean {
  return [entry.title, entry.location, entry.subtitle, entry.period, ...entry.bullets].some(hasText);
}

export function roleEntryHasContent(entry: RoleEntry): boolean {
  return [entry.title, entry.location, entry.period, ...entry.bullets].some(hasText);
}

export function projectEntryHasContent(entry: ProjectBlockEntry): boolean {
  return [entry.title, entry.organization, entry.period, ...entry.bullets].some(hasText);
}

export function blockHasContent(block: CVBlock): boolean {
  switch (block.type) {
    case "credential":
      return block.entries.some(credentialEntryHasContent);
    case "role":
      return block.entries.some(roleEntryHasContent);
    case "project":
      return block.entries.some(projectEntryHasContent);
    case "numbered-list":
      return cleanItems(block.items).length > 0;
    case "dated-list":
      return block.items.some((item) => hasText(item.text) || hasText(item.date));
    case "label-value-list":
      return block.items.some((item) => hasText(item.label) || hasText(item.value) || cleanItems(item.codeItems ?? []).length > 0);
    case "grouped-list":
      return block.groups.some((group) => cleanItems(group.items).length > 0);
    case "free-text":
      return hasText(block.text);
  }
}

/** Blocks that produce a section: shown, titled and with some content. */
export function visibleBlocks(blocks: CVBlock[]): CVBlock[] {
  return blocks.filter((block) => !block.hidden && hasText(block.title) && blockHasContent(block));
}

/** The enabled languages, in the order the CVs appear in the PDF. */
export function enabledLanguages(workspace: CVWorkspace): CVLanguageDocument[] {
  return LANGUAGE_RENDER_ORDER.map((code) =>
    workspace.languages.find((language) => language.code === code && language.enabled)
  ).filter((language): language is CVLanguageDocument => language !== undefined);
}

const EMAIL = /^[^\s@\\{}]+@[^\s@\\{}]+\.[^\s@\\{}]+$/;
const URL_WITH_SCHEME = /^https?:\/\/[^\s\\{}]+$/i;
// A bare web address such as "github.com/ada" or "www.example.org".
const BARE_URL = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s\\{}]*)?$/i;

/** The link target of a contact that is an email address or a web address, or null for anything else. */
export function contactLink(contact: string): string | null {
  const value = contact.trim();
  if (EMAIL.test(value)) return `mailto:${value}`;
  if (URL_WITH_SCHEME.test(value)) return value;
  if (BARE_URL.test(value)) return `https://${value}`;
  return null;
}

/** An email or web contact is shown as typed (no inline markup, so `_` in a URL stays literal) and links to itself. */
export function contactText(contact: string): string {
  return contactLink(contact) === null ? inlineLatex(contact) : escapeLatex(contact.trim());
}

export function renderContact(contact: string): string {
  const link = contactLink(contact);
  const text = contactText(contact);
  // In \href's target, % and # must be escaped, and & too inside a table cell (Timeline's personal data).
  return link === null ? text : `\\href{${link.replace(/[%#&]/g, (char) => `\\${char}`)}}{${text}}`;
}

/** Chinese fonts (~50 MB), also used for CJK text in an English CV. */
const ZH_FONT_SETUP = String.raw`\setCJKmainfont{Simsun.ttc}[
  Path=./Fonts/Simsun/,
  BoldFont=SimHei.ttf,
  BoldFeatures={Path=./Fonts/SimHei/},
  ItalicFont=Kaiti.ttf,
  ItalicFeatures={Path=./Fonts/Kaiti/},
  BoldItalicFont=SimHei.ttf,
  BoldItalicFeatures={Path=./Fonts/SimHei/}
]

\setCJKsansfont{SimHei.ttf}[
  Path=./Fonts/SimHei/
]

\setCJKmonofont{Fangsong.ttf}[
  Path=./Fonts/Fangsong/
]

\setCJKfamilyfont{zhsong}{Simsun.ttc}[
  Path=./Fonts/Simsun/,
  BoldFont=SimHei.ttf,
  BoldFeatures={Path=./Fonts/SimHei/},
  ItalicFont=Kaiti.ttf,
  ItalicFeatures={Path=./Fonts/Kaiti/},
  BoldItalicFont=SimHei.ttf,
  BoldItalicFeatures={Path=./Fonts/SimHei/}
]

\setCJKfamilyfont{zhhei}{SimHei.ttf}[
  Path=./Fonts/SimHei/
]

\setCJKfamilyfont{zhkai}{Kaiti.ttf}[
  Path=./Fonts/Kaiti/
]

\setCJKfamilyfont{zhtitle}{Simsun.ttc}[
  Path=./Fonts/Simsun/,
  FakeBold=2.8
]

\setCJKfamilyfont{zhfangsong}{Fangsong.ttf}[
  Path=./Fonts/Fangsong/,
  BoldFont=SimHei.ttf,
  BoldFeatures={Path=./Fonts/SimHei/},
  ItalicFont=Kaiti.ttf,
  ItalicFeatures={Path=./Fonts/Kaiti/}
]

`;

/** Japanese fonts (~68 MB). */
const JA_FONT_SETUP = String.raw`\setCJKfamilyfont{jpmincho}{yumin.ttf}[
  Path=./Fonts/YuMincho/,
  BoldFont=YuGothB.ttc,
  BoldFeatures={Path=./Fonts/YuGothic/},
  ItalicFont=yuminl.ttf,
  ItalicFeatures={Path=./Fonts/YuMincho/},
  BoldItalicFont=YuGothB.ttc,
  BoldItalicFeatures={Path=./Fonts/YuGothic/}
]

\setCJKfamilyfont{jpgothic}{YuGothB.ttc}[
  Path=./Fonts/YuGothic/
]

\setCJKfamilyfont{jptitle}{yumindb.ttf}[
  Path=./Fonts/YuMincho/
]

\setCJKfamilyfont{jpmono}{YuGothM.ttc}[
  Path=./Fonts/YuGothic/
]

`;

/**
 * Latin fonts (Sabon body, Calluna, Courier, Cronos), the math font setup and, for the CJK groups the workspace
 * needs, the Chinese and Japanese families. The \zh* and \jp* commands are always defined.
 */
export function fontSetup(fonts: Record<CJKFontGroup, boolean>): string {
  return String.raw`\setmainfont{SabonLTStd}[
  Path=./Fonts/Sabon/,
  Extension=.ttf,
  UprightFont=*-Regular,
  BoldFont=*-Bold,
  ItalicFont=*-Italic,
  BoldItalicFont=*-BoldItalic
]

\newfontfamily\Sabon{SabonLTStd}[
  Path=./Fonts/Sabon/,
  Extension=.ttf,
  UprightFont=*-Regular,
  BoldFont=*-Bold,
  ItalicFont=*-Italic,
  BoldItalicFont=*-BoldItalic
]

\newfontfamily\Calluna{Calluna}[
  Path=./Fonts/Calluna/,
  Extension=.otf,
  UprightFont=*-Regular
]

\newfontfamily\Courier{CourierNew}[
  Path=./Fonts/Courier/,
  Extension=.ttf,
  UprightFont=*-Regular
]

\setmonofont{CourierNew}[
  Path=./Fonts/Courier/,
  Extension=.ttf,
  UprightFont=*-Regular
]

\newfontfamily\CronosLt{CronosProLT}[
  Path=./Fonts/Cronos/,
  Extension=.ttf,
  UprightFont=*-Regular
]

\setsansfont{CronosProLT}[
  Path=./Fonts/Cronos/,
  Extension=.ttf,
  UprightFont=*-Regular
]

% Formulas set Latin letters, digits and operator names (\log, \max) in Sabon
% to match the text; Greek, symbols and large operators stay Computer Modern.
\DeclareSymbolFont{cvMathRoman}{TU}{\rmdefault}{m}{n}
\DeclareSymbolFont{cvMathItalic}{TU}{\rmdefault}{m}{it}
\DeclareSymbolFontAlphabet{\mathrm}{cvMathRoman}
\DeclareMathAlphabet{\mathit}{TU}{\rmdefault}{m}{it}
\DeclareMathAlphabet{\mathbf}{TU}{\rmdefault}{b}{n}
\makeatletter
\renewcommand{\operator@font}{\mathgroup\symcvMathRoman}
\def\cvMathCodes#1#2#3{%
  \@tempcnta=#1\relax
  \loop
    \Umathcode\@tempcnta=7 #3 \@tempcnta
  \ifnum\@tempcnta<#2\relax \advance\@tempcnta 1 \repeat}
% After fontspec and ctex, which set their own math codes at \begin{document}.
\AtBeginDocument{%
  \cvMathCodes{"61}{"7A}{\symcvMathItalic}% a-z
  \cvMathCodes{"41}{"5A}{\symcvMathItalic}% A-Z
  \cvMathCodes{"30}{"39}{\symcvMathRoman}}% 0-9
\makeatother

${fonts.zh ? ZH_FONT_SETUP : ""}\newcommand{\zhSong}{\CJKfamily{zhsong}}
\newcommand{\zhHei}{\CJKfamily{zhhei}}
\newcommand{\zhKai}{\CJKfamily{zhkai}}
\newcommand{\zhTitle}{\CJKfamily{zhtitle}}
\newcommand{\zhFangsong}{\CJKfamily{zhfangsong}}

${fonts.ja ? JA_FONT_SETUP : ""}\newcommand{\jpMincho}{\CJKfamily{jpmincho}}
\newcommand{\jpGothic}{\CJKfamily{jpgothic}}
\newcommand{\jpTitle}{\CJKfamily{jptitle}}
\newcommand{\jpMono}{\CJKfamily{jpmono}}

`;
}

/** Email and web contacts become links (see `renderContact`); loaded last, as hyperref recommends. */
export const HYPERREF_SETUP = String.raw`% Email and web contacts are links, shown in black without a box.
% implicit=false: no anchors for sections, which would push each section
% title down a line in its label box.
\usepackage[implicit=false]{hyperref}
\hypersetup{hidelinks, breaklinks}`;

/** The comment that opens every generated file; keeps the yuan-resume attribution. */
export const LATEX_FILE_HEADER = String.raw`%-------------------------------------
% Generated by CV Forge. Edit the structured fields in the app and export again.
%
% Based on yuan-resume by HF Yuan
% https://github.com/xyz-yuanhf/yuan-resume
% Original license: MIT
%
% Substantial modifications and multilingual support by Haruka Kobayashi
% Copyright (c) 2026 bit-admin
% Licensed under MIT
%------------------------------------`;

/** Page geometry a template reports to the layout check and the preview sync, in cm. */
export type TemplateLayout = {
  pageWidthCm: number;
  pageHeightCm: number;
  topCm: number;
  bottomCm: number;
  leftCm: number;
  rightCm: number;
  /** Left edge of the text that fills the page (entries and list items); dates and side titles sit left of it. */
  bodyLeftCm: number;
  /** Section titles start left of this edge. */
  headingEndCm: number;
  /** Section titles are set at least this large (pt); 0 when their column alone identifies them. */
  headingMinFontSize: number;
};
