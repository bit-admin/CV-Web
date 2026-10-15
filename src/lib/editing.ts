// Pure text-editing helpers used by the editor fields.

export type TextEdit = { value: string; selectionStart: number; selectionEnd: number };

/**
 * Wraps the selection in a Markdown-style marker (`**`, `_` or `` ` ``), or
 * removes the marker when the selection is already wrapped. With no
 * selection, inserts an empty pair and puts the caret between them.
 */
export function toggleWrap(value: string, start: number, end: number, marker: string): TextEdit {
  const m = marker.length;
  const selected = value.slice(start, end);

  // Selection includes the markers: "**bold**".
  if (selected.length >= 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(m, -m);
    return { value: value.slice(0, start) + inner + value.slice(end), selectionStart: start, selectionEnd: start + inner.length };
  }
  // Markers sit just outside the selection: **[bold]**.
  if (start >= m && value.slice(start - m, start) === marker && value.slice(end, end + m) === marker) {
    return {
      value: value.slice(0, start - m) + selected + value.slice(end + m),
      selectionStart: start - m,
      selectionEnd: end - m
    };
  }
  return {
    value: value.slice(0, start) + marker + selected + marker + value.slice(end),
    selectionStart: start + m,
    selectionEnd: end + m
  };
}

const LIST_MARKER = /^\s*(?:[-*•·▪◦‣–—]|\d{1,3}[.)]|\(\d{1,3}\)|[a-z][.)])\s+/i;

/**
 * Splits pasted text into list items: one per non-empty line, with leading
 * bullet or number markers removed. Returns null for single-line text, so
 * the paste can proceed normally.
 */
export function splitPastedList(text: string): string[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(LIST_MARKER, "").trim())
    .filter(Boolean);
  return lines.length > 1 ? lines : null;
}

/** Short summary of a TeX compile log: the first error and the line it points at. */
export function summarizeTexLog(log: string): { message: string; line?: number } | null {
  const lines = log.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith("! "));
  if (index < 0) {
    const fatal = lines.find((line) => /fatal error|emergency stop|exited with/i.test(line));
    return fatal ? { message: fatal.trim() } : null;
  }
  const message = lines[index].slice(2).trim();
  for (const line of lines.slice(index + 1, index + 12)) {
    const match = /^l\.(\d+)\s?(.*)$/.exec(line);
    if (match) {
      return { message: match[2] ? `${message} — near “${match[2].trim().slice(-40)}”` : message, line: Number(match[1]) };
    }
  }
  return { message };
}
