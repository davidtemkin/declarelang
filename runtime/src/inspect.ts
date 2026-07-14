// inspect — the runtime's structured act of looking (design/verify-and-evals.md
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
function nameOf(node: Node): string | null {
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
    kind: node.constructor.name || "Node",
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
  constraint: { label: string; static: boolean; deps: readonly string[] | null } | null;
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
      ? { label: owner.label, static: owner.isStatic, deps: owner.wiredPaths }
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
    clock,
  };
}
