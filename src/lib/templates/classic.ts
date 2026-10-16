// The Classic template (based on yuan-resume): section titles hang in a left column beside the section body, the
// name sits beside the contact block, and pages break between entries.
import type { CVBlock, CVDocument, CVLanguageCode, CVLanguageDocument, CVWorkspace, CredentialEntry, DatedListItem, GroupedListItem, LabelValueItem, ProjectBlockEntry, RoleEntry } from "../types";
import {
  HYPERREF_SETUP,
  LATEX_FILE_HEADER,
  type CJKFontGroup,
  type TemplateLayout,
  cjkFontGroups,
  cleanItems,
  contactText,
  credentialEntryHasContent,
  enabledLanguages,
  escapeLatex,
  finalPunctuation,
  fontSetup,
  hasText,
  inlineLatex,
  projectEntryHasContent,
  renderContact,
  roleEntryHasContent,
  splitDatedText,
  terminalPunctuation,
  visibleBlocks
} from "./shared";

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

const BODY_LEFT_CM = PAGE_LAYOUT.pageWidthCm - PAGE_LAYOUT.rightCm - PAGE_LAYOUT.sectionBodyCm;

export const CLASSIC_LAYOUT: TemplateLayout = {
  pageWidthCm: PAGE_LAYOUT.pageWidthCm,
  pageHeightCm: PAGE_LAYOUT.pageHeightCm,
  topCm: PAGE_LAYOUT.topCm,
  bottomCm: PAGE_LAYOUT.bottomCm,
  leftCm: PAGE_LAYOUT.leftCm,
  rightCm: PAGE_LAYOUT.rightCm,
  bodyLeftCm: BODY_LEFT_CM,
  // Section titles sit in the label column, left of the section body (less a little slack).
  headingEndCm: BODY_LEFT_CM - 0.3,
  headingMinFontSize: 0
};

function sectionTitle(value: string): string {
  return value
    .split(/\r?\n| \/ /)
    .map((line) => escapeLatex(line))
    .join("\\\\");
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
  return visibleBlocks(blocks)
    .map((block, index) => sectionBlock(block.title, renderBlockContent(block, language), index > 0 && block.pageBreakBefore === true))
    .join("\n\n");
}

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

${fontSetup(fonts)}\newcommand{\BodyFont}{\Sabon}
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

${HYPERREF_SETUP}`;
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

export function renderClassicLatex(workspace: CVWorkspace): string {
  return String.raw`${LATEX_FILE_HEADER}
${renderFixedStylePreamble(cjkFontGroups(workspace))}

\begin{document}

${enabledLanguages(workspace).map(renderLanguageDocument).join("\n\n\\newpage\n\n")}

\end{document}
`;
}
