// parity-report.mjs — render benchmarks/parity-sweep/out/results.json into the ranked markdown
// report benchmarks/RESULTS-canvas-parity-sweep.md. Re-run after parity-sweep.mjs.
//
// Ranking is by substAE (blur σ=2 + fuzz-10% AE) = REAL area divergence, since raw AE is
// dominated by uniform text/gradient anti-aliasing noise that is inherent to own-pixels text
// rendering and is NOT a fixable "gap". Input-field apps (DOM-overlay divergence being fixed by
// another agent) and animated/never-settled apps (frames not phase-aligned → AE meaningless) are
// split into their own sections and NOT counted in the real-gap ranking.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const NEO = "/Users/temkin/Code/OpenLaszlo/openlaszlo-neo";
const OUT = path.join(NEO, "benchmarks/parity-sweep/out");
const SHOTS = path.join(OUT, "shots");
const SCREENSHOTS = path.join(NEO, "benchmarks/screenshots");
const REPORT = path.join(NEO, "benchmarks/RESULTS-canvas-parity-sweep.md");
const d = JSON.parse(fs.readFileSync(path.join(OUT, "results.json"), "utf8"));

const md5 = (f) => { try { return execFileSync("md5", ["-q", f]).toString().trim(); } catch { return "?"; } };

// Hand-authored notes (filled after visually inspecting the diff triptychs). Overrides heuristics.
const NOTES = JSON.parse(fs.readFileSync(path.join(OUT, "notes.json"), "utf8").toString() || "{}");

function heuristic(r) {
  if (r.input) return "input field (editable DOM overlay) — being fixed in parallel; not a canvas gap";
  if (!r.cvSettle || !r.dhSettle) return "animated (never settled) — frames not phase-aligned, AE not meaningful";
  if (r.subst === 0) return "pixel-clean (only sub-pixel text/gradient AA)";
  return "REVIEW";
}
const note = (r) => NOTES[r.rel] || heuristic(r);

const pct = (x) => (x * 100).toFixed(3) + "%";
const pct4 = (x) => (x * 100).toFixed(4) + "%";

const all = d.rows.slice();
const input = all.filter((r) => r.input).sort((a, b) => b.subst - a.subst);
const animated = all.filter((r) => !r.input && (!r.cvSettle || !r.dhSettle)).sort((a, b) => b.subst - a.subst);
const stable = all.filter((r) => !r.input && r.cvSettle && r.dhSettle);
const clean = stable.filter((r) => r.subst === 0).sort((a, b) => a.raw - b.raw);
const diverge = stable.filter((r) => r.subst > 0).sort((a, b) => b.subst - a.subst);

function tableRow(r) {
  return `| ${r.rel} | ${r.group} | ${r.W}×${r.H} | ${r.raw.toLocaleString()} | ${pct(r.rawPct)} | ${r.subst.toLocaleString()} | ${pct4(r.substPct)} | ${note(r)} |`;
}
const TH = "| app | group | size | raw AE | raw AE% | **subst AE** | subst AE% | what diverges |\n|---|---|---|--:|--:|--:|--:|---|";

let m = "";
m += `# Canvas kernel vs DHTML kernel — visual (pixel) parity sweep @dpr=2\n\n`;
m += `**Question.** Where does the Declare **own-pixels canvas** kernel diverge visually from the stock **DHTML** kernel, across a large app set? Both kernels run the **same compiled \`.lzx.js\`** — only the LFC differs (canvas = \`LFCcanvas.js\`, dhtml = \`lfc.js\`) — so each app is compiled **once** and rendered under **both**. This data gates promoting the canvas kernel into the 5.0 distro.\n\n`;
m += `- **Apps swept:** ${all.length} measured · ${d.failed.length} compile/capture-failed · ${d.backendSkipped.length} backend-skipped.\n`;
m += `- **dpr = 2 (Retina) only.** Captures settle to two byte-identical frames (\`capture.mjs\`).\n`;
m += `- **Frozen artifacts** (immune to concurrent kernel/compiler work): canvas \`LFCcanvas.js\` md5 \`${md5(path.join(NEO, "benchmarks/parity-sweep/snapshot/LFCcanvas.js"))}\`, dhtml \`lfc.js\` md5 \`${md5(path.join(NEO, "benchmarks/parity-sweep/snapshot/lfc.js"))}\`, dhtml-debug \`lfc-debug.js\` md5 \`${md5(path.join(NEO, "benchmarks/parity-sweep/snapshot/lfc-debug.js"))}\`, canvas-debug \`LFCcanvas-debug.js\` md5 \`${md5(path.join(NEO, "benchmarks/parity-sweep/snapshot/LFCcanvas-debug.js"))}\` (the debug pair is used instead of \`lfc.js\`/\`LFCcanvas.js\` for debug-compiled apps — those referencing \`LzDebugWindow\` in their compiled output, e.g. \`<canvas debug=\"true\">\` + \`<debug .../>\` apps — since the production LFCs have no debugger and would blank-crash on either side), compiler \`snapshot/compiler-dist/cli.js\`.\n`;
m += `- Generated: ${d.when}\n\n`;

m += `## Metric — why rank by "subst AE", not raw AE\n\n`;
m += `The canvas kernel **draws text and gradients itself** (own pixels); the DHTML kernel uses DOM text + CSS. Glyph/gradient rasterization differs by a **sub-pixel**, so at every text edge and gradient band the two renders disagree by ±1 px. That noise **scales with the amount of text** and survives any fuzz (a black-on-gray edge that shifts 1px is a 100%-delta pixel). So **raw AE (\`compare -metric AE\` fuzz 0) is dominated by uniform AA noise** and does NOT indicate a real gap.\n\n`;
m += `To isolate **real** divergence (missing/broken component, wrong-color region, layout shift, image gap), the ranking metric is **subst AE = blur σ=2 then \`compare -metric AE -fuzz 10%\`**. The σ=2 blur (≈1 CSS px at dpr2) collapses 1-px edge misalignment to zero — a **visually identical** app scores **subst AE = 0** — while any area-sized divergence survives. Both numbers are reported; **rank is by subst AE**.\n\n`;
m += `Two categories are split out and **not counted as canvas gaps**:\n`;
m += `- **Input fields** (editable text) render as **DOM overlays** today — a known divergence being fixed by another agent. Flagged, not ranked.\n`;
m += `- **Animated** apps never settle to a stable frame; the two kernels' animations are not phase-aligned, so their AE is not a parity signal. Flagged, not ranked.\n\n`;

m += `## Real divergences — ranked worst-first (stable, non-input apps)\n\n`;
if (diverge.length) { m += TH + "\n"; for (const r of diverge) m += tableRow(r) + "\n"; }
else m += "_None — every stable non-input app is pixel-clean._\n";
m += "\n";

m += `## Pixel-clean apps (subst AE = 0 — only sub-pixel text/gradient AA)\n\n`;
m += `${clean.length} apps render **visually identical** under both kernels. Their raw AE is pure own-pixels text/gradient AA noise.\n\n`;
m += "| app | group | size | raw AE | raw AE% |\n|---|---|---|--:|--:|\n";
for (const r of clean) m += `| ${r.rel} | ${r.group} | ${r.W}×${r.H} | ${r.raw.toLocaleString()} | ${pct(r.rawPct)} |\n`;
m += "\n";

m += `## Input-field apps — DOM-overlay divergence (being fixed in parallel; NOT a canvas gap)\n\n`;
if (input.length) { m += TH + "\n"; for (const r of input) m += tableRow(r) + "\n"; }
else m += "_none_\n";
m += "\n";

m += `## Animated apps — AE not phase-aligned (flagged, not ranked)\n\n`;
if (animated.length) {
  m += "| app | group | size | raw AE | subst AE | note |\n|---|---|---|--:|--:|---|\n";
  for (const r of animated) m += `| ${r.rel} | ${r.group} | ${r.W}×${r.H} | ${r.raw.toLocaleString()} | ${r.subst.toLocaleString()} | ${note(r)} |\n`;
} else m += "_none_\n";
m += "\n";

m += `## Compile / capture failures\n\n`;
if (d.failed.length) { m += "| app | group | reason |\n|---|---|---|\n"; for (const f of d.failed) m += `| ${f.rel} | ${f.group} | ${f.reason} |\n`; }
else m += "_none_\n";
m += "\n";

m += `## Backend-skipped (need a live backend that no longer exists)\n\n`;
m += "| app | why |\n|---|---|\n";
for (const s of d.backendSkipped) m += `| ${s.rel} | ${s.reason} |\n`;
m += "\n";

m += `## Reproduce\n\n`;
m += "```\n";
m += "cd benchmarks/tools\n";
m += "node parity-sweep.mjs          # compile-once, render both kernels @dpr2, diff → out/results.json\n";
m += "node parity-report.mjs         # regenerate this report + copy worst diffs to screenshots/\n";
m += "node parity-sweep.mjs clean    # remove generated .lzx.js + __cv/__dh wrappers next to sources\n";
m += "```\n";
m += `Per-app screenshots (\`<key>.cv.png\` / \`.dh.png\` / \`.diff.png\`) are under \`benchmarks/parity-sweep/out/shots/\`; the worst offenders are copied to \`benchmarks/screenshots/parity-*\`.\n`;

fs.writeFileSync(REPORT, m);

// Copy the worst ~10 real-divergence triptychs into benchmarks/screenshots/
fs.mkdirSync(SCREENSHOTS, { recursive: true });
for (const r of diverge.slice(0, 10)) {
  for (const kind of ["cv", "dh", "diff"]) {
    const src = path.join(SHOTS, r.key + "." + kind + ".png");
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(SCREENSHOTS, "parity-" + r.key + "." + kind + ".png"));
  }
}
console.log(`wrote ${REPORT}`);
console.log(`diverge=${diverge.length} clean=${clean.length} input=${input.length} animated=${animated.length} failed=${d.failed.length}`);
console.log(`REVIEW-needed (no hand note yet): ` + diverge.filter((r) => !NOTES[r.rel]).map((r) => r.rel).join(", "));
