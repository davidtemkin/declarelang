import { type Pos } from "./errors.js";
import { View } from "./view.js";
import { type Node } from "./node.js";
import { type PathSeg } from "./path-plan.js";
import type { AttrType } from "./value.js";
/** Bind `name = { src }`: compile, install as the slot's owner, evaluate
 *  once now. check() already validated the syntax on the build path; a
 *  direct instantiate of an unchecked tree still fails soundly here with
 *  the same wording (compileExpr is the one message source). `classroot` is
 *  the instance of the class whose body the binding was WRITTEN in (R6) —
 *  a member-origin fact instantiate supplies, not always view.classroot
 *  (a class-body member on the class root itself binds to that root).
 *  `view` is any Node since R8 — a DataSource's `url = { … }` binds the
 *  same way a View attribute does. */
/** Bind a `{ }` PROVISION — `App [ theme = { … } ]` where `theme` is not a slot
 *  of the node's class. Same standing computation as bindConstraint, but the
 *  result lands in the node's provision store (provideWrite) rather than a slot,
 *  so a descendant's `provided("theme")` re-derives when the { } does. No slot
 *  owner (there is no slot); teardown rides onDiscard. */
export declare function provideBind(view: Node, name: string, src: string, pos: Pos, classroot: View | null, deps?: readonly string[]): void;
/** How many bodies bound as kernel EXPR rules, and how many fell back — tooling. */
export declare const exprStats: {
    kernel: number;
    fallback: number;
    disabled: boolean;
};
export declare const dataCellStats: {
    cells: number;
    escaped: number;
};
export declare function bindConstraint(view: Node, name: string, src: string, pos: Pos, classroot: View | null, 
/** The compiler's extracted dependency read-paths (docs/system-design/constraints.md §5).
 *  When present, the constraint is wired on the static path — edges fixed once,
 *  no per-run re-tracking. Absent (dev re-parse, or an un-annotated program) →
 *  the runtime-tracking fallback, unchanged. */
deps?: readonly string[], 
/** A DECLARED default (bindDeclDefault): yields to an author write or a
 *  newer owner, as the live fallback it replaces did. */
yielding?: boolean, 
/** …and is marked as one BEFORE its first run, so a read while that run is
 *  in flight evaluates the default live instead of taking the empty slot. */
declDefault?: boolean, 
/** The body as kernel bytecode (the code value's `expr`), when the compiler
 *  emitted it — the constraint then runs in the kernel if its reads land on
 *  numeric cells. */
bytecode?: string): void;
/** Bind `name = :path` (a value slot reading data, language §9): a standing
 *  computation over exactly that region of the inherited cursor's dataset.
 *  The raw value coerces to the slot's declared type at the boundary; an
 *  unresolved path lands the slot's class default (the chain's end). */
export declare function bindData(view: View, name: string, path: string, type: AttrType, plan?: readonly PathSeg[]): void;
/** Bind `datapath = :rel.path`: this view's cursor is the INHERITED cursor
 *  (from the parent chain — never this view's own slot, which it defines)
 *  extended by `rel.path`. Interned, so a re-derivation of the same place
 *  stops at the equality gate. */
export declare function bindDatapath(view: Node, path: string | readonly string[]): void;
/** Bind `datapath = { expr }`: the expression yields a value from a
 *  dataset (`weatherData.value.rss.channel` — plain TS dereferences), and
 *  toCursor turns it back into a *place*, inside the tracked compute so the
 *  cursor stands on its whole chain (a structural change along it re-runs).
 *  The compute runs under withCursorDefining: a `:path` island in the body
 *  (`datapath = { :detail }`) resolves against the INHERITED cursor, never
 *  the slot this constraint defines — the same rule bindDatapath states. */
export declare function bindCursor(view: Node, src: string, pos: Pos, classroot: Node | null): void;
export declare function percentAxis(name: string): "width" | "height" | null;
export declare function bindPercent(view: View, name: string, percent: number, pos: Pos): void;
/** Bind `x = center` / `y = end` — the position literals (value.ts Align).
 *  Symbolic like a percent, resolved as a standing constraint over the
 *  parent's extent AND the view's own. `center` centers the view's box (its
 *  alignBand) — for a Text that is the geometric box, the ordinary meaning
 *  (a label wanting its cap band optically centered uses the library's
 *  TextLabel). `end` aligns end edges — the geometric box, always. The written-out
 *  formula `{ (parent.height - this.height) / 2 }` remains the no-smarts
 *  spelling: only the named literal invokes the optics. */
export declare function bindAlign(view: View, name: "x" | "y", align: "center" | "end", pos: Pos): void;
/** A DECLARED slot's `{ }` default as a standing rule (attributes.ts
 *  AttrSpec.defRule): installed at construction on a slot no attribute channel
 *  set, YIELDING — an author write, a newer owner, or a runtime write retires
 *  it, so the rank-1 fallback the language rules (R6) keeps its rank. A slot
 *  already set or owned (a use-site literal landed, a two-way binding) gets no
 *  rule: the default never applied to it. The meaning is the language's "a
 *  formula until assigned", the same as the lazy fallback this replaced —
 *  motion, states, early reads, assignment: docs/system-design/kernel.md §10a. */
export declare function bindDeclDefault(view: Node, name: string, src: string, pos: Pos, classroot: View | null, deps?: readonly string[], bytecode?: string): void;
