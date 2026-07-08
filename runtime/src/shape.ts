// The Shape value type's literal grammar: SVG path *data* — the `d`
// mini-grammar only, deliberately NOT SVG-the-document-model with its
// DOM/CSS/event semantics (ruled in HANDOFF "The rendering model"). Both
// backends consume the string natively (`new Path2D(d)` / `clip-path:
// path(…)`) — but neither of those APIs *reports* a malformed path (they
// silently stop parsing at the first error), so this validator is the
// language's only guard, run at check time so the message lands on the
// offending literal.

/** Arguments per path command (upper- and lowercase alike); Z takes none. */
const ARITY: Readonly<Record<string, number>> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};

const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/;

/** Validate SVG path data. Returns null when well-formed, else a human
 *  description of the first problem (value.ts folds it into the check
 *  error's "found …" half). */
export function validatePathData(d: string): string | null {
  let i = 0;
  const skip = () => {
    while (i < d.length && (d[i] === " " || d[i] === "," || d[i] === "\t" || d[i] === "\n" || d[i] === "\r")) i++;
  };
  skip();
  if (i >= d.length) return "an empty path";
  if (d[i].toUpperCase() !== "M") return `a path starts with M or m, not '${d[i]}'`;
  while (i < d.length) {
    const cmd = d[i];
    const arity = Object.hasOwn(ARITY, cmd.toUpperCase()) ? ARITY[cmd.toUpperCase()] : undefined;
    if (arity === undefined) return `'${cmd}' is not a path command (character ${i + 1})`;
    i++;
    skip();
    if (arity === 0) continue;
    // One or more argument sets may follow a command (SVG's implicit
    // repeat); another set is coming iff the next character starts a number.
    do {
      for (let k = 0; k < arity; k++) {
        skip();
        const m = NUMBER.exec(d.slice(i));
        if (m === null) return `'${cmd}' expects ${arity} number${arity > 1 ? "s" : ""} per segment (character ${i + 1})`;
        i += m[0].length;
      }
      skip();
    } while (i < d.length && (d[i] === "+" || d[i] === "-" || d[i] === "." || (d[i] >= "0" && d[i] <= "9")));
  }
  return null;
}
