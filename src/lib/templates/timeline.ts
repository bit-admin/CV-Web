// The Timeline template (after a CV template by Martin Hoelzer): a centred name, full-width small-caps section
// titles with a rule, and a two-column timeline with dates (or labels) right-aligned beside a vertical rule.
import type { CVBlock, CVDocument, CVLanguageCode, CVLanguageDocument, CVWorkspace } from "../types";
import {
  HYPERREF_SETUP,
  type CJKFontGroup,
  type TemplateLayout,
  cjkFontGroups,
  cleanItems,
  contactLink,
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

/** The text block of the original's \usepackage[big]{layaureo}: 14.34 cm x 23.2 cm. */
const PAGE = { pageWidthCm: 21, pageHeightCm: 29.7, topCm: 2.7, bottomCm: 3.8, leftCm: 3.33, rightCm: 3.33 } as const;
const DATE_WIDTH_CM = 2.9;

export const TIMELINE_LAYOUT: TemplateLayout = {
  ...PAGE,
  // Paper lists and free text span the whole width, so the whole width counts as body.
  bodyLeftCm: PAGE.leftCm,
  // Titles are full-width lines starting at the margin; their size tells them from dates and body text.
  headingEndCm: PAGE.leftCm + DATE_WIDTH_CM,
  headingMinFontSize: 13
};

type TimelineStrings = {
  personal: string;
  phone: string;
  email: string;
  web: string;
  environment: string;
  nameFont: string;
};

const STRINGS: Record<CVLanguageCode, TimelineStrings> = {
  en: { personal: "Personal Data", phone: "Phone", email: "Email", web: "Web", environment: "englishCV", nameFont: "\\NameFont" },
  zh: { personal: "个人信息", phone: "电话", email: "邮箱", web: "主页", environment: "chineseCV", nameFont: "\\ZhNameFont" },
  ja: { personal: "個人情報", phone: "電話", email: "メール", web: "ウェブ", environment: "japaneseCV", nameFont: "\\JpNameFont" }
};

const PHONE = /^[+()\d\s./\-–]+$/;

/** The label of a contact in the personal data table, or "" when its kind is unclear (an address, a note). */
export function contactLabel(contact: string, language: CVLanguageCode): string {
  const strings = STRINGS[language];
  const link = contactLink(contact);
  if (link?.startsWith("mailto:")) return strings.email;
  if (link) {
    if (/(^|\/\/|\.)linkedin\.com/i.test(link)) return "LinkedIn";
    if (/(^|\/\/|\.)github\.com/i.test(link)) return "GitHub";
    return strings.web;
  }
  const value = contact.trim();
  return PHONE.test(value) && (value.match(/\d/g) ?? []).length >= 6 ? strings.phone : "";
}

function sectionTitle(value: string, language: CVLanguageCode): string {
  // Titles are full-width headings here, so a two-line title of the Classic template becomes one line.
  return value
    .split(/\r?\n| \/ /)
    .map((line) => escapeLatex(line.trim()))
    .join(language === "en" ? " " : "");
}

function row(date: string, details: string): string {
  return `\\cvRow{${date}}{${details}}`;
}

function bullets(items: string[]): string {
  const visible = cleanItems(items);
  return visible.length ? `\n    \\cvBullets{\n${visible.map((item) => `      \\item ${inlineLatex(item)}`).join("\n")}}` : "";
}

function timeline(title: string, rows: string[]): string {
  return [`\\begin{cvTimeline}{${title}}`, ...rows, "\\end{cvTimeline}"].join("\n");
}

function labelCell(label: string): string {
  return hasText(label) ? `\\cvLabel{${inlineLatex(label)}}` : "";
}

function renderSection(block: CVBlock, language: CVLanguageCode): string {
  const title = sectionTitle(block.title, language);
  switch (block.type) {
    case "credential":
      return timeline(title, block.entries.filter(credentialEntryHasContent).map((entry) =>
        row(inlineLatex(entry.period), `%\n    \\cvEntryTitle{${inlineLatex(entry.subtitle)}} \\hfill ${inlineLatex(entry.location)} \\newline\n    ${inlineLatex(entry.title)}${bullets(entry.bullets)}`)
      ));
    case "role":
      return timeline(title, block.entries.filter(roleEntryHasContent).map((entry) =>
        row(inlineLatex(entry.period), `%\n    \\cvEntryTitle{${inlineLatex(entry.title)}} \\hfill ${inlineLatex(entry.location)}${bullets(entry.bullets)}`)
      ));
    case "project":
      return timeline(title, block.entries.filter(projectEntryHasContent).map((entry) =>
        row(inlineLatex(entry.period), `%\n    \\cvEntryTitle{${inlineLatex(entry.title)}} \\newline\n    \\textit{${inlineLatex(entry.organization)}}${bullets(entry.bullets)}`)
      ));
    case "numbered-list":
      return [`\\section{${title}}`, "", "\\begin{cvPapers}", cleanItems(block.items).map(inlineLatex).join("\n\n"), "\\end{cvPapers}"].join("\n");
    case "dated-list":
      return timeline(title, block.items.filter((item) => hasText(item.text) || hasText(item.date)).map((item) => {
        const { title: itemTitle, detail } = splitDatedText(item.text, language);
        return row(inlineLatex(item.date), `\\textbf{${inlineLatex(itemTitle)}}${inlineLatex(detail)}`);
      }));
    case "label-value-list":
      return timeline(title, block.items
        .filter((item) => hasText(item.label) || hasText(item.value) || cleanItems(item.codeItems ?? []).length > 0)
        .map((item) => {
          const codeItems = cleanItems(item.codeItems ?? []);
          const value = codeItems.length
            ? codeItems.map((code) => `{\\MonoSmallFont ${escapeLatex(code)}}`).join(", ")
            : inlineLatex(item.value);
          const rawValue = codeItems.length ? codeItems.join(", ") : item.value;
          return row(labelCell(item.label), `${value}${terminalPunctuation(rawValue, language)}`);
        }));
    case "grouped-list":
      return timeline(title, block.groups.flatMap((group) => {
        const items = cleanItems(group.items);
        if (items.length === 0) return [];
        return hasText(group.label)
          ? [row(labelCell(group.label), `${items.map(inlineLatex).join(", ")}${finalPunctuation(language)}`)]
          : items.map((item) => row("", inlineLatex(item)));
      }));
    case "free-text":
      return [`\\section{${title}}`, "", inlineLatex(block.text)].join("\n");
  }
}

function renderHeader(document: CVDocument, language: CVLanguageCode): string {
  const strings = STRINGS[language];
  const contacts = document.header.contacts.filter(hasText);
  const name = `\\cvName{${strings.nameFont}}{${inlineLatex(document.header.name)}}{${inlineLatex(document.header.suffix)}}`;
  if (contacts.length === 0) return name;
  return `${name}

${timeline(escapeLatex(strings.personal), contacts.map((contact) => row(labelCell(contactLabel(contact, language)), renderContact(contact))))}`;
}

function renderLanguageDocument(languageDocument: CVLanguageDocument): string {
  const { code, document } = languageDocument;
  const environment = STRINGS[code].environment;
  const sections = visibleBlocks(document.blocks).map((block, index) =>
    `${index > 0 && block.pageBreakBefore === true ? "\\cvSectionPageBreak\n" : ""}${renderSection(block, code)}`
  );
  return [`\\begin{${environment}}`, "", renderHeader(document, code), "", sections.join("\n\n"), "", `\\end{${environment}}`].join("\n");
}

function renderPreamble(fonts: Record<CJKFontGroup, boolean>): string {
  return String.raw`\documentclass[a4paper, 10pt]{article}

\usepackage[top=${PAGE.topCm}cm, bottom=${PAGE.bottomCm}cm, left=${PAGE.leftCm}cm, right=${PAGE.rightCm}cm]{geometry}
\usepackage{xcolor}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{fontspec}
\defaultfontfeatures{Mapping=tex-text}
\PassOptionsToPackage{fontset=none}{ctex}
\usepackage[scheme=plain]{ctex}
\usepackage{setspace}
\usepackage{titlesec}
\usepackage{array}
\usepackage{longtable}
\usepackage{ragged2e}

${fontSetup(fonts)}% Fontin's roles in the original, mapped onto the CV Forge fonts: body Sabon, name Calluna small
% caps, section titles Cronos small caps (\Large in the original), code Courier.
\newcommand{\BodyFont}{\Sabon}
\newlength{\cvNameSize}
\setlength{\cvNameSize}{24.88pt}
\newlength{\cvSuffixSize}
\setlength{\cvSuffixSize}{14.4pt}
\newcommand{\NameFont}{\Calluna\fontsize{\cvNameSize}{\cvNameSize}\selectfont\scshape}
\newcommand{\SuffixFont}{\Calluna\fontsize{\cvSuffixSize}{\cvSuffixSize}\selectfont\scshape}
\newcommand{\ZhNameFont}{\zhTitle\fontsize{\cvNameSize}{\cvNameSize}\selectfont}
\newcommand{\JpNameFont}{\jpTitle\fontsize{\cvNameSize}{\cvNameSize}\selectfont}
\newcommand{\SectionTitleFont}{\CronosLt\scshape\fontsize{14.4pt}{16pt}\selectfont}
\newcommand{\ZhSectionTitleFont}{\CronosLt\scshape\zhFangsong\fontsize{14.4pt}{16pt}\selectfont}
\newcommand{\JpSectionTitleFont}{\CronosLt\scshape\jpTitle\fontsize{14.4pt}{16pt}\selectfont}
\newcommand{\MonoSmallFont}{\Courier\fontsize{11pt}{11pt}\selectfont}

% Paragraphs are separated by space instead of indented (the original's
% parskip package, which the web engine's TeX Live does not include).
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.5\baselineskip plus 2pt}

% Section titles: \section outside timelines (paper lists, free text), and a
% table row with a rule under it inside them; both in the language's font.
\newcommand{\cvSetSectionFont}[1]{%
  \def\cvSectionFont{#1}%
  \titleformat{\section}{#1\raggedright}{}{0em}{}[\titlerule]}
\cvSetSectionFont{\SectionTitleFont}
\titlespacing{\section}{0pt}{8pt}{3pt}

% Explicit page break requested for a section ("Start on new page").
\newcommand{\cvSectionPageBreak}{\par\newpage}

\makeatletter
% Centred name and suffix, both scaled down when wider than the text block.
\newsavebox{\cvNameBox}
\newcommand{\cvName}[3]{%
  \sbox{\cvNameBox}{{#1#2}\quad{\SuffixFont #3}}%
  \ifdim\wd\cvNameBox>\textwidth
    \@tempdima\cvNameSize
    \setlength{\cvNameSize}{\dimexpr\cvNameSize*\textwidth/\wd\cvNameBox\relax}%
    \setlength{\cvSuffixSize}{\dimexpr\cvSuffixSize*\cvNameSize/\@tempdima\relax}%
  \fi
  \par{\centering{#1#2}\quad{\SuffixFont #3}\bigskip\par}}

% The timeline: the original's \begin{tabular}{r|p{11cm}} with fixed column
% widths, so every section lines up, and as a longtable, so a section breaks
% across pages between rows (an entry is never split). The section title is
% the table's first row, followed by the rule and joined to the first entry
% without a page break, so a title is never left alone at the bottom of a
% page. Every cell ends in a line of text (bullets are paragraphs, not a
% list): how a p cell that ends in vertical mode is measured differs between
% versions of the array package.
\newlength{\cvDateWidth}
\setlength{\cvDateWidth}{${DATE_WIDTH_CM}cm}
\newlength{\cvDetailWidth}
\setlength{\cvDetailWidth}{\dimexpr\textwidth-\cvDateWidth-2\tabcolsep-\arrayrulewidth\relax}
\newenvironment{cvTimeline}[1]{%
  \setlength{\LTpre}{8pt}%
  \setlength{\LTpost}{0pt}%
  \setlength{\LTleft}{0pt}%
  \begin{longtable}{@{}>{\raggedleft\arraybackslash}p{\cvDateWidth}|>{\raggedright\arraybackslash}p{\cvDetailWidth}@{}}
  \multicolumn{2}{@{}l@{}}{\cvSectionFont #1}\\*
  \hline
  \noalign{\vskip 3pt}}{%
  \end{longtable}}
% One row. The gap between rows is an invisible strut deepening the last line
% of the cell, which keeps the vertical rule continuous; the original used an
% empty row.
\newlength{\cvRowGap}
\setlength{\cvRowGap}{6pt}
\newcommand{\cvGapStrut}{\rule[-\dimexpr\dp\strutbox+\cvRowGap\relax]{0pt}{0pt}}
\newcommand{\cvRow}[2]{#1 & #2\cvGapStrut \\}
% Bullets in a cell: \item starts a paragraph with a hanging bullet. Not in a
% group of its own: the last paragraph is broken into lines at the end of the
% cell, and must still see its \hangindent then (the cell is a group anyway).
\newlength{\cvBulletIndent}
\setlength{\cvBulletIndent}{1.1em}
\newcommand{\cvBulletItem}{\par\hangindent\cvBulletIndent\hangafter1\noindent\hbox to\cvBulletIndent{\textbullet\hfil}}
\newcommand{\cvBullets}[1]{\par\vspace{2pt}\let\item\cvBulletItem #1}

% Paper lists: \small paragraphs, never split across pages or left alone at
% the top of one.
\newenvironment{cvPapers}{%
  \small
  \interlinepenalty\@M
  \clubpenalty\@M
  \widowpenalty\@M}{\par}
\makeatother

\newcommand{\cvEntryTitle}[1]{\textsc{#1}}
\newcommand{\cvLabel}[1]{\textsc{#1:}}

\newenvironment{englishCV}{%
  \BodyFont
  \renewcommand{\cvEntryTitle}[1]{\textsc{##1}}
  \renewcommand{\cvLabel}[1]{\textsc{##1:}}
  \cvSetSectionFont{\SectionTitleFont}
}{}

% Chinese and Japanese have no small caps: entry titles are bold, labels end
% with a full-width colon, and section titles use Fangsong / Yu Mincho
% Demibold (Latin letters keep Cronos small caps).
\newenvironment{chineseCV}{%
  \begin{spacing}{1.3}
  \normalfont\zhSong
  \renewcommand{\cvEntryTitle}[1]{\textbf{##1}}
  \renewcommand{\cvLabel}[1]{##1：}
  \cvSetSectionFont{\ZhSectionTitleFont}
}{%
  \end{spacing}
}

\newenvironment{japaneseCV}{%
  \begin{spacing}{1.3}
  \normalfont\jpMincho
  \renewcommand{\cvEntryTitle}[1]{\textbf{##1}}
  \renewcommand{\cvLabel}[1]{##1：}
  \cvSetSectionFont{\JpSectionTitleFont}
}{%
  \end{spacing}
}

${HYPERREF_SETUP}`;
}

export function renderTimelineLatex(workspace: CVWorkspace): string {
  return String.raw`%-------------------------------------
% Generated by CV Forge. Edit the structured fields in the app and export again.
%
% Layout after a CV template by Martin Hoelzer
% Fonts, multilingual support and page breaking by Haruka Kobayashi
% Copyright (c) 2026 bit-admin
% Licensed under MIT
%------------------------------------
${renderPreamble(cjkFontGroups(workspace))}

\begin{document}
\pagestyle{empty}

${enabledLanguages(workspace).map(renderLanguageDocument).join("\n\n\\newpage\n\n")}

\end{document}
`;
}
