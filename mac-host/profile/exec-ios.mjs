// exec-ios — run the corpus on a real iOS device, in ONE Safari tab.
//
// The phone cannot be driven from here, so the page drives itself: it is opened
// with `?autocase=<name>&report=<url>`, fetches the case descriptor from this
// rig, performs it with the same executor Chrome and the Mac host use, POSTs
// the result, and is handed the NEXT url in the response — so the whole round
// runs in one tab. That matters for measurement, not tidiness: every extra tab
// holds its own canvases and caches against the next run.
//
// WHICH DEVICE. The phone, not the tablet (DT, 2026-09-20). It is the only
// device in this set that has ever found anything — the dirty-region threshold
// regression showed up on phone-sized canvases and nowhere else, because the
// Mac and the iPad both had enough headroom to hide it. The tablet's extra
// pixels only matter for the paint-area cases, which round 5 already covered.

import http from "node:http";
import path from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { BY_NAME } from "./cases.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);

/** This machine's LAN address — the phone has to reach it. */
export function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) if (ni.family === "IPv4" && !ni.internal) return ni.address;
  }
  throw new Error("no LAN address — the device cannot reach this machine");
}

/** Serve one tree, the case descriptors, and a collector.
 *
 *  `queue` is the whole round in order — [{ case, tree }] — so the page can be
 *  handed its next url as soon as it reports. Each url carries a `run` prefix
 *  the server strips: iOS Safari will otherwise answer a repeat navigation from
 *  its back/forward cache and the "run" would be a replay of the last one.
 */
export async function serveRound({ trees, queue, onResult, onHit }) {
  const servers = {};
  for (const [label, dir] of Object.entries(trees)) {
    const { createDeclareServer } = await import(path.join(dir, "server/create.mjs"));
    servers[label] = createDeclareServer({
      mountSpecs: [{ prefix: "/", dir }, { prefix: "/declare/", dir, platform: true }],
      mode: "distro",
    });
  }
  // one metered bundle per tree, named for it (build-runtime.mjs --web --root)
  const metered = {};
  for (const [label, dir] of Object.entries(trees)) {
    const tag = path.basename(dir).toLowerCase();
    const f = path.join(HERE, `../bundles/declare-boot.${tag}.profile.js`);
    if (!existsSync(f)) throw new Error(`no metered bundle for the ${label} tree — run:\n  node mac-host/profile/build-runtime.mjs --web --root ${dir}`);
    metered[label] = readFileSync(f);
  }

  const results = [];
  let at = 0;

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    // WHO IS ASKING. A phone that never reaches this machine and a phone that
    // reaches it and fails look identical from here — an empty results list —
    // so every request from off-box is logged. It is the difference between
    // "the device is on another network" and "the page loaded and broke".
    const from = req.socket.remoteAddress ?? "?";
    if (!/^(::1|127\.|::ffff:127\.)/.test(from)) onHit?.(from, req.method ?? "GET", u.pathname);
    // THE SHORT WAY IN. The first url carries the case, the tree prefix, the
    // report address and two encoded query strings — unreadable, and worse,
    // untypable on a phone. `/` sends the device to whatever run is next.
    if (u.pathname === "/" || u.pathname === "/start") {
      res.writeHead(302, { location: urlFor(Math.min(at, queue.length - 1)) });
      res.end();
      return;
    }
    if (u.pathname === "/__case") {
      const desc = BY_NAME[u.searchParams.get("name")];
      res.writeHead(desc ? 200 : 404, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(desc ?? { error: "no such case" }));
      return;
    }
    if (u.pathname === "/__profile" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      let out; try { out = JSON.parse(body); } catch { out = { error: "bad json" }; }
      out.tree = queue[at]?.tree ?? null;
      results.push(out);
      onResult?.(out, at, queue.length);
      at++;
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify({ next: at < queue.length ? urlFor(at) : null }));
      return;
    }
    // /r<N>/… — the cache-busting prefix; strip it and serve from that run's tree
    const m = u.pathname.match(/^\/r(\d+)(\/.*)$/);
    const idx = m ? Number(m[1]) : at;
    const label = queue[Math.min(idx, queue.length - 1)]?.tree ?? Object.keys(trees)[0];
    if (m) { req.url = m[2] + u.search; }
    // THE METERED BUNDLE, IN PLACE OF THE TREE'S OWN. In Chrome the rig
    // intercepts this request in the browser; the phone has no such hook, so
    // the substitution has to happen HERE — and without it the device gets the
    // ordinary runtime, which carries neither the meters nor the case executor.
    // `?autocase=` then reaches nothing at all, and the phone sits on a
    // perfectly working app that has been given no instructions. (This is what
    // the previous device rig did at damage-device.mjs's own bundle route; it
    // did not survive the move to a two-tree round.)
    if (/\/bundles\/declare-boot\.js(\?|$)/.test(req.url)) {
      const src = metered[label];
      if (src === undefined) { res.writeHead(500, { "content-type": "text/plain" }); res.end(`no metered bundle for ${label}`); return; }
      res.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" });
      res.end(src);
      return;
    }
    servers[label].handler(req, res);
  });
  await new Promise((r) => server.listen(0, "0.0.0.0", r));
  const base = `http://${lanAddress()}:${server.address().port}`;

  function urlFor(i) {
    const { case: name, tree, render = "canvas" } = queue[i];
    const desc = BY_NAME[name];
    const report = encodeURIComponent(`${base}/__profile`);
    return `${base}/r${i}/${desc.app}?render=${render}&autocase=${encodeURIComponent(name)}&report=${report}`;
  }

  return { base, first: urlFor(0), results, close: () => server.close(), total: queue.length };
}

/** One case on the device — used by round.mjs. The device round is not
 *  unattended end to end: the FIRST url has to be opened by hand on the phone,
 *  and DT is told rather than the rig pretending it can do it. */
export async function runCaseOnDevice() {
  throw new Error(
    "the iOS target runs as a whole round, not case by case — use:\n" +
    "  node mac-host/profile/round-ios.mjs --before … --after …\n" +
    "which prints one url to open on the phone and drives the rest from there");
}
