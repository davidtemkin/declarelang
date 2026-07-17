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
