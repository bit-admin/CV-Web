import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Copy, ListCollapse, ListTree, Plus, Trash2 } from "lucide-react";
import { useListKeys } from "./ListEditor";
import { IconButton } from "./ui";

/**
 * Cards for the entries of a section (degrees, roles, projects, groups).
 * Each card collapses to a one-line summary so long sections stay scannable.
 */
export function EntryList<T>({
  items,
  onChange,
  noun,
  create,
  summary,
  children
}: {
  items: T[];
  onChange: (items: T[]) => void;
  noun: string;
  create: () => T;
  summary: (item: T, index: number) => { title: string; meta?: string; detail?: string };
  children: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
}) {
  const { keys, insert, remove, move } = useListKeys(items.length);
  // Short sections start expanded; long ones start as an overview.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(items.length > 3 ? keys : []));
  const allCollapsed = items.length > 0 && keys.every((key) => collapsed.has(key));

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const update = (index: number) => (patch: Partial<T>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const moveTo = (from: number, to: number) => {
    move(from, to);
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const duplicate = (index: number) => {
    insert(index + 1);
    onChange([...items.slice(0, index + 1), structuredClone(items[index]), ...items.slice(index + 1)]);
  };

  const add = () => {
    insert(items.length);
    onChange([...items, create()]);
  };

  return (
    <div className="entry-list">
      <div className="entry-list-head">
        <span>
          {items.length} {noun}
          {items.length === 1 ? "" : "s"}
        </span>
        {items.length > 1 && (
          <button
            type="button"
            className="link-button"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(keys))}
          >
            {allCollapsed ? <ListTree size={13} /> : <ListCollapse size={13} />}
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        )}
      </div>
      {items.map((item, index) => {
        const key = keys[index];
        const isCollapsed = collapsed.has(key);
        const { title, meta, detail } = summary(item, index);
        return (
          <section className={`entry-card${isCollapsed ? " entry-card--collapsed" : ""}`} key={key}>
            <header className="entry-card-head">
              <button type="button" className="entry-card-toggle" aria-expanded={!isCollapsed} onClick={() => toggle(key)}>
                <ChevronRight size={14} className="entry-card-chevron" />
                <span className="entry-card-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="entry-card-title">
                  <strong>{title || `Untitled ${noun}`}</strong>
                  {isCollapsed && detail && <small>{detail}</small>}
                </span>
                {meta && <span className="entry-card-meta">{meta}</span>}
              </button>
              <span className="entry-card-actions">
                <IconButton size="sm" variant="ghost" label={`Move ${noun} up`} disabled={index === 0} onClick={() => moveTo(index, index - 1)}>
                  <ArrowUp size={13} />
                </IconButton>
                <IconButton size="sm" variant="ghost" label={`Move ${noun} down`} disabled={index === items.length - 1} onClick={() => moveTo(index, index + 1)}>
                  <ArrowDown size={13} />
                </IconButton>
                <IconButton size="sm" variant="ghost" label={`Duplicate ${noun}`} onClick={() => duplicate(index)}>
                  <Copy size={13} />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="danger"
                  label={`Delete ${noun}`}
                  onClick={() => {
                    remove(index);
                    onChange(items.filter((_, i) => i !== index));
                  }}
                >
                  <Trash2 size={13} />
                </IconButton>
              </span>
            </header>
            {!isCollapsed && <div className="entry-card-body">{children(item, update(index), index)}</div>}
          </section>
        );
      })}
      <button type="button" className="add-row add-row--card" onClick={add}>
        <Plus size={13} />
        Add {noun}
      </button>
    </div>
  );
}
