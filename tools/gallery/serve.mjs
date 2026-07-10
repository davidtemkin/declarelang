// serve.mjs — ONE local server for the Declare ⟷ LZX app gallery.
//
// A build-time comparison harness: the live counterpart to
// examples/neoweather/deploy-build.mjs (which bakes the same comparison static).
//
// Top: the neoweather side-by-side — the original LZX app on OpenLaszlo's DHTML and
// Canvas kernels, and neoweather on both neo backends. Below: a neocalendar section —
// the four calendar renderings and all source, opened in popups.
//
// What it reads (all in the Declare tree + the sibling openlaszlo-5.0):
//   • the NEO apps            examples/{neoweather,neocalendar}/  (compiled in-process)
//   • the neo runtime         runtime/dist/                       (mounted at /dist/)
//   • the OL reference apps    workshop/{neoweather,neocalendar}/  (precompiled bundles)
//   • the OL runtime + kernels  ../openlaszlo-5.0/runtime/         (mounted at /runtime/)
//
// The OL apps are self-contained static bundles but for the shared OL runtime; the neo
// apps are recompiled on every load (edit-and-reload; a compile error renders in place).
// The OL calendar bundles reference the kernel by its old parity-snapshot path
// (/benchmarks/.../snapshot/) — that kernel has since graduated into the OL runtime, so
// those two baked names are mapped onto it.
//
//   node tools/gallery/serve.mjs [port=8250]     # http://127.0.0.1:8250/

import http from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile } from "../../compiler/dist/compile-node.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));    // tools/gallery
const ROOT = path.resolve(HERE, "../..");                     // the Declare distro root
const OL5 = path.resolve(ROOT, "../openlaszlo-5.0");          // the sibling OpenLaszlo 5.0 distro
const NW = path.join(ROOT, "examples/neoweather");            // neo weather source + assets
const NC = path.join(ROOT, "examples/neocalendar");           // neo calendar source + assets
const OLW = path.join(ROOT, "workshop/neoweather");           // OL weather bundles (original, original-canvas)
const CAL = path.join(ROOT, "workshop/neocalendar/original"); // OL calendar bundle
const NEO_RT = path.join(ROOT, "runtime/dist");               // the neo runtime (for the neo apps)
const OL_RT = path.join(OL5, "runtime");                      // the OL runtime (for the OL apps)
const PORT = Number(process.argv[2] ?? 8250);

// the OL calendar bundles reference the kernel by its old parity-snapshot path; that
// kernel graduated into the OL runtime, so map the two baked names onto it.
const SNAPSHOT = "/benchmarks/parity-sweep/snapshot/";
const SNAPSHOT_KERNEL = { "lfc.js": "lfc/lfc.js", "LFCcanvas.js": "lfc/kernel/canvas/LFCcanvas.js" };

const MIME = {
  ".html": "text/html;charset=utf-8", ".htm": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8", ".mjs": "text/javascript;charset=utf-8",
  ".json": "application/json", ".css": "text/css;charset=utf-8",
  ".lzx": "text/xml;charset=utf-8", ".xml": "text/xml;charset=utf-8",
  ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain;charset=utf-8",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".properties": "text/plain;charset=utf-8", ".swf": "application/x-shockwave-flash",
};

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const html = (res, body) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(body); };
const send = (res, abs) => {
  try {
    const body = readFileSync(abs);
    res.writeHead(200, { "content-type": MIME[path.extname(abs).toLowerCase()] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("404"); }
};

// A neo app, compiled and paged for one backend (edit-and-reload — recompiled on every
// load; a compile error renders in place).
const neoPage = (dir, file, backend, bg) => {
  const r = compile(readFileSync(path.join(dir, file), "utf8"), { originDir: dir });
  if (r.errors.length > 0) {
    return `<!doctype html><meta charset=utf-8><title>compile errors</title>
<pre style="color:#e06c75;font:13px/1.5 monospace;padding:20px;white-space:pre-wrap">${esc(r.errors.map((e) => e.message).join("\n"))}</pre>`;
  }
  return `<!doctype html><meta charset=utf-8><title>${esc(file)} · ${backend}</title>
<style>html,body{margin:0;padding:0;background:${bg}}</style><div id=host></div>
<script type=module>
  import { renderAsync, ${backend} } from "/dist/index.js";
  window.__app = await renderAsync(${JSON.stringify(r.source)}, document.getElementById("host"), new ${backend}());
</script>`;
};

// A read-only source view (popup).
const srcPage = (title, abs) => {
  let code; try { code = readFileSync(abs, "utf8"); } catch { return null; }
  return `<!doctype html><meta charset=utf-8><title>${esc(title)}</title>
<style>body{margin:0;background:#1e1e1e;color:#d4d4d4;font:12px/1.55 ui-monospace,Menlo,Consolas,monospace}
  header{position:sticky;top:0;background:#252526;color:#9cdcfe;padding:8px 14px;border-bottom:1px solid #3a3a3a}
  pre{margin:0;padding:14px;overflow:auto;white-space:pre;tab-size:4}</style>
<header>${esc(title)}</header><pre>${esc(code)}</pre>`;
};

// f → an on-disk source path (whitelisted; the calendar includes live in CAL).
const resolveSrc = (f) => {
  if (!f || f.includes("..")) return null;
  if (f === "neoweather") return path.join(NW, "neoweather.declare");
  if (f === "weather") return path.join(OLW, "original", "weather.lzx");
  if (f === "neocal") return path.join(NC, "neocalendar.declare");
  if (/^cal\/[\w.-]+\.lzx$/.test(f)) return path.join(CAL, f.slice(4));
  return null;
};

// The LZX calendar's app-local include graph (bare-name .lzx reachable from
// calendar.lzx; library includes like lz/scrollbar.lzx — with a slash — are framework,
// not app source, so they're left out).
const calIncludes = () => {
  const seen = new Set(), out = [];
  const scan = (f) => {
    let t; try { t = readFileSync(path.join(CAL, f), "utf8"); } catch { return; }
    for (const m of t.matchAll(/include\s+href\s*=\s*["']([^"']+)["']/g)) {
      const h = m[1];
      if (!h.endsWith(".lzx") || h.includes("/") || seen.has(h)) continue;
      seen.add(h); out.push(h); scan(h);
    }
  };
  scan("calendar.lzx");
  return out;
};

const W = 240, H = 320; // neoweather geometry
const srcBtn = (label, f, kind) => `<a href="#" onclick="return pop('/src?f=${f}',860,900)">${label}${kind ? ` <small>${kind}</small>` : ""}</a>`;

const indexPage = () => {
  const inc = calIncludes().map((h) => srcBtn(h, `cal/${h}`)).join("");
  return `<!doctype html><meta charset=utf-8><title>Declare · apps</title>
<style>
  :root{color-scheme:dark}
  body{font:14px/1.5 system-ui,sans-serif;background:#2b2b2b;color:#e6e6e6;margin:0;padding:22px 24px 60px}
  h1{font-size:19px;font-weight:600;margin:0 0 24px}
  h2{font-size:15px;font-weight:600;margin:0 0 12px;color:#dfe6ff}
  section{margin-bottom:34px}
  .muted{color:#9aa0a6}
  .row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
  figure{margin:0}
  iframe{width:${W}px;height:${H}px;border:1px solid #4a4a4a;background:#fff;display:block}
  figcaption{margin-top:5px;color:#a8b0bb;font-size:12.5px}
  .apps,.srcs{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
  .srccols{display:flex;gap:26px;flex-wrap:wrap;margin-top:14px}
  .srccol{min-width:260px}
  .lbl{color:#9aa0a6;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px}
  .inc{display:flex;flex-direction:column;gap:5px;margin-top:7px;padding-left:12px;border-left:1px solid #444}
  a{box-sizing:border-box;display:inline-block;padding:8px 12px;background:#39415f;color:#cdd6ff;
    text-decoration:none;border:1px solid #4a5273;border-radius:5px;font-size:12.5px}
  a:hover{background:#464f78}
  a small{color:#98a1cf}
  .apps a{min-width:150px;text-align:center}
</style>

<h1>Declare · app gallery</h1>

<section>
  <h2>neoweather &mdash; side by side</h2>
  <div class=row>
    <figure><iframe src="/original/weather.html"></iframe><figcaption>LZX &middot; DHTML</figcaption></figure>
    <figure><iframe src="/original-canvas/weather.html"></iframe><figcaption>LZX &middot; Canvas</figcaption></figure>
    <figure><iframe src="/w/neo-dom"></iframe><figcaption>neo &middot; DOM</figcaption></figure>
    <figure><iframe src="/w/neo-canvas"></iframe><figcaption>neo &middot; Canvas</figcaption></figure>
  </div>
  <div class=srcs>${srcBtn("weather.lzx", "weather", "LZX")}${srcBtn("neoweather.declare", "neoweather", "neo")}</div>
</section>

<section>
  <h2>neocalendar</h2>
  <p class=muted>Four renderings &mdash; click to open each in a popup.</p>
  <div class=apps>
    <a href="#" onclick="return pop('/cal/calendar.__dh.html',865,650)">LZX calendar &middot; DHTML</a>
    <a href="#" onclick="return pop('/cal/calendar.__cv.html',865,650)">LZX calendar &middot; Canvas</a>
    <a href="#" onclick="return pop('/c/neo-dom',865,650)">neo calendar &middot; DOM</a>
    <a href="#" onclick="return pop('/c/neo-canvas',865,650)">neo calendar &middot; Canvas</a>
  </div>
  <div class=srccols>
    <div class=srccol>
      <div class=lbl>LZX source</div>
      ${srcBtn("calendar.lzx", "cal/calendar.lzx", "main")}
      <div class=inc>${inc}</div>
    </div>
    <div class=srccol>
      <div class=lbl>Declare source</div>
      ${srcBtn("neocalendar.declare", "neocal", "main")}
      <div class=inc><span class=muted>single file &mdash; no includes</span></div>
    </div>
  </div>
</section>

<script>function pop(u,w,h){window.open(u,'_blank','width='+w+',height='+h+',scrollbars=yes,resizable=yes');return false;}</script>`;
};

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const p = decodeURIComponent(u.pathname);
  if (p.includes("..")) { res.writeHead(400); return res.end("bad request"); }
  try {
    if (p === "/") return html(res, indexPage());

    // neo apps (compiled per backend)
    if (p === "/w/neo-dom") return html(res, neoPage(NW, "neoweather.declare", "DomBackend", "#EAEAEA"));
    if (p === "/w/neo-canvas") return html(res, neoPage(NW, "neoweather.declare", "CanvasBackend", "#EAEAEA"));
    if (p === "/c/neo-dom") return html(res, neoPage(NC, "neocalendar.declare", "DomBackend", "#1E3A49"));
    if (p === "/c/neo-canvas") return html(res, neoPage(NC, "neocalendar.declare", "CanvasBackend", "#1E3A49"));

    // source viewer
    if (p === "/src") {
      const abs = resolveSrc(u.searchParams.get("f"));
      const body = abs && srcPage(path.basename(abs), abs);
      if (!body) { res.writeHead(404); return res.end("404"); }
      return html(res, body);
    }

    // neo assets (relative refs, namespaced by the /w and /c mounts)
    if (p.startsWith("/w/resources/") || p.startsWith("/w/data/")) return send(res, path.join(NW, p.slice(3)));
    if (p.startsWith("/c/resources/") || p.startsWith("/c/data/")) return send(res, path.join(NC, p.slice(3)));
    if (p.startsWith("/dist/")) return send(res, path.join(NEO_RT, p.slice(6))); // the neo runtime

    // OL weather (local static bundles: /original/ + /original-canvas/)
    if (p.startsWith("/original")) return send(res, path.join(OLW, p.slice(1)));
    // OL calendar (local static bundle)
    if (p.startsWith("/cal/")) return send(res, path.join(CAL, p.slice(5)));

    // the shared OL runtime + kernels (the OL apps' absolute loader paths)
    if (p.startsWith("/runtime/")) return send(res, path.join(OL_RT, p.slice(9)));
    if (p.startsWith(SNAPSHOT)) {
      const f = p.slice(SNAPSHOT.length);
      return send(res, path.join(OL_RT, SNAPSHOT_KERNEL[f] ?? f));
    }
    if (p.includes("/lps/resources/")) return send(res, path.join(OL_RT, p.replace(/^.*\/lps\/resources\//, "").replace(/^lps\//, "")));

    res.writeHead(404); res.end("404");
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`app gallery → http://127.0.0.1:${PORT}/`);
});
