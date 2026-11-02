// retainers — who keeps an object alive. Takes a V8 heap snapshot in-process,
// then BFS from the GC roots, skipping weak edges, WeakMap internals and stack
// roots, to the nearest object matching a predicate, and prints the path.
//
//   import { retainingPaths } from "./retainers.mjs";
// Tag a victim with an OBJECT value (v.__soakDead = {}): a heap snapshot keeps no edge to a small integer.
// Matching is by snapshot facts only: constructor name, and optionally an
// object having a property edge named `mark` (tag your victims: v.__soakDead = {}).
import v8 from "node:v8";
import { readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

export function snapshot() {
  const file = v8.writeHeapSnapshot(path.join(tmpdir(), `soak-${process.pid}-${Date.now()}.heapsnapshot`));
  const snap = JSON.parse(readFileSync(file, "utf8"));
  unlinkSync(file);
  return snap;
}

/** Paths from roots to objects carrying property `mark` (or with ctor name `ctor`). */
export function retainingPaths(opts = {}) {
  const s = opts.snap ?? snapshot();
  let r = pathsIn(s, { ...opts, strict: true });
  if (r.targets > 0 && r.paths.length === 0) { r = pathsIn(s, { ...opts, strict: false }); r.mode = "through WeakMap pairs / stack roots"; }
  return r;
}
function pathsIn(s, { mark = "__soakDead", ctor = null, max = 3, strict = true } = {}) {
  const m = s.snapshot.meta, nf = m.node_fields, ef = m.edge_fields;
  const NF = nf.length, EF = ef.length;
  const nTypes = m.node_types[0], eTypes = m.edge_types[0];
  const nodes = s.nodes, edges = s.edges, strings = s.strings;
  const iType = nf.indexOf("type"), iName = nf.indexOf("name"), iEC = nf.indexOf("edge_count"), iId = nf.indexOf("id");
  const eType = ef.indexOf("type"), eName = ef.indexOf("name_or_index"), eTo = ef.indexOf("to_node");
  const N = nodes.length / NF;
  const firstEdge = new Uint32Array(N + 1);
  for (let i = 0, e = 0; i < N; i++) { firstEdge[i] = e; e += nodes[i * NF + iEC] * EF; firstEdge[i + 1] = e; }
  const name = (i) => strings[nodes[i * NF + iName]];
  const type = (i) => nTypes[nodes[i * NF + iType]];
  const edgeName = (e) => { const t = eTypes[edges[e + eType]]; return (t === "element" || t === "hidden") ? `[${edges[e + eName]}]` : strings[edges[e + eName]]; };
  // targets
  const isTarget = new Uint8Array(N);
  let nt = 0;
  for (let i = 0; i < N; i++) {
    if (type(i) !== "object") continue;
    if (ctor !== null && name(i) === ctor) { isTarget[i] = 1; nt++; continue; }
    if (mark !== null) for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EF) {
      if (eTypes[edges[e + eType]] === "property" && strings[edges[e + eName]] === mark) { isTarget[i] = 1; nt++; break; }
    }
  }
  // BFS from root (node 0)
  const prev = new Int32Array(N).fill(-1), prevE = new Int32Array(N).fill(-1);
  const seen = new Uint8Array(N); seen[0] = 1;
  let q = [0];
  const found = [];
  while (q.length && found.length < max) {
    const nq = [];
    for (const i of q) {
      for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EF) {
        const t = eTypes[edges[e + eType]];
        if (t === "weak" || t === "shortcut") continue;
        const en = edgeName(e);
        if (strict && typeof en === "string" && (en.includes("pair in WeakMap") || en.includes("part of key"))) continue;
        const to = edges[e + eTo] / NF;
        if (strict && name(to) === "(Stack roots)") continue;
        if (seen[to]) continue;
        seen[to] = 1; prev[to] = i; prevE[to] = e;
        if (isTarget[to]) { found.push(to); if (found.length >= max) break; }
        nq.push(to);
      }
      if (found.length >= max) break;
    }
    q = nq;
  }
  const out = [];
  for (const t of found) {
    const p = [];
    // a rule names itself: its `label` says which of the runtime's rules holds the path
    const label = (x) => { if (name(x) !== "Constraint") return ""; for (let e = firstEdge[x]; e < firstEdge[x + 1]; e += EF) if (edgeName(e) === "label") return ` "${name(edges[e + eTo] / NF).slice(0, 60)}"`; return ""; };
    for (let x = t; x !== 0 && x !== -1; x = prev[x]) p.push(`${type(x)}:${name(x).slice(0, 50)}${label(x)}` + (prevE[x] >= 0 ? ` <-[${String(edgeName(prevE[x])).slice(0, 50)}]-` : ""));
    out.push(p.reverse().join("\n   "));
  }
  return { targets: nt, paths: out };
}

/** Count objects by constructor name (type "object" only). */
export function census() {
  const s = snapshot();
  const m = s.snapshot.meta, NF = m.node_fields.length;
  const iType = m.node_fields.indexOf("type"), iName = m.node_fields.indexOf("name");
  const nTypes = m.node_types[0];
  const out = new Map();
  for (let i = 0; i < s.nodes.length; i += NF) {
    if (nTypes[s.nodes[i + iType]] !== "object") continue;
    const n = s.strings[s.nodes[i + iName]];
    out.set(n, (out.get(n) ?? 0) + 1);
  }
  return out;
}
export function censusDiff(a, b, top = 25, per = 1) {
  const d = [];
  for (const [k, v] of b) { const x = v - (a.get(k) ?? 0); if (x > 0) d.push([k, +(x / per).toFixed(2)]); }
  return d.sort((p, q) => q[1] - p[1]).slice(0, top);
}
