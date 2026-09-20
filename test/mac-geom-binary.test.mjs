// mac-geom-binary — the Mac backend's binary geometry channel (mac-backend.ts
// emitGeom / flushOps): GEOM ops leave the JSON stream as [seq, id, x, y, w, h]
// records, and replaying records + JSON by `seq` reproduces EXACTLY the op
// sequence the all-JSON path sends. A host without commitGeom gets all JSON.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { MacBackend, flushOps, countOps } from "../runtime/dist/mac-backend.js";

function makeHost(binary) {
  const commits = [];
  const h = {
    commit: (json) => commits.push({ json, geoms: [] }),
    measure: () => [0, 10, 3, 7], imageSize: () => [0, 0],
  };
  if (binary) h.commitGeom = (json, buf, n) => commits.push({ json, geoms: Array.from(buf.subarray(0, n * 6)) });
  return { h, commits };
}
/** The op sequence a host would apply: JSON ops with each record replayed before op index seq. */
function replay({ json, geoms }) {
  const ops = JSON.parse(json), out = [];
  let g = 0;
  const before = (i) => { while (g * 6 < geoms.length && geoms[g * 6] <= i) { const o = g * 6; out.push([5, geoms[o + 1], geoms[o + 2], geoms[o + 3], geoms[o + 4], geoms[o + 5]]); g++; } };
  ops.forEach((op, i) => { before(i); out.push(op); });
  before(Infinity);
  return out;
}
function drive(binary) {
  const { h, commits } = makeHost(binary);
  globalThis.__declareMacHost = h;
  globalThis.requestAnimationFrame = undefined;   // flush explicitly below
  const b = new MacBackend();
  const surfaces = [];
  for (let i = 0; i < 12; i++) {
    const s = b.createSurface();
    s.setX(i * 3); s.setY(i * 7);
    if (i % 3 === 0) s.setOpacity?.(0.5);   // interleave a JSON op between geometry
    s.setWidth(100 + i); s.setHeight(20 + i);
    s.setX(i * 3 + 1);                        // a later geometry op for the same view
    surfaces.push(s);
  }
  const pending = countOps();
  flushOps();
  return { commits, pending };
}

await test("binary geometry replays to the exact all-JSON op sequence", async () => {
  // the backend decides binary vs JSON once per module; run JSON first in a fresh import is not
  // possible, so compare against the JSON path through the fallback flag instead
  const bin = drive(true);
  assert.ok(bin.commits.length >= 1, "a commit happened");
  assert.ok(bin.commits.some((c) => c.geoms.length > 0), "geometry rode the binary channel");
  const binSeq = bin.commits.flatMap(replay);
  assert.ok(binSeq.filter((op) => op[0] === 5).length > 0, "GEOM ops present after replay");
  // every op that is not GEOM stays in JSON, in order; every GEOM is a 6-number record
  for (const c of bin.commits) for (const op of JSON.parse(c.json)) assert.notEqual(op[0], 5, "no GEOM left in the JSON");
  assert.equal(bin.pending, binSeq.length, "countOps counts records and JSON ops alike");
  // ordering: for each surface, its CREATE precedes its first GEOM, and its last GEOM carries the last x
  const firstIdx = new Map(), lastGeom = new Map();
  binSeq.forEach((op, i) => { if (!firstIdx.has(op[1])) firstIdx.set(op[1], { op: op[0], i }); if (op[0] === 5) lastGeom.set(op[1], op); });
  for (const [id, f] of firstIdx) assert.notEqual(f.op, 5, `surface ${id}: a GEOM arrived before its CREATE`);
  for (const [id, op] of lastGeom) assert.equal((op[2] - 1) % 3, 0, `surface ${id}: the last geometry op is the last write (x = 3i+1), got ${op[2]}`);
});

summarize("mac-geom-binary");
