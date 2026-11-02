// soak/lib — shared helpers for the headless soaks in this folder.
//
// A soak builds a program, warms an operation up, takes a reading, repeats the
// operation, takes another, and reports the difference per cycle. A reading is
// the kernel's high-water marks (cells, rules, code words, constants), the live
// rule count (RULES), the JS heap after forced GC, and the number of live
// runtime Node objects (v8.queryObjects — exact, after its own GC).
//
// Run every soak with `node --expose-gc test/soak/<name>.mjs`.
import v8 from "node:v8";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const HERE = path.join(ROOT, "test/soak");
// A frame source, so the animation clock runs headless as it does in a browser
// (without one, every Spring/Animator/Time stays on the clock forever and every
// soak that discards a moving thing reads as a leak). --no-raf turns it off.
if (!process.argv.includes("--no-raf") && typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 8);
  globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
}
const { compile } = await import(ROOT + "/compiler/dist/compile-node.js");
const { settleHeadless } = await import(ROOT + "/compiler/dist/headless.js");
export const R = await import(ROOT + "/runtime/dist/reactive.js");
export const RT = await import(ROOT + "/runtime/dist/index.js");
export const OUT = await import(ROOT + "/runtime/dist/outside.js");
export const ANIM = await import(ROOT + "/runtime/dist/animate.js");
await R.kernelReady();

export const QUIET = !process.argv.includes("--loud");
if (QUIET) { console.warn = () => {}; }
export const ERRORS = [];
const origError = console.error;
console.error = (...a) => { if (String(a[0]).includes("ExperimentalWarning")) return; ERRORS.push(a.map(String).join(" ").slice(0, 300)); if (!QUIET) origError(...a); };
process.removeAllListeners("warning");
process.on("uncaughtException", (e) => { ERRORS.push("uncaught: " + (e?.stack ?? e).toString().slice(0, 400)); origError("UNCAUGHT", e); });
process.on("unhandledRejection", (e) => { ERRORS.push("unhandled: " + (e?.stack ?? e).toString().slice(0, 400)); origError("UNHANDLED", e); });

export async function build(src, opts = {}) {
  const r = await compile(src, { originDir: opts.originDir ?? HERE, mainId: opts.mainId ?? path.join(HERE, "inline.declare") });
  if (r.errors?.length) throw new Error("compile: " + r.errors.map((e) => `${e.code ?? ""} ${e.line ?? ""}:${e.column ?? ""} ${e.message}`).join("\n"));
  return r;
}
export function run(r, opts = {}) { return settleHeadless(r.program, { deps: r.deps, ...opts }); }

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
export async function gc() {
  if (typeof global.gc !== "function") throw new Error("run with node --expose-gc");
  for (let i = 0; i < 4; i++) { global.gc(); await sleep(5); }
}
const nodeCount = () => v8.queryObjects(RT.Node, { format: "count" });
const viewCount = () => v8.queryObjects(RT.View, { format: "count" });

let EXTRA = null;
/** Add counters of your own to every reading: fn() → { name: number }. */
export function extraReading(fn) { EXTRA = fn; }
export async function reading() {
  await gc();
  const k = R.kernel(), c = k.codeUse(), s = R.kernelStats(0);
  return { cells: k.cells(), rules: k.rules(), live: s.live, code: c.code, consts: c.consts,
    heapKB: Math.round(process.memoryUsage().heapUsed / 1024), nodes: nodeCount(), views: viewCount(),
    tickers: ANIM.sharedClock.tickersNow().length,
    timers: process.getActiveResourcesInfo().filter((t) => t === "Timeout").length,
    ...(EXTRA ? EXTRA() : {}) };
}
export function diff(a, b, n) {
  const o = {};
  for (const k of Object.keys(a)) o[k] = +((b[k] - a[k]) / n).toFixed(2);
  return o;
}
/** Live rules by label (without ids), for diffing what was left standing. */
export function liveRules() {
  const m = new Map(), k = R.kernel();
  for (let id = 0; id < k.rules(); id++) {
    const c = R.constraintOfRule(id);
    if (!c) continue;
    const key = String(c.label ?? "?").replace(/#\d+/g, "#").replace(/\d{3,}/g, "N").slice(0, 120);
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}
export function ruleDiff(a, b) {
  const out = [];
  for (const [k, v] of b) { const d = v - (a.get(k) ?? 0); if (d !== 0) out.push([k, d]); }
  for (const [k, v] of a) if (!b.has(k)) out.push([k, -v]);
  return out.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 15);
}

/** Count live objects by constructor name for a quick look at what grew. */
export function heapCensus(names) {
  const o = {};
  for (const [n, ctor] of Object.entries(names)) o[n] = v8.queryObjects(ctor, { format: "count" });
  return o;
}

/** warm → read → n more → read. `step(i)` may be async. Returns growth per cycle. */
export async function soak(name, step, { warm = 20, n = 100, settle = true, after } = {}) {
  const errs0 = ERRORS.length;
  let i = 0;
  for (; i < warm; i++) { await step(i); if (settle) R.settle(); }
  const rules0 = liveRules();
  const a = await reading();
  for (; i < warm + n; i++) { await step(i); if (settle) R.settle(); }
  const b = await reading();
  const per = diff(a, b, n);
  const grew = Object.entries(per).filter(([k, v]) => k === "heapKB" ? v > 2 : v > 0.05);
  const rd = grew.some(([k]) => k === "live" || k === "rules") ? ruleDiff(rules0, liveRules()) : [];
  const errs = ERRORS.slice(errs0);
  const flat = grew.length === 0 && errs.length === 0;
  console.log(`${flat ? "flat " : "GROWS"}  ${name}`);
  console.log(`       per cycle: ${JSON.stringify(per)}   (at end ${JSON.stringify(b)})`);
  if (rd.length) console.log(`       rules left standing: ${JSON.stringify(rd)}`);
  if (errs.length) console.log(`       ${errs.length} errors, first: ${[...new Set(errs)].slice(0, 3).join(" | ")}`);
  if (after) await after();
  return { name, per, end: b, errors: errs.length, flat };
}

/** Track kernel cell allocations: single cells (Cell.ensure → addCell) by the
 *  stack that made them, until freed; and blocks (addCells — only when no free
 *  block fits). `report()` groups the cells still held by allocation site. */
export function trackCells() {
  const k = R.kernel();
  const addCell = k.addCell, freeCell = k.freeCell, addCells = k.addCells;
  const live = new Map(), blocks = [];
  const site = () => (new Error().stack ?? "").split("\n").slice(3, 11).map((l) => l.trim().replace(/^at /, "").replace(/\(file:\/\/\/Users\/temkin\/Code\/Declare\//, "(")).join(" < ");
  k.addCell = function (...a) { const id = addCell.apply(this, a); if (id >= 0) live.set(id, site()); return id; };
  k.freeCell = function (id) { live.delete(id); return freeCell.call(this, id); };
  k.addCells = function (n) { const b = addCells.call(this, n); blocks.push([n, site()]); return b; };
  return {
    live, blocks,
    stop() { k.addCell = addCell; k.freeCell = freeCell; k.addCells = addCells; },
    report(top = 6) {
      const by = new Map();
      for (const s of live.values()) by.set(s, (by.get(s) ?? 0) + 1);
      const bb = new Map();
      for (const [n, s] of blocks) bb.set(`${n} cells: ${s}`, (bb.get(`${n} cells: ${s}`) ?? 0) + 1);
      return { cellsHeld: live.size, bySite: [...by].sort((a, b) => b[1] - a[1]).slice(0, top), newBlocks: blocks.length, blockSites: [...bb].sort((a, b) => b[1] - a[1]).slice(0, top) };
    },
  };
}

/** Track kernel rule creation (every add* that returns a rule id) until the
 *  rule is disposed; `report()` groups the rules still standing by site. */
export function trackRules() {
  const k = R.kernel();
  const names = ["addRule", "addExprRule", "visAdd", "extentAdd", "layoutAdd"].filter((n) => typeof k[n] === "function");
  const orig = Object.fromEntries(names.map((n) => [n, k[n]]));
  const origDispose = k.dispose;
  const live = new Map();
  const site = () => (new Error().stack ?? "").split("\n").slice(3, 10).map((l) => l.trim().replace(/^at /, "").replace(/\(file:\/\/\/Users\/temkin\/Code\/Declare\//, "(")).join(" < ");
  for (const n of names) k[n] = function (...a) { const id = orig[n].apply(this, a); if (id >= 0) live.set(id, n + ": " + site()); return id; };
  k.dispose = function (id) { live.delete(id); return origDispose.call(this, id); };
  return {
    live,
    stop() { for (const n of names) k[n] = orig[n]; k.dispose = origDispose; },
    report(top = 6) {
      const by = new Map();
      for (const [id, s] of live) {
        const c = R.constraintOfRule(id);
        const key = `${c ? c.label.replace(/#\d+/g, "#") : "?"} | ${s}`;
        by.set(key, (by.get(key) ?? 0) + 1);
      }
      return { rulesHeld: live.size, bySite: [...by].sort((a, b) => b[1] - a[1]).slice(0, top) };
    },
  };
}
