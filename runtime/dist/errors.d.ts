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
export declare function describePos(pos: Where): string;
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
export declare function at(where: Where | null | undefined): string;
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
export declare class DeclareError extends Error {
    readonly pos?: Pos;
    readonly rawMessage: string;
    readonly code?: string;
    readonly hint?: string;
    constructor(message: string, pos?: Pos, meta?: DiagMeta);
}
/** Everything a check pass found, raised as one throw — build() reports every
 *  problem in the tree, not just the first. It extends DeclareError so existing
 *  `instanceof DeclareError` handling keeps working; `errors` carries the list
 *  (each with its own position), and the message shows one per line. */
export declare class DeclareErrors extends DeclareError {
    readonly errors: readonly DeclareError[];
    constructor(errors: readonly DeclareError[]);
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
export declare function layoutConflictMessage(childClass: string, slot: string, arranger: string, by: string | null, where?: Where | null, write?: boolean): string;
/** A LITERAL on an attribute a layout places — the same sentence as every other
 *  spelling, with the value shown, because the answer never depends on how the
 *  value was written: `y = 99` and `y = { 99 }` are one declaration. */
export declare function discardedValueMessage(childClass: string, slot: string, value: string | null, arranger: string, where?: Where | null): string;
/** A CHILD SIZED FROM A PARENT THAT HAS NO SIZE TO GIVE (docs/system-design/
 *  layout-ownership.md §4): the parent takes its size from its content, the
 *  child does not count toward that content, so on this axis the child's
 *  arithmetic runs from nothing — and lands below zero in every state, not
 *  only a collapsed one. Names both views and how to give the parent a size. */
export declare function negativeSizeMessage(childClass: string, size: "width" | "height", value: number, parentClass: string, onlyContent: boolean, where?: Where | null): string;
/** The checker's form: what the layout places is known from the source, so the
 *  message can also say HOW the author gets what they meant. `kind` is why the
 *  layout places this attribute — along its flow, across it by `align` (a
 *  ResponsiveLayout's cross axis also takes a tier `offset`), because its
 *  configuration is computed and may place either axis, a plan's `share`, a
 *  plan's drop (`share: 0`), or an arrangement that places everything. */
export declare function placedAttributeMessage(childClass: string, slot: string, arranger: string, kind: "flow" | "cross" | "cross-offset" | "computed" | "share" | "drop" | "all", where?: Where | null): string;
/** The diagnostic tag — an identity join, and the third constructor the
 *  production error-prose strip (tools/internal/error-codes.mjs) recognizes.
 *  A sentence that reaches its reader through a helper — a builder's return,
 *  an `err(…)`/`fail(…)` argument, a stub's refusal — is `diag\`…\`` so the
 *  strip can code it: dev builds keep the words, a shipped app carries
 *  `[Declare E42] values`, and `declare-help E42` gives the sentence back.
 *  The tag is the author saying "this is a diagnostic, never app copy" — the
 *  strip never has to guess that from a string's shape. */
export declare function diag(strings: TemplateStringsArray, ...values: unknown[]): string;
/** A production stand-in's refusal: the module `which` was slimmed out of
 *  this build (tools/declarec.mjs), `member` was called anyway, and the door
 *  back is named. Every stub declarec emits throws one of these, so the
 *  sentences live HERE — coded like every other diagnostic — instead of as
 *  prose baked into each stub's source. */
export declare function notAboard(member: string, which: "checker" | "inspector" | "bridge" | "selectors" | "unused"): Error;
/** A laid child under `align = baseline` that declares no baseline. A baseline
 *  is CLAIMED, never discovered: a `Text` reports its own, and a composite says
 *  which part carries it (`baseline: number = { cap.y + cap.baseline }`) — the
 *  layout never reaches into a child's composition to guess. The layout keeps
 *  arranging (this child sits at the line's start) and says so once. */
export declare function noBaselineMessage(childClass: string, arranger: string): string;
/** `align = baseline` on a STACK (a y-axis SimpleLayout): a stack has no line
 *  to sit on — its cross axis is x, where a baseline means nothing. */
export declare function stackBaselineMessage(arranger: string): string;
/** A malformed four-list on an Inset or Radius slot, named for the attribute it
 *  was written on: `padding` counts clockwise from the top, `cornerRadius` from
 *  the top-left corner, and both take one number for all four. The two share a
 *  kind, so the message keys off the NAME — a padding mistake told in corner
 *  words sends the author looking in the wrong place. */
export declare function insetOrRadiusMessage(owner: string, attr: string): string;
/** The shape alone, unowned — for the typecheck's report of the SAME mistake
 *  made inside a `{ }` (`cornerRadius = { [8, 8, 0] }`), where the sentence
 *  already names the slot and tsc would otherwise offer only its type name.
 *  Split out so the literal and the computed form say one thing. */
export declare function insetOrRadiusShape(attr: string): string;
/** The `stroke` slot's shape — the sibling of `insetOrRadiusMessage` for the
 *  third one-or-four slot, and the one whose sides hold VALUES rather than
 *  numbers. Said in ONE place because TWO paths reach the same mistake and
 *  must say the same sentence: a literal list of the wrong shape, refused at
 *  coercion (value.ts's `STROKE`, via stroke-sides.ts), and a `{ }` body that
 *  computes one, refused by the typecheck at the slot seam (the compiler's
 *  typecheck.ts, which would otherwise report the scaffold's `BoxStroke` type
 *  name and nothing an author can act on). */
export declare function strokeShapeMessage(): string;
