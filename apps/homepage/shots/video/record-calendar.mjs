#!/usr/bin/env node
/*
record-calendar.mjs — re-cut calendar.mp4, the clip on the homepage's calendar row.

    node record-calendar.mjs                 # dev server on :8300, writes ./calendar.mp4
    node record-calendar.mjs --port 8200
    node record-calendar.mjs --out /tmp/try.mp4 --keep-frames

Records the real app in headless Chrome, trims to a seamless loop, and encodes.
The dev server must already be serving this tree (`node server/dev.mjs 8300`).

## What it records

  month → a busy day → week → open an event's detail → close it →
  DRAG that event across three days and later in the day → year → month

Two properties the clip has to hold, both of which this script enforces rather
than leaves to luck:

**It ends where it starts.** The last frame is byte-identical to the first, so
the loop has no seam to notice. That is not free: the drag mutates the dataset,
and `pickDay` moves the current-day marker (which tints a day NUMBER — a real
two-glyph difference between the first frame and the last). Both are put back
during the year hold, where the board draws mini-months and neither is on
camera. The interaction is genuine; only the reset is hidden.

**It shows the app being used, not animating.** A detail panel opening on a real
record, and a drag that commits a reschedule through the dataset's mutation API
— things a motion study cannot fake.

## Why the coordinates are read, never written down

Every point comes from the live tree via `__declare.inspect`, so a layout change
moves the clicks with it instead of silently recording the wrong thing. Two
places where that matters especially:

  - The day cell is clicked in its NUMBER band, above the chips, so the click
    picks the day rather than selecting an event.
  - The event box is re-read AFTER the panel closes. The panel insets the body
    (`panelOverlay` is false above 720), so the week's columns reflow while it
    is open and the pre-panel box is stale.

The drag is interleaved move-and-capture: one pointer step per frame, so its
pacing is choreographed rather than left to whatever a screenshot costs. The
transitions are the app's own springs, captured as they run.
*/
import pp from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf("--" + name); return i < 0 ? fallback : argv[i + 1]; };
const PORT = arg("port", "8300");
const OUT = arg("out", join(HERE, "calendar.mp4"));
const KEEP = argv.includes("--keep-frames");

// Chrome: puppeteer's own cached download. Override with CHROME=... if yours
// lives elsewhere — puppeteer-core does not ship a browser.
const CHROME = process.env.CHROME || (() => {
  const base = join(process.env.HOME, ".cache/puppeteer/chrome");
  const v = readdirSync(base).filter((d) => d.startsWith("mac_arm") || d.startsWith("mac-") || d.startsWith("linux")).sort().pop();
  return join(base, v, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
})();

const W = 1120, H = 700, FPS = 25;          // 1.6 aspect — the Shot plate's ratio
const OUT_W = 840, OUT_H = 526;             // what ships: the same ratio, halved-ish
const SEAM = 20;                            // frames of stillness across the loop point
const FRAMES = join(tmpdir(), "declare-calclip-" + process.pid);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const b = await pp.launch({ executablePath: CHROME, headless: "new", userDataDir: join(tmpdir(), "declare-calclip-profile-" + process.pid),
  args: ["--no-sandbox", "--force-device-scale-factor=1", "--window-size=" + W + "," + H] });
const p = await b.newPage();
await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await p.goto(`http://localhost:${PORT}/apps/calendar/calendar.declare`, { waitUntil: "domcontentloaded" });
await sleep(7000);

const rd  = async (s) => (await p.evaluate((x) => window.__declare.evaluate("app", x), s)).text;
const box = (a) => p.evaluate((x) => { const n = window.__declare.inspect(x); return n && { x: n.rootX, y: n.rootY, w: n.width, h: n.height }; }, a);
const mid = (bx) => [Math.round(bx.x + bx.w / 2), Math.round(bx.y + bx.h / 2)];
// The k-th event block of a grid cell: the children that are not the cell's own
// furniture. `inspect` reports the BASE kind ("View"), not the class, so an Ev
// cannot be found by name — it is found by being none of the named parts.
const evBox = (cell, k) => p.evaluate(([c, i]) => {
  const n = window.__declare.inspect("app.board.grid." + c);
  const e = n.children.filter((x) => !["bg", "mark", "num", "dow"].includes(x.name))[i];
  return e && { x: e.rootX, y: e.rootY, w: e.width, h: e.height };
}, [cell, k]);

let n = 0;
const frame = async () => { await p.screenshot({ path: join(FRAMES, `f${String(n++).padStart(4, "0")}.png`) }); };
const roll  = async (frames) => { for (let i = 0; i < frames; i++) { await frame(); await sleep(1000 / FPS); } };

// ── the stage: dark theme, September ─────────────────────────────────────────
await p.mouse.click(273, 29);
await sleep(1600);
await p.evaluate(() => window.__declare.evaluate("app", "step(1)"));
await sleep(2200);

const navKey0 = (await rd("navKey")).replace(/^"|"$/g, "");   // the current-day marker, to put back
const tabs = { w: mid(await box("app.bar.tabs.w")), m: mid(await box("app.bar.tabs.m")), yt: mid(await box("app.bar.tabs.yt")) };
const c7 = await box("app.board.grid.7");
const dayPoint = [Math.round(c7.x + c7.w * 0.5), Math.round(c7.y + 12)];
console.log("navKey at rest:", navKey0, "| day cell:", dayPoint);

await roll(15);                                                    // 1. the month — THE LOOP FRAME
await p.mouse.click(dayPoint[0], dayPoint[1]); await roll(35);     // 2. → the day
await p.mouse.click(tabs.w[0], tabs.w[1]);     await roll(35);     // 3. → the week

// 4. open the event's detail — the panel insets the grid
await p.mouse.click(...mid(await evBox(7, 0)));
await roll(30);
console.log("selected:", await rd("selectedId"));

// 5. close it
await p.mouse.click(...mid(await box("app.panel.secs.ev.hdr.close")));
await roll(24);

// 6. drag it: three days over, and later in the day
const from = mid(await evBox(7, 0));            // re-read — the grid reflowed back
const c10 = await box("app.board.grid.10");     // the Wednesday column
const to = [Math.round(c10.x + c10.w / 2), from[1] + 150];
console.log("drag", from, "→", to);
await p.mouse.move(from[0], from[1]);
await p.mouse.down();
await roll(5);                                  // the press, before anything moves
const STEPS = 26;
for (let i = 1; i <= STEPS; i++) {
  const t = i / STEPS, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // ease in-out
  await p.mouse.move(Math.round(from[0] + (to[0] - from[0]) * e), Math.round(from[1] + (to[1] - from[1]) * e));
  await frame();
}
await roll(5);                                  // parked on the target, its ring showing
await p.mouse.up();
await roll(20);                                 // the block settles into its new slot

// 7. → the year. The data and the marker go back while the board draws mini-months.
await p.mouse.click(tabs.yt[0], tabs.yt[1]);
await roll(12);
await p.evaluate(() => window.__declare.evaluate("app", "data.fetch()"));
await p.evaluate((k) => window.__declare.evaluate("app", "navKey = " + JSON.stringify(k)), navKey0);
await roll(24);

// 8. → the month, held. This has to match frame 0.
await p.mouse.click(tabs.m[0], tabs.m[1]);
await roll(32);
console.log("recorded:", n, "frames | end state: mode=" + await rd("mode") + " sel=" + await rd("selectedId"));
await b.close();

// ── trim to the loop ─────────────────────────────────────────────────────────
// The tail settles well before the recording stops, so the still month view is
// held at BOTH ends of the loop — the seam is leading + trailing. Keep only
// enough tail to make that total SEAM frames; more is just a pause.
const at = (i) => readFileSync(join(FRAMES, `f${String(i).padStart(4, "0")}.png`));
const first = at(0);
let lead = 0;  while (lead < n && at(lead).equals(first)) lead++;
let tail = 0;  while (tail < n && at(n - 1 - tail).equals(first)) tail++;
if (tail === 0) { console.error("\n!! the last frame does not match the first — the loop would pop. Not encoding."); process.exit(1); }
const keepTail = Math.max(1, SEAM - lead);
const count = Math.min(n, (n - tail) + keepTail);
console.log(`loop: ${lead} leading + ${tail} trailing still frames → keeping ${keepTail} of the tail`);
console.log(`encoding ${count} frames = ${(count / FPS).toFixed(2)}s (seam rests ${lead + keepTail} frames)`);

execFileSync("ffmpeg", ["-v", "error", "-framerate", String(FPS), "-start_number", "0",
  "-i", join(FRAMES, "f%04d.png"), "-frames:v", String(count),
  "-vf", `scale=${OUT_W}:${OUT_H}:flags=lanczos`,
  "-c:v", "libx264", "-preset", "veryslow", "-crf", "28",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", "-y", OUT], { stdio: "inherit" });

// prove the seam: the last ENCODED frame against the first
const probe = (i) => { const f = join(tmpdir(), `seam-${process.pid}-${i}.png`);
  execFileSync("ffmpeg", ["-v", "error", "-i", OUT, "-vf", `select=eq(n\\,${i})`, "-frames:v", "1", "-y", f]); return f; };
const ssim = execFileSync("ffmpeg", ["-v", "error", "-i", probe(count - 1), "-i", probe(0),
  "-lavfi", "ssim=stats_file=-", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
console.log("encoded seam:", (ssim.trim().split("\n").pop().match(/All:[0-9.]+/) || ["?"])[0],
  "(source frames are byte-identical; any residue is h264 quantization noise, not drift)");
console.log("wrote", OUT, execFileSync("stat", ["-f%z", OUT], { encoding: "utf8" }).trim() + " bytes");
if (!KEEP) rmSync(FRAMES, { recursive: true, force: true }); else console.log("frames kept in", FRAMES);
