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
/** The ONE wording for a layout↔author slot conflict, wherever it surfaces —
 *  the layout's own claim (layout.ts install), the general one-owner guard
 *  (an author binding installing over a layout claim), and a direct write to a
 *  layout-owned slot (attributes.ts). Named here so both modules share it
 *  without a cycle (layout imports attributes). It names the LAYOUT as the
 *  arranger, the child + slot, and the resolution — let the layout do it, or
 *  take the child out of the arrangement. `by` names who else set the slot
 *  when that helps (a direct write); null when the child obviously authored
 *  it. */
export function layoutConflictMessage(childClass, slot, arranger, by) {
    const size = slot === "width" || slot === "height";
    const owned = size ? "sizes" : "positions";
    const escape = diag `let the layout ${size ? "size" : "place"} it (drop the child's own ${slot}), or set 'ignoreLayout = true' on the child to take it out of the arrangement`;
    const who = by !== null ? ` (set by ${by})` : "";
    return diag `${childClass}.${slot}${who} — ${arranger} ${owned} its children, so this child cannot also own its ${slot}; ${escape}.`;
}
/** The diagnostic tag — an identity join, and the third constructor the
 *  production error-prose strip (tools/internal/error-codes.mjs) recognizes.
 *  A sentence that reaches its reader through a helper — a builder's return,
 *  an `err(…)`/`fail(…)` argument, a stub's refusal — is `diag\`…\`` so the
 *  strip can code it: dev builds keep the words, a shipped app carries
 *  `[Declare E42] values`, and `declare-help E42` gives the sentence back.
 *  The tag is the author saying "this is a diagnostic, never app copy" — the
 *  strip never has to guess that from a string's shape. */
export function diag(strings, ...values) {
    let out = strings[0];
    for (let i = 0; i < values.length; i++)
        out += String(values[i]) + strings[i + 1];
    return out;
}
/** A production stand-in's refusal: the module `which` was slimmed out of
 *  this build (tools/declarec.mjs), `member` was called anyway, and the door
 *  back is named. Every stub declarec emits throws one of these, so the
 *  sentences live HERE — coded like every other diagnostic — instead of as
 *  prose baked into each stub's source. */
export function notAboard(member, which) {
    const why = which === "checker" ? diag `${member}: the checker is not aboard this production build — the program was checked at compile time (declarec --debug keeps the checker)`
        : which === "inspector" ? diag `${member}: the inspector is not aboard this production build (declarec --debug keeps it)`
            : which === "bridge" ? diag `${member}: the introspection bridge is not aboard this production build (declarec --debug keeps it)`
                : which === "unused" ? diag `${member}: not aboard this production build — the program's source names it nowhere, so the build left it out (a name assembled at runtime is not seen — write it in the source)`
                    : diag `${member}: path selectors are not aboard this build (the program declared none at compile time — rebuild)`;
    return new Error(why);
}
/** A laid child under `align = baseline` that declares no baseline. A baseline
 *  is CLAIMED, never discovered: a `Text` reports its own, and a composite says
 *  which part carries it (`baseline: number = { cap.y + cap.baseline }`) — the
 *  layout never reaches into a child's composition to guess. The layout keeps
 *  arranging (this child sits at the line's start) and says so once. */
export function noBaselineMessage(childClass, arranger) {
    return diag `${childClass} declares no baseline — ${arranger} [ align = baseline ] aligns children by the baseline each declares; declare 'baseline: number = { <label>.y + <label>.baseline }' on ${childClass}, or align by start | center | end.`;
}
/** `align = baseline` on a STACK (a y-axis SimpleLayout): a stack has no line
 *  to sit on — its cross axis is x, where a baseline means nothing. */
export function stackBaselineMessage(arranger) {
    return diag `${arranger} [ axis = y, align = baseline ] — baseline aligns a ROW; a stack has no line, so its cross axis (x) takes start | center | end.`;
}
//# sourceMappingURL=errors.js.map