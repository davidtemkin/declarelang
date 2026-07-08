// server/index.mjs — the neolzx dev server.
//
// Two jobs, nothing else (no chat, no persistent connection, no data API):
//   1. serve the distro tree statically   (compiler/dist, runtime/dist, examples, docs, …)
//   2. compile an example's .neolzx ON REQUEST and serve a host page that renders it
//
//   npm start                         # http://127.0.0.1:8200/
//   /examples/neocalendar/            # DOM backend
//   /examples/neocalendar/canvas      # Canvas backend
//
// The SAME tree also hosts statically for in-browser compilation (see
// service-worker.js). This server is just the dynamic-compilation convenience for
// local iteration — compile-on-request, so an edit + reload shows immediately.

import http from "node:http";
import path from "node:path";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile } from "../compiler/dist/compile.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = path.join(ROOT, "examples");
const PORT = Number(process.env.PORT ?? process.argv[2] ?? 8200);

const MIME = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html",
  ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};
const mime = (p) => MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream";

// an example is any examples/<name>/ that contains <name>.neolzx
const examples = () =>
  existsSync(EXAMPLES)
    ? readdirSync(EXAMPLES).filter((n) => existsSync(path.join(EXAMPLES, n, `${n}.neolzx`)))
    : [];

const esc = (s) => s.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));

// compile examples/<name>/<name>.neolzx and wrap it in a render-host page
function hostPage(name, backendClass) {
  const dir = path.join(EXAMPLES, name);
  const r = compile(readFileSync(path.join(dir, `${name}.neolzx`), "utf8"), { originDir: dir });
  if (r.errors.length) {
    return `<!doctype html><meta charset="utf-8"><title>${name} — compile errors</title>
<pre style="color:#c33;font:13px/1.5 ui-monospace,monospace;padding:20px;white-space:pre-wrap">${
      esc(r.errors.map((e) => e.message).join("\n"))}</pre>`;
  }
  // <base> so the app's relative resources/… and data/… resolve under the example
  return `<!doctype html><meta charset="utf-8"><title>${name} (${backendClass})</title>
<base href="/examples/${name}/">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { renderAsync, ${backendClass} } from "/runtime/dist/index.js";
  window.__app = await renderAsync(${JSON.stringify(r.source)}, document.getElementById("host"), new ${backendClass}());
</script>`;
}

function landing() {
  const links = examples().map((n) =>
    `<li><a href="/examples/${n}/">${n}</a> &middot; <a href="/examples/${n}/canvas">canvas</a></li>`).join("\n");
  return `<!doctype html><meta charset="utf-8"><title>neolzx</title>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}
h1{font-weight:600;letter-spacing:-.01em}a{color:#3366cc;text-decoration:none}a:hover{text-decoration:underline}
li{margin:.35rem 0}</style>
<h1>neolzx</h1>
<p>Dynamic-compilation dev server — each example compiles on request.</p>
<ul>${links || "<li><em>no examples yet</em></li>"}</ul>
<p style="margin-top:2rem"><a href="/docs/">docs</a> &middot; <a href="/design/">design notes</a></p>`;
}

const send = (res, code, body, type) => {
  res.writeHead(code, { "content-type": type ?? "text/html; charset=utf-8" });
  res.end(body);
};

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { return send(res, 400, "bad request", "text/plain"); }

  try {
    if (p === "/") {
      const idx = path.join(ROOT, "index.html");
      if (existsSync(idx)) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(readFileSync(idx)); }
      return send(res, 200, landing());
    }

    // /examples/<name>/  or  /examples/<name>/canvas  → compile + render
    const m = p.match(/^\/examples\/([^/]+)\/(canvas)?$/);
    if (m && examples().includes(m[1])) {
      return send(res, 200, hostPage(m[1], m[2] ? "CanvasBackend" : "DomBackend"));
    }

    // otherwise: a static file inside the tree
    const abs = path.join(ROOT, p.replace(/^\/+/, ""));
    if (!(abs === ROOT || abs.startsWith(ROOT + path.sep))) return send(res, 403, "forbidden", "text/plain");
    if (existsSync(abs) && statSync(abs).isFile()) {
      res.writeHead(200, { "content-type": mime(abs) });
      return res.end(readFileSync(abs));
    }
  } catch (e) {
    return send(res, 500, String((e && e.stack) || e), "text/plain");
  }
  send(res, 404, "not found", "text/plain");
}).listen(PORT, "127.0.0.1", () =>
  console.log(`neolzx dev server → http://127.0.0.1:${PORT}/`));
