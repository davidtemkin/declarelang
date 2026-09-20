// ios — the same profile in iOS Safari on the simulator. Serves a tree with
// its METERED boot bundle in place of bundles/declare-boot.js, boots a
// simulator, opens the program in Safari with ?autoprofile=<stim>&report=…,
// and waits for the page's in-page driver (build-runtime.mjs BANNER) to POST
// its result back.
//
//   node mac-host/profile/ios.mjs apps/desktop/desktop.declare --stim seed --render dom --label opt
//   node mac-host/profile/ios.mjs apps/desktop/desktop.declare --stim seed --render dom --root /Users/temkin/Code/Declare --label main
//   [--device "iPhone 16 Pro"]                      a simulator (default)
//   [--real "David’s M5 iPad Pro"]                  a PHYSICAL device via devicectl; results land as device-<…>.json
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const target = argv.find((a) => a.endsWith(".declare"));
const STIM = flag("stim", "seed"), RENDER = flag("render", "dom"), LABEL = flag("label", "opt"), DEVICE = flag("device", "iPhone 16 Pro");
const ROOT = flag("root") ? path.resolve(flag("root")) : path.resolve(HERE, "../..");
const TAG = flag("root") ? "." + path.basename(ROOT).toLowerCase() : "";
const PROFILE = path.join(HERE, `../bundles/declare-boot${TAG}.profile.js`);
if (!target) { console.error("usage: ios.mjs <path.declare> --stim resize|seed|filter --render dom|canvas [--root tree] --label x"); process.exit(2); }
if (!existsSync(PROFILE)) { console.error(`no metered bundle at ${PROFILE}`); process.exit(1); }

// ── the server: the tree, with the metered boot bundle swapped in ───────────
const { createDeclareServer } = await import(path.join(ROOT, "server/create.mjs"));
const server = createDeclareServer({ mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }], mode: "distro" });
const profileSrc = readFileSync(PROFILE);
let resolveReport; const reported = new Promise((r) => { resolveReport = r; });
let swapped = 0; const seen = [];
const httpServer = http.createServer((req, res) => {
  seen.push(req.method + " " + req.url.slice(0, 80));
  if (req.method === "POST" && req.url.startsWith("/__profile")) {
    let body = ""; req.on("data", (c) => { body += c; }); req.on("end", () => { res.writeHead(204, { "access-control-allow-origin": "*" }); res.end(); resolveReport(JSON.parse(body)); });
    return;
  }
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" }); res.end(); return; }
  if (/\/bundles\/declare-boot\.js(\?|$)/.test(req.url)) { swapped++; res.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" }); res.end(profileSrc); return; }
  server.handler(req, res);
}).on("upgrade", server.upgrade);
// --real <udid|name>: a physical device (Apple's devicectl, Xcode 15+). The
// rig's server must then be reachable over the LAN, so it binds every
// interface and the URL carries the Mac's address; the device must be on the
// same network (USB does not route HTTP) with Developer Mode on.
const REAL = flag("real", null);
const lanIP = () => { for (const ifc of ["en0", "en1"]) { try { const ip = execFileSync("ipconfig", ["getifaddr", ifc], { encoding: "utf8" }).trim(); if (ip) return ip; } catch { /* next */ } } throw new Error("no LAN address"); };
await new Promise((r) => httpServer.listen(0, REAL ? "0.0.0.0" : "127.0.0.1", r));
const B = `http://${REAL ? lanIP() : "127.0.0.1"}:${httpServer.address().port}`;

// ── the simulator ───────────────────────────────────────────────────────────
const sim = (...a) => execFileSync("xcrun", ["simctl", ...a], { encoding: "utf8" });
let udid = null, booted = false;
if (!REAL) {
  const list = JSON.parse(sim("list", "devices", "available", "-j"));
  for (const devs of Object.values(list.devices)) for (const d of devs) if (d.name === DEVICE && udid === null) { udid = d.udid; booted = d.state === "Booted"; }
  if (udid === null) { console.error(`no simulator named "${DEVICE}"`); process.exit(1); }
  if (!booted) { console.log(`booting ${DEVICE}…`); sim("boot", udid); sim("bootstatus", udid, "-b"); }
}
// NOTE a device booted by simctl runs with no window unless the Simulator app
// (a full Xcode install) attaches to it; Safari renders and paces frames
// regardless, so the rig needs no window
const url = `${B}/${target}?render=${RENDER}&autoprofile=${STIM}&report=${encodeURIComponent(B + "/__profile")}`;
if (REAL) execFileSync("xcrun", ["devicectl", "device", "process", "launch", "--device", REAL, "--terminate-existing", "--payload-url", url, "com.apple.mobilesafari"], { stdio: "ignore", timeout: 60000 });
else sim("openurl", udid, url);
console.log(`opened in ${REAL ?? DEVICE}: ${url}`);

const out = await Promise.race([reported, new Promise((_, rej) => setTimeout(() => rej(new Error("no report within 180 s")), 180000))]).catch((e) => ({ error: String(e) }));
httpServer.close();
if (out.error) { console.error("profile failed:", out.error, `— boot bundle swapped ${swapped}×; requests seen:\n  ` + seen.slice(-25).join("\n  ")); process.exit(1); }

const base = `${path.basename(target, ".declare")}-${STIM}-inpage-${RENDER}-${LABEL}`;
mkdirSync(path.join(HERE, "results"), { recursive: true });
writeFileSync(path.join(HERE, "results", (REAL ? "device-" : "ios-") + base + ".json"), JSON.stringify({ target, STIM, RENDER, LABEL, root: ROOT, device: REAL ?? DEVICE, ...out }, null, 2));
const ms = (x) => x.toFixed(1); const b = out.boot, w = out.win;
console.log(`\n${REAL ? "device" : "ios"}-${base}   (${path.basename(ROOT)}, ${REAL ?? DEVICE}, dpr ${out.dpr}, viewport ${out.viewport?.join("x")})`);
console.log(`ua:      ${out.ua}`);
console.log(`kernel:  ${seen.filter((u) => /declare-kernel/.test(u)).length} request(s) for the kernel file seen by the rig's server`);
console.log(`boot:    instantiate ${ms(b.instMs)}ms · settles ${b.settleN} = ${ms(b.settleMs)}ms (${b.settleRuns} runs) · constraints live ${b.constraints.live}`);
console.log(`window:  ${(out.ms / 1000).toFixed(1)}s · settles ${w.settleN} = ${ms(w.settleMs)}ms (max ${ms(w.settleMax)}, ${w.settleRuns} runs) · rAF gaps n=${out.gaps.n} p50=${ms(out.gaps.p50)} p95=${ms(out.gaps.p95)} max=${ms(out.gaps.max)}`);
console.log(`bench:   ${out.bench.n} constraints ran · weighted body ${ms(out.bench.body)}ms · weighted run ${ms(out.bench.run)}ms`);
for (const t of out.bench.top.slice(0, 5)) console.log(`           ${t.label.padEnd(34)} n=${String(t.n).padStart(4)} runs=${String(t.runs).padStart(6)} body=${ms(t.bodyMs).padStart(7)}ms run=${ms(t.runMs).padStart(7)}ms`);
// The result is on disk and printed: exit NOW. Safari keeps its connections to
// the rig's server open (keep-alive and the dev server's WebSocket) long after
// the report lands, and Node will not exit while they are — measured 2:50 of
// idle per run in round 4, against ~10 s of work (2026-09-17).
process.exit(0);
