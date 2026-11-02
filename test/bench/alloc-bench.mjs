// alloc-bench — the allocation-heavy paths, timed, for a before/after comparison
// of the runtime's memory allocator (docs/system-design/memory.md).
//
//   node test/bench/alloc-bench.mjs [--runs 5] [--kernel wasm|js|both] [--browser | --browser-only] [--roots A=dir,B=dir,…] [--case text] [--json out.json]
//
// Each case runs in a fresh process (a warm kernel or a grown table must not
// carry from one case to the next), --runs times; the table reports the median
// and the fastest per case, in milliseconds per unit of work, beside what each
// kernel table's high-water mark gained after warm-up (growth there is a leak,
// growth in time is a regression). Headless: no renderer, so what is timed is the
// runtime's own work — building, binding, settling, tearing down. Not a test:
// nothing here passes or fails.
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name, d) => { const i = process.argv.indexOf("--" + name); return i < 0 ? d : process.argv[i + 1]; };
const RUNS = Number(arg("runs", 5));
const KERNELS = arg("kernel", "both") === "both" ? ["wasm", "js"] : [arg("kernel")];

const rows = (n, cell) => `App [ width = 400, height = 1200, seq: number = 0,
  model: Dataset [ contents = { ({ rows: Array.from({ length: ${n} }, (_, i) => ({ k: "row " + i, v: app.seq * 7 + i })) }) } ],
  list: View [ width = 400, datapath = { app.model.value }, layout: SimpleLayout [ axis = y ],
    Row [ datapath = :rows[] ] ] ]
class Row extends View [ height = 20, width = 100%,
  Text [ text = { "" + :k } ],
  Text [ x = 120, text = { "" + :v } ],
  View [ x = 240, height = 4, y = 8, width = { ${cell} }, fill = steelblue ],
  View [ x = 360, width = 12, height = 12, cornerRadius = 6, fill = { :v % 2 == 0 ? 0xff6347 : 0x008080 } ] ]`;
const LONG = Array.from({ length: 40 }, (_, i) => `:v * ${i + 2}`).join(" + ");

// name → { src | app, unit, warm, n, step (as source text, run in the child) }
const CASES = {
  "rows rebuilt (50 rows)":        { src: rows(50, ":v % 100"), unit: "rebuild", warm: 20, n: 400, step: "app.seq++" },
  "rows rebuilt, long expression": { src: rows(50, LONG + " % 100"), unit: "rebuild", warm: 20, n: 200, step: "app.seq++" },
  "rows built and discarded (500)": { src: rows(500, ":v % 100"), unit: "program", warm: 3, n: 20, rebuild: true },
  "calendar: navigate":            { app: "calendar", unit: "step", warm: 30, n: 300,
                                     step: "{ const d = new Date(2026, 0, 1 + (i * 7) % 700); app.navKey = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() }" },
};

const CHILD = `
const [ROOT, spec] = [process.argv[1], JSON.parse(process.argv[2])];
const { readFileSync } = await import("node:fs");
const { compile } = await import(ROOT + "/compiler/dist/compile-node.js");
const { settleHeadless } = await import(ROOT + "/compiler/dist/headless.js");
const R = await import(ROOT + "/runtime/dist/reactive.js");
await R.kernelReady();
console.error = () => {}; console.warn = () => {};
const file = spec.app ? ROOT + "/apps/" + spec.app + "/" + spec.app + ".declare" : null;
const src = file ? readFileSync(file, "utf8") : spec.src;
const r = await compile(src, file ? { originDir: ROOT + "/apps/" + spec.app, mainId: file } : {});
if (r.errors?.length) throw new Error(r.errors[0].message);
const use = () => { const k = R.kernel(); const c = k.codeUse(); return [k.cells(), k.rules(), c.code, c.consts]; };
const step = new Function("app", "i", spec.step ?? "");
let app = null, t = 0;
if (spec.rebuild) {
  for (let i = 0; i < spec.warm; i++) { app = settleHeadless(r.program, { deps: r.deps }); R.settle(); app.discard(); R.settle(); }
  const a = use(); const t0 = performance.now();
  for (let i = 0; i < spec.n; i++) { app = settleHeadless(r.program, { deps: r.deps }); R.settle(); app.discard(); R.settle(); }
  t = performance.now() - t0; const b = use();
  console.log(JSON.stringify({ ms: t / spec.n, grew: b.map((v, j) => v - a[j]) }));
} else {
  app = settleHeadless(r.program, { deps: r.deps });
  for (let i = 0; i < spec.warm; i++) { step(app, i); R.settle(); }
  const a = use(); const t0 = performance.now();
  for (let i = spec.warm; i < spec.warm + spec.n; i++) { step(app, i); R.settle(); }
  t = performance.now() - t0; const b = use();
  console.log(JSON.stringify({ ms: t / spec.n, grew: b.map((v, j) => v - a[j]) }));
}
process.exit(0);   // a program's clock or a source's timer would keep the process alive
`;

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// BACK TO BACK (--roots A=dir,B=dir,…): every version runs a case, one after
// another, before the next run of that case — the order rotated each round so
// none always goes first — and each version is compared with the first by the
// ratio within each round. The machine's load moves on the scale of minutes;
// a round of one case takes seconds, so each ratio is taken under one load.
const ROOTS = arg("roots", null);
if (ROOTS !== null) {
  const roots = ROOTS.split(",").map((kv) => { const [name, dir] = kv.split("="); return { name, dir: path.resolve(dir) }; });
  const runChild = (dir, kernel, spec) => {
    const env = { ...process.env, ...(kernel === "js" ? { DECLARE_KERNEL: "js" } : {}) };
    const line = execFileSync(process.execPath, ["--input-type=module", "-e", CHILD, dir, JSON.stringify(spec)],
      { env, encoding: "utf8", maxBuffer: 64 << 20 }).trim().split("\n").pop();
    return JSON.parse(line).ms;
  };
  const report = [];
  const only = arg("case", null);
  for (const kernel of process.argv.includes("--browser-only") ? [] : KERNELS) for (const [name, spec] of Object.entries(CASES).filter(([n]) => only === null || n.includes(only))) {
    const ms = Object.fromEntries(roots.map((r) => [r.name, []]));
    for (let run = 0; run < RUNS; run++) {
      const order = roots.map((_, i) => roots[(i + run) % roots.length]);
      for (const r of order) ms[r.name].push(runChild(r.dir, kernel, spec));
    }
    const ref = roots[0].name;
    const cols = roots.map((r) => {
      const ratios = ms[r.name].map((v, i) => v / ms[ref][i]);
      return { name: r.name, median: median(ms[r.name]), ratio: median(ratios), faster: ratios.filter((x) => x < 1).length };
    });
    report.push({ kernel, case: name, unit: spec.unit, cols, ms });
    console.log(`${kernel.padEnd(4)} ${name.padEnd(32)} ` + cols.map((c) => `${c.name} ${c.median.toFixed(3)}` + (c.name === ref ? "" : ` (×${c.ratio.toFixed(3)}, faster ${c.faster}/${RUNS})`)).join("  "));
  }
  // the browser half, back to back: each app's scenario under every version in turn
  if (process.argv.includes("--browser") || process.argv.includes("--browser-only")) {
    const profileOnce = (dir, a, script) => {
      const file = path.join(tmpdir(), `alloc-bench-${process.pid}.json`), fd = openSync(file, "w");
      execFileSync(process.execPath, [path.join(dir, "tools/profile.mjs"), `apps/${a}/${a}.declare`, "--native",
        "--scenario", `apps/${a}/tests/${script}.mjs`, "--json"], { cwd: dir, stdio: ["ignore", fd, "ignore"] });
      closeSync(fd);
      return JSON.parse(readFileSync(file, "utf8")).ms;
    };
    const onlyApp = arg("case", null);
    for (const [a, script] of [["desktop", "assert"], ["todo", "assert"], ["docs", "assert"], ["calendar", "states"], ["tracker", "states"]].filter(([a]) => onlyApp === null || a.includes(onlyApp))) {
      const ms = Object.fromEntries(roots.map((r) => [r.name, []]));
      for (let run = 0; run < RUNS; run++) {
        const order = roots.map((_, i) => roots[(i + run) % roots.length]);
        for (const r of order) ms[r.name].push(profileOnce(r.dir, a, script));
      }
      const ref = roots[0].name;
      const cols = roots.map((r) => { const ratios = ms[r.name].map((v, i) => v / ms[ref][i]); return { name: r.name, median: median(ms[r.name]), ratio: median(ratios), faster: ratios.filter((x) => x < 1).length }; });
      report.push({ kernel: "browser", case: `${a}: ${script} scenario`, unit: "scenario", cols, ms });
      console.log(`chrome ${(a + ": " + script).padEnd(30)} ` + cols.map((c) => `${c.name} ${c.median.toFixed(1)}` + (c.name === ref ? "" : ` (×${c.ratio.toFixed(3)}, faster ${c.faster}/${RUNS})`)).join("  "));
    }
  }
  const json = arg("json", null);
  if (json) writeFileSync(json, JSON.stringify({ at: new Date().toISOString(), runs: RUNS, roots, report }, null, 2));
  process.exit(0);
}
const out = { at: new Date().toISOString(), runs: RUNS, results: [] };
for (const kernel of process.argv.includes("--browser-only") ? [] : KERNELS) {
  for (const [name, spec] of Object.entries(CASES)) {
    const ms = [], grew = [];
    for (let run = 0; run < RUNS; run++) {
      const env = { ...process.env, ...(kernel === "js" ? { DECLARE_KERNEL: "js" } : {}) };
      const line = execFileSync(process.execPath, ["--input-type=module", "-e", CHILD, ROOT, JSON.stringify(spec)],
        { env, encoding: "utf8", maxBuffer: 64 << 20 }).trim().split("\n").pop();
      const r = JSON.parse(line); ms.push(r.ms); grew.push(r.grew);
    }
    const row = { kernel, case: name, unit: spec.unit, medianMs: median(ms), minMs: Math.min(...ms), ms, grew: grew[grew.length - 1] };
    out.results.push(row);
    console.log(`${kernel.padEnd(4)} ${name.padEnd(32)} ${row.medianMs.toFixed(3).padStart(9)} ms/${spec.unit} (min ${row.minMs.toFixed(3)})  grew cells/rules/code/consts ${row.grew.join("/")}`);
  }
}
// THE BROWSER HALF (--browser): each corpus app's own scenario, profiled as
// shipped (declare-profile --native), --runs times: the time its turns took and
// what building views cost, by the profiler's own account. Real Chrome, the real
// DOM backend, real input.
if (process.argv.includes("--browser") || process.argv.includes("--browser-only")) {
  const SCENARIOS = [["desktop", "assert"], ["todo", "assert"], ["docs", "assert"], ["calendar", "states"], ["tracker", "states"]];
  for (const [a, script] of SCENARIOS) {
    const turns = [], build = [];
    for (let run = 0; run < RUNS; run++) {
      // to a file, not a pipe: the profiler exits as it finishes writing, and a
      // pipe keeps only what the reader had drained (a large report was cut at 64 KB)
      const file = path.join(tmpdir(), `alloc-bench-${process.pid}.json`), fd = openSync(file, "w");
      execFileSync(process.execPath, [path.join(ROOT, "tools/profile.mjs"), `apps/${a}/${a}.declare`, "--native",
        "--scenario", `apps/${a}/tests/${script}.mjs`, "--json"], { cwd: ROOT, stdio: ["ignore", fd, "ignore"] });
      closeSync(fd);
      const d = JSON.parse(readFileSync(file, "utf8"));
      turns.push(d.ms); build.push(d.buildCost.reduce((t, c) => t + c.ms, 0));
    }
    const row = { kernel: "browser", case: `${a}: ${script} scenario`, unit: "scenario", medianMs: median(turns), minMs: Math.min(...turns), ms: turns, buildMedianMs: median(build) };
    out.results.push(row);
    console.log(`chrome ${row.case.padEnd(32)} ${row.medianMs.toFixed(1).padStart(9)} ms in turns (min ${row.minMs.toFixed(1)}), building views ${row.buildMedianMs.toFixed(1)} ms`);
  }
}
const json = arg("json", null);
if (json) writeFileSync(json, JSON.stringify(out, null, 2));
