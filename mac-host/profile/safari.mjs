// safari — the same profile in DESKTOP Safari on this Mac (JavaScriptCore with
// its JIT, WebKit's DOM — the engine the Mac host shares, in the browser it
// ships with). Serves a tree with its METERED boot bundle in place of
// bundles/declare-boot.js, opens the program in Safari (`open -a Safari`, so
// Safari comes to the front — the page must be visible for its frame clock)
// with ?autoprofile=<stim>&report=…, and waits for the in-page driver to POST
// its result back.
//
//   node mac-host/profile/safari.mjs apps/desktop/desktop.declare --stim seed --render dom --label opt
//   node mac-host/profile/safari.mjs apps/desktop/desktop.declare --stim seed --render dom --root /Users/temkin/Code/Declare --label main
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const target = argv.find((a) => a.endsWith(".declare"));
const STIM = flag("stim", "seed"), RENDER = flag("render", "dom"), LABEL = flag("label", "opt");
const ROOT = flag("root") ? path.resolve(flag("root")) : path.resolve(HERE, "../..");
const TAG = flag("root") ? "." + path.basename(ROOT).toLowerCase() : "";
const PROFILE = path.join(HERE, `../bundles/declare-boot${TAG}.profile.js`);
if (!target) { console.error("usage: safari.mjs <path.declare> --stim resize|seed|filter --render dom|canvas [--root tree] --label x"); process.exit(2); }
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
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

// ── Safari ──────────────────────────────────────────────────────────────────
const url = `${B}/${target}?render=${RENDER}&autoprofile=${STIM}&report=${encodeURIComponent(B + "/__profile")}`;
// A NEW WINDOW, in front: Safari throttles requestAnimationFrame in a
// background tab, and a relaunch restores every old window ahead of a plain
// `open` — the driver then waits on a frame that never comes. The window is
// closed after the report (only ours: its URL carries this run's port).
const osa = (script) => execFileSync("/usr/bin/osascript", ["-e", script], { encoding: "utf8" });
try { execFileSync("/usr/bin/caffeinate", ["-u", "-t", "1"]); } catch { /* not fatal */ }
const PORT = String(httpServer.address().port);
osa(`tell application "Safari"\n activate\n make new document with properties {URL:"${url}"}\nend tell`);
// bring OUR window to the front (a relaunch restores the old ones ahead of it)
// by INDEX, descending (a `repeat with w in windows` reference goes stale as windows move)
const ours = (verb) => `tell application "Safari"\n set n to count windows\n repeat with i from n to 1 by -1\n try\n if (URL of current tab of window i) contains ":${PORT}/" then ${verb}\n end try\n end repeat\nend tell`;
const raise = ours("set index of window i to 1") + `\ntell application "Safari" to activate`;
try { osa(raise); } catch { /* best effort */ }
console.log(`opened in Safari (new window): ${url}`);

const out = await Promise.race([reported, new Promise((_, rej) => setTimeout(() => rej(new Error("no report within 180 s")), 180000))]).catch((e) => ({ error: String(e) }));
httpServer.close();
try { osa(ours("close window i")); } catch { /* the window may be gone */ }
if (out.error) { console.error("profile failed:", out.error, `— boot bundle swapped ${swapped}×; requests seen:\n  ` + seen.slice(-25).join("\n  ")); process.exit(1); }

const base = `${path.basename(target, ".declare")}-${STIM}-inpage-${RENDER}-${LABEL}`;
mkdirSync(path.join(HERE, "results"), { recursive: true });
writeFileSync(path.join(HERE, "results", "safari-" + base + ".json"), JSON.stringify({ target, STIM, RENDER, LABEL, root: ROOT, ...out }, null, 2));
const ms = (x) => x.toFixed(1); const b = out.boot, w = out.win;
console.log(`\nsafari-${base}   (${path.basename(ROOT)}, dpr ${out.dpr}, viewport ${out.viewport?.join("x")})`);
console.log(`ua:      ${out.ua}`);
console.log(`boot:    instantiate ${ms(b.instMs)}ms · settles ${b.settleN} = ${ms(b.settleMs)}ms (${b.settleRuns} runs) · constraints live ${b.constraints.live}`);
console.log(`window:  ${(out.ms / 1000).toFixed(1)}s · settles ${w.settleN} = ${ms(w.settleMs)}ms (max ${ms(w.settleMax)}, ${w.settleRuns} runs) · rAF gaps n=${out.gaps.n} p50=${ms(out.gaps.p50)} p95=${ms(out.gaps.p95)} max=${ms(out.gaps.max)}`);
console.log(`bench:   ${out.bench.n} constraints ran · weighted body ${ms(out.bench.body)}ms · weighted run ${ms(out.bench.run)}ms`);
for (const t of out.bench.top.slice(0, 5)) console.log(`           ${t.label.padEnd(34)} n=${String(t.n).padStart(4)} runs=${String(t.runs).padStart(6)} body=${ms(t.bodyMs).padStart(7)}ms run=${ms(t.runMs).padStart(7)}ms`);
