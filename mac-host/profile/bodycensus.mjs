// bodycensus — every JavaScript rule body that RUNS during an app's boot, with
// the reason it is not in the kernel, weighted by how often it ran. Decides which
// kernel-lowering extension removes the most boot-time JS.
//
//   node mac-host/profile/bodycensus.mjs [apps…]
//
// Classes: "runtime derive" (no authored body — Text.height, layout, …);
// compile-time declines (the emitter's syntax gate — expr-emit.ts); bind-time
// declines (the body lowered, the binder said no — bind.ts exprWhy, e.g. a
// target that is not a numeric cell). Runs through the metered bundle
// (build-runtime.mjs --web), which counts JS body runs; kernel-evaluated bodies
// never reach that counter.
import http from "node:http"; import path from "node:path"; import { readFileSync, existsSync } from "node:fs"; import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, "../..");
const APPS = process.argv.slice(2).length ? process.argv.slice(2) : ["calendar", "tracker", "weather", "desktop", "marketmap", "sampler", "docs", "homepage"];
const { emitExpr } = await import(path.join(ROOT, "compiler/dist/expr-emit.js"));
const PROFILE = readFileSync(path.join(HERE, "../bundles/declare-boot.profile.js"), "utf8");
const { createDeclareServer } = await import(path.join(ROOT, "server/create.mjs"));
const server = createDeclareServer({ mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }], mode: "distro" });
const hs = http.createServer(server.handler).on("upgrade", server.upgrade); await new Promise((r) => hs.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${hs.address().port}`;
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });

// the compile-time gate's reasons, most specific first (the same rules as exprcensus.mjs)
const COMPILE = [
  ["multi-statement", (s) => /;|\breturn\b/.test(s)],
  ["provided() lookup", (s) => /\$provided\(|\bprovided\s*\(/.test(s)],
  ["string value", (s) => /["'`]/.test(s)],
  ["arrow / new / typeof / as", (s) => /=>|\bnew\b|\btypeof\b|\s+as\s+/.test(s)],
  ["array / object / index", (s) => /[\[\]{}]/.test(s)],
  ["?. / ??", (s) => /\?\.|\?\?/.test(s)],
  ["call (non-Math)", (s) => /\b(?!Math\.)[\w.$]+\s*\(/.test(s.replace(/Math\.\w+\s*\(/g, ""))],
  ["&& / || as a value", (s) => /&&|\|\|/.test(s)],
  ["bare identifier (constant/local)", (s) => /(^|[^.\w$])(?!this\b|parent\b|app\b|classroot\b|Math\b|true\b|false\b)[A-Za-z_$][\w$]*\b(?!\s*\()/.test(s.replace(/\b\d+(\.\d+)?\b/g, ""))],
];
const COLOR_ATTRS = /^(fill|textColor|color|ink|stroke|strokeColor|borderColor|backgroundColor|tint|shadowColor|caretColor|selectionColor|placeholderColor|accent|glyphColor|trackColor|thumbColor)$/;

const total = new Map();
const bump = (m, k, runs, ms = 0) => { const e = m.get(k) ?? { bodies: 0, runs: 0, ms: 0 }; e.bodies++; e.runs += runs; e.ms += ms; m.set(k, e); };
const totalByLabel = new Map();
for (const app of APPS) {
  const pg = await browser.newPage(); await pg.setViewport({ width: 1280, height: 828, deviceScaleFactor: 2 });
  await pg.evaluateOnNewDocument(() => { globalThis.__declareExprTrace = []; });
  await pg.setRequestInterception(true);
  pg.on("request", (req) => { if (/\/bundles\/declare-boot\.js(\?|$)/.test(req.url())) req.respond({ status: 200, contentType: "application/javascript", body: PROFILE }); else req.continue(); });
  await pg.goto(`${B}/apps/${app}/${app}.declare?render=dom`, { waitUntil: "load", timeout: 90000 });
  await pg.waitForFunction("window.__declarePerf && window.__declarePerf.completed", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const data = await pg.evaluate(() => ({
    // each rule's BODY time, measured the way __prof.bench does (one sample if it
    // costs over 0.5 ms, else the mean of 31 more), so the classes can be ranked by
    // TIME — the run-count ranking picked the cheapest bodies (2026-09-18)
    rules: (globalThis.__prof?.all ?? []).filter((c) => (c.__runs | 0) > 0 && !c.dead).map((c) => {
      let ms = null;
      try { const t0 = performance.now(); c.compute(); const one = performance.now() - t0;
        if (one > 0.5) ms = one; else { const t1 = performance.now(); for (let i = 1; i < 32; i++) c.compute(); ms = (performance.now() - t1) / 31; } } catch { ms = null; }
      return { l: String(c.label ?? "?"), s: c.source ?? null, r: c.__runs | 0, ms };
    }),
    why: (globalThis.__declareExprTrace ?? []).map((e) => [e.label, e.why]),
  }));
  await pg.close();
  const whyByLabel = new Map(data.why);
  const by = new Map(); const byLabelApp = new Map();
  let bodies = 0, runs = 0;
  for (const c of data.rules) {
    bodies++; runs += c.r;
    let cls;
    if (c.s === null) cls = "runtime derive: " + c.l.replace(/ \(.*$/, "").replace(/^.*?\./, "").replace(/#\d+/g, "");
    else if (emitExpr(c.s, null) === null) cls = "compile: " + (COMPILE.find(([, t]) => t(c.s))?.[0] ?? "other");
    else {
      const why = whyByLabel.get(c.l) ?? "";
      const attr = c.l.replace(/ \(.*$/, "").split(".").pop();
      cls = /target not numeric/.test(why) ? (COLOR_ATTRS.test(attr) ? "bind: target is a COLOR" : `bind: target not numeric (${attr})`) : why ? "bind: " + why.replace(/:.*$/, "") : "lowerable, not taken";
    }
    const t = (c.ms ?? 0) * c.r;
    bump(by, cls, c.r, t); bump(total, cls, c.r, t);
    const lab = c.l.replace(/ \(.*$/, "").replace(/#\d+/g, "");
    bump(byLabelApp, lab + "   [" + cls + "]", c.r, t); bump(totalByLabel, lab + "   [" + cls + "]", c.r, t);
  }
  const T = [...by.values()].reduce((a, v) => a + v.ms, 0);
  const top = [...by.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 7);
  console.log(`\n### ${app}: ${bodies} JS bodies ran at boot, ${runs} runs, ${T.toFixed(1)} ms of body time — BY TIME\n` + top.map(([k, v]) => `  ${v.ms.toFixed(1).padStart(7)} ms ${String(Math.round(100 * v.ms / T)).padStart(3)}%  ${String(v.runs).padStart(6)} runs  ${k}`).join("\n"));
  const topL = [...byLabelApp.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 5);
  console.log("  heaviest rules:\n" + topL.map(([k, v]) => `  ${v.ms.toFixed(1).padStart(7)} ms  ${String(v.runs).padStart(6)} runs  ${k}`).join("\n"));
}
const TT = [...total.values()].reduce((a, v) => a + v.ms, 0), TR = [...total.values()].reduce((a, v) => a + v.runs, 0);
console.log(`\n### ALL APPS: ${TR} JS body runs, ${TT.toFixed(0)} ms of body time — classes BY TIME (share of time vs share of runs)\n` + [...total.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 16).map(([k, v]) => `  ${v.ms.toFixed(0).padStart(6)} ms ${String(Math.round(100 * v.ms / TT)).padStart(3)}% of time  ${String(Math.round(100 * v.runs / TR)).padStart(3)}% of runs  ${k}`).join("\n"));
console.log(`\n### ALL APPS: the heaviest individual rules\n` + [...totalByLabel.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 15).map(([k, v]) => `  ${v.ms.toFixed(1).padStart(7)} ms  ${String(v.runs).padStart(6)} runs  ${k}`).join("\n"));
await browser.close(); hs.close();
