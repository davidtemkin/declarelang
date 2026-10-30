// layer-promotion — a view that moves on consecutive frames, with nothing painted
// after it, gets a layer of its own while it moves (the browser moves its pixels
// instead of re-rasterizing what it passes over), and gives it back once it rests.
// A layer would change what a view means where it holds a blend (it would blend
// only within the layer) or a view fixed to the window, so such a view is not
// promoted, and one that gains either gives its layer back. Under other views a
// layer costs frames (each view over it gets one too), so a view painted over is
// not promoted, and one painted over later gives its layer back. In Chrome,
// through declare-verify.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-layer-promotion-");
writeFileSync(join(DIR, "mover.declare"), `App [ width = 600, height = 400,
  go: boolean = false, mixing: boolean = false, covering: boolean = false, start: number = 0,
  clock: Time [ tick = frame ],
  t: number = { app.go ? Math.floor(app.clock.now / 16) % 100 : 0 },
  mover: View [ x = { app.start + app.t * 3 }, width = 50, height = 50, fill = #fff, shadow = { shadow(0, 4, 12, 0x00000066) },
      chip: View [ width = 20, height = 20, fill = #f80, blend = { app.mixing ? "multiply" : "normal" } ],
      pin: View [ x = 25, width = 20, height = 20, fill = #48c ] ],
  cover: View [ visible = { app.covering }, x = 200, y = 200, width = 80, height = 80, fill = #888 ] ]`);
writeFileSync(join(DIR, "probe.mjs"), `export default async ({ drive }) => {
  const set = (k, v) => drive.page.evaluate((k, v) => { window.__declare.find("app")[k] = v; }, k, v);
  const layer = () => drive.page.evaluate(() => window.__declare.find("app.mover").$surface.element.style.willChange);
  const pinFixed = (on) => drive.page.evaluate((on) => { window.__declare.find("app.mover.pin").$surface.element.style.position = on ? "fixed" : "absolute"; }, on);
  const moveFor = async (ms) => { await set("go", true); await drive.waitReal(ms); };
  const rest = async () => { await set("go", false); await drive.waitReal(900); };
  const r = {};
  await set("start", 40); await drive.waitReal(300); r.movedOnce = await layer();
  await set("mixing", true); await moveFor(300); r.holdingBlend = await layer(); await rest();
  await set("mixing", false); await moveFor(300); r.moving = await layer();
  await set("mixing", true); await drive.waitReal(30); r.gainedBlend = await layer(); await rest(); await set("mixing", false);
  // fixed to the window, as the page regime fixes an ignoreScroll view (the
  // harness's App is not the page's own, so it does not)
  await pinFixed(true); await moveFor(300); r.holdingFixed = await layer(); await rest(); await pinFixed(false);
  await set("covering", true); await moveFor(300); r.beneath = await layer(); await rest(); await set("covering", false);
  await moveFor(300); r.again = await layer();
  await set("covering", true); await drive.waitReal(30); r.coveredLater = await layer();
  await set("covering", false); await moveFor(200); r.promotedOnceMore = await layer();
  await rest(); r.rested = await layer();
  console.log("RESULT " + JSON.stringify(r));
};
`);

await test("a moving view painted last is promoted and released at rest; never with a blend, a fixed view, or a view painted over it", () => {
  const p = spawnSync("node", [join(ROOT, "tools/verify.mjs"), join(DIR, "mover.declare"), "--assert", join(DIR, "probe.mjs")], { cwd: ROOT, encoding: "utf8" });
  const m = (p.stdout ?? "").match(/RESULT (.*)/);
  assert.ok(m, (p.stdout ?? "") + (p.stderr ?? ""));
  assert.deepEqual(JSON.parse(m[1]), {
    movedOnce: "",           // moved once is not moving
    holdingBlend: "",        // a layer would isolate the blend
    moving: "transform",     // moving on consecutive frames, painted last
    gainedBlend: "",         // a blend appearing inside releases it
    holdingFixed: "",        // a layer would hold the fixed view
    beneath: "",             // a view is painted after it
    again: "transform",
    coveredLater: "",        // a view shown after it releases it
    promotedOnceMore: "transform",
    rested: "",              // at rest, the layer is given back
  });
});

summarize("layer-promotion");
