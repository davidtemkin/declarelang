// kernel-extent — the kernel's auto-extent rule against the JS walk it
// replaces. Random containers with unset sizes hold random children (moved,
// scaled, rotated, skewed, hidden, unclipped, percent-sized); after every
// settle the container's derived width/height must equal contentWidth /
// contentHeight (view.ts extentOf — the JS walk, always live) within float
// noise, and the derive must be the KERNEL's (a JS-vs-JS pass is vacuous).
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { settleHeadless } from "../compiler/dist/headless.js";
import { settle } from "../runtime/dist/index.js";
import { ownerOf } from "../runtime/dist/attributes.js";

let seed = 11;
// the HIGH bits: an LCG's low bits cycle in a few steps, which made every tree alike
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 15) % n; };
const pick = (a) => a[rnd(a.length)];
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

function check(box, name, native = true) {
  const ow = ownerOf(box, "width"), oh = ownerOf(box, "height");
  if (native) {
    assert.ok(ow !== null && ow.isNative, `${name}: width is not the kernel's derive (${ow?.label})`);
    assert.ok(oh !== null && oh.isNative, `${name}: height is not the kernel's derive (${oh?.label})`);
  }
  assert.ok(close(box.width, box.contentWidth), `${name}: width ${box.width} vs extentOf ${box.contentWidth}`);
  assert.ok(close(box.height, box.contentHeight), `${name}: height ${box.height} vs extentOf ${box.contentHeight}`);
}

await test("kernel auto-extent ≡ extentOf on 40 random containers × 8 perturbations, padded and not", async () => {
  for (let t = 0; t < 40; t++) {
    const n = 2 + rnd(6);
    const kids = [];
    for (let i = 0; i < n; i++) {
      const parts = [`x = ${rnd(300) - 40}`, `y = ${rnd(200) - 40}`];
      parts.push(rnd(4) === 0 ? `width = ${rnd(80)}%` : `width = ${20 + rnd(200)}`);
      parts.push(rnd(4) === 0 ? `height = ${rnd(80)}%` : `height = ${10 + rnd(120)}`);
      if (rnd(3) === 0) parts.push(`scale = ${(0.4 + rnd(20) / 10).toFixed(2)}`);
      if (rnd(4) === 0) parts.push(`rotation = ${rnd(90) - 45}`);
      if (rnd(5) === 0) parts.push(`skewX = ${rnd(30) - 15}`);
      if (rnd(4) === 0) parts.push(`pivotX = ${rnd(100)}, pivotY = ${rnd(60)}`);
      if (rnd(6) === 0) parts.push(`visible = false`);
      if (rnd(7) === 0) parts.push(`ignoreClip = true`);
      kids.push(`k${i}: View [ ${parts.join(", ")} ]`);
    }
    // the container: sizes UNSET, so auto-extent derives them; padded a third
    // of the time — uniformly or per side — which the rule adds on its axis
    const pad = rnd(3) === 0 ? `padding = ${rnd(20)}, ` : rnd(2) === 0 ? `padding = [${rnd(20)}, ${rnd(20)}, ${rnd(20)}, ${rnd(20)}], ` : "";
    const src = `App [ width = 800, height = 600, box: View [ x = 10, y = 10, ${pad}${kids.join(", ")} ], probe: Text [ text = { "" + app.box.width + app.box.height } ] ]`;
    const r = await compile(src, { originDir: process.cwd() });
    assert.ok(r.errors.length === 0, "compile: " + (r.errors[0]?.message ?? ""));
    const app = settleHeadless(r.program);
    settle();
    const box = app.box;
    check(box, `tree ${t}`);
    for (let p = 0; p < 8; p++) {
      const c = box[`k${rnd(n)}`];
      const what = pick(["x", "y", "width", "height", "scale", "rotation", "visible", "skewY", "pivotX", "ignoreClip", "padding"]);
      if (what === "padding") box.padding = rnd(2) === 0 ? rnd(24) : [rnd(24), rnd(24), rnd(24), rnd(24)];
      else if (what === "visible" || what === "ignoreClip") c[what] = !c[what];
      else if (what === "scale") c.scale = 0.3 + rnd(25) / 10;
      else if (what === "rotation" || what === "skewY") c[what] = rnd(120) - 60;
      else if (ownerOf(c, what) === null) c[what] = rnd(400) - 50;
      settle();
      check(box, `tree ${t} step ${p} (${what})`);
    }
    app.discard();
  }
});

await test("a child list change re-lists the rule; a 3D child hands the derive back to JS", async () => {
  const src = `App [ width = 800, height = 600, box: View [ x = 0, y = 0, a: View [ x = 10, y = 10, width = 100, height = 50 ] ] ]`;
  const r = await compile(src, { originDir: process.cwd() });
  const app = settleHeadless(r.program); settle();
  check(app.box, "one child");
  const b = app.box.createView("View", { x: 200, y: 5, width: 40, height: 300 });
  settle();
  check(app.box, "after createView");
  assert.equal(app.box.width, 240); assert.equal(app.box.height, 305);
  b.rotateX = 30; settle();
  const ow = ownerOf(app.box, "width");
  assert.ok(ow !== null && !ow.isNative, "the kernel rule declined on a 3D child; the JS derive owns width now");
  check(app.box, "after 3D", false);
  b.x = 500; settle();
  check(app.box, "JS derive follows a later move", false);
  app.discard();
});

await test("a drag inside a container whose size was set since leaves that size alone", async () => {
  // A drag declines the container's kernel rule (view.ts freezeHome). A size
  // written or bound since then displaced the rule already: the size is that
  // owner's, and the decline must not derive over it.
  const src = `App [ width = 800, height = 600, box: View [ x = 0, y = 0, width = 200,
    card: View [ y = 100, width = 80, height = 50, sy: number = 0,
      onPointerDown(e: PointerEvent) { this.sy = this.y },
      onPointerMove(e: PointerEvent) { this.y = this.sy + e.deltaY } ] ] ]`;
  const r = await compile(src, { originDir: process.cwd() });
  const app = settleHeadless(r.program); settle();
  assert.ok(ownerOf(app.box, "height")?.isNative, "sized from its content, by the kernel");
  assert.equal(app.box.height, 150);
  app.box.height = 240; settle();
  const sink = app.box.card.$inputSink();
  sink("pointerDown", 10, 110, { deltaX: 0, deltaY: 0 });
  sink("pointerMove", 10, 140, { deltaX: 0, deltaY: 30 }); settle();
  assert.equal(app.box.card.y, 130, "the card follows the hand");
  assert.equal(app.box.height, 240, "the size written stands through the drag");
  sink("pointerUp", 10, 140, { deltaX: 0, deltaY: 30 }); settle();
  assert.equal(app.box.height, 240, "and after it");
  app.discard();
});

await test("a position literal places a transformed view by the box it covers, as a layout does", async () => {
  // Two bars rotated ±45° about their corner (the default pivot), both centered:
  // they cross at the middle — an ×, not a <.
  const src = `App [ width = 400, height = 300, turn: number = 30,
    box: View [ width = 44, height = 44,
      a: View [ x = center, y = center, width = 16, height = 2, rotation = 45 ],
      b: View [ x = center, y = center, width = 16, height = 2, rotation = -45 ],
      c: View [ x = end, y = end, width = 20, height = 10, rotation = 90 ],
      d: View [ x = center, y = center, width = 20, height = 10 ],
      e: View [ x = center, y = center, width = 16, height = 2, rotation = { app.turn } ] ] ]`;
  const r = await compile(src, { originDir: process.cwd() });
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const app = settleHeadless(r.program); settle();
  const mid = (v) => { const b = v.bounds(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  for (const n of ["a", "b", "d", "e"]) {
    const [cx, cy] = mid(app.box[n]);
    assert.ok(close(cx, 22, 1e-9) && close(cy, 22, 1e-9), `${n} is centered by what it covers: (${cx}, ${cy})`);
  }
  const c = app.box.c.bounds();
  assert.ok(close(c.x + c.width, 44, 1e-9) && close(c.y + c.height, 44, 1e-9), `end aligns the covered box's end: ${JSON.stringify(c)}`);
  assert.equal(app.box.d.x, 12, "an untransformed view: the plain formula");
  app.turn = 60; settle();
  const [ex, ey] = mid(app.box.e);
  assert.ok(close(ex, 22, 1e-9) && close(ey, 22, 1e-9), `and it follows the rotation: (${ex}, ${ey})`);
  app.discard();
});

await test("a rich text's fontScale is TYPE, not geometry: the container measures what is painted", async () => {
  // The bug this pins: a font multiplier that reached the geometry slot made a
  // flow measure `scale` times its painted height, so whatever stacked below it
  // landed on its last line. Both auto-extent paths must agree, and neither may
  // see a transform — `fontScale` is not one.
  const md = "Body copy long enough to wrap onto several lines in a narrow column, so a ten percent error is a visible one.";
  const src = (fs) => `App [ width = 800, height = 600,
    box: View [ x = 0, y = 0, doc: Markdown [ x = 0, y = 0, width = 300, fontScale = ${fs}, text = "${md}" ] ] ]`;

  const at = async (fs) => {
    const r = await compile(src(fs), { originDir: process.cwd() });
    const app = settleHeadless(r.program); settle();
    check(app.box, `fontScale ${fs}`);                       // kernel derive ≡ extentOf
    const out = { box: app.box.height, doc: app.box.doc.height, scale: app.box.doc.scale };
    app.discard();
    return out;
  };

  const one = await at(1), small = await at(0.6);
  // the container is exactly its child, at every type size
  assert.equal(one.box, one.doc);
  assert.equal(small.box, small.doc);
  // the view is NOT transformed — that is what keeps every reader agreeing
  assert.equal(one.scale, 1);
  assert.equal(small.scale, 1);
  // (that smaller type yields a genuinely shorter flow is the text engine's
  // business and wants a real measurer; this file proves the geometry agrees)
});

summarize("kernel-extent");
