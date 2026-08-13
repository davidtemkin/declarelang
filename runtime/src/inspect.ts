// inspect — the runtime's structured act of looking (docs/system-design/verify-and-evals.md
// §2.2), and the DRIVEN CLOCK (§2.3). The model can't glance at a screen: the
// tree, its geometry (local AND root-space), each node's own attribute values,
// and — the payoff of static dependency extraction — WHY a slot has its value
// are all queryable as plain data. This is also the foundation the reactive
// inspector (constraints.md §4's tooling commitment) and verify's rung-5
// assertions stand on.
//
// Zero-dependency like the rest of the runtime; pay-per-use (nothing here
// allocates until asked). The `__declare` page bridge is installed by boot.ts
// for top-level apps.

import { Node } from "./node.js";
import { hitAt, traceHitAt, rootFrameOrigin, rootFrameBox, type InteractionView } from "./interaction.js";
import { View } from "./view.js";
import { isSet, ownerOf, ownValues, ownedSlots } from "./attributes.js";
import { materializationInfo, type MaterializationDiag } from "./replicate.js";
import { sharedClock, browserScheduler, type FrameScheduler } from "./animate.js";
import { TAGS, LAYOUTS, DATA, ANIMATORS, ANIMATOR_GROUPS, STATES } from "./registry.js";
import { settle } from "./reactive.js";

// ── the tree as data ────────────────────────────────────────────────────────

export interface InspectNode {
  /** The component kind — the class's name (`Checkbox`, `View`, `Spring`…). */
  kind: string;
  /** The member name this node is reachable by, when named; else null. */
  name: string | null;
  /** Dotted address from the root — names where they exist, child indices
   *  where they don't: `app.col.opts`, `app.col.3`. `find()` resolves these. */
  path: string;
  x: number; y: number; width: number; height: number;
  /** Where the view IS, relative to the app's root — as seen, with every
   *  enclosing scroll taken out. This is the one position worth reporting: it is
   *  what `at(x, y)` resolves, what a synthetic pointer must aim at, and what the
   *  Inspector's highlight draws. A naive sum of ancestor x/y is scroll-blind and
   *  reports where a view WOULD have been unscrolled — the same answer until
   *  something scrolls, and then silently wrong. */
  rootX: number; rootY: number;
  /** The composed root-frame EXTENTS — the AABB of the frame through every
   *  ancestor transform (scale/rotation), the box the view PAINTS. Equal to
   *  width/height (which stay local, the view's own coordinate space) when no
   *  transform is in play. Under rotation rootX/rootY remain the frame
   *  ORIGIN's image, which is a quad corner, not necessarily the AABB's. */
  rootWidth: number; rootHeight: number;
  /** This node's OWN `visible` slot — what the program says about it. */
  visible: boolean;
  /** Whether it is actually SHOWN: its own `visible` and every ancestor's.
   *  These differ exactly when a node is hidden by something above it, which
   *  is the case a reader is usually chasing — `visible: true` on a node
   *  inside a hidden panel is true and useless on its own. */
  shown: boolean;
  text?: string;
  /** The node's OWN attribute values (instance writes and bound results —
   *  the overlay over class defaults). A snapshot. */
  attrs: Record<string, unknown>;
  /** The materialization diagnostic (materialization.md §3.6, the trust
   *  requirement): present on a view carrying a replication block — whether
   *  it is windowed, the logical vs materialized counts, the retained
   *  (touched) set, and whether extent is measured or predicted. */
  materialization?: MaterializationDiag;
  children: InspectNode[];
}

const isView = (n: Node): n is View => n instanceof View;

/** The component name to SHOW for a node. A named user class carries its own
 *  (`FinderWindow`); an instance-declared anonymous subclass carries whatever
 *  the bundler left behind (`je`, `t`), which is noise. So: take the first name
 *  up the prototype chain that reads like a component name, and fall back to
 *  the registry's own name→class table, which is authoritative and survives
 *  minification because its KEYS are strings. */
const REGISTRY_NAME = new WeakMap<object, string>();
let registryIndexed = false;
function indexRegistry(): void {
  if (registryIndexed) return;
  registryIndexed = true;
  try {
    for (const table of [TAGS, LAYOUTS, DATA, ANIMATORS, ANIMATOR_GROUPS, STATES] as Record<string, unknown>[]) {
      for (const [name, ctor] of Object.entries(table ?? {})) {
        if (typeof ctor === "function") REGISTRY_NAME.set(ctor as object, name);
      }
    }
  } catch { /* a slim build may omit a table */ }
}
/** Was this class name STAMPED by the program (instantiate.ts synthesize()
 *  does `Object.defineProperty(cls, "name", …)`, which is non-configurable), or
 *  merely inferred by JavaScript from a binding — in which case a bundler will
 *  have minified it to noise like `Pe`? The descriptor tells them apart exactly,
 *  where the name's shape cannot: a real two-letter user class (`Ev`) and a
 *  minified one look identical. */
function stampedName(ctor: object): string | null {
  const d = Object.getOwnPropertyDescriptor(ctor, "name");
  if (d === undefined || d.configurable !== false) return null;
  const v = typeof d.value === "string" ? d.value : "";
  return v === "" ? null : v;
}

export function kindName(n: Node): string {
  indexRegistry();
  let ctor: unknown = n.constructor;
  let registryHit: string | null = null;
  let hops = 0;
  while (typeof ctor === "function" && hops++ < 12) {
    // A name the program stamped wins outright — it is the class the developer
    // wrote, and it survives minification.
    const stamped = stampedName(ctor as object);
    if (stamped !== null) return stamped;
    if (registryHit === null) {
      const own = REGISTRY_NAME.get(ctor as object);
      if (own !== undefined) registryHit = own;
    }
    ctor = Object.getPrototypeOf(ctor);
  }
  if (registryHit !== null) return registryHit;
  const raw = (n.constructor as { name: string }).name;
  return raw === "" ? "View" : raw;
}


/** Make an attribute value JSON-safe for transport (the InspectNode is API,
 *  §2.2 — it crosses the CDP boundary to verify and any agent). A raw own-value
 *  can be a function, a class instance, or a datapath CURSOR whose `.data`
 *  cycles back through the tree — puppeteer's structured clone silently yields
 *  `undefined` for the whole node on a cycle, which broke driving any
 *  data-bound (replicated) view. So we reduce to primitives, plain arrays, and
 *  plain objects (depth- and cycle-guarded); anything else becomes a short tag. */
function safeAttr(v: unknown, depth = 0, seen = new Set<unknown>()): unknown {
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === "string" || t === "boolean") return v;
  if (t === "number") return Number.isFinite(v as number) ? v : String(v);
  if (t === "function") return "«fn»";
  if (t !== "object") return String(v);
  if (seen.has(v) || depth >= 4) return "«…»";
  seen.add(v);
  try {
    if (Array.isArray(v)) return v.slice(0, 64).map((e) => safeAttr(e, depth + 1, seen));
    const proto = Object.getPrototypeOf(v);
    // A class instance (Node, Cursor, Stroke, …) — not a plain object literal.
    if (proto !== Object.prototype && proto !== null) {
      const path = (v as { path?: unknown }).path;
      const name = (v as object).constructor?.name ?? "object";
      return Array.isArray(path) ? `«${name} ${path.join(".")}»` : `«${name}»`;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = safeAttr((v as Record<string, unknown>)[k], depth + 1, seen);
    return out;
  } finally {
    seen.delete(v);
  }
}

/** The member name a child is reachable by — reverse-looked-up on its parent
 *  and its classroot (named children are installed as properties on both
 *  scopes' owners, depending on where they were declared). */
export function nameOf(node: Node): string | null {
  for (const holder of [node.parent, node.classroot]) {
    if (holder === null || holder === undefined) continue;
    for (const k of Object.keys(holder)) {
      if (k.startsWith("$") || k === "parent" || k === "children" || k === "classroot") continue;
      if ((holder as unknown as Record<string, unknown>)[k] === node) return k;
    }
  }
  return null;
}

/** The whole subtree as data. `path` seeds the root's address ("app"). */
export function inspect(node: Node, path = "app"): InspectNode {
  const v = isView(node) ? node : null;
  // THE one walk (interaction.ts), not a second hand-rolled one. This used to
  // accumulate ancestor x/y directly — the same defect the Inspector's highlight
  // had before rootFrameOrigin existed, and for the same reason: a sum of offsets
  // is blind to every scroll between here and the root, so a row below a pane's
  // fold reported the position it would have had unscrolled. Same walk the
  // highlight and the hit test use, so the three cannot disagree.
  let rootX = 0, rootY = 0, rootWidth = 0, rootHeight = 0;
  if (v !== null) {
    const o = rootFrameOrigin(v as unknown as InteractionView);
    rootX = o.x; rootY = o.y;
    const b = rootFrameBox(v as unknown as InteractionView);
    rootWidth = b.width; rootHeight = b.height;
  }
  // effective visibility is inherited, so it is walked from THIS node up
  // rather than threaded down — inspect() is entered at arbitrary depth
  // (`inspect(app.pane.b)`), and a subtree-only fold would report a node
  // inside a hidden panel as shown.
  let shown = true;
  for (let n: Node | null = node; n !== null; n = n.parent) {
    if (isView(n) && !n.visible) { shown = false; break; }
  }
  const record: InspectNode = {
    kind: kindName(node),
    name: nameOf(node),
    path,
    x: v?.x ?? 0, y: v?.y ?? 0, width: v?.width ?? 0, height: v?.height ?? 0,
    rootX, rootY, rootWidth, rootHeight,
    visible: v?.visible ?? true,
    shown,
    attrs: safeAttr(ownValues(node)) as Record<string, unknown>,
    children: node.children.map((c, i) => {
      const childName = nameOf(c);
      return inspect(c, `${path}.${childName ?? i}`);
    }),
  };
  const text = (node as unknown as { text?: unknown }).text;
  if (typeof text === "string" && text !== "") record.text = text;
  if (v !== null) {
    const w = materializationInfo(v);
    if (w !== null) record.materialization = w;
  }
  return record;
}

/** Resolve a dotted inspect path (`app.col.opts`, `app.col.3`) to the node.
 *  Returns null (never throws) on a miss — the caller owns the message. */
export function find(root: Node, path: string): Node | null {
  const segs = path.split(".").filter((s) => s !== "");
  let cur: Node = root;
  for (let i = segs[0] === "app" ? 1 : 0; i < segs.length; i++) {
    const seg = segs[i];
    const asIndex = /^\d+$/.test(seg) ? cur.children[Number(seg)] : undefined;
    const asName = (cur as unknown as Record<string, unknown>)[seg];
    const next = asIndex ?? (asName instanceof Node ? asName : undefined);
    if (next === undefined) return null;
    cur = next;
  }
  return cur;
}

// ── provenance: WHY does this slot have this value ──────────────────────────

export interface Provenance {
  attr: string;
  value: unknown;
  /** Was the slot ever set (write or binding), vs riding its class default. */
  set: boolean;
  /** The owning constraint, when one owns the slot: its label, whether it
   *  runs on the compiler-wired static path, and — the static-extraction
   *  payoff — the exact read-paths it was wired to. */
  constraint: {
    label: string;
    static: boolean;
    /** Typed into the Inspector at runtime — not compiled from source. */
    live: boolean;
    deps: readonly string[] | null;
    /** The MACHINERY writer, when the owner is not an authored constraint —
     *  "SimpleLayout" for layout-owned geometry (P2-2, field report
     *  2026-08-05: an anonymous owner with null source/deps was explain()'s
     *  one silent answer, at exactly the moment "a layout wrote it" was the
     *  answer being asked for). Null for authored constraints. */
    writer: string | null;
    /** The authored `{ … }` text, when this constraint came from a program. */
    source: string | null;
    pos: { line: number; col: number } | null;
  } | null;
  /** A Spring child currently driving this slot, with its live target. */
  spring: { target: unknown; stiffness: unknown; damping: unknown } | null;
}

export function explain(node: Node, attr: string): Provenance {
  const owner = ownerOf(node, attr);
  let spring: Provenance["spring"] = null;
  for (const c of node.children) {
    const s = c as unknown as { attribute?: unknown; to?: unknown; stiffness?: unknown; damping?: unknown };
    if (c.constructor.name === "Spring" && s.attribute === attr) {
      spring = { target: s.to, stiffness: s.stiffness, damping: s.damping };
      break;
    }
  }
  return {
    attr,
    value: safeAttr((node as unknown as Record<string, unknown>)[attr]),
    set: isSet(node, attr),
    constraint: owner !== null
      ? {
          // Composed fresh rather than echoing owner.label: that string is baked
          // at bind time from the raw constructor name, which a bundler may have
          // minified to `t`. kindName() recovers the component's real name.
          label: `${kindName(node)}.${attr}`,
          static: owner.isStatic,
          live: owner.live === true,
          deps: owner.wiredPaths,
          // A sourceless owner is machinery — and for a box slot the writer
          // is almost always the parent's layout. Name it (duck-typed on
          // `place`, the Layout contract; kindName resists minification).
          writer: owner.source == null
            ? (() => {
                const p = (node as { parent?: Node | null }).parent ?? null;
                const lay = (p as { layout?: unknown } | null)?.layout;
                return lay != null && typeof (lay as { place?: unknown }).place === "function"
                  ? kindName(lay as Node)
                  : null;
              })()
            : null,
          source: owner.source,
          pos: owner.sourcePos,
        }
      : null,
    spring,
  };
}

/** Counters for leak/perf canaries: node count, constraint-owned slots,
 *  whether motion is in flight. */
export function stats(root: Node): { nodes: number; ownedSlots: number; motionBusy: boolean } {
  let nodes = 0, owned = 0;
  const walk = (n: Node): void => {
    nodes++;
    owned += ownedSlots(n).length;
    for (const c of n.children) walk(c);
  };
  walk(root);
  return { nodes, ownedSlots: owned, motionBusy: sharedClock.busy };
}

// ── the driven clock (verify-and-evals.md §2.3) ─────────────────────────────
// Motion must be assertable and screenshots reproducible: take the shared
// clock off rAF, step it by hand, run springs/animators to rest on demand.

class ManualScheduler implements FrameScheduler {
  private t = typeof performance !== "undefined" ? performance.now() : 0;
  private pending: ((now: number) => void) | null = null;
  now(): number { return this.t; }
  request(cb: (now: number) => void): number { this.pending = cb; return 1; }
  cancel(): void { this.pending = null; }
  fire(ms: number): void {
    this.t += ms;
    const cb = this.pending;
    this.pending = null;
    if (cb !== null) cb(this.t);
  }
}

const manual = new ManualScheduler();
let clockMode: "auto" | "manual" = "auto";
/** Observers of driven time (clock.onStepped) — a harness's virtualized timers. */
const stepped: ((ms: number) => void)[] = [];

export const clock = {
  get mode(): "auto" | "manual" { return clockMode; },
  /** Take the shared clock off rAF; time advances only through step(). */
  manual(): void {
    if (clockMode === "manual") return;
    clockMode = "manual";
    sharedClock.setScheduler(manual);
  },
  /** Hand the clock back to the real frame source. */
  auto(): void {
    if (clockMode === "auto") return;
    clockMode = "auto";
    sharedClock.setScheduler(browserScheduler);
  },
  /** Advance time by `ms` (one synthetic frame), then settle the reactive
   *  graph — every constraint downstream of the motion lands before return.
   *  Settles BEFORE firing too: a write earlier in this same turn (a bridge
   *  `evaluate`, a handler) may not have propagated to the motion tier yet —
   *  a spring must retarget from it before the frame it is stepped through,
   *  or the step ticks against stale targets and reads as lost motion. */
  step(ms = 16.7): void {
    if (clockMode !== "manual") this.manual();
    settle();
    manual.fire(ms);
    for (const fn of stepped) fn(ms);   // deferred time rides the driven clock (see onStepped)
    settle();
  },
  /** Register an observer of DRIVEN time — called with each step's ms.
   *  The determinism seam for WALL-CLOCK work: `settleMotion` makes declared
   *  motion frame-exact and costs no real time, so anything on a raw
   *  `setTimeout` (a tooltip's show delay, a press flash) is invisible to it
   *  and fires on whatever the machine's load decides. A harness that
   *  virtualizes timers registers here, and those delays advance WITH the
   *  clock instead of racing it — which is what makes a captured frame the
   *  same picture on a fast machine and a loaded one. Returns an unsubscribe. */
  onStepped(fn: (ms: number) => void): () => void {
    stepped.push(fn);
    return () => { const i = stepped.indexOf(fn); if (i >= 0) stepped.splice(i, 1); };
  },
  /** Run all in-flight FINITE motion to rest (springs settle, non-looping
   *  animators finish), frame by frame. Perpetual motion — a Heartbeat, an
   *  `repeat = Infinity` animator — is life, not transition (RULED
   *  2026-08-06; Ticker.perpetual): it keeps ticking under the steps but
   *  never holds settle open, so a pulsing indicator no longer makes the one
   *  determinism primitive time out. Returns false if `maxMs` of stepped
   *  time wasn't enough — the "this never settles" signal, now reserved for
   *  genuine non-convergence (e.g. a spring perpetually re-armed from its
   *  own rest). */
  settleMotion(maxMs = 5000): boolean {
    if (clockMode !== "manual") this.manual();
    let t = 0;
    while (sharedClock.settling && t < maxMs) {
      this.step(16.7);
      t += 16.7;
    }
    return !sharedClock.settling;
  },
};

// ── the page bridge ─────────────────────────────────────────────────────────

/** The evaluate service, loaded lazily (it is heavy and boot never needs it)
 *  but PRIMED when the first bridge is created — so by the time anyone calls
 *  `evaluate`, the write applies synchronously INSIDE the call, before the
 *  caller's next statement. Without this, `evaluate("app", 'app.x = 1')`
 *  followed in the same turn by `clock.step()` stepped over a write that had
 *  not landed yet — a sequence that reads as "the Spring never re-evaluates"
 *  (GitHub #17's readout) against a spring that is fine. */
let evalService: typeof import("./inspect-service.js") | null = null;
let evalServicePriming = false;
function primeEvalService(): void {
  if (evalService !== null || evalServicePriming) return;
  evalServicePriming = true;
  void import("./inspect-service.js").then((m) => { evalService = m; });
}

/** The `window.__declare` surface boot.ts installs for a top-level app: the
 *  whole inspect API bound to that app's root. What verify's rung 5 drives,
 *  and what a human pokes in the console. */
export function bridgeFor(root: Node): Record<string, unknown> {
  primeEvalService();
  return {
    inspect: (path?: string) => {
      const n = path !== undefined ? find(root, path) : root;
      return n !== null ? inspect(n, path ?? "app") : null;
    },
    find: (path: string) => find(root, path),
    explain: (path: string, attr: string) => {
      const n = find(root, path);
      return n !== null ? explain(n, attr) : null;
    },
    stats: () => stats(root),
    /** Geometry + causality queries — the same set the Inspector's panes use, so
     *  an agent, an assert script and the UI all ask the identical questions. */
    slots: (path: string) => { const n = find(root, path); return n === null ? [] : slotsOf(n); },
    expand: (path: string, attr: string, trail: readonly string[] = []) => {
      const n = find(root, path);
      return n === null ? null : expandValue(n, attr, trail);
    },
    at: (x: number, y: number, pierce = false) => {
      // Default = the router's own rule (pointer-transparent views are
      // skipped, subtree included) — `at()` is the assert surface's "what
      // would take this press", and answering with a view no press can reach
      // made the act of looking lie. `pierce = true` remains for the
      // Inspector's pick tool, which legitimately wants decorative views.
      const v = pickAt(root, x, y, pierce);
      return v === null ? null : { path: pathOf(root, v), kind: kindName(v) };
    },
    /** WHY that point resolved so — the hit walk's own decisions in order.
     *  On the bridge because this is the question a HOST asks: the DOM's
     *  `__declare`, the canvas page, and the native control channel's `eval`
     *  all reach it identically, so "what would take this press, and what did
     *  it step over" is one answer with three transports instead of a verb
     *  per host. (The native `trace` narrates the Mac LAYER walk, which is a
     *  different question about a different tree.) */
    explainHit: (x: number, y: number, pierce = false) => explainHit(root, x, y, pierce),
    dependents: (attr: string) => dependentsOf(root, attr),
    /** Evaluate Declare in the scope of a node — read, set, bind, or add a view.
     *  The Inspector's strip and an agent hit the same entry point. Once the
     *  primed service is loaded (which boot arranges), the effect lands
     *  synchronously inside this call — set-then-step-then-read in one turn
     *  works; only the promise wrapper remains, for the result value. */
    evaluate: (path: string, src: string) => {
      if (evalService !== null) return Promise.resolve(evalService.evaluateIn(root as never, path, src));
      return import("./inspect-service.js").then((m) => {
        evalService = m;
        return m.evaluateIn(root as never, path, src);
      });
    },
    clock,
  };
}

/** The dotted address of a live node under `root` — the inverse of find(). */
function pathOf(root: Node, n: Node): string {
  const parts: string[] = [];
  let cur: Node | null = n;
  while (cur !== null && cur.parent !== null && cur !== root) {
    const m = nameOf(cur);
    parts.unshift(m ?? String(cur.parent.children.indexOf(cur)));
    cur = cur.parent;
  }
  return ["app", ...parts].join(".");
}

// ── the Inspector's additions ───────────────────────────────────────────────
// Hit-testing, reverse dependency edges, and lazy value expansion — the three
// queries an interactive object browser needs that verify's rung 5 never did.
// All are pay-per-use: nothing here runs until asked.

/** PICK the view under a point — what a press at that point would reach.
 *
 *  NOT the same coordinates as `View.viewAt`, and the two used to share a name,
 *  which cost a reader three wrong conclusions before the difference surfaced.
 *  `View.viewAt` takes the root's CONTENT space (drag events carry those, and it
 *  converts at the boundary); this takes the subject's viewport — the space the
 *  picker's own pointer lives in, since the overlay is fixed, so no conversion is
 *  wanted. Both run THE hit walk (interaction.ts leafAt), the one the pointer is
 *  routed by, so a pick highlights exactly what a press would reach, at any
 *  scroll. `pierce` is the picker's one deviation: a
 *  pointer-transparent view is still selectable,
 *  because a developer asking "what is this?" means the thing they can see.
 *  (This used to be a second, cruder implementation — plain rectangle
 *  containment, blind to clip, scale, and pivot — which is precisely the
 *  duplication that produced a mis-hit window corner elsewhere.) */
export function pickAt(root: Node, x: number, y: number, pierce = true): View | null {
  return hitAt(root, x, y, pierce) as View | null;
}

/** WHY the point resolved the way it did — the hit walk's own decisions, in
 *  order: what it descended into, what it skipped and for which reason, and
 *  what finally took the point.
 *
 *  `pickAt` answers *what*, which is enough when the answer is right and
 *  useless when it is wrong. Every interaction bug of the 2026-07 run was a
 *  disagreement between where a view PAINTS and where the walk THINKS it is —
 *  a scroll term missing from the transform, a cursor-following dot silently
 *  occluding the page, chrome stranded in the wrong parent — and each cost
 *  hours of inference from the outside because nothing could be asked directly.
 *
 *  The narration is produced by instrumenting THE walk (interaction.ts
 *  traceHitAt), so it can never drift from the router's real answer, and it is
 *  backend-neutral: the same question, identically answered, over the DOM
 *  bridge, the canvas host, and the native control channel's `eval`. Takes a
 *  point in the root's viewport, like `pickAt`. `pierce` defaults false —
 *  the router's own rule — so a pointer-transparent view reports as skipped
 *  rather than silently being the answer. */
export function explainHit(root: Node, x: number, y: number, pierce = false):
    { hit: string | null; steps: { path: string; kind: string; why: string; x: number; y: number }[] } {
  const { hit, notes } = traceHitAt(root, x, y, pierce);
  const path = (v: unknown): string => {
    const parts: string[] = [];
    for (let n = v as unknown as Node | null; n !== null && n.parent !== null; n = n.parent) {
      parts.unshift(nameOf(n) ?? String(n.parent.children.indexOf(n)));
    }
    return ["app", ...parts].join(".");
  };
  return {
    hit: hit === null ? null : path(hit),
    steps: notes.map((n) => ({ path: path(n.view), kind: kindName(n.view as unknown as Node), why: n.why, x: n.x, y: n.y })),
  };
}

/** Every (path, attr) whose constraint READS `target` — the reverse of
 *  `explain().deps`, answering "what moves if this changes?". Computed by
 *  scanning owned slots and matching wired read-paths; O(slots), which at the
 *  desktop's ~1,950 is a few ms and only on demand. Read-paths are matched on
 *  their TAIL (`…hot` matches a dep written `this.parent.parent.hot`), so this
 *  is a useful over-approximation, not a proof — labelled as such in the UI. */
export function dependentsOf(root: Node, attr: string): { path: string; attr: string; label: string }[] {
  const out: { path: string; attr: string; label: string }[] = [];
  const walk = (n: Node, path: string): void => {
    for (const slot of ownedSlots(n)) {
      const owner = ownerOf(n, slot);
      const paths = owner?.wiredPaths;
      if (owner == null || paths == null) continue;
      if (paths.some((rp) => rp === attr || rp.endsWith("." + attr))) {
        out.push({ path, attr: slot, label: owner.label });
      }
    }
    n.children.forEach((c, i) => {
      const nm = (c as unknown as { $member?: string }).$member;
      walk(c, `${path}.${nm ?? i}`);
    });
  };
  walk(root, "app");
  return out;
}

/** ONE level of a slot's value, for the Inspector's disclosure triangles.
 *  `inspect()` reduces whole subtrees through safeAttr with a depth cap — right
 *  for transport, wrong for a browser, where the developer opens what they want
 *  and nothing else is paid for. Views are never expanded inline (their graph is
 *  cyclic): they are reported as links for the tree to navigate to. */
export interface ValueSlice {
  kind: "primitive" | "record" | "array" | "view" | "dataset" | "opaque";
  /** Rendered leaf value, when primitive. */
  text?: string;
  /** Child entries, when record/array/dataset. */
  entries?: { key: string; kind: ValueSlice["kind"]; text: string; open: boolean }[];
  /** For a view link: its kind, so the caller can render `FinderWindow ›`. */
  viewKind?: string;
  count?: number;
}

const leafText = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  const t = typeof v;
  if (t === "string") return JSON.stringify(v);
  if (t === "number") return Number.isInteger(v as number) ? String(v) : (v as number).toFixed(2);
  if (t === "boolean") return String(v);
  if (t === "function") return "«fn»";
  // Name a foreign object by its class rather than printing [object Object].
  const cn = (v as object).constructor?.name;
  return cn !== undefined && cn !== "Object" ? kindName(v as Node) : String(v);
};

const sliceKind = (v: unknown): ValueSlice["kind"] => {
  if (v === null || v === undefined) return "primitive";
  if (v instanceof View) return "view";
  const t = typeof v;
  if (t !== "object") return "primitive";
  if (Array.isArray(v)) return "array";
  const ctor = (v as object).constructor?.name;
  if (ctor === "Dataset" || ctor === "DataSource") return "dataset";
  if (ctor === "Object" || ctor === undefined) return "record";
  return "opaque";
};

/** Resolve a dotted value path (`menus.0.items`) inside a slot's value. */
function reach(base: unknown, trail: readonly string[]): unknown {
  let cur = base;
  for (const k of trail) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export function expandValue(node: Node, attr: string, trail: readonly string[] = []): ValueSlice {
  const root = (node as unknown as Record<string, unknown>)[attr];
  const v = reach(root, trail);
  const kind = sliceKind(v);
  if (kind === "view") {
    return { kind, viewKind: kindName(v as View) };
  }
  if (kind === "primitive" || kind === "opaque") {
    return { kind, text: leafText(v) };
  }
  // A Dataset/DataSource exposes its `.value` — the developer means the data.
  const holder = kind === "dataset" ? (v as unknown as { value: unknown }).value : v;
  const hk = sliceKind(holder);
  if (hk === "primitive" || hk === "opaque") return { kind: hk, text: leafText(holder) };
  const entries: NonNullable<ValueSlice["entries"]> = [];
  if (Array.isArray(holder)) {
    holder.slice(0, 200).forEach((e, i) => {
      const k = sliceKind(e);
      entries.push({
        key: String(i),
        kind: k,
        text: k === "view" ? kindName(e as View) : k === "array" ? `array[${(e as unknown[]).length}]` : k === "record" ? "{ }" : leafText(e),
        open: k === "record" || k === "array" || k === "dataset",
      });
    });
    return { kind: "array", entries, count: holder.length };
  }
  for (const [k, e] of Object.entries(holder as Record<string, unknown>).slice(0, 200)) {
    const kk = sliceKind(e);
    entries.push({
      key: k,
      kind: kk,
      text: kk === "view" ? kindName(e as View) : kk === "array" ? `array[${(e as unknown[]).length}]` : kk === "record" ? "{ }" : leafText(e),
      open: kk === "record" || kk === "array" || kk === "dataset",
    });
  }
  return { kind: "record", entries, count: entries.length };
}

/** The slots of a node, in declaration-ish order, each with its provenance —
 *  the Object pane's row source. */
const HEX = (n: number): string => "#" + (n >>> 0).toString(16).padStart(6, "0").toUpperCase().slice(-6);

/** Is this slot declared a color on the node's schema chain? Colors are
 *  stored as plain numbers, and a decimal is unreadable — the pane prints
 *  #RRGGBB and paints a swatch, which is the whole point of showing it. */
function isColorSlot(node: Node, attr: string): boolean {
  let sc: { attrs?: Record<string, { kind?: string }>; base?: unknown } | null =
    (node as unknown as { $schema?: never }).$schema ?? null;
  // No schema handle at runtime — fall back to the conventional names.
  if (sc === null) return /color$|^fill$|^stroke$|Color$|color/i.test(attr);
  return false;
}

export function slotsOf(node: Node): {
  attr: string; text: string; kind: ValueSlice["kind"]; open: boolean;
  origin: "constraint" | "set" | "default"; motion: boolean; viewKind?: string; color?: string;
}[] {
  const out: ReturnType<typeof slotsOf> = [];
  const own = ownValues(node) as Record<string, unknown>;
  const names = new Set<string>([...Object.keys(own), ...ownedSlots(node)]);
  for (const attr of [...names].sort()) {
    const v = (node as unknown as Record<string, unknown>)[attr];
    const k = sliceKind(v);
    const owner = ownerOf(node, attr);
    const motion = node.children.some((c) => {
      const s = c as unknown as { attribute?: unknown };
      const cn = c.constructor.name;
      return (cn === "Spring" || cn === "Animator" || cn === "AnimatorGroup") && s.attribute === attr;
    });
    const colorish = typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xFFFFFF && isColorSlot(node, attr);
    out.push({
      attr,
      kind: k,
      color: colorish ? HEX(v as number) : undefined,
      text: colorish ? HEX(v as number)
        : k === "view" ? kindName(v as View) : k === "array" ? `array[${(v as unknown[]).length}]` : k === "record" ? "{ }" : k === "dataset" ? "Dataset" : leafText(v),
      open: k === "record" || k === "array" || k === "dataset",
      viewKind: k === "view" ? kindName(v as View) : undefined,
      origin: owner !== null ? "constraint" : isSet(node, attr) ? "set" : "default",
      motion,
    });
  }
  return out;
}
