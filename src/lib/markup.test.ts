import { describe, expect, it } from "vitest";
import { createEmptyDocument, migrateDocumentMarkup, normalizeWorkspace } from "./document";
import { inlineLatex, renderLatex } from "./latex";
import { escapeMarkup, escapeMathDollars, markupToPlainText, mathIssues, validateMath } from "./markup";
import type { CVDocument } from "./types";

describe("inline math", () => {
  it("typesets $…$ as math", () => {
    expect(inlineLatex("Cut latency to $O(n \\log n)$.")).toBe("Cut latency to $O(n \\log n)$.");
    expect(inlineLatex("$\\alpha = 0.05$")).toBe("$\\alpha = 0.05$");
  });

  it("keeps prices as text", () => {
    for (const text of ["Raised $2M and $3M.", "$5–$10k per seat", "between $50k-$100k", "costs $ 5 and $", "US$5", "($5M)"]) {
      expect(inlineLatex(text)).not.toMatch(/(^|[^\\])\$/);
    }
    expect(inlineLatex("$5 and $10 on $x$")).toBe("\\$5 and \\$10 on $x$");
  });

  it("does not read subscripts as italic markers", () => {
    expect(inlineLatex("$x_i$ and $y_j$")).toBe("$x_i$ and $y_j$");
    expect(inlineLatex("_Journal of $\\mathcal{O}$-Notation_")).toBe("\\textit{Journal of $\\mathcal{O}$-Notation}");
  });

  it("nests math in emphasis and emphasis in emphasis", () => {
    expect(inlineLatex("**$O(n)$ time**")).toBe("\\textbf{$O(n)$ time}");
    expect(inlineLatex("**A _b_ C**")).toBe("\\textbf{A \\textit{b} C}");
  });

  it("keeps dollars in code literal", () => {
    expect(inlineLatex("`$PATH` and `$x$`")).toBe("{\\MonoSmallFont \\$PATH} and {\\MonoSmallFont \\$x\\$}");
  });

  it("supports backslash escapes", () => {
    expect(inlineLatex("\\$5, snake\\_case, \\*, \\`, \\\\")).toBe("\\$5, snake\\_case, *, `, \\textbackslash{}");
    expect(inlineLatex("C:\\Users")).toBe("C:\\textbackslash{}Users");
    expect(inlineLatex("\\$x\\$")).toBe("\\$x\\$");
  });

  it("prints a formula that would not compile as typed", () => {
    expect(inlineLatex("$\\frac{1}{2$")).toBe("\\$\\textbackslash{}frac\\{1\\}\\{2\\$");
    expect(inlineLatex("$\\input{secret}$")).toBe("\\$\\textbackslash{}input\\{secret\\}\\$");
  });

  it("keeps commas in formulas out of the dated-list split", () => {
    const workspace = normalizeWorkspace({
      version: 3,
      markup: 2,
      activeLanguage: "en",
      languages: [
        {
          code: "en",
          enabled: true,
          document: {
            ...createEmptyDocument(),
            blocks: [{ id: "a", type: "dated-list", title: "Awards", items: [{ text: "Bound on $f(x, y)$, NeurIPS", date: "2024" }] }]
          }
        }
      ]
    });
    expect(renderLatex(workspace!)).toContain("\\item \\emph{Bound on $f(x, y)$}, NeurIPS \\hfill 2024");
  });
});

describe("math validation", () => {
  it("accepts common formulas", () => {
    for (const source of [
      "O(n^2)",
      "\\sum_{i=1}^{n} x_i",
      "\\frac{a}{b}",
      "\\sqrt[3]{x}",
      "\\{x \\mid x > 0\\}",
      "\\left( \\frac{a}{b} \\right)",
      "\\left\\{ x \\right.",
      "\\text{F1-score} \\ge 0.9",
      "\\mathbb{E}[X]",
      "\\operatorname*{arg\\,min}_x f(x)",
      "\\hat\\beta",
      "10^{-4}",
      "\\lambda \\in [10^{-4}, 10^{-2}]"
    ]) {
      expect(validateMath(source), source).toBeNull();
    }
  });

  it("rejects formulas that would break the compile or run TeX", () => {
    expect(validateMath("\\input{x}")).toBe("\\input is not supported");
    expect(validateMath("\\def\\x{1}")).toBe("\\def is not supported");
    expect(validateMath("\\frac{1}{2")).toBe("is missing a closing }");
    expect(validateMath("a}")).toBe("has an unmatched }");
    expect(validateMath("\\frac{1}")).toBe("\\frac is missing an argument");
    expect(validateMath("x^")).toBe("^ needs something after it");
    expect(validateMath("50%")).toBe("write \\% for a literal %");
    expect(validateMath("a & b")).toBe("write \\& for a literal &");
    expect(validateMath("a \\\\ b")).toBe("line breaks (\\\\) are not allowed");
    expect(validateMath("\\left( x")).toBe("\\left without a matching \\right");
    expect(validateMath("x \\right)")).toBe("\\right without a matching \\left");
    expect(validateMath("\\text{a_b}")).toBe("_ cannot be used inside \\text{…}");
    expect(validateMath("\\text{\\alpha}")).toBe("\\alpha cannot be used inside \\text{…}");
    expect(validateMath("x \\")).toBe("ends with a lone backslash");
  });

  it("reports invalid formulas in a field", () => {
    expect(mathIssues("ok $x$ and $\\foo$")).toEqual([{ source: "\\foo", error: "\\foo is not supported" }]);
    expect(mathIssues("**$\\frac{1}$**")).toEqual([{ source: "\\frac{1}", error: "\\frac is missing an argument" }]);
    expect(mathIssues("$5 and $10")).toEqual([]);
  });

  it("escapes a formula back to literal text", () => {
    const text = escapeMarkup("$\\input{a_b}$");
    expect(mathIssues(text)).toEqual([]);
    expect(text).toBe("\\$\\input{a\\_b}\\$");
    expect(inlineLatex(text)).toBe("\\$\\textbackslash{}input\\{a\\_b\\}\\$");
    expect(inlineLatex(escapeMarkup("a\\\\b \\$ **"))).toBe("a\\textbackslash{}\\textbackslash{}b \\textbackslash{}\\$ **");
  });
});

describe("plain text for layout matching", () => {
  it("drops markers and command names", () => {
    expect(markupToPlainText("**Bold** _it_ `code` $O(n \\log n)$ \\$5")).toBe("Bold it code O(n   n) $5");
  });
});

describe("markup migration", () => {
  const before = [
    "Raised $2M and $3M.",
    "Paid $5 for $10M deal and 10$",
    "Revenue grew from $1M to $3M$ in total",
    "C:\\Users\\_name_ and \\$5",
    "`$x$` and **$a$ b**",
    "_italic $x_1$ and y_2"
  ];

  it("leaves old text rendering exactly as before", () => {
    const legacyInline = (value: string) => {
      // The renderer before math support: every special character literal, $ included.
      const escape = (text: string) =>
        text.replace(/[\\{}$&#%_~^]/g, (char) => ({ "\\": "\\textbackslash{}", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}" })[char] ?? `\\${char}`);
      let out = "";
      let index = 0;
      while (index < value.length) {
        const starts = [value.indexOf("**", index), value.indexOf("_", index), value.indexOf("`", index)].filter((p) => p >= 0);
        if (starts.length === 0) return out + escape(value.slice(index));
        const start = Math.min(...starts);
        out += escape(value.slice(index, start));
        const [open, close, wrap] =
          start === value.indexOf("**", index)
            ? ["**", "**", (t: string) => `\\textbf{${t}}`]
            : value[start] === "`"
              ? ["`", "`", (t: string) => `{\\MonoSmallFont ${t}}`]
              : ["_", "_", (t: string) => `\\textit{${t}}`];
        const end = value.indexOf(close, start + open.length);
        if (end < 0) return out + escape(value.slice(start));
        out += wrap(escape(value.slice(start + open.length, end)));
        index = end + close.length;
      }
      return out;
    };

    for (const text of before) {
      expect(inlineLatex(escapeMathDollars(text)), text).toBe(legacyInline(text));
    }
  });

  it("migrates stored workspaces once", () => {
    const document: CVDocument = {
      ...createEmptyDocument(),
      header: { name: "A", suffix: "", contacts: ["$x$"] },
      blocks: [
        { id: "b", type: "free-text", title: "Notes $a$", text: "From $1M to $3M$ total" },
        { id: "c", type: "label-value-list", title: "Skills", items: [{ label: "$a$", value: "x", codeItems: ["$y$"] }] }
      ]
    };
    const legacy = normalizeWorkspace({ version: 3, activeLanguage: "en", languages: [{ code: "en", enabled: true, document }] });
    const migrated = legacy!.languages[0].document;
    expect(legacy!.markup).toBe(2);
    expect(migrated.header.contacts).toEqual(["\\$x\\$"]);
    expect(migrated.blocks[0]).toMatchObject({ title: "Notes $a$", text: "From $1M to \\$3M\\$ total" });
    expect(migrated.blocks[1]).toMatchObject({ items: [{ label: "\\$a\\$", value: "x", codeItems: ["$y$"] }] });

    // Already-current data is left alone.
    expect(normalizeWorkspace(legacy)!.languages[0].document).toEqual(migrated);
    expect(migrateDocumentMarkup(createEmptyDocument())).toEqual(createEmptyDocument());
  });
});
