// test/scene-walk.test.mjs — the retained-scene input walks (runtime/src/scene-walk.ts),
// the one implementation canvas and the Mac host route presses, cursors, wheels
// and scroll ranges through. Plain objects stand in for surfaces, so each rule
// is pinned without a renderer.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { hitWalk, wheelWalk, contentExtentOf, insideRoundedBox } from "../runtime/dist/scene-walk.js";

/** A surface with the walks' defaults; `kids` are parented to it. */
function surf(o = {}, kids = []) {
  const s = {
    x: 0, y: 0, width: 100, height: 100, visible: true, parent: null,
    sink: null, wants: undefined, pe: "", cursorStyle: "",
    scrolls: false, scrollsX: false, scrollOffset: 0, scrollXOffset: 0,
    ignoresClip: false, ignoresScroll: false, pageRoot: false,
    clip: false, floor: 0, padB: 0, padR: 0,
    invertTransform: (lx, ly) => [lx, ly],
    clips() { return this.clip; },
    insideClip(lx, ly) { return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height; },
    extentFloor() { return this.floor; },
    trailingInset(axis) { return axis === "y" ? this.padB : this.padR; },
    ...o,
  };
  s.children = kids;
  for (const k of kids) k.parent = s;
  return s;
}
const sink = () => () => {};

await test("frame chrome is hit first, at unshifted coordinates, over a scrolled pane", () => {
  const row = surf({ y: 120, height: 30, sink: sink() });
  const chrome = surf({ height: 30, ignoresScroll: true, sink: sink() });
  const pane = surf({ height: 150, scrolls: true, scrollOffset: 120 }, [surf({ height: 600 }), row, chrome]);
  assert.equal(hitWalk(pane, 50, 10).key, chrome, "the chrome rides the frame");
  assert.equal(hitWalk(pane, 50, 40), null, "below the chrome, the row has scrolled away");
});

await test("pointerEvents none passes the press through, without sealing the subtree", () => {
  const child = surf({ width: 20, height: 20, sink: sink() });
  const over = surf({ pe: "none", sink: sink() }, [child]);
  const under = surf({ sink: sink() });
  const root = surf({}, [under, over]);
  assert.equal(hitWalk(root, 50, 50).key, under, "the transparent view's area goes to the view beneath");
  assert.equal(hitWalk(root, 10, 10).key, child, "its own child still takes a press");
});

await test("a clip bounds hits, except for ignoreClip children", () => {
  const inside = surf({ width: 50, height: 50, sink: sink() });
  const halo = surf({ x: 90, width: 30, height: 30, ignoresClip: true, sink: sink() });
  const box = surf({ clip: true, sink: sink() }, [inside, halo]);
  assert.equal(hitWalk(box, 110, 10).key, halo, "the halo outside the clip still hits");
  assert.equal(hitWalk(box, 10, 10).key, inside);
});

await test("the cursor follows the hit target; a zone with no sink shows its cursor, a pointer-transparent view does not", () => {
  const zone = surf({ width: 30, height: 30, cursorStyle: "ew-resize" });
  const target = surf({ sink: sink(), cursorStyle: "pointer" }, [zone]);
  const inert = surf({ x: 200, cursorStyle: "crosshair", pe: "none", sink: sink() });
  const root = surf({ width: 400, sink: sink() }, [target, inert]);
  assert.equal(hitWalk(root, 10, 10).cursor, "ew-resize");
  assert.equal(hitWalk(root, 60, 60).cursor, "pointer");
  assert.equal(hitWalk(root, 250, 50).cursor, undefined, "pointerEvents none never shows its own cursor");
});

await test("a wheel goes to the nearest claimant unless a nearer scroller owns it; the page's own wheel is the browser's", () => {
  let heard = 0;
  const pane = surf({ y: 50, height: 50, scrolls: true });
  const claimant = surf({ sink: () => { heard++; }, wants: { wantsWheel: true } }, [pane]);
  const root = surf({ width: 300, height: 300 }, [claimant]);
  assert.equal(wheelWalk(root, 10, 10, 0, 5, false, { x: 0, y: 0 }), "claimed");
  assert.equal(heard, 1);
  assert.equal(wheelWalk(root, 10, 70, 0, 5, false, { x: 0, y: 0 }), "scroller", "the nested pane keeps its wheel");
  const page = surf({ scrolls: true, pageRoot: true });
  assert.equal(wheelWalk(page, 10, 10, 0, 5, false, { x: 0, y: 0 }), null);
});

await test("content extent: nested overflow and frame chrome count, a clip stops the descent, a virtual floor carries its own insets", () => {
  const nested = surf({ height: 200 }, [surf({ height: 100 }, [surf({ height: 400 })])]);
  assert.equal(contentExtentOf(nested), 400);
  const pinned = surf({ height: 200 }, [surf({ height: 100 }), surf({ height: 500, ignoresScroll: true })]);
  assert.equal(contentExtentOf(pinned), 500);
  const clipped = surf({ height: 200 }, [surf({ height: 100, clip: true }, [surf({ height: 400 })])]);
  assert.equal(contentExtentOf(clipped), 100);
  const windowed = surf({ height: 200, floor: 1000, padB: 40 }, [surf({ height: 100 })]);
  assert.equal(contentExtentOf(windowed), 1000, "a windowed list's extent carries its insets already");
  const wide = surf({ width: 200, padR: 10 }, [surf({ width: 100 }, [surf({ width: 300 })])]);
  assert.equal(contentExtentOf(wide, "x"), 310);
});

await test("a rounded box excludes its corners", () => {
  const c = [30, 30, 30, 30];
  assert.equal(insideRoundedBox(5, 5, 100, 80, c), false);
  assert.equal(insideRoundedBox(30, 5, 100, 80, c), true);
  assert.equal(insideRoundedBox(50, 40, 100, 80, c), true);
  assert.equal(insideRoundedBox(97, 77, 100, 80, c), false);
});

summarize("scene-walk");
