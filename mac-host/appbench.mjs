// appbench — a program under a stimulus on the NATIVE host, read off its own
// frame meter.
//
//   node mac-host/appbench.mjs <url-path> [--setup "<js>"] [--step "<js>"] [--steps 60] [--memo off]
//
//   node mac-host/appbench.mjs apps/desktop/desktop.declare \
//     --setup "__app.launcher.newFiles(); __app.launcher.newFiles()" \
//     --step  "__app.scaleSeed = i"
//
// The web rigs cannot drive the Mac host, so this is rasterbench's --app for
// it: launch the host on the program, run a setup expression, then a per-step
// expression with `i` in scope through `ctl eval`, returning to the run loop
// between steps so the display link commits frames as under a real gesture.
// Cadence comes from `stats`: the host's MOTION gap line (p50/p95/max between
// commits that carried geometry) — the honest native equivalent of the
// browser's rAF gaps. `--memo off` is a no-op here and is accepted so a matrix
// can be written once: the host has no raster memo, it DESCRIBES.
//
// Same launch discipline as drawconform.mjs; "Declare Mac" WITH THE SPACE.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hostWindow } from "./win.mjs";
import { hostBinary, NO_HOST } from "./app.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IN = "/tmp/declare-ctl.in", OUT = "/tmp/declare-ctl.out";
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const target = argv.find((a) => a.endsWith(".declare"));
if (!target) { console.error("usage: node mac-host/appbench.mjs <path.declare> [--setup js] [--step js] [--steps N]"); process.exit(2); }
const SETUP = flag("setup", ""), STEP = flag("step", ""), STEPS = Number(flag("steps", "60"));

async function ctl(cmd) {
  if (existsSync(OUT)) unlinkSync(OUT);
  writeFileSync(IN, cmd + "\n");
  for (let i = 0; i < 400; i++) { await sleep(0.02); if (existsSync(OUT)) return readFileSync(OUT, "utf8").trim(); }
  throw new Error("the native app did not answer — is DECLARE_CONTROL set?");
}

const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${httpServer.address().port}/${target}?render=mac`;

const bin = hostBinary();
if (bin === null) { console.error(NO_HOST); process.exit(1); }
for (const pat of ["Declare Mac", "DeclareMac"]) { try { execFileSync("/usr/bin/pkill", ["-f", pat]); } catch { /* none */ } }
await sleep(1.2);
spawn(bin, [], { detached: true, stdio: "ignore",
  env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_APPEARANCE: "light", DECLARE_URL: URL_ } }).unref();
let up = false;
for (let i = 0; i < 60 && !up; i++) { await sleep(0.5); try { hostWindow(); up = i > 4; } catch { /* not yet */ } }
if (!up) { console.error("no host window"); process.exit(1); }
await sleep(3);
// `app` in a step or setup is the App, as it is in rasterbench's agent
if (SETUP) { await ctl(`eval (function () { var app = __app; ${SETUP}; })(); "setup"`); await sleep(2); }
await ctl("statsreset");
for (let i = 0; i < STEPS; i++) {
  if (STEP) await ctl(`eval (function (i, STEPS) { var app = __app; ${STEP}; })(${i}, ${STEPS}); "step"`);
  await sleep(0.05);
}
await sleep(0.5);
const stats = await ctl("stats");
const m = /MOTION gap ms p50=([\d.]+)\s+p95=([\d.]+)\s+max=([\d.]+)\s+over=(\d+)\s+\(n=(\d+)\)/.exec(stats);
const r = /rasters=(\d+)\s+rasterMs total=([\d.]+)/.exec(stats);
console.log(`mac · ${target.replace(/^.*\//, "")} · ${STEPS} steps` + (STEP ? ` · step: ${STEP}` : " · no stimulus"));
console.log(m ? `  motion gap ms  p50 ${m[1]}  p95 ${m[2]}  max ${m[3]}  over-budget ${m[4]} of ${m[5]}` : "  (no MOTION gap line — did the stimulus move geometry?)");
console.log(r ? `  rasters ${r[1]}  rasterMs ${r[2]}` : "");
for (const pat of ["Declare Mac", "DeclareMac"]) { try { execFileSync("/usr/bin/pkill", ["-f", pat]); } catch { /* gone */ } }
httpServer.close();
