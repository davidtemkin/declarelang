// server/index.mjs — the Declare dev server.
//
// Two jobs, nothing else (no chat, no persistent connection, no data API):
//   1. serve the distro tree statically   (compiler/dist, runtime/dist, examples, docs, …)
//   2. turn a PROGRAM-URL navigation (…/<name>.declare) into a run page that
//      compiles ON REQUEST and renders it — the SAME address the static host's
//      service worker runs (browse-to-run). Directories carry NO behavior.
//
//   npm start                                   # http://127.0.0.1:8200/  (the homepage)
//   /examples/neocalendar/neocalendar.declare   # run it (DOM backend)
//   …?render=canvas                             # Canvas backend
//   …?view=source | ?view=reader | ?view=seo    # source / reader / crawler views
//   /examples/<name>/prod                       # the discrete, self-contained declarec build
//
// The SAME tree also hosts statically for in-browser compilation (see
// service-worker.js). This server is just the dynamic-compilation convenience for
// local iteration — compile-on-request, so an edit + reload shows immediately.

import http from "node:http";
import path from "node:path";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { compile, isUpToDate, diskProbe, extractFromCompiled, seoDocument } from "../compiler/dist/compile-node.js";
import { highlight } from "../compiler/dist/highlight.js";
import { requestType, REQ } from "../compiler/dist/reqtypes.js";
import { writeProduction } from "../tools/declarec.mjs";
import { parseFlags, DEFAULT_FLAGS } from "../compiler/dist/flags.js";
import { rebuildStale } from "../tools/bundle-freshness.mjs";

// The compiler's extracted constraint deps (design/constraints.md §5) now ride
// in the ONE compile() result (`r.deps`) — a walk-order list the browser zips
// onto its re-parse so the dev app boots on the static-constraint path, exactly
// as the prod bundle and the in-browser compile do. No separate extraction here.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = path.join(ROOT, "examples");
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
  ".declare": "text/plain; charset=utf-8",   // a FETCHED program is its source bytes (a navigation runs it)
};
const mime = (p) => MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream";

// an example is any examples/<name>/ that contains <name>.declare
const examples = () =>
  existsSync(EXAMPLES)
    ? readdirSync(EXAMPLES).filter((n) => existsSync(path.join(EXAMPLES, n, `${n}.declare`)))
    : [];

const esc = (s) => s.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));

// The SW is a static-hosting capability; under this server it is redundant and would
// cache-fight the edit loop. So every HTML page the server emits carries a marker that
// makes boot-uniform's registerServiceWorker() short-circuit (browser/register-sw.js).
// A dumb static host serves pages VERBATIM (no marker) → the SW registers there, where it
// is the only way to browse-to-run. This is OL5's index.html mechanism: the presence of the
// server is the signal, injected as a variable — no localhost-sniffing. Placed before the
// first module script so it runs first; SEO documents (no scripts) never get it.
const SERVER_MARKER = '<script>window.__declareServer=true</script>\n';
function withServerMarker(html) {
  const s = typeof html === "string" ? html : html.toString("utf8");
  const i = s.indexOf('<script type="module"');
  if (i >= 0) return s.slice(0, i) + SERVER_MARKER + s.slice(i);
  const b = s.search(/<\/body>/i);
  if (b >= 0) return s.slice(0, b) + SERVER_MARKER + s.slice(b);
  return s + SERVER_MARKER;
}

// A request-type READER / SEGMENTS view (reqtypes.ts) for one .declare file:
// invoke the compiler's highlight() and either hand back the segments as JSON
// (SEGMENTS) or serve the code-viewer app seeded with them (READER 'reader'
// mode; the EXACT bytes are ?view=source, served by the callers directly). `relPath`
// is the file's tree-relative path, used for the JSON's `path` and the page title.
function serveSource(res, absPath, relPath, rt, backendClass) {
  let source;
  try { source = readFileSync(absPath, "utf8"); }
  catch { return send(res, 404, "not found: " + relPath, "text/plain"); }
  let segments;
  try { segments = highlight(source); }
  catch (e) { return send(res, 500, String((e && e.message) || e), "text/plain"); }
  if (rt === REQ.SEGMENTS)
    return send(res, 200, JSON.stringify({ path: relPath, segments }), "application/json");
  // EDIT = the same viewer page opened on its live-edit tab (seeds.__mode__).
  return send(res, 200, withServerMarker(sourcePage(relPath, segments, source, backendClass, rt === REQ.EDIT ? "edit" : "")));
}

// The code-viewer app (examples/codeviewer) booted for ONE source file: the
// server has already run highlight(), so it seeds the segments through the host→
// app channel (cfg.seeds → app.demoSources) — the viewer is a plain consumer, no
// bespoke wiring. The viewer renders prose segments as Markdown and code segments
// as coloured <pre> (its own accents map themes them), plus size + light/dark
// controls. So `foo.declare?view=reader` is a live, self-contained source page.
function sourcePage(relPath, segments, rawSource, backendClass, mode = "") {
  const dir = path.join(EXAMPLES, "codeviewer");
  const src = readFileSync(path.join(dir, "codeviewer.declare"), "utf8");
  const r = compile(src, { originDir: dir });
  if (r.errors.length) {
    return `<!doctype html><meta charset="utf-8"><title>codeviewer — compile errors</title>
<pre style="color:#c33;font:13px/1.5 ui-monospace,monospace;padding:20px;white-space:pre-wrap">${
      esc(r.report)}</pre>`;
  }
  const title = relPath.split("/").pop();
  const cfg = {
    backend: backendClass, source: r.source, deps: r.deps,
    // __source__ = the highlight() segments (JSON); __raw__ = the verbatim source
    // (for the plain-text toggle — segments can't reconstruct it faithfully);
    // __path__ = the file shown. The viewer reads them off app.demoSources.
    seeds: { __source__: JSON.stringify(segments), __raw__: rawSource, __path__: relPath, __mode__: mode },
  };
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)} — source</title>
<base href="/examples/codeviewer/">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
import { bootHost } from "/browser/host-client.js";
const cfg = ${JSON.stringify(cfg)};
cfg.compile = async (s) => { try { const r = await (await fetch("/compile", { method: "POST", body: s })).json(); return r.source ? { source: r.source, deps: r.deps } : { report: r.report || "compile failed" }; } catch (e) { return null; } };
bootHost(cfg);
</script>`;
}

// The static-extraction document (`?view=seo`, reqtypes.ts): the program's
// content as semantic HTML at its t=0 snapshot (design/capabilities.md §5) —
// compiled through THE compiler API, executed headlessly, served text/html.
// The SW static host serves the same artifact by extracting IN-BROWSER
// (browser/boot-seo.js) — one extractor module, two hosts.
function serveSeo(res, absPath, relPath, flags) {
  let source;
  try { source = readFileSync(absPath, "utf8"); }
  catch { return send(res, 404, "not found: " + relPath, "text/plain"); }
  // Compile through THE front-end (auto-include host and all), then extract from
  // that result — the SAME compile the running app gets, so a library component
  // (Bar, Field, …) resolves in the crawler view exactly as it does live.
  const compiled = compile(source, { originDir: path.dirname(absPath), typecheck: flags.typecheck });
  if (compiled.source === null) return send(res, 422, compiled.report, "text/plain; charset=utf-8");
  return send(res, 200, seoDocument(extractFromCompiled(compiled), relPath.split("/").pop()));
}

const send = (res, code, body, type) => {
  res.writeHead(code, { "content-type": type ?? "text/html; charset=utf-8" });
  res.end(body);
};

// Serve a file from an arbitrary base dir (the React build lives outside ROOT),
// with the same no-escape guard as the main static branch.
/** The RUN wrapper for a program URL — the same page the service worker
 *  serves for a `.declare` navigation on a static host (service-worker.js
 *  hostPageResponse; keep the two in step): a minimal shell that boots the ONE
 *  platform bundle with `main` = the program's own URL. The page's address IS
 *  the .declare, so every relative reference (data/, demos/) resolves against
 *  the program's directory for free — and boot-uniform gives the compile the
 *  cached-output + closure-freshness path, identical to the app index pages. */
function declareRunPage(urlPath, flags = DEFAULT_FLAGS) {
  const name = urlPath.replace(/.*\//, "").replace(/\.declare$/, "");
  // The `seo` FLAG (flags.ts, distinct from the ?view=seo REQUEST TYPE): embed
  // the extracted static document in the host element, for crawlers that read
  // the page without running it. The boot path removes #declare-static before
  // the app mounts (browser/host-client.js), so a running user never sees it.
  let staticBlock = "";
  if (flags.seo) {
    try {
      const abs = path.join(ROOT, urlPath.replace(/^\/+/, ""));
      const compiled = compile(readFileSync(abs, "utf8"), { originDir: path.dirname(abs), typecheck: flags.typecheck });
      const h = compiled.source === null ? null : extractFromCompiled(compiled);
      if (h !== null) staticBlock = `<div id="declare-static">\n${h}\n</div>`;
    } catch (e) { console.error("seo embed failed:", e.message); }
  }
  return `<!doctype html><meta charset="utf-8">
<title>${esc(name)} · Declare</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<style>html,body{margin:0;padding:0;background:#0B141B}</style>
<div id="host">${staticBlock}</div>
<script type="module">
  import boot from "/bundles/declare-boot.js";
  const q = new URLSearchParams(location.search);
  boot({ main: location.pathname, backend: q.get("render") === "canvas" ? "CanvasBackend" : undefined });
</script>`;
}

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

const prodMem = new Map(); // `${name}:${backend}:${slim}` -> manifest
async function ensureProdBuild(name, backend = "dom", slim = true) {
  const dir = path.join(EXAMPLES, name);
  const srcPath = path.join(dir, `${name}.declare`);
  if (!existsSync(srcPath)) return null;
  const source = readFileSync(srcPath, "utf8");
  // slim on/off (and the backend) partition the cache — each variant is a distinct
  // artifact and must not clobber another under one key.
  const key = `${name}:${backend}:${slim ? "slim" : "full"}`;
  const outDir = path.join(dir, ".prod-cache" + (backend === "canvas" ? "-canvas" : "") + (slim ? "" : "-full"));
  const manPath = path.join(outDir, "manifest.json");
  // Freshness is the build's CLOSURE (closure.ts, the OL5 model): the main
  // file, every include, every auto-included library file — re-probed on disk
  // — plus the frozen build props (backend/slim/toolchain), so an edit to an
  // `include`d file, a flag change, or a compiler rebuild each invalidate
  // exactly like a main-file edit. (The old sha256-of-main-source key missed
  // everything but the main file.)
  // `render` (not the retired `backend` spelling) — the closure freezes the
  // canonical flag names (buildProduction's props), and isUpToDate compares
  // records: a mismatched KEY would read as perpetual staleness. `seo` rides
  // for the same reason (the /prod route doesn't build seo pages; declarec
  // --seo closures carry seo:"true" and so never collide with these).
  const propsNow = {
    render: backend, slim: String(slim), stripPos: "true", typecheck: "true", seo: "false",
    toolchain: toolchainFingerprint(),
  };
  const fresh = (m) => {
    if (!m || !m.closure || !existsSync(path.join(outDir, m.appName))) return false;
    try { return isUpToDate(m.closure, propsNow, diskProbe); } catch { return false; }
  };
  let man = prodMem.get(key);
  if (fresh(man)) return man;                                   // in-process hit
  if (existsSync(manPath)) {                                    // disk hit (post-restart)
    try { const d = JSON.parse(readFileSync(manPath, "utf8")); if (fresh(d)) { prodMem.set(key, d); return d; } } catch { /* rebuild */ }
  }
  const built = await writeProduction({ source, name, srcDir: dir, outDir, render: backend, slim, props: { toolchain: propsNow.toolchain } });  // miss → build
  if (!built.ok) return { error: built.errors, report: built.report };
  man = { closure: built.closure, dir: outDir, appName: built.appName, sizes: built.sizes, assets: built.assets, used: built.usedComponents, builtAt: Date.now() };
  writeFileSync(manPath, JSON.stringify(man, null, 2));
  prodMem.set(key, man);
  return man;
}

async function serveProd(res, name, rest, urlPath, backend = "dom", slim = true) {
  const man = await ensureProdBuild(name, backend, slim);
  if (man === null) return send(res, 404, "no such example", "text/plain");
  if (man.error) return send(res, 500, "declarec build failed:\n" + (man.report ?? man.error.map((e) => e.message).join("\n")), "text/plain");
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
  // Returns the ONE compile result — { source, deps, diagnostics, report } —
  // nothing projected or re-shaped, so a wire consumer sees exactly what a Node
  // caller sees: each diagnostic structured (code/severity/phase/pos/hint) AND
  // carrying its `rendered` form; `report` is the whole compile rendered.
  // Compile flags ride the query under their canonical names (flags.ts):
  // POST /compile?typecheck runs the tsc-over-bodies pass.
  if (req.method === "POST" && p === "/compile") {
    const flags = parseFlags(new URL(req.url, "http://x").searchParams, DEFAULT_FLAGS);
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 4e6) req.destroy(); });
    req.on("end", () => {
      let out;
      try {
        const r = compile(body, { typecheck: flags.typecheck });
        out = { source: r.source, deps: r.deps, diagnostics: r.diagnostics, report: r.report };
      } catch (e) {
        // A compiler CRASH, not a compile diagnostic — no code to fake; the
        // report carries the truth and `diagnostics` stays empty.
        const message = String((e && e.message) || e);
        out = { source: null, diagnostics: [], report: message };
      }
      send(res, 200, JSON.stringify(out), "application/json");
    });
    return;
  }

  // (The previews and the whole-page editor render their child apps INLINE now —
  // embedded neo apps in the same document, no iframe — so the old /_demoframe and
  // /_demorun preview-frame routes are gone. See browser/host-client.js.)

  try {
    // ── React re-implementation (site-react/dist), self-prefixed under /site-react/ ──
    if (p === "/site-react" || p === "/site-react/") return serveFrom(res, SITE_REACT, "index.html");
    if (p.startsWith("/site-react/")) return serveFrom(res, SITE_REACT, p.slice("/site-react/".length));

    // The homepage — the ONE curated HTML entry. It boots the platform bundle,
    // which registers the SW (static host only) and runs the homepage app via the
    // canonical prewarm → cache → lazy-compile ladder (browser/boot-uniform.js).
    if (p === "/") {
      const idx = path.join(ROOT, "index.html");
      if (existsSync(idx)) return send(res, 200, withServerMarker(readFileSync(idx, "utf8")));
      return send(res, 404, "not found", "text/plain");
    }

    // /examples/<name>/prod[/...]  → the cached PRODUCTION build (declarec, DOM)
    // /examples/<name>/prod-canvas[/...]  → same, Canvas backend
    const prod = p.match(/^\/examples\/([^/]+)\/prod(-canvas)?(\/.*)?$/);
    if (req.method === "GET" && prod && examples().includes(prod[1])) {
      // URL query flags (flags.ts, the shared model): `?slim=0` ships the full
      // registry, `?render=canvas` overrides the path's default. So a prod URL
      // reads the same flags the CLI and browser do.
      const q = new URL(req.url, "http://x").searchParams;
      const flags = parseFlags(q, { ...DEFAULT_FLAGS, prod: true });
      const backend = prod[2] ? "canvas" : flags.render;
      serveProd(res, prod[1], prod[3] ?? "", p, backend, flags.slim).catch((e) => {
        if (!res.headersSent) send(res, 500, String((e && e.stack) || e), "text/plain");
      });
      return;
    }

    // ── The PROGRAM URL is the app's canonical address (the OpenLaszlo model:
    // …/calendar.lzx?lzt=…) — identical here and on the SW static host.
    //   NAVIGATE to …/app.declare            → the running app (default view)
    //   …?view=source                        → the EXACT source file (bytes)
    //   …?view=reader / ?view=segments       → the reader (highlighted, literate
    //                                          "reader mode") / its data
    //   FETCH the same URL (compiler include, viewer, curl) → the source bytes
    // The navigate/fetch split is the SAME discrimination the service worker
    // makes (a top-level navigation vs a subresource request), so a person and
    // a program each get the representation they mean, at one URL.
    if (p.endsWith(".declare")) {
      const params = new URL(req.url, "http://x").searchParams;
      const rt = requestType(params);
      const abs = path.join(ROOT, p.replace(/^\/+/, ""));
      const real = abs.startsWith(ROOT + path.sep) && existsSync(abs) && statSync(abs).isFile();
      if (real && (rt === REQ.READER || rt === REQ.EDIT || rt === REQ.SEGMENTS)) {
        return serveSource(res, abs, p.replace(/^\/+/, ""), rt, "DomBackend");
      }
      // ?view=seo answers FETCHES too (curl, a crawler's plain GET) — the
      // request type IS the discrimination; no navigate check needed.
      if (real && rt === REQ.SEO) return serveSeo(res, abs, p.replace(/^\/+/, ""), parseFlags(params));
      const navigate = req.headers["sec-fetch-mode"] === "navigate" || (req.headers.accept ?? "").includes("text/html");
      if (real && navigate && rt !== REQ.SOURCE) return send(res, 200, withServerMarker(declareRunPage(p, parseFlags(params))), "text/html;charset=utf-8");
      // else (?view=source, or any plain fetch): fall through to the raw-file
      // handler — the exact source bytes, text/plain
    }

    // A platform BUNDLE requested → rebuild it first if any of its inputs is
    // newer (tools/bundle-freshness.mjs — the same rule the pre-commit hook
    // enforces). This is what makes ONE page path viable in dev: the pages
    // always import bundles/declare-boot.js, and an edit to the runtime or
    // web client is picked up on the next refresh — no manual rebundle, no
    // stale artifact, ever. Synchronous on purpose (a boot rebundle is
    // sub-second; a compiler rebundle a few seconds, once per compiler change).
    if (p === "/bundles/declare-boot.js" || p === "/bundles/declare-compiler.js") {
      try { rebuildStale(ROOT, { only: [p.slice(1)] }); } catch (e) { console.error("bundle rebuild failed:", e.message); }
    }

    // otherwise: a static file inside the tree
    const abs = path.join(ROOT, p.replace(/^\/+/, ""));
    if (!(abs === ROOT || abs.startsWith(ROOT + path.sep))) return send(res, 403, "forbidden", "text/plain");
    if (existsSync(abs) && statSync(abs).isFile()) {
      // Committed HTML (the homepage index.html) boots the platform bundle → gets
      // the no-SW marker like the generated run pages.
      if (abs.endsWith(".html")) return send(res, 200, withServerMarker(readFileSync(abs, "utf8")));
      res.writeHead(200, { "content-type": mime(abs) });
      return res.end(readFileSync(abs));
    }
  } catch (e) {
    return send(res, 500, String((e && e.stack) || e), "text/plain");
  }
  send(res, 404, "not found", "text/plain");
}).listen(PORT, "127.0.0.1", () =>
  console.log(`Declare dev server → http://127.0.0.1:${PORT}/`));
