// serve-static.mjs — a zero-dependency static file server for the in-browser distro.
//
// Serves files, returns `index.html` for a directory request, and 404s anything missing
// — i.e. exactly what any real static host (S3, GitHub Pages, Cloudflare Pages, nginx)
// does. Handy for local testing; any static host serves the distro equally well.
//
//   node serve-static.mjs [root=.] [port=8087]
// then open http://localhost:8087/ — the Service Worker compiles LZX in-browser.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || ".");
const PORT = +(process.argv[3] || 8087);

const MIME = {
  ".html": "text/html;charset=utf-8", ".htm": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8", ".mjs": "text/javascript;charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".css": "text/css;charset=utf-8", ".lzx": "text/xml;charset=utf-8", ".xml": "text/xml;charset=utf-8",
  ".properties": "text/plain;charset=utf-8", ".txt": "text/plain;charset=utf-8",
  ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".m4v": "video/mp4",
};

http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { res.writeHead(400); return res.end("bad request"); }
  const fp = path.join(ROOT, pathname);
  // Block path traversal outside the root.
  if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end("forbidden"); }
  const serve = (file, st) => {
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    // Expose validators (mtime+size) like every real static host. Without these the
    // in-browser compiler's CacheStorage can't tell when a source file changed and keeps
    // serving STALE compiled output (e.g. an old explore-nav.lzx). GitHub Pages sends them.
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = {
      "Content-Type": type, "Cache-Control": "no-cache", "Accept-Ranges": "bytes",
      "Last-Modified": st.mtime.toUTCString(), "ETag": etag,
    };
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end(); }
    // Range support — required by HTML5 <video>/<audio> (the Video Library demo) for
    // seeking and reliable playback; real hosts (GitHub Pages) do this too.
    const range = req.headers["range"];
    const m = range && /^bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (isNaN(start)) start = 0;
      if (isNaN(end) || end >= st.size) end = st.size - 1;
      if (start > end || start >= st.size) {
        res.writeHead(416, { "Content-Range": `bytes */${st.size}`, "Accept-Ranges": "bytes" });
        return res.end();
      }
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, "Content-Length": st.size });
    fs.createReadStream(file).pipe(res);
  };
  const notFound = () => {
    // Hash routing keeps every shareable link on index.html, so deep/shared links never 404
    // and need no 404.html bootstrap on any host. A 404 here means a genuinely missing file.
    res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404 Not Found");
  };
  fs.stat(fp, (err, st) => {
    if (err) return notFound();
    if (st.isFile()) return serve(fp, st);
    if (st.isDirectory()) {                 // serve <dir>/index.html (real-host behavior); NEVER a listing
      const idx = path.join(fp, "index.html");
      return fs.stat(idx, (e2, s2) => (e2 || !s2.isFile()) ? notFound() : serve(idx, s2));
    }
    notFound();
  });
}).listen(PORT, () => console.error(`serving ${ROOT} at http://localhost:${PORT}/`));
