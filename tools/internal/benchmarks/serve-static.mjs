// serve-static.mjs — a DUMB static file server. NO compiler import, NO source mtime checks,
// NO on-demand compile: it serves the PRECOMPILED `<name>.lzx.js` + static `<name>.html`
// wrappers exactly as a CDN / `python -m http.server` would. This is the production "SOLO"
// deployment path — precompile once (see the precompile step), then serve bytes.
//
//   node serve-static.mjs [root=../apps] [port=8087]
//
// Routes: /runtime/* and /lps/resources/* → the distro runtime (read-only); everything else
// → files under <root> (so /calendar/cal-bench-eager.html and /dashboard/dashboard-bench.html
// both resolve, with their sibling .lzx.js + img/ + data/).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME } from "./distro.mjs";         // runtime/ from the pinned toolchain (5.0)

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || path.join(HERE, "../apps"));
const PORT = parseInt(process.argv[3] || "8087", 10);

const MIME = { ".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".html":"text/html",
  ".htm":"text/html",".xml":"text/xml",".lzx":"text/xml",".json":"application/json",".png":"image/png",
  ".gif":"image/gif",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml",".ico":"image/x-icon",
  ".ttf":"font/ttf",".otf":"font/otf",".woff":"font/woff",".woff2":"font/woff2",".properties":"text/plain",
  ".mp3":"audio/mpeg",".mp4":"video/mp4",".swf":"application/octet-stream" };
const mime = (p) => (MIME[path.extname(p).toLowerCase()] || "application/octet-stream") + ";charset=utf-8";

function sendFile(res, abs) {
  fs.stat(abs, (e, st) => {                         // a plain static stat (mtime → ETag), NO recompile
    if (!e && st.isDirectory()) return sendFile(res, path.join(abs, "index.html"));  // dir → index.html
    if (e) { res.writeHead(404); return res.end("404 " + abs); }
    const etag = '"' + st.size + "-" + (+st.mtimeMs).toString(36) + '"';
    res.writeHead(200, { "Content-Type": mime(abs), "Content-Length": st.size, "ETag": etag,
      "Cache-Control": "no-cache" });
    fs.createReadStream(abs).pipe(res);
  });
}

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  if (p.startsWith("/runtime/")) return sendFile(res, path.join(RUNTIME, p.slice("/runtime/".length)));
  if (p.includes("/lps/resources/")) return sendFile(res, path.join(RUNTIME, p.replace(/^.*\/lps\/resources\//, "").replace(/^lps\//, "")));
  const abs = path.normalize(path.join(ROOT, p));
  if (!abs.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  sendFile(res, abs);
}).listen(PORT, () => console.log(`STATIC (no-compile) root=${ROOT} → http://localhost:${PORT}/`));
