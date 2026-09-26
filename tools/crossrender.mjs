#!/usr/bin/env node
// crossrender — one program, every renderer, compared by LAYOUT.
//
// A pixel diff cannot tell a haze of anti-aliasing from a line box two pixels
// too tall, and a likeness gate cannot see a feature that is simply absent. The
// model can: every renderer lays out the same view tree, so each view's box —
// where it is, how big, where its first baseline sits — is a number that must
// agree. This renders a program on the DOM and canvas backends (headless
// Chrome) and, with --mac, on the native host, dumps every view's absolute box
// from the running model, and reports the views whose boxes disagree with the
// DOM's, by how much. A measurement difference shows up here exactly, named by
// its path in the tree, with nothing lost to rasterization.
//
//   node tools/crossrender.mjs <file.declare | dir>… [--mac] [--tol 1] [--top 12] [--json out.json]
//     [--pixels [--baseline f] [--mac-baseline f] [--bless] [--save dir]]
//
// Rich text's internal pieces are skipped: the canvas lays a flow out as child
// views where the DOM and the Mac flow it natively, so only the flow's own box
// is comparable (and is compared).

import { readFileSync, writeFileSync, existsSync, unlinkSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import puppeteer from "puppeteer-core";
import { hostBinary, CTL_IN, CTL_OUT } from "../mac-host/app.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const TOL = Number(opt("--tol", "1"));
const TOP = Number(opt("--top", "12"));
const JSON_OUT = opt("--json", null);
/** An address fragment every renderer loads with — `--hash matrix` opens Swatchbook's matrix. */
const HASH = opt("--hash", null);
const withHash = (u) => (HASH === null ? u : u + "#" + HASH);
/** Compare PIXELS too, DOM against canvas, one region per swatch (a view whose
 *  class name ends in "Swatch"): a page tall enough to show everything at
 *  once, one screenshot each, each swatch's box diffed. */
const PIXELS = flag("--pixels");
const PIX_TOL = Number(opt("--pixtol", "2"));
/** A recorded per-swatch baseline (`--baseline file`): a swatch fails when it
 *  differs more than it did when blessed (plus a point), so anti-aliasing and
 *  resampling that were always there do not fail and a regression does.
 *  `--bless` writes the current numbers. */
const BASELINE = opt("--baseline", null);
const BLESS = flag("--bless");
/** Keep the screenshots (dom.png, canvas.png) in this directory, to look at a swatch. */
const SAVE = opt("--save", null);   // % of a swatch's pixels allowed to differ
const MAC = flag("--mac");
/** With --mac --pixels: the Mac's own per-swatch baseline (Mac against DOM). */
const MAC_BASELINE = opt("--mac-baseline", null);
const valued = new Set(["--tol", "--top", "--json", "--hash", "--pixtol", "--save", "--baseline", "--mac-baseline"]);
const inputs = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
const files = inputs.flatMap((p) => statSync(p).isDirectory()
  ? readdirSync(p).filter((f) => f.endsWith(".declare")).sort().map((f) => path.join(p, f))
  : [p]);
// A file with no App is a fragment another program includes, not a program.
// a program declares an App — in its code, not in a doc comment's example (an
// include like homepage/fonts.declare shows `App [ … ]` in its prose)
const uncommented = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const programs = files.filter((f) => /^\s*App\s*\[/m.test(uncommented(readFileSync(f, "utf8"))));
const skipped = files.length - programs.length;
files.length = 0; files.push(...programs);
if (skipped > 0) console.log(`(${skipped} include fragment(s) skipped — no App)`);
if (files.length === 0) { console.error("usage: crossrender <file.declare | dir>… [--mac] [--tol px] [--top n] [--json out]"); process.exit(2); }

// The dump, as SOURCE: the same text runs in Chrome's page and in the native
// host's context, so both sides walk the tree by one rule — the inspector's
// (`__declare.inspect`): real class names through minification, declared names
// in the path, boxes in root coordinates (transforms included). One line — the
// host's control channel reads a line.
const DUMP = `(() => { const out = [];
  const a0 = globalThis.__app;
  if (a0 && typeof a0.errors === "string" && typeof a0.listHtml === "string") return JSON.stringify({ loadError: a0.errors.replace(/\\s+/g, " ").slice(0, 300) });
  const walk = (n) => {
    const rec = { p: n.path, c: n.kind, n: n.name || "", x: Math.round(n.rootX * 100) / 100, y: Math.round(n.rootY * 100) / 100,
      w: Math.round(n.rootWidth * 100) / 100, h: Math.round(n.rootHeight * 100) / 100, vis: n.shown !== false };
    const v = __declare.find(n.path);
    if (v && typeof v.text === "string") rec.t = v.text.slice(0, 32);
    if (v && typeof v.html === "string") rec.t = v.html.replace(/<[^>]+>/g, "").slice(0, 32);
    if (v && typeof v.baseline === "number") rec.b = Math.round(v.baseline * 100) / 100;
    out.push(rec);
    if (v && v.flowWidth !== undefined && Array.isArray(v.content)) return;
    for (const c of n.children || []) if (c.rootWidth !== undefined) walk(c);
  };
  walk(__declare.inspect()); return JSON.stringify(out); })()`.replace(/\n\s*/g, " ");

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync);

const ORIGIN = process.env.DECLARE_ORIGIN ?? "http://127.0.0.1:8200";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const urlOf = (file) => {
  const rel = path.relative(ROOT, path.resolve(file));
  if (rel.startsWith("..")) throw new Error(`${file} is outside the distro, which the dev server serves`);
  return `${ORIGIN}/${rel.split(path.sep).join("/")}`;
};

/** The pixel pass's page: wide and tall enough that a whole sheet of swatches
 *  is on screen at once (a screenshot is capped near 16k px a side). */
const PIX_VIEW = { width: 3000, height: 16000 };

async function chromeDump(browser, file, mode, tall = PIXELS) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.setViewport(tall ? PIX_VIEW : { width: 1280, height: 800 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  // Not network-idle: a program that polls or streams never goes idle. Loaded,
  // the inspector present, the fonts in, then a beat for the settle.
  let json = null, png = null;
  try {
    await page.goto(withHash(urlOf(file) + (mode === "canvas" ? "?render=canvas" : "")), { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => typeof __declare === "object" && typeof __declare.inspect === "function" && __declare.inspect() != null, { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(1.2);
    json = await atRest(() => page.evaluate(DUMP));
    if (tall && json !== MOVING) png = (await page.screenshot({ encoding: "base64" }));
    if (json === MOVING) { await page.close(); return { moving: true }; }
    const failed = JSON.parse(json).loadError;
    if (failed !== undefined) { await page.close(); return { error: "the program did not load: " + failed }; }
  } catch (e) { errs.push(e.message); }
  await page.close();
  if (json === null) return { error: errs[0] ?? "the page has no inspector (is the dev server running?)" };
  return { nodes: JSON.parse(json), errs, png };
}

/** A dump taken once the program has come to rest: two in a row, a beat
 *  apart, that agree — an intro animation or a counter still rolling is caught
 *  mid-flight otherwise, and reads as a layout difference. */
async function atRest(take, tries = 12) {
  let prev = await take();
  const moving = new Set();
  for (let i = 0; i < tries; i++) {
    await sleep(0.4);
    const next = await take();
    if (geometry(next) === geometry(prev)) return next;
    // Something keeps moving. A view drifting on purpose (a sky photo's slow
    // pan) should not cost the comparison of everything else: note which views
    // move, and once the rest has been still for a dump, compare without them.
    let a, b;
    try { a = JSON.parse(prev); b = JSON.parse(next); } catch { prev = next; continue; }
    if (!Array.isArray(a) || !Array.isArray(b)) { prev = next; continue; }
    const at = new Map(a.map((n) => [n.p, n]));
    for (const n of b) { const o = at.get(n.p); if (!o || o.x !== n.x || o.y !== n.y || o.w !== n.w || o.h !== n.h) moving.add(n.p); }
    if (moving.size > b.length / 2) return MOVING;
    const still = (arr) => JSON.stringify(arr.filter((n) => !moving.has(n.p)).map((n) => [n.p, n.x, n.y, n.w, n.h]));
    if (i > 0 && still(a) === still(b)) return JSON.stringify(b.map((n) => (moving.has(n.p) ? { ...n, moving: true } : n)));
    prev = next;
  }
  return MOVING;
}
/** The boxes alone — a clock's text changing every second is not motion. */
const geometry = (json) => { try { return JSON.stringify(JSON.parse(json).map((n) => [n.p, n.x, n.y, n.w, n.h])); } catch { return json; } };
/** A program that never comes to rest (a clock, a loop): there is no one layout to compare. */
const MOVING = "~moving";

let host = null;
async function ctl(cmd, tries = 400) {
  if (existsSync(CTL_OUT)) unlinkSync(CTL_OUT);
  writeFileSync(CTL_IN, cmd + "\n");
  for (let i = 0; i < tries; i++) { await sleep(0.02); if (existsSync(CTL_OUT)) return readFileSync(CTL_OUT, "utf8").trim(); }
  return null;
}
async function macDump(file) {
  if (host === null) {
    host = spawn(hostBinary(), [], { detached: true, stdio: "ignore",
      // light, as headless Chrome is: a machine in dark mode otherwise hands
      // the Mac the dark theme and every colour differs
      env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_APPEARANCE: "light", DECLARE_URL: withHash(urlOf(file)) } });
    for (let i = 0; i < 150 && (await ctl("ping", 10)) !== "ok"; i++) await sleep(0.1);
    // the window sits behind whatever the person is using (or the screen is
    // locked): a host that counts itself hidden idles its animations, and a
    // spring caught mid-flight reads as a layout difference
    await ctl("occlusion ignore");
  } else {
    // `__declareBoot` announces the new load to the host asynchronously, so a
    // `waitload` sent straight after it can be answered by the PREVIOUS
    // program's verdict (and the dump read from its tree): wait until another
    // app is mounted first
    await ctl(`eval globalThis.__crossrenderPrev = globalThis.__app; __declareBoot(${JSON.stringify(withHash(urlOf(file) + "?render=mac"))}); "ok"`);
    for (let i = 0; i < 300; i++) {
      if ((await ctl("eval String(globalThis.__app != null && globalThis.__app !== globalThis.__crossrenderPrev)", 50)) === "true") break;
      await sleep(0.05);
    }
  }
  // The host says when the load has an outcome (`waitload`): no guessed sleep,
  // and a failure is known the moment the host knows it.
  const verdict = await ctl("waitload 30", 2000);
  if (verdict !== null && verdict.startsWith("error")) return { error: "the program did not load: " + verdict.slice(7).replace(/\s+/g, " ").slice(0, 300) };
  if (verdict === "timeout") return { error: "the program did not finish loading in 30s" };
  const r = await atRest(() => ctl("eval " + DUMP));
  if (r === MOVING) return { moving: true };
  if (r !== null && r.startsWith("{")) return { error: "the program did not load: " + JSON.parse(r).loadError };
  if (r === null || !r.startsWith("[")) return { error: r ?? "no reply from the host" };
  return { nodes: JSON.parse(r) };
}

/** The views whose boxes differ from the reference by more than TOL. */
function compare(ref, other) {
  const byPath = new Map(other.map((n) => [n.p, n]));
  const diffs = [];
  let missing = 0;
  for (const a of ref) {
    const b = byPath.get(a.p);
    if (b === undefined) { missing++; continue; }
    if (!a.vis && !b.vis) continue;
    if (a.moving || b.moving) continue;   // drifting on purpose: not a layout to compare
    const d = { dx: b.x - a.x, dy: b.y - a.y, dw: b.w - a.w, dh: b.h - a.h,
      db: a.b !== undefined && b.b !== undefined ? b.b - a.b : 0 };
    const worst = Math.max(...Object.values(d).map(Math.abs));
    if (worst > TOL) diffs.push({ path: a.p, cls: a.c, name: a.n, text: a.t, ...d, worst });
  }
  // THE ORIGINS: a view whose own size or baseline differs, with no descendant
  // whose size differs — the deepest place the renderers disagree. Everything
  // else on the list moved or grew because of one of these.
  const sized = diffs.filter((d) => Math.abs(d.dw) > TOL || Math.abs(d.dh) > TOL || Math.abs(d.db) > TOL);
  let own = sized.filter((d) => !sized.some((q) => q !== d && q.path.startsWith(d.path + ".")));
  // Nothing changed size, yet something moved: the shallowest moved views are the story.
  if (own.length === 0) own = diffs.filter((d) => !diffs.some((q) => q !== d && d.path.startsWith(q.path + ".")));
  return { diffs: own, total: diffs.length, missing, extra: other.length - (ref.length - missing) };
}

/** Each swatch's share of differing pixels between two screenshots, diffed in a
 *  browser (canvas getImageData), so no image library is needed. */
async function swatchDiffs(browser, pngA, pngB, rects, scale = 1, offB = { x: 0, y: 0 }) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async (a, b, rects, scale, offB) => {
      const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = "data:image/png;base64," + s; });
      const [A, B] = [await load(a), await load(b)];
      // each screenshot drawn ONCE, every swatch read out of it — drawing the
      // whole page per swatch re-decoded it per swatch (minutes, at 683)
      const sheet = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0); return x; };
      const [SA, SB] = [sheet(A), sheet(B)];
      return rects.map((r) => {
        const x = Math.round(r.x * scale), y = Math.round(r.y * scale), w = Math.round(r.w * scale), h = Math.round(r.h * scale);
        const da = SA.getImageData(x, y, w, h).data, db = SB.getImageData(x + offB.x, y + offB.y, w, h).data;
        let n = 0;
        for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) n++;
        return { ...r, pct: (100 * n) / (w * h) };
      });
    }, pngA, pngB, rects, scale, offB);
  } finally { await page.close(); }
}

/** Swatch rects out of a dump, each named by its caption (a repeated caption
 *  numbered, so a baseline keeps one key per swatch). */
function swatchRects(nodes, keep = () => true) {
  const seen = new Map();
  return nodes.filter((n) => /Swatch$/.test(n.c) && n.vis && n.w > 0 && n.h > 0).map((n) => {
    const cap = (nodes.find((q) => q.p === n.p + ".cap") ?? {}).t ?? n.p;
    const k = (seen.get(cap) ?? 0) + 1;
    seen.set(cap, k);
    return { p: n.p, name: k === 1 ? cap : `${cap} #${k}`, x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h) };
  }).filter(keep);
}

/** THE MAC'S PIXELS, per swatch, against the DOM. The Mac window is an
 *  ordinary window, so the sheet is paged: the swatches' scroller is scrolled
 *  in step on both sides — the host's window and a Chrome page of the same
 *  size and density — and each page compares the swatches wholly on screen.
 *  The window is captured by its own number (never "the front window": the
 *  automated one is ordered to the back), covered or not, and its Display P3
 *  tag is converted to sRGB before any number is read. */
async function macPixels(browser, file) {
  await ctl("occlusion ignore");
  const win = /#(\d+) (\d+)x(\d+)/.exec((await ctl("windows")) ?? "");
  const geom = /content (\d+)x(\d+)/.exec((await ctl("geom")) ?? "");
  if (win === null || geom === null) return { error: "the host did not say where its window is" };
  const [W, H] = [Number(geom[1]), Number(geom[2])];
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  await page.goto(withHash(urlOf(file)), { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof __declare === "object" && typeof __declare.inspect === "function" && __declare.inspect() != null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(1.2);
  const nodes = JSON.parse(await atRest(() => page.evaluate(DUMP)));
  const all = swatchRects(nodes);
  if (all.length === 0) { await page.close(); return { diffs: [] }; }
  // the swatches' scroller, found from the first swatch, scrolled by one rule on both sides
  const scrollTo = (y) => `(() => { let v = __declare.find(${JSON.stringify(all[0].p)}); while (v && !(v.scrolls === "y" || v.scrolls === "both" || v.scrolls === true)) v = v.parent; if (!v) return "none"; v.scrollY = ${y}; return JSON.stringify([v.rootBounds ? v.rootBounds().y : 0, v.height]); })()`;
  const band = JSON.parse(await page.evaluate(scrollTo(0)));
  const [top, vh] = band;
  const diffs = [], done = new Set(), shots = [];
  let s = 0;
  const tmp = path.join(tmpdir(), `crossrender-mac-${process.pid}`);
  for (let guard = 0; guard < 200 && done.size < all.length; guard++) {
    await page.evaluate(scrollTo(s));
    await ctl("eval " + scrollTo(s));
    await sleep(0.6);
    const pageNodes = JSON.parse(await page.evaluate(DUMP));
    const on = swatchRects(pageNodes, (r) => r.y >= top && r.y + r.h <= top + vh && !done.has(r.name));
    if (on.length > 0) {
      const dom = await page.screenshot({ encoding: "base64" });
      try { execFileSync("/usr/sbin/screencapture", ["-x", "-o", "-l", win[1], tmp + ".png"], { stdio: "pipe" }); }
      catch (e) {
        // WindowServer hands out no window images while the session is locked
        await page.close();
        return { error: `the window could not be captured (${String(e.stderr ?? e).trim()}) — is the screen locked?` };
      }
      execFileSync("/usr/bin/sips", ["--matchTo", "/System/Library/ColorSync/Profiles/sRGB Profile.icc", tmp + ".png", "--out", tmp + "-srgb.png"], { stdio: "ignore" });
      const mac = readFileSync(tmp + "-srgb.png").toString("base64");
      // the capture is the whole window: its content sits below the title bar
      const capH = Number(/pixelHeight: (\d+)/.exec(execFileSync("/usr/bin/sips", ["-g", "pixelHeight", tmp + "-srgb.png"], { encoding: "utf8" }))[1]);
      const off = { x: 0, y: capH - H * 2 };
      if (SAVE !== null) { writeFileSync(path.join(SAVE, `mac-dom-${guard}.png`), Buffer.from(dom, "base64")); writeFileSync(path.join(SAVE, `mac-${guard}.png`), Buffer.from(mac, "base64")); writeFileSync(path.join(SAVE, `mac-swatches-${guard}.json`), JSON.stringify({ off, rects: on })); }
      // diffed after every page is captured: a tab opened mid-sequence (the
      // diff's own) has made Chrome drop a blended layer from the next capture
      shots.push({ dom, mac, on, off });
      for (const r of on) done.add(r.name);
    }
    // next page: the first swatch not yet compared, at the top of the band
    const rest = all.filter((r) => !done.has(r.name));
    if (rest.length === 0) break;
    const next = Math.min(...rest.map((r) => r.y)) - top;
    s = next > s ? next : s + Math.max(1, vh - 200);
  }
  await page.close();
  await ctl("eval " + scrollTo(0));
  for (const sh of shots) diffs.push(...await swatchDiffs(browser, sh.dom, sh.mac, sh.on, 2, sh.off));
  return { diffs, missed: all.length - done.size };
}

const fmt = (n) => (n > 0 ? "+" : "") + (Math.round(n * 10) / 10);
const report = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  for (const file of files) {
    const dom = await chromeDump(browser, file, "dom");
    if (dom.moving) { console.log(`· ${file}: never comes to rest — not compared`); report.push({ file, moving: true }); continue; }
    if (dom.error) { console.log(`✗ ${file}: DOM did not render — ${dom.error}`); report.push({ file, error: dom.error }); continue; }
    const sides = { canvas: await chromeDump(browser, file, "canvas") };
    if (MAC) sides.mac = await macDump(file);
    // The pixel pass renders a page tall enough to show everything; the Mac's
    // window is ordinary, so its layout is compared with an ordinary DOM render.
    const macRef = MAC && PIXELS ? await chromeDump(browser, file, "dom", false) : dom;
    const row = { file, views: dom.nodes.length, renderers: {} };
    const lines = [];
    for (const [name, side] of Object.entries(sides)) {
      if (side.error) { row.renderers[name] = { error: side.error }; lines.push(`    ${name}: did not render — ${side.error}`); continue; }
      if (side.moving) { row.renderers[name] = { moving: true, total: 0, diffs: [] }; lines.push(`    ${name}: never comes to rest — not compared`); continue; }
      const c = compare(name === "mac" && macRef.nodes ? macRef.nodes : dom.nodes, side.nodes);
      row.renderers[name] = c;
      const struct = c.missing || c.extra ? ` · tree differs (${c.missing} missing, ${c.extra} extra)` : "";
      const verdict = c.total === 0 ? "✓ agrees" : `${c.diffs.length} origin(s), ${c.total} view(s) affected`;
      lines.push(`    ${name}: ${verdict}${struct}`);
      for (const d of c.diffs.sort((p, q) => q.worst - p.worst).slice(0, TOP)) {
        const parts = ["dx", "dy", "dw", "dh", "db"].filter((k) => Math.abs(d[k]) > TOL).map((k) => `${k} ${fmt(d[k])}`).join(" ");
        lines.push(`      ${parts.padEnd(28)} ${d.cls}${d.name ? " " + d.name : ""}${d.text ? ` "${d.text}"` : ""}  ${d.path}`);
      }
    }
    if (PIXELS && dom.png && sides.canvas.png) {
      const all = swatchRects(dom.nodes);
      const rects = all.filter((r) => r.y + r.h <= PIX_VIEW.height);
      if (rects.length < all.length) lines.push(`    pixels: ⚠ ${all.length - rects.length} swatch(es) below the ${PIX_VIEW.height}px page, not compared`);
      if (SAVE !== null) {
        writeFileSync(path.join(SAVE, "dom.png"), Buffer.from(dom.png, "base64"));
        writeFileSync(path.join(SAVE, "canvas.png"), Buffer.from(sides.canvas.png, "base64"));
        writeFileSync(path.join(SAVE, "swatches.json"), JSON.stringify(rects));
      }
      const diffs = (await swatchDiffs(browser, dom.png, sides.canvas.png, rects)).sort((a, b) => b.pct - a.pct);
      const base = BASELINE !== null && existsSync(BASELINE) && !BLESS ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
      const allowed = (d) => (base !== null && base[d.name] !== undefined ? Math.max(PIX_TOL, base[d.name] + 1) : PIX_TOL);
      const over = diffs.filter((d) => d.pct > allowed(d));
      if (BLESS && BASELINE !== null) {
        writeFileSync(BASELINE, JSON.stringify(Object.fromEntries(diffs.map((d) => [d.name, +d.pct.toFixed(2)])).valueOf(), null, 1) + "\n");
        lines.push(`    pixels: baseline written — ${diffs.length} swatches (${BASELINE})`);
      }
      row.pixels = { swatches: diffs.length, over: over.map((d) => ({ name: d.name, pct: +d.pct.toFixed(2) })) };
      const against = base !== null ? "their baseline" : `${PIX_TOL}%`;
      lines.push(`    pixels (canvas vs DOM): ${over.length === 0 ? `✓ ${diffs.length} swatches within ${against}` : `${over.length} of ${diffs.length} swatches over ${against}`}`);
      for (const d of over.slice(0, TOP)) lines.push(`      ${d.pct.toFixed(2).padStart(6)}%  ${d.name}${base && base[d.name] !== undefined ? ` (baseline ${base[d.name]}%)` : ""}`);
      if (over.length > 0) row.renderers.canvas.total += over.length;
    }
    if (PIXELS && MAC && row.renderers.mac && !row.renderers.mac.error) {
      const mp = await macPixels(browser, file);
      if (mp.error) lines.push(`    pixels (Mac vs DOM): ${mp.error}`);
      else {
        const diffs = mp.diffs.sort((a, b) => b.pct - a.pct);
        const base = MAC_BASELINE !== null && existsSync(MAC_BASELINE) && !BLESS ? JSON.parse(readFileSync(MAC_BASELINE, "utf8")) : null;
        const allowed = (d) => (base !== null && base[d.name] !== undefined ? Math.max(PIX_TOL, base[d.name] + 1) : PIX_TOL);
        const over = diffs.filter((d) => d.pct > allowed(d));
        if (BLESS && MAC_BASELINE !== null) {
          writeFileSync(MAC_BASELINE, JSON.stringify(Object.fromEntries(diffs.map((d) => [d.name, +d.pct.toFixed(2)])), null, 1) + "\n");
          lines.push(`    pixels (Mac): baseline written — ${diffs.length} swatches (${MAC_BASELINE})`);
        }
        const against = base !== null ? "their baseline" : `${PIX_TOL}%`;
        lines.push(`    pixels (Mac vs DOM): ${over.length === 0 ? `✓ ${diffs.length} swatches within ${against}` : `${over.length} of ${diffs.length} swatches over ${against}`}${mp.missed ? ` — ⚠ ${mp.missed} never wholly on screen` : ""}`);
        for (const d of over.slice(0, TOP)) lines.push(`      ${d.pct.toFixed(2).padStart(6)}%  ${d.name}${base && base[d.name] !== undefined ? ` (baseline ${base[d.name]}%)` : ""}`);
        if (over.length > 0) row.renderers.mac.total += over.length;
      }
    }
    const clean = Object.values(row.renderers).every((r) => !r.error && r.total === 0);
    console.log(`${clean ? "✓" : "✗"} ${file} (${dom.nodes.length} views)`);
    if (!clean) console.log(lines.join("\n"));
    report.push(row);
  }
} finally {
  await browser.close();
  if (host !== null) { await ctl("closewindow", 50); try { process.kill(host.pid); } catch {} }
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.error || Object.values(r.renderers ?? {}).some((x) => x.error || x.total > 0)).length;
console.log(`\ncrossrender: ${report.length} program(s), ${report.length - bad} agree, ${bad} differ`);
process.exitCode = bad > 0 ? 1 : 0;
