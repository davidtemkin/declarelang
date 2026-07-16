// serve.mjs — compile + serve ONE benchmark app, reusing the distro's compiler + runtime.
// Lives OUTSIDE the distro; the distro stays pristine. Supports ?profile / ?debug so the
// LZX profiler builds (lfc-profile.js) can be loaded for benchmarking.
//
//   node serve.mjs <app-dir> <main.lzx> [port=8096]
//   e.g. node serve.mjs ../apps/calendar cal-bench.lzx 8096   → http://localhost:8096/

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { DISTRO } from "./distro.mjs";          // which toolchain to measure (pinned to 5.0)

const { compileApp, RUNTIME } = await import(DISTRO + "/server/compile.mjs");
const { wrapperFor } = await import(DISTRO + "/server/wrapper.mjs");

const APPDIR = path.resolve(process.argv[2] || ".");
const MAIN = process.argv[3] || "main.lzx";                  // the main .lzx file (relative to APPDIR)
const PORT = parseInt(process.argv[4] || "8096", 10);
const MAIN_ABS = path.join(APPDIR, MAIN);
const MAIN_URL = "/" + MAIN;
const MAIN_JS = MAIN_URL + ".js";

const MIME = { ".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".html":"text/html",
  ".xml":"text/xml",".lzx":"text/xml",".json":"application/json",".png":"image/png",".gif":"image/gif",
  ".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml",".ico":"image/x-icon",
  ".ttf":"font/ttf",".otf":"font/otf",".woff":"font/woff",".woff2":"font/woff2",".properties":"text/plain",
  ".mp3":"audio/mpeg",".swf":"application/octet-stream" };
const mime = (p) => (MIME[path.extname(p).toLowerCase()] || "application/octet-stream") + ";charset=utf-8";
const file = (res, abs) => fs.stat(abs, (e, st) => {
  if (e || st.isDirectory()) { res.writeHead(404); return res.end("404 " + abs); }
  res.writeHead(200, { "Content-Type": mime(abs), "Cache-Control": "no-cache", "Content-Length": st.size });
  fs.createReadStream(abs).pipe(res);
});

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);
  const accept = req.headers["accept"] || "";

  // app navigation → the HTML wrapper that boots the app (carries ?profile/?debug flags).
  // "/" boots the configured MAIN; any other "/<name>.lzx" boots that file (so a single
  // server can host several bench variants side by side, e.g. cal-bench vs cal-bench-eager).
  if (p === "/" || (p.endsWith(".lzx") && accept.includes("text/html"))) {
    const navUrl = p === "/" ? MAIN_URL : p;
    const navAbs = path.normalize(path.join(APPDIR, navUrl));
    if (!navAbs.startsWith(APPDIR)) { res.writeHead(403); return res.end("forbidden"); }
    const r = wrapperFor(navUrl, navAbs, url.searchParams);
    if (r.unsupported) { res.writeHead(200, {"Content-Type":"text/html"}); return res.end("<pre>UNSUPPORTED: "+r.unsupported+"</pre>"); }
    res.writeHead(200, { "Content-Type":"text/html;charset=utf-8", "Cache-Control":"no-cache" });
    return res.end(r.html);
  }
  // compile any "/<name>.lzx.js", honoring profile/debug/backtrace (so the profiler build loads).
  if (p.endsWith(".lzx.js")) {
    const mainAbs = path.normalize(path.join(APPDIR, p.slice(0, -3)));   // strip ".js"
    if (!mainAbs.startsWith(APPDIR)) { res.writeHead(403); return res.end("forbidden"); }
    const q = url.searchParams;
    const profile = (q.get("profile") ?? q.get("lzprofile")) !== null && (q.get("profile") ?? q.get("lzprofile")) !== "false";
    const bt = (q.get("backtrace") ?? q.get("lzbacktrace"));
    const backtrace = bt !== null && bt !== "false";
    const debug = backtrace || ((q.get("debug")) !== null && q.get("debug") !== "false");
    let r; try { r = compileApp(mainAbs, { profile, debug, backtrace }); }
    catch (e) { res.writeHead(500); return res.end("compile error: " + e.message); }
    if (r.unsupported) { res.writeHead(200, {"Content-Type":"text/javascript"}); return res.end('console.error("UNSUPPORTED: '+r.unsupported+'")'); }
    res.writeHead(200, { "Content-Type":"text/javascript;charset=utf-8", "Cache-Control":"no-cache", "ETag":'"'+r.tag+'"' });
    return res.end(r.js);
  }
  // LFC runtime (all variants) + serverroot component/font assets → from the distro.
  if (p.startsWith("/runtime/")) return file(res, path.join(RUNTIME, p.slice("/runtime/".length)));
  if (p.includes("/lps/resources/")) return file(res, path.join(RUNTIME, p.replace(/^.*\/lps\/resources\//, "").replace(/^lps\//, "")));
  // everything else → the app's own resources (images, data, fonts, …)
  const abs = path.normalize(path.join(APPDIR, p));
  if (!abs.startsWith(APPDIR)) { res.writeHead(403); return res.end("forbidden"); }
  file(res, abs);
}).listen(PORT, () => console.log(`bench app '${MAIN}' from ${APPDIR} → http://localhost:${PORT}/`));
