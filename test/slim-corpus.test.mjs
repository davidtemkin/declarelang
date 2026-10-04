// slim-corpus — THE GATE ON WHAT A PRODUCTION BUILD LEAVES OUT
// (compiler/src/capabilities.ts). A capability may be left out only when the
// program cannot reach it; a trigger that misses shows up here as a program
// that behaves differently, not as a smaller bundle nobody checked.
//
//   1. The ladder, on the slimmed build. Every app with a `tests/` folder has
//      its rungs 5–6 (tests/assert.mjs, tests/states.mjs against the blessed
//      baselines) run against its production build — built with the `__declare`
//      bridge aboard so the rungs can drive it, and nothing else changed.
//   2. The corpus, slim against full. Every program — the apps, the docs demos,
//      the probes, the eval apps — is built twice, slimmed and whole (`slim:
//      false` keeps the registry whole, `keepAll` every capability), booted
//      headlessly, and the two must settle to the same view tree, the same
//      pixels and the same page errors.
//
//   3. `--compare target`: the corpus again, each program built at the shipped
//      language target and at the previous one (ES2020) — the same settled tree,
//      pixels and page errors, or the bundler's output changed what a program does.
//
// Not part of `npm test` (a browser, and minutes): `node test/slim-corpus.test.mjs
// [--only <substring>] [--skip-ladder] [--skip-corpus] [--render canvas]
// [--compare target]`, and before a release.
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname, basename, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";
import { buildProduction } from "../tools/declarec.mjs";
import { runBehavior, runStates } from "../tools/internal/verify-behave.mjs";
import { launchChrome } from "../tools/internal/chrome.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const pick = (file) => only === null || file.includes(only);
// `--render canvas`: the same gate on canvas builds (the ladder's baselines are the DOM's)
const render = argv.includes("--render") ? argv[argv.indexOf("--render") + 1] : "dom";
// `--compare target`: the corpus built at the shipped language target against the
// previous one (ES2020), slimmed both times — the same program must behave the same
const compare = argv.includes("--compare") ? argv[argv.indexOf("--compare") + 1] : "slim";

const build = (file, opts) => buildProduction(readFileSync(file, "utf8"), { name: basename(file, ".declare"), originDir: dirname(file), bridge: true, render, ...opts });

// ── 1. the ladder, on the slimmed build ─────────────────────────────────────
if (!argv.includes("--skip-ladder") && render === "dom") {
  for (const dir of readdirSync(join(ROOT, "apps")).map((d) => join(ROOT, "apps", d))) {
    const tests = join(dir, "tests"), file = join(dir, basename(dir) + ".declare");
    const assertPath = join(tests, "assert.mjs"), statesPath = join(tests, "states.mjs");
    if (!existsSync(file) || !pick(file) || (!existsSync(assertPath) && !existsSync(statesPath))) continue;
    await test(`ladder, slimmed: ${relative(ROOT, file)}`, async () => {
      const built = await build(file, {});
      assert.ok(built.ok, `build failed: ${built.errors?.map((e) => e.message).join("; ")}`);
      const out = [];
      if (existsSync(assertPath)) {
        const r = await runBehavior({ compiled: null, appDir: dir, assertPath, built });
        if (!r.ok) out.push(...r.failures.map((f) => `R5 ${f}`));
      }
      if (existsSync(statesPath)) {
        const r = await runStates({ compiled: null, appDir: dir, statesPath, baselinesDir: join(tests, "baselines"), built });
        if (!r.ok) out.push(...r.failures.map((f) => `R6 ${f}`));
      }
      assert.deepEqual(out, [], `absent: ${built.capabilities.absent.join(", ")}`);
    });
  }
}

// ── 2. the corpus, slim against full ────────────────────────────────────────
function corpus() {
  const out = [];
  for (const d of readdirSync(join(ROOT, "apps"))) {
    const f = join(ROOT, "apps", d, d + ".declare");
    if (existsSync(f)) out.push(f);
  }
  const folder = (dir) => existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir).filter((f) => f.endsWith(".declare")).map((f) => join(dir, f)) : [];
  out.push(...folder(join(ROOT, "apps/docs/demos")), ...folder(join(ROOT, "apps/homepage/demos")), ...folder(join(ROOT, "test/probe")));
  const reports = join(ROOT, "evals/reports");
  if (existsSync(reports)) for (const r of readdirSync(reports)) out.push(...folder(join(reports, r)));
  return out.filter(pick).sort();
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webp": "image/webp", ".declare": "text/plain" };

if (!argv.includes("--skip-corpus")) {
  // built files are served over their program's folder, each page by its own name
  const overlay = new Map();
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (overlay.has(p)) { res.writeHead(200, { "content-type": MIME[extname(p)] ?? "text/plain" }); return res.end(overlay.get(p)); }
    const file = join(ROOT, p);
    if (file.startsWith(ROOT) && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      return res.end(readFileSync(file));
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchChrome({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });

  /** Serve a build under its program's folder and read what it settles to. */
  const settle = async (file, built, variant) => {
    const dir = "/" + relative(ROOT, dirname(file)).split("\\").join("/") + "/";
    const page = `${dir}__gate-${basename(file, ".declare")}-${variant}.html`;
    for (const f of built.files) overlay.set(f.name === "index.html" ? page : dir + f.name, f.contents);
    const tab = await browser.newPage();
    await tab.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
    await tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    // TIME STANDS STILL: the wall clock, performance.now, the frame
    // timestamps and media playback are pinned before any script runs, so a
    // program that shows the time, measures a duration, plays a video or runs
    // ambient motion settles the same in both builds — motion moves only as
    // settleMotion drives the clock
    await tab.evaluateOnNewDocument(() => {
      const fixed = Date.UTC(2026, 0, 15, 12, 0, 0), Real = Date;
      const Pinned = function (...a) { return a.length === 0 ? new Real(fixed) : new Real(...a); };
      Pinned.prototype = Real.prototype; Pinned.now = () => fixed; Pinned.parse = Real.parse; Pinned.UTC = Real.UTC;
      globalThis.Date = Pinned;
      const t0 = 1000;
      performance.now = () => t0;
      const raf = globalThis.requestAnimationFrame.bind(globalThis);
      globalThis.requestAnimationFrame = (cb) => raf(() => cb(t0));
      // media time is a clock too: a video or audio holds at its start
      HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    });
    const errors = [];
    tab.on("pageerror", (e) => errors.push(String(e?.message ?? e).replace(/app\.[0-9a-f]{8}\.js/g, "app.js")));
    try {
      await tab.goto(base + page, { waitUntil: "load", timeout: 60000 });
      await tab.waitForNetworkIdle({ idleTime: 300, timeout: 10000 }).catch(() => {});
      await tab.waitForFunction("!!window.__declare?.find", { timeout: 20000 }).catch(() => {});
      const tree = await tab.evaluate(async () => {
        const D = window.__declare;
        if (!D?.find) return null;
        await document.fonts?.ready;   // a face still loading changes pixels, not the model
        // a picture still decoding does too: wait until every Image has landed
        // (or failed) — network-idle says the bytes arrived, not that they are drawn
        const decoding = () => { let n = 0; const visit = (v) => { if ("naturalWidth" in v && v.source !== "" && !v.loaded && !v.failed) n++; (v.childViews ?? []).forEach(visit); }; visit(D.find("app")); return n; };
        for (let i = 0; i < 100 && decoding() > 0; i++) await new Promise((r) => setTimeout(r, 30));
        D.clock?.settleMotion?.(5000);
        D.clock?.auto?.();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const out = [];
        const walk = (v, p) => {
          out.push([p, v.x, v.y, v.width, v.height, v.visible, typeof v.text === "string" ? v.text : null]);
          (v.childViews ?? []).forEach((c, i) => walk(c, p + "/" + i));
        };
        walk(D.find("app"), "app");
        return out;
      });
      // the DOM raster's own account (dom-backend.ts): a raster read back as
      // blank is redrawn at half density — a different picture, so a pixel
      // difference reports whether either build took that recovery
      const raster = await tab.evaluate(() => window.__declareDomRasterStats?.() ?? null);
      const png = Buffer.from(await tab.screenshot({ type: "png" }));
      return { tree, png, errors, raster };
    } finally { await tab.close(); }
  };

  for (const file of corpus()) {
    const label = compare === "target" ? "es2022 = es2020" : "slim = full";
    await test(`${label}${render === "dom" ? "" : ` (${render})`}: ${relative(ROOT, file)}`, async () => {
      let slim;
      try { slim = await build(file, {}); } catch (e) { slim = { ok: false, errors: [e] }; }
      // a program that does not build is not this gate's subject (verify-apps owns it)
      if (!slim.ok) { console.log(`    (not built: ${String(slim.errors?.[0]?.message ?? "").split("\n")[0].slice(0, 120)})`); return; }
      // the reference build: the whole registry, or the previous language target
      const full = await build(file, compare === "target" ? { esTarget: "es2020" } : { slim: false, keepAll: true });
      assert.ok(full.ok, "the reference build failed where the shipped one built");
      const a = await settle(file, full, "full"), b = await settle(file, slim, "slim");
      const why = `absent: ${slim.capabilities.absent.join(", ")}`;
      // a whole build that does not boot is not this gate's subject — but it is
      // never counted as agreement either
      if (a.tree === null) { console.log(`    (the whole build does not boot: ${a.errors[0] ?? "no bridge answered"})`); return; }
      assert.deepEqual(b.errors, a.errors, `page errors differ — ${why}`);
      // A difference counts only when the program is STILL: time is pinned, but
      // a playing video or a live stream moves on its own, so a mismatch is
      // checked against a second settle of the whole build first.
      let again = null;
      const still = async () => (again ??= await settle(file, full, "full2"));
      if (JSON.stringify(b.tree) !== JSON.stringify(a.tree)) {
        const c = (await still()).tree;
        if (JSON.stringify(c) !== JSON.stringify(a.tree)) {
          const k = (a.tree ?? []).findIndex((row, j) => JSON.stringify(row) !== JSON.stringify(c?.[j]));
          console.log(`    (not still: its settled tree moves between loads — ${JSON.stringify(a.tree?.[k])} then ${JSON.stringify(c?.[k])})`);
          return;
        }
        const i = (a.tree ?? []).findIndex((row, k) => JSON.stringify(row) !== JSON.stringify(b.tree?.[k]));
        assert.fail(`the settled tree differs at ${JSON.stringify(a.tree?.[i])} ≠ ${JSON.stringify(b.tree?.[i])} (${a.tree?.length} vs ${b.tree?.length} views) — ${why}`);
      }
      if (!a.png.equals(b.png) && (await still()).png.equals(a.png)) assert.fail(`the pixels differ — ${why} — DOM raster (reference / shipped): ${JSON.stringify(a.raster)} / ${JSON.stringify(b.raster)}`);
    });
  }
  await browser.close();
  server.close();
}

summarize("slim-corpus");
