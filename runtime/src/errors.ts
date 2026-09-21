// A source position and the error types Declare raises for bad source.
// Every syntax / unknown-component / unknown-attribute / bad-value failure
// carries a position so messages point at the offending text; DeclareErrors
// aggregates a whole check pass into one throw.

/** A source position: 1-based line & column, 0-based byte offset — in the
 *  file named by `file` when present, else in the author's own (main) file.
 *  A multi-file program is merged into one text before checking; every
 *  position is rebased onto the file the author wrote, and for an included
 *  file that means naming it. Absent for the main file, so single-file
 *  messages read exactly as they always did. */
export interface Pos {
  line: number;
  col: number;
  offset: number;
  file?: string;
}

/** The position's rendered form: `(line 3, col 7)` in the main file,
 *  `(rooms/pulse.declare:118:23)` in an included one — the editor-clickable
 *  shape, because an author with five files edited by five hands asks "is
 *  this mine?" before anything else. */
export function describePos(pos: Where): string {
  return pos.file !== undefined ? `(${pos.file}:${pos.line}:${pos.col})` : `(line ${pos.line}, col ${pos.col})`;
}

/** Just the part of a Pos a message renders — line, column, and the file when
 *  it is not the author's own. A RUNTIME diagnostic (a layout conflict) knows
 *  where the author wrote the offending value but not its byte offset, so it
 *  carries this and not the full `Pos`. `Pos` satisfies it. */
export interface Where {
  line: number;
  col: number;
  file?: string;
}

/** ` (line 5, col 22)`, or nothing when the position is unknown — a compiled
 *  artifact carries no positions (declarec strips them), so every message that
 *  offers one must read exactly as it did without one. */
export function at(where: Where | null | undefined): string {
  return where == null ? "" : " " + describePos(where);
}

/** Extra metadata a diagnostic carries beyond message + position: a stable
 *  catalog `code` (DECLARE####, diagnostics.ts) and an optional `hint` (a
 *  how-to-fix line). Both are ADDITIVE — they never change `.message`, so the
 *  many tests that assert on message text keep passing; the code/hint surface
 *  only through the Diagnostic view (diagnostics.ts). */
export interface DiagMeta {
  code?: string;
  hint?: string;
}

/** An error in Declare source. `pos`, when present, is folded into the message
 *  so callers get a legible "… (line 2, col 12)" without extra plumbing.
 *  `rawMessage` keeps the message WITHOUT that suffix (the Diagnostic carries
 *  position separately and re-renders it), and `code`/`hint` are the catalog
 *  metadata (unset on a bare `new DeclareError` — compile() assigns a phase code). */
export class DeclareError extends Error {
  readonly pos?: Pos;
  readonly rawMessage: string;
  readonly code?: string;
  readonly hint?: string;
  constructor(message: string, pos?: Pos, meta?: DiagMeta) {
    super(pos ? `${message} ${describePos(pos)}` : message);
    this.name = "DeclareError";
    this.rawMessage = message;
    if (pos) this.pos = pos;
    if (meta?.code !== undefined) this.code = meta.code;
    if (meta?.hint !== undefined) this.hint = meta.hint;
  }
}

/** Everything a check pass found, raised as one throw — build() reports every
 *  problem in the tree, not just the first. It extends DeclareError so existing
 *  `instanceof DeclareError` handling keeps working; `errors` carries the list
 *  (each with its own position), and the message shows one per line. */
export class DeclareErrors extends DeclareError {
  readonly errors: readonly DeclareError[];
  constructor(errors: readonly DeclareError[]) {
    super(
      errors.length === 1
        ? errors[0].message
        : `${errors.length} errors:\n` + errors.map((e) => `  ${e.message}`).join("\n")
    );
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
export function layoutConflictMessage(
  childClass: string,
  slot: string,
  arranger: string,
  by: string | null,
  where?: Where | null
): string {
  const escape = layoutEscape(slot);
  const who = by !== null ? ` (set by ${by})` : "";
  return diag`${childClass}.${slot}${who}${at(where)} — ${arranger} ${arranges(slot)} its children, so this child cannot also own its ${slot}; ${escape}.`;
}

/** What a strategy DOES to the slot it claims — the verb the two messages
 *  share, so "sizes"/"positions" is decided once. */
function arranges(slot: string): string {
  return slot === "width" || slot === "height" ? "sizes" : "positions";
}

/** The two ways out, in the one wording: hand the slot to the layout, or hand
 *  the whole child to the author. Every layout↔author message ends with it. */
function layoutEscape(slot: string): string {
  const verb = slot === "width" || slot === "height" ? "size" : "place";
  return diag`let the layout ${verb} it (drop the child's own ${slot}), or set 'ignoreLayout = true' on the child to take it out of the arrangement`;
}


/** The diagnostic tag — an identity join, and the third constructor the
 *  production error-prose strip (tools/internal/error-codes.mjs) recognizes.
 *  A sentence that reaches its reader through a helper — a builder's return,
 *  an `err(…)`/`fail(…)` argument, a stub's refusal — is `diag\`…\`` so the
 *  strip can code it: dev builds keep the words, a shipped app carries
 *  `[Declare E42] values`, and `declare-help E42` gives the sentence back.
 *  The tag is the author saying "this is a diagnostic, never app copy" — the
 *  strip never has to guess that from a string's shape. */
export function diag(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += String(values[i]) + strings[i + 1];
  return out;
}

/** A production stand-in's refusal: the module `which` was slimmed out of
 *  this build (tools/declarec.mjs), `member` was called anyway, and the door
 *  back is named. Every stub declarec emits throws one of these, so the
 *  sentences live HERE — coded like every other diagnostic — instead of as
 *  prose baked into each stub's source. */
export function notAboard(member: string, which: "checker" | "inspector" | "bridge" | "selectors" | "unused"): Error {
  const why = which === "checker" ? diag`${member}: the checker is not aboard this production build — the program was checked at compile time (declarec --debug keeps the checker)`
    : which === "inspector" ? diag`${member}: the inspector is not aboard this production build (declarec --debug keeps it)`
    : which === "bridge" ? diag`${member}: the introspection bridge is not aboard this production build (declarec --debug keeps it)`
    : which === "unused" ? diag`${member}: not aboard this production build — the program's source names it nowhere, so the build left it out (a name assembled at runtime is not seen — write it in the source)`
    : diag`${member}: path selectors are not aboard this build (the program declared none at compile time — rebuild)`;
  return new Error(why);
}

/** A laid child under `align = baseline` that declares no baseline. A baseline
 *  is CLAIMED, never discovered: a `Text` reports its own, and a composite says
 *  which part carries it (`baseline: number = { cap.y + cap.baseline }`) — the
 *  layout never reaches into a child's composition to guess. The layout keeps
 *  arranging (this child sits at the line's start) and says so once. */
export function noBaselineMessage(childClass: string, arranger: string): string {
  return diag`${childClass} declares no baseline — ${arranger} [ align = baseline ] aligns children by the baseline each declares; declare 'baseline: number = { <label>.y + <label>.baseline }' on ${childClass}, or align by start | center | end.`;
}

/** `align = baseline` on a STACK (a y-axis SimpleLayout): a stack has no line
 *  to sit on — its cross axis is x, where a baseline means nothing. */
export function stackBaselineMessage(arranger: string): string {
  return diag`${arranger} [ axis = y, align = baseline ] — baseline aligns a ROW; a stack has no line, so its cross axis (x) takes start | center | end.`;
}

/** A malformed four-list on an Inset or Radius slot, named for the attribute it
 *  was written on: `padding` counts clockwise from the top, `cornerRadius` from
 *  the top-left corner, and both take one number for all four. The two share a
 *  kind, so the message keys off the NAME — a padding mistake told in corner
 *  words sends the author looking in the wrong place. */
export function insetOrRadiusMessage(owner: string, attr: string): string {
  return `${owner}.${attr}: ${insetOrRadiusShape(attr)}`;
}

/** The shape alone, unowned — for the typecheck's report of the SAME mistake
 *  made inside a `{ }` (`cornerRadius = { [8, 8, 0] }`), where the sentence
 *  already names the slot and tsc would otherwise offer only its type name.
 *  Split out so the literal and the computed form say one thing. */
export function insetOrRadiusShape(attr: string): string {
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
export function strokeShapeMessage(): string {
  return diag`a Stroke on all four sides (stroke(width, color), drawn inside the box), four of them — [top, right, bottom, left] clockwise from the top, null for a bare side — or null for no border at all`;
}
