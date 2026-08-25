// drawconform — WHICH drawing op diverges, per renderer.
//
//   node mac-host/drawconform.mjs                 # chrome-canvas vs chrome-dom vs mac
//   node mac-host/drawconform.mjs --only mac      # skip the web-vs-web column
//   node mac-host/drawconform.mjs --out /tmp/dc   # keep the PNGs
//
// The existing visual rigs answer "is it the same picture": fidelity.mjs scores
// a whole app over 160px tiles, and the perceptual suite holds DOM and canvas to
// each other. Neither answers "which OP is wrong", which is the only question
// worth asking while bringing a renderer into spec.
//
// So this renders test/probe/drawops.declare — one feature per cell, on a fixed
// grid — and scores CELL BY CELL. The cell manifest is read off the running
// program (`app.cells`), never kept here, so the probe can grow without this
// file knowing.
//
// CHROME-CANVAS IS THE REFERENCE. Not because it is authoritative in principle,
// but because it is the engine the spec is written against in practice, and
// because the Mac host replays the same display list our canvas backend does —
// so a divergence is ours, not the platform's.
//
// ⚠ Two traps this inherits from fidelity.mjs, both of which produce large,
// stable, entirely false numbers:
//   • THEME. The native host follows the machine's appearance; headless Chrome
//     starts light. A host on a dark machine once reported a calendar 99.98%
//     differing against a 0.62% baseline. The web side is told which theme to
//     emulate rather than left to guess.
//   • COLOUR PROFILE. screencapture tags its output with the panel's profile
//     while Chrome writes untagged sRGB; comparing them directly measures the
//     gamut, not the renderer.
//
// ⚠ And one of its own: TEXT IS SCORED SEPARATELY. Core Text will never match
// Skia glyph for glyph, so a text cell carries its own budget. A text cell that
// fails here has moved or resized, which is a real bug; one that differs by a
// uniform haze has not.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { hostWindow } from "./win.mjs";
import { hostBinary, NO_HOST } from "./app.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const OUT = (() => { const i = process.argv.indexOf("--out"); return i > 0 ? process.argv[i + 1] : "/tmp/drawconform"; })();
const ONLY = (() => { const i = process.argv.indexOf("--only"); return i > 0 ? process.argv[i + 1] : ""; })();
mkdirSync(OUT, { recursive: true });

// the probe's own size — the window and the viewport must both be this, or the
// cell grid lands at different pixel coordinates on the two sides
const W = 1200, H = 750;
const SCALE = 2;
// what counts as a differing pixel, and what counts as a structural one —
// the same thresholds fidelity.mjs uses, so the two rigs speak one language
const DIFF = 24, BIG = 120;
// a cell's budget. Text gets its own because rasterizers differ on glyphs; the
// rest must genuinely agree.
const BUDGET = { normal: 2.0, text: 22.0 };

const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${httpServer.address().port}`;
const URL_ = `${ORIGIN}/test/probe/drawops.declare`;

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** Launch the host on the probe, in a PINNED appearance.
 *
 *  ⚠ `pkill -f DeclareMac` does not match the installed binary — it is
 *  "Declare Mac", with a space (mac-host/app.mjs says so, and parity.mjs still
 *  has the old spelling). A kill that silently matches nothing leaves the
 *  previous host up, and the shot is then of the PREVIOUS program.
 *
 *  Appearance is pinned rather than read, because the whole comparison is void
 *  if the two sides disagree about it — and pinning is cheaper than detecting. */
async function launchNative(url) {
  const bin = hostBinary();
  if (bin === null) { console.error(NO_HOST); process.exit(1); }
  for (const pat of ["Declare Mac", "DeclareMac"]) {
    try { execFileSync("/usr/bin/pkill", ["-f", pat]); } catch { /* none running */ }
  }
  await sleep(1.2);
  spawn(bin, [], {
    detached: true, stdio: "ignore",
    env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_APPEARANCE: "light", DECLARE_URL: url },
  }).unref();
  // the window has to exist AND have painted; poll rather than guess
  for (let i = 0; i < 60; i++) {
    await sleep(0.5);
    try { hostWindow(); if (i > 4) return true; } catch { /* not up yet */ }
  }
  return false;
}

function hostState() {
  try {
    const parts = readFileSync("/tmp/declare-geom.txt", "utf8").trim().split(" ");
    return { chrome: Number(parts[4] ?? 32), scheme: parts[6] === "dark" ? "dark" : "light" };
  } catch { return { chrome: 32, scheme: "light" }; }
}

async function webShot(file, render, scheme, readCells) {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ["--no-sandbox", "--force-device-scale-factor=2"],
    defaultViewport: { width: W, height: H, deviceScaleFactor: SCALE },
  });
  const p = await b.newPage();
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await p.goto(URL_ + "?render=" + render, { waitUntil: "networkidle0", timeout: 60000 });
  await p.waitForFunction("window.__app != null", { timeout: 40000 });
  await new Promise((r) => setTimeout(r, 900));
  const cells = readCells ? await p.evaluate("Array.from(window.__app.cells)") : null;
  await p.screenshot({ path: file });
  await b.close();
  return cells;
}

function nativeShot(file) {
  const { id } = hostWindow();
  execFileSync("/usr/sbin/screencapture", ["-x", "-o", "-l", String(id), file]);
  const chrome = hostState().chrome;
  execFileSync("/usr/bin/python3", ["-c",
    `from PIL import Image, ImageCms\nimport io\n` +
    `f = ${JSON.stringify(file)}\n` +
    `src = Image.open(f)\nicc = src.info.get("icc_profile")\nim = src.convert("RGB")\n` +
    `if icc:\n    im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile("sRGB"), outputMode="RGB")\n` +
    `im.crop((0, ${chrome * SCALE}, ${W * SCALE}, ${chrome * SCALE} + ${H * SCALE})).save(f)\n`
  ], { stdio: "ignore" });
}

/** Diff two PNGs cell by cell, returning one row per cell. Decoding happens in
 *  a browser because that is the one PNG decoder already on hand. */
async function compareCells(aFile, bFile, cells, cols, cw, ch) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage();
  const A = readFileSync(aFile).toString("base64");
  const B = readFileSync(bFile).toString("base64");
  const rows = await p.evaluate(async (a64, b64, names, ncols, cellW, cellH, scale, dTh, bTh) => {
    const load = (d) => new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + d;
    });
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, w, h).data;
    g.clearRect(0, 0, w, h); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, w, h).data;
    const out = [];
    for (let n = 0; n < names.length; n++) {
      const x0 = (n % ncols) * cellW * scale, y0 = Math.floor(n / ncols) * cellH * scale;
      const x1 = Math.min(w, x0 + cellW * scale), y1 = Math.min(h, y0 + cellH * scale);
      let diff = 0, big = 0, total = 0, sum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
          total++; sum += d;
          if (d > dTh) { diff++; if (d > bTh) big++; }
        }
      }
      out.push({ name: names[n],
        diffPct: total ? +(100 * diff / total).toFixed(2) : 0,
        bigPct: total ? +(100 * big / total).toFixed(2) : 0,
        meanD: total ? +(sum / total / 3).toFixed(2) : 0 });
    }
    return out;
  }, A, B, cells, cols, cw, ch, SCALE, DIFF, BIG);
  await b.close();
  return rows;
}

function report(label, rows) {
  console.log(`\n──── ${label} ────`);
  console.log("  " + "cell".padEnd(20) + "diff%".padStart(8) + "struct%".padStart(9) + "meanΔ".padStart(8) + "  verdict");
  const bad = [];
  for (const r of rows) {
    const isText = /text/i.test(r.name);
    const budget = isText ? BUDGET.text : BUDGET.normal;
    const over = r.diffPct > budget;
    if (over) bad.push(r.name);
    console.log("  " + r.name.padEnd(20) + String(r.diffPct).padStart(8) + String(r.bigPct).padStart(9) +
      String(r.meanD).padStart(8) + "  " + (over ? "◀ DIVERGES" : isText ? "ok (text budget)" : "ok"));
  }
  console.log(bad.length ? `  ${bad.length} diverging: ${bad.join(" ")}` : "  all cells within budget");
  return bad;
}

// pinned on BOTH sides — see launchNative
const scheme = "light";
const refPng = path.join(OUT, "chrome-canvas.png");
const domPng = path.join(OUT, "chrome-dom.png");
const macPng = path.join(OUT, "mac.png");

const cells = await webShot(refPng, "canvas", scheme, true);
console.log(`probe: ${cells.length} cells · ${W}x${H} @${SCALE}x · theme ${scheme}`);
const cols = 6, cw = 200, ch = 150;

if (ONLY !== "mac") {
  await webShot(domPng, "dom", scheme, false);
  report("chrome canvas vs chrome DOM", await compareCells(refPng, domPng, cells, cols, cw, ch));
}

let macOk = false;
if (ONLY !== "web") {
  process.stdout.write("launching the native host… ");
  macOk = await launchNative(URL_ + "?render=mac");
  console.log(macOk ? "up" : "NO WINDOW");
}
if (macOk) {
  await sleep(2.5);                       // let the first settle land
  nativeShot(macPng);
  report("chrome canvas vs MAC", await compareCells(refPng, macPng, cells, cols, cw, ch));
  for (const pat of ["Declare Mac", "DeclareMac"]) {
    try { execFileSync("/usr/bin/pkill", ["-f", pat]); } catch { /* already gone */ }
  }
}
console.log(`\n  ${refPng}\n  ${macOk ? macPng : "(no mac shot)"}`);
httpServer.close();
