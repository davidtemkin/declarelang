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
/** ` (line 5, col 22)`, or nothing when the position is unknown — a compiled
 *  artifact carries no positions (declarec strips them), so every message that
 *  offers one must read exactly as it did without one. */
export function at(where) {
    return where == null ? "" : " " + describePos(where);
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
/** The ONE wording for a layout↔author conflict, wherever it surfaces — the
 *  checker (a child declaring what its layout places, check.ts), the layout's
 *  own install (layout.ts), the one-owner guard (an author binding installing
 *  over a layout's), and a direct write to an attribute a layout places
 *  (attributes.ts). Named here so every module shares it without a cycle. It
 *  speaks the language's rule (docs/system-design/layout-ownership.md §1–§2):
 *  a layout places its children, and what it places a child does not declare.
 *  A DECLARATION — a literal, a percent, `center`, a `{ }` — is told it does
 *  not belong there; a WRITE from a handler (`write = true`) is told the
 *  attribute is the layout's while it arranges the child. Either way the
 *  message names the layout, the child and attribute, the author's line, and
 *  the two ways out. `by` names who else set it when that helps. */
export function layoutConflictMessage(childClass, slot, arranger, by, where, write = false) {
    const who = by !== null ? ` (set by ${by})` : "";
    const clause = write ? `cannot set its ${slot} while the layout arranges it` : `does not declare its ${slot}`;
    return diag `${childClass}.${slot}${who}${at(where)} — ${arranger} ${arranges(slot)} its children, so this child ${clause}; ${layoutEscape(slot)}.`;
}
/** What a layout DOES to the attribute — "sizes" or "places", decided once. */
function arranges(slot) {
    return slot === "width" || slot === "height" ? "sizes" : slot === "visible" ? "shows and hides" : "places";
}
/** The two ways out, in the one wording: leave it to the layout, or take the
 *  whole child out of the arrangement. Every layout↔author message ends here. */
function layoutEscape(slot) {
    const verb = slot === "width" || slot === "height" ? "size" : slot === "visible" ? "show" : "place";
    return diag `remove it and let the layout ${verb} the child, or set 'ignoreLayout = true' on the child to ${verb} it yourself`;
}
/** A LITERAL on an attribute a layout places — the same sentence as every other
 *  spelling, with the value shown, because the answer never depends on how the
 *  value was written: `y = 99` and `y = { 99 }` are one declaration. */
export function discardedValueMessage(childClass, slot, value, arranger, where) {
    const wrote = value === null ? "" : ` = ${value}`;
    return diag `${childClass}.${slot}${wrote}${at(where)} — ${arranger} ${arranges(slot)} its children, so this child does not declare its ${slot}; ${layoutEscape(slot)}.`;
}
/** A CHILD SIZED FROM A PARENT THAT HAS NO SIZE TO GIVE (docs/system-design/
 *  layout-ownership.md §4): the parent takes its size from its content, the
 *  child does not count toward that content, so on this axis the child's
 *  arithmetic runs from nothing — and lands below zero in every state, not
 *  only a collapsed one. Names both views and how to give the parent a size. */
export function negativeSizeMessage(childClass, size, value, parentClass, onlyContent, where) {
    const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
    const only = onlyContent ? diag `, and this child is the only content it has` : "";
    return diag `${childClass}.${size} is ${shown}${at(where)} — it is sized from its parent (${parentClass}), which takes its ${size} from its content${only}; a child sized from its parent does not count toward that content, so on this axis the parent has no size to give. Give ${parentClass} a ${size}, or use its padding instead of arithmetic.`;
}
/** The checker's form: what the layout places is known from the source, so the
 *  message can also say HOW the author gets what they meant. `kind` is why the
 *  layout places this attribute — along its flow, across it by `align` (a
 *  ResponsiveLayout's cross axis also takes a tier `offset`), because its
 *  configuration is computed and may place either axis, a plan's `share`, a
 *  plan's drop (`share: 0`), or an arrangement that places everything. */
export function placedAttributeMessage(childClass, slot, arranger, kind, where) {
    const head = diag `${childClass}.${slot}${at(where)} — ${arranger} ${arranges(slot)} its children, so this child does not declare its ${slot}`;
    const yourself = diag `set 'ignoreLayout = true' on the child to ${slot === "width" || slot === "height" ? "size" : "place"} it yourself`;
    switch (kind) {
        case "cross":
            return diag `${head}. Across the flow, where a child sits is the layout's 'align'; to place this child yourself, ${yourself}.`;
        case "cross-offset":
            return diag `${head}. Across the flow, where a child sits is the layout's 'align', and a plan entry's 'offset' shifts one child from there; or ${yourself}.`;
        case "computed":
            return diag `${head} — its configuration is computed, so it may place either axis. Remove it, or ${yourself}.`;
        case "share":
            return diag `${head} — a plan gives it a share of the width. Remove it and let the plan size the child, or leave the child out of the share (or name it "auto") to keep its own width.`;
        case "drop":
            return diag `${head} — a plan drops it (share: 0). Remove it and let the plan show and hide the child, or take the child out of that share.`;
        default:
            return diag `${head}. Remove it and let the layout ${slot === "width" || slot === "height" ? "size" : "place"} the child, or ${yourself}.`;
    }
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
/** A malformed four-list on an Inset or Radius slot, named for the attribute it
 *  was written on: `padding` counts clockwise from the top, `cornerRadius` from
 *  the top-left corner, and both take one number for all four. The two share a
 *  kind, so the message keys off the NAME — a padding mistake told in corner
 *  words sends the author looking in the wrong place. */
export function insetOrRadiusMessage(owner, attr) {
    return `${owner}.${attr}: ${insetOrRadiusShape(attr)}`;
}
/** The shape alone, unowned — for the typecheck's report of the SAME mistake
 *  made inside a `{ }` (`cornerRadius = { [8, 8, 0] }`), where the sentence
 *  already names the slot and tsc would otherwise offer only its type name.
 *  Split out so the literal and the computed form say one thing. */
export function insetOrRadiusShape(attr) {
    return attr === "padding"
        ? `an inset is four numbers — [top, right, bottom, left], clockwise from the top; one number insets all four sides`
        : `a per-corner radius is four numbers — [topLeft, topRight, bottomRight, bottomLeft], clockwise from the top-left; one number rounds all four corners`;
}
/** The `stroke` slot's shape — the sibling of `insetOrRadiusMessage` for the
 *  third one-or-four slot, and the one whose sides hold VALUES rather than
 *  numbers. Said in ONE place because TWO paths reach the same mistake and
 *  must say the same sentence: a literal list of the wrong shape, refused at
 *  coercion (value.ts's `STROKE`, via stroke-sides.ts), and a `{ }` body that
 *  computes one, refused by the typecheck at the slot seam (the compiler's
 *  typecheck.ts, which would otherwise report the scaffold's `BoxStroke` type
 *  name and nothing an author can act on). */
export function strokeShapeMessage() {
    return diag `a Stroke on all four sides (stroke(width, color), drawn inside the box), four of them — [top, right, bottom, left] clockwise from the top, null for a bare side — or null for no border at all`;
}
//# sourceMappingURL=errors.js.map