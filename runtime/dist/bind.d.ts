import { type Pos } from "./errors.js";
import { View } from "./view.js";
import type { Node } from "./node.js";
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
export declare function bindConstraint(view: Node, name: string, src: string, pos: Pos, classroot: View | null, 
/** The compiler's extracted dependency read-paths (design/constraints.md §5).
 *  When present, the constraint is wired on the static path — edges fixed once,
 *  no per-run re-tracking. Absent (dev re-parse, or an un-annotated program) →
 *  the runtime-tracking fallback, unchanged. */
deps?: readonly string[]): void;
/** Bind `name = :path` (a value slot reading data, language §9): a standing
 *  computation over exactly that region of the inherited cursor's dataset.
 *  The raw value coerces to the slot's declared type at the boundary; an
 *  unresolved path lands the slot's fallback — the class default, or, on a
 *  PREVAILING slot, the followed value (ruled: the declaration default is
 *  just the chain's end). The fallback is read inside the tracked compute,
 *  so an unresolved prevailing slot keeps following live and lets go of the
 *  chain the moment the path resolves. */
export declare function bindData(view: View, name: string, path: string, type: AttrType): void;
/** Bind `datapath = :rel.path`: this view's cursor is the INHERITED cursor
 *  (from the parent chain — never this view's own slot, which it defines)
 *  extended by `rel.path`. Interned, so a re-derivation of the same place
 *  stops at the equality gate. */
export declare function bindDatapath(view: View, path: string): void;
/** Bind `datapath = { expr }`: the expression yields a value from a
 *  dataset (`weatherData.value.rss.channel` — plain TS dereferences), and
 *  toCursor turns it back into a *place*, inside the tracked compute so the
 *  cursor stands on its whole chain (a structural change along it re-runs). */
export declare function bindCursor(view: View, src: string, pos: Pos, classroot: View | null): void;
/** Bind `name = p%` as the runtime constraint described above. The root has
 *  no parent to resolve against — that is an instantiation-context fact, not
 *  a source fact (the same fragment could be checked for embedding
 *  elsewhere), which is why it surfaces here and not in check(). */
export declare function bindPercent(view: View, name: string, percent: number, pos: Pos): void;
