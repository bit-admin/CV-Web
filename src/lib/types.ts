export type Contact = {
  label: string;
};

export type Profile = {
  name: string;
  suffix: string;
  contacts: Contact[];
};

export type BulletedEntry = {
  title: string;
  location: string;
  subtitle: string;
  period: string;
  bullets: string[];
};

export type ProjectEntry = {
  title: string;
  organization: string;
  period: string;
  bullets: string[];
};

export type DatedItem = {
  text: string;
  date: string;
};

export type SkillGroup = {
  label: string;
  value: string;
  codeItems?: string[];
};

export type ServiceGroup = {
  label: string;
  items: string[];
};

export type CVDocumentVersion = 2;

export type CVHeader = {
  name: string;
  suffix: string;
  contacts: string[];
};

export type CVBlockType =
  | "credential"
  | "role"
  | "project"
  | "numbered-list"
  | "dated-list"
  | "label-value-list"
  | "grouped-list"
  | "free-text";

export type CVBlockBase = {
  id: string;
  type: CVBlockType;
  title: string;
  hidden?: boolean;
};

export type CredentialEntry = {
  title: string;
  location: string;
  subtitle: string;
  period: string;
  bullets: string[];
};

export type RoleEntry = {
  title: string;
  location: string;
  period: string;
  bullets: string[];
};

export type ProjectBlockEntry = {
  title: string;
  organization: string;
  period: string;
  bullets: string[];
};

export type DatedListItem = {
  text: string;
  date: string;
};

export type LabelValueItem = {
  label: string;
  value: string;
  codeItems?: string[];
};

export type GroupedListItem = {
  label: string;
  items: string[];
};

export type CredentialBlock = CVBlockBase & {
  type: "credential";
  entries: CredentialEntry[];
};

export type RoleBlock = CVBlockBase & {
  type: "role";
  entries: RoleEntry[];
};

export type ProjectBlock = CVBlockBase & {
  type: "project";
  entries: ProjectBlockEntry[];
};

export type NumberedListBlock = CVBlockBase & {
  type: "numbered-list";
  items: string[];
};

export type DatedListBlock = CVBlockBase & {
  type: "dated-list";
  items: DatedListItem[];
};

export type LabelValueListBlock = CVBlockBase & {
  type: "label-value-list";
  items: LabelValueItem[];
};

export type GroupedListBlock = CVBlockBase & {
  type: "grouped-list";
  groups: GroupedListItem[];
};

export type FreeTextBlock = CVBlockBase & {
  type: "free-text";
  text: string;
};

export type CVBlock =
  | CredentialBlock
  | RoleBlock
  | ProjectBlock
  | NumberedListBlock
  | DatedListBlock
  | LabelValueListBlock
  | GroupedListBlock
  | FreeTextBlock;

export type CVDocument = {
  version: CVDocumentVersion;
  header: CVHeader;
  blocks: CVBlock[];
};

export type CVLanguageCode = "en" | "zh" | "ja";

export type CVLanguageDocument = {
  code: CVLanguageCode;
  label: string;
  enabled: boolean;
  document: CVDocument;
};

export type CVWorkspaceVersion = 3;

export type CVWorkspace = {
  version: CVWorkspaceVersion;
  activeLanguage: CVLanguageCode;
  languages: CVLanguageDocument[];
};

export type CVData = {
  profile: Profile;
  education: BulletedEntry[];
  publications: string[];
  workingPapers: string[];
  projects: ProjectEntry[];
  experience: BulletedEntry[];
  teaching: BulletedEntry[];
  awards: DatedItem[];
  talks: DatedItem[];
  skills: SkillGroup[];
  services: ServiceGroup[];
  coursework: SkillGroup[];
  references: string;
};

export type CompileState = "idle" | "loading" | "compiling" | "ready" | "error";

export type CompileResult = {
  pdf: Uint8Array;
  log: string;
  tex: string;
  durationMs: number;
};

// ── AI Import Format ──────────────────────────────────────

export type AIBlock =
  | { type: "credential"; title: string; entries: CredentialEntry[] }
  | { type: "role"; title: string; entries: RoleEntry[] }
  | { type: "project"; title: string; entries: ProjectBlockEntry[] }
  | { type: "numbered-list"; title: string; items: string[] }
  | { type: "dated-list"; title: string; items: DatedListItem[] }
  | { type: "label-value-list"; title: string; items: LabelValueItem[] }
  | { type: "grouped-list"; title: string; groups: GroupedListItem[] }
  | { type: "free-text"; title: string; text: string };

export type AILanguageDocument = {
  header: CVHeader;
  blocks: AIBlock[];
};

export type AICVData = {
  languages: Partial<Record<CVLanguageCode, AILanguageDocument>>;
};
