// run — drive the PROFILE build of the test host through one stimulus and read
// every meter: the runtime's own (__prof, patched in by build-runtime.mjs), the
// host's frame stats, and the boot timeline (DECLARE_BOOTLOG).
//
//   node mac-host/profile/run.mjs apps/weather/weather.declare --stim resize --label jit
//   node mac-host/profile/run.mjs apps/desktop/desktop.declare --stim seed  --label nojit
//   node mac-host/profile/run.mjs apps/tracker/tracker.declare --stim wheel --label jit
//
// Stimuli:  resize  — liveresize the window 1280x828 → 1000x640 over 60 frames
//           wheel   — 90 wheel steps at 60 Hz over the content (dy −24)
//           seed    — desktop: two extra Files windows, then scaleSeed = i × 60
//
// Writes mac-host/profile/results/<app>-<stim>-<label>.json and prints
// the summary. Requires the app built with:
//   bash mac-host/bundle.sh --runtime mac-host/bundles/declare-mac.profile.js [--nojit]

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_NAME, CTL_IN, CTL_OUT, hostApp, hostBinary, NO_HOST } from "../app.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const target = argv.find((a) => a.endsWith(".declare"));
const STIM = flag("stim", "resize"), LABEL = flag("label", "jit");
const INPAGE = argv.includes("--inpage");   // the in-page driver (build-runtime.mjs BANNER) runs the stimulus
if (!target) { console.error("usage: run.mjs <path.declare> --stim resize|wheel|seed --label <name>"); process.exit(2); }

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
async function ctl(cmd, timeoutS = 20) {
  if (existsSync(CTL_OUT)) unlinkSync(CTL_OUT);
  writeFileSync(CTL_IN, cmd + "\n");
  for (let i = 0; i < timeoutS * 50; i++) { await sleep(0.02); if (existsSync(CTL_OUT)) return readFileSync(CTL_OUT, "utf8").trim(); }
  throw new Error(`no answer to: ${cmd}`);
}
const evalJSON = async (src) => JSON.parse(await ctl(`eval JSON.stringify(${src})`));

// ── the app, with the profile runtime baked ─────────────────────────────────
const bin = hostBinary();
if (bin === null) { console.error(NO_HOST); process.exit(1); }
const platform = JSON.parse(readFileSync(path.join(hostApp(), "Contents/Resources/platform.json"), "utf8"));
if (!/profile/.test(platform.runtime ?? "")) { console.error(`the installed test app bakes runtime "${platform.runtime}" — rebuild with --runtime …/declare-mac.profile.js`); process.exit(1); }

try { execFileSync("/usr/bin/pkill", ["-f", APP_NAME]); await sleep(1); } catch { /* none running */ }
mkdirSync(path.join(HERE, "results"), { recursive: true });
const base = `${path.basename(target, ".declare")}-${STIM}${INPAGE ? "-inpage" : ""}-${LABEL}`;
const logPath = path.join(HERE, "results", base + ".log");
const log = openSync(logPath, "w");
const url = "file://" + path.resolve(ROOT, target);
// THE DISPLAY MUST BE AWAKE: a CADisplayLink never fires on a sleeping display,
// and the in-page driver waits on requestAnimationFrame forever (an evening's
// lesson, 2026-09-16). Wake it (simulated user activity) and hold it awake
// for the app's lifetime.
try { execFileSync("/usr/bin/caffeinate", ["-u", "-t", "1"]); } catch { /* not fatal */ }
const child = spawn(bin, [], { detached: true, stdio: ["ignore", log, log],
  env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_APPEARANCE: "light", DECLARE_BOOTLOG: "1", DECLARE_URL: url, ...(argv.includes("--wasm") ? { DECLARE_NO_NATIVE_KERNEL: "1" } : {}), ...(argv.includes("--noring") ? { DECLARE_JS_NO_TRACK_RING: "1" } : {}), ...(argv.includes("--framedebug") ? { DECLARE_FRAME_DEBUG: "1" } : {}), ...(argv.includes("--jsongeom") ? { DECLARE_JS_JSON_GEOM: "1" } : {}) } });
child.unref();
if (child.pid) spawn("/usr/bin/caffeinate", ["-d", "-w", String(child.pid)], { detached: true, stdio: "ignore" }).unref();

let up = false;
for (let i = 0; i < 100 && !up; i++) { await sleep(0.2); try { up = (await ctl("ping", 1)).includes("ok") || true; } catch { /* not yet */ } }
if (!up) { console.error("the test host did not come up"); process.exit(1); }
// Wait for the PROGRAM, not just the process: a 3 MB dataset (tracker) mounts
// well after `ping` answers. Then a grace period for fonts, images and the
// first data-driven settles to land.
let mounted = false;
for (let i = 0; i < 150 && !mounted; i++) {
  await sleep(0.2);
  try { mounted = (await ctl("eval (typeof __app !== 'undefined' && __app.width > 0) ? 'yes' : 'no'", 2)) === "yes"; } catch { /* not yet */ }
}
if (!mounted) { console.error("the program did not mount"); process.exit(1); }
// the window may be behind others while the rig runs: keep it rendering
// (Control.swift `occlusion ignore`), or a covered window measures nothing
console.log("occlusion:", await ctl("occlusion ignore"));
await sleep(3);

const boot = await evalJSON("__prof.snapshot()");
const jit = await ctl("jit");

// ── the window ──────────────────────────────────────────────────────────────
await ctl("statsreset");
await ctl("eval __prof.reset()");
const t0 = Date.now();
let driven = null;
if (INPAGE) {
  // the same stimulus code every target runs (build-runtime.mjs BANNER)
  await ctl(`eval (globalThis.__profResult = null, __profDrive(${JSON.stringify(STIM)}).then((r) => { globalThis.__profResult = r; }, (e) => { globalThis.__profResult = { error: String(e) }; }), "started")`);
  for (let i = 0; i < 600 && driven === null; i++) { await sleep(0.25); const r = await ctl("eval JSON.stringify(globalThis.__profResult)"); if (r !== "null" && r !== "undefined") driven = JSON.parse(r); }
  if (driven === null || driven.error) { console.error("in-page drive failed:", driven?.error); process.exit(1); }
} else if (STIM === "resize") {
  await ctl("frostreset");
  await ctl("liveresize 1000 640 60 60");
  await sleep(1.03);   // the drag is 60 steps at 60 Hz: stats cover the drag, not the idle animation after it
} else if (STIM === "wheel") {
  console.log("under the wheel:", await ctl("wheelat 640 500"));
  await ctl("wheelsweep 90 60 -24 640 500");
  await sleep(2.5);
} else if (STIM === "filter") {
  // tracker: cycle the query — each step re-projects the dataset and
  // rematerializes rows (replication + layout + text), all in JS
  const qs = ["a", "e", "re", "s", "", "an", "t", "", "o", "in", "", "er"];
  for (let i = 0; i < 24; i++) { await ctl(`eval (__app.query = ${JSON.stringify(qs[i % qs.length])}, 'ok')`); await sleep(0.12); }
  await sleep(1);
} else if (STIM === "probe") {
  // a live look, for debugging the rig or a build: prints what the app answers
  const q = async (e) => console.log("probe:", e.slice(0, 60), "→", (await ctl("eval " + e)).slice(0, 700));
  await ctl("statsreset"); await q("(__app.launcher.newFiles(), 'files')"); await sleep(1.5); console.log("probe: stats after newFiles →", (await ctl("stats")).split("\n")[0]);
  await q("globalThis.__declareKernelKind"); await q("typeof __app.scaleSeed + ':' + __app.scaleSeed"); await q("typeof __app.launcher");
  await q("(__app.scaleSeed = 30, 'set')"); await sleep(0.5); await q("__app.scaleSeed"); await q("JSON.stringify(__prof.snapshot()).slice(0,160)");
  await q("(__app.launcher.newFiles(), 'files')"); await sleep(1); await q("__app.children.length"); await q("JSON.stringify(__prof.snapshot()).slice(0,160)");
  await q("JSON.stringify((globalThis.__declareLastError||null))");
  await q("__prof.all.length + ' constraints; scale-ish: ' + __prof.all.filter((c) => /scale|seed|magnif|dock/i.test(c.label)).map((c) => c.label + '#' + (c.__runs|0) + (c.isNative ? 'N' : '')).slice(0, 12).join(',')");
  await q("(function(){ const a = __prof.all.filter((c) => /Dock|dock/.test(c.label)); return a.length + ' dock rules; dead ' + a.filter((c) => c.dead).length + '; native ' + a.filter((c) => c.isNative).length; })()");
  await q("JSON.stringify(Object.keys(__app.dock || {}).slice(0, 20))"); await q("__app.dock && __app.dock.children.length");
  await q("(function(){ const K = __declareKernel(); K.dirty(); __app.scaleSeed = 31; K.flush(); const d = Array.from(K.dirty()); globalThis.__seedCell = d[0]; return 'dirty after write: ' + JSON.stringify(d.slice(0,6)); })()");
  await q("(function(){ const K = __declareKernel(); const rules = __prof.all.filter((c) => c.isNative && /Dock/.test(c.label)).slice(0, 4); return rules.map((c) => c.label + ':' + c.id + ' state=' + K.stateOf(c.id) + ' deps=' + JSON.stringify(K.deps(c.id).slice(0, 12)) + (K.deps(c.id).includes(globalThis.__seedCell) ? ' HAS-SEED' : ' no-seed')).join(' | '); })()");
  await q("(function(){ const w = __app.wm.frontWin; if (!w) return 'no front window'; const sp = w.children.filter((c) => c.constructor.name === 'Spring'); return 'front ' + w.constructor.name + ' zoomTarget=' + w.zoomTarget + ' tilts=' + w.tilts + ' scale=' + w.scale + ' springs: ' + sp.map((s) => s.attribute + ' to=' + s.to + ' running=' + s.running + ' arrived=' + s.arrived).join('; '); })()");
  await q("(function(){ const K = __declareKernel(); const seed = globalThis.__seedCell; const rs = __prof.all.filter((c) => !c.dead && c.id >= 0 && K.deps(c.id).includes(seed)); return rs.length + ' readers of cell ' + seed + ': ' + rs.slice(0, 10).map((c) => c.label + '#' + c.id + (c.isNative ? 'N' : '') + ' st' + K.stateOf(c.id)).join(', '); })()");
  await q("(function(){ const K = __declareKernel(); const c = __prof.all.find((x) => /DockIcon\\.scale/.test(x.label)); if (!c) return 'no DockIcon.scale'; return c.label + ' native=' + c.isNative + ' id=' + c.id + ' dead=' + c.dead + ' state=' + K.stateOf(c.id) + ' deps=' + JSON.stringify(K.deps(c.id)) + ' seedCell=' + globalThis.__seedCell; })()");
} else if (STIM === "seed") {
  await ctl("eval (__app.launcher.newFiles(), __app.launcher.newFiles(), 'ok')");
  await sleep(1);
  await ctl("statsreset");
  await ctl("eval __prof.reset()");
  for (let i = 1; i <= 60; i++) await ctl(`eval (__app.scaleSeed = ${i}, 'ok')`);
  await sleep(1);
} else { console.error(`unknown stimulus ${STIM}`); process.exit(2); }
const windowS = INPAGE ? driven.ms / 1000 : (Date.now() - t0) / 1000;
const stats = await ctl("stats");
const frostStats = await ctl("froststats").catch(() => "");
if (!INPAGE) console.log("frost:  " + String(frostStats).split("\n").map((l) => l.trim()).filter(Boolean).join("\n        "));
const win = INPAGE ? driven.win : await evalJSON("__prof.snapshot()");

// ── the micro-benchmark over what ran ───────────────────────────────────────
const bench = INPAGE ? { ...driven.bench, errors: 0, top: driven.bench.top } : await evalJSON("__prof.bench()");
if (INPAGE) console.log(`frames:  rAF gaps n=${driven.gaps.n} p50=${driven.gaps.p50.toFixed(1)} p95=${driven.gaps.p95.toFixed(1)} max=${driven.gaps.max.toFixed(1)} · >20ms ${driven.gaps.over20} · >33ms ${driven.gaps.over33}`);

try { execFileSync("/usr/bin/pkill", ["-f", APP_NAME]); } catch { /* gone */ }
await sleep(0.5);
const bootlog = readFileSync(logPath, "utf8").split("\n").filter((l) => /\[boot\]|BOOT|WINDOW ON SCREEN|FIRST COMMIT|compile|runtime scripts|H\.evaluate|ctx created|jit/i.test(l)).slice(0, 40);

const out = { app: target, stim: STIM, label: LABEL, jit, windowS, boot, win, stats, bench, bootlog, platform: platform.toolchain, gaps: driven?.gaps ?? null, driveBoot: driven?.boot ?? null, byLabel: driven?.byLabel ?? null, drag: driven?.drag ?? null };
writeFileSync(path.join(HERE, "results", base + ".json"), JSON.stringify(out, null, 2));

// ── the summary ─────────────────────────────────────────────────────────────
const ms = (x) => x.toFixed(1);
console.log(`\n${base}   (${jit})`);
console.log(`boot:    instantiate ${ms(boot.instMs)}ms ×${boot.instN} · new Function ${boot.nfN} in ${ms(boot.nfMs)}ms · settles ${boot.settleN} = ${ms(boot.settleMs)}ms (${boot.settleRuns} runs, ${boot.wired} wired) · stringify ${ms(boot.stringifyMs)}ms/${(boot.bytes / 1024).toFixed(0)}KB · commit ${ms(boot.commitMs)}ms`);
console.log(`         constraints live ${boot.constraints.live} (wired ${boot.constraints.wired})`);
console.log(`window:  ${windowS.toFixed(1)}s · settles ${win.settleN} = ${ms(win.settleMs)}ms (max ${ms(win.settleMax)}, ${win.settleRuns} runs; ${win.wired} wired) · stringify ${win.stringifyN}× ${ms(win.stringifyMs)}ms/${(win.bytes / 1024).toFixed(0)}KB (${win.opsN} ops) · commit ${ms(win.commitMs)}ms · new Function ${win.nfN}/${ms(win.nfMs)}ms`);
console.log(`close:   afterSettle steps ${win.afterN ?? 0} in ${ms(win.afterMs ?? 0)}ms · change events ${ms(win.changesMs ?? 0)}ms`);
console.log(`cover:   benched runs ${bench.runsCovered ?? "?"} of ${win.settleRuns} in the window · ${bench.deadRan ?? 0} constraints disposed since ran ${bench.deadRuns ?? 0} times`);
console.log(`bench:   ${bench.n} constraints ran (${bench.errors} errors) · weighted body ${ms(bench.body)}ms · weighted run ${ms(bench.run)}ms  → scheduling/tracking residue ≈ ${ms(win.settleMs - bench.run)}ms of ${ms(win.settleMs)}ms settle`);
console.log(`         top by run time:`);
for (const t of bench.top.slice(0, 12)) console.log(`           ${t.label.padEnd(34)} n=${String(t.n).padStart(4)} wired=${String(t.wired).padStart(4)} runs=${String(t.runs).padStart(6)} body=${ms(t.bodyMs).padStart(7)}ms run=${ms(t.runMs).padStart(7)}ms`);
console.log(`host:    ${stats.split("\n").join("\n         ")}`);
for (const l of bootlog.slice(0, 12)) console.log(`bootlog: ${l.replace(/^.*?\] /, "")}`);
