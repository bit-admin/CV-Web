import { describe, expect, it } from "vitest";
import { splitPastedList, summarizeTexLog, toggleWrap } from "./editing";

describe("toggleWrap", () => {
  it("wraps the selection", () => {
    expect(toggleWrap("make bold now", 5, 9, "**")).toEqual({ value: "make **bold** now", selectionStart: 7, selectionEnd: 11 });
  });

  it("inserts an empty pair at the caret", () => {
    expect(toggleWrap("ab", 1, 1, "_")).toEqual({ value: "a__b", selectionStart: 2, selectionEnd: 2 });
  });

  it("unwraps when the markers surround the selection", () => {
    expect(toggleWrap("make **bold** now", 7, 11, "**")).toEqual({ value: "make bold now", selectionStart: 5, selectionEnd: 9 });
  });

  it("unwraps when the selection includes the markers", () => {
    expect(toggleWrap("a `code` b", 2, 8, "`")).toEqual({ value: "a code b", selectionStart: 2, selectionEnd: 6 });
  });
});

describe("splitPastedList", () => {
  it("splits lines and strips bullet and number markers", () => {
    expect(splitPastedList("• Led a team\n- Shipped X\n\n3. Grew Y\n(4) Cut Z\n* Did W")).toEqual([
      "Led a team",
      "Shipped X",
      "Grew Y",
      "Cut Z",
      "Did W"
    ]);
  });

  it("leaves single-line pastes alone", () => {
    expect(splitPastedList("just one line")).toBeNull();
    expect(splitPastedList("one line\n\n")).toBeNull();
  });

  it("keeps numbers that are part of the text", () => {
    expect(splitPastedList("2024 award\n10x faster")).toEqual(["2024 award", "10x faster"]);
  });
});

describe("summarizeTexLog", () => {
  it("returns the first error with its source line", () => {
    const log = "This is XeTeX\n! Undefined control sequence.\nl.42 \\badmacro\n                {x}\n! Another";
    expect(summarizeTexLog(log)).toEqual({ message: "Undefined control sequence. — near “\\badmacro”", line: 42 });
  });

  it("returns null for a clean log", () => {
    expect(summarizeTexLog("Output written on main.pdf (2 pages).")).toBeNull();
  });
});
