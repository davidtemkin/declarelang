// providedTextStyle (2026-09-16): `measureText` and a drawing's `fillText` take a
// style RECORD and inherit nothing — they have no place in the tree to inherit
// from — while a `Text` sets a size and inherits the rest of its face. So the
// naive call measured a run in a face the program never shows, and answered a
// plausible number rather than an error: measured in a real browser, a program
// providing Georgia bold with tracking reported 84px for a run that rendered at
// 111.
//
// The fix is two statable rules instead of one unstateable one. `measureText`
// measures exactly the style it is given, and the style is now REQUIRED.
// `providedTextStyle(overrides?)` is the style in force at this node.
//
// These pins assert the RECORD, not a measured width: the test measurer is
// face-blind by design (a fixed advance per character), so a width comparison
// here would pass whatever the face was. The width agreement is a browser fact
// and is checked where real metrics exist.
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
  return settleHeadless(r.source, { deps: r.deps, env: { hostWidth: 600, hostHeight: 400 } });
}
async function errs(src) {
  const r = await compile(src, {});
  return (r.errors ?? []).map((e) => e.message);
}
console.log("providedTextStyle — the face a measurement is taken in");

// ── the style is required: silence used to mean two different things ─────────

await (async () => {
  const e = await errs(`App [ width = 100, height = 100, w: number = { measureText("hi").width } ]`);
  test("measureText with no style is refused", () => {
    assert.equal(e.length, 1, e.join("; "));
    assert.match(e[0], /1 argument but 2 are required/);
  });
  const ok = await errs(`App [ width = 100, height = 100, w: number = { measureText("hi", ({ fontSize: 13 })).width } ]`);
  test("…and with one it compiles", () => assert.deepEqual(ok, []));
})();

// ── the record IS the provided face, with the caller's fields on top ─────────

await (async () => {
  const app = await build(`App [ width = 400, height = 200,
      fontFamily = "Georgia, serif", fontWeight = bold, letterSpacing = 1.5, textColor = #112233,
      face:  object = { providedTextStyle() },
      sized: object = { providedTextStyle(({ fontSize: 20 })) }
      ]`);
  test("all five provided face names are present", () => {
    assert.deepEqual(Object.keys(app.face).sort(),
      ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "textColor"]);
  });
  test("each carries what the tree provides", () => {
    assert.equal(app.face.fontFamily, "Georgia, serif");
    assert.equal(app.face.fontWeight, "bold");
    assert.equal(app.face.letterSpacing, 1.5);
    assert.equal(app.face.textColor, 0x112233);
  });
  test("an unprovided name falls to the same default a Text would", () => {
    assert.equal(app.face.fontSize, 16, "Text's own fontSize default");
  });
  test("the caller's fields replace, and nothing else moves", () => {
    assert.equal(app.sized.fontSize, 20);
    assert.equal(app.sized.fontFamily, "Georgia, serif");
    assert.equal(app.sized.fontWeight, "bold");
  });
})();

// ── it is a property of the NODE, not of where it is read ───────────────────

await (async () => {
  const app = await build(`App [ width = 400, height = 200, fontFamily = "Georgia, serif",
      v: View [ width = 100, height = 40,
          inSlot: object = { providedTextStyle() },
          inDraw: object = null,
          draw(d: Draw) { d.font = "12px monospace"; this.inDraw = providedTextStyle() }
          ]
      ]`);
  test("a value body and that view's own draw() read the same record", () => {
    assert.deepEqual(app.v.inDraw, app.v.inSlot);
  });
  test("…and the drawing's own font state does not affect it", () => {
    assert.equal(app.v.inDraw.fontFamily, "Georgia, serif");
  });
})();

// ── the five edges are real: a face change re-derives it ────────────────────

await (async () => {
  const app = await build(`App [ width = 400, height = 200,
      fam: string = "Georgia, serif",
      fontFamily = { app.fam },
      face: object = { providedTextStyle() }
      ]`);
  test("it reads the provided value, not the declared default", () => {
    assert.equal(app.face.fontFamily, "Georgia, serif");
  });
  app.fam = "ui-monospace, monospace";
  settle();
  test("a face change up the chain RE-DERIVES it", () => {
    assert.equal(app.face.fontFamily, "ui-monospace, monospace",
      "the record did not follow the font switch — the provided edges are not wired");
  });
})();

// ── a nearer provider wins, exactly as it does for a Text ───────────────────

await (async () => {
  const app = await build(`App [ width = 400, height = 300, fontFamily = "Georgia, serif",
      outer: View [ width = 300, height = 100, face: object = { providedTextStyle() } ],
      inner: View [ width = 300, height = 100, fontFamily = "ui-monospace, monospace",
          face: object = { providedTextStyle() },
          deep: View [ width = 100, height = 40, face: object = { providedTextStyle() } ]
          ]
      ]`);
  test("each subtree reads its own nearest provider", () => {
    assert.equal(app.outer.face.fontFamily, "Georgia, serif");
    assert.equal(app.inner.face.fontFamily, "ui-monospace, monospace");
  });
  test("a node's own provision reaches its descendants", () => {
    assert.equal(app.inner.deep.face.fontFamily, "ui-monospace, monospace");
  });
})();

// ── the overrides stay typed ────────────────────────────────────────────────

await (async () => {
  const e = await errs(`App [ width = 100, height = 100,
      w: number = { measureText("hi", providedTextStyle(({ fontSizee: 20 }))).width } ]`);
  test("a misspelled override field is refused at the call", () => {
    assert.equal(e.length, 1, e.join("; "));
    assert.match(e[0], /fontSizee/);
  });
})();

// ── and it is legal in a drawing's style argument ───────────────────────────

await (async () => {
  const e = await errs(`App [ width = 200, height = 100, fontFamily = "Georgia, serif",
      v: View [ width = 100, height = 40,
          draw(d: Draw) { d.fillText("hi", 0, 12, providedTextStyle(({ fontSize: 20 }))) }
          ]
      ]`);
  test("d.fillText takes it as its style", () => assert.deepEqual(e, []));
})();

console.log(`provided-text-style: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
