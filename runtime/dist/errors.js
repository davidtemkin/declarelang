// A source position and the error types Declare raises for bad source.
// Every syntax / unknown-component / unknown-attribute / bad-value failure
// carries a position so messages point at the offending text; DeclareErrors
// aggregates a whole check pass into one throw.
/** The position's rendered form: `(line 3, col 7)` in the main file,
 *  `(rooms/pulse.declare:118:23)` in an included one — the editor-clickable
 *  shape, because an author with five files edited by five hands asks "is
 *  this mine?" before anything else. */
export function describePos(pos) {
    return pos.file !== undefined ? `(${pos.file}:${pos.line}:${pos.col})` : `(line ${pos.line}, col ${pos.col})`;
}
/** An error in Declare source. `pos`, when present, is folded into the message
 *  so callers get a legible "… (line 2, col 12)" without extra plumbing.
 *  `rawMessage` keeps the message WITHOUT that suffix (the Diagnostic carries
 *  position separately and re-renders it), and `code`/`hint` are the catalog
 *  metadata (unset on a bare `new DeclareError` — compile() assigns a phase code). */
export class DeclareError extends Error {
    pos;
    rawMessage;
    code;
    hint;
    constructor(message, pos, meta) {
        super(pos ? `${message} ${describePos(pos)}` : message);
        this.name = "DeclareError";
        this.rawMessage = message;
        if (pos)
            this.pos = pos;
        if (meta?.code !== undefined)
            this.code = meta.code;
        if (meta?.hint !== undefined)
            this.hint = meta.hint;
    }
}
/** Everything a check pass found, raised as one throw — build() reports every
 *  problem in the tree, not just the first. It extends DeclareError so existing
 *  `instanceof DeclareError` handling keeps working; `errors` carries the list
 *  (each with its own position), and the message shows one per line. */
export class DeclareErrors extends DeclareError {
    errors;
    constructor(errors) {
        super(errors.length === 1
            ? errors[0].message
            : `${errors.length} errors:\n` + errors.map((e) => `  ${e.message}`).join("\n"));
        this.name = "DeclareErrors";
        this.errors = errors;
    }
}
//# sourceMappingURL=errors.js.map