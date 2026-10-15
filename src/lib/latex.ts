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

const LANGUAGE_RENDER_ORDER: CVLanguageCode[] = ["en", "zh", "ja"];

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

export function inlineLatex(value: string): string {
  const chunks: string[] = [];
  let index = 0;

  while (index < value.length) {
    const boldStart = value.indexOf("**", index);
    const italicStart = value.indexOf("_", index);
    const codeStart = value.indexOf("`", index);
    const candidates = [boldStart, italicStart, codeStart].filter((pos) => pos >= 0);

    if (candidates.length === 0) {
      chunks.push(escapeLatex(value.slice(index)));
      break;
    }

    const markerStart = Math.min(...candidates);
    chunks.push(escapeLatex(value.slice(index, markerStart)));

    if (markerStart === boldStart) {
      const end = value.indexOf("**", markerStart + 2);
      if (end < 0) {
        chunks.push(escapeLatex(value.slice(markerStart)));
        break;
      }
      chunks.push(`\\textbf{${escapeLatex(value.slice(markerStart + 2, end))}}`);
      index = end + 2;
      continue;
    }

    if (markerStart === codeStart) {
      const end = value.indexOf("`", markerStart + 1);
      if (end < 0) {
        chunks.push(escapeLatex(value.slice(markerStart)));
        break;
      }
      chunks.push(`{\\MonoSmallFont ${escapeLatex(value.slice(markerStart + 1, end))}}`);
      index = end + 1;
      continue;
    }

    const end = value.indexOf("_", markerStart + 1);
    if (end < 0) {
      chunks.push(escapeLatex(value.slice(markerStart)));
      break;
    }
    chunks.push(`\\textit{${escapeLatex(value.slice(markerStart + 1, end))}}`);
    index = end + 1;
  }

  return chunks.join("");
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

function entryBlock(content: string): string {
  return `\\begin{cvEntry}\n${content}\n\\end{cvEntry}`;
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
  ].join("\n"));
}

function renderRoleEntry(entry: RoleEntry): string {
  return entryBlock([
    "\\internHeading",
    `  {${inlineLatex(entry.title)}}{${inlineLatex(entry.location)}}{${inlineLatex(entry.period)}}`,
    itemList(entry.bullets)
  ].join("\n"));
}

function renderProjectEntry(entry: ProjectBlockEntry): string {
  return entryBlock([
    "\\projHeading",
    `{${inlineLatex(entry.title)}}`,
    `{${inlineLatex(entry.organization)}}`,
    `{${inlineLatex(entry.period)}}`,
    itemList(entry.bullets)
  ].join("\n"));
}

function renderNumberedList(items: string[]): string {
  const visibleItems = cleanItems(items);
  return [
    "\\pubListStart",
    "\\justifying",
    breakableItems(visibleItems.map((item) => `\\item ${inlineLatex(item)}`)),
    "\\pubListEnd"
  ].filter(Boolean).join("\n");
}

function splitDatedText(value: string, language: CVLanguageCode): { title: string; detail: string } {
  const separators = language === "en" ? [",", "，"] : ["，", ","];

  for (const separator of separators) {
    const index = value.indexOf(separator);

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

function renderFixedStylePreamble(): string {
  return String.raw`\documentclass[a4paper, 10pt]{article}

\usepackage[top=${PAGE_LAYOUT.topCm}cm, bottom=${PAGE_LAYOUT.bottomCm}cm, left=${PAGE_LAYOUT.leftCm}cm, right=${PAGE_LAYOUT.rightCm}cm, marginparwidth=1.75cm]{geometry}
\usepackage{xcolor}
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

\setCJKmainfont{Simsun.ttc}[
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

\newcommand{\zhSong}{\CJKfamily{zhsong}}
\newcommand{\zhHei}{\CJKfamily{zhhei}}
\newcommand{\zhKai}{\CJKfamily{zhkai}}
\newcommand{\zhTitle}{\CJKfamily{zhtitle}}
\newcommand{\zhFangsong}{\CJKfamily{zhfangsong}}

\setCJKfamilyfont{jpmincho}{yumin.ttf}[
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

\newcommand{\jpMincho}{\CJKfamily{jpmincho}}
\newcommand{\jpGothic}{\CJKfamily{jpgothic}}
\newcommand{\jpTitle}{\CJKfamily{jptitle}}
\newcommand{\jpMono}{\CJKfamily{jpmono}}

\newcommand{\BodyFont}{\Sabon}
\newcommand{\NameFont}{\Calluna\fontsize{30pt}{30pt}\selectfont\scshape}
\newcommand{\SuffixFont}{\Calluna\fontsize{14.5pt}{14.5pt}\selectfont\scshape}
\newcommand{\ContactFont}{\Calluna}
\newcommand{\SectionTitleFont}{\CronosLt\scshape\fontsize{14.5pt}{14.5pt}\selectfont}
\newcommand{\MonoSmallFont}{\Courier\fontsize{11pt}{11pt}\selectfont}
\newcommand{\ZhNameFont}{\zhTitle\fontsize{30pt}{30pt}\selectfont}
\newcommand{\ZhSectionTitleFont}{\CronosLt\scshape\zhFangsong\fontsize{14.5pt}{14.5pt}\selectfont}
\newcommand{\JpNameFont}{\jpTitle\fontsize{30pt}{30pt}\selectfont}
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
% Preferred page break between entries: if the next entry does not fit on
% the current page it moves to the next page as a whole; an entry taller
% than a full page still breaks between its bullets.
\newcommand{\cvEntryBreak}{\par\vfil\penalty-200\vfilneg}
\newcommand{\cvNoBreakVspace}[1]{%
  \ifvmode\nobreak\vskip#1\relax\else\vadjust{\nobreak\vskip#1\vskip\z@skip}\fi}

% Keeps an entry heading attached to its first bullet and avoids single
% lines left behind when a long entry has to split.
\newenvironment{cvEntry}{%
  \par
  \@beginparpenalty\@M
  \clubpenalty\@M
  \widowpenalty\@M
}{\par}

\newsavebox{\cvLabelBox}
\newdimen\cvSectionStart
\newcount\cvSectionPage
\newenvironment{cvSection}[1]{%
  \cvEntryBreak
  \sbox{\cvLabelBox}{\begin{minipage}[t]{\SectionLabelWidth}\raggedright #1\end{minipage}}%
  \begin{list}{}{%
    \setlength{\leftmargin}{\dimexpr\textwidth-\SectionBodyWidth\relax}%
    \setlength{\labelwidth}{\SectionLabelWidth}%
    \setlength{\labelsep}{\dimexpr\leftmargin-\SectionLabelWidth\relax}%
    \setlength{\rightmargin}{\z@}%
    \setlength{\itemindent}{\z@}%
    \setlength{\listparindent}{\z@}%
    \setlength{\topsep}{\z@}%
    \setlength{\partopsep}{\z@}%
    \setlength{\parsep}{\z@}%
    \setlength{\itemsep}{\z@}%
    \renewcommand{\makelabel}[1]{##1\hfil}}%
  % Nested lists behave as top-level lists, as they did inside a minipage.
  \@listdepth\z@
  \raggedright
  \cvSectionPage\c@page
  \cvSectionStart\dimexpr\pagetotal+\pagedepth\relax
  \item[{\raisebox{\z@}[\z@][\z@]{\usebox{\cvLabelBox}}}]%
}{%
  \par
  % Reserve room for a section title that is taller than its body.
  \ifnum\cvSectionPage=\c@page
    \@tempdima\dimexpr\ht\cvLabelBox+\dp\cvLabelBox-\pagetotal-\pagedepth+\cvSectionStart\relax
    \ifdim\@tempdima>\z@\nobreak\vskip\@tempdima\fi
  \fi
  \end{list}%
  \vspace{\SectionSkip}%
}

% Inside a list: only break pages at \cvEntryBreak, never between items.
\newcommand{\cvKeepItems}{\@itempenalty\@M}

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
\newcommand{\pubListEnd}{\end{enumerate}\vspace{-11pt}}
\newcommand{\awardListStart}{\begin{itemize}[left=0pt, itemsep=0pt]}
\newcommand{\awardListEnd}{\end{itemize}\vspace{-11pt}}
\newcommand{\skillListStart}{\begin{itemize}[leftmargin=0pt, label={}, itemsep=0pt]}
\newcommand{\skillListEnd}{\end{itemize}\vspace{-11pt}}
\newcommand{\itemListStart}{\begin{itemize}[itemsep=0pt]}
\newcommand{\itemListEnd}{\end{itemize}}
\newcommand{\myItem}[1]{\item{{#1\cvNoBreakVspace{-2pt}}}}

\newcommand{\eduHeading}[4]{
  \renewcommand{\arraystretch}{1.2}
  \begin{tabular}[t]{@{}p{\linewidth}@{}}
    \emph{#1} \hfill #2 \\
    \textit{#3} \hfill #4 \\
  \end{tabular}\cvNoBreakVspace{-7pt}
}

\newcommand{\internHeading}[3]{
  \renewcommand{\arraystretch}{1.2}
  \begin{tabular}[t]{@{}p{\linewidth}@{}}
    \emph{#1} $|$ #2 \hfill #3 \\
  \end{tabular}\cvNoBreakVspace{-7pt}
}

\newcommand{\projHeading}[3]{
  \renewcommand{\arraystretch}{1.2}
  \begin{tabular}[t]{@{}p{\linewidth}@{}}
    \textbf{#1} \hfill \\
    \textit{#2} \hfill #3 \\
  \end{tabular}\cvNoBreakVspace{2pt}
}`;
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
  const contacts = document.header.contacts
    .filter(hasText)
    .map((contact) => `{\\ContactFont ${inlineLatex(contact)}}\\cr`)
    .join("\\noalign{\\vskip4pt}\n    ");
  // Contacts are right-aligned rows in a \vbox, whose baseline is the last
  // row, so the name lines up with the last contact for any number of
  // contacts. Row spacing (stretch 0.6 + 4pt) matches the previous
  // flushright list. If name and contacts do not fit side by side, the
  // contacts wrap below the name, still flush right. The 12.8pt kern keeps
  // the name and everything below where the original template put them (its
  // contact list started with an empty line).
  const contactBlock = contacts
    ? `\\nobreak\\hskip 0pt plus 1filll\\penalty50\\hskip1em\\null\\nobreak\\hskip 0pt plus 1filll
  {\\setstretch{0.6}\\vbox{\\kern12.8pt\\halign{\\hfil#\\cr
    ${contacts}}}}`
    : "";

  return String.raw`\begin{flushleft}
  \mbox{{${nameFontForLanguage(language)} ${inlineLatex(document.header.name)}} \quad
  {\SuffixFont ${inlineLatex(document.header.suffix)}}}${contactBlock}{\parfillskip=0pt\par}
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
${renderFixedStylePreamble()}

\begin{document}

${enabledLanguages.map(renderLanguageDocument).join("\n\n\\newpage\n\n")}

\end{document}
`;
}
