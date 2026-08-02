// The selector evaluator (B3, jsonpath-spelling.md — RULED 2026-07-30; the
// runtime half of data-paths.md §5's emitted plans). A compiled plan is a
// segment array (datapath.ts PathSeg): names, indices, slices, wildcards. The
// compiler did all parsing; this module only EVALUATES — which is what lets a
// production build that uses no selectors ship without it (declarec stubs
// this module the way it stubs the island scanner).
//
// Semantics are RFC 9535's, scoped to the shipped subset, with ONE documented
// seam: a plan's LEADING run of names evaluates through the path currency
// (Dataset.read — the coercing own-key walk, where `:rows.length` reads an
// array's length, corpus-live in the docs app). From the first SELECTOR
// onward the evaluation is RFC-strict: a name selects only an object's own
// member (nothing on an array), an index only an array element (negative =
// from the end), a slice per the RFC's bounds algorithm (negative step
// included), a wildcard an array's elements or an object's member values.
// The conformance suite exercises `evaluatePlan` — the strict evaluator over
// a plain value — so the claim is checkable without the tracking layer.
//
// TRACKING (data-paths.md §9 — over-approximate, never miss an edge): the
// leading-names read registers the deepest singular region cell exactly as
// every `:path` read does, and every Dataset mutation wakes the FULL ancestor
// chain of its target (data.ts wakeChain) — so any edit at, under, or
// replacing the selective region re-runs the reader. Membership changes
// (insert/remove/reorder) wake the same cell through the chain. The safe
// side is a no-op recompute; the miss side cannot happen by construction.
// (A plan always begins with a name — the grammar requires an identifier
// after `:` — so the tracked prefix is never empty.)

import type { Dataset } from "./data.js";
import type { PathSeg } from "./datapath.js";

/** An RFC 9535 node: a value plus its location — locations are what let
 *  replication cursor each selected record at its REAL place (`:rows[2:8][]`
 *  instances point at rows 2..7, not 0..5). */
export interface PathNode {
  path: readonly string[];
  value: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** RFC 9535 §2.3.4.2.2 — the slice bounds algorithm, verbatim. */
function sliceIndices(len: number, [start, end, step0]: [number | null, number | null, number | null]): number[] {
  const step = step0 ?? 1;
  if (step === 0) return []; // RFC: step 0 selects nothing
  const norm = (v: number): number => (v >= 0 ? v : len + v);
  const s = start ?? (step > 0 ? 0 : len - 1);
  const e = end ?? (step > 0 ? len : -len - 1);
  const out: number[] = [];
  if (step > 0) {
    const lower = Math.min(Math.max(norm(s), 0), len);
    const upper = Math.min(Math.max(norm(e), 0), len);
    for (let i = lower; i < upper; i += step) out.push(i);
  } else {
    const upper = Math.min(Math.max(norm(s), -1), len - 1);
    const lower = Math.min(Math.max(norm(e), -1), len - 1);
    for (let i = upper; i > lower; i += step) out.push(i);
  }
  return out;
}

/** Apply one segment to a nodelist — the RFC-strict step. */
function applySeg(nodes: readonly PathNode[], seg: PathSeg): PathNode[] {
  const out: PathNode[] = [];
  for (const n of nodes) {
    const v = n.value;
    if (typeof seg === "string") {
      if (isObj(v) && !Array.isArray(v) && Object.hasOwn(v, seg)) {
        out.push({ path: [...n.path, seg], value: v[seg] });
      }
    } else if ("i" in seg) {
      if (Array.isArray(v)) {
        const i = seg.i < 0 ? v.length + seg.i : seg.i;
        if (i >= 0 && i < v.length) out.push({ path: [...n.path, String(i)], value: v[i] });
      }
    } else if ("w" in seg) {
      if (Array.isArray(v)) {
        v.forEach((el, i) => out.push({ path: [...n.path, String(i)], value: el }));
      } else if (isObj(v)) {
        for (const key of Object.keys(v)) out.push({ path: [...n.path, key], value: v[key] });
      }
    } else {
      if (Array.isArray(v)) {
        for (const i of sliceIndices(v.length, seg.s)) {
          out.push({ path: [...n.path, String(i)], value: v[i] });
        }
      }
    }
  }
  return out;
}

/** The strict evaluator over a plain value — every segment RFC-semantics,
 *  leading names included. This is the conformance surface the compliance
 *  tier tests; the reactive entries below ride it after the tracked prefix. */
export function evaluatePlan(value: unknown, plan: readonly PathSeg[]): PathNode[] {
  let nodes: PathNode[] = [{ path: [], value }];
  for (const seg of plan) nodes = applySeg(nodes, seg);
  return nodes;
}

/** Selected nodes (value + real location) at `base`+`plan` in `data`, under
 *  tracking — replication's entry. The leading names walk through
 *  `Dataset.read` (the tracked, coercing currency); selectors evaluate
 *  strictly from there. */
export function selectNodes(data: Dataset, base: readonly string[], plan: readonly PathSeg[]): PathNode[] {
  const k = plan.findIndex((s) => typeof s !== "string");
  const prefix = (k < 0 ? plan : plan.slice(0, k)) as readonly string[];
  const path = [...base, ...prefix];
  const start = data.read(path);
  if (start === undefined) return [];
  let nodes: PathNode[] = [{ path, value: start }];
  if (k >= 0) for (const seg of plan.slice(k)) nodes = applySeg(nodes, seg);
  return nodes;
}

/** A plan's VALUE, the `$data` entry: a singular plan (names + indices only)
 *  yields the one value or null (language §9's unresolved contract); a
 *  selective plan yields the nodelist's values — `[]` when nothing matches,
 *  never null (an empty selection is an answer, not an absence). */
export function selectValue(data: Dataset, base: readonly string[], plan: readonly PathSeg[]): unknown {
  const singular = plan.every((s) => typeof s === "string" || "i" in s);
  const nodes = selectNodes(data, base, plan);
  if (singular) return nodes.length > 0 && nodes[0].value !== undefined ? nodes[0].value : null;
  return nodes.map((n) => n.value);
}
