// pinned-order — a pinned view (`ignoreScroll`) keeps its place in paint order:
// stacking is declaration order, pinned or not, under the App and in a pane alike.
// A pinned child declared before the content is a backdrop; one declared after it
// is chrome over it.
//
// What this holds:
// - a pinned view is resolved only once its tree is in the document. Resolved
//   while the app was still being built, it was adopted into the root's pane frame
//   (the root still looked like a pane) and later sent home behind the siblings
//   declared after it, so a pinned backdrop painted over the whole app;
// - in a pane, every pinned child shared one frame lifted over the content, so a
//   pinned backdrop declared first painted over the rows. Each now has a frame of
//   its own in its place, and only chrome declared after the content is lifted.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-pinned-order-");
const FILE = join(DIR, "probe.declare");
writeFileSync(FILE, `App [ fill = white,
    floor: View [ ignoreScroll = true, width = 100%, height = { app.hostHeight }, fill = #FF0000 ],
    box: View [ x = 40, y = 40, width = 120, height = 120, fill = #00C000 ],
    tall: View [ y = 1200, width = 10, height = 10 ]
    ]`);

// the RGB of one pixel of a PNG (8-bit RGB or RGBA, no interlace — what Chrome writes)
function pixel(png, x, y) {
  let pos = 8, w = 0, bpp = 4; const idat = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos), type = png.toString("ascii", pos + 4, pos + 8), data = png.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); bpp = data[9] === 6 ? 4 : 3; }
    if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp + 1;
  // undo the per-row filters up to the row needed
  const rows = []; let prev = Buffer.alloc(w * bpp);
  for (let r = 0; r <= y; r++) {
    const f = raw[r * stride], line = Buffer.from(raw.subarray(r * stride + 1, (r + 1) * stride));
    for (let i = 0; i < line.length; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      line[i] = (line[i] + (f === 1 ? a : f === 2 ? b : f === 3 ? ((a + b) >> 1) : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0)) & 255;
    }
    rows.push(line); prev = line;
  }
  const o = x * bpp; return [rows[y][o], rows[y][o + 1], rows[y][o + 2]];
}

await test("a pinned first child of the App paints under the views declared after it", () => {
  const shot = join(DIR, "shot.png");
  const r = spawnSync("node", [join(ROOT, "tools/look.mjs"), FILE, "--size", "400x400", "--wait", "500", "--shot", shot], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const png = readFileSync(shot);
  const dpr = png.readUInt32BE(16) / 400;
  const [rb, gb, bb] = pixel(png, Math.round(100 * dpr), Math.round(100 * dpr));
  assert.ok(gb > 150 && rb < 80, `the box shows over the backdrop (pixel ${rb},${gb},${bb})`);
  const [ro, go] = pixel(png, Math.round(300 * dpr), Math.round(300 * dpr));
  assert.ok(ro > 200 && go < 80, `the backdrop shows where nothing covers it (pixel ${ro},${go})`);
});

// a pane, scrolled: a pinned backdrop declared first, rows, and a pinned bar declared last
const PANE = join(DIR, "pane.declare");
writeFileSync(PANE, `App [ fill = white,
    pane: View [ x = 0, y = 0, width = 300, height = 300, scrolls = y,
        back: View [ ignoreScroll = true, width = 300, height = 300, fill = #FF0000,
            hits: number = 0, onClick() { hits = hits + 1 } ],
        row: View [ x = 40, y = 140, width = 120, height = 120, fill = #00C000,
            hits: number = 0, onClick() { hits = hits + 1 } ],
        tall: View [ y = 900, width = 10, height = 10 ],
        bar: View [ ignoreScroll = true, width = 300, height = 40, fill = #0000FF ]
        ]
    ]`);

await test("in a pane, pinned children paint in declaration order: a backdrop under the rows, a bar over them", () => {
  const shot = join(DIR, "pane.png");
  // scrolled 100: the row stands at 40…160 on screen, the pinned views where they were
  const r = spawnSync("node", [join(ROOT, "tools/look.mjs"), PANE, "--size", "300x300", "--wheel", "app.pane", "100", "--wait", "400",
    "--shot", shot, "--click-at", "app.pane", "100,120", "--read", "app.pane.row.hits", "--read", "app.pane.back.hits", "--read", "app.pane.scrollY"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /app\.pane\.scrollY = 100/, "the pane scrolled");
  const png = readFileSync(shot);
  const dpr = png.readUInt32BE(16) / 300;
  const px = (x, y) => pixel(png, Math.round(x * dpr), Math.round(y * dpr));
  const [r1, g1, b1] = px(100, 120);
  assert.ok(g1 > 150 && r1 < 80 && b1 < 80, `the row paints over the backdrop declared before it (pixel ${r1},${g1},${b1})`);
  const [r2, g2, b2] = px(100, 20);
  assert.ok(b2 > 200 && r2 < 80 && g2 < 80, `the bar paints over everything, declared last (pixel ${r2},${g2},${b2})`);
  const [r3, g3] = px(250, 200);
  assert.ok(r3 > 200 && g3 < 80, `the backdrop holds still where nothing covers it (pixel ${r3},${g3})`);
  assert.match(r.stdout, /app\.pane\.row\.hits = 1/, "a press on the row reaches the row, which paints on top");
  assert.match(r.stdout, /app\.pane\.back\.hits = 0/, "…not the backdrop under it");
});

summarize("pinned-order");
