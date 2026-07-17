// The CSS parser: CSS text → typed Rule[]. A faithful port of OpenLaszlo 5's
// compiler/src/css.ts selector tokenizing + specificity, EXTENDED to emit
// compound condition chains (`.red.green`, `view.red`) as a typed AST, and
// DEVIATING deliberately in one way: values are stored as raw trimmed strings
// (RawValue) — all folding (hex/rgb/named/px → number) is the coercers' job
// (css-coerce.ts), never the parser's. Unsupported surface (`!important`,
// `>`/`+`/`~`, pseudo-classes) is rejected cleanly for the checker (M5).

export type RawValue = string;

export type Condition =
  | { kind: "tag"; name: string }
  | { kind: "id"; name: string }
  | { kind: "class"; name: string }
  | { kind: "attr"; name: string; op?: "=" | "~=" | "|="; value?: string };

/** One simple selector — a set of conditions that must ALL hold (compound AND). */
export interface SimpleSelector {
  conditions: Condition[];
}

/** A full selector: ancestor-ordered simple selectors (descendant combinator). */
export type SelectorAST = SimpleSelector[];

export interface Rule {
  selector: SelectorAST;
  specificity: number;
  sourceIndex: number;
  decls: Map<string, RawValue>;
}

export class CssUnsupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CssUnsupported";
  }
}

/** Specificity = sum over every condition: id 100, class/attr 10, tag 1, * 0. */
export function specificityOf(sel: SelectorAST): number {
  let s = 0;
  for (const simple of sel) {
    for (const c of simple.conditions) {
      s += c.kind === "id" ? 100 : c.kind === "tag" ? 1 : 10;
    }
  }
  return s;
}

/** Tokenize one simple selector (`view.red`, `#x`, `[k~=v]`, `*`) into a
 *  SimpleSelector. A leading identifier is the tag; `.x` `#x` `[..]` are
 *  conditions; `*` yields an empty condition list (universal). */
function parseSimple(token: string): SimpleSelector {
  const conditions: Condition[] = [];
  let i = 0;
  const tagMatch = /^[A-Za-z_][\w-]*/.exec(token);
  if (tagMatch) {
    conditions.push({ kind: "tag", name: tagMatch[0] });
    i = tagMatch[0].length;
  } else if (token[0] === "*") {
    i = 1;
  }
  while (i < token.length) {
    const ch = token[i];
    if (ch === ".") {
      const m = /^\.([\w-]+)/.exec(token.slice(i));
      if (!m) throw new CssUnsupported(`unsupported selector near '${token.slice(i)}'`);
      conditions.push({ kind: "class", name: m[1] });
      i += m[0].length;
    } else if (ch === "#") {
      const m = /^#([\w-]+)/.exec(token.slice(i));
      if (!m) throw new CssUnsupported(`unsupported selector near '${token.slice(i)}'`);
      conditions.push({ kind: "id", name: m[1] });
      i += m[0].length;
    } else if (ch === "[") {
      const m = /^\[\s*([\w-]+)\s*(?:([~|]?=)\s*"?([^"\]]*)"?\s*)?\]/.exec(token.slice(i));
      if (!m) throw new CssUnsupported(`unsupported attribute selector near '${token.slice(i)}'`);
      const cond: Condition = { kind: "attr", name: m[1] };
      if (m[2]) {
        cond.op = m[2] as "=" | "~=" | "|=";
        cond.value = m[3];
      }
      conditions.push(cond);
      i += m[0].length;
    } else if (ch === ":" || ch === ">" || ch === "+" || ch === "~") {
      throw new CssUnsupported(`unsupported selector feature '${ch}'`);
    } else {
      throw new CssUnsupported(`unsupported selector near '${token.slice(i)}'`);
    }
  }
  return { conditions };
}

/** Parse a full selector: whitespace-separated simple selectors → a descendant
 *  chain (ancestor-first). Combinators `>`/`+`/`~` and pseudo `:` are rejected. */
export function parseSelectorText(text: string): SelectorAST {
  const trimmed = text.trim();
  // Mask attribute-selector bodies so `~=`/`|=` don't read as combinators.
  const masked = trimmed.replace(/\[[^\]]*\]/g, "[]");
  if (/[>+~]/.test(masked)) throw new CssUnsupported(`unsupported combinator in '${trimmed}'`);
  return trimmed.split(/\s+/).map(parseSimple);
}

/** Parse a declaration body `a: 1; b: 2` into a Map of raw string values.
 *  `!important` is rejected cleanly (out of the supported subset). */
function parseDecls(body: string): Map<string, RawValue> {
  const decls = new Map<string, RawValue>();
  for (const part of body.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue; // blank or malformed fragment
    const name = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (name === "") continue;
    if (/!\s*important/i.test(value)) {
      throw new CssUnsupported(`unsupported '!important' in '${name}: ${value}'`);
    }
    decls.set(name, value);
  }
  return decls;
}

/** Parse a full stylesheet text into Rule[]: strip comments, split
 *  `selector { body }`, expand comma-grouped selectors to one Rule each (shared
 *  decls, own sourceIndex), stamp specificity + a monotonic source index. */
export function parseCss(text: string): Rule[] {
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments)) !== null) {
    const selectorGroup = m[1].trim();
    const decls = parseDecls(m[2]);
    for (const selText of selectorGroup.split(",")) {
      const trimmed = selText.trim();
      if (trimmed === "") continue;
      const selector = parseSelectorText(trimmed);
      rules.push({ selector, specificity: specificityOf(selector), sourceIndex: rules.length, decls });
    }
  }
  return rules;
}
