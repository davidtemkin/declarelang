// matrix — before/after across targets. Runs every (target × tree × case)
// through the rigs (web.mjs, run.mjs, ios.mjs) with the in-page driver, or
// folds the results they wrote into one table.
//
//   node mac-host/profile/matrix.mjs run --targets chrome,mac,ios --trees main,opt [--cases weather:resize,…]
//   node mac-host/profile/matrix.mjs report
//
// "main" = /Users/temkin/Code/Declare's runtime (the baseline), "opt" = this
// tree's. On the Mac both runtimes are baked into THIS tree's host app (same
// Swift, different JS), with and without the JIT entitlement.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TREE = path.resolve(HERE, "../..");
const MAIN = "/Users/temkin/Code/Declare";
const argv = process.argv.slice(2);
const mode = argv[0] ?? "report";
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const CASES = flag("cases", "weather:resize,weather:city,desktop:seed,desktop:minimize,tracker:filter,calendar:mode").split(",").map((c) => { const [app, stim] = c.split(":"); return { app, stim }; });
const TARGETS = flag("targets", "chrome,mac,ios").split(",");
const TREES = flag("trees", "main,opt").split(",");
const DEVICE_FOR = (_app) => "iPad Pro 13-inch (M4)";   // every case on the iPad (DT, 2026-09-17: the iPad on screen)
const sh = (cmd, args, opts = {}) => { try { return execFileSync(cmd, args, { cwd: TREE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }); } catch (e) { return (e.stdout ?? "") + "\nFAILED: " + (e.stderr ?? "").slice(-400); } };
const rootArgs = (tree) => (tree === "main" ? ["--root", MAIN] : []);

if (mode === "run") {
  const RES = path.join(HERE, "results");
  const readJSON = (f) => { try { return JSON.parse(readFileSync(path.join(RES, f), "utf8")); } catch { return null; } };
  const drop = (f) => { try { unlinkSync(path.join(RES, f)); } catch { /* none */ } };
  // one machine-readable line per finished main/opt pair: the chat table reads these
  const pick = (r) => {
    if (!r) return null;
    const w = r.win ?? {}; const g = r.gaps ?? {}; const dr = r.drag ?? r.driven?.drag ?? null;
    // the host's commit-gap stats describe the REAL-WINDOW resize row only (no page frame clock
    // runs there); every in-page row reads the page's own requestAnimationFrame gaps
    const m = r.gaps ? null : /MOTION gap ms p50=([\d.]+) p95=([\d.]+) max=([\d.]+)\s+over=(\d+)\s+\(n=(\d+)\)/.exec(r.stats ?? "");
    return { js: w.settleMs, n: w.settleN, p95: m ? +m[2] : g.p95, over: m ? +m[4] : g.over33, frames: m ? +m[5] : g.n, p50: m ? +m[1] : g.p50, drag: dr };
  };
  const row = (target, name, fMain, fOpt, note = "") => {
    const a = pick(readJSON(fMain)), b = pick(readJSON(fOpt));
    if (!a || !b) { console.log(`ROW|${target}|${name}|MISSING|${a ? "" : "main"}${b ? "" : " opt"}`); return; }
    const f = (x) => (x == null ? "" : (+x).toFixed(1));
    const dg = (d) => (d ? `${d.steps}steps/${(d.dragMs / 1000).toFixed(1)}s lag${d.meanLagDays.toFixed(1)}d` : "");
    console.log(`ROW|${target}|${name}|${f(a.js)}|${f(b.js)}|${a.n}|${b.n}|${f(a.p50)}|${f(b.p50)}|${f(a.p95)}|${f(b.p95)}|${a.over ?? ""}|${b.over ?? ""}|${b.frames ?? ""}|${note}${a.drag ? ` main:${dg(a.drag)} opt:${dg(b.drag)}` : ""}`);
  };
  const web = (target, render, flags) => {
    for (const c of CASES) {
      for (const tree of TREES) {
        const f = `web-${c.app}-${c.stim}-inpage-${render}-${tree}.json`; drop(f);
        const out = sh(process.execPath, ["mac-host/profile/web.mjs", `apps/${c.app}/${c.app}.declare`, "--stim", c.stim, "--render", render, "--inpage", ...flags, "--label", tree, ...rootArgs(tree)]);
        console.log(out.split("\n").filter((l) => /^window:|FAILED|error/.test(l)).map((l) => `${target} ${tree} ${c.app}:${c.stim}  ${l}`).join("\n"));
      }
      row(target, `${c.app}:${c.stim}`, `web-${c.app}-${c.stim}-inpage-${render}-main.json`, `web-${c.app}-${c.stim}-inpage-${render}-opt.json`);
    }
  };
  for (const target of TARGETS) {
    if (target === "chrome") web("chrome", "dom", ["--headful"]);
    if (target === "chrome-canvas") web("chrome-canvas", "canvas", ["--headful"]);
    for (const [tgt, render] of [["safari", "dom"], ["safari-canvas", "canvas"]]) {
      if (target !== tgt) continue;
      // desktop Safari on this Mac: each run opens its own front window and closes it
      for (const c of CASES) {
        for (const tree of TREES) {
          drop(`safari-${c.app}-${c.stim}-inpage-${render}-${tree}.json`);
          const out = sh(process.execPath, ["mac-host/profile/safari.mjs", `apps/${c.app}/${c.app}.declare`, "--stim", c.stim, "--render", render, "--label", tree, ...rootArgs(tree)], { timeout: 300000 });
          console.log(out.split("\n").filter((l) => /^window:|FAILED|failed/.test(l)).map((l) => `${tgt} ${tree} ${c.app}:${c.stim}  ${l}`).join("\n"));
        }
        row(tgt, `${c.app}:${c.stim}`, `safari-${c.app}-${c.stim}-inpage-${render}-main.json`, `safari-${c.app}-${c.stim}-inpage-${render}-opt.json`);
      }
    }
    if (target === "mac") {
      for (const jit of ["jit", "nojit"]) for (const tree of TREES) {
        const bundle = `mac-host/bundles/declare-mac${tree === "main" ? ".declare" : ""}.profile.js`;
        console.log(sh("bash", ["mac-host/bundle.sh", "--runtime", bundle, ...(jit === "nojit" ? ["--nojit"] : [])]).split("\n").filter((l) => /toolchain|FAILED/.test(l)).join("\n"));
        for (const c of CASES) {
          drop(`${c.app}-${c.stim}-inpage-${tree}-${jit}.json`);
          const out = sh(process.execPath, ["mac-host/profile/run.mjs", `apps/${c.app}/${c.app}.declare`, "--stim", c.stim, "--inpage", "--label", `${tree}-${jit}`]);
          console.log(out.split("\n").filter((l) => /^window:|^frames:|FAILED|drive failed/.test(l)).map((l) => `mac-${jit} ${tree} ${c.app}:${c.stim}  ${l}`).join("\n"));
          if (tree === "opt") row(`mac-${jit}`, `${c.app}:${c.stim}`, `${c.app}-${c.stim}-inpage-main-${jit}.json`, `${c.app}-${c.stim}-inpage-opt-${jit}.json`);
        }
        // MAC ONLY: the real window resize (the host's liveresize — AppKit, the
        // layer tree, the frost applier), which the in-page resize leaves out
        if (CASES.some((c) => c.app === "weather" && c.stim === "resize")) {
          drop(`weather-resize-${tree}-${jit}.json`);
          const out = sh(process.execPath, ["mac-host/profile/run.mjs", "apps/weather/weather.declare", "--stim", "resize", "--label", `${tree}-${jit}`]);
          console.log(out.split("\n").filter((l) => /^window:|MOTION gap|FAILED/.test(l)).map((l) => `mac-${jit} ${tree} weather:resize-window  ${l}`).join("\n"));
          if (tree === "opt") row(`mac-${jit}`, "weather:resize-window", `weather-resize-main-${jit}.json`, `weather-resize-opt-${jit}.json`, "host frames; budget 8.3 ms");
        }
      }
    }
    if (target === "ios") {
      for (const c of CASES) {
        for (const tree of TREES) {
          drop(`ios-${c.app}-${c.stim}-inpage-dom-${tree}.json`);
          const out = sh(process.execPath, ["mac-host/profile/ios.mjs", `apps/${c.app}/${c.app}.declare`, "--stim", c.stim, "--render", "dom", "--device", DEVICE_FOR(c.app), "--label", tree, ...rootArgs(tree)], { timeout: 300000 });
          console.log(out.split("\n").filter((l) => /^window:|FAILED|failed/.test(l)).map((l) => `ios ${tree} ${c.app}:${c.stim}  ${l}`).join("\n"));
        }
        row("ios", `${c.app}:${c.stim}`, `ios-${c.app}-${c.stim}-inpage-dom-main.json`, `ios-${c.app}-${c.stim}-inpage-dom-opt.json`);
      }
    }
  }
}

// ── the table ───────────────────────────────────────────────────────────────
const R = path.join(HERE, "results");
const load = (f) => { try { return JSON.parse(readFileSync(path.join(R, f), "utf8")); } catch { return null; } };
const cell = (r) => {
  if (!r) return { js: null, p95: null, over33: null, n: null };
  const win = r.win ?? r; const gaps = r.gaps ?? r.driven?.gaps;
  return { js: win?.settleMs ?? null, p95: gaps?.p95 ?? null, over33: gaps?.over33 ?? null, n: gaps?.n ?? null, max: gaps?.max ?? null };
};
const rows = [];
// the Mac-only real-window resize row (host stats carry its frame gaps)
for (const [target, jit] of [["mac JIT", "jit"], ["mac interp", "nojit"]]) {
  const get = (t) => { const r = load(`weather-resize-${t}-${jit}.json`); if (!r) return { js: null, p95: null, over33: null, n: null }; const m = /MOTION gap ms p50=([\d.]+) p95=([\d.]+) max=([\d.]+)\s+over=(\d+)\s+\(n=(\d+)\)/.exec(r.stats ?? ""); return { js: r.win?.settleMs ?? null, p95: m ? +m[2] : null, over33: m ? +m[4] : null, n: m ? +m[5] : null, overLabel: "over budget" }; };
  rows.push({ case: "weather:resize-window †", target, a: get("main"), b: get("opt") });
}
for (const c of CASES) {
  for (const [target, file] of [
    ["chrome", (t) => `web-${c.app}-${c.stim}-inpage-dom-${t}.json`],
    ["chrome canvas", (t) => `web-${c.app}-${c.stim}-inpage-canvas-${t}.json`],
    ["mac JIT", (t) => `${c.app}-${c.stim}-inpage-${t}-jit.json`],
    ["mac interp", (t) => `${c.app}-${c.stim}-inpage-${t}-nojit.json`],
    ["safari", (t) => `safari-${c.app}-${c.stim}-inpage-dom-${t}.json`],
    ["iOS sim", (t) => `ios-${c.app}-${c.stim}-inpage-dom-${t}.json`],
  ]) {
    const a = cell(load(file("main"))), b = cell(load(file("opt")));
    rows.push({ case: `${c.app}:${c.stim}`, target, a, b });
  }
}
const f = (x, d = 0) => (x === null || x === undefined ? "—" : x.toFixed(d));
const delta = (a, b) => (a === null || b === null || a === 0 ? "" : ` (${b < a ? "−" : "+"}${Math.abs(100 * (b - a) / a).toFixed(0)}%)`);
let md = "| case | target | JS settle ms, main → opt | rAF p95 ms, main → opt | frames > 33 ms, main → opt |\n|---|---|---|---|---|\n";
for (const r of rows) {
  if (r.a.js === null && r.b.js === null) continue;
  md += `| ${r.case} | ${r.target} | ${f(r.a.js)} → **${f(r.b.js)}**${delta(r.a.js, r.b.js)} | ${f(r.a.p95, 1)} → **${f(r.b.p95, 1)}** | ${f(r.a.over33)} → **${f(r.b.over33)}** of ${f(r.b.n)} |\n`;
}
md += "\n† the Mac host's own liveresize (AppKit → layer tree → frost applier), not the in-page stimulus: frames are the host's display-link gaps and the last column counts frames over the 8.3 ms (120 Hz) budget, not over 33 ms.\n";
console.log("\n" + md);
writeFileSync(path.join(HERE, "results", "MATRIX.md"), md);
