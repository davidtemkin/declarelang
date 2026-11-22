// scroll-clip — `scrolls` and `clip` on one view, in either order and at any time:
// a view that scrolls scrolls, and a view that clips keeps clipping when its
// scrolling ends.
//
// What this holds: the clip was written as the `overflow` shorthand, over the
// scroller's own `overflow-y: auto` — so a pane whose `scrolls` and `clip` both
// turned on in one step would not scroll. And turning the scroll off cleared both
// axes, which took a standing clip with them.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-scroll-clip-");
const FILE = join(DIR, "probe.declare");
writeFileSync(FILE, `App [ fill = white,
    on: boolean = false,
    clipped: boolean = false,
    pane: View [ x = 20, y = 20, width = 200, height = 200, fill = #EEEEEE,
        scrolls = { app.on ? "y" : "none" }, clip = { app.on || app.clipped },
        View [ x = 20, y = 20, width = 100, height = 100, fill = #00C000 ],
        View [ x = 20, y = 300, width = 100, height = 100, fill = #0000C0 ]
        ]
    ]`);

function look(...args) {
  const r = spawnSync("node", [join(ROOT, "tools/look.mjs"), FILE, "--size", "300x300", ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout;
}

await test("a pane whose scrolls and clip turn on together scrolls", () => {
  const out = look("--set", "app.on=true", "--wait", "300", "--wheel", "app.pane", "150", "--wait", "300", "--read", "app.pane.scrollY");
  assert.match(out, /app\.pane\.scrollY = 150/, out);
});

await test("a clip outlives the scroll it was paired with", () => {
  // scrolls on with clip, then the scroll off while the clip stays: the far child is cut off
  const out = look("--set", "app.on=true", "--set", "app.clipped=true", "--wait", "200", "--set", "app.on=false", "--wait", "200",
    "--js", "(() => { const e = [...document.querySelectorAll('div')].find((d) => d.style.width === '200px' && d.style.height === '200px'); return getComputedStyle(e).overflowY })()");
  assert.match(out, /js: "clip"/, out);
});

summarize("scroll-clip");
