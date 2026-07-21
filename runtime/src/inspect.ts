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
import { View } from "./view.js";
import { isSet, ownerOf, ownValues, ownedSlots } from "./attributes.js";
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
  /** Root-space position — the parent chain's offsets summed. */
  rootX: number; rootY: number;
  visible: boolean;
  text?: string;
  /** The node's OWN attribute values (instance writes and bound results —
   *  the overlay over class defaults). A snapshot. */
  attrs: Record<string, unknown>;
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
  let rootX = 0, rootY = 0;
  for (let n: Node | null = node; n !== null && n.parent !== null; n = n.parent) {
    if (isView(n)) { rootX += n.x; rootY += n.y; }
  }
  const record: InspectNode = {
    kind: kindName(node),
    name: nameOf(node),
    path,
    x: v?.x ?? 0, y: v?.y ?? 0, width: v?.width ?? 0, height: v?.height ?? 0,
    rootX, rootY,
    visible: v?.visible ?? true,
    attrs: safeAttr(ownValues(node)) as Record<string, unknown>,
    children: node.children.map((c, i) => {
      const childName = nameOf(c);
      return inspect(c, `${path}.${childName ?? i}`);
    }),
  };
  const text = (node as unknown as { text?: unknown }).text;
  if (typeof text === "string" && text !== "") record.text = text;
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
   *  graph — every constraint downstream of the motion lands before return. */
  step(ms = 16.7): void {
    if (clockMode !== "manual") this.manual();
    manual.fire(ms);
    settle();
  },
  /** Run all in-flight motion to rest (springs settle, animators finish),
   *  frame by frame. Returns false if `maxMs` of stepped time wasn't enough —
   *  the assertion harness's "this never settles" signal. */
  settleMotion(maxMs = 5000): boolean {
    if (clockMode !== "manual") this.manual();
    let t = 0;
    while (sharedClock.busy && t < maxMs) {
      this.step(16.7);
      t += 16.7;
    }
    return !sharedClock.busy;
  },
};

// ── the page bridge ─────────────────────────────────────────────────────────

/** The `window.__declare` surface boot.ts installs for a top-level app: the
 *  whole inspect API bound to that app's root. What verify's rung 5 drives,
 *  and what a human pokes in the console. */
export function bridgeFor(root: Node): Record<string, unknown> {
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
    at: (x: number, y: number) => {
      const v = viewAt(root, x, y);
      return v === null ? null : { path: pathOf(root, v), kind: kindName(v) };
    },
    dependents: (attr: string) => dependentsOf(root, attr),
    /** Evaluate Declare in the scope of a node — read, set, bind, or add a view.
     *  The Inspector's strip and an agent hit the same entry point. */
    evaluate: async (path: string, src: string) => {
      const m = await import("./inspect-service.js");
      return m.evaluateIn(root as never, path, src);
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

/** The VIEW under a root-space point — topmost visible wins, depth-first from
 *  the end of each child list (later siblings paint over earlier ones, the
 *  language's stacking rule). Deliberately geometric rather than routed
 *  through the input router's sink resolution: the picker must find a view
 *  whether or not it declares handlers, and must see the view that is actually
 *  on top even when a transparent sibling would swallow the press. */
export function viewAt(root: Node, x: number, y: number): View | null {
  let best: View | null = null;
  const walk = (n: Node, ox: number, oy: number): void => {
    if (!isView(n)) return;
    if (n.visible === false) return;
    const left = ox + (n.x || 0);
    const top = oy + (n.y || 0);
    const w = n.width || 0;
    const h = n.height || 0;
    const inside = x >= left && x <= left + w && y >= top && y <= top + h;
    if (inside) best = n;
    // Descend regardless of `inside`: a child may overflow an unclipped parent.
    for (const c of n.children) walk(c, left, top);
  };
  walk(root, 0, 0);
  return best;
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
