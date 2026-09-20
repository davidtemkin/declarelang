// round4 — the full before/after: INTERACTIVE metrics and STARTUP, main vs
// this tree, across Chrome DOM, Chrome canvas, Mac JIT, Mac interpreter and
// iOS Safari (iPad). Rows stream to stdout AND to a report on the Desktop as
// each lands.
//
//   node mac-host/profile/round4.mjs [--targets chrome,chrome-canvas,mac,ios,device] [--cases …] [--real "<device>"]
//
// STARTUP, defined (DT, 2026-09-17): from the start of program EXECUTION to
// first paint — compile and fetch excluded.
//   • browser: the runtime stamps boot stages (boot-uniform.js perfStage);
//     startup = first-frame.end − render.start, in ms. Both trees stamp the
//     same stages, so the number means one thing on both.
//   • Mac: the host's boot log; startup = FIRST COMMIT − the "compile …" line
//     (compile done → the first layer-tree commit on screen).
// Every in-page run boots the app fresh, so startup comes out of the same run
// that measures the interaction — no separate boot pass.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TREE = path.resolve(HERE, "../..");
const MAIN = "/Users/temkin/Code/Declare";
const RES = path.join(HERE, "results");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const CASES = flag("cases", "weather:resize,weather:city,desktop:seed,desktop:minimize,tracker:filter,calendar:mode,marketmap:slider").split(",").map((c) => { const [app, stim] = c.split(":"); return { app, stim }; });
const TARGETS = flag("targets", "chrome,chrome-canvas,mac,ios").split(",");
// --reverse: cases in reverse order, and within each case the optimized tree runs BEFORE main —
// the same round with the order flipped, to separate a real difference from drift over the run
// (a phone warming up, tabs accumulating)
const REVERSE = argv.includes("--reverse");
if (REVERSE) CASES.reverse();
const ORDER = REVERSE ? ["opt", "main"] : ["main", "opt"];
const REPORT = path.join(os.homedir(), "Desktop", "Declare-perf-before-after.md");
const DEVICE = "iPad Pro 13-inch (M4)";
const REAL = flag("real", "David’s M5 iPad Pro");   // the physical device for --targets device (devicectl name or UDID)

const sh = (cmd, args, opts = {}) => { try { return execFileSync(cmd, args, { cwd: TREE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600000, ...opts }); } catch (e) { return (e.stdout ?? "") + "\nFAILED: " + (e.stderr ?? "").slice(-400); } };
const rootArgs = (tree) => (tree === "main" ? ["--root", MAIN] : []);
const readJSON = (f) => { try { return JSON.parse(readFileSync(path.join(RES, f), "utf8")); } catch { return null; } };
const drop = (f) => { try { unlinkSync(path.join(RES, f)); } catch { /* none */ } };
const f1 = (x) => (x == null || Number.isNaN(x) ? "—" : (+x).toFixed(x >= 100 ? 0 : 1));
const pct = (a, b) => (a == null || b == null || a === 0 ? "" : `${b < a ? "−" : "+"}${Math.abs((b - a) / a * 100).toFixed(0)}%`);
const dir = (a, b, lowerIsBetter = true) => (a == null || b == null || a === b ? "same" : ((b < a) === lowerIsBetter ? "faster" : "slower"));

// ── the report ──────────────────────────────────────────────────────────────
let reportStarted = false;
function line(s) {
  process.stdout.write(s + "\n");
  if (!reportStarted) {
    reportStarted = true;
    // AN EXISTING REPORT IS APPENDED TO, under a dated heading — never overwritten
    // (2026-09-18: a rerun replaced a day's rounds and their notes with itself)
    if (existsSync(REPORT)) appendFileSync(REPORT, `\n\n# Round of ${new Date().toLocaleString()} · targets ${TARGETS.join(", ")}\n`);
    else writeFileSync(REPORT, `# Declare — before / after, all targets\n\n` +
      `Generated ${new Date().toLocaleString()} · main = ~/Code/Declare · optimized = ~/Code/Declare-Optimize\n\n` +
      `**JS settle** is the time in the reactive settle over the stimulus window (ms). **Frame p95** is the page's frame-gap 95th percentile (ms); the host frame clock is 120 Hz, so 8.3 ms is one frame. **Over 33 ms** counts frames longer than two 60 Hz frames. **Startup** is program execution → first paint, in ms: compile and fetch excluded.\n\n`);
  }
  appendFileSync(REPORT, s + "\n");
}
function section(title) { line(`\n## ${title}\n`); line(`| case | main | optimized | change | |\n|---|---|---|---|---|`); }

// ── readers ─────────────────────────────────────────────────────────────────
/** browser startup from the stamped stages: render.start → first-frame end */
function webStartup(r) {
  const st = r?.perf?.stages; if (!Array.isArray(st)) return null;
  const render = st.find((s) => s.stage === "render"), frame = st.find((s) => s.stage === "first-frame");
  if (!render || !frame) return null;
  return +(frame.start + frame.dur - render.start).toFixed(1);
}
/** mac startup from the boot log: compile done → FIRST COMMIT */
function macStartup(r) {
  const log = r?.bootlog ?? [];
  const ms = (l) => { const m = /\[boot\]\s+(\d+)ms/.exec(l); return m ? +m[1] : null; };
  const compiled = log.find((l) => /\[boot\].*compile /.test(l)), first = log.find((l) => /FIRST COMMIT/.test(l));
  if (!compiled || !first) return null;
  const a = ms(compiled), b = ms(first);
  return a == null || b == null ? null : b - a;
}
function pick(r, host) {
  if (!r) return null;
  const w = r.win ?? {}, g = r.gaps ?? {};
  const m = r.gaps ? null : /MOTION gap ms p50=([\d.]+) p95=([\d.]+) max=([\d.]+)\s+over=(\d+)\s+\(n=(\d+)\)/.exec(r.stats ?? "");
  return { js: w.settleMs, n: w.settleN, p95: m ? +m[2] : g.p95, over: m ? +m[4] : g.over33, startup: host === "mac" ? macStartup(r) : webStartup(r) };
}
const startupSeen = new Set();
function emit(target, name, fMain, fOpt, host) {
  const a = pick(readJSON(fMain), host), b = pick(readJSON(fOpt), host);
  if (!a || !b) { line(`| ${target} · ${name} | ${a ? "" : "missing"} | ${b ? "" : "missing"} | | |`); return; }
  line(`| ${target} · ${name} · JS settle | ${f1(a.js)} ms (${a.n}) | ${f1(b.js)} ms (${b.n}) | ${pct(a.js, b.js)} | ${dir(a.js, b.js)} |`);
  if (a.p95 != null) line(`| ${target} · ${name} · frame p95 | ${f1(a.p95)} ms | ${f1(b.p95)} ms | ${pct(a.p95, b.p95)} | ${dir(a.p95, b.p95)} |`);
  if (a.over != null) line(`| ${target} · ${name} · over 33 ms | ${a.over} | ${b.over} | | ${dir(a.over, b.over)} |`);
  const app = name.split(":")[0];
  const key = target + "/" + app;
  if (!startupSeen.has(key) && (a.startup != null || b.startup != null)) {
    startupSeen.add(key);
    line(`| ${target} · **${app} startup** (execution → first paint) | ${f1(a.startup)} ms | ${f1(b.startup)} ms | ${pct(a.startup, b.startup)} | ${dir(a.startup, b.startup)} |`);
  }
}

// ── the runs ────────────────────────────────────────────────────────────────
const web = (target, render, flags) => {
  section(target === "chrome" ? "Chrome · DOM renderer" : "Chrome · canvas renderer");
  for (const c of CASES) {
    for (const tree of ["main", "opt"]) {
      const f = `web-${c.app}-${c.stim}-inpage-${render}-r4-${tree}.json`; drop(f);
      const out = sh(process.execPath, ["mac-host/profile/web.mjs", `apps/${c.app}/${c.app}.declare`, "--stim", c.stim, "--render", render, "--inpage", ...flags, "--label", `r4-${tree}`, ...rootArgs(tree)]);
      if (/FAILED|drive failed/.test(out)) line(`> ${target} ${tree} ${c.app}:${c.stim} — ${out.split("\n").filter((l) => /FAILED|failed/.test(l)).join(" ").slice(0, 200)}`);
    }
    emit(target, `${c.app}:${c.stim}`, `web-${c.app}-${c.stim}-inpage-${render}-r4-main.json`, `web-${c.app}-${c.stim}-inpage-${render}-r4-opt.json`, "web");
  }
};
for (const target of TARGETS) {
  if (target === "chrome") web("chrome", "dom", ["--headful"]);
  if (target === "chrome-canvas") web("chrome-canvas", "canvas", ["--headful"]);
  if (target === "mac") {
    for (const jit of ["jit", "nojit"]) {
      section(jit === "jit" ? "Mac host · JavaScriptCore with JIT" : "Mac host · JavaScriptCore interpreter (no JIT — an in-process JSContext host, e.g. a native iOS app; not iOS Safari, which has a JIT)");
      for (const tree of ["main", "opt"]) {
        const bundle = `mac-host/bundles/declare-mac${tree === "main" ? ".declare" : ""}.profile.js`;
        const baked = sh("bash", ["mac-host/bundle.sh", "--runtime", bundle, ...(jit === "nojit" ? ["--nojit"] : [])]);
        if (/FAILED/.test(baked)) line(`> mac ${jit} ${tree}: bake failed`);
        for (const c of CASES) {
          drop(`${c.app}-${c.stim}-inpage-r4-${tree}-${jit}.json`);
          const out = sh(process.execPath, ["mac-host/profile/run.mjs", `apps/${c.app}/${c.app}.declare`, "--stim", c.stim, "--inpage", "--label", `r4-${tree}-${jit}`]);
          if (/FAILED|drive failed/.test(out)) line(`> mac ${jit} ${tree} ${c.app}:${c.stim} — ${out.split("\n").filter((l) => /FAILED|failed/.test(l)).join(" ").slice(0, 200)}`);
          if (tree === "opt") emit(`mac-${jit}`, `${c.app}:${c.stim}`, `${c.app}-${c.stim}-inpage-r4-main-${jit}.json`, `${c.app}-${c.stim}-inpage-r4-opt-${jit}.json`, "mac");
        }
        if (CASES.some((c) => c.app === "weather" && c.stim === "resize")) {
          drop(`weather-resize-r4-${tree}-${jit}.json`);
          sh(process.execPath, ["mac-host/profile/run.mjs", "apps/weather/weather.declare", "--stim", "resize", "--label", `r4-${tree}-${jit}`]);
          if (tree === "opt") emit(`mac-${jit}`, "weather:resize-window (real window; host frames, 60 Hz mouse)", `weather-resize-r4-main-${jit}.json`, `weather-resize-r4-opt-${jit}.json`, "mac");
        }
      }
    }
  }
  if (target === "ios") {
    section(`iOS Safari · ${DEVICE} simulator · DOM renderer`);
    for (const c of CASES) {
      for (const tree of ["main", "opt"]) {
        drop(`ios-${c.app}-${c.stim}-inpage-dom-r4-${tree}.json`);
        const out = sh(process.execPath, ["mac-host/profile/ios.mjs", `apps/${c.app}/${c.app}.declare`, "--stim", c.stim, "--render", "dom", "--device", DEVICE, "--label", `r4-${tree}`, ...rootArgs(tree)]);
        if (/FAILED|failed/.test(out)) line(`> ios ${tree} ${c.app}:${c.stim} — ${out.split("\n").filter((l) => /FAILED|failed/.test(l)).join(" ").slice(0, 200)}`);
      }
      emit("ios", `${c.app}:${c.stim}`, `ios-${c.app}-${c.stim}-inpage-dom-r4-main.json`, `ios-${c.app}-${c.stim}-inpage-dom-r4-opt.json`, "web");
    }
  }
}
for (const target of TARGETS) {
  if (target === "device") {
    section(`iOS Safari · ${REAL} (physical device, wired) · DOM renderer`);
    for (const c of CASES) {
      for (const tree of ORDER) {
        drop(`device-${c.app}-${c.stim}-inpage-dom-r4-${tree}.json`);
        const out = sh(process.execPath, ["mac-host/profile/ios.mjs", `apps/${c.app}/${c.app}.declare`, "--stim", c.stim, "--render", "dom", "--real", REAL, "--label", `r4-${tree}`, ...rootArgs(tree)]);
        if (/FAILED|failed/.test(out)) line(`> device ${tree} ${c.app}:${c.stim} — ${out.split("\n").filter((l) => /FAILED|failed/.test(l)).join(" ").slice(0, 200)}`);
      }
      emit("device", `${c.app}:${c.stim}`, `device-${c.app}-${c.stim}-inpage-dom-r4-main.json`, `device-${c.app}-${c.stim}-inpage-dom-r4-opt.json`, "web");
    }
  }
}
line(`\n_Complete ${new Date().toLocaleString()}._`);
