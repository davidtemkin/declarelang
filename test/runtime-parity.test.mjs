// test/runtime-parity.test.mjs — THIS TREE'S RUNTIME AGAINST MAIN'S, on the
// same programs, under the same scripted interaction.
//
// WHY THIS EXISTS, and why the oracle is main and not the kernel (DT's ruling,
// 2026-09-17): the C kernel is the only implementation of its new mechanisms —
// rule kinds, compiled expressions, cell ownership, decline, the track ring —
// and it has had weeks of use, where main's constraint core has had years.
// Recording the kernel's behavior and calling it expected would freeze whatever
// is wrong with it. Main is the tested artifact, so main is the oracle for
// everything the two share, and a difference is a REGRESSION until argued
// otherwise.
//
// The bug that prompted it: in Desktop, double-clicking a folder in the Files
// window opens a second window (by design). On main that window becomes active;
// in this tree NOTHING ended up focused, every window's chrome greyed out, and
// further clicks did nothing — `active = { app.wm.frontWin == this }` never
// re-ran for the new window, though reading frontWin gave exactly that window.
// No A/B switch changed it, so it is not the rings, the extent rule or the
// layout wave. Nothing in the suite covered window focus, so nothing caught it.
//
// HOW IT RUNS: both trees are served STATICALLY (files only, no dev server), so
// nothing writes into main's tree and each page boots the way a deployed one
// does — the browser compiles the program in-page, or reads the committed
// pre-warm artifact. Each scenario drives the page by pointer, then reads a
// PROBE: a small, stable summary of what the program believes. The two trees'
// probes must be equal.
//
//   node test/runtime-parity.test.mjs                 (main at ../Declare)
//   MAIN_TREE=/path/to/Declare node test/runtime-parity.test.mjs
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THIS_TREE = path.resolve(HERE, "..");
const MAIN_TREE = process.env.MAIN_TREE ?? path.resolve(THIS_TREE, "../Declare");

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean)) if (existsSync(c)) return c;
  return null;
}

const MIME = {
  ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8",
  ".mjs": "text/javascript;charset=utf-8", ".json": "application/json",
  ".css": "text/css;charset=utf-8", ".declare": "text/plain;charset=utf-8",
  ".txt": "text/plain;charset=utf-8", ".wasm": "application/wasm",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".webp": "image/webp", ".md": "text/markdown;charset=utf-8",
};

/** A static host that takes `/apps/**` from ONE tree and everything else — the
 *  runtime bundle, the library, the browser layer, the compiler — from another.
 *
 *  THE SAME APP SOURCE ON BOTH SIDES is what makes this a test of the platform.
 *  Serving each tree whole does not: main's apps have moved on (2026-09-17,
 *  desktop.declare differed by 549 lines), so a difference could be the app, and
 *  the first version of this file passed for exactly that wrong reason.
 *
 *  Read-only, so pointing it at main writes nothing into that tree. */
async function serveTrees(appRoot, platformRoot) {
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); }
    catch { res.writeHead(400); return res.end("bad"); }
    const root = rel.startsWith("/apps/") ? appRoot : platformRoot;
    let fp = path.join(root, rel);
    if (fp !== root && !fp.startsWith(root + path.sep)) { res.writeHead(403); return res.end("no"); }
    try {
      const st = fs.statSync(fp);
      if (st.isDirectory()) fp = path.join(fp, "index.html");
      res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(fs.readFileSync(fp));
    } catch { res.writeHead(404); res.end("not found"); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

// ── the scenarios ───────────────────────────────────────────────────────────
// Each names an app, a script of steps, and a PROBE that runs in the page. The
// probe must read what the PROGRAM believes (its own model), not the pixels: a
// pixel diff between two runtimes is noise, a model diff is a defect.

/** The frontmost copy of a text label, as a click point. Passed to the page as
 *  a real function with an argument — a template-string function does not carry
 *  one, which cost an hour. */
const labelPoint = (page, label) => page.evaluate((want) => {
  const hits = [];
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length > 0) continue;
    if ((el.textContent ?? "").trim() !== want) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    hits.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  const at = hits.sort((a, b) => b.y - a.y)[0];
  return at ? { x: at.x, y: at.y } : null;
}, label);

const SCENARIOS = [
  {
    name: "desktop: opening a folder window leaves it focused",
    app: "apps/desktop/",
    steps: [
      { open: "Files" },                       // one Files window
      { doubleClick: "Background" },           // opens a second, rooted there
    ],
    // A REAL FUNCTION, never a template string: page.evaluate treats a string as
    // an EXPRESSION, so a stringified probe returns the function itself, which
    // serializes to {} — and {} equals {}, so every scenario passed no matter
    // what the runtime did. That false PASS hid this very bug for one round.
    probe: () => {
      const wm = globalThis.__app.wm, wins = wm.windows();
      return {
        windows: wins.length,
        active: wins.filter((w) => w.active === true).length,
        activeIsFront: wins.some((w) => w.active === true && w === wm.frontWin),
        frontResolves: wm.frontWin != null,
        titles: wins.map((w) => String(w.title ?? "")).join("|"),
      };
    },
  },
  {
    name: "desktop: a click after that still selects",
    app: "apps/desktop/",
    steps: [
      { open: "Files" },
      { doubleClick: "Background" },
      { click: "Operational" },
    ],
    probe: () => {
      const wm = globalThis.__app.wm, wins = wm.windows();
      const front = wm.frontWin;
      return { sel: String(front?.selPath ?? ""), title: String(front?.title ?? ""), active: wins.filter((w) => w.active === true).length };
    },
  },
];

async function runScenario(browser, base, sc) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
  await page.goto(base + sc.app, { waitUntil: "networkidle2", timeout: 90000 });
  await page.waitForFunction("window.__app != null", { timeout: 60000 });
  // the app is mounted; wait until its first windows exist rather than guessing
  await page.waitForFunction("(globalThis.__app.wm?.windows?.() ?? []).length > 0", { timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  // WAIT FOR CONDITIONS, never a fixed sleep: a static host compiles the program
  // IN THE BROWSER, so the same page is ready in well under a second when a
  // pre-warmed build answers and several seconds when the compiler has to run.
  const waitLabel = async (label, ms = 25000) => {
    const t0 = Date.now();
    for (;;) {
      const at = await labelPoint(page, label);
      if (at != null && typeof at.x === "number") return at;
      if (Date.now() - t0 > ms) return null;
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  for (const step of sc.steps) {
    if (step.open === "Files") {
      const before = await page.evaluate("__app.wm.windows().length");
      await page.evaluate("__app.launcher.newFiles()");
      await page.waitForFunction((n) => globalThis.__app.wm.windows().length > n, { timeout: 25000 }, before).catch(() => {});
      // the Files window fills from a fetched document model; act only once the
      // rows are actually there, or the scenario tests an emptier tree than the
      // one a person would click on (this cost a false PASS)
      await page.waitForFunction(() => document.querySelectorAll("p, span, div").length > 200, { timeout: 25000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    const label = step.click ?? step.doubleClick;
    const at = await waitLabel(label);
    if (at === null) { await page.close(); return { error: `no "${label}" on screen` }; }
    await page.mouse.click(at.x, at.y);
    if (step.doubleClick) { await new Promise((r) => setTimeout(r, 90)); await page.mouse.click(at.x, at.y); }
    await new Promise((r) => setTimeout(r, 2200));
  }
  const probe = await page.evaluate(sc.probe);
  await page.close();
  if (probe == null || typeof probe !== "object" || Object.keys(probe).length === 0) return { error: "the probe returned nothing — is it a real function?" };
  return { probe, errors };
}

const CHROME = findChrome();
if (CHROME === null) {
  console.log("  (skipping runtime parity — no Chrome found)");
  summarize("runtime-parity");
} else if (!existsSync(path.join(MAIN_TREE, "bundles/declare-boot.js"))) {
  console.log(`  (skipping runtime parity — no built main tree at ${MAIN_TREE})`);
  summarize("runtime-parity");
} else {
  // both sides run THIS tree's apps; only the platform differs
  const mine = await serveTrees(THIS_TREE, THIS_TREE);
  const main = await serveTrees(THIS_TREE, MAIN_TREE);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  for (const sc of SCENARIOS) {
    await test(sc.name, async () => {
      const a = await runScenario(browser, main.url, sc);
      const b = await runScenario(browser, mine.url, sc);
      if (process.env.PARITY_DEBUG) console.log(`      main: ${JSON.stringify(a.probe)}\n      here: ${JSON.stringify(b.probe)}${b.errors?.length ? "\n      errors here: " + b.errors.slice(0, 2).join(" | ") : ""}`);
      assert.equal(a.error ?? null, null, "main: " + a.error);
      assert.equal(b.error ?? null, null, "this tree: " + b.error);
      assert.deepEqual(b.probe, a.probe,
        `this tree's runtime differs from main's.\n    main: ${JSON.stringify(a.probe)}\n    here: ${JSON.stringify(b.probe)}` +
        (b.errors?.length ? `\n    page errors here: ${b.errors.slice(0, 2).join(" | ")}` : ""));
    });
  }
  await browser.close();
  await mine.close();
  await main.close();
  summarize("runtime-parity");
}
