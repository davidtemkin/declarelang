// cmp — two labels, same cases, side by side.   node mac-host/profile/cmp.mjs <beforeLabel> <afterLabel>
import { readFileSync } from "node:fs"; import path from "node:path";
const [A, B] = process.argv.slice(2);
const R = (f) => { try { return JSON.parse(readFileSync(path.join("mac-host/profile/results", f), "utf8")); } catch { return null; } };
const pct = (a, b) => (b == null || a == null ? "" : ((b - a) / a * 100).toFixed(0) + "%");
console.log("| case | " + A + " | " + B + " | change |\n|---|---|---|---|");
for (const [tgt, pat] of [["chrome", (l, c) => `web-${c}-inpage-dom-${l}.json`], ["mac jit", (l, c) => `${c}-inpage-${l}.json`]]) {
  for (const c of ["marketmap-slider", "weather-city"]) {
    const a = R(pat(A, c)), b = R(pat(B, c));
    if (!a || !b) { console.log(`| ${tgt} ${c} | ${a ? "" : "missing"} | ${b ? "" : "missing"} | |`); continue; }
    const ja = a.win.settleMs, jb = b.win.settleMs;
    const pa = a.gaps?.p95, pb = b.gaps?.p95;
    console.log(`| ${tgt} ${c} JS settle | ${ja.toFixed(0)} ms (${a.win.settleN}) | ${jb.toFixed(0)} ms (${b.win.settleN}) | ${pct(ja, jb)} |`);
    if (pa != null) console.log(`| ${tgt} ${c} frame p95 | ${pa.toFixed(1)} ms | ${pb.toFixed(1)} ms | ${pct(pa, pb)} |`);
  }
}
