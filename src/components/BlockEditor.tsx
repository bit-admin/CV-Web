import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import type {
  CredentialEntry,
  CVBlock,
  CVBlockType,
  CVDocument,
  DatedListItem,
  GroupedListItem,
  LabelValueItem,
  ProjectBlockEntry,
  RoleEntry
} from "../lib/types";
import { EntryList } from "./EntryList";
import { ListEditor, MoveButtons, useListKeys } from "./ListEditor";
import { Field, IconButton, Kbd, MOD, TextArea, TextInput, Toggle, isMac } from "./ui";

export const blockTypeLabels: Record<CVBlockType, string> = {
  credential: "Credentials",
  role: "Roles",
  project: "Projects",
  "numbered-list": "Numbered list",
  "dated-list": "Dated list",
  "label-value-list": "Label – value list",
  "grouped-list": "Grouped list",
  "free-text": "Free text"
};

export const blockTypeDescriptions: Record<CVBlockType, string> = {
  credential: "Education, degrees, certificates",
  role: "Work experience, positions",
  project: "Research or side projects",
  "numbered-list": "Publications, papers",
  "dated-list": "Awards, talks, honours",
  "label-value-list": "Skills, coursework",
  "grouped-list": "Service, memberships",
  "free-text": "Summary, references"
};

/** Short "4 entries" style summary of a section's contents. */
export function blockCount(block: CVBlock): string {
  const count = (n: number, noun: string, plural = `${noun}s`) => `${n} ${n === 1 ? noun : plural}`;
  switch (block.type) {
    case "credential":
    case "role":
    case "project":
      return count(block.entries.length, "entry", "entries");
    case "numbered-list":
    case "dated-list":
    case "label-value-list":
      return count(block.items.length, "item");
    case "grouped-list":
      return count(block.groups.length, "group");
    case "free-text": {
      const text = block.text.trim().replace(/\s+/g, " ");
      return text ? (text.length > 28 ? `${text.slice(0, 27)}…` : text) : "Empty";
    }
  }
}

function FormSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="form-section">
      <header className="form-section-head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

function FormattingFooter() {
  return (
    <footer className="editor-foot">
      <span>
        <b>**bold**</b> <Kbd>{MOD}B</Kbd>
      </span>
      <span>
        <i>_italic_</i> <Kbd>{MOD}I</Kbd>
      </span>
      <span>
        <code>`code`</code> <Kbd>{MOD}E</Kbd>
      </span>
      <span title="LaTeX math such as $x^2$ or $\alpha \le 0.05$. Write \$ for a dollar sign next to a formula.">
        <code>$x^2$</code> math <Kbd>{MOD}{isMac ? "⇧" : "Shift+"}E</Kbd>
      </span>
      <span className="editor-foot-sep" />
      <span className="editor-foot-extra">
        In lists: <Kbd>Enter</Kbd> new item · <Kbd>Alt+↑↓</Kbd> move
      </span>
    </footer>
  );
}

// ── Header ────────────────────────────────────────────────

export function HeaderEditor({ document, onChange }: { document: CVDocument; onChange: (next: CVDocument["header"]) => void }) {
  const { header } = document;
  return (
    <div className="editor-panel">
      <header className="editor-head">
        <div className="editor-head-title">
          <span className="kicker">Header</span>
          <h2>{header.name || "Your name"}</h2>
        </div>
      </header>
      <div className="editor-body">
        <FormSection title="Identity">
          <div className="field-grid field-grid--name">
            <Field label="Name">
              {(id) => <TextInput id={id} value={header.name} placeholder="Full name" onChange={(name) => onChange({ ...header, name })} />}
            </Field>
            <Field label="Suffix">
              {(id) => <TextInput id={id} value={header.suffix} placeholder="Ph.D." onChange={(suffix) => onChange({ ...header, suffix })} />}
            </Field>
          </div>
          <p className="form-note">Long names shrink automatically to fit beside the contact block.</p>
        </FormSection>
        <FormSection title="Contact" aside={<span className="form-section-meta">Right-aligned, one per line</span>}>
          <ListEditor
            values={header.contacts}
            noun="contact"
            marker="none"
            placeholder="Phone, email, or URL"
            onChange={(contacts) => onChange({ ...header, contacts })}
          />
        </FormSection>
      </div>
      <FormattingFooter />
    </div>
  );
}

// ── Simple row lists (dated items, label–value items) ─────

function RowList<T>({
  items,
  onChange,
  noun,
  create,
  className,
  children
}: {
  items: T[];
  onChange: (items: T[]) => void;
  noun: string;
  create: () => T;
  className: string;
  children: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
}) {
  const { keys, insert, remove, move } = useListKeys(items.length);
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);

  // Focus the first field of a row that was just added or moved.
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    const field = root.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-row-key="${key}"] :is(input, textarea)`);
    if (field) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
      pendingFocus.current = null;
    }
  });

  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    move(from, to);
    pendingFocus.current = keys[to];
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const addAt = (index: number) => {
    insert(index);
    pendingFocus.current = keys[index];
    onChange([...items.slice(0, index), create(), ...items.slice(index)]);
  };

  // Same keys as the bullet lists: Enter adds a row below, Backspace in an
  // empty row removes it, Alt+↑/↓ moves the row.
  const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      addAt(index + 1);
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      moveTo(index, index + (event.key === "ArrowUp" ? -1 : 1));
    } else if (event.key === "Backspace" && items.length > 1) {
      const fields = [...event.currentTarget.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")];
      if (fields.every((field) => field.value === "")) {
        event.preventDefault();
        remove(index);
        pendingFocus.current = keys[index > 0 ? index - 1 : 0];
        onChange(items.filter((_, i) => i !== index));
      }
    }
  };

  return (
    <div className={`row-list ${className}`} ref={root}>
      {items.length === 0 && <p className="list-empty">No {noun}s yet.</p>}
      {items.map((item, index) => (
        <div className="row-list-row" key={keys[index]} data-row-key={keys[index]} onKeyDown={handleKeyDown(index)}>
          <span className="list-gutter">
            <span className="list-marker" aria-hidden="true" />
            <MoveButtons noun={noun} index={index} count={items.length} onMove={(to) => moveTo(index, to)} />
          </span>
          {children(item, (patch) => onChange(items.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))), index)}
          <button
            type="button"
            className="row-remove row-remove--outside"
            aria-label={`Remove ${noun} ${index + 1}`}
            title={`Remove ${noun}`}
            onClick={() => {
              remove(index);
              onChange(items.filter((_, i) => i !== index));
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button type="button" className="add-row" onClick={() => addAt(items.length)}>
        <Plus size={13} />
        Add {noun}
      </button>
    </div>
  );
}

// ── Entry editors ─────────────────────────────────────────

function Bullets({ bullets, onChange }: { bullets: string[]; onChange: (bullets: string[]) => void }) {
  return (
    <div className="entry-bullets">
      <span className="entry-bullets-label">Bullets</span>
      <ListEditor values={bullets} noun="bullet" placeholder="Achievement, responsibility, or detail" onChange={onChange} />
    </div>
  );
}

function CredentialEditor({ entries, onChange }: { entries: CredentialEntry[]; onChange: (entries: CredentialEntry[]) => void }) {
  return (
    <EntryList
      items={entries}
      onChange={onChange}
      noun="entry"
      create={() => ({ title: "", location: "", subtitle: "", period: "", bullets: [""] })}
      summary={(entry) => ({ title: entry.title, meta: entry.period, detail: [entry.subtitle, entry.location].filter(Boolean).join(" · ") })}
    >
      {(entry, update) => (
        <>
          <div className="field-grid">
            <Field label="Institution">{(id) => <TextInput id={id} value={entry.title} placeholder="Institution or department" onChange={(title) => update({ title })} />}</Field>
            <Field label="Location">{(id) => <TextInput id={id} value={entry.location} placeholder="City, country" onChange={(location) => update({ location })} />}</Field>
            <Field label="Degree / subtitle">{(id) => <TextInput id={id} value={entry.subtitle} placeholder="Degree, role, or subtitle" onChange={(subtitle) => update({ subtitle })} />}</Field>
            <Field label="Period">{(id) => <TextInput id={id} value={entry.period} placeholder="2020 - 2024" onChange={(period) => update({ period })} />}</Field>
          </div>
          <Bullets bullets={entry.bullets} onChange={(bullets) => update({ bullets })} />
        </>
      )}
    </EntryList>
  );
}

function RoleEditor({ entries, onChange }: { entries: RoleEntry[]; onChange: (entries: RoleEntry[]) => void }) {
  return (
    <EntryList
      items={entries}
      onChange={onChange}
      noun="role"
      create={() => ({ title: "", location: "", period: "", bullets: [""] })}
      summary={(entry) => ({
        title: entry.title,
        meta: entry.period,
        detail: [entry.location, `${entry.bullets.filter((b) => b.trim()).length} bullets`].filter(Boolean).join(" · ")
      })}
    >
      {(entry, update) => (
        <>
          <div className="field-grid">
            <Field label="Title" wide>{(id) => <TextInput id={id} value={entry.title} placeholder="Organization or role" onChange={(title) => update({ title })} />}</Field>
            <Field label="Location">{(id) => <TextInput id={id} value={entry.location} placeholder="City, country" onChange={(location) => update({ location })} />}</Field>
            <Field label="Period">{(id) => <TextInput id={id} value={entry.period} placeholder="2023 - Present" onChange={(period) => update({ period })} />}</Field>
          </div>
          <Bullets bullets={entry.bullets} onChange={(bullets) => update({ bullets })} />
        </>
      )}
    </EntryList>
  );
}

function ProjectEditor({ entries, onChange }: { entries: ProjectBlockEntry[]; onChange: (entries: ProjectBlockEntry[]) => void }) {
  return (
    <EntryList
      items={entries}
      onChange={onChange}
      noun="project"
      create={() => ({ title: "", organization: "", period: "", bullets: [""] })}
      summary={(entry) => ({ title: entry.title, meta: entry.period, detail: entry.organization })}
    >
      {(entry, update) => (
        <>
          <div className="field-grid">
            <Field label="Title" wide>{(id) => <TextInput id={id} value={entry.title} placeholder="Project title" onChange={(title) => update({ title })} />}</Field>
            <Field label="Context">{(id) => <TextInput id={id} value={entry.organization} placeholder="Lab, company, or organization" onChange={(organization) => update({ organization })} />}</Field>
            <Field label="Period">{(id) => <TextInput id={id} value={entry.period} placeholder="2021.09 - 2023.08" onChange={(period) => update({ period })} />}</Field>
          </div>
          <Bullets bullets={entry.bullets} onChange={(bullets) => update({ bullets })} />
        </>
      )}
    </EntryList>
  );
}

function DatedEditor({ items, onChange }: { items: DatedListItem[]; onChange: (items: DatedListItem[]) => void }) {
  return (
    <RowList items={items} onChange={onChange} noun="item" create={() => ({ text: "", date: "" })} className="row-list--dated">
      {(item, update, index) => (
        <>
          <TextArea value={item.text} aria-label={`Item ${index + 1}`} placeholder="Award, talk, or honour" onChange={(text) => update({ text })} />
          <TextInput value={item.date} label={`Date of item ${index + 1}`} placeholder="2024.06" className="text-input--date" onChange={(date) => update({ date })} />
        </>
      )}
    </RowList>
  );
}

function LabelValueEditor({ items, onChange }: { items: LabelValueItem[]; onChange: (items: LabelValueItem[]) => void }) {
  const editableValue = (item: LabelValueItem) =>
    item.codeItems?.length ? item.codeItems.map((codeItem) => `\`${codeItem}\``).join(", ") : item.value;
  return (
    <RowList items={items} onChange={onChange} noun="item" create={(): LabelValueItem => ({ label: "", value: "" })} className="row-list--label-value">
      {(item, update, index) => (
        <>
          <TextInput value={item.label} label={`Label ${index + 1}`} placeholder="Label" className="text-input--label" onChange={(label) => update({ label })} />
          <TextArea
            value={editableValue(item)}
            aria-label={`Value ${index + 1}`}
            placeholder="Python, R, `LaTeX`"
            onChange={(value) => update({ value, codeItems: undefined })}
          />
        </>
      )}
    </RowList>
  );
}

function GroupedEditor({ groups, onChange }: { groups: GroupedListItem[]; onChange: (groups: GroupedListItem[]) => void }) {
  return (
    <EntryList
      items={groups}
      onChange={onChange}
      noun="group"
      create={() => ({ label: "", items: [""] })}
      summary={(group) => ({ title: group.label, meta: `${group.items.length} item${group.items.length === 1 ? "" : "s"}`, detail: group.items.join(" · ") })}
    >
      {(group, update) => (
        <>
          <Field label="Label">{(id) => <TextInput id={id} value={group.label} placeholder="Reviewer for, Organizer, Mentor" onChange={(label) => update({ label })} />}</Field>
          <div className="entry-bullets">
            <span className="entry-bullets-label">Items</span>
            <ListEditor values={group.items} noun="item" placeholder="List item" onChange={(items) => update({ items })} />
          </div>
        </>
      )}
    </EntryList>
  );
}

// ── Section editor ────────────────────────────────────────

const contentTitles: Record<CVBlockType, string> = {
  credential: "Entries",
  role: "Roles",
  project: "Projects",
  "numbered-list": "Items",
  "dated-list": "Items",
  "label-value-list": "Items",
  "grouped-list": "Groups",
  "free-text": "Text"
};

export function BlockEditor({
  block,
  index,
  total,
  issueCount,
  onShowIssues,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  onToggleHidden
}: {
  block: CVBlock;
  index: number;
  total: number;
  issueCount: number;
  onShowIssues: () => void;
  onChange: (block: CVBlock) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
}) {
  return (
    <div className="editor-panel">
      <header className="editor-head">
        <div className="editor-head-title">
          <span className="kicker">
            Section {index + 1} of {total} · {blockTypeLabels[block.type]}
          </span>
          <h2>{block.title.replace(/\n/g, " ") || "Untitled section"}</h2>
        </div>
        <div className="editor-head-actions">
          <IconButton label="Move section up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp size={15} />
          </IconButton>
          <IconButton label="Move section down" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ChevronDown size={15} />
          </IconButton>
          <span className="toolbar-sep" />
          <IconButton label={block.hidden ? "Show section in PDF" : "Hide section from PDF"} pressed={block.hidden} onClick={onToggleHidden}>
            {block.hidden ? <Eye size={15} /> : <EyeOff size={15} />}
          </IconButton>
          <IconButton label="Duplicate section" onClick={onDuplicate}>
            <Copy size={15} />
          </IconButton>
          <IconButton label="Delete section" variant="danger" onClick={onDelete}>
            <Trash2 size={15} />
          </IconButton>
        </div>
      </header>
      <div className="editor-body">
        {block.hidden && (
          <div className="inline-notice">
            <EyeOff size={14} />
            <span>This section is hidden and left out of the PDF.</span>
            <button type="button" className="link-button" onClick={onToggleHidden}>
              Show it
            </button>
          </div>
        )}
        {issueCount > 0 && (
          <div className="inline-notice inline-notice--warn">
            <span className="issue-badge">{issueCount}</span>
            <span>
              layout suggestion{issueCount === 1 ? "" : "s"} for this section, such as a short last line or a page gap.
            </span>
            <button type="button" className="link-button" onClick={onShowIssues}>
              Show
            </button>
          </div>
        )}
        <FormSection title="Section">
          <Field label="Title" hint="Press Enter to break the title over two lines in the left column.">
            {(id) => (
              <TextArea
                id={id}
                className="text-area--title"
                value={block.title}
                formatting={false}
                placeholder="Section title"
                onChange={(title) => onChange({ ...block, title })}
              />
            )}
          </Field>
          <Toggle
            checked={block.pageBreakBefore === true && index > 0}
            disabled={index === 0}
            label="Start on a new page"
            description={
              index === 0
                ? "The first section always starts on the first page."
                : "Long sections already break between entries; use this to force a break before the section."
            }
            onChange={(pageBreakBefore) => onChange({ ...block, pageBreakBefore })}
          />
        </FormSection>

        <FormSection title={contentTitles[block.type]}>
          {block.type === "credential" && <CredentialEditor entries={block.entries} onChange={(entries) => onChange({ ...block, entries })} />}
          {block.type === "role" && <RoleEditor entries={block.entries} onChange={(entries) => onChange({ ...block, entries })} />}
          {block.type === "project" && <ProjectEditor entries={block.entries} onChange={(entries) => onChange({ ...block, entries })} />}
          {block.type === "numbered-list" && (
            <ListEditor
              values={block.items}
              noun="item"
              marker="number"
              placeholder="Author(s). Title. _Venue_, year."
              onChange={(items) => onChange({ ...block, items })}
            />
          )}
          {block.type === "dated-list" && <DatedEditor items={block.items} onChange={(items) => onChange({ ...block, items })} />}
          {block.type === "label-value-list" && <LabelValueEditor items={block.items} onChange={(items) => onChange({ ...block, items })} />}
          {block.type === "grouped-list" && <GroupedEditor groups={block.groups} onChange={(groups) => onChange({ ...block, groups })} />}
          {block.type === "free-text" && (
            <TextArea
              className="text-area--prose"
              value={block.text}
              aria-label="Text"
              placeholder="Available upon request."
              onChange={(text) => onChange({ ...block, text })}
            />
          )}
        </FormSection>
      </div>
      <FormattingFooter />
    </div>
  );
}
