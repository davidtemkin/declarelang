// Is a RASTERIZED drawing exact under a view scale on the native host?
//
//   node mac-host/scaled-check.mjs
//
// test/probe/raster-scaled.declare puts a 1 px ring (described — exact under
// any transform already) and small TEXT (rasterized by Core Text) under
// scale 4. The text is the case: a bitmap made at the backing scale and then
// scaled 4× by the ancestor's transform is a 4× smear. With RASTERSCALE the
// host makes the bitmap at the composed density and the text is crisp.
//
// The measure is the same one the DOM pin uses — how many device pixels a
// hard edge takes to cross — scanned through the text at the ring's centre,
// so a before/after number needs no baseline. Same launch discipline as
// drawconform.mjs; "Declare Mac" WITH THE SPACE on the way out.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hostWindow } from "./win.mjs";
import { hostBinary, NO_HOST } from "./app.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${httpServer.address().port}/test/probe/raster-scaled.declare?render=mac`;

const bin = hostBinary();
if (bin === null) { console.error(NO_HOST); process.exit(1); }
for (const pat of ["Declare Mac", "DeclareMac"]) { try { execFileSync("/usr/bin/pkill", ["-f", pat]); } catch { /* none */ } }
await sleep(1.2);
spawn(bin, [], { detached: true, stdio: "ignore",
  env: { ...process.env, DECLARE_CONTROL: "1", DECLARE_APPEARANCE: "light", DECLARE_URL: URL_ } }).unref();
let up = false;
for (let i = 0; i < 60 && !up; i++) { await sleep(0.5); try { hostWindow(); up = i > 4; } catch { /* not yet */ } }
if (!up) { console.error("no host window"); process.exit(1); }
await sleep(3);                                   // past the at-rest beat, twice over

const { id } = hostWindow();
const shot = "/tmp/scaled-mac.png";
execFileSync("/usr/sbin/screencapture", ["-x", "-o", "-l", String(id), shot]);
const chromePt = Number(readFileSync("/tmp/declare-geom.txt", "utf8").trim().split(" ")[4] ?? 32);
const out = execFileSync("/usr/bin/python3", ["-c", `
from PIL import Image
im = Image.open(${JSON.stringify(shot)}).convert("RGB")
chrome = ${chromePt} * 2
# the view is at (40,40) scaled 4x about its own origin: the ring's centre (60,40)
# lands at app (280,200); the word "exact" sits on that centre. Scan the row
# through it, across the word's width (x 200..360 app px), and count device
# pixels that are neither ground nor ink — the edge ramps of the glyphs.
y = chrome + 200 * 2
mid = 0; ink = 0
for x in range(200 * 2, 360 * 2):
    r, g, b = im.getpixel((x, y))
    v = (r + g + b) / 3
    if 40 < v < 215: mid += 1
    elif v >= 215: ink += 1
print(f"{mid} {ink}")
`]).toString().trim();
const [mid, ink] = out.split(" ").map(Number);
console.log(`mac, text under scale 4: ${mid} transitional device px across the word, ${ink} ink px · ${shot}`);
console.log(`  (a crisp 4x-scaled 9px font has narrow ramps — a few px per glyph edge; a 4x-stretched bitmap has ramps ~4x wider)`);
for (const pat of ["Declare Mac", "DeclareMac"]) { try { execFileSync("/usr/bin/pkill", ["-f", pat]); } catch { /* gone */ } }
httpServer.close();
