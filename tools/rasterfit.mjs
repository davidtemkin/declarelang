// rasterfit — the cost model's constants, from measured rows.
//
//   node tools/rasterfit.mjs <chrome-kinds.json> [more.json…]
//
// The canvas backend prices a recording as
//     ops × OP_US(kind) + coveredDevicePx × PX_US_PER_MPX(kind) / 1e6
// and both constants were placeholders. This reads the op-kind sweep — same
// span, same alpha, same op counts, only WHAT each mark is — and fits the two
// terms per kind and per renderer from Chrome tracing's `paintMs`, the one
// column calibrated against known work.
//
// The fit is a straight line through the ops axis at fixed span: paint(ops) =
// a + b·ops. Covered device px per op is known from the probe's geometry (span²
// of the view, at the reported dpr), so the per-op term and the per-pixel term
// are separable only if two spans were run; with one span the SLOPE bundles
// both and is reported as "µs per op, at this mark size" — still the number the
// model needs most, because it is what differs 40x between a solid fill and a
// shadow. A second span run separates them; the tool says which it has.
//
// NOT A GATE. It prints constants and the residual, and a person decides
// whether they belong in canvas-backend.ts.
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) { console.error("usage: node tools/rasterfit.mjs <rows.json>…"); process.exit(2); }
const rows = files.flatMap((f) => JSON.parse(readFileSync(f, "utf8")));

// group: engine → renderer → kind → [{ops, paint, p95, gpu}]
const groups = new Map();
for (const r of rows) {
  if (r.probe !== "kinds") continue;
  const m = /^kind (\w+)/.exec(r.sweep);
  if (!m) continue;
  const key = `${r.engine} · ${r.renderer}`;
  if (!groups.has(key)) groups.set(key, new Map());
  const byKind = groups.get(key);
  if (!byKind.has(m[1])) byKind.set(m[1], []);
  byKind.get(m[1]).push({ ops: r.value, paint: r.paintMs ?? null, gpu: r.gpuMs ?? null, p95: r.p95, dpr: r.dpr });
}

const fit = (pts, y) => {
  // least squares y = a + b·x over the points that have y
  const P = pts.filter((p) => p[y] !== null && p[y] !== undefined);
  if (P.length < 2) return null;
  const n = P.length;
  const sx = P.reduce((s, p) => s + p.ops, 0), sy = P.reduce((s, p) => s + p[y], 0);
  const sxx = P.reduce((s, p) => s + p.ops * p.ops, 0), sxy = P.reduce((s, p) => s + p.ops * p[y], 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  const resid = Math.sqrt(P.reduce((s, p) => s + (p[y] - (a + b * p.ops)) ** 2, 0) / n);
  return { a, b, resid, n };
};

const STEPS = 30;   // the sweep's step count — paint is a sum over the steps
for (const [key, byKind] of groups) {
  console.log(`\n══ ${key} ══`);
  const hasPaint = [...byKind.values()].some((pts) => pts.some((p) => p.paint !== null));
  const col = hasPaint ? "paint" : "p95";
  console.log(`  fitting ${col === "paint" ? "paintMs (calibrated)" : "p95 cadence (no trace on this engine — indicative)"} = a + b·ops`);
  console.log("  " + "kind".padEnd(10) + "µs/op/step".padStart(12) + "fixed ms".padStart(10) + "resid".padStart(8) + "  points");
  const base = fit(byKind.get("fill") ?? [], col);
  for (const [kind, pts] of byKind) {
    const f = fit(pts, col);
    if (!f) { console.log("  " + kind.padEnd(10) + "   (too few points)"); continue; }
    // b is ms per op over STEPS steps → µs per op per step
    const usPerOp = (f.b / STEPS) * 1000;
    const rel = base && base.b > 0 ? ` (${(f.b / base.b).toFixed(1)}× fill)` : "";
    console.log("  " + kind.padEnd(10) + usPerOp.toFixed(2).padStart(12) + f.a.toFixed(0).padStart(10) + f.resid.toFixed(1).padStart(8)
      + "  " + pts.map((p) => `${p.ops}→${(p[col] ?? "—")}`).join(" ") + rel);
  }
}
// ── two spans → the per-op term and the per-pixel term, per kind ──────────
//
// slope(span) = OP + PX · area(span), and area is the probe's own geometry:
// mark = span² × view × dpr². Two spans, two equations. Text and strokes are
// not area-driven (glyph count and perimeter, respectively), so their PX term
// is expected to land near zero and their OP term is the number.
const VIEW_PX = 900 * 600;
const bySpan = new Map();   // "engine · renderer" → kind → span → slope (ms per op over STEPS)
for (const r of rows) {
  if (r.probe !== "kinds" && r.probe !== "kinds-small") continue;
  const m = /^kind (\w+)/.exec(r.sweep);
  if (!m) continue;
  const span = r.probe === "kinds-small" ? 0.06 : 0.25;
  const key = `${r.engine} · ${r.renderer}`;
  bySpan.set(key, bySpan.get(key) ?? new Map());
  const kinds = bySpan.get(key);
  kinds.set(m[1], kinds.get(m[1]) ?? new Map());
  const pts = kinds.get(m[1]);
  pts.set(span, pts.get(span) ?? []);
  pts.get(span).push({ ops: r.value, paint: r.paintMs ?? null, dpr: r.dpr ?? 2 });
}
let printedHeader = false;
for (const [key, kinds] of bySpan) {
  const twoSpan = [...kinds.values()].some((pts) => pts.size >= 2);
  if (!twoSpan) continue;
  if (!printedHeader) { console.log("\n══ per-op and per-pixel terms, from two spans ══"); printedHeader = true; }
  console.log(`\n  ${key}`);
  console.log("  " + "kind".padEnd(10) + "OP µs/op".padStart(10) + "PX ms/Mpx".padStart(11) + "   spans");
  for (const [kind, pts] of kinds) {
    const spans = [...pts.keys()].sort((a, b) => b - a);
    if (spans.length < 2) continue;
    const slopeAt = (sp) => { const f = fit(pts.get(sp), "paint"); return f ? (f.b / STEPS) * 1000 : null; };  // µs per op per step
    const [s1, s2] = spans;
    const b1 = slopeAt(s1), b2 = slopeAt(s2);
    if (b1 === null || b2 === null) continue;
    const dpr = pts.get(s1)[0].dpr;
    const A1 = s1 * s1 * VIEW_PX * dpr * dpr / 1e6, A2 = s2 * s2 * VIEW_PX * dpr * dpr / 1e6;   // Mpx per op
    const px = (b1 - b2) / (A1 - A2);          // µs per Mpx
    const op = b1 - px * A1;                   // µs per op
    console.log("  " + kind.padEnd(10) + op.toFixed(1).padStart(10) + (px / 1000).toFixed(2).padStart(11)
      + `   ${s1}→${b1.toFixed(1)}µs/op  ${s2}→${b2.toFixed(1)}µs/op`);
  }
}
console.log("\nOP is the per-op setup cost of that kind; PX its per-pixel shading cost. A negative or near-zero PX means the\nkind is not area-driven (text, strokes). These are the numbers for canvas-backend.ts's threshold and draw.ts's weights.");
