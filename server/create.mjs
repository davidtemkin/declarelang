// server/create.mjs — the Declare dev server as a FACTORY.
//
// server/index.mjs used to be the server. Now it is this factory's first caller,
// with every mount pointing at the distro (distro mode). The behavior there is
// byte-identical to before; everything new rides on the mount table
// (server/mounts.mjs) and a proxy (server/proxy.mjs).
//
// Two jobs, same as ever (no chat, no persistent connection, no data API):
//   1. serve the mounted trees statically
//   2. turn a PROGRAM-URL navigation (…/<name>.declare) into a run page — the
//      SAME address the static host's service worker runs (browse-to-run). The
//      page boots the platform bundle and compiles IN THE BROWSER; the Node
//      compiler runs for ?viewer=, ?extract, ?build, and POST /compile.
// The full request + modifier surface is docs/system-design/requests.md.
//
// createDeclareServer(config) → { handler, upgrade, mounts, proxy, buildCache }
//   handler(req, res)              — the http request listener
//   upgrade(req, socket, head)     — the WebSocket upgrade listener (proxy only)
// The caller owns the http.Server, so this same handler mounts inside another
// Node server unchanged (the "back end in front" topology, packaging-options §4b).

import path from "node:path";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { compile, isUpToDate, diskProbe, crawlExtract, diskDataResolver, crawlerDocument } from "../compiler/dist/compile-node.js";
import { highlight, lineMetrics } from "../compiler/dist/highlight.js";
import { requestType, REQ, runWrapper, programName, directoryProgram } from "../browser/serve-core.js";
import { writeProduction } from "../tools/declarec.mjs";
import { parseFlags, DEFAULT_FLAGS } from "../compiler/dist/flags.js";
import { rebuildStale } from "../tools/internal/bundle-freshness.mjs";
import { createMounts, describeMounts } from "./mounts.mjs";
import { createProxy } from "./proxy.mjs";
import { PLATFORM_DIR, defaultBuildCache } from "./config.mjs";

const MIME = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html",
  ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".declare": "text/plain; charset=utf-8",
};
const mime = (p) => MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream";
const esc = (s) => s.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));

const send = (res, code, body, type) => {
  res.writeHead(code, { "content-type": type ?? "text/html; charset=utf-8" });
  res.end(body);
};

export function createDeclareServer(config = {}) {
  const mounts = createMounts(config.mountSpecs ?? [
    { prefix: "/", dir: PLATFORM_DIR, name: "root" },
    { prefix: "/declare/", dir: PLATFORM_DIR, name: "platform", platform: true },
  ]);
  const proxy = createProxy(config.proxy ?? {});
  const buildCache = path.resolve(config.buildCache ?? defaultBuildCache());
  const watch = !!config.watch;
  const canRebuildBundles = config.mode !== "workspace";   // node_modules platform has no sources to rebuild

  // A proxied prefix must not shadow a declared mount — a startup check, so the
  // routing is unambiguous rather than order-dependent at request time.
  for (const r of proxy.routes)
    if (mounts.named.some((m) => r.prefix + "/" === m.prefix || m.prefix.startsWith(r.prefix + "/")))
      throw new Error(`proxy prefix ${r.prefix} shadows a mount; give them disjoint prefixes`);

  const PLAT = mounts.platformPrefix;                      // e.g. "/declare/"
  const platURL = (rel) => PLAT + rel;                     // platform asset → its URL
  const VIEWER_DIR = path.join(PLATFORM_DIR, "apps", "viewer");

  // ── the no-SW marker (unchanged) ───────────────────────────────────────────
  // Every HTML page the server emits carries a marker that short-circuits the
  // service worker's registration — under this server the SW is redundant and
  // would cache-fight the edit loop. A dumb static host serves pages verbatim
  // (no marker) → the SW registers there, where it is the only browse-to-run.
  const SERVER_MARKER = '<script>window.__declareServer=true</script>\n';
  function withServerMarker(html) {
    const s = typeof html === "string" ? html : html.toString("utf8");
    const i = s.indexOf('<script type="module"');
    if (i >= 0) return s.slice(0, i) + SERVER_MARKER + s.slice(i);
    const b = s.search(/<\/body>/i);
    if (b >= 0) return s.slice(0, b) + SERVER_MARKER + s.slice(b);
    return s + SERVER_MARKER;
  }

  // ── the VIEWER (reader / source / edit) ────────────────────────────────────
  function serveSource(res, absPath, relPath, rt, backendClass) {
    let source;
    try { source = readFileSync(absPath, "utf8"); }
    catch { return send(res, 404, "not found: " + relPath, "text/plain"); }
    let segments;
    try { segments = highlight(source); }
    catch (e) { return send(res, 500, String((e && e.message) || e), "text/plain"); }
    if (rt === REQ.SEGMENTS)
      return send(res, 200, JSON.stringify({ path: relPath, segments, metrics: lineMetrics(source) }), "application/json");
    const mode = rt === REQ.SOURCE ? "source" : rt === REQ.EDIT ? "edit" : "reader";
    return send(res, 200, withServerMarker(sourcePage(relPath, segments, source, backendClass, mode)));
  }

  function sourcePage(relPath, segments, rawSource, backendClass, mode = "") {
    const r = compile(readFileSync(path.join(VIEWER_DIR, "viewer.declare"), "utf8"), { originDir: VIEWER_DIR });
    if (r.errors.length) {
      return `<!doctype html><meta charset="utf-8"><title>viewer — compile errors</title>
<pre style="color:#c33;font:13px/1.5 ui-monospace,monospace;padding:20px;white-space:pre-wrap">${esc(r.report)}</pre>`;
    }
    const title = relPath.split("/").pop();
    const cfg = {
      backend: backendClass, source: r.source, deps: r.deps, location: mode,
      seeds: { __source__: JSON.stringify(segments), __raw__: rawSource, __path__: relPath,
        __metrics__: JSON.stringify(lineMetrics(rawSource)) },
    };
    // The editor's live recompile carries the file's own url as ?main= so the
    // Node compiler resolves includes and relative data against the file being
    // edited, not against nothing (the originDir fix, embeddable-server.md §7.1).
    const mainQuery = "/" + relPath.replace(/^\/+/, "");
    return `<!doctype html><meta charset="utf-8"><title>${esc(title)} — source</title>
<base href="${platURL("apps/viewer/")}">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
import { bootHost } from "${platURL("browser/host-client.js")}";
const cfg = ${JSON.stringify(cfg)};
const MAIN = ${JSON.stringify(mainQuery)};
cfg.compile = async (s) => { try { const r = await (await fetch("/compile?main=" + encodeURIComponent(MAIN), { method: "POST", body: s })).json(); return r.source ? { source: r.source, deps: r.deps } : { report: r.report || "compile failed" }; } catch (e) { return null; } };
bootHost(cfg);
</script>`;
  }

  // ── ?extract — the static-extraction document ──────────────────────────────
  async function serveExtract(res, absPath, relPath) {
    let source;
    try { source = readFileSync(absPath, "utf8"); }
    catch { return send(res, 404, "not found: " + relPath, "text/plain"); }
    const compiled = compile(source, { originDir: path.dirname(absPath) });
    if (compiled.source === null) return send(res, 422, compiled.report, "text/plain; charset=utf-8");
    let extracted;
    try {
      extracted = await crawlExtract(compiled.source, {
        deps: compiled.deps, links: compiled.links, data: diskDataResolver(path.dirname(absPath)),
      });
    } catch (e) {
      return send(res, 422, String((e && e.message) || e), "text/plain; charset=utf-8");
    }
    return send(res, 200, crawlerDocument(extracted.html, extracted.title || relPath.split("/").pop()));
  }

  // ── the RUN wrapper ────────────────────────────────────────────────────────
  // The SHARED shell (browser/serve-core.runWrapper), identical to the one the SW
  // serves for a .declare navigation. The only host-specific parts are the two
  // PARAMETERS serve-parity.test locks down — bootUrl and iconBase — now built
  // from the platform mount's prefix so a workspace app boots the platform from
  // /declare/ while its own resources resolve from /.
  async function declareRunPage(urlPath, flags = DEFAULT_FLAGS) {
    let staticBlock = "";
    let title = "";
    if (flags.crawler) {
      try {
        const hit = mounts.resolve(urlPath);
        const abs = hit ? hit.abs : null;
        if (abs && existsSync(abs)) {
          const compiled = compile(readFileSync(abs, "utf8"), { originDir: path.dirname(abs) });
          const ex = compiled.source === null ? null : await crawlExtract(compiled.source, {
            deps: compiled.deps, links: compiled.links, data: diskDataResolver(path.dirname(abs)),
          });
          if (ex !== null) { staticBlock = `<div id="declare-static">\n${ex.html}\n</div>`; title = ex.title; }
        }
      } catch (e) { console.error("crawler embed failed:", e.message); }
    }
    return runWrapper({
      name: programName(urlPath), bootUrl: platURL("bundles/declare-boot.js"),
      staticBlock, iconBase: platURL("assets/"), main: urlPath, title,
    });
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

  // ── the BUILD request (declarec), ONE cache keyed by IDENTITY ───────────────
  // A build is addressed by the program's own URL path — /build/<program-dir>/ —
  // so it is unique by construction (urls are), fixing the basename collision
  // where /my-apps/weather?build and /apps/weather?build both meant "weather".
  // The cache is one machine-level store keyed by the source's ABSOLUTE PATH plus
  // the build props plus the toolchain fingerprint — not the basename, and not
  // the url (so distro mode's two aliases of one file share a single entry).
  // (embeddable-server.md §1, §5)
  function toolchainFingerprint() {
    let acc = "";
    for (const dist of [path.join(PLATFORM_DIR, "runtime", "dist"), path.join(PLATFORM_DIR, "compiler", "dist")]) {
      if (!existsSync(dist)) continue;
      for (const f of readdirSync(dist)) if (f.endsWith(".js")) acc += f + statSync(path.join(dist, f)).mtimeMs + ";";
    }
    return createHash("sha256").update(acc).digest("hex").slice(0, 8);
  }

  const prodMem = new Map();
  function buildKey(srcPath, backend, toolchain) {
    return createHash("sha256")
      .update([`main=${srcPath}`, `render=${backend}`, `slim=true`, `stripPos=true`, `typecheck=true`, `crawler=false`, `tc=${toolchain}`].join("\n"))
      .digest("hex").slice(0, 16);
  }

  async function ensureProdBuild(srcPath, backend = "dom") {
    if (!existsSync(srcPath)) return null;
    const source = readFileSync(srcPath, "utf8");
    const name = path.basename(srcPath).replace(/\.declare$/, "");
    const dir = path.dirname(srcPath);
    const toolchain = toolchainFingerprint();
    const key = buildKey(srcPath, backend, toolchain);
    const outDir = path.join(buildCache, key);
    const manPath = path.join(outDir, "manifest.json");
    const propsNow = { render: backend, slim: "true", stripPos: "true", typecheck: "true", crawler: "false", toolchain };
    const fresh = (m) => {
      if (!m || !m.closure || !m.moduleName || !existsSync(path.join(outDir, m.moduleName))) return false;
      try { return isUpToDate(m.closure, propsNow, diskProbe); } catch { return false; }
    };
    let man = prodMem.get(key);
    if (fresh(man)) return man;
    if (existsSync(manPath)) {
      try { const d = JSON.parse(readFileSync(manPath, "utf8")); if (fresh(d)) { prodMem.set(key, d); return d; } } catch { /* rebuild */ }
    }
    const built = await writeProduction({ source, name, srcDir: dir, outDir, render: backend, props: { toolchain } });
    if (!built.ok) return { error: built.errors, report: built.report };
    man = { closure: built.closure, dir: outDir, moduleName: built.moduleName, sizes: built.sizes,
      assets: built.assets, used: built.usedComponents, source: srcPath, builtAt: null };
    mkdirSync(outDir, { recursive: true });
    writeFileSync(manPath, JSON.stringify(man, null, 2));
    prodMem.set(key, man);
    return man;
  }

  // /build/<program-dir>/ — resolve the program url this mirrors, find its
  // <name>.declare, build and serve. The url after /build is a program-directory
  // url in the mount space, so it composes with every mount identically.
  async function serveBuild(res, buildPath, urlPath, backend = "dom") {
    // buildPath = "/build/my-apps/weather/foo.js" → progDirUrl "/my-apps/weather/"
    const afterBuild = buildPath.replace(/^\/build/, "") || "/";
    const m = afterBuild.match(/^(\/(?:[^/]+\/)*)([^/]*)$/);
    const progDirUrl = m ? m[1] : "/";
    const tail = m ? m[2] : "";
    const dirName = progDirUrl.replace(/\/+$/, "").split("/").pop();
    if (!dirName) return send(res, 404, "no program in build url", "text/plain");
    const progUrl = progDirUrl + dirName + ".declare";
    const hit = mounts.resolve(progUrl);
    if (!hit || !existsSync(hit.abs)) return send(res, 404, "no such program: " + progUrl, "text/plain");

    const man = await ensureProdBuild(hit.abs, backend);
    if (man === null) return send(res, 404, "no such program", "text/plain");
    if (man.error) return send(res, 500, "declarec build failed:\n" + (man.report ?? man.error.map((e) => e.message).join("\n")), "text/plain");
    const t = tail.replace(/^\/+/, "");
    if (t === "" || t === "index.html") {
      if (!urlPath.endsWith("/")) { res.writeHead(302, { location: urlPath + "/" }); return res.end(); }
      return serveFrom(res, man.dir, "index.html");
    }
    if (t === "manifest.json") return send(res, 200, JSON.stringify(man.sizes, null, 2), "application/json");
    return serveFrom(res, man.dir, t);
  }

  // ── the request handler ────────────────────────────────────────────────────
  function handler(req, res) {
    let p;
    try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); }
    catch { return send(res, 400, "bad request", "text/plain"); }

    // PROXY first — a matched prefix leaves the file system entirely.
    const route = proxy.match(req.url);
    if (route) return proxy.forward(req, res, route);

    // POST /compile — live compile. `?main=<url>` (the editor sends it) names the
    // file so includes and relative data resolve against its directory; absent,
    // it compiles context-free as before.
    if (req.method === "POST" && p === "/compile") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 4e6) req.destroy(); });
      req.on("end", () => {
        let originDir;
        try {
          const main = new URL(req.url, "http://x").searchParams.get("main");
          if (main) { const hit = mounts.resolve(main); if (hit) originDir = path.dirname(hit.abs); }
        } catch { /* no main → context-free */ }
        let out;
        try {
          const r = compile(body, originDir ? { originDir } : {});
          out = { source: r.source, deps: r.deps, diagnostics: r.diagnostics, report: r.report };
        } catch (e) {
          out = { source: null, diagnostics: [], report: String((e && e.message) || e) };
        }
        send(res, 200, JSON.stringify(out), "application/json");
      });
      return;
    }

    try {
      // the homepage — the ONE curated HTML entry, from the ROOT mount
      if (p === "/") {
        const idx = path.join(mounts.root.dir, "index.html");
        if (existsSync(idx)) return send(res, 200, withServerMarker(readFileSync(idx, "utf8")));
        return send(res, 404, "not found", "text/plain");
      }

      // /build/… → the cached declarec artifact, addressed by program url
      if (p === "/build" || p.startsWith("/build/")) {
        const q = new URL(req.url, "http://x").searchParams;
        const flags = parseFlags(q, DEFAULT_FLAGS);
        serveBuild(res, p, p, flags.render).catch((e) => {
          if (!res.headersSent) send(res, 500, String((e && e.stack) || e), "text/plain");
        });
        return;
      }

      // the DIRECTORY-PROGRAM rule: …/name/ ≡ …/name/name.declare when it exists
      if (!p.endsWith(".declare")) {
        const cand = directoryProgram(p);
        if (cand !== null) {
          const chit = mounts.resolve(cand);
          if (chit && existsSync(chit.abs) && statSync(chit.abs).isFile()) {
            if (!p.endsWith("/")) {
              res.writeHead(301, { location: p + "/" + new URL(req.url, "http://x").search });
              return res.end();
            }
            p = cand;
          }
        }
      }

      if (p.endsWith(".declare")) {
        const params = new URL(req.url, "http://x").searchParams;
        const rt = requestType(params);
        const hit = mounts.resolve(p);
        const real = hit && existsSync(hit.abs) && statSync(hit.abs).isFile();
        if (real) {
          if (rt === REQ.READER || rt === REQ.SOURCE || rt === REQ.EDIT || rt === REQ.SEGMENTS)
            return serveSource(res, hit.abs, hit.rel, rt, "DomBackend");
          if (rt === REQ.EXTRACT) {
            serveExtract(res, hit.abs, hit.rel).catch((e) => { if (!res.headersSent) send(res, 500, String((e && e.stack) || e), "text/plain"); });
            return;
          }
          if (rt === REQ.BUILD) {
            // build lives at a directory address mirroring the program url
            const dirUrl = p.replace(/[^/]*\.declare$/, "");
            res.writeHead(302, { location: "/build" + dirUrl }); return res.end();
          }
          const navigate = req.headers["sec-fetch-mode"] === "navigate" || (req.headers.accept ?? "").includes("text/html");
          if (rt === REQ.RUN && navigate) {
            declareRunPage(p, parseFlags(params))
              .then((page) => send(res, 200, withServerMarker(page), "text/html;charset=utf-8"))
              .catch((e) => { if (!res.headersSent) send(res, 500, String((e && e.stack) || e), "text/plain"); });
            return;
          }
        }
        // else fall through to the raw-bytes handler below
      }

      // a platform BUNDLE → rebuild if stale, but only when the platform is a
      // real distro checkout (a node_modules platform has no sources to rebuild).
      if (canRebuildBundles && (p === platURL("bundles/declare-boot.js") || p === platURL("bundles/declare-compiler.js") ||
        p === "/bundles/declare-boot.js" || p === "/bundles/declare-compiler.js")) {
        const bundleRel = p.startsWith(PLAT) ? p.slice(PLAT.length) : p.slice(1);
        try { rebuildStale(PLATFORM_DIR, { only: [bundleRel] }); } catch (e) { console.error("bundle rebuild failed:", e.message); }
      }

      // otherwise: a static file in whichever mount owns this url
      const hit = mounts.resolve(p);
      if (!hit) return send(res, 403, "forbidden", "text/plain");
      if (existsSync(hit.abs) && statSync(hit.abs).isFile()) {
        if (hit.abs.endsWith(".html")) return send(res, 200, withServerMarker(readFileSync(hit.abs, "utf8")));
        res.writeHead(200, { "content-type": mime(hit.abs) });
        return res.end(readFileSync(hit.abs));
      }
    } catch (e) {
      return send(res, 500, String((e && e.stack) || e), "text/plain");
    }
    send(res, 404, `not found: ${p} → ${mounts.resolve(p)?.abs ?? "(no mount)"}`, "text/plain");
  }

  // the WebSocket upgrade listener — proxy traffic only (Declare needs no socket)
  function upgrade(req, socket, head) {
    const route = proxy.match(req.url);
    if (route) return proxy.forwardUpgrade(req, socket, head, route);
    socket.destroy();
  }

  return { handler, upgrade, mounts, proxy, buildCache, watch, describeMounts };
}
