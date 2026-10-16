import { useState } from "react";
import type { DragEvent } from "react";
import {
  AlignLeft,
  Award,
  BookOpen,
  Briefcase,
  EyeOff,
  FlaskConical,
  GraduationCap,
  GripVertical,
  IdCard,
  Layers,
  ListOrdered,
  Plus,
  SeparatorHorizontal,
  Tags
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CVBlockType, CVDocument, CVLanguageCode, CVWorkspace } from "../lib/types";
import { blockCount, blockTypeDescriptions, blockTypeLabels } from "./BlockEditor";
import { MenuButton } from "./ui";
import { TemplateSummary } from "./TemplatePicker";
import type { CVTemplate } from "../lib/templates";

export const blockTypeIcons: Record<CVBlockType, LucideIcon> = {
  credential: GraduationCap,
  role: Briefcase,
  project: FlaskConical,
  "numbered-list": ListOrdered,
  "dated-list": Award,
  "label-value-list": Tags,
  "grouped-list": Layers,
  "free-text": AlignLeft
};

const blockTypeOrder: CVBlockType[] = [
  "credential",
  "role",
  "project",
  "numbered-list",
  "dated-list",
  "label-value-list",
  "grouped-list",
  "free-text"
];

const nativeNames: Record<CVLanguageCode, string> = { en: "English", zh: "中文", ja: "日本語" };

type SidebarProps = {
  workspace: CVWorkspace;
  template: CVTemplate;
  onChangeTemplate: () => void;
  document: CVDocument;
  activeSelection: string;
  issueCounts: Map<string, number>;
  onSelect: (selection: string) => void;
  onSelectLanguage: (code: CVLanguageCode) => void;
  onToggleLanguage: (code: CVLanguageCode) => void;
  /** Bytes of fonts each language still needs to download, shown before it is turned on. */
  fontDownloads: Partial<Record<CVLanguageCode, number>>;
  onAddBlock: (type: CVBlockType) => void;
  onReorder: (from: number, to: number) => void;
};

export function Sidebar({
  workspace,
  template,
  onChangeTemplate,
  document,
  activeSelection,
  issueCounts,
  onSelect,
  onSelectLanguage,
  onToggleLanguage,
  fontDownloads,
  onAddBlock,
  onReorder
}: SidebarProps) {
  const enabledCount = workspace.languages.filter((language) => language.enabled).length;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const handleDragOver = (index: number) => (event: DragEvent<HTMLLIElement>) => {
    if (dragFrom === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    setDropAt(event.clientY < rect.top + rect.height / 2 ? index : index + 1);
  };

  const finishDrag = () => {
    if (dragFrom !== null && dropAt !== null) {
      const to = dropAt > dragFrom ? dropAt - 1 : dropAt;
      if (to !== dragFrom) onReorder(dragFrom, to);
    }
    setDragFrom(null);
    setDropAt(null);
  };

  return (
    <nav className="sidebar" aria-label="Document outline">
      <section className="sidebar-group">
        <h2 className="sidebar-title">Template</h2>
        <TemplateSummary template={template} language={workspace.activeLanguage} onChange={onChangeTemplate} />
      </section>

      <section className="sidebar-group">
        <h2 className="sidebar-title">Languages</h2>
        <ul className="language-list">
          {workspace.languages.map((language) => {
            const active = workspace.activeLanguage === language.code;
            const pendingMb = language.enabled ? 0 : Math.round((fontDownloads[language.code] ?? 0) / 1024 / 1024);
            return (
              <li key={language.code} className={`language-item${active ? " active" : ""}${language.enabled ? "" : " disabled"}`}>
                <input
                  type="checkbox"
                  checked={language.enabled}
                  disabled={language.enabled && enabledCount === 1}
                  title={
                    language.enabled
                      ? `Leave ${language.label} out of the PDF`
                      : pendingMb > 0
                        ? `Include ${language.label} in the PDF (downloads ${pendingMb} MB of fonts once)`
                        : `Include ${language.label} in the PDF`
                  }
                  aria-label={`Include ${language.label} in the PDF`}
                  onChange={() => onToggleLanguage(language.code)}
                />
                <button type="button" aria-current={active ? "true" : undefined} onClick={() => onSelectLanguage(language.code)}>
                  <span>{nativeNames[language.code]}</span>
                  <small>
                    {language.enabled ? (active ? "Editing" : language.code.toUpperCase()) : pendingMb > 0 ? `Off · ${pendingMb} MB` : "Off"}
                  </small>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="sidebar-group sidebar-group--grow">
        <h2 className="sidebar-title">
          Sections
          <span>{document.blocks.length}</span>
        </h2>
        <ul className="outline" onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node) && setDropAt(null)}>
          <li>
            <button
              type="button"
              className={`outline-item outline-item--header${activeSelection === "header" ? " active" : ""}`}
              onClick={() => onSelect("header")}
            >
              <IdCard size={14} className="outline-icon" />
              <span className="outline-text">
                <strong>{document.header.name || "Header"}</strong>
                <small>Name and contact</small>
              </span>
            </button>
          </li>
          {document.blocks.map((block, index) => {
            const Icon = blockTypeIcons[block.type];
            const issues = issueCounts.get(block.id) ?? 0;
            return (
              <li
                key={block.id}
                className={`outline-row${dragFrom === index ? " dragging" : ""}${dropAt === index ? " drop-before" : ""}${
                  dropAt === index + 1 && index === document.blocks.length - 1 ? " drop-after" : ""
                }`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", block.title);
                  setDragFrom(index);
                }}
                onDragOver={handleDragOver(index)}
                onDrop={(event) => {
                  event.preventDefault();
                  finishDrag();
                }}
                onDragEnd={finishDrag}
              >
                <button
                  type="button"
                  className={`outline-item${activeSelection === block.id ? " active" : ""}${block.hidden ? " hidden-block" : ""}`}
                  onClick={() => onSelect(block.id)}
                >
                  <GripVertical size={13} className="outline-grip" aria-hidden="true" />
                  <Icon size={14} className="outline-icon" />
                  <span className="outline-text">
                    <strong>{block.title.replace(/\n/g, " ") || `Section ${index + 1}`}</strong>
                    <small>{blockCount(block)}</small>
                  </span>
                  <span className="outline-flags">
                    {block.pageBreakBefore && index > 0 && (
                      <span title="Starts on a new page">
                        <SeparatorHorizontal size={13} />
                      </span>
                    )}
                    {block.hidden && (
                      <span title="Hidden from the PDF">
                        <EyeOff size={13} />
                      </span>
                    )}
                    {issues > 0 && (
                      <span className="issue-badge" title={`${issues} layout suggestion${issues === 1 ? "" : "s"}`}>
                        {issues}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {document.blocks.length === 0 && (
          <p className="sidebar-empty">
            <BookOpen size={14} />
            No sections yet. Add one below, or generate a CV with AI.
          </p>
        )}
      </section>

      <div className="sidebar-foot">
        <MenuButton
          className="add-section-button"
          placement="above"
          label={
            <>
              <Plus size={14} />
              Add section
            </>
          }
        >
          {(close) =>
            blockTypeOrder.map((type) => {
              const Icon = blockTypeIcons[type];
              return (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    onAddBlock(type);
                    close();
                  }}
                >
                  <Icon size={15} />
                  <span>
                    <strong>{blockTypeLabels[type]}</strong>
                    <small>{blockTypeDescriptions[type]}</small>
                  </span>
                </button>
              );
            })
          }
        </MenuButton>
      </div>
    </nav>
  );
}
