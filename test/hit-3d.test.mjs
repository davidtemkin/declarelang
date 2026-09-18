// Hit-testing THROUGH a 3D transform (2026-09-16). The graphics pass claims
// exact hit-testing on a tipped view, and both backends keep a homography for
// the pointer inverse — but the only pin was the matrix arithmetic in
// unit.test ("inverts on the plane and knows its back"). Nothing clicked a
// rotated view and asserted which view answered, so the claim rested on the
// algebra being right AND on the walk actually using it.
//
// These drive `viewAt` — the one walk the pointer itself takes (view.ts: "what a
// handler computes and what a press would hit can never disagree") — over views
// under `rotateY`/`rotateX` inside a `perspective`. Root-space coordinates, the
// same space a pointer event carries.
import assert from "node:assert";
import { compile, settleHeadless } from "../compiler/dist/compile-node.js";
import { settle } from "../runtime/dist/reactive.js";
import { provideMeasurer } from "../runtime/dist/measure.js";
provideMeasurer({ set font(_) {}, set letterSpacing(_) {}, measureText: (t) => ({ width: String(t).length * 7, fontBoundingBoxAscent: 11, fontBoundingBoxDescent: 3, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }) });

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
async function build(src) {
  const r = await compile(src, {});
  assert.deepEqual((r.errors ?? []).map((e) => e.message), [], "compiles");
  return settleHeadless(r.source, { deps: r.deps, env: { hostWidth: 400, hostHeight: 300 } });
}
/** Which of the program's named views answered, by NODE IDENTITY — `viewAt`
 *  returns the node itself, so nothing is inferred from a label. Names the
 *  deepest match, walking up only when the hit is an unnamed interior node. */
const hitIn = (app, named) => (x, y) => {
  const v = app.viewAt(x, y);
  for (let n = v; n !== null && n !== undefined; n = n.parent) {
    for (const [name, node] of Object.entries(named)) if (n === node) return name;
  }
  return v === null ? null : "(unnamed)";
};
console.log("hit-testing through a 3D transform");

// ── a view tipped about Y: the far edge moves IN, the near edge moves OUT ────

await (async () => {
  const app = await build(`App [ width = 400, height = 300, perspective = 600,
      card: View [ x = 100, y = 100, width = 200, height = 100, fill = royalblue,
          rotateY = 45, pivotX = 100, pivotY = 50 ]
      ]`);
  const nameAt = hitIn(app, { card: app.card });
  test("the centre of a tipped card still hits it", () => {
    assert.equal(nameAt(200, 150), "card");
  });
  test("a point the tip moved OFF the card misses it", () => {
    // the card's far half foreshortens toward the pivot, so a point near the
    // untransformed left edge is no longer covered
    assert.notEqual(nameAt(104, 150), "card");
  });
  test("the untipped box's own corner is not the tipped card's", () => {
    // (100,100) is the declared top-left; under a 45° tip about the centre the
    // surface has rotated away from it
    assert.notEqual(nameAt(101, 101), "card");
  });
  test("every hit is INSIDE the declared box (a tip narrows, never widens, about its pivot)", () => {
    for (const [x, y] of [[200, 150], [250, 150], [150, 150]]) {
      const hit = nameAt(x, y);
      if (hit !== "card") continue;
      assert.ok(x >= 100 && x <= 300 && y >= 100 && y <= 200, `(${x},${y}) hit the card outside its box`);
    }
  });
})();

// ── the back face: a view rotated past 90° is not hittable when hidden ──────

await (async () => {
  const app = await build(`App [ width = 400, height = 300, perspective = 600,
      spin: number = 0,
      card: View [ x = 100, y = 100, width = 200, height = 100, fill = seagreen,
          backface = hidden,
          rotateY = { app.spin }, pivotX = 100, pivotY = 50 ]
      ]`);
  const nameAt = hitIn(app, { card: app.card });
  test("face-on, the card takes the pointer", () => {
    assert.equal(nameAt(200, 150), "card");
  });
  test("turned past 90°, a BACKFACE-HIDDEN card takes nothing", () => {
    app.spin = 180; settle();
    assert.notEqual(nameAt(200, 150), "card", "a hidden back face must not answer the pointer");
  });
  test("…and turning back restores it", () => {
    app.spin = 0; settle();
    assert.equal(nameAt(200, 150), "card");
  });
})();

// ── a tipped view's CHILD is hit through the same inverse ───────────────────

await (async () => {
  const app = await build(`App [ width = 400, height = 300, perspective = 600,
      card: View [ x = 50, y = 50, width = 300, height = 200, fill = midnightblue,
          rotateY = 25, pivotX = 150, pivotY = 100,
          badge: View [ x = 130, y = 80, width = 40, height = 40, fill = gold ]
          ]
      ]`);
  const nameAt = hitIn(app, { badge: app.card.badge, card: app.card });
  test("the child under the tip answers, not just its parent", () => {
    // the badge sits at the card's centre, where a 25° tip about that centre
    // moves the surface least — so the centre point still lands on the badge
    assert.equal(nameAt(200, 150), "badge");
  });
  test("a point on the card but off the badge answers the card", () => {
    assert.equal(nameAt(90, 150), "card");
  });
})();

// ── the pointer walk and the paint agree: no transform, no surprises ───────

await (async () => {
  const app = await build(`App [ width = 400, height = 300,
      under: View [ x = 0, y = 0, width = 400, height = 300, fill = gainsboro ],
      over:  View [ x = 100, y = 100, width = 100, height = 100, fill = tomato,
          rotateX = 60, perspective = 500, pivotX = 50, pivotY = 50 ]
      ]`);
  const nameAt = hitIn(app, { over: app.over, under: app.under });
  test("a tipped view still occludes what is beneath it at its centre", () => {
    assert.equal(nameAt(150, 150), "over");
  });
  test("and the view beneath answers where the tip has vacated", () => {
    assert.equal(nameAt(150, 104), "under", "the foreshortened top edge should no longer cover this");
  });
})();

console.log(`hit-3d: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
