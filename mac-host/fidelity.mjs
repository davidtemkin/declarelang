// fidelity — the native renderer against the web one, measured.
//
// The perceptual suite already holds DOM and canvas to each other; this is the
// same idea for the third renderer, except a native window cannot be driven by
// puppeteer. So: screenshot the running native app's CONTENT area, render the
// same program in a browser at exactly the same size, and report where they
// differ — overall, and per tile so a regression names its own neighbourhood.
//
//   node fidelity.mjs [url] [--tiles] [--out DIR]
//
// Text will never be byte-identical (Core Text vs Skia rasterize glyphs
// differently — Safari is the closer cousin), so the number that matters is
// GEOMETRY: tiles that differ by a lot mean something is in the wrong place,
// while a low uniform haze over text is expected and fine.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const URL_ARG = process.argv.find((a) => a.startsWith("http")) ??
  "http://127.0.0.1:8260/apps/desktop/desktop.declare";
const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return i > 0 ? process.argv[i + 1] : "/tmp/fidelity";
})();
mkdirSync(OUT, { recursive: true });

const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const TITLEBAR = 28;          // points of window chrome above the content
const W = 1280, H = 800;      // the content size both sides render at

// ── the native side: find the window, capture it, crop off the title bar ────
function nativeShot(file) {
  const info = execFileSync("/tmp/winb2").toString().trim().split("\n")[0];
  if (!info) throw new Error("the native app is not running");
  const [id, x, y, w, h] = info.split(" ").map(Number);
  execFileSync("/usr/sbin/screencapture", ["-x", "-o", "-l", String(id), file]);
  // Crop the window chrome off EXACTLY. (sips --cropOffset does not mean
  // "from the top" — it left the title bar in, which is precisely the 32pt
  // phantom offset that made every early comparison look misaligned. PIL
  // crops from an explicit box, so the geometry is unambiguous.)
  const geom = readFileSync("/tmp/declare-geom.txt", "utf8").trim().split(" ").map(Number);
  const chrome = geom[4] ?? 32;               // the app publishes its own chrome height
  const scale = 2;
  // ALSO convert out of the display profile. screencapture tags its output with
  // the panel's profile ("Color LCD"), while headless Chrome writes untagged
  // sRGB. Comparing those numbers directly is comparing two colour spaces: it
  // reported the wallpaper as ~6% differing when the two renders agreed to
  // within a couple of levels. Converting to sRGB first is the difference
  // between measuring fidelity and measuring the panel's gamut.
  execFileSync("/usr/bin/python3", ["-c",
    `from PIL import Image, ImageCms\n` +
    `import io\n` +
    `f = ${JSON.stringify(file)}\n` +
    `src = Image.open(f)\n` +
    `icc = src.info.get("icc_profile")\n` +
    `im = src.convert("RGB")\n` +
    `if icc:\n` +
    `    im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile("sRGB"), outputMode="RGB")\n` +
    `im.crop((0, ${chrome * scale}, ${W * scale}, ${chrome * scale} + ${H * scale})).save(f)\n`
  ], { stdio: "ignore" });
  return { id, x, y, w, h };
}

// ── the web side ────────────────────────────────────────────────────────────
async function webShot(file, render) {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: true, args: ["--no-sandbox", "--force-device-scale-factor=2"],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 2 },
  });
  const p = await b.newPage();
  const u = URL_ARG + (render === "dom" ? "" : (URL_ARG.includes("?") ? "&" : "?") + "render=" + render);
  await p.goto(u, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForFunction(() => globalThis.__declare?.find?.("app") != null, { timeout: 40000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3500));
  await p.screenshot({ path: file });
  await b.close();
}

// ── the comparison (decode both PNGs in a browser, diff pixels) ─────────────
async function compare(aFile, bFile) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage();
  const a64 = readFileSync(aFile).toString("base64");
  const b64 = readFileSync(bFile).toString("base64");
  const r = await p.evaluate(async (A, B, tileW) => {
    const load = (d) => new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + d;
    });
    const [ia, ib] = await Promise.all([load(A), load(B)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, w, h).data;
    g.clearRect(0, 0, w, h); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, w, h).data;
    let diff = 0, big = 0;
    const cols = Math.ceil(w / tileW), rows = Math.ceil(h / tileW);
    const tiles = Array.from({ length: cols * rows }, () => 0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (d > 24) {
          diff++;
          tiles[Math.floor(y / tileW) * cols + Math.floor(x / tileW)]++;
          if (d > 120) big++;
        }
      }
    }
    const total = w * h;
    const worst = tiles.map((n, i) => ({ n, x: (i % cols) * tileW / 2, y: Math.floor(i / cols) * tileW / 2 }))
      .filter((t) => t.n > 0).sort((a2, b2) => b2.n - a2.n).slice(0, 12)
      .map((t) => `(${t.x},${t.y}) ${(100 * t.n / (tileW * tileW)).toFixed(0)}%`);
    return { size: `${w}x${h}`, diffPct: +(100 * diff / total).toFixed(2), bigPct: +(100 * big / total).toFixed(2), worst };
  }, a64, b64, 160);
  await b.close();
  return r;
}

const nat = path.join(OUT, "native.png");
const web = path.join(OUT, "web.png");
nativeShot(nat);
await webShot(web, "dom");
const r = await compare(nat, web);
console.log(`native vs DOM  ${r.size}  differing ${r.diffPct}%  structural ${r.bigPct}%`);
console.log("worst tiles (point coords):", r.worst.join("  "));
console.log(`  ${nat}\n  ${web}`);
