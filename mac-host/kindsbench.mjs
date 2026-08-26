// kindsbench — the op-kind sweep on the NATIVE host, read off its own meter.
//
//   node mac-host/kindsbench.mjs            # all kinds, ops 1/256/1024, span 0.25
//   node mac-host/kindsbench.mjs --small    # span 0.06 (the second span rasterfit needs)
//   node mac-host/kindsbench.mjs --kind shadow   # one kind only
//
// The web rigs cannot drive the Mac host, and the host cannot be traced by
// Chrome — but it has the one raster meter that was always honest: LayerTree
// times every rasterization it performs (rasterMsTotal / rasterMsNodes /
// rasterPxNodes) and `ctl stats` reports it. So this drives
// test/probe/raster-coverage.declare in the host through `ctl eval` — the
// same knobs rasterbench turns — and reads the meter between statsreset and
// stats. One kind at a time, one op count at a time, N re-records each.
//
// ⚠ LayerDescribe. The host DESCRIBES a recording as CALayers wherever it can
// (fills, strokes, gradients it can express) and rasterizes only what it
// cannot (text, shadows, focal radials, filters). So for a described kind the
// raster meter reads ~0 and the cost has moved to the render server, which
// this cannot see — `describedN` / `rasterizedN` say which path each row took,
// and a row that was described is reported as such, not as "free".
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
const SMALL = process.argv.includes("--small");
const SPAN = SMALL ? 0.06 : 0.25;
const STEPS = 30;
const ONLY = process.argv[process.argv.indexOf("--kind") + 1];
const KINDS = process.argv.includes("--kind") ? [ONLY] : ["fill", "gradient", "stroke", "text", "shadow"];
const OPS = [1, 256, 1024];

async function ctl(cmd) {
  if (existsSync(OUT)) unlinkSync(OUT);
  writeFileSync(IN, cmd + "\n");
  for (let i = 0; i < 400; i++) {
    await sleep(0.02);
    if (existsSync(OUT)) return readFileSync(OUT, "utf8").trim();
  }
  throw new Error("the native app did not answer — is DECLARE_CONTROL set?");
}

const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${httpServer.address().port}/test/probe/raster-coverage.declare?render=mac`;

const bin = hostBinary();
if (bin === null) { console.error(NO_HOST); process.exit(1); }
for (const pat of ["Declare Mac", "DeclareMac"]) { try { execFileSync("/usr/bin/pkill", ["-f", pat]); } catch { /* none */ } }
await sleep(1.2);
spawn(bin, [], { detached: true, stdio: "ignore",
  env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_APPEARANCE: "light", DECLARE_URL: URL_ } }).unref();
let up = false;
for (let i = 0; i < 60 && !up; i++) { await sleep(0.5); try { hostWindow(); up = i > 4; } catch { /* not yet */ } }
if (!up) { console.error("no host window"); process.exit(1); }
await sleep(2.5);
console.log(`native host on the kinds probe · span ${SPAN} · ${STEPS} re-records per row`);
console.log("  " + "kind".padEnd(10) + "ops".padStart(6) + "   the host's own raster meter, per row");

for (const kind of KINDS) {
  for (const ops of OPS) {
    await ctl(`eval __app.kind = ${JSON.stringify(kind)}; __app.span = ${SPAN}; __app.ops = ${ops}; __app.tick = 0; "set"`);
    await sleep(0.6);
    await ctl("statsreset");
    for (let i = 0; i < STEPS; i++) {
      await ctl(`eval __app.tick = __app.tick + 1; __app.tick`);
      await sleep(0.05);
    }
    await sleep(0.4);
    const stats = await ctl("stats");
    // the meter: "rasters=N rasterMs total=T avg=A" and "LAYERS: described=D rasterized=R"
    const n = /rasters=(\d+)\s+rasterMs total=([\d.]+)\s+avg=([\d.]+)/.exec(stats);
    const l = /described=(\d+)\s+rasterized=(\d+)/.exec(stats);
    const rasters = n ? Number(n[1]) : 0, total = n ? Number(n[2]) : 0;
    const perStep = rasters > 0 ? total / STEPS : 0;
    console.log("  " + kind.padEnd(10) + String(ops).padStart(6)
      + `   rasters ${String(rasters).padStart(4)}   rasterMs total ${total.toFixed(1).padStart(8)}   per re-record ${perStep.toFixed(2).padStart(7)} ms`
      + (l ? `   layers described=${l[1]} rasterized=${l[2]}` : "")
      + (rasters === 0 ? "   ← DESCRIBED (no raster; cost is the render server's)" : ""));
  }
}
for (const pat of ["Declare Mac", "DeclareMac"]) { try { execFileSync("/usr/bin/pkill", ["-f", pat]); } catch { /* gone */ } }
httpServer.close();
