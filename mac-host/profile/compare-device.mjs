// compare-device — MAIN vs THIS TREE on a physical device, in ONE tab.
//
//   node mac-host/profile/compare-device.mjs --real <udid> [--cases app:stim:render,…] [--reps 1]
//
// Two servers, one per tree, each serving its own tree with its own metered boot bundle. A run reports, the rig
// answers with the NEXT run's URL (on whichever tree that run needs), and the page navigates itself there — so the
// whole round lives in one tab and no earlier run's memory sits alongside the measured one. Each tree's pages live
// under a per-run path prefix, and a stale tab asking for an old prefix gets an empty page.
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OPT = path.resolve(HERE, "../..");
// --base <tree>: the BEFORE tree (default main). A controlled baseline — main's
// runtime with this tree's apps and library — isolates runtime work from app drift.
const MAIN = process.argv.includes("--base") ? path.resolve(process.argv[process.argv.indexOf("--base") + 1]) : "/Users/temkin/Code/Declare";
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const REAL = flag("real", null), REPS = +flag("reps", "1");
const CASES = flag("cases", [
  "weather:resize:dom", "weather:city:dom", "desktop:seed:dom", "desktop:minimize:dom", "tracker:filter:dom",
  "calendar:mode:dom", "marketmap:slider:dom", "desktop:drag:dom", "desktop:openclose:dom", "desktop:menus:dom",
  "desktop:hover:dom", "tracker:hover:dom",
  "desktop:drag:canvas", "desktop:menus:canvas", "tracker:hover:canvas", "tracker:filter:canvas", "marketmap:slider:canvas",
].join(",")).split(",");
if (!REAL) { console.error("usage: compare-device.mjs --real <udid>"); process.exit(2); }
const lanIP = () => { for (const ifc of ["en0", "en1"]) { try { const ip = execFileSync("ipconfig", ["getifaddr", ifc], { encoding: "utf8" }).trim(); if (ip) return ip; } catch { /* next */ } } throw new Error("no LAN address"); };
const IP = lanIP();

const { createDeclareServer } = await import(path.join(OPT, "server/create.mjs"));
let current = -1, resolveReport = null, stale = 0;
const serve = async (root, bundlePath) => {
  const server = createDeclareServer({ mountSpecs: [{ prefix: "/", dir: root }, { prefix: "/declare/", dir: root, platform: true }], mode: "distro" });
  const src = readFileSync(bundlePath);
  const httpServer = http.createServer((req, res) => {
    const m = /^\/r(\d+)(\/.*)$/.exec(req.url);
    if (m !== null) {
      if (+m[1] !== current) { stale++; res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }); res.end("<!doctype html><title>stale run</title>"); return; }
      req.url = m[2];
    }
    if (req.method === "POST" && req.url.startsWith("/__profile")) {
      let body = ""; req.on("data", (c) => { body += c; }); req.on("end", () => {
        const out = JSON.parse(body);
        res.writeHead(200, { "access-control-allow-origin": "*", "content-type": "application/json" });
        res.end(JSON.stringify({ next: current < QUEUE.length ? urlFor(current) : null }));
        resolveReport?.(out);
      });
      return;
    }
    if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" }); res.end(); return; }
    if (/\/bundles\/declare-boot\.js(\?|$)/.test(req.url)) { res.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" }); res.end(src); return; }
    server.handler(req, res);
  }).on("upgrade", server.upgrade);
  await new Promise((r) => httpServer.listen(0, "0.0.0.0", r));
  return { httpServer, base: `http://${IP}:${httpServer.address().port}` };
};
const SERVERS = {
  main: await serve(MAIN, path.join(HERE, `../bundles/declare-boot.${path.basename(MAIN).toLowerCase()}.profile.js`)),
  opt: await serve(OPT, path.join(HERE, "../bundles/declare-boot.profile.js")),
};
console.log(`main ${SERVERS.main.base}\nopt  ${SERVERS.opt.base}`);

// the round, decided up front — both trees for each case, order alternating per rep so drift cancels
const QUEUE = [];
for (const c of CASES) {
  const [app, stim, render] = c.split(":");
  for (let r = 0; r < REPS; r++) for (const tree of (r % 2 === 0 ? ["main", "opt"] : ["opt", "main"])) QUEUE.push({ app, stim, render, tree, c });
}
const urlFor = (i) => {
  const q = QUEUE[i], base = `${SERVERS[q.tree].base}/r${i + 1}`;
  return `${base}/apps/${q.app}/${q.app}.declare?render=${q.render}&autoprofile=${q.stim}&report=${encodeURIComponent(base + "/__profile")}`;
};
const results = [];
let run = 0, lost = true;
for (const q of QUEUE) {
  current = ++run;
  const got = new Promise((r) => { resolveReport = r; });
  if (lost) { lost = false; execFileSync("xcrun", ["devicectl", "device", "process", "launch", "--device", REAL, "--terminate-existing", "--payload-url", urlFor(run - 1), "com.apple.mobilesafari"], { stdio: "ignore", timeout: 60000 }); }
  const out = await Promise.race([got, new Promise((r) => setTimeout(() => r({ error: "no report within 180 s" }), 180000))]);
  if (out.error) lost = true;
  const p = out.paints ?? {};
  const stages = out.perf?.stages ?? [];
  const at = (n, k) => stages.find((s) => s.name === n)?.[k];
  const startup = at("first-frame", "end") != null && at("render", "start") != null ? at("first-frame", "end") - at("render", "start") : null;
  results.push({ ...q, run, error: out.error ?? null, settleMs: out.win?.settleMs, settleN: out.win?.settleN, gaps: out.gaps, paints: p.n ?? null, paintMs: p.ms ?? null, full: p.full ?? null, startup, ms: out.ms, dpr: out.dpr, viewport: out.viewport });
  const r = results[results.length - 1];
  console.log(`${String(run).padStart(3)} ${q.c.padEnd(26)} ${q.tree.padEnd(4)} ${r.error ?? `settle ${r.settleMs?.toFixed(0)} ms (${r.settleN}) · p95 ${r.gaps?.p95?.toFixed(1)} · >33ms ${r.gaps?.over33} · startup ${startup?.toFixed(0) ?? "—"} ms${p.n ? ` · paints ${p.n} (${p.full} full) ${p.ms?.toFixed(0)} ms` : ""}`}`);
}
for (const s of Object.values(SERVERS)) s.httpServer.close();
mkdirSync(path.join(HERE, "results"), { recursive: true });
const file = path.join(HERE, "results", `compare-device-${Date.now()}.json`);
writeFileSync(file, JSON.stringify({ device: REAL, results }, null, 2));
console.log(`\nstale-tab requests answered empty: ${stale}\n${file}`);
process.exit(0);
