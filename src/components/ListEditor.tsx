import { useEffect, useRef } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { splitPastedList } from "../lib/editing";
import { keys as shortcut, TextArea } from "./ui";

let keySeed = 0;
const nextKey = () => `k${(keySeed += 1)}`;

/**
 * Stable React keys for a list edited by index, so focus and caret survive
 * inserts, removals and moves. Callers apply the same operation to the keys
 * as to the values; any other length change resyncs.
 */
export function useListKeys(length: number) {
  const keys = useRef<string[]>([]);
  if (keys.current.length !== length) {
    keys.current = keys.current.slice(0, length);
    while (keys.current.length < length) keys.current.push(nextKey());
  }
  return {
    keys: keys.current,
    insert(index: number, count = 1) {
      keys.current.splice(index, 0, ...Array.from({ length: count }, nextKey));
    },
    remove(index: number) {
      keys.current.splice(index, 1);
    },
    move(from: number, to: number) {
      const [key] = keys.current.splice(from, 1);
      keys.current.splice(to, 0, key);
    }
  };
}

type Marker = "bullet" | "number" | "none";

/** Up/down arrows shown in the row gutter on hover. */
export function MoveButtons({ noun, index, count, onMove }: { noun: string; index: number; count: number; onMove: (to: number) => void }) {
  return (
    <span className="list-move">
      <button type="button" aria-label={`Move ${noun} up (${shortcut("Alt+↑")})`} title={`Move up (${shortcut("Alt+↑")})`} disabled={index === 0} onClick={() => onMove(index - 1)}>
        <ArrowUp size={11} />
      </button>
      <button type="button" aria-label={`Move ${noun} down (${shortcut("Alt+↓")})`} title={`Move down (${shortcut("Alt+↓")})`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
        <ArrowDown size={11} />
      </button>
    </span>
  );
}

export function ListEditor({
  values,
  onChange,
  noun,
  placeholder,
  marker = "bullet"
}: {
  values: string[];
  onChange: (values: string[]) => void;
  /** Singular, lower case: "bullet", "item", "contact". */
  noun: string;
  placeholder?: string;
  marker?: Marker;
}) {
  const { keys, insert, remove, move } = useListKeys(values.length);
  const fields = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ key: string; caret: "start" | "end" } | null>(null);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const field = fields.current.get(pending.key);
    if (field) {
      field.focus();
      const position = pending.caret === "start" ? 0 : field.value.length;
      field.setSelectionRange(position, position);
      pendingFocus.current = null;
    }
  });

  const focusLater = (index: number, caret: "start" | "end" = "end") => {
    pendingFocus.current = { key: keys[index], caret };
  };

  const set = (index: number, value: string) => onChange(values.map((item, i) => (i === index ? value : item)));

  const add = (index: number, items: string[] = [""]) => {
    insert(index, items.length);
    focusLater(index + items.length - 1);
    onChange([...values.slice(0, index), ...items, ...values.slice(index)]);
  };

  const removeAt = (index: number, focus: "previous" | "next" | null = null) => {
    remove(index);
    if (focus === "previous" && index > 0) focusLater(index - 1);
    if (focus === "next" && index < values.length - 1) focusLater(index, "start");
    onChange(values.filter((_, i) => i !== index));
  };

  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= values.length) return;
    move(from, to);
    focusLater(to);
    const next = [...values];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget;
    const atStart = field.selectionStart === 0 && field.selectionEnd === 0;
    const atEnd = field.selectionStart === field.value.length;

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      // Enter in the middle splits the item, like a word processor.
      const before = field.value.slice(0, field.selectionStart).trimEnd();
      const after = field.value.slice(field.selectionEnd).trimStart();
      insert(index + 1);
      pendingFocus.current = { key: keys[index + 1], caret: "start" };
      onChange([...values.slice(0, index), before, after, ...values.slice(index + 1)]);
    } else if (event.key === "Backspace" && atStart && field.value === "" && values.length > 1) {
      event.preventDefault();
      removeAt(index, index > 0 ? "previous" : "next");
    } else if (event.key === "Backspace" && atStart && index > 0 && !event.repeat) {
      // Joins this item onto the end of the previous one.
      event.preventDefault();
      const previous = values[index - 1];
      const joined = previous && field.value ? `${previous} ${field.value}` : previous + field.value;
      remove(index);
      pendingFocus.current = { key: keys[index - 1], caret: "end" };
      onChange([...values.slice(0, index - 1), joined, ...values.slice(index + 1)]);
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      moveTo(index, index + (event.key === "ArrowUp" ? -1 : 1));
    } else if (event.key === "ArrowUp" && atStart && index > 0 && !event.shiftKey) {
      event.preventDefault();
      fields.current.get(keys[index - 1])?.focus();
    } else if (event.key === "ArrowDown" && atEnd && index < values.length - 1 && !event.shiftKey) {
      event.preventDefault();
      const next = fields.current.get(keys[index + 1]);
      next?.focus();
      next?.setSelectionRange(0, 0);
    }
  };

  const handlePaste = (index: number) => (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const lines = splitPastedList(event.clipboardData.getData("text/plain"));
    if (!lines) return;
    event.preventDefault();
    const field = event.currentTarget;
    const before = field.value.slice(0, field.selectionStart);
    const after = field.value.slice(field.selectionEnd);
    let items = [...lines];
    if (before.trim() && !after.trim()) {
      // Caret at the end of a filled item: the pasted lines become new items after it.
      items = [before.trimEnd(), ...lines];
    } else {
      items[0] = `${before}${items[0]}`;
      items[items.length - 1] = `${items[items.length - 1]}${after}`;
    }
    insert(index + 1, items.length - 1);
    pendingFocus.current = { key: keys[index + items.length - 1], caret: "end" };
    onChange([...values.slice(0, index), ...items, ...values.slice(index + 1)]);
  };

  return (
    <div className={`list-editor list-editor--${marker}`}>
      {values.length === 0 && <p className="list-empty">No {noun}s yet.</p>}
      <ol className="list-rows">
        {values.map((value, index) => (
          <li className="list-row" key={keys[index]}>
            <span className="list-gutter">
              <span className="list-marker" aria-hidden="true">
                {marker === "number" ? `${index + 1}.` : marker === "bullet" ? "•" : ""}
              </span>
              <MoveButtons noun={noun} index={index} count={values.length} onMove={(to) => moveTo(index, to)} />
            </span>
            <TextArea
              ref={(element) => {
                if (element) fields.current.set(keys[index], element);
                else fields.current.delete(keys[index]);
              }}
              className="text-area--removable"
              value={value}
              aria-label={`${noun} ${index + 1}`}
              placeholder={placeholder}
              onChange={(next) => set(index, next)}
              onKeyDown={handleKeyDown(index)}
              onPaste={handlePaste(index)}
            />
            <button type="button" className="row-remove" aria-label={`Remove ${noun} ${index + 1}`} title={`Remove ${noun}`} onClick={() => removeAt(index)}>
              <X size={12} />
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="add-row" onClick={() => add(values.length)}>
        <Plus size={13} />
        Add {noun}
      </button>
    </div>
  );
}
