import { sampleCv, sampleCvByLanguage } from "../data/sampleCv";
import { escapeMathDollars } from "./markup";
import { isTemplateId } from "./templates";
import type {
  BulletedEntry,
  CVBlock,
  CVBlockType,
  CVData,
  CVDocument,
  CVHeader,
  CVLanguageCode,
  CVLanguageDocument,
  CVWorkspace,
  DatedItem,
  GroupedListItem,
  LabelValueItem,
  ProjectEntry,
  ServiceGroup,
  SkillGroup
} from "./types";

export const DOCUMENT_VERSION = 2 as const;
export const WORKSPACE_VERSION = 3 as const;
export const MARKUP_VERSION = 2 as const;

export const LANGUAGE_ORDER: CVLanguageCode[] = ["en", "zh", "ja"];

export const LANGUAGE_LABELS: Record<CVLanguageCode, string> = {
  en: "English",
  zh: "Chinese",
  ja: "Japanese"
};

const BLOCK_TEMPLATE_TITLES: Record<CVBlockType, string> = {
  credential: "Credentials",
  role: "Experience",
  project: "Projects",
  "numbered-list": "Publications",
  "dated-list": "Awards",
  "label-value-list": "Skills",
  "grouped-list": "Service",
  "free-text": "Notes"
};

type SampleBlockTitles = {
  education: string;
  publications: string;
  workingPapers: string;
  projects: string;
  experience: string;
  teaching: string;
  awards: string;
  talks: string;
  skills: string;
  services: string;
  coursework: string;
  references: string;
};

const SAMPLE_BLOCK_TITLES_BY_LANGUAGE: Record<CVLanguageCode, SampleBlockTitles> = {
  en: {
    education: "Education",
    publications: "Publications",
    workingPapers: "Working\nPapers",
    projects: "Research\nProjects",
    experience: "Professional\nExperience",
    teaching: "Teaching",
    awards: "Awards\nand\nHonors",
    talks: "Invited\nTalks",
    skills: "Skills",
    services: "Academic\nServices",
    coursework: "Selected\nCoursework",
    references: "References"
  },
  zh: {
    education: "教育背景",
    publications: "发表论文",
    workingPapers: "未刊论文",
    projects: "科研项目",
    experience: "专业经历",
    teaching: "教学经历",
    awards: "荣誉",
    talks: "受邀报告",
    skills: "技能",
    services: "学术工作",
    coursework: "选修课程",
    references: "推荐人"
  },
  ja: {
    education: "学歴",
    publications: "査読付き\n論文",
    workingPapers: "未刊論文",
    projects: "研究実績",
    experience: "職務経験",
    teaching: "教育経験",
    awards: "受賞歴",
    talks: "招待講演",
    skills: "スキル",
    services: "学術活動",
    coursework: "主な\n履修科目",
    references: "推薦人"
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text) : [];
}

function legacyContacts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((contact) => (isRecord(contact) ? text(contact.label) : text(contact)))
    .filter((contact) => contact.trim().length > 0);
}

function legacyBulletedEntries(value: unknown): BulletedEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    const source = isRecord(entry) ? entry : {};
    return {
      title: text(source.title),
      location: text(source.location),
      subtitle: text(source.subtitle),
      period: text(source.period),
      bullets: textArray(source.bullets)
    };
  });
}

function legacyProjects(value: unknown): ProjectEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    const source = isRecord(entry) ? entry : {};
    return {
      title: text(source.title),
      organization: text(source.organization),
      period: text(source.period),
      bullets: textArray(source.bullets)
    };
  });
}

function legacyDatedItems(value: unknown): DatedItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    const source = isRecord(entry) ? entry : {};
    return {
      text: text(source.text),
      date: text(source.date)
    };
  });
}

function legacySkillGroups(value: unknown): SkillGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    const source = isRecord(entry) ? entry : {};
    return {
      label: text(source.label),
      value: text(source.value),
      codeItems: Array.isArray(source.codeItems) ? textArray(source.codeItems) : undefined
    };
  });
}

function legacyServiceGroups(value: unknown): ServiceGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    const source = isRecord(entry) ? entry : {};
    return {
      label: text(source.label),
      items: textArray(source.items)
    };
  });
}

function legacyCvData(value: unknown): CVData {
  const source = isRecord(value) ? value : {};
  const profile = isRecord(source.profile) ? source.profile : {};

  return {
    profile: {
      name: text(profile.name),
      suffix: text(profile.suffix),
      contacts: legacyContacts(profile.contacts).map((label) => ({ label }))
    },
    education: legacyBulletedEntries(source.education),
    publications: textArray(source.publications),
    workingPapers: textArray(source.workingPapers),
    projects: legacyProjects(source.projects),
    experience: legacyBulletedEntries(source.experience),
    teaching: legacyBulletedEntries(source.teaching),
    awards: legacyDatedItems(source.awards),
    talks: legacyDatedItems(source.talks),
    skills: legacySkillGroups(source.skills),
    services: legacyServiceGroups(source.services),
    coursework: legacySkillGroups(source.coursework),
    references: text(source.references)
  };
}

function blockId(slug: string, index: number): string {
  return `${slug}-${index + 1}`;
}

export function createBlockId(type: CVBlockType): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${type}-${random}`;
}

export function createEmptyBlock(type: CVBlockType): CVBlock {
  const base = {
    id: createBlockId(type),
    title: BLOCK_TEMPLATE_TITLES[type],
    hidden: false
  };

  switch (type) {
    case "credential":
      return {
        ...base,
        type,
        entries: [{ title: "", location: "", subtitle: "", period: "", bullets: [""] }]
      };
    case "role":
      return {
        ...base,
        type,
        entries: [{ title: "", location: "", period: "", bullets: [""] }]
      };
    case "project":
      return {
        ...base,
        type,
        entries: [{ title: "", organization: "", period: "", bullets: [""] }]
      };
    case "numbered-list":
      return { ...base, type, items: [""] };
    case "dated-list":
      return { ...base, type, items: [{ text: "", date: "" }] };
    case "label-value-list":
      return { ...base, type, items: [{ label: "", value: "" }] };
    case "grouped-list":
      return { ...base, type, groups: [{ label: "", items: [""] }] };
    case "free-text":
      return { ...base, type, text: "" };
  }
}

export function duplicateBlock(block: CVBlock): CVBlock {
  return {
    ...structuredClone(block),
    id: createBlockId(block.type),
    title: `${block.title} Copy`
  };
}

export function migrateCvData(value: unknown, titles: SampleBlockTitles = SAMPLE_BLOCK_TITLES_BY_LANGUAGE.en): CVDocument {
  const data = legacyCvData(value);

  return {
    version: DOCUMENT_VERSION,
    header: {
      name: data.profile.name,
      suffix: data.profile.suffix,
      contacts: data.profile.contacts.map((contact) => contact.label)
    },
    blocks: [
      {
        id: blockId("education", 0),
        type: "credential",
        title: titles.education,
        entries: data.education
      },
      {
        id: blockId("publications", 1),
        type: "numbered-list",
        title: titles.publications,
        items: data.publications
      },
      {
        id: blockId("working-papers", 2),
        type: "numbered-list",
        title: titles.workingPapers,
        items: data.workingPapers
      },
      {
        id: blockId("research-projects", 3),
        type: "project",
        title: titles.projects,
        entries: data.projects
      },
      {
        id: blockId("professional-experience", 4),
        type: "role",
        title: titles.experience,
        entries: data.experience.map(({ title, location, period, bullets }) => ({ title, location, period, bullets }))
      },
      {
        id: blockId("teaching", 5),
        type: "role",
        title: titles.teaching,
        entries: data.teaching.map(({ title, location, period, bullets }) => ({ title, location, period, bullets }))
      },
      {
        id: blockId("awards", 6),
        type: "dated-list",
        title: titles.awards,
        items: data.awards
      },
      {
        id: blockId("talks", 7),
        type: "dated-list",
        title: titles.talks,
        items: data.talks
      },
      {
        id: blockId("skills", 8),
        type: "label-value-list",
        title: titles.skills,
        items: data.skills
      },
      {
        id: blockId("services", 9),
        type: "grouped-list",
        title: titles.services,
        groups: data.services
      },
      {
        id: blockId("coursework", 10),
        type: "label-value-list",
        title: titles.coursework,
        items: data.coursework
      },
      {
        id: blockId("references", 11),
        type: "free-text",
        title: titles.references,
        text: data.references
      }
    ]
  };
}

function normalizeCredentialEntries(value: unknown): BulletedEntry[] {
  return legacyBulletedEntries(value);
}

function normalizeRoleEntries(value: unknown) {
  return legacyBulletedEntries(value).map(({ title, location, period, bullets }) => ({
    title,
    location,
    period,
    bullets
  }));
}

function normalizeProjectEntries(value: unknown) {
  return legacyProjects(value);
}

function normalizeLabelValueItems(value: unknown): LabelValueItem[] {
  return legacySkillGroups(value);
}

function normalizeGroups(value: unknown): GroupedListItem[] {
  return legacyServiceGroups(value);
}

function normalizeBlock(value: unknown, fallbackIndex: number): CVBlock | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = text(value.type) as CVBlockType;
  if (!(type in BLOCK_TEMPLATE_TITLES)) {
    return null;
  }

  const base = {
    id: text(value.id) || blockId(type, fallbackIndex),
    title: text(value.title) || BLOCK_TEMPLATE_TITLES[type],
    hidden: value.hidden === true,
    ...(value.pageBreakBefore === true ? { pageBreakBefore: true } : {})
  };

  switch (type) {
    case "credential":
      return { ...base, type, entries: normalizeCredentialEntries(value.entries) };
    case "role":
      return { ...base, type, entries: normalizeRoleEntries(value.entries) };
    case "project":
      return { ...base, type, entries: normalizeProjectEntries(value.entries) };
    case "numbered-list":
      return { ...base, type, items: textArray(value.items) };
    case "dated-list":
      return { ...base, type, items: legacyDatedItems(value.items) };
    case "label-value-list":
      return { ...base, type, items: normalizeLabelValueItems(value.items) };
    case "grouped-list":
      return { ...base, type, groups: normalizeGroups(value.groups) };
    case "free-text":
      return { ...base, type, text: text(value.text) };
  }
}

export function normalizeDocument(value: unknown): CVDocument | null {
  if (!isRecord(value) || value.version !== DOCUMENT_VERSION) {
    return null;
  }

  const header = isRecord(value.header) ? value.header : {};
  const blocks = Array.isArray(value.blocks)
    ? value.blocks
        .map((block, index) => normalizeBlock(block, index))
        .filter((block): block is CVBlock => block !== null)
    : [];

  return {
    version: DOCUMENT_VERSION,
    header: {
      name: text(header.name),
      suffix: text(header.suffix),
      contacts: textArray(header.contacts)
    },
    blocks
  };
}

export function createEmptyDocument(): CVDocument {
  return {
    version: DOCUMENT_VERSION,
    header: {
      name: "",
      suffix: "",
      contacts: []
    },
    blocks: []
  };
}

function isLanguageCode(value: unknown): value is CVLanguageCode {
  return typeof value === "string" && (LANGUAGE_ORDER as string[]).includes(value);
}

function createLanguageDocument(
  code: CVLanguageCode,
  document: CVDocument = createEmptyDocument(),
  enabled = false
): CVLanguageDocument {
  return {
    code,
    label: LANGUAGE_LABELS[code],
    enabled,
    document
  };
}

/**
 * Rewrites text written before `$math$` and backslash escapes existed so it
 * renders as it did: dollars that would now form a formula, and backslashes
 * that would now escape a marker, are escaped. Section titles and code items
 * are typeset verbatim and stay as they are.
 */
export function migrateDocumentMarkup(document: CVDocument): CVDocument {
  const m = escapeMathDollars;
  const blocks = document.blocks.map((block): CVBlock => {
    switch (block.type) {
      case "credential":
        return {
          ...block,
          entries: block.entries.map((e) => ({ ...e, title: m(e.title), location: m(e.location), subtitle: m(e.subtitle), period: m(e.period), bullets: e.bullets.map(m) }))
        };
      case "role":
        return { ...block, entries: block.entries.map((e) => ({ ...e, title: m(e.title), location: m(e.location), period: m(e.period), bullets: e.bullets.map(m) })) };
      case "project":
        return {
          ...block,
          entries: block.entries.map((e) => ({ ...e, title: m(e.title), organization: m(e.organization), period: m(e.period), bullets: e.bullets.map(m) }))
        };
      case "numbered-list":
        return { ...block, items: block.items.map(m) };
      case "dated-list":
        return { ...block, items: block.items.map((item) => ({ ...item, text: m(item.text), date: m(item.date) })) };
      case "label-value-list":
        return { ...block, items: block.items.map((item) => ({ ...item, label: m(item.label), value: m(item.value) })) };
      case "grouped-list":
        return { ...block, groups: block.groups.map((group) => ({ ...group, label: m(group.label), items: group.items.map(m) })) };
      case "free-text":
        return { ...block, text: m(block.text) };
    }
  });
  const { header } = document;
  return { ...document, header: { name: m(header.name), suffix: m(header.suffix), contacts: header.contacts.map(m) }, blocks };
}

/** Wraps a document saved before workspaces existed, which predates the current markup too. */
export function migrateDocumentToWorkspace(document: CVDocument): CVWorkspace {
  return {
    version: WORKSPACE_VERSION,
    markup: MARKUP_VERSION,
    activeLanguage: "en",
    languages: LANGUAGE_ORDER.map((code) =>
      createLanguageDocument(code, code === "en" ? migrateDocumentMarkup(document) : undefined, code === "en")
    )
  };
}

export function normalizeWorkspace(value: unknown): CVWorkspace | null {
  if (!isRecord(value) || value.version !== WORKSPACE_VERSION) {
    return null;
  }

  const languageByCode = new Map<CVLanguageCode, CVLanguageDocument>();
  if (Array.isArray(value.languages)) {
    value.languages.forEach((language) => {
      if (!isRecord(language) || !isLanguageCode(language.code) || languageByCode.has(language.code)) {
        return;
      }

      const document = normalizeDocument(language.document) ?? createEmptyDocument();
      languageByCode.set(
        language.code,
        createLanguageDocument(
          language.code,
          value.markup === MARKUP_VERSION ? document : migrateDocumentMarkup(document),
          language.enabled === true
        )
      );
    });
  }

  const languages = LANGUAGE_ORDER.map(
    (code) => languageByCode.get(code) ?? createLanguageDocument(code, createEmptyDocument(), false)
  );

  if (!languages.some((language) => language.enabled)) {
    languages[0] = { ...languages[0], enabled: true };
  }

  const activeLanguage = isLanguageCode(value.activeLanguage)
    ? value.activeLanguage
    : languages.find((language) => language.enabled)?.code ?? "en";

  return {
    version: WORKSPACE_VERSION,
    markup: MARKUP_VERSION,
    ...(isTemplateId(value.template) ? { template: value.template } : {}),
    activeLanguage,
    languages
  };
}

export function createSampleDocument(): CVDocument {
  return migrateCvData(sampleCv);
}

/**
 * The sample starts in English only, so a first visit does not download the Chinese and Japanese fonts (tens of
 * megabytes each); turning a language on shows its sample text.
 */
const SAMPLE_DISABLED_LANGUAGES: CVLanguageCode[] = ["zh", "ja"];

export function createSampleWorkspace(): CVWorkspace {
  return {
    version: WORKSPACE_VERSION,
    markup: MARKUP_VERSION,
    activeLanguage: "en",
    languages: LANGUAGE_ORDER.map((code) =>
      createLanguageDocument(
        code,
        migrateCvData(sampleCvByLanguage[code], SAMPLE_BLOCK_TITLES_BY_LANGUAGE[code]),
        !SAMPLE_DISABLED_LANGUAGES.includes(code)
      )
    )
  };
}

function mapBlock(raw: unknown): CVBlock | null {
  if (!isRecord(raw)) return null;
  const type = text(raw.type) as CVBlockType;
  if (!(type in BLOCK_TEMPLATE_TITLES)) return null;

  const base = {
    id: createBlockId(type),
    title: text(raw.title) || BLOCK_TEMPLATE_TITLES[type],
    hidden: raw.hidden === true
  };

  switch (type) {
    case "credential":
      return { ...base, type, entries: normalizeCredentialEntries(raw.entries) };
    case "role":
      return { ...base, type, entries: normalizeRoleEntries(raw.entries) };
    case "project":
      return { ...base, type, entries: normalizeProjectEntries(raw.entries) };
    case "numbered-list":
      return { ...base, type, items: textArray(raw.items) };
    case "dated-list":
      return { ...base, type, items: legacyDatedItems(raw.items) };
    case "label-value-list":
      return { ...base, type, items: normalizeLabelValueItems(raw.items) };
    case "grouped-list":
      return { ...base, type, groups: normalizeGroups(raw.groups) };
    case "free-text":
      return { ...base, type, text: text(raw.text) };
  }
}

export function mapAICVToWorkspace(input: unknown): CVWorkspace | string {
  if (!isRecord(input)) {
    return "Input is not a valid JSON object.";
  }

  const languages = isRecord(input.languages) ? input.languages : {};
  const languageCodes = Object.keys(languages).filter(
    (key): key is CVLanguageCode => isLanguageCode(key)
  );

  if (languageCodes.length === 0) {
    return "No valid language found. Expected at least one of: en, zh, ja.";
  }

  function buildHeader(raw: unknown): CVHeader {
    const h = isRecord(raw) ? raw : {};
    return {
      name: text(h.name),
      suffix: text(h.suffix),
      contacts: Array.isArray(h.contacts)
        ? h.contacts.map((c: unknown) => (isRecord(c) ? text(c.label) : text(c))).filter((s: string) => s.length > 0)
        : []
    };
  }

  const languageDocs = LANGUAGE_ORDER.map((code) => {
    const langData = languages[code];
    const enabled = languageCodes.includes(code);

    if (!isRecord(langData)) {
      return createLanguageDocument(code, createEmptyDocument(), enabled);
    }

    const header = buildHeader(langData.header);
    const blocks = Array.isArray(langData.blocks)
      ? langData.blocks.map(mapBlock).filter((b): b is CVBlock => b !== null)
      : [];

    return createLanguageDocument(
      code,
      { version: DOCUMENT_VERSION, header, blocks },
      enabled
    );
  });

  if (!languageDocs.some((l) => l.enabled)) {
    languageDocs[0] = { ...languageDocs[0], enabled: true };
  }

  return {
    version: WORKSPACE_VERSION,
    markup: MARKUP_VERSION,
    activeLanguage: languageCodes[0] ?? "en",
    languages: languageDocs
  };
}

function stripBlock(block: CVBlock): Record<string, unknown> {
  // Layout-only state stays out of the content JSON, but a hidden section
  // keeps its flag so it is not shown again after re-import.
  const { id: _id, hidden, pageBreakBefore: _pageBreakBefore, ...rest } = block;
  return hidden ? { ...rest, hidden: true } : rest;
}

export function exportWorkspaceAsAIJSON(workspace: CVWorkspace): string {
  const languages: Record<string, unknown> = {};

  for (const lang of workspace.languages) {
    if (!lang.enabled) continue;

    const { header, blocks } = lang.document;
    languages[lang.code] = {
      header: {
        name: header.name,
        suffix: header.suffix,
        contacts: header.contacts.map((label) => ({ label }))
      },
      blocks: blocks.map(stripBlock)
    };
  }

  return JSON.stringify({ languages }, null, 2);
}
