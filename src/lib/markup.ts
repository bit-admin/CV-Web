// The inline markup of editor fields: **bold**, _italic_, `code`, $math$ and
// backslash escapes. Parsed once here and shared by the LaTeX renderer, the
// editor's math warnings, layout matching and the stored-data migration.

export type MarkupNode =
  | { kind: "text"; text: string }
  | { kind: "bold" | "italic"; children: MarkupNode[] }
  | { kind: "code"; text: string }
  /** `error` is set when the formula would not compile; it is then rendered as literal text. */
  | { kind: "math"; source: string; error?: string };

/** Characters a backslash turns into literal text. Any other backslash is itself literal. */
const ESCAPABLE = new Set(["$", "_", "*", "`", "\\"]);

type Atom = { node: MarkupNode; end: number };

/** Escapes `text` so it prints literally, markup characters included. */
export function escapeMarkup(text: string): string {
  // A backslash only needs escaping where it would otherwise escape the next character.
  return text.replace(/[$_*`]|\\(?=[$_*`\\])/g, (char) => `\\${char}`);
}

const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char);
const isDigit = (char: string | undefined) => char !== undefined && char >= "0" && char <= "9";

/**
 * Index of the `$` closing a formula opened at `start`, or -1.
 *
 * Follows Pandoc's rule so prices stay text: the opening `$` must be followed
 * by a non-space, the closing one preceded by a non-space and not followed by
 * a digit. The next unescaped `$` must close the formula, so in
 * "$5 and $10" neither dollar opens one.
 */
function mathEnd(value: string, start: number): number {
  const first = value[start + 1];
  if (first === undefined || isSpace(first) || first === "$") return -1;
  for (let i = start + 1; i < value.length; i++) {
    if (value[i] === "\\") {
      i++;
      continue;
    }
    if (value[i] === "$") {
      return isSpace(value[i - 1]) || isDigit(value[i + 1]) ? -1 : i;
    }
  }
  return -1;
}

/** Escapes, code and math: spans whose content is not parsed for emphasis. */
function atomAt(value: string, index: number): Atom | null {
  const char = value[index];
  if (char === "\\" && ESCAPABLE.has(value[index + 1])) {
    return { node: { kind: "text", text: value[index + 1] }, end: index + 2 };
  }
  if (char === "`") {
    const end = value.indexOf("`", index + 1);
    return end < 0 ? null : { node: { kind: "code", text: value.slice(index + 1, end) }, end: end + 1 };
  }
  if (char === "$") {
    const end = mathEnd(value, index);
    if (end < 0) return null;
    const source = value.slice(index + 1, end);
    const error = validateMath(source);
    return { node: error ? { kind: "math", source, error } : { kind: "math", source }, end: end + 1 };
  }
  return null;
}

/** Index of the closing emphasis `marker`, skipping escapes, code and math. */
function closingMarker(value: string, from: number, marker: string): number {
  let i = from;
  while (i < value.length) {
    const atom = atomAt(value, i);
    if (atom) {
      i = atom.end;
    } else if (value.startsWith(marker, i)) {
      return i;
    } else {
      i++;
    }
  }
  return -1;
}

export function parseMarkup(value: string): MarkupNode[] {
  const nodes: MarkupNode[] = [];
  const pushText = (text: string) => {
    const last = nodes[nodes.length - 1];
    if (last?.kind === "text") last.text += text;
    else nodes.push({ kind: "text", text });
  };

  let i = 0;
  while (i < value.length) {
    const atom = atomAt(value, i);
    if (atom) {
      if (atom.node.kind === "text") pushText(atom.node.text);
      else nodes.push(atom.node);
      i = atom.end;
      continue;
    }

    const marker = value.startsWith("**", i) ? "**" : value[i] === "_" ? "_" : null;
    if (marker) {
      const end = closingMarker(value, i + marker.length, marker);
      if (end >= 0) {
        nodes.push({ kind: marker === "**" ? "bold" : "italic", children: parseMarkup(value.slice(i + marker.length, end)) });
        i = end + marker.length;
        continue;
      }
      pushText(marker);
      i += marker.length;
      continue;
    }

    pushText(value[i]);
    i++;
  }
  return nodes;
}

function collectMath(nodes: MarkupNode[], into: Extract<MarkupNode, { kind: "math" }>[]) {
  for (const node of nodes) {
    if (node.kind === "math") into.push(node);
    else if (node.kind === "bold" || node.kind === "italic") collectMath(node.children, into);
  }
  return into;
}

/** Formulas in a field that will not compile, with the reason; they render as plain text. */
export function mathIssues(value: string): { source: string; error: string }[] {
  if (!value.includes("$")) return [];
  return collectMath(parseMarkup(value), []).flatMap((node) => (node.error ? [{ source: node.source, error: node.error }] : []));
}

/** Text roughly as it reads in the PDF, for matching PDF lines back to fields. */
export function markupToPlainText(value: string): string {
  const plain = (nodes: MarkupNode[]): string =>
    nodes
      .map((node) => {
        switch (node.kind) {
          case "text":
          case "code":
            return node.text;
          case "bold":
          case "italic":
            return plain(node.children);
          case "math":
            // Command names render as symbols, so they are dropped.
            return node.error ? `$${node.source}$` : node.source.replace(/\\[a-zA-Z]+|\\.|[{}^_]/g, " ");
        }
      })
      .join("");
  return plain(parseMarkup(value));
}

/**
 * Escapes every `$` that would now open or close a formula, so text written
 * before math support renders exactly as it did (a literal dollar).
 */
export function escapeMathDollars(value: string): string {
  if (!value.includes("$")) return value;
  let out = "";
  let i = 0;
  while (i < value.length) {
    const char = value[i];
    if (char === "\\" && ESCAPABLE.has(value[i + 1])) {
      // Before math support a backslash was always literal, so `\_` meant a
      // backslash then an italic marker; keep it a literal backslash.
      out += "\\\\";
      i++;
      continue;
    }
    if (char === "`") {
      const end = value.indexOf("`", i + 1);
      if (end >= 0) {
        out += value.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    if (char === "$") {
      const end = mathEnd(value, i);
      if (end >= 0) {
        out += `\\$${escapeMathDollars(value.slice(i + 1, end))}\\$`;
        i = end + 1;
        continue;
      }
    }
    out += char;
    i++;
  }
  return out;
}

// ── Math validation ───────────────────────────────────────
// Formulas go into the LaTeX source verbatim, so only a known-safe subset is
// accepted: anything else would fail the whole compile or run arbitrary TeX.

const SYMBOLS = `
alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho
sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega
times cdot div pm mp ast star circ bullet oplus ominus otimes odot setminus wedge vee cap cup sqcup sqcap uplus
le leq ge geq ne neq lt gt ll gg approx sim simeq cong equiv propto doteq prec succ preceq succeq
in notin ni subset subseteq supset supseteq subsetneq supsetneq perp parallel mid nmid models vdash dashv
to gets rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow longrightarrow longleftarrow
Longrightarrow Longleftarrow longleftrightarrow Longleftrightarrow mapsto longmapsto implies impliedby iff
uparrow downarrow Uparrow Downarrow nearrow searrow swarrow nwarrow hookrightarrow hookleftarrow
rightharpoonup leftharpoonup rightleftharpoons
infty partial nabla forall exists nexists neg lnot land lor top bot emptyset varnothing ell hbar imath jmath
aleph beth Re Im wp angle triangle square blacksquare checkmark dagger ddagger prime backslash surd
ldots cdots vdots ddots dots dotsc dotsb colon
sum prod coprod int iint iiint oint bigcup bigcap bigoplus bigotimes bigvee bigwedge bigsqcup
lim limsup liminf max min sup inf arg det dim ker deg gcd hom Pr exp log ln lg sin cos tan cot sec csc
arcsin arccos arctan sinh cosh tanh coth mod bmod
langle rangle lfloor rfloor lceil rceil lvert rvert lVert rVert vert Vert
quad qquad not limits nolimits displaystyle textstyle scriptstyle
big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr
`;

/** Commands with their number of required arguments; `text` arguments are typeset as text. Exported for
 * scripts/coverage-cvs.ts, which typesets every one so the trimmed TeX Live package holds the files they need. */
export const MATH_COMMANDS = new Map<string, { args: number; text?: boolean; optional?: boolean }>([
  ...SYMBOLS.trim()
    .split(/\s+/)
    .map((name) => [name, { args: 0 }] as const),
  ...["hat", "bar", "tilde", "vec", "dot", "ddot", "check", "breve", "acute", "grave", "widehat", "widetilde"].map(
    (name) => [name, { args: 1 }] as const
  ),
  ...["overline", "underline", "overrightarrow", "overleftarrow", "underbrace", "overbrace", "boxed"].map(
    (name) => [name, { args: 1 }] as const
  ),
  ...["mathbb", "mathcal", "mathbf", "mathrm", "mathit", "mathsf", "mathtt", "mathfrak", "boldsymbol", "operatorname", "pmod"].map(
    (name) => [name, { args: 1 }] as const
  ),
  ...["text", "textrm", "textit", "textbf", "textsf", "texttt", "textnormal", "mbox"].map(
    (name) => [name, { args: 1, text: true }] as const
  ),
  ...["frac", "dfrac", "tfrac", "binom", "dbinom", "tbinom", "overset", "underset", "stackrel"].map(
    (name) => [name, { args: 2 }] as const
  ),
  ["sqrt", { args: 1, optional: true }]
]);

/** Single-character commands: spacing and escaped specials. */
const MATH_SYMBOL_COMMANDS = new Set([",", ";", ":", "!", " ", "{", "}", "|", "$", "%", "&", "#", "_"]);
const TEXT_SYMBOL_COMMANDS = new Set([" ", "{", "}", "$", "%", "&", "#", "_"]);
const DELIMITERS = new Set(["(", ")", "[", "]", "|", ".", "/", "<", ">"]);
export const DELIMITER_COMMANDS = new Set([
  "{", "}", "|", "langle", "rangle", "lfloor", "rfloor", "lceil", "rceil", "lvert", "rvert", "lVert", "rVert", "vert", "Vert",
  "uparrow", "downarrow", "Uparrow", "Downarrow", "backslash"
]);

class MathError extends Error {}

/** Returns why `source` is not an accepted formula, or null when it is. */
export function validateMath(source: string): string | null {
  let i = 0;
  let openLeft = 0;
  const fail = (message: string): never => {
    throw new MathError(message);
  };

  const readCommand = (): string => {
    i++; // backslash
    if (i >= source.length) fail("ends with a lone backslash");
    if (/[a-zA-Z]/.test(source[i])) {
      const start = i;
      while (i < source.length && /[a-zA-Z]/.test(source[i])) i++;
      return source.slice(start, i);
    }
    return source[i++];
  };

  const skipSpaces = () => {
    while (i < source.length && /\s/.test(source[i])) i++;
  };

  const delimiter = (command: string) => {
    skipSpaces();
    if (DELIMITERS.has(source[i])) {
      i++;
      return;
    }
    if (source[i] === "\\") {
      const name = readCommand();
      if (DELIMITER_COMMANDS.has(name)) return;
    }
    fail(`\\${command} must be followed by a delimiter such as ( or [`);
  };

  const command = (text: boolean) => {
    const name = readCommand();
    if (name.length === 1 && !/[a-zA-Z]/.test(name)) {
      if (name === "\\") fail("line breaks (\\\\) are not allowed");
      if (!(text ? TEXT_SYMBOL_COMMANDS : MATH_SYMBOL_COMMANDS).has(name)) fail(`\\${name} is not supported`);
      return;
    }
    if (text) fail(`\\${name} cannot be used inside \\text{…}`);
    if (name === "left" || name === "right") {
      openLeft += name === "left" ? 1 : -1;
      if (openLeft < 0) fail("\\right without a matching \\left");
      delimiter(name);
      return;
    }
    const spec = MATH_COMMANDS.get(name);
    if (!spec) fail(`\\${name} is not supported`);
    if (name === "operatorname" && source[i] === "*") i++;
    if (spec!.optional) {
      skipSpaces();
      if (source[i] === "[") {
        i++;
        sequence(false, "]");
        i++;
      }
    }
    for (let n = 0; n < spec!.args; n++) argument(spec!.text === true, name);
  };

  const argument = (text: boolean, owner: string) => {
    skipSpaces();
    const char = source[i];
    if (char === undefined || char === "}" || char === "]" || char === "^" || char === "_" || char === "&") {
      fail(owner === "^" || owner === "_" ? `${owner} needs something after it` : `\\${owner} is missing an argument`);
    }
    if (char === "{") {
      i++;
      sequence(text, "}");
      i++;
    } else if (char === "\\") {
      command(false);
    } else {
      i++;
    }
  };

  const sequence = (text: boolean, close: "}" | "]" | null) => {
    while (i < source.length) {
      const char = source[i];
      if (char === close) return;
      switch (char) {
        case "{":
          i++;
          sequence(text, "}");
          i++;
          break;
        case "}":
          fail("has an unmatched }");
          break;
        case "\\":
          command(text);
          break;
        case "^":
        case "_":
          if (text) fail(`${char} cannot be used inside \\text{…}`);
          i++;
          argument(false, char);
          break;
        case "%":
        case "#":
        case "&":
        case "$":
          fail(`write \\${char} for a literal ${char}`);
          break;
        default:
          i++;
      }
    }
    if (close) fail(close === "}" ? "is missing a closing }" : "is missing a closing ]");
  };

  try {
    sequence(false, null);
    if (openLeft > 0) fail("\\left without a matching \\right");
    return null;
  } catch (error) {
    if (error instanceof MathError) return error.message;
    throw error;
  }
}

/** First index of `search` outside escapes, code and math, or -1. */
export function indexOutsideAtoms(value: string, search: string): number {
  let i = 0;
  while (i < value.length) {
    const atom = atomAt(value, i);
    if (atom) {
      i = atom.end;
    } else if (value.startsWith(search, i)) {
      return i;
    } else {
      i++;
    }
  }
  return -1;
}
