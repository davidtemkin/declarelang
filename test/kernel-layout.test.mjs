// kernel-layout — the kernel's stack (kernel_layout_add) against the pass it
// replaces. Every tree is built twice from one source: once as it runs (an
// unmodified, unaligned, unflexed SimpleLayout is the kernel's), once with the
// JavaScript pass forced. The two are perturbed identically and, after every
// settle, every view's x, y, width and height must agree — within float noise —
// and the forced build must really have run the pass (a native-vs-native
// comparison is vacuous).
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { settleSource } from "../compiler/dist/headless.js";
import { settle } from "../runtime/dist/index.js";

let seed = 23;
// the HIGH bits: an LCG's low bits cycle in a few steps, which made every tree alike
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 15) % n; };
const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

const forced = (fn) => {
  globalThis.__DECLARE_DEV_SWITCHES__ = true; globalThis.__declareNoNativeLayout = true;
  try { return fn(); } finally { delete globalThis.__declareNoNativeLayout; delete globalThis.__DECLARE_DEV_SWITCHES__; }
};
const walk = (v, out = [], p = "app") => {
  out.push([p, v.x, v.y, v.width, v.height]);
  (v.childViews ?? []).forEach((c, i) => walk(c, out, p + "/" + i));
  return out;
};
const natives = (v, acc = { native: 0, pass: 0 }) => {
  if (v.layout) v.layout.$native ? acc.native++ : acc.pass++;
  (v.childViews ?? []).forEach((c) => natives(c, acc));
  return acc;
};
function same(a, b, where) {
  const ta = walk(a), tb = walk(b);
  assert.equal(ta.length, tb.length, `${where}: view count`);
  for (let i = 0; i < ta.length; i++) {
    for (let k = 1; k < 5; k++) assert.ok(close(ta[i][k], tb[i][k]), `${where}: ${ta[i][0]} ${["", "x", "y", "width", "height"][k]} native ${ta[i][k]} vs pass ${tb[i][k]}`);
  }
}

function child(i, depth) {
  const parts = [];
  if (rnd(5) === 0) parts.push(`width = ${rnd(90)}%`); else parts.push(`width = ${10 + rnd(120)}`);
  parts.push(`height = ${5 + rnd(80)}`);
  if (rnd(3) === 0) parts.push(`scale = ${(0.4 + rnd(20) / 10).toFixed(2)}`);
  if (rnd(4) === 0) parts.push(`rotation = ${rnd(90) - 45}`);
  if (rnd(6) === 0) parts.push(`skewX = ${rnd(30) - 15}`);
  if (rnd(4) === 0) parts.push(`pivotX = ${rnd(60)}, pivotY = ${rnd(40)}`);
  if (rnd(6) === 0) parts.push(`visible = false`);
  if (rnd(8) === 0) parts.push(`ignoreLayout = true, x = ${rnd(50)}, y = ${rnd(50)}`);
  if (rnd(7) === 0) return `k${i}: Text [ text = "${"word ".repeat(1 + rnd(6))}", fontSize = ${10 + rnd(14)} ]`;
  if (rnd(6) === 0) return `k${i}: Nudged [ ${parts.join(", ")} ]`;
  if (depth < 2 && rnd(5) === 0) return `k${i}: View [ layout: SimpleLayout [ axis = ${rnd(2) ? "x" : "y"}, spacing = ${rnd(12) - 3} ], ${[0, 1, 2].map((j) => child(j, depth + 1)).join(", ")} ]`;
  return `k${i}: View [ ${parts.join(", ")} ]`;
}

await test("the kernel's stack ≡ the SimpleLayout pass on 40 random trees × 10 perturbations", async () => {
  let natived = 0, cyclic = 0;
  for (let t = 0; t < 40; t++) {
    const n = 2 + rnd(6);
    const axis = rnd(2) ? "x" : "y";
    const align = rnd(6) === 0 ? "center" : "none";              // aligned: both run the pass
    const pad = rnd(3) === 0 ? `padding = ${rnd(16)}, ` : "";
    const spacer = rnd(8) === 0 ? ", Spacer [ ]" : "";              // a spacer: both run the pass
    const kids = Array.from({ length: n }, (_, i) => child(i, 0)).join(", ");
    const src = `class Nudged [ y = { 3 } ]
App [ width = 900, height = 700,
      box: View [ x = 10, y = 10, ${pad}layout: SimpleLayout [ axis = ${axis}, spacing = ${rnd(14) - 4}, align = ${align} ], ${kids}${spacer} ] ]`;
    const r = await compile(src, { originDir: process.cwd() });
    assert.equal(r.errors.length, 0, "compile: " + (r.errors[0]?.message ?? "") + "\n" + src);
    // A tree the generator made circular (a percent-sized child in a row whose
    // size is derived from that same row) is circular either way: both builds
    // must refuse it as a cycle. Which rule the report names is where the loop
    // was caught, and that can differ — the native stack and the pass are
    // different members of one loop.
    let a = null, b = null, ea = null, eb = null;
    try { a = settleSource(r.source, { deps: r.deps }); settle(); } catch (e) { ea = e; }
    forced(() => { try { b = settleSource(r.source, { deps: r.deps }); settle(); } catch (e) { eb = e; } });
    if (ea !== null || eb !== null) {
      assert.ok(ea !== null && eb !== null, `tree ${t}: one build cycled and the other did not — ${(ea ?? eb).message}`);
      assert.match(ea.message, /constraint cycle/); assert.match(eb.message, /constraint cycle/);
      cyclic++;
      continue;
    }
    assert.equal(natives(b).native, 0, "the forced build ran the pass everywhere");
    natived += natives(a).native;
    same(a, b, `tree ${t}`);
    for (let p = 0; p < 10; p++) {
      const pick = rnd(n);
      const what = ["width", "height", "visible", "scale", "rotation", "spacing", "padding", "pivotY"][rnd(8)];
      const apply = (app) => {
        const c = app.box[`k${pick}`];
        if (what === "spacing") app.box.layout.spacing = (p * 7) % 11 - 3;
        else if (what === "padding") app.box.padding = (p * 5) % 13;
        else if (c === undefined || c.constructor.name === "Text") return;
        else if (what === "visible") c.visible = !c.visible;
        else if (what === "scale") c.scale = 0.5 + (p % 5) / 2;
        else if (what === "rotation") c.rotation = (p * 17) % 90 - 45;
        else if (what === "pivotY") c.pivotY = (p * 9) % 40;
        else c[what] = 8 + (p * 23) % 90;
      };
      try { apply(a); } catch { /* an owned slot: refused alike in both */ }
      settle();
      forced(() => { try { apply(b); } catch { /* same */ } settle(); });
      same(a, b, `tree ${t} step ${p} (${what})`);
    }
    a.discard(); b.discard();
  }
  assert.ok(natived > 20, `the kernel's stack placed most of these trees (${natived} layouts)`);
  assert.ok(cyclic < 10, `most trees are not circular (${cyclic} were)`);
  console.log(`     ${natived} layouts placed by the kernel; ${cyclic} circular trees refused alike`);
});

await test("the stack hands back to the pass for alignment, spacers, a 3D child, and a windowed block", async () => {
  const build = async (src) => { const r = await compile(src, { originDir: process.cwd() }); assert.equal(r.errors.length, 0, r.errors[0]?.message); const app = settleSource(r.source, { deps: r.deps }); settle(); return app; };
  const aligned = await build(`App [ width = 300, height = 300, layout: SimpleLayout [ axis = x, align = center ], View [ width = 10, height = 10 ] ]`);
  assert.equal(aligned.layout.$native, false, "aligned");
  const spaced = await build(`App [ width = 300, height = 300, layout: SimpleLayout [ axis = x ], View [ width = 10, height = 10 ], Spacer [ ] ]`);
  assert.equal(spaced.layout.$native, false, "a spacer");
  const plain = await build(`App [ width = 300, height = 300, layout: SimpleLayout [ axis = y, spacing = 4 ], a: View [ width = 10, height = 10 ], b: View [ width = 10, height = 20 ] ]`);
  assert.equal(plain.layout.$native, true);
  plain.a.rotateX = 20; settle();
  assert.equal(plain.layout.$native, false, "a child out of the plane: the pass places it");
  assert.equal(plain.b.y, plain.a.footprint().height + 4, "and places the run past its projected box");
});

// A stack owns every child's place, in the kernel as on the JavaScript side.
// When it re-arms over a changed child list, the old rule gives back every
// cell it owned — a dead rule's id serves another rule next, and a cell still
// naming it would read as owned by that stranger (a percent rule, say, whose
// cells the auto-extent leaves out).
await test("a re-armed stack leaves each child's place owned by the rule that places it", async () => {
  const { kernel } = await import("../runtime/dist/reactive.js");
  const { slotCellOf } = await import("../runtime/dist/attributes.js");
  const r = await compile(`App [ width = 300, height = 300, open: boolean = false,
    box: View [ width = 200, layout: SimpleLayout [ axis = y, spacing = 3 ],
      a: View [ width = 10, height = 10 ],
      b: View [ exists = { app.open }, width = { app.width / 30 }, height = 15, opacity = { app.open ? 1 : 0.5 },
        View [ width = { parent.width }, height = 100% ], View [ width = 100%, height = { parent.height / 2 } ] ],
      c: View [ width = 10, height = 20, View [ width = 10, height = 100% ] ] ] ]`, { originDir: process.cwd() });
  assert.equal(r.errors.length, 0, r.errors[0]?.message);
  const app = settleSource(r.source, { deps: r.deps }); settle();
  for (let round = 0; round < 6; round++) {
    app.open = !app.open; settle();
    assert.equal(app.box.layout.$native, true, "the kernel places the stack");
    for (const v of app.box.childViews) {
      const js = v.$owners?.y;
      assert.equal(kernel().owner(slotCellOf(v, "y")), js?.id ?? -1, `round ${round}: ${v.constructor.name}.y owned in the kernel by the stack that places it`);
    }
    const kids = app.box.childViews;
    assert.equal(app.box.height, kids.reduce((s, v) => s + v.height, 0) + 3 * (kids.length - 1), `round ${round}: the box measures every child`);
  }
});

summarize("kernel-layout");
