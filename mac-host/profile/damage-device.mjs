// damage-device — dirty regions ON vs OFF (__declareNoDamage) on a PHYSICAL device, canvas renderer, the partial-
// screen stimuli. ONE server for the whole round (the metered boot bundle swapped in); each run opens in a new
// Safari tab via devicectl under its own path prefix /r<N>/, and anything asking for another run's prefix (a tab
// Safari restored) gets an empty page — a stale tab can never run a stimulus alongside the measured one.
//
//   node mac-host/profile/damage-device.mjs --real <udid> [--cases desktop:drag,…] [--reps 2]
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const REAL = flag("real", null), REPS = +flag("reps", "2");
const MODES = flag("modes", "on,off").split(",");
const CASES = flag("cases", "desktop:drag,desktop:openclose,desktop:menus,desktop:hover,desktop:minimize,tracker:hover,tracker:filter").split(",");
if (!REAL) { console.error("usage: damage-device.mjs --real <udid>"); process.exit(2); }
const PROFILE = path.join(ROOT, "mac-host/bundles/declare-boot.profile.js");
const profileSrc = readFileSync(PROFILE);
const lanIP = () => { for (const ifc of ["en0", "en1"]) { try { const ip = execFileSync("ipconfig", ["getifaddr", ifc], { encoding: "utf8" }).trim(); if (ip) return ip; } catch { /* next */ } } throw new Error("no LAN address"); };

const { createDeclareServer } = await import(path.join(ROOT, "server/create.mjs"));
const server = createDeclareServer({ mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }], mode: "distro" });
let current = -1, resolveReport = null, stale = 0;
const httpServer = http.createServer((req, res) => {
  // the PAGE (and its report) carry the run prefix; its subresources are fetched by absolute path. A stale tab
  // asks for its page under an old prefix and gets an empty one, so it never loads a script.
  const m = /^\/r(\d+)(\/.*)$/.exec(req.url);
  if (m !== null) {
    if (+m[1] !== current) { stale++; res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }); res.end("<!doctype html><title>stale run</title>"); return; }
    req.url = m[2];
  }
  if (req.method === "POST" && req.url.startsWith("/__profile")) {
    let body = ""; req.on("data", (c) => { body += c; }); req.on("end", () => {
      // the reply carries the NEXT run's URL and the page navigates itself there,
      // so the whole round runs in ONE tab (see build-runtime.mjs): no pile of
      // tabs, each holding its own canvases and caches against the next run
      const out = JSON.parse(body);
      res.writeHead(200, { "access-control-allow-origin": "*", "content-type": "application/json" });
      res.end(JSON.stringify({ next: current < QUEUE.length ? urlFor(current) : null }));
      resolveReport?.(out);
    });
    return;
  }
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" }); res.end(); return; }
  if (/\/bundles\/declare-boot\.js(\?|$)/.test(req.url)) { res.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" }); res.end(profileSrc); return; }
  server.handler(req, res);
}).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "0.0.0.0", r));
const B = `http://${lanIP()}:${httpServer.address().port}`;
console.log(`server ${B} (one for the round)`);

// the whole round, in order, decided up front: each report hands the page the next run
const QUEUE = [];
for (const c of CASES) {
  const [app, stim] = c.split(":");
  const order = []; for (let r = 0; r < REPS; r++) order.push(...(r % 2 === 0 ? MODES : [...MODES].reverse()));   // alternate per rep: drift cancels
  for (const mode of order) QUEUE.push({ app, stim, mode, c });
}
const urlFor = (i) => {
  const q = QUEUE[i], base = `${B}/r${i + 1}`;
  // "on" = as shipped, "off" = __declareNoDamage, a number = that full-repaint threshold (share of the canvas)
  const flags = q.mode === "off" ? "&flags=__declareNoDamage=true" : q.mode === "on" ? "" : `&flags=__declareDamageMax=${q.mode}`;
  return `${base}/apps/${q.app}/${q.app}.declare?render=canvas&autoprofile=${q.stim}&report=${encodeURIComponent(base + "/__profile")}${flags}`;
};
const NEWTAB = argv.includes("--new-tab");   // the old behaviour: a fresh tab per run
const results = [];
let run = 0, lost = true;                    // `lost`: nobody is navigating for us, so launch
for (const q of QUEUE) {
  const { mode, c } = q;
  current = ++run;
  const got = new Promise((r) => { resolveReport = r; });
  if (lost || NEWTAB) {
    lost = false;
    execFileSync("xcrun", ["devicectl", "device", "process", "launch", "--device", REAL, "--terminate-existing", "--payload-url", urlFor(run - 1), "com.apple.mobilesafari"], { stdio: "ignore", timeout: 60000 });
  }
  const out = await Promise.race([got, new Promise((r) => setTimeout(() => r({ error: "no report within 180 s" }), 180000))]);
  if (out.error) lost = true;                // the chain broke: the next run opens its own tab
  const p = out.paints ?? {};
  const row = { app: q.app, stim: q.stim, mode, run, error: out.error ?? null, paints: p.n, full: p.full, partial: p.partial, area: p.n ? p.area / p.n : null, paintMs: p.ms, gaps: out.gaps, settleMs: out.win?.settleMs, ms: out.ms, dpr: out.dpr, viewport: out.viewport };
  results.push(row);
  console.log(`${String(run).padStart(3)} ${c.padEnd(18)} ${String(mode).padEnd(4)} ${row.error ?? `paints ${p.n} (${p.full} full) area ${row.area == null ? "?" : (100 * row.area).toFixed(0)}% · paint JS ${p.ms?.toFixed(0)} ms · frames ${out.gaps?.n} p50 ${out.gaps?.p50?.toFixed(1)} p95 ${out.gaps?.p95?.toFixed(1)} >20 ${out.gaps?.over20} >33 ${out.gaps?.over33} · viewport ${out.viewport?.join("x")}@${out.dpr}`}`);
}
httpServer.close();
mkdirSync(path.join(HERE, "results"), { recursive: true });
const file = path.join(HERE, "results", `damage-device-${Date.now()}.json`);
writeFileSync(file, JSON.stringify({ device: REAL, results }, null, 2));
console.log(`\nstale-tab requests answered empty: ${stale}\n${file}`);
const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
console.log("\ncase               mode  paintJS  frames  p95   >20  >33  full/paints");
for (const c of CASES) for (const mode of MODES) {
  const rs = results.filter((r) => `${r.app}:${r.stim}` === c && r.mode === mode && !r.error);
  if (!rs.length) continue;
  console.log(`${c.padEnd(18)} ${mode.padEnd(4)} ${avg(rs.map((r) => r.paintMs)).toFixed(0).padStart(7)} ${avg(rs.map((r) => r.gaps.n)).toFixed(0).padStart(7)} ${avg(rs.map((r) => r.gaps.p95)).toFixed(1).padStart(5)} ${avg(rs.map((r) => r.gaps.over20)).toFixed(1).padStart(5)} ${avg(rs.map((r) => r.gaps.over33)).toFixed(1).padStart(4)}  ${avg(rs.map((r) => r.full)).toFixed(0)}/${avg(rs.map((r) => r.paints)).toFixed(0)}`);
}
process.exit(0);
