// server/index.mjs — the Declare dev server.
//
// Two jobs, nothing else (no chat, no persistent connection, no data API):
//   1. serve the distro tree statically   (compiler/dist, runtime/dist, examples, docs, …)
//   2. compile an example's .declare ON REQUEST and serve a host page that renders it
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
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { compile } from "../compiler/dist/compile-node.js";
import { writeProduction } from "../tools/declarec.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = path.join(ROOT, "examples");
// The sibling React build (site-compare/react/dist) — a second implementation of
// the SAME spec (site-compare/SPEC.md), served on this origin for comparison.
const COMPARE = path.resolve(ROOT, "..", "site-compare", "react", "dist");
// A React re-implementation of THIS homepage, built independently by observing the
// deployed site (not the .declare source). Lives inside the distro at site-react/,
// Vite-built with base "/site-react/" so every asset URL is self-prefixed — served
// on this origin so its live previews reach POST /compile and /runtime/dist.
const SITE_REACT = path.join(ROOT, "site-react", "dist");
const PORT = Number(process.env.PORT ?? process.argv[2] ?? 8200);

const MIME = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html",
  ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};
const mime = (p) => MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream";

// an example is any examples/<name>/ that contains <name>.declare
const examples = () =>
  existsSync(EXAMPLES)
    ? readdirSync(EXAMPLES).filter((n) => existsSync(path.join(EXAMPLES, n, `${n}.declare`)))
    : [];

const esc = (s) => s.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));

// The runtime's real shipping weight: runtime/dist bundled (tree-shaken),
// minified, gzipped ≈ 45 KB (measured with esbuild + gzip -9). The dev page
// loads it unbundled, so we compute the PRODUCTION figure here instead.
const RUNTIME_GZ_BYTES = 45 * 1024;

// compile examples/<name>/<name>.declare and wrap it in a render-host page
function hostPage(name, backendClass) {
  const dir = path.join(EXAMPLES, name);
  const src = readFileSync(path.join(dir, `${name}.declare`), "utf8");
  // Editable inline demos: each examples/<name>/demos/<demo>.declare is a full
  // app the page mounts (editable source + live-compiling preview) into a neo
  // slot marked `embed = "demo:<demo>:src|preview"`.
  const demoDir = path.join(dir, "demos");
  const demos = {};
  if (existsSync(demoDir)) for (const f of readdirSync(demoDir)) {
    if (f.endsWith(".declare")) demos[f.slice(0, -8)] = readFileSync(path.join(demoDir, f), "utf8");
  }
  const r = compile(src, { originDir: dir });
  if (r.errors.length) {
    return `<!doctype html><meta charset="utf-8"><title>${name} — compile errors</title>
<pre style="color:#c33;font:13px/1.5 ui-monospace,monospace;padding:20px;white-space:pre-wrap">${
      esc(r.errors.map((e) => e.message).join("\n"))}</pre>`;
  }
  // Real production figures the page displays: over-the-wire = runtime + this
  // page's compiled JS, gzipped; LOC = the Declare source, code lines only.
  const wireKB = Math.round((RUNTIME_GZ_BYTES + gzipSync(r.source).length) / 1024);
  const loc = src.split("\n").filter((l) => { const t = l.trim(); return t !== "" && !t.startsWith("//"); }).length;
  // Demo editor seeds — comment-stripped SERVER-side now (so the dynamic and the
  // static/precompiled host agree on the seed text), plus the page's own source.
  const stripComments = (s) => s.split("\n").filter((l) => !l.trim().startsWith("//"))
    .join("\n").replace(/^\s+/, "").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n";
  const seeds = {};
  for (const k in demos) seeds[k] = stripComments(demos[k]);
  seeds.__page__ = src;
  const cfg = { backend: backendClass, source: r.source, pageWeight: wireKB, sourceLines: loc, seeds };
  // The homepage gets a real page title; other examples keep the debug backend tag.
  const pageTitle = name === "site" ? "Declare — the UI language for the AI era" : `${name} (${backendClass})`;
  // <base> resolves the app's relative resources + data under the example. The client
  // is the shared web/host-client.js (one code path, dynamic + static); here compile()
  // delegates a live recompile to POST /compile.
  return `<!doctype html><meta charset="utf-8"><title>${pageTitle}</title>
<base href="/examples/${name}/">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
import { bootHost } from "/web/host-client.js";
const cfg = ${JSON.stringify(cfg)};
cfg.compile = async (s) => { try { return (await (await fetch("/compile", { method: "POST", body: s })).json()).source; } catch (e) { return null; } };
bootHost(cfg);
</script>`;
}

function landing() {
  const links = examples().map((n) =>
    `<li><a href="/examples/${n}/">${n}</a> &middot; <a href="/examples/${n}/canvas">canvas</a></li>`).join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Declare</title>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}
h1{font-weight:600;letter-spacing:-.01em}a{color:#3366cc;text-decoration:none}a:hover{text-decoration:underline}
li{margin:.35rem 0}</style>
<h1>Declare</h1>
<p>Dynamic-compilation dev server — each example compiles on request.</p>
<ul>${links || "<li><em>no examples yet</em></li>"}</ul>
<p style="margin-top:2rem"><a href="/docs/">docs</a> &middot; <a href="/design/">design notes</a></p>`;
}

const send = (res, code, body, type) => {
  res.writeHead(code, { "content-type": type ?? "text/html; charset=utf-8" });
  res.end(body);
};

// Serve a file from an arbitrary base dir (the React build lives outside ROOT),
// with the same no-escape guard as the main static branch.
function serveFrom(res, baseDir, rel) {
  const abs = path.join(baseDir, rel.replace(/^\/+/, ""));
  if (!(abs === baseDir || abs.startsWith(baseDir + path.sep))) return send(res, 403, "forbidden", "text/plain");
  if (existsSync(abs) && statSync(abs).isFile()) {
    res.writeHead(200, { "content-type": mime(abs) });
    return res.end(readFileSync(abs));
  }
  return send(res, 404, "not found", "text/plain");
}

// ── production builds (declarec), content-hash cached ────────────────────────
// GET /examples/<name>/prod/ runs the REAL precompiled + minified + bundled
// artifact `declarec` emits (parser + checker tree-shaken out) — the thing you
// deploy, not the unbundled dev modules. Built on first request and rebuilt ONLY
// when the source changes: a server-side cache keyed on the source hash (the
// lzc-style cache OpenLaszlo has). The disk manifest survives restarts; an
// in-process map is the fast path.
// Fingerprint the compiler + runtime dist so a rebuild of EITHER invalidates
// every cached production bundle — the source hash alone misses a runtime change
// (e.g. a backend tweak) that changes the emitted bytes. Cheap statSync over the
// dist .js mtimes; recomputed per request (dev traffic is low).
function toolchainFingerprint() {
  let acc = "";
  for (const dist of [path.join(ROOT, "runtime", "dist"), path.join(ROOT, "compiler", "dist")]) {
    if (!existsSync(dist)) continue;
    for (const f of readdirSync(dist)) if (f.endsWith(".js")) acc += f + statSync(path.join(dist, f)).mtimeMs + ";";
  }
  return createHash("sha256").update(acc).digest("hex").slice(0, 8);
}

const prodMem = new Map(); // `${name}:${backend}` -> manifest
async function ensureProdBuild(name, backend = "dom") {
  const dir = path.join(EXAMPLES, name);
  const srcPath = path.join(dir, `${name}.declare`);
  if (!existsSync(srcPath)) return null;
  const source = readFileSync(srcPath, "utf8");
  const hash = createHash("sha256").update(source + "|" + backend + "|" + toolchainFingerprint()).digest("hex").slice(0, 12);
  const outDir = path.join(dir, backend === "canvas" ? ".prod-cache-canvas" : ".prod-cache");
  const manPath = path.join(outDir, "manifest.json");
  const fresh = (m) => m && m.hash === hash && existsSync(path.join(outDir, m.appName));
  let man = prodMem.get(name);
  if (fresh(man)) return man;                                   // in-process hit
  if (existsSync(manPath)) {                                    // disk hit (post-restart)
    try { const d = JSON.parse(readFileSync(manPath, "utf8")); if (fresh(d)) { prodMem.set(name, d); return d; } } catch { /* rebuild */ }
  }
  const built = await writeProduction({ source, name, srcDir: dir, outDir, backend });  // miss → build
  if (!built.ok) return { error: built.errors };
  man = { hash, dir: outDir, appName: built.appName, sizes: built.sizes, assets: built.assets, builtAt: Date.now() };
  writeFileSync(manPath, JSON.stringify(man, null, 2));
  prodMem.set(name, man);
  return man;
}

async function serveProd(res, name, rest, urlPath, backend = "dom") {
  const man = await ensureProdBuild(name, backend);
  if (man === null) return send(res, 404, "no such example", "text/plain");
  if (man.error) return send(res, 500, "declarec build failed:\n" + man.error.map((e) => e.message).join("\n"), "text/plain");
  const tail = rest.replace(/^\/+/, "");
  if (tail === "" || tail === "index.html") {
    if (!urlPath.endsWith("/")) { res.writeHead(302, { location: urlPath + "/" }); return res.end(); }
    return serveFrom(res, man.dir, "index.html");
  }
  if (tail === "manifest.json") return send(res, 200, JSON.stringify(man.sizes, null, 2), "application/json");
  return serveFrom(res, man.dir, tail);
}

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { return send(res, 400, "bad request", "text/plain"); }

  // POST /compile — live compile (the playground / whole-page editor delegate
  // here; on localhost the round-trip is sub-100ms, so debounced it feels live).
  // Returns { source, errors:[{message,offset,line}] } — source null on failure.
  if (req.method === "POST" && p === "/compile") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 4e6) req.destroy(); });
    req.on("end", () => {
      let out;
      try {
        const r = compile(body, {});
        out = { source: r.source, errors: (r.errors ?? []).map((e) =>
          ({ message: e.message, offset: e.pos?.offset ?? null, line: e.pos?.line ?? null })) };
      } catch (e) {
        out = { source: null, errors: [{ message: String((e && e.message) || e), offset: null, line: null }] };
      }
      send(res, 200, JSON.stringify(out), "application/json");
    });
    return;
  }

  // (The previews and the whole-page editor render their child apps INLINE now —
  // embedded neo apps in the same document, no iframe — so the old /_demoframe and
  // /_demorun preview-frame routes are gone. See hostPage's renderChild/recompile.)

  try {
    // ── React comparison build (sibling site-compare/react/dist) ──────────
    // Served at its own /react/ URL, on this origin. Vite built it with the
    // default base "/", so its index.html asks for /assets/* at the root — we
    // map /assets/* to the React dist too (the Declare tree never uses a root
    // /assets, so there's no collision).
    if (p === "/react" || p === "/react/") return serveFrom(res, COMPARE, "index.html");
    if (p.startsWith("/assets/")) return serveFrom(res, COMPARE, p);

    // ── React re-implementation (site-react/dist), self-prefixed under /site-react/ ──
    if (p === "/site-react" || p === "/site-react/") return serveFrom(res, SITE_REACT, "index.html");
    if (p.startsWith("/site-react/")) return serveFrom(res, SITE_REACT, p.slice("/site-react/".length));

    if (p === "/") {
      const idx = path.join(ROOT, "index.html");
      if (existsSync(idx)) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(readFileSync(idx)); }
      return send(res, 200, landing());
    }

    // /examples/<name>/prod[/...]  → the cached PRODUCTION build (declarec, DOM)
    // /examples/<name>/prod-canvas[/...]  → same, Canvas backend
    const prod = p.match(/^\/examples\/([^/]+)\/prod(-canvas)?(\/.*)?$/);
    if (req.method === "GET" && prod && examples().includes(prod[1])) {
      const backend = prod[2] ? "canvas" : "dom";
      serveProd(res, prod[1], prod[3] ?? "", p, backend).catch((e) => {
        if (!res.headersSent) send(res, 500, String((e && e.stack) || e), "text/plain");
      });
      return;
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
  console.log(`Declare dev server → http://127.0.0.1:${PORT}/`));
