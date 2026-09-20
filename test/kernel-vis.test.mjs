// kernel-vis — the kernel's visibility rule against the JS walk it replaces.
// Random view trees, random transforms, scrolls and sizes, random writes; after
// every settle the public facts (onScreen, visibleRect, apparentScale — landed
// by the kernel rule through the delivery rule) must equal readVisibility()
// (the runtime's own ancestor walk) on every view, within float noise.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { settleHeadless } from "../compiler/dist/headless.js";
import { settle } from "../runtime/dist/index.js";
import { setBound } from "../runtime/dist/attributes.js";

let seed = 7;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const pick = (a) => a[rnd(a.length)];

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
function check(v, name) {
  assert.ok(v.visRule >= 0 || v.rotateX !== 0 || (v.parent?.rotateX ?? 0) !== 0, `${name}: the kernel path is not active (visRule ${v.visRule}) — the test would compare JS to JS`);
  const js = v.readVisibility();
  assert.equal(v.onScreen, js.on, `${name}: onScreen ${v.onScreen} vs js ${js.on}`);
  assert.ok(close(v.apparentScale, js.scale), `${name}: apparentScale ${v.apparentScale} vs js ${js.scale}`);
  const r = v.visibleRect, jr = js.rect ?? { x: 0, y: 0, width: 0, height: 0 };
  for (const k of ["x", "y", "width", "height"]) assert.ok(close(r[k], jr[k]), `${name}: visibleRect.${k} ${r[k]} vs js ${jr[k]}`);
}

await test("kernel visibility ≡ readVisibility on 40 random trees × 8 perturbations", async () => {
  for (let t = 0; t < 40; t++) {
    // a tree: root(App) → up to 3 levels, each view maybe scrolling, transformed
    const names = [];
    const gen = (depth, prefix) => {
      let out = "";
      const n = depth === 0 ? 3 : rnd(3);
      for (let i = 0; i < n; i++) {
        const name = `${prefix}${i}`; names.push(name);
        const parts = [`x = ${rnd(400) - 50}`, `y = ${rnd(300) - 50}`, `width = ${50 + rnd(300)}`, `height = ${30 + rnd(200)}`];
        if (rnd(3) === 0) parts.push(`scale = ${(0.5 + rnd(20) / 10).toFixed(2)}`);
        if (rnd(4) === 0) parts.push(`rotation = ${rnd(90) - 45}`);
        if (rnd(5) === 0) parts.push(`skewX = ${rnd(30) - 15}`);
        if (rnd(4) === 0) parts.push(`pivotX = ${rnd(100)}, pivotY = ${rnd(60)}`);
        if (rnd(3) === 0) parts.push(`scrolls = y, scrollStartY = ${rnd(120)}`);
        if (rnd(6) === 0) parts.push(`visible = false`);
        if (rnd(7) === 0) parts.push(`ignoreScroll = true`);
        const kids = depth < 2 ? gen(depth + 1, name + "_") : "";
        out += `${name}: View [ ${parts.join(", ")}${kids ? ", " + kids : ""} ]${i < n - 1 ? ", " : ""}`;
      }
      return out;
    };
    const body = gen(0, "v");
    // every view reads its own facts, so every feed arms
    const src = `App [ width = 800, height = 600, ${body}, probe: Text [ text = { [${names.map((n) => `app.${n.split("_").map((s, i, a) => a.slice(0, i + 1).join("_")).join(".")}.onScreen`).join(", ")}].join(",") } ] ]`;
    const r = await compile(src, { originDir: process.cwd() });
    assert.ok(r.errors.length === 0, "compile: " + (r.errors[0]?.message ?? ""));
    const app = settleHeadless(r.source, { deps: r.deps });
    const views = names.map((n) => n.split("_").reduce((v, _, i, a) => v[a.slice(0, i + 1).join("_")], app));
    // touch every fact so each feed is armed, then settle
    for (const v of views) v.armVisibility();   // a fact's feed arms on its first TRACKED read; here, directly
    settle();
    views.forEach((v, i) => check(v, `tree ${t} ${names[i]}`));
    for (let p = 0; p < 8; p++) {
      const v = pick(views);
      const what = pick(["x", "y", "width", "height", "scale", "rotation", "scrollY", "visible", "skewY", "pivotX"]);
      if (what === "visible") v.visible = !v.visible;
      else if (what === "scrollY") { v.scrolls = "y"; setBound(v, "scrollY", rnd(200)); }
      else if (what === "scale") v.scale = 0.3 + rnd(25) / 10;
      else if (what === "rotation" || what === "skewY") v[what] = rnd(120) - 60;
      else v[what] = rnd(500) - 100;
      if (rnd(3) === 0) { app.width = 400 + rnd(800); app.height = 300 + rnd(600); }
      settle();
      views.forEach((vv, i) => check(vv, `tree ${t} step ${p} ${names[i]}`));
    }
    app.discard();
  }
});

await test("a 3D transform on the chain hands the facts back to the JS walk", async () => {
  const src = `App [ width = 800, height = 600, a: View [ x = 10, y = 10, width = 300, height = 200, b: View [ x = 20, y = 20, width = 100, height = 50 ] ] ]`;
  const r = await compile(src, { originDir: process.cwd() });
  const app = settleHeadless(r.source, { deps: r.deps });
  app.a.b.armVisibility(); settle();
  check(app.a.b, "flat");
  app.a.rotateX = 30; settle();
  assert.equal(app.a.b.visRule, -1, "the kernel rule retired on 3D");
  check(app.a.b, "after rotateX");
  app.a.b.x = 200; settle();
  check(app.a.b, "after a later move under 3D");
  app.discard();
});

summarize("kernel-vis");
