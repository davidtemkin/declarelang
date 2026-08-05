// verify-behave — verify's rungs 5 and 6 (docs/system-design/verify-and-evals.md §2.4–§2.5):
// drive the compiled app with REAL input in a real browser, assert at the
// language's altitude (named views and attributes through the __declare
// bridge — never DOM selectors), with deterministic motion (the driven clock)
// and fixture data (no live network); and capture NAMED VISUAL STATES,
// compared against blessed baselines by in-page pixel diff (the perceptual
// suite's technique — the browser's own PNG decode, no Node-side dependency).
// Loaded lazily by tools/verify.mjs; also the eval harness's execution seam.

import http from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, extname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".png": "image/png",
  ".jpg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".woff": "font/woff", ".map": "application/json",
  ".declare": "text/plain", ".txt": "text/plain",
};

function findChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

/** The one failure type the runners report in the diagnostic register. */
export class VerifyAssertion extends Error {}

// ── the ephemeral host (shared by rungs 5 and 6) ────────────────────────────
// A static server over the repo tree (the app's <base> resolves its own data
// and resources), a fixtures overlay mapped over the app's base (verify NEVER
// touches live network, §2.6), one headless Chrome, and a host page embedding
// the ALREADY-compiled source + deps — the dev server's own host-page shape.

async function withHost({ compiled, appDir, fixturesDir = null, backendClass = "DomBackend" }, fn) {
  const baseHref = "/" + relative(ROOT, resolve(appDir)).split("\\").join("/") + "/";
  const cfg = { backend: backendClass, source: compiled.source, deps: compiled.deps };
  const hostPage = `<!doctype html><meta charset="utf-8"><title>verify</title>
<base href="${baseHref}">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
import { bootHost } from "/browser/host-client.js";
const cfg = ${JSON.stringify(cfg)};
cfg.compile = async () => null;
bootHost(cfg);
</script>`;

  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (pathname === "/__verify__/" || pathname === "/__verify__/index.html") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(hostPage);
    }
    const candidates = [];
    if (fixturesDir !== null && pathname.startsWith(baseHref)) {
      candidates.push(join(resolve(fixturesDir), pathname.slice(baseHref.length)));
    }
    candidates.push(join(ROOT, pathname));
    for (const file of candidates) {
      if (!file.startsWith(ROOT) && (fixturesDir === null || !file.startsWith(resolve(fixturesDir)))) continue;
      if (existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
        return res.end(readFileSync(file));
      }
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found: " + pathname);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const { default: puppeteer } = await import(pathToFileURL(join(ROOT, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).href);
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
  try {
    /** A fresh page with the app booted and the language-altitude API bound. */
    const openApp = async ({ width = 1024, height = 768, clock = null, scheme = "light", dpr = 1 } = {}) => {
      const page = await browser.newPage();
      // `dpr` rasterizes at device pixels per CSS pixel — a specimen sheet whose
      // subject IS the rendering (stroke weight, a 1px hairline) needs the real
      // pixels, not a 1× approximation of them. Layout is unchanged; only the
      // raster grid is finer, so the baseline is dpr× the clip in each axis.
      await page.setViewport({ width, height, deviceScaleFactor: dpr });
      // A PINNED COLOUR SCHEME, for the same reason as the pinned clock: an app
      // that follows `prefers-color-scheme` renders whatever the HOST MACHINE
      // happens to be wearing, so baselines blessed in daylight fail when macOS
      // turns itself dark in the evening. Measured exactly that, mid-session.
      // Default light; a state asks for dark with `scheme: "dark"`.
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e)));
      // A PINNED WALL CLOCK, installed before any page script runs. An app whose
      // initial state derives from today — the calendar's month grid, a "3 days
      // ago" label — otherwise photographs a different program every day, and
      // its baselines rot with nobody having changed a line. `clock` is an ISO
      // string given by the state; `Date.now()` and `new Date()` answer from it,
      // while the DRIVEN animation clock (window.__declare.clock) is untouched,
      // so motion still settles frame-exactly.
      if (clock !== null) {
        await page.evaluateOnNewDocument((iso) => {
          const fixed = new Date(iso).getTime();
          const Real = Date;
          const Pinned = function (...a) { return a.length === 0 ? new Real(fixed) : new Real(...a); };
          Pinned.prototype = Real.prototype;
          Pinned.now = () => fixed;
          Pinned.parse = Real.parse;
          Pinned.UTC = Real.UTC;
          globalThis.Date = Pinned;
        }, clock);
      }
      await page.goto(`http://127.0.0.1:${port}/__verify__/`, { waitUntil: "networkidle0", timeout: 30000 });
      await page.waitForFunction("!!window.__declare", { timeout: 10000 });

      const log = [];
      const step = (s) => log.push(s);
      const node = async (path) => {
        const n = await page.evaluate((p) => window.__declare.inspect(p), path);
        if (n === null) throw new VerifyAssertion(`no node at '${path}'`);
        return n;
      };
      // rootX/rootY is where the view is SEEN (inspect.ts takes every enclosing
      // scroll out). It used to be a plain sum of ancestor x/y, so driving
      // anything below a scrolled pane's fold aimed at the position the view
      // would have had unscrolled, and missed.
      const center = async (path) => {
        const n = await node(path);
        return { x: n.rootX + n.width / 2, y: n.rootY + n.height / 2 };
      };

      const drive = {
        async click(path) {
          const c = await center(path);
          step(`click ${path}`);
          await page.mouse.click(c.x, c.y);
        },
        async drag(path, dx, dy = 0, steps = 10) {
          const c = await center(path);
          step(`drag ${path} by (${dx}, ${dy})`);
          await page.mouse.move(c.x, c.y);
          await page.mouse.down();
          await page.mouse.move(c.x + dx, c.y + dy, { steps });
          await page.mouse.up();
        },
        async key(name) { step(`key ${name}`); await page.keyboard.press(name); },
        async type(text) { step(`type "${text}"`); await page.keyboard.type(text); },
        async tab(n = 1) { for (let i = 0; i < n; i++) await this.key("Tab"); },
        async wait(ms) { await new Promise((r) => setTimeout(r, ms)); },
        /** Run in-flight motion to rest DETERMINISTICALLY (driven clock,
         *  in-page, frame-exact), then hand the clock back to rAF. */
        async settleMotion(maxMs = 5000) {
          step("settleMotion");
          const ok = await page.evaluate((m) => {
            const done = window.__declare.clock.settleMotion(m);
            window.__declare.clock.auto();
            return done;
          }, maxMs);
          if (!ok) throw new VerifyAssertion(`motion did not settle within ${maxMs} ms`);
        },
        async settleData() { step("settleData"); await page.waitForNetworkIdle({ idleTime: 250, timeout: 10000 }); },
        page,
      };

      const fail = (msg) => { throw new VerifyAssertion(msg); };
      const expect = {
        async exists(path) { await node(path); },
        async visible(path) {
          const n = await node(path);
          if (!n.visible || n.width <= 0 || n.height <= 0) fail(`expected '${path}' visible — it isn't`);
        },
        async hidden(path) {
          const n = await page.evaluate((p) => window.__declare.inspect(p), path);
          if (n !== null && n.visible && n.width > 0 && n.height > 0) fail(`expected '${path}' hidden — it is visible`);
        },
        async attr(path, name, expected) {
          const v = await page.evaluate((p, a) => window.__declare.explain(p, a)?.value, path, name);
          if (v !== expected) fail(`expected ${path}.${name} = ${JSON.stringify(expected)}, got ${JSON.stringify(v)}`);
        },
        async approx(path, name, expected, tol = 1) {
          const v = await page.evaluate((p, a) => window.__declare.explain(p, a)?.value, path, name);
          if (typeof v !== "number" || Math.abs(v - expected) > tol) fail(`expected ${path}.${name} ≈ ${expected} (±${tol}), got ${JSON.stringify(v)}`);
        },
        async text(path, contains) {
          const n = await node(path);
          if (!String(n.text ?? "").includes(contains)) fail(`expected '${path}' text to contain "${contains}", got "${n.text ?? ""}"`);
        },
        async count(path, kind, expected) {
          const n = await node(path);
          let c = 0;
          const walk = (x) => { if (x.kind === kind) c++; x.children.forEach(walk); };
          walk(n);
          if (c !== expected) fail(`expected ${expected} ${kind} under '${path}', found ${c}`);
        },
        async explain(path, name) {
          return page.evaluate((p, a) => window.__declare.explain(p, a), path, name);
        },
        fail,
      };

      return { page, drive, expect, node, log, pageErrors };
    };

    return await fn({ openApp });
  } finally {
    await browser.close();
    server.close();
  }
}

// ── rung 5: behavior ────────────────────────────────────────────────────────

export async function runBehavior({ compiled, appDir, assertPath, fixturesDir = null, backendClass = "DomBackend" }) {
  return withHost({ compiled, appDir, fixturesDir, backendClass }, async ({ openApp }) => {
    const failures = [];
    const app = await openApp();
    const mod = await import(pathToFileURL(resolve(assertPath)).href);
    if (typeof mod.default !== "function") throw new VerifyAssertion(`${assertPath} has no default export function`);
    try {
      await mod.default({ drive: app.drive, expect: app.expect, page: app.page });
    } catch (e) {
      const where = app.log.length > 0 ? ` (after: ${app.log.slice(-3).join(" → ")})` : "";
      failures.push(`${e instanceof VerifyAssertion ? "" : "unexpected error: "}${e?.message ?? e}${where}`);
    }
    for (const e of app.pageErrors) failures.push(`page error: ${e}`);
    return { ok: failures.length === 0, failures, log: app.log };
  });
}

// ── rung 6: named visual states vs blessed baselines ───────────────────────

/** Screenshot the APP's box (the tree's own extent, not the viewport). */
async function shootApp(page) {
  const app = await page.evaluate(() => {
    const a = window.__declare.inspect();
    return { width: a.width, height: a.height };
  });
  return page.screenshot({
    clip: { x: 0, y: 0, width: Math.max(1, Math.ceil(app.width)), height: Math.max(1, Math.ceil(app.height)) },
    encoding: "base64",
  });
}

/** In-page strict pixel diff (per-channel tolerance): the browser's own PNG
 *  decode — the perceptual suite's technique. Returns { over, max, total }.
 *
 *  `mask` excludes rectangles from the comparison — for regions that measure
 *  the MACHINE rather than the design. The tracker's `loadMs`/`adoptMs` readouts
 *  are the case in point: they render `performance.now()` deltas, so they differ
 *  every run by construction, and no amount of settling or clock-pinning makes
 *  them stable (the animation clock IS performance.now, so freezing it would
 *  stop motion instead). Masking states the truth — this rectangle is not part
 *  of the visual contract — rather than loosening the tolerance everywhere and
 *  going blind to the 1px shifts a chrome change actually produces. */
async function diffPng(page, aBase64, bBase64, tolerance = 4, mask = []) {
  return page.evaluate(async (a, b, tol, boxes) => {
    const load = async (b64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return { d: ctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
    };
    const A = await load(a), B = await load(b);
    if (A.w !== B.w || A.h !== B.h) return { over: -1, max: 0, total: 0, note: `size ${A.w}x${A.h} vs ${B.w}x${B.h}` };
    const masked = new Uint8Array(A.w * A.h);
    for (const r of boxes || []) {
      for (let y = Math.max(0, r.y); y < Math.min(A.h, r.y + r.h); y++) {
        for (let x = Math.max(0, r.x); x < Math.min(A.w, r.x + r.w); x++) masked[y * A.w + x] = 1;
      }
    }
    let over = 0, max = 0;
    for (let p = 0; p < masked.length; p++) {
      if (masked[p]) continue;
      const i = p * 4;
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(A.d[i + k] - B.d[i + k]);
        if (d > max) max = d;
        if (d > tol) { over++; break; }
      }
    }
    return { over, max, total: A.d.length / 4 };
  }, aBase64, bBase64, tolerance, mask);
}

/** Run a states module: capture each named state, bless or compare.
 *  States module default export:
 *    [{ name, viewport?, clock?, scheme?, dpr?, mask?, route?: async ({drive, expect, page}) }]
 *  `clock` (ISO string) pins the wall clock before the app boots — required by
 *  any app whose initial state derives from today, or its baselines rot on
 *  their own. `scheme` pins `prefers-color-scheme` ("light" default, "dark" to
 *  capture a dark state) so a capture never depends on the host machine's own
 *  appearance. `mask` is a list of {x,y,w,h} rectangles excluded from the diff,
 *  for regions that measure the machine (see diffPng). */
export async function runStates({ compiled, appDir, statesPath, baselinesDir, bless = false, fixturesDir = null, backendClass = "DomBackend", tolerance = 4 }) {
  const mod = await import(pathToFileURL(resolve(statesPath)).href);
  const states = mod.default;
  if (!Array.isArray(states)) throw new VerifyAssertion(`${statesPath} must default-export an array of states`);
  const suffix = backendClass === "CanvasBackend" ? "-canvas" : "";

  return withHost({ compiled, appDir, fixturesDir, backendClass }, async ({ openApp }) => {
    const failures = [];
    const results = [];
    for (const st of states) {
      const viewport = st.viewport ?? { width: 1024, height: 768 };
      const app = await openApp({ ...viewport, clock: st.clock ?? null, scheme: st.scheme ?? "light", dpr: st.dpr ?? 1 });
      try {
        if (typeof st.route === "function") await st.route({ drive: app.drive, expect: app.expect, page: app.page });
        const shot = await shootApp(app.page);
        const file = join(resolve(baselinesDir), `${st.name}@${viewport.width}x${viewport.height}${suffix}.png`);
        if (bless) {
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, Buffer.from(shot, "base64"));
          results.push(`${st.name}: blessed → ${relative(ROOT, file)}`);
        } else if (!existsSync(file)) {
          failures.push(`${st.name}: no baseline (${relative(ROOT, file)}) — run with --bless to create it`);
        } else {
          const baseline = readFileSync(file).toString("base64");
          const d = await diffPng(app.page, baseline, shot, tolerance, st.mask ?? []);
          if (d.over !== 0) {
            const actual = file.replace(/\.png$/, ".actual.png");
            writeFileSync(actual, Buffer.from(shot, "base64"));
            failures.push(`${st.name}: ${d.over === -1 ? d.note : `${d.over} channel values past tolerance (max Δ ${d.max})`} — actual saved to ${relative(ROOT, actual)}`);
          } else {
            results.push(`${st.name}: matches baseline`);
          }
        }
        for (const e of app.pageErrors) failures.push(`${st.name}: page error: ${e}`);
      } catch (e) {
        failures.push(`${st.name}: ${e?.message ?? e}`);
      } finally {
        await app.page.close();
      }
    }
    return { ok: failures.length === 0, failures, results };
  });
}
