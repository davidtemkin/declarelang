// make-icon — build Declare.icns from the desktop's own Declare Viewer glyph.
//
//   node make-icon.mjs [origin]
//
// The icon is not redrawn by hand: it is the REAL `AppGlyph` from
// apps/desktop/desktop.declare, instantiated at icon size and screenshotted, so
// the gradient, the corner ratio and the glyph's optical centering are whatever
// the program says they are. Renders through the DOM backend, which is the
// reference for the other two.
//
// The AppGlyph clips to its own rounded rect, so the four corners of the capture
// hold whatever was behind it (the wallpaper). Those pixels are discarded by an
// alpha mask built from the SAME radius the program uses (edge * 0.23) rather
// than keyed out by colour, which would fringe.
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ORIGIN = process.argv[2] ?? process.env.DECLARE_ORIGIN ?? "http://127.0.0.1:8260";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ART = 512;                 // CSS px; at DPR 2 this captures 1024 crisp pixels
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

const b = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=2"],
  defaultViewport: { width: 700, height: 700, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto(`${ORIGIN}/apps/desktop/desktop.declare`, { waitUntil: "networkidle0" });
await sleep(4);

// The dock's own Declare Viewer icon, read off the program so the attributes
// cannot drift from what ships: dvIcon is a DockIcon wrapping an AppGlyph.
const spec = await p.evaluate(() => {
  const d = window.__declare;
  const dv = d.find("app.dock.row.dvIcon");
  const pick = (v) => v && ({ glyph: v.glyph, gsize: v.gsize, hue1: v.hue1, hue2: v.hue2 });
  // the DockIcon holds the glyph attributes; find the AppGlyph it drives
  let g = null;
  const walk = (v) => { if (!v) return; if (v.constructor && v.constructor.name === "AppGlyph") g = g ?? v;
                        for (const c of v.children || []) walk(c); };
  walk(dv);
  return { dock: pick(dv), glyph: pick(g) };
});
console.log("  program says:", JSON.stringify(spec.glyph ?? spec.dock));

// Instantiate a fresh glyph at icon size, on top of everything, at a known spot.
const box = await p.evaluate((edge) => {
  const d = window.__declare;
  const app = d.find("app");
  const s = d.find("app.dock.row.dvIcon");
  const g = (() => { let f = null; const w = (v) => { if (!v) return;
      if (v.constructor && v.constructor.name === "AppGlyph") f = f ?? v;
      for (const c of v.children || []) w(c); }; w(s); return f; })();
  const v = app.createView("AppGlyph", app, {
    edge, x: 40, y: 40,
    glyph: g ? g.glyph : "[  ]", gsize: g ? g.gsize : 0.42,
    hue1: g ? g.hue1 : 0x2E6FE0, hue2: g ? g.hue2 : 0x12A594,
  });
  return { x: v.x, y: v.y, w: Math.round(v.width), h: Math.round(v.height) };
}, ART);
await sleep(1.5);

const raw = path.join(HERE, ".icon-art.png");
await p.screenshot({ path: raw, clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
await b.close();
console.log(`  captured ${box.w}x${box.h} CSS px at DPR 2 -> ${raw}`);

// ── compose the 1024 canvas and mask the corners ────────────────────────────
// macOS rounded-rect icons are inset in the 1024 grid rather than full-bleed;
// 824/1024 is the standard proportion, which is why the icon is not scaled to
// the full canvas here.
const py = `
from PIL import Image, ImageDraw
art = Image.open(${JSON.stringify(raw)}).convert("RGBA")
S, INSET = 1024, 824
art = art.resize((INSET, INSET), Image.LANCZOS)
# the program's own corner ratio, applied at icon scale
r = int(INSET * 0.23)
mask = Image.new("L", (INSET, INSET), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, INSET - 1, INSET - 1], radius=r, fill=255)
art.putalpha(mask)
canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
canvas.paste(art, ((S - INSET) // 2, (S - INSET) // 2), art)
canvas.save(${JSON.stringify(path.join(HERE, ".icon-1024.png"))})
print("  composed 1024x1024 with alpha, artwork inset to %d" % INSET)
`;
execFileSync("python3", ["-c", py], { stdio: "inherit" });

const iconset = path.join(HERE, "Declare.iconset");
if (existsSync(iconset)) rmSync(iconset, { recursive: true });
mkdirSync(iconset);
const src = path.join(HERE, ".icon-1024.png");
for (const [px, name] of [[16, "icon_16x16"], [32, "icon_16x16@2x"], [32, "icon_32x32"],
                          [64, "icon_32x32@2x"], [128, "icon_128x128"], [256, "icon_128x128@2x"],
                          [256, "icon_256x256"], [512, "icon_256x256@2x"], [512, "icon_512x512"],
                          [1024, "icon_512x512@2x"]]) {
  execFileSync("/usr/bin/sips", ["-z", String(px), String(px), src, "--out",
                                 path.join(iconset, name + ".png")], { stdio: "ignore" });
}
execFileSync("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", path.join(HERE, "Declare.icns")]);
rmSync(iconset, { recursive: true });
console.log("  wrote mac-host/Declare.icns");
