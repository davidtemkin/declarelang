// benchtable — the before/after matrix log, as one table.
//
//   node tools/benchtable.mjs <matrix.log>
//
// rasterbench prints one row per run; matrix.sh labels each run and groups
// them by engine. This folds that log into a table — engine × label →
// p50 / p95 cadence, plus paint and GPU ms where a trace ran, plus the memo's
// state — so the matrix reads as a matrix. Read down a column, never across:
// the engines do not share a present mechanism or a refresh cap, and 8 ms on
// a 120 Hz display is the same frame budget as 17 on a 60 Hz one.
import { readFileSync } from "node:fs";

const log = readFileSync(process.argv[2], "utf8").split("\n");
let engine = "", label = "";
const rows = [];
for (const line of log) {
  let m;
  if ((m = /^════════ (.+?) ════════/.exec(line))) { engine = m[1]; continue; }
  if ((m = /^── (.+)$/.exec(line))) { label = m[1]; continue; }
  if ((m = /^\s+(?:scroll|motion|resize) \S+\s+1\s+([\d.]+)\s+([\d.]+)\s+([\d.—]+)\s+([\d.—]+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\w+)/.exec(line))) {
    rows.push({ engine, label, flush: m[1], p50: m[3], p95: m[4], mb: m[6], ink: m[9], drive: m[10], paint: "", gpu: "", memo: "" });
    continue;
  }
  if ((m = /↳ trace: paint (\d+)ms · gpu (\d+)ms/.exec(line)) && rows.length) { rows[rows.length - 1].paint = m[1]; rows[rows.length - 1].gpu = m[2]; continue; }
  if ((m = /↳ memo: (\d+) entries · ([\d.]+) MB/.exec(line)) && rows.length) { rows[rows.length - 1].memo = `${m[1]}/${m[2]}MB`; continue; }
  if ((m = /^\s+mac · (\S+) · \d+ steps · step: (.+)$/.exec(line))) { label = `mac · ${m[1]} · ${m[2].slice(0, 28)}`; engine = "mac"; continue; }
  if ((m = /^\s+motion gap ms\s+p50 ([\d.]+)\s+p95 ([\d.]+)\s+max ([\d.]+)/.exec(line))) { rows.push({ engine: "mac", label, p50: m[1], p95: m[2], max: m[3], paint: "", gpu: "", memo: "", flush: "", mb: "", ink: "", drive: "" }); continue; }
  if ((m = /^\s+(syn|desk)\s+(\w+): .*differing ([\d.]+)% · structural ([\d.]+)% · meanΔ ([\d.]+)/.exec(line))) { rows.push({ engine: "deviation", label: `${m[1]} ${m[2]}: memo on vs off`, p50: "", p95: "", diff: `${m[3]}% / ${m[4]}% / Δ${m[5]}`, paint: "", gpu: "", memo: "", flush: "", mb: "", ink: "", drive: "" }); continue; }
}
const pad = (s, n) => String(s ?? "").padEnd(n);
let cur = "";
for (const r of rows) {
  if (r.engine !== cur) { cur = r.engine; console.log(`\n${cur}`); console.log("  " + pad("run", 36) + pad("p50", 7) + pad("p95", 7) + pad("paint", 7) + pad("gpu", 7) + pad("memo", 12) + "note"); }
  const note = r.diff ?? (r.max ? `max ${r.max}` : (r.drive === "INERT" ? "(drive check n/a)" : ""));
  console.log("  " + pad(r.label, 36) + pad(r.p50, 7) + pad(r.p95, 7) + pad(r.paint, 7) + pad(r.gpu, 7) + pad(r.memo, 12) + note);
}
console.log(`\n${rows.length} rows. chrome/firefox at 120 Hz (8.3 ms budget); safari/ios at 60 Hz (16.7 ms).`);
