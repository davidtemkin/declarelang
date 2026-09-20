// Bind parsed attribute values that are *relationships*, not literals, onto a
// live view: `{ }` constraint bodies and percent Lengths. instantiate.ts
// calls these after the whole tree is linked (a binding's first evaluation
// may read the parent — a percent does by construction).
//
// Both forms become the same Constraint: evaluate under tracking, land the
// result through setBound (store → the one affected Surface call → wake
// dependents). A percent is not a special mechanism — it is the constraint
// `parent.<axis> × p/100` the runtime writes for you, which is why "parent
// resizes → dependent re-resolves" needs no extra machinery.

import { deferral } from "./boot-deferrals.js";
import { DeclareError, type Pos } from "./errors.js";
import { Constraint, kernel, touchCell } from "./reactive.js";
import { defaultOf, markPercent, own, release, setBound, provideWrite, slotCellOf, writeOwned, isSetOrOwned, ownerOf } from "./attributes.js";
import { KERNEL_FLAG } from "./kernel-loader.js";
import { compileExpr, type ExprFn } from "./expr.js";
import { View, inheritedCursor, withCursorDefining } from "./view.js";
import { authoredName, onDiscard, type Node } from "./node.js";
import { coerceData, toCursor } from "./data.js";
import { splitPath, type PathSeg } from "./datapath.js";
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
export function provideBind(
  view: Node,
  name: string,
  src: string,
  pos: Pos,
  classroot: View | null,
  deps?: readonly string[]
): void {
  const c = compileExpr(src);
  if ("error" in c) throw new DeclareError(`${view.constructor.name} provides ${name} = { … } ${c.error}`, pos);
  const fn = c.fn;
  const k = new Constraint(
    `${view.constructor.name} provides ${name}`,
    () => fn.call(view, view.parent, classroot),
    (v) => provideWrite(view, name, v)
  );
  k.source = src;
  k.sourcePos = sourceAt(pos);
  onDiscard(view, () => k.dispose());
  if (deps !== undefined) deps = pathsOnly(deps);
  const regionReactive = deps !== undefined && deps.some((rp) => rp.startsWith(":") || rp.includes(".read(") || rp.includes(".value."));
  if (deps !== undefined && deps.length > 0 && !regionReactive) {
    const probes = probeFns(deps);
    k.wire(() => {
      for (const p of probes) {
        try { p.call(view, view.parent, classroot); } catch { /* a null-value projection — its tracked prefix is already wired */ }
      }
    }, deps);
  } else {
    k.run();
  }
}

/** The functions that TOUCH a body's static read paths, so the wiring sees the
 *  reads. A plain dotted chain — `this.root.width`, `parent.x`, `classroot.a.b`
 *  — is walked by a shared getter with no compile at all (boot-deferrals.ts:
 *  on the desktop 372 of 404 distinct paths are plain, each was a `new
 *  Function`); anything else (`:field`, `.read([…])`, `$provided(…)`) keeps the
 *  compiled form. */
const PLAIN_PATH = /^(this|parent|classroot|app)(\.[A-Za-z_$][\w$]*)+$/;
function probeFns(deps: readonly string[]): ExprFn[] {
  const out: ExprFn[] = [];
  for (const rp of deps) {
    if (deferral("probe") && PLAIN_PATH.test(rp)) {
      const segs = rp.split(".");
      const root = segs[0];
      out.push(function (this: unknown, parent: unknown, classroot: unknown): unknown {
        let cur: unknown = root === "this" ? this : root === "parent" ? parent : root === "classroot" ? classroot : (this as { root?: unknown }).root;
        for (let i = 1; i < segs.length; i++) cur = (cur as Record<string, unknown>)[segs[i]];
        return cur;
      });
    } else {
      const r = compileExpr(rp);
      if ("fn" in r) out.push(r.fn);
    }
  }
  return out;
}

/** The compiler's EXPR entry in a body's deps (expr-emit.ts, "the wire
 *  form"): `=E` then tokens — `L<n>` the n-th read path of these deps,
 *  `L%path` a literal path, `K<number>` a constant, one letter per operator. */
const EXPR_MARK = "=E";
const LETTER_OP: Record<string, number> = {
  "+": 3, "-": 4, "*": 5, "/": 6, "%": 7, "~": 8, m: 9, M: 10, a: 11, f: 12, c: 13, r: 14, q: 15,
  "<": 16, l: 17, ">": 18, g: 19, "=": 20, "!": 21, "&": 22, "|": 23, n: 24, "?": 25, "^": 26,
};
function exprOf(deps: readonly string[] | undefined): { code: number[]; paths: string[]; consts: number[] } | null {
  const e = deps?.find((d) => d.startsWith(EXPR_MARK));
  if (e === undefined || deps === undefined) return null;
  const code: number[] = [], paths: string[] = [], consts: number[] = [];
  const pathIndex = (p: string): number => { let i = paths.indexOf(p); if (i < 0) { i = paths.length; paths.push(p); } return i; };
  for (const tok of e.slice(EXPR_MARK.length).split(" ")) {
    if (tok === "") continue;
    if (tok[0] === "L") {
      const p = tok[1] === "%" ? tok.slice(2) : deps[Number(tok.slice(1))];
      if (p === undefined || p.startsWith(EXPR_MARK)) return null;
      code.push(1, pathIndex(p)); continue;
    }
    if (tok[0] === "K") { const v = Number(tok.slice(1)); if (Number.isNaN(v) && tok !== "KNaN") return null; consts.push(v); code.push(2, consts.length - 1); continue; }
    const op = LETTER_OP[tok];
    if (op === undefined) return null;
    code.push(op);
  }
  code.push(0);
  return { code, paths, consts };
}
const pathsOnly = (deps: readonly string[]): string[] => deps.filter((d) => !d.startsWith(EXPR_MARK));

/** How many bodies bound as kernel EXPR rules, and how many fell back — tooling. */
export const exprStats = { kernel: 0, fallback: 0, /** tests: force every body onto the JS path */ disabled: false };

/** Bind `{ … }` as a KERNEL rule when every read path lands on a numeric
 *  table slot and so does the target: the kernel evaluates the bytecode and
 *  writes the slot itself; no JS runs for this body ever again. Returns false
 *  when any path does not resolve (the JS body binds as before). */
// ── `:field` DATA CELLS ──────────────────────────────────────────────────────
// A numeric cell that FOLLOWS a row's record field, for the kernel's EXPR
// bodies (`x = { :col * app.miniCellW }`). One tracking rule per (view, field)
// makes the read the JS body made — `view.$data([field])`, so it follows a
// re-seat exactly as the body did — and lands the number in the cell; every
// EXPR body of the view that reads the field is an edge of that cell. The
// bridge exists only while the value IS a number: a field that arrives as, or
// becomes, anything else (null, a string) sends its readers back to their JS
// bodies (escapeDataCell), which compute with JS's own semantics for it.
interface DataReader { view: Node; name: string; src: string; pos: Pos; classroot: View | null; deps: readonly string[] }
interface DataCell { cell: number; rule: Constraint | null; readers: DataReader[]; escaped: boolean }
const DATA_CELLS = new WeakMap<object, Map<string, DataCell>>();
const FREE_DATA_CELLS: number[] = [];
export const dataCellStats = { cells: 0, escaped: 0 };

/** A record field as the kernel would hold it: a number as is, a boolean as
 *  1/0 (what JS arithmetic and comparison make of it — `:flag ? a : b`,
 *  `:flag + 1`, `:flag == 1` all agree); anything else has no cell. */
function numericData(v: unknown): number | null {
  return typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : null;
}
function dataCellFor(view: Node, field: string): DataCell | null {
  let m = DATA_CELLS.get(view);
  if (m === undefined) { DATA_CELLS.set(view, (m = new Map())); onDiscard(view, () => disposeDataCells(view)); }
  const had = m.get(field);
  if (had !== undefined) return had.escaped ? null : had;
  const v0 = numericData(view.$data([field]));
  if (v0 === null) return null;
  const K = kernel();
  const cell = FREE_DATA_CELLS.length > 0 ? FREE_DATA_CELLS.pop()! : K.addCells(1);
  if (cell < 0) return null;
  K.table[cell] = v0;
  const dc: DataCell = { cell, rule: null, readers: [], escaped: false };
  m.set(field, dc);
  dataCellStats.cells++;
  dc.rule = new Constraint(`${view.constructor.name} :${field}`, () => view.$data([field]), (raw) => {
    const v = numericData(raw);
    if (v !== null) {
      const t = kernel().table;
      if (t[cell] !== v || v !== v) { t[cell] = v; touchCell(cell); }
      return;
    }
    escapeDataCell(dc);
  });
  dc.rule.run();
  return dc;
}

/** The field stopped being a number: the cell retires and every kernel body
 *  that read it is rebound as the JS body it came from. */
function escapeDataCell(dc: DataCell): void {
  if (dc.escaped) return;
  dc.escaped = true;
  dataCellStats.escaped++;
  dc.rule?.dispose(); dc.rule = null;
  const readers = dc.readers.splice(0);
  for (const r of readers) {
    const o = ownerOf(r.view, r.name);
    if (o === null || !o.isNative) continue;   // already rebound (through another field of its)
    o.dispose(); release(r.view, r.name, o);
    bindConstraint(r.view, r.name, r.src, r.pos, r.classroot, pathsOnly(r.deps), o.yielding);
  }
}

function disposeDataCells(view: Node): void {
  const m = DATA_CELLS.get(view);
  if (m === undefined) return;
  DATA_CELLS.delete(view);
  for (const dc of m.values()) {
    dc.rule?.dispose(); dc.rule = null; dc.readers.length = 0;
    kernel().clearCells(dc.cell, 1); FREE_DATA_CELLS.push(dc.cell);
    dataCellStats.cells--;
  }
}

/** DIAGNOSTIC: `globalThis.__declareExprTrace = []` collects why each EXPR
 *  candidate fell back to its JS body. */
function exprWhy(label: string, why: string): false {
  if (!(typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__)) return false;
  const t = (globalThis as { __declareExprTrace?: Array<{ label: string; why: string }> }).__declareExprTrace;
  if (Array.isArray(t)) t.push({ label, why });
  return false;
}
function bindKernelExpr(view: Node, name: string, expr: { code: number[]; paths: string[]; consts: number[] }, classroot: View | null, label: string, src: string, pos: Pos, yielding = false, deps: readonly string[] = [], percent = false): boolean {
  const target = slotCellOf(view, name);
  if (target < 0) return exprWhy(label, "target not numeric: " + name);
  const cells: number[] = [];
  const dataCells: DataCell[] = [];
  for (const p of expr.paths) {
    if (p.startsWith(":")) {
      const field = p.slice(1);
      if (field.includes(".") || field === "") return exprWhy(label, "data path: " + p);
      const dc = dataCellFor(view, field);
      if (dc === null) return exprWhy(label, "data not numeric: " + p);
      cells.push(dc.cell); dataCells.push(dc);
      continue;
    }
    const dot = p.lastIndexOf(".");
    if (dot < 0) return exprWhy(label, "no receiver: " + p);
    const receiver = p.slice(0, dot), slot = p.slice(dot + 1);
    const r = compileExpr(receiver);
    if ("error" in r) return exprWhy(label, "receiver error: " + receiver);
    let node: unknown;
    try { node = r.fn.call(view, view.parent, classroot); } catch { return exprWhy(label, "receiver threw: " + receiver); }
    if (node === null || typeof node !== "object") return exprWhy(label, "receiver not a node: " + receiver);
    const c = slotCellOf(node, slot);
    if (c < 0 || c === target) return exprWhy(label, (c === target ? "self-read: " : "slot not numeric: ") + p);
    cells.push(c);
  }
  const K = kernel();
  // relocate: LOAD i → cell, CONST i → kernel constant index
  const code = expr.code.slice();
  const constAt: number[] = expr.consts.map((v) => K.addConst(v));
  if (constAt.some((i) => i < 0)) return false;
  for (let i = 0; i < code.length; i++) {
    const op = code[i];
    if (op === 1) { code[i + 1] = cells[code[i + 1]]; i++; }        // LOAD
    else if (op === 2) { code[i + 1] = constAt[code[i + 1]]; i++; } // CONST
  }
  const off = K.addCode(code);
  if (off < 0) return false;
  const edges = [...new Set(cells)];
  const id = K.addExprRule(target, (yielding ? KERNEL_FLAG.YIELDING : 0) | (percent ? KERNEL_FLAG.PERCENT : 0), edges, off, code.length);
  if (id < 0) return false;
  const k = new Constraint(label, () => undefined, () => {}, 0, yielding);
  k.adoptRule(id);
  if (percent) markPercent(k);
  k.source = src;
  k.sourcePos = sourceAt(pos);
  k.wiredPaths = expr.paths;
  own(view, name, k);
  for (const dc of dataCells) dc.readers.push({ view, name, src, pos, classroot, deps });
  k.run();
  return true;
}

export function bindConstraint(
  view: Node,
  name: string,
  src: string,
  pos: Pos,
  classroot: View | null,
  /** The compiler's extracted dependency read-paths (docs/system-design/constraints.md §5).
   *  When present, the constraint is wired on the static path — edges fixed once,
   *  no per-run re-tracking. Absent (dev re-parse, or an un-annotated program) →
   *  the runtime-tracking fallback, unchanged. */
  deps?: readonly string[],
  /** A DECLARED default (bindDeclDefault): yields to an author write or a
   *  newer owner, as the live fallback it replaces did. */
  yielding = false
): void {
  const expr = exprStats.disabled ? null : exprOf(deps);
  if (expr !== null) {
    if (bindKernelExpr(view, name, expr, classroot, `${view.constructor.name}.${name}`, src, pos, yielding, deps)) { exprStats.kernel++; return; }
    exprStats.fallback++;
    deps = pathsOnly(deps!);
  } else if (deps !== undefined) deps = pathsOnly(deps);
  const c = compileExpr(src);
  if ("error" in c) {
    throw new DeclareError(`${view.constructor.name}.${name} = { … } ${c.error}`, pos);
  }
  const fn = c.fn;
  // A DECLARED default that cannot be evaluated yet (`{ app.shown.value.total
  // ?? 0 }` before the dataset delivers) is simply not applied yet — the live
  // fallback it replaces was never read before its inputs existed, so a
  // program that ran clean keeps running clean. The rule stays armed on what
  // it read up to the throw and lands the value when those inputs change.
  const k = new Constraint(
    `${view.constructor.name}.${name}`,
    yielding ? () => { try { return fn.call(view, view.parent, classroot); } catch { return DEFERRED; } } : () => fn.call(view, view.parent, classroot),
    yielding ? (v) => { if (v !== DEFERRED) writeOwned(view, name, v); } : (v) => setBound(view, name, v),
    0,
    yielding
  );
  // Retain the authored text + position for the Inspector (inspect.ts explain()).
  k.source = src;
  k.sourcePos = sourceAt(pos);
  own(view, name, k);
  // The static path prewires STABLE-slot edges (attribute cells, a Dataset's
  // `.value` slot — they outlive every recompute). A read of a DATA REGION
  // (`:path` or `.read([…])`) resolves to a cell on the data VALUE tree, which is
  // recreated when the value arrives or is replaced — that dynamic, per-element
  // subscription is the data-binding primitive's to own (docs/system-design/constraints.md §3),
  // so such a constraint stays on the tracking path. (The extractor still lists
  // the region read-path, for legibility/tooling.)
  // `.value.<field>` — a plain chain INTO a data tree — joins them (#15): the
  // dataset's tracked view (data.ts trackedView) makes such reads subscribe to
  // region cells, which live on the value tree and are recreated with it, so
  // the tracking path (re-tracked each run) is the only honest wiring here too.
  const regionReactive = deps !== undefined && deps.some((rp) => rp.startsWith(":") || rp.includes(".read(") || rp.includes(".value."));
  if (deps !== undefined && deps.length > 0 && !regionReactive) {
    // Each read-path is an analyzable expression (`this.root.n`, `this.theme`);
    // compile once and read it under tracking to wire the (stable) edge.
    const probes = probeFns(deps);
    k.wire(() => {
      for (const p of probes) {
        try { p.call(view, view.parent, classroot); } catch { /* a null-value projection — its tracked prefix is already wired */ }
      }
    }, deps);
  } else {
    k.run();
  }
}

/** Bind `name = :path` (a value slot reading data, language §9): a standing
 *  computation over exactly that region of the inherited cursor's dataset.
 *  The raw value coerces to the slot's declared type at the boundary; an
 *  unresolved path lands the slot's class default (the chain's end). */
export function bindData(view: View, name: string, path: string, type: AttrType, plan?: readonly PathSeg[]): void {
  const UNRESOLVED = {}; // sentinel: coerceData returns the def verbatim
  const read = plan ?? path; // a selector-bearing path arrives pre-parsed (B3)
  const k = new Constraint(
    `${view.constructor.name}.${name} = :${path}`,
    () => {
      const v = coerceData(type, view.$data(read), UNRESOLVED);
      return v === UNRESOLVED ? defaultOf(view, name) : v;
    },
    (v) => setBound(view, name, v)
  );
  own(view, name, k);
  k.run();
}

/** Bind `datapath = :rel.path`: this view's cursor is the INHERITED cursor
 *  (from the parent chain — never this view's own slot, which it defines)
 *  extended by `rel.path`. Interned, so a re-derivation of the same place
 *  stops at the equality gate. */
export function bindDatapath(view: View, path: string | readonly string[]): void {
  const segs = typeof path === "string" ? splitPath(path) : path;
  const k = new Constraint(
    `${view.constructor.name}.datapath = :${typeof path === "string" ? path : path.join(".")}`,
    () => {
      const base = inheritedCursor(view.parent);
      return base === null ? null : base.data.cursorAt([...base.path, ...segs]);
    },
    (v) => setBound(view, "datapath", v)
  );
  own(view, "datapath", k);
  k.run();
}

/** Bind `datapath = { expr }`: the expression yields a value from a
 *  dataset (`weatherData.value.rss.channel` — plain TS dereferences), and
 *  toCursor turns it back into a *place*, inside the tracked compute so the
 *  cursor stands on its whole chain (a structural change along it re-runs).
 *  The compute runs under withCursorDefining: a `:path` island in the body
 *  (`datapath = { :detail }`) resolves against the INHERITED cursor, never
 *  the slot this constraint defines — the same rule bindDatapath states. */
export function bindCursor(view: View, src: string, pos: Pos, classroot: View | null): void {
  const c = compileExpr(src);
  if ("error" in c) {
    throw new DeclareError(`${view.constructor.name}.datapath = { … } ${c.error}`, pos);
  }
  const fn = c.fn;
  // The label names the NODE, not just its class: "View.datapath" sent an
  // author bisecting a 400-line file with perl to find which of thirty Views
  // meant (field report 2026-08-21). The name is how the author wrote it —
  // the member key on the parent or classroot — when there is one.
  const name = authoredName(view);
  const label = `${view.constructor.name}${name === null ? "" : ` '${name}'`}.datapath`;
  const k = new Constraint(
    label,
    () => withCursorDefining(view, () => toCursor(fn.call(view, view.parent, classroot), label)),
    (v) => setBound(view, "datapath", v)
  );
  own(view, "datapath", k);
  k.run();
}

// A percent resolves against the parent's extent on the attribute's own
// axis — horizontal slots against parent.width, vertical against
// parent.height (the doc's `width = 100%`, generalized the way CSS
// percentages resolve). Only geometry is Length-typed today; a future
// Length attribute extends this table alongside its schema entry.
const PERCENT_AXIS: Readonly<Record<string, "width" | "height">> = {
  x: "width",
  y: "height",
  width: "width",
  height: "height",
};

/** Bind `name = p%` as the runtime constraint described above. The root has
 *  no parent to resolve against — that is an instantiation-context fact, not
 *  a source fact (the same fragment could be checked for embedding
 *  elsewhere), which is why it surfaces here and not in check(). */
/** The authored position a Constraint carries — line, column, and the file
 *  when the value came from an include. Every AUTHOR binding gets one (a `{ }`,
 *  a percent, a position literal): these are the constraints that can meet a
 *  layout's claim on the same slot, and the diagnostic that follows has to
 *  point at the line that wrote the losing value. Null on a compiled artifact
 *  (declarec strips positions) — the messages read exactly as before there. */
function sourceAt(pos: Pos | null | undefined): { line: number; col: number; file?: string } | null {
  if (pos == null || typeof (pos as { line?: number }).line !== "number") return null;
  const p = pos as Pos;
  const at = { line: p.line, col: p.col ?? 0 };
  return p.file !== undefined ? { ...at, file: p.file } : at;
}

/** The axis `name` resolves a percent against, or null when it has none — the
 *  one reading of the table above, so a caller that must REFUSE a percent
 *  before binding it (rich text's inline views: a tag attribute is refused
 *  through the component's `unsupported` policy, never thrown mid-render) asks
 *  the same question bindPercent answers. */
// The kernel's EXPR opcodes this module writes by hand (declare_kernel.h's enum,
// as compiler/src/expr-emit.ts's OP — kept in step by kernel/test).
const OP_END = 0, OP_LOAD = 1, OP_CONST = 2, OP_SUB = 4, OP_MUL = 5, OP_DIV = 6, OP_MAX = 10, OP_EQ = 20, OP_SELECT = 25;

/** Do the runtime's OWN derives (a percent, a position literal) run as kernel
 *  expressions? Yes — they are arithmetic the runtime generates, a sixth of all
 *  the JavaScript rule runs at boot across the apps (bodycensus.mjs,
 *  2026-09-18). `__declareNoKernelDerives` turns it off for an A/B in a
 *  profiling build; a shipped build folds the switch out. */
function kernelDerives(): boolean {
  if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && (globalThis as { __declareNoKernelDerives?: boolean }).__declareNoKernelDerives === true) return false;
  return true;
}

/** THE PARENT'S CONTENT BOX as kernel code, reading two slots: the extent and
 *  the axis's inset TOTAL (view.ts keeps it). Exactly View.contentBox, its
 *  zero-inset case included — `pair === 0 ? raw : max(0, raw − pair)` — so an
 *  unpadded parent's degenerate negative extent stays negative, as ruled.
 *  `raw` is path slot 0 and `pair` path slot 1. */
const CONTENT_BOX = [
  OP_LOAD, 1, OP_CONST, 0, OP_EQ,                       // c: is the inset total zero?
  OP_LOAD, 0,                                            // a: the extent as written
  OP_CONST, 0, OP_LOAD, 0, OP_LOAD, 1, OP_SUB, OP_MAX,   // b: max(0, extent − inset)
  OP_SELECT,
];

export function percentAxis(name: string): "width" | "height" | null {
  return Object.hasOwn(PERCENT_AXIS, name) ? PERCENT_AXIS[name] : null;
}

export function bindPercent(view: View, name: string, percent: number, pos: Pos): void {
  const cls = view.constructor.name;
  const axis = Object.hasOwn(PERCENT_AXIS, name) ? PERCENT_AXIS[name] : null;
  if (axis === null) {
    throw new DeclareError(`${cls}.${name} = ${percent}%: no axis to resolve a percent against`, pos);
  }
  if (!(view.parent instanceof View)) {
    throw new DeclareError(
      `${cls}.${name} = ${percent}%: the root has no parent for a percent to resolve against`,
      pos
    );
  }
  // The parent's CONTENT BOX, not its literal one (RULED 2026-09-19): a percent
  // means "this share of the space I am given", and a padded parent gives the
  // room inside its insets. IN THE KERNEL where the cells allow: the content
  // box is two slots (extent, inset total) and CONTENT_BOX is the same
  // arithmetic, so the derive survives the rule. The JavaScript form below is
  // the fallback (a non-numeric slot) and the A/B.
  const inset = axis === "width" ? "insetX" : "insetY";
  if (kernelDerives() && bindKernelExpr(view, name,
    { code: [...CONTENT_BOX, OP_CONST, 1, OP_MUL, OP_END], paths: [`parent.${axis}`, `parent.${inset}`], consts: [0, percent / 100] },
    null, `${cls}.${name} = ${percent}%`, `parent.contentBox(${axis}) * ${percent / 100}`, pos, false, [], true)) return;
  const k = new Constraint(
    `${cls}.${name} = ${percent}%`,
    () => (view.parent as View).contentBox(axis) * (percent / 100),
    (v) => setBound(view, name, v)
  );
  markPercent(k); // auto-extent excludes percent-bound child slots (view.ts)
  k.sourcePos = sourceAt(pos); // a percent can lose its slot to a layout — name the line
  own(view, name, k);
  k.run();
}


/** Bind `x = center` / `y = end` — the position literals (value.ts Align).
 *  Symbolic like a percent, resolved as a standing constraint over the
 *  parent's extent AND the view's own. `center` centers the view's box (its
 *  alignBand) — for a Text that is the geometric box, the ordinary meaning
 *  (a label wanting its cap band optically centered uses the library's
 *  TextLabel). `end` aligns end edges — the geometric box, always. The written-out
 *  formula `{ (parent.height - this.height) / 2 }` remains the no-smarts
 *  spelling: only the named literal invokes the optics. */
export function bindAlign(view: View, name: "x" | "y", align: "center" | "end", pos: Pos): void {
  const cls = view.constructor.name;
  const size = name === "x" ? ("width" as const) : ("height" as const);
  if (!(view.parent instanceof View)) {
    throw new DeclareError(
      `${cls}.${name} = ${align}: the root has no parent to align against`,
      pos
    );
  }
  // Against the parent's CONTENT box, for the same reason a percent resolves
  // there: a position is measured from the content origin, and centring in the
  // literal box would push a padded parent's child off centre by the leading
  // inset. IN THE KERNEL for the plain box (View.alignBand's base answer: lead
  // 0, the whole size); a view whose alignBand is overridden keeps the
  // JavaScript form, which asks it.
  const insetA = size === "width" ? "insetX" : "insetY";
  if (kernelDerives() && view.alignBand === View.prototype.alignBand && bindKernelExpr(view, name,
    align === "end"
      ? { code: [...CONTENT_BOX, OP_LOAD, 2, OP_SUB, OP_END], paths: [`parent.${size}`, `parent.${insetA}`, `this.${size}`], consts: [0] }
      : { code: [...CONTENT_BOX, OP_LOAD, 2, OP_SUB, OP_CONST, 1, OP_DIV, OP_END], paths: [`parent.${size}`, `parent.${insetA}`, `this.${size}`], consts: [0, 2] },
    null, `${cls}.${name} = ${align}`,
    align === "end" ? `parent.contentBox(${size}) - this.${size}` : `(parent.contentBox(${size}) - this.${size}) / 2`, pos, false, [], true)) return;
  const k = new Constraint(
    `${cls}.${name} = ${align}`,
    () => {
      const P = (view.parent as View).contentBox(size);
      if (align === "end") return P - view[size];
      const band = view.alignBand(name);
      return (P - band.size) / 2 - band.lead;
    },
    (v) => setBound(view, name, v)
  );
  markPercent(k); // like a percent: excluded from the parent's auto-extent (no cycle)
  k.sourcePos = sourceAt(pos); // `x = center` meeting a layout's claim names this line
  own(view, name, k);
  k.run();
}

const DEFERRED: unique symbol = Symbol("deferred");
/** A DECLARED slot's `{ }` default as a standing rule (attributes.ts
 *  AttrSpec.defRule): installed at construction on a slot no attribute channel
 *  set, YIELDING — an author write, a newer owner, or a runtime write retires
 *  it, so the rank-1 fallback the language rules (R6) keeps its rank. A slot
 *  already set or owned (a use-site literal landed, a two-way binding) gets no
 *  rule: the default never applied to it. */
export function bindDeclDefault(view: Node, name: string, src: string, pos: Pos, classroot: View | null, deps?: readonly string[]): void {
  if (isSetOrOwned(view, name)) return;
  bindConstraint(view, name, src, pos, classroot, deps, true);
  const o = ownerOf(view, name);
  if (o !== null) o.declDefault = true;
}
