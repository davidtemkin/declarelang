// static-serve — the tree served the way a static host serves it: files, an
// index.html for a directory, 404 for everything else. No /compile, no program
// synthesis, no compression tricks. This is the shape a deploy has (GitHub
// Pages, S3, nginx), and the only shape where the service worker, the
// in-browser compiler and the pre-warm tier are the ones doing the work.
//
//   node mac-host/profile/static-serve.mjs [--port 8211]
//
// It logs what it sends, biggest first, so a page's real cost is visible.
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const argv = process.argv.slice(2);
const PORT = Number(argv[argv.indexOf("--port") + 1]) || 8211;
const MIME = {
  ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".mjs": "text/javascript;charset=utf-8",
  ".json": "application/json", ".css": "text/css;charset=utf-8", ".declare": "text/plain;charset=utf-8",
  ".txt": "text/plain;charset=utf-8", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".md": "text/markdown;charset=utf-8",
};
// A static host compresses text and leaves binary alone — which is why the
// kernel ships as .wasm.txt (7.3 KB gzipped here, 17.1 KB as .wasm).
const compressible = (type) => /^(text|application\/(javascript|json))/.test(type);

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { res.writeHead(400); return res.end("bad request"); }
  let fp = path.join(ROOT, rel);
  if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end("forbidden"); }
  try {
    const st = fs.statSync(fp);
    if (st.isDirectory()) fp = path.join(fp, "index.html");
    let body = fs.readFileSync(fp);
    const type = MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream";
    const headers = { "content-type": type, etag: `"${st.size}-${Number(st.mtimeMs).toString(36)}"` };
    if (compressible(type) && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
      body = zlib.gzipSync(body);
      headers["content-encoding"] = "gzip";
    }
    res.writeHead(200, headers);
    res.end(body);
    if (body.length > 40000) console.log(`  ${(body.length / 1024).toFixed(0).padStart(5)} KB  ${rel}`);
  } catch { res.writeHead(404); res.end("not found"); }
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`static host  http://127.0.0.1:${PORT}/`);
  console.log(`  homepage   http://127.0.0.1:${PORT}/`);
  console.log(`  calendar   http://127.0.0.1:${PORT}/apps/calendar/`);
  console.log(`  weather    http://127.0.0.1:${PORT}/apps/weather/`);
  console.log(`  (add ?warm=1 to any of them to opt back into the boot-time compiler fetch)`);
  console.log(`\nlogging every response over 40 KB:`);
});
