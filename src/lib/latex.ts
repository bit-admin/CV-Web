import type {
  CVBlock,
  CVDocument,
  CVLanguageCode,
  CVLanguageDocument,
  CVWorkspace,
  CredentialEntry,
  DatedListItem,
  GroupedListItem,
  LabelValueItem,
  ProjectBlockEntry,
  RoleEntry
} from "./types";
import { indexOutsideAtoms, parseMarkup, type MarkupNode } from "./markup";

const LANGUAGE_RENDER_ORDER: CVLanguageCode[] = ["en", "zh", "ja"];

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

/** Page geometry of the template, shared with the PDF layout analysis. */
export const PAGE_LAYOUT = {
  pageWidthCm: 21,
  pageHeightCm: 29.7,
  topCm: 1.2,
  bottomCm: 2.6,
  leftCm: 1.8,
  rightCm: 2.3,
  sectionLabelCm: 2.7,
  sectionBodyCm: 13.85
} as const;

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

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function sectionTitle(value: string): string {
  return value
    .split(/\r?\n| \/ /)
    .map((line) => escapeLatex(line))
    .join("\\\\");
}

function cleanItems(items: string[]): string[] {
  return items.filter(hasText);
}

function finalPunctuation(language: CVLanguageCode): string {
  return language === "en" ? "." : "。";
}

function terminalPunctuation(value: string, language: CVLanguageCode): string {
  return /[.!?。！？]$/.test(value.trim()) ? "" : finalPunctuation(language);
}

function itemList(items: string[]): string {
  const visibleItems = cleanItems(items);
  if (visibleItems.length === 0) {
    return "";
  }

  return [
    "\\itemListStart",
    ...visibleItems.map((item) => `  \\myItem{${inlineLatex(item)}}`),
    "\\itemListEnd"
  ].join("\n");
}

function sectionBlock(title: string, content: string, pageBreakBefore = false): string {
  const section = `\\begin{cvSection}{\\section{${sectionTitle(title)}}}\n${content}\n\\end{cvSection}`;
  return pageBreakBefore ? `\\cvSectionPageBreak\n${section}` : section;
}

// Entries (and list items) are separated by a preferred page break, so a
// section that does not fit continues on the next page at an entry boundary.
const ENTRY_SEPARATOR = "\n\n\\cvEntryBreak\n";

// Rough line count above which an entry may not fit on one page; such an
// entry is allowed to break between its bullets instead of overflowing.
const LONG_ENTRY_LINES = 45;
const CHARS_PER_LINE = 90;

function estimatedLines(texts: string[]): number {
  return texts.reduce((total, text) => {
    // CJK characters are about twice as wide as Latin ones.
    const width = [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 0x2e7f ? 2 : 1), 0);
    return total + Math.max(1, Math.ceil(width / CHARS_PER_LINE));
  }, 0);
}

function entryBlock(content: string, headingLines: number, bullets: string[]): string {
  const environment = headingLines + estimatedLines(cleanItems(bullets)) > LONG_ENTRY_LINES ? "cvLongEntry" : "cvEntry";
  return `\\begin{${environment}}\n${content}\n\\end{${environment}}`;
}

// The first two items stay with the section title and the last item is never
// left alone at the top of a new page.
function breakableItems(items: string[], separator = "\n\n"): string {
  return items
    .map((item, index) => (index < 2 || index === items.length - 1 ? item : `\\cvEntryBreak\n${item}`))
    .join(separator);
}

function renderCredentialEntry(entry: CredentialEntry): string {
  return entryBlock([
    "\\eduHeading",
    `  {${inlineLatex(entry.title)}}{${inlineLatex(entry.location)}}`,
    `  {${inlineLatex(entry.subtitle)}}{${inlineLatex(entry.period)}}`,
    itemList(entry.bullets)
  ].join("\n"), 2, entry.bullets);
}

function renderRoleEntry(entry: RoleEntry): string {
  return entryBlock([
    "\\internHeading",
    `  {${inlineLatex(entry.title)}}{${inlineLatex(entry.location)}}{${inlineLatex(entry.period)}}`,
    itemList(entry.bullets)
  ].join("\n"), 1, entry.bullets);
}

function renderProjectEntry(entry: ProjectBlockEntry): string {
  return entryBlock([
    "\\projHeading",
    `{${inlineLatex(entry.title)}}`,
    `{${inlineLatex(entry.organization)}}`,
    `{${inlineLatex(entry.period)}}`,
    itemList(entry.bullets)
  ].join("\n"), 2, entry.bullets);
}

function renderNumberedList(items: string[]): string {
  const visibleItems = cleanItems(items);
  return [
    "\\pubListStart",
    "\\justifying",
    "\\cvKeepItems",
    breakableItems(visibleItems.map((item) => `\\item ${inlineLatex(item)}`)),
    "\\pubListEnd"
  ].filter(Boolean).join("\n");
}

function splitDatedText(value: string, language: CVLanguageCode): { title: string; detail: string } {
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

function renderDatedList(items: DatedListItem[], language: CVLanguageCode): string {
  const visibleItems = items.filter((item) => hasText(item.text) || hasText(item.date));
  return [
    "\\awardListStart",
    "\\justifying",
    "\\cvKeepItems",
    breakableItems(
      visibleItems.map((item) => {
        const { title, detail } = splitDatedText(item.text, language);
        return `\\item \\emph{${inlineLatex(title)}}${inlineLatex(detail)} \\hfill ${inlineLatex(item.date)}`;
      })
    ),
    "\\awardListEnd"
  ].filter(Boolean).join("\n");
}

function renderLabelValueList(items: LabelValueItem[], language: CVLanguageCode): string {
  const visibleItems = items.filter((item) => hasText(item.label) || hasText(item.value) || cleanItems(item.codeItems ?? []).length > 0);
  return [
    "\\skillListStart",
    "\\justifying",
    "\\cvKeepItems",
    breakableItems(
      visibleItems.map((item) => {
        const codeItems = cleanItems(item.codeItems ?? []);
        const value = codeItems.length
          ? codeItems.map((code) => `{\\MonoSmallFont ${escapeLatex(code)}}`).join(", ")
          : inlineLatex(item.value);
        const rawValue = codeItems.length ? codeItems.join(", ") : item.value;

        return `\\item \\emph{${inlineLatex(item.label)}}: ${value}${terminalPunctuation(rawValue, language)}`;
      })
    ),
    "\\skillListEnd"
  ].filter(Boolean).join("\n");
}

function renderFreeText(text: string): string {
  return [
    "\\skillListStart",
    "\\justifying",
    "\\cvKeepItems",
    `\\item ${inlineLatex(text)}`,
    "\\skillListEnd"
  ].join("\n");
}

function renderGroupedList(groups: GroupedListItem[], language: CVLanguageCode): string {
  const groupLines: string[] = [];

  for (const group of groups) {
    const hasLabel = hasText(group.label);
    const items = cleanItems(group.items);

    if (items.length === 0) {
      continue;
    }

    const lines: string[] = [];
    if (hasLabel) {
      const label = inlineLatex(group.label);
      for (let i = 0; i < items.length; i++) {
        const sep = i < items.length - 1 ? "," : finalPunctuation(language);
        if (i === 0) {
          lines.push(`\\item \\emph{${label}}: ${inlineLatex(items[i])}${sep}`);
        } else {
          lines.push(`\\item \\phantom{\\emph{${label}}:} ${inlineLatex(items[i])}${sep}`);
        }
      }
    } else {
      for (const item of items) {
        lines.push(`\\item ${inlineLatex(item)}`);
      }
    }
    // Lines of a labelled group stay together; unlabelled items may break.
    groupLines.push(hasLabel ? lines.join("\n") : breakableItems(lines, "\n"));
  }

  // Lines of a labelled group stay together; pages only break between groups.
  return ["\\skillListStart", "\\justifying", "\\cvKeepItems", breakableItems(groupLines, "\n"), "\\skillListEnd"].join("\n");
}

function credentialEntryHasContent(entry: CredentialEntry): boolean {
  return [entry.title, entry.location, entry.subtitle, entry.period, ...entry.bullets].some(hasText);
}

function roleEntryHasContent(entry: RoleEntry): boolean {
  return [entry.title, entry.location, entry.period, ...entry.bullets].some(hasText);
}

function projectEntryHasContent(entry: ProjectBlockEntry): boolean {
  return [entry.title, entry.organization, entry.period, ...entry.bullets].some(hasText);
}

function blockHasContent(block: CVBlock): boolean {
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

function renderBlockContent(block: CVBlock, language: CVLanguageCode): string {
  switch (block.type) {
    case "credential":
      return block.entries.filter(credentialEntryHasContent).map(renderCredentialEntry).join(ENTRY_SEPARATOR);
    case "role":
      return block.entries.filter(roleEntryHasContent).map(renderRoleEntry).join(ENTRY_SEPARATOR);
    case "project":
      return block.entries.filter(projectEntryHasContent).map(renderProjectEntry).join(ENTRY_SEPARATOR);
    case "numbered-list":
      return renderNumberedList(block.items);
    case "dated-list":
      return renderDatedList(block.items, language);
    case "label-value-list":
      return renderLabelValueList(block.items, language);
    case "grouped-list":
      return renderGroupedList(block.groups, language);
    case "free-text":
      return renderFreeText(block.text);
  }
}

function renderBlocks(blocks: CVBlock[], language: CVLanguageCode): string {
  return blocks
    .filter((block) => !block.hidden && hasText(block.title) && blockHasContent(block))
    .map((block, index) => sectionBlock(block.title, renderBlockContent(block, language), index > 0 && block.pageBreakBefore === true))
    .join("\n\n");
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

function renderFixedStylePreamble(fonts: Record<CJKFontGroup, boolean>): string {
  return String.raw`\documentclass[a4paper, 10pt]{article}

\usepackage[top=${PAGE_LAYOUT.topCm}cm, bottom=${PAGE_LAYOUT.bottomCm}cm, left=${PAGE_LAYOUT.leftCm}cm, right=${PAGE_LAYOUT.rightCm}cm, marginparwidth=1.75cm]{geometry}
\usepackage{xcolor}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{fontspec}
\PassOptionsToPackage{fontset=none}{ctex}
\usepackage[scheme=plain]{ctex}
\usepackage{setspace}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{tabularx}
\usepackage{ragged2e}

\setmainfont{SabonLTStd}[
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

\newcommand{\BodyFont}{\Sabon}
% Name and suffix sizes; \cvHeaderName reduces them for a name too wide to
% fit beside the contacts.
\newlength{\cvNameSize}
\setlength{\cvNameSize}{30pt}
\newlength{\cvSuffixSize}
\setlength{\cvSuffixSize}{14.5pt}
\newcommand{\NameFont}{\Calluna\fontsize{\cvNameSize}{\cvNameSize}\selectfont\scshape}
\newcommand{\SuffixFont}{\Calluna\fontsize{\cvSuffixSize}{\cvSuffixSize}\selectfont\scshape}
\newcommand{\ContactFont}{\Calluna}
\newcommand{\SectionTitleFont}{\CronosLt\scshape\fontsize{14.5pt}{14.5pt}\selectfont}
\newcommand{\MonoSmallFont}{\Courier\fontsize{11pt}{11pt}\selectfont}
\newcommand{\ZhNameFont}{\zhTitle\fontsize{\cvNameSize}{\cvNameSize}\selectfont}
\newcommand{\ZhSectionTitleFont}{\CronosLt\scshape\zhFangsong\fontsize{14.5pt}{14.5pt}\selectfont}
\newcommand{\JpNameFont}{\jpTitle\fontsize{\cvNameSize}{\cvNameSize}\selectfont}
\newcommand{\JpSectionTitleFont}{\CronosLt\scshape\jpTitle\fontsize{14.5pt}{14.5pt}\selectfont}

\renewcommand{\emph}[1]{\textbf{\fontsize{11pt}{11pt}\selectfont #1}}

% ── Section layout ──────────────────────────────────────
% A section is a single-item list whose label (the section title) hangs in
% the left column. Unlike a pair of minipages, the body can break across
% pages, so a long section continues on the next page instead of leaving
% the rest of the current one blank.
\newlength{\SectionLabelWidth}
\setlength{\SectionLabelWidth}{${PAGE_LAYOUT.sectionLabelCm}cm}
\newlength{\SectionBodyWidth}
\setlength{\SectionBodyWidth}{${PAGE_LAYOUT.sectionBodyCm}cm}
\newlength{\SectionSkip}
\setlength{\SectionSkip}{25pt}

\makeatletter
% Page breaks are only allowed between entries (and between list items):
% an entry that does not fit moves to the next page as a whole, and TeX
% fills each page as far as possible, as it did with whole sections in the
% original template. \addpenalty puts the break before any space ending the
% previous entry, so that space is dropped at a page break.
\newcommand{\cvEntryBreak}{\par\addpenalty{-\@lowpenalty}}
\newcommand{\cvNoBreakVspace}[1]{%
  \ifvmode\nobreak\vskip#1\relax\else\vadjust{\nobreak\vskip#1\vskip\z@skip}\fi}

% Entry headings are 6pt wider than the column on the right (as in the
% original template) so their dates line up with the header rule; the box
% hides the intentional overhang from TeX's overfull-box warnings.
\newcommand{\cvHeadingBox}[1]{\makebox[\linewidth][l]{#1}}

% An entry never breaks across pages.
\newcommand{\cvNoBreaks}{%
  \interlinepenalty\@M
  \clubpenalty\@M
  \widowpenalty\@M
  \brokenpenalty\@M
  \@beginparpenalty\@M
  \@itempenalty\@M
  \@endparpenalty\@M}
\newenvironment{cvEntry}{\par\cvNoBreaks}{\par}

% An entry too long for one page may break between its bullets, but never
% between its heading and first bullet or leaving a single line behind.
\newenvironment{cvLongEntry}{%
  \par
  \@beginparpenalty\@M
  \clubpenalty\@M
  \widowpenalty\@M
}{\par}

% List spacing without its shrink component (otherwise identical to the
% article class), so TeX never squeezes a page to fit one more entry and
% the spacing is the same on every page.
\def\@listI{\leftmargin\leftmargini
  \parsep 4\p@ \@plus2\p@
  \topsep 8\p@ \@plus2\p@
  \itemsep4\p@ \@plus2\p@}
\let\@listi\@listI
\setlength{\partopsep}{2\p@ \@plus 1\p@}

% List defaults, restored inside section bodies so nested lists are laid
% out exactly as they were inside the original minipage.
\newlength{\cvDefaultLabelsep}
\setlength{\cvDefaultLabelsep}{\labelsep}
\newlength{\cvDefaultLabelwidth}
\setlength{\cvDefaultLabelwidth}{\labelwidth}
\newskip\cvDefaultPartopsep
\cvDefaultPartopsep\partopsep
\newskip\cvDefaultTopsep
\begingroup\@listi\global\cvDefaultTopsep\topsep\endgroup
% A list that opens a section shares the line with the section title, and
% LaTeX then omits the space after the list. Inside the original minipage
% that space was kept; add it back so the gap to the next section matches.
\newcommand{\cvSectionListEnd}{%
  \addpenalty\@endparpenalty
  \addvspace{\glueexpr\cvDefaultTopsep+\cvDefaultPartopsep\relax}%
  \vspace{-11pt}}

\newsavebox{\cvLabelBox}
\newdimen\cvSectionStart
\newcount\cvSectionPage
\newenvironment{cvSection}[1]{%
  \sbox{\cvLabelBox}{\begin{minipage}[t]{\SectionLabelWidth}\raggedright #1\end{minipage}}%
  \begin{list}{}{%
    % The original two-minipage line left one interword space on each side
    % of the body column; keep that geometry so line breaks are unchanged.
    \setlength{\rightmargin}{\fontdimen2\font}%
    \setlength{\leftmargin}{\dimexpr\textwidth-\SectionBodyWidth-\rightmargin\relax}%
    \setlength{\labelwidth}{\SectionLabelWidth}%
    \setlength{\labelsep}{\dimexpr\leftmargin-\SectionLabelWidth\relax}%
    \setlength{\itemindent}{\z@}%
    \setlength{\listparindent}{\z@}%
    \setlength{\topsep}{\z@}%
    \setlength{\partopsep}{\z@}%
    \setlength{\parsep}{\z@}%
    \setlength{\itemsep}{\z@}%
    \renewcommand{\makelabel}[1]{##1\hfil}}%
  % Nested lists behave as top-level lists, and lines are broken \sloppy,
  % as they were inside the original minipage.
  \@listdepth\z@
  \sloppy
  \raggedright
  \item[{\raisebox{\z@}[\ht\cvLabelBox][\z@]{\usebox{\cvLabelBox}}}]%
  \labelsep\cvDefaultLabelsep
  \labelwidth\cvDefaultLabelwidth
  \partopsep\cvDefaultPartopsep
  \cvSectionPage\c@page
  \cvSectionStart\dimexpr\pagetotal+\pagedepth\relax
}{%
  \par
  % Drop the space after the last list, as the end of a minipage did.
  \vskip-\lastskip\vskip\z@skip
  % Reserve room for a section title that is taller than its body.
  \ifnum\cvSectionPage=\c@page
    \@tempdima\dimexpr\ht\cvLabelBox+\dp\cvLabelBox-\pagetotal-\pagedepth+\cvSectionStart\relax
    \ifdim\@tempdima>\z@\nobreak\vskip\@tempdima\fi
  \fi
  \end{list}%
  \cvEntryBreak
  \vspace{\SectionSkip}%
}

% Inside a list section: pages only break at \cvEntryBreak, never inside
% or between other items.
\newcommand{\cvKeepItems}{%
  \@itempenalty\@M
  \interlinepenalty\@M
  \clubpenalty\@M
  \widowpenalty\@M}

% ── Header name ─────────────────────────────────────────
% The name line is raised by \cvHeaderOverlap to sit beside the last
% contact lines. If name and suffix are wider than the space left of the
% widest contact, both are scaled down; a strut keeps the full-size line
% height so the name's baseline and everything below stay where they were.
% A name that would need less than \cvNameMinSize keeps that size and moves
% below the contacts instead.
\newlength{\cvHeaderOverlap}
\setlength{\cvHeaderOverlap}{45pt}
\newlength{\cvContactWidth}
\newlength{\cvNameGap}
\setlength{\cvNameGap}{1em}
\newlength{\cvNameMinSize}
\setlength{\cvNameMinSize}{16pt}
\newsavebox{\cvNameBox}
\newsavebox{\cvNameLineBox}
\newcommand{\cvMeasureContact}[1]{%
  \settowidth{\@tempdima}{\ContactFont #1}%
  \ifdim\@tempdima>\cvContactWidth\global\cvContactWidth\@tempdima\fi}
\newcommand{\cvHeaderName}[3]{%
  \sbox{\cvNameLineBox}{{#1#2} \quad{\SuffixFont #3}}%
  \sbox{\cvNameBox}{{#1#2}{\SuffixFont #3}}%
  % Space available to the scalable part (name + suffix).
  \@tempdima\dimexpr\textwidth-\cvContactWidth-\cvNameGap-\wd\cvNameLineBox+\wd\cvNameBox\relax
  \@tempdimb\wd\cvNameBox
  \ifdim\@tempdimb>\@tempdima
    \setlength{\cvNameSize}{\dimexpr\cvNameSize*\@tempdima/\@tempdimb\relax}%
    \ifdim\cvNameSize<\cvNameMinSize
      \setlength{\cvNameSize}{\cvNameMinSize}%
      \vspace*{\cvHeaderOverlap}%
    \fi
    \setlength{\cvSuffixSize}{\dimexpr\cvNameSize*29/60\relax}%
  \fi
  \rule[-\dp\cvNameLineBox]{\z@}{\dimexpr\ht\cvNameLineBox+\dp\cvNameLineBox\relax}%
  {#1#2} \quad{\SuffixFont #3}}

% Explicit page break requested for a section ("Start on new page").
\newcommand{\cvSectionPageBreak}{\par\newpage}
\makeatother

\titleformat{\section}{
  \setstretch{1.0}
  \SectionTitleFont\raggedright
}{}{0em}{}

\newenvironment{englishCV}{%
  \BodyFont
  \renewcommand{\emph}[1]{\textbf{\fontsize{11pt}{11pt}\selectfont ##1}}
  \titleformat{\section}{
    \setstretch{1.0}
    \SectionTitleFont\raggedright
  }{}{0em}{}
}{}

\newenvironment{chineseCV}{%
  \begin{spacing}{1.3}
  \normalfont\zhSong
  \renewcommand{\emph}[1]{\textbf{\fontsize{11pt}{11pt}\selectfont ##1}}
  \titleformat{\section}{
    \setstretch{1.0}
    \ZhSectionTitleFont\raggedright
  }{}{0em}{}
}{%
  \end{spacing}
}

\newenvironment{japaneseCV}{%
  \begin{spacing}{1.3}
  \normalfont\jpMincho
  \renewcommand{\emph}[1]{\textbf{\fontsize{11pt}{11pt}\selectfont ##1}}
  \titleformat{\section}{
    \setstretch{1.0}
    \JpSectionTitleFont\raggedright
  }{}{0em}{}
}{%
  \end{spacing}
}

\newcommand{\pubListStart}{\begin{enumerate}[left=0pt, itemsep=3pt]}
\newcommand{\pubListEnd}{\end{enumerate}\cvSectionListEnd}
\newcommand{\awardListStart}{\begin{itemize}[left=0pt, itemsep=0pt]}
\newcommand{\awardListEnd}{\end{itemize}\cvSectionListEnd}
\newcommand{\skillListStart}{\begin{itemize}[leftmargin=0pt, label={}, itemsep=0pt]}
\newcommand{\skillListEnd}{\end{itemize}\cvSectionListEnd}
\newcommand{\itemListStart}{\begin{itemize}[itemsep=0pt]}
\newcommand{\itemListEnd}{\end{itemize}}
\newcommand{\myItem}[1]{\item{{#1\cvNoBreakVspace{-2pt}}}}

\newcommand{\eduHeading}[4]{
  \renewcommand{\arraystretch}{1.2}
  \cvHeadingBox{\begin{tabular}[t]{p{13.74cm}}
    \emph{#1} \hfill #2 \\
    \textit{#3} \hfill #4 \\
  \end{tabular}}\cvNoBreakVspace{-7pt}
}

\newcommand{\internHeading}[3]{
  \renewcommand{\arraystretch}{1.2}
  \cvHeadingBox{\begin{tabular}[t]{p{13.74cm}}
    \emph{#1} $|$ #2 \hfill #3 \\
  \end{tabular}}\cvNoBreakVspace{-7pt}
}

\newcommand{\projHeading}[3]{
  \renewcommand{\arraystretch}{1.2}
  \cvHeadingBox{\begin{tabular}[t]{p{13.74cm}}
    \textbf{#1} \hfill \\
    \textit{#2} \hfill #3 \\
  \end{tabular}}\cvNoBreakVspace{2pt}
}

% Email and web contacts are links, shown in black without a box.
% implicit=false: no anchors for sections, which would push each section
% title down a line in its label box.
\usepackage[implicit=false]{hyperref}
\hypersetup{hidelinks, breaklinks}`;
}

function nameFontForLanguage(language: CVLanguageCode): string {
  if (language === "zh") {
    return "\\ZhNameFont";
  }

  if (language === "ja") {
    return "\\JpNameFont";
  }

  return "\\NameFont";
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
function contactText(contact: string): string {
  return contactLink(contact) === null ? inlineLatex(contact) : escapeLatex(contact.trim());
}

function renderContact(contact: string): string {
  const link = contactLink(contact);
  const text = contactText(contact);
  // In \href's URL argument only % and # need escaping.
  return link === null ? text : `\\href{${link.replace(/[%#]/g, (char) => `\\${char}`)}}{${text}}`;
}

function renderHeader(document: CVDocument, language: CVLanguageCode): string {
  const visibleContacts = document.header.contacts.filter(hasText);
  const contacts = visibleContacts.map((contact) => `  \\item {\\ContactFont ${renderContact(contact)}}`).join("\n");
  const measureContacts = [
    "\\global\\cvContactWidth=0pt",
    ...visibleContacts.map((contact) => `\\cvMeasureContact{${contactText(contact)}}`)
  ].join("\n");

  return String.raw`${measureContacts}
\begin{flushright}
  \setstretch{0.6}
${contacts}
\end{flushright}\vspace{-\cvHeaderOverlap}

\begin{flushleft}
  \cvHeaderName{${nameFontForLanguage(language)}}{${inlineLatex(document.header.name)}}{${inlineLatex(document.header.suffix)}}
  \noindent\rule{\textwidth}{0.4pt}
\end{flushleft}`;
}

function environmentForLanguage(language: CVLanguageCode): string {
  if (language === "zh") {
    return "chineseCV";
  }

  if (language === "ja") {
    return "japaneseCV";
  }

  return "englishCV";
}

function renderLanguageDocument(languageDocument: CVLanguageDocument): string {
  const environment = environmentForLanguage(languageDocument.code);

  return String.raw`\begin{${environment}}

${renderHeader(languageDocument.document, languageDocument.code)}

${renderBlocks(languageDocument.document.blocks, languageDocument.code)}

\end{${environment}}`;
}

export function renderLatex(workspace: CVWorkspace): string {
  const enabledLanguages = LANGUAGE_RENDER_ORDER.map((code) =>
    workspace.languages.find((language) => language.code === code && language.enabled)
  ).filter((language): language is CVLanguageDocument => language !== undefined);

  return String.raw`%-------------------------------------
% Generated by CV Forge. Edit the structured fields in the app and export again.
%
% Based on yuan-resume by HF Yuan
% https://github.com/xyz-yuanhf/yuan-resume
% Original license: MIT
%
% Substantial modifications and multilingual support by Haruka Kobayashi
% Copyright (c) 2026 bit-admin
% Licensed under MIT
%------------------------------------
${renderFixedStylePreamble(cjkFontGroups(workspace))}

\begin{document}

${enabledLanguages.map(renderLanguageDocument).join("\n\n\\newpage\n\n")}

\end{document}
`;
}
