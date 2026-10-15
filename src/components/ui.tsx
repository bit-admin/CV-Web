import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { toggleWrap } from "../lib/editing";

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl+";

export function IconButton({
  label,
  onClick,
  variant = "default",
  size = "md",
  disabled = false,
  pressed,
  children
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={`icon-button icon-button--${variant} icon-button--${size}`}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Label + control + optional hint, laid out as one form row. */
export function Field({ label, hint, children, wide = false }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; wide?: boolean }) {
  const id = useId();
  return (
    <div className={`field${wide ? " field--wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <small className="field-hint">{hint}</small>}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  label,
  className = ""
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <input
      id={id}
      className={`text-input ${className}`}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      spellCheck
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const FORMAT_KEYS: Record<string, string> = { b: "**", i: "_", e: "`" };

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  /** Ctrl/⌘+B, I and E wrap the selection in bold, italic and code markers. */
  formatting?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
};

/** A textarea that grows with its content and understands formatting shortcuts. */
export function TextArea({ value, onChange, formatting = true, className = "", onKeyDown, ref, ...rest }: TextAreaProps) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  const setRefs = (element: HTMLTextAreaElement | null) => {
    inner.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = element;
  };

  useLayoutEffect(() => {
    const element = inner.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 2}px`;
    if (pendingSelection.current) {
      element.setSelectionRange(...pendingSelection.current);
      pendingSelection.current = null;
    }
  }, [value]);

  // Re-measure when the column width changes (window resize, splitter drag).
  useEffect(() => {
    const element = inner.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight + 2}px`;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const marker = FORMAT_KEYS[event.key.toLowerCase()];
    if (formatting && marker && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      const target = event.currentTarget;
      const edit = toggleWrap(target.value, target.selectionStart, target.selectionEnd, marker);
      pendingSelection.current = [edit.selectionStart, edit.selectionEnd];
      onChange(edit.value);
      return;
    }
    onKeyDown?.(event);
  };

  return (
    <textarea
      {...rest}
      ref={setRefs}
      rows={1}
      className={`text-area ${className}`}
      value={value}
      spellCheck
      onKeyDown={handleKeyDown}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle${disabled ? " toggle--disabled" : ""}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-text">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}

/** A button that opens a small menu below it; closes on outside click or Escape. */
export function MenuButton({
  label,
  className,
  children,
  align = "start",
  placement = "below"
}: {
  label: ReactNode;
  className: string;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  placement?: "below" | "above";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [open]);

  return (
    <div className="menu-root" ref={root}>
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {label}
      </button>
      {open && (
        <div className={`menu menu--${align} menu--${placement}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const KEY_SYMBOLS = /([⌘⇧⌥⌃↑↓←→↵])/;

/**
 * A key or shortcut, e.g. `{MOD}Shift+Z`. On a Mac, Shift and Alt become ⇧
 * and ⌥ (⌘⇧Z, ⌥↑), as in native menus. Symbols get a slightly larger size,
 * since most fonts draw them small.
 */
export function Kbd({ children }: { children: ReactNode }) {
  const text = (Array.isArray(children) ? children : [children]).join("");
  const label = isMac ? text.replace(/Shift\+/g, "⇧").replace(/Alt\+/g, "⌥") : text;
  return (
    <kbd className="kbd">
      {label.split(KEY_SYMBOLS).map((part, index) =>
        KEY_SYMBOLS.test(part) ? (
          <span key={index} className="kbd-symbol">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </kbd>
  );
}

/** The “CV” mark (same drawing as public/favicon.svg). */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" fill="currentColor" />
      <path d="M30.06 23.64A9.5 9.5 0 1 0 30.06 36.36" fill="none" stroke="#fff" strokeWidth="5" />
      <path d="M36 18h5.8L46 31.8 50.2 18H56l-7.3 24h-5.4z" fill="#fff" />
      <path d="M8.5 49.5h47.5" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}
