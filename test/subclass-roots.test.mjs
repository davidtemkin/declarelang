// A class extends ANY built-in component. The ruling: "no reason you can't
// subclass a system provided class — that should be a general statement across
// all classes." Every family runs the one class-chain install a View gets
// (instantiate.ts beginNode / installMethods / mergeAttrs): a subclass carries
// its base's attributes and behaviour, its own declared attributes with
// defaults, its own sets of base attributes (nearest provider wins), and its
// methods — including a handler the base fires and a `super.name()` override
// at a use site. Pinned per root: Spring, Animator, Dataset, DataSource,
// AnimatorGroup, Keys, Focus, Tip, State, EventStream — plus the one refusal
// (an abstract base) and the two compiler-side facts (the scaffold's `$base`
// typing, the slimmer keeping the base module).
import assert from "node:assert";
import { compile, settleHeadless } from "../compiler/dist/compile-node.js";
import { compileProgram } from "../compiler/dist/declarec.js";
import { settle } from "../runtime/dist/reactive.js";
import { provideMeasurer } from "../runtime/dist/measure.js";
import { provideTransport } from "../runtime/dist/data.js";
import { Keys } from "../runtime/dist/keys.js";
import { Focus } from "../runtime/dist/focus.js";
import { Spring } from "../runtime/dist/spring.js";
import { Animator, AnimatorGroup } from "../runtime/dist/animator.js";
import { Dataset, DataSource } from "../runtime/dist/data.js";
import { State } from "../runtime/dist/state.js";
import { SCHEMAS, ABSTRACT_SCHEMAS } from "../runtime/dist/schema.js";
import { REGISTRY_NAMES } from "../runtime/dist/registry.js";

provideMeasurer({ set font(_) {}, set letterSpacing(_) {}, measureText: (t) => ({ width: t.length * 7, fontBoundingBoxAscent: 11, fontBoundingBoxDescent: 3, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }) });
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
async function build(src) {
  const r = await compile(src);
  assert.deepEqual((r.errors ?? []).map((e) => e.message), [], "compiles");
  return settleHeadless(r.source, { deps: r.deps });
}
const errorsOf = async (src) => ((await compile(src)).errors ?? []).map((e) => e.message);
const KEY = (key) => ({ key, code: key, shift: false, ctrl: false, alt: false, meta: false, repeat: false });

console.log("subclass roots — a class extends any built-in component");

// ── Spring ────────────────────────────────────────────────────────────────────
await (async () => {
  const app = await build(`
class Reveal extends Spring [ stiffness = 120, damping = 18, attribute = opacity,
    label: string = "reveal",
    describe() { return label + "@" + stiffness } ]
class Fast extends Reveal [ stiffness = 400 ]
App [ width = 100, height = 100,
    v: View [ width = 10, opacity = 0,
        open: Reveal [ to = { app.width / 2 } ],
        plain: Spring [ stiffness = 120, damping = 18, attribute = opacity, to = { app.width / 2 } ],
        quick: Fast [ label = "q", to = 1 ],
        loud: Reveal [ to = 1, describe() { return "loud:" + super.describe() } ] ] ]`);
  await test("Spring: a subclass is a Spring, with the base's slots set by its class body", () => {
    assert.ok(app.v.open instanceof Spring);
    assert.equal(app.v.open.constructor.name, "Reveal");
    assert.equal(app.v.open.stiffness, 120);
    assert.equal(app.v.open.damping, 18);
    assert.equal(app.v.open.mass, 1, "an unset base slot keeps the base's default");
    assert.equal(app.v.open.attribute, "opacity", "attribute set in the class body satisfies the animator's requirement");
    assert.equal(app.v.open.to, 50, "a { } from the class body binds against the use site's scope nouns");
  });
  await test("Spring: a declared attribute with a default, and a use-site set of it", () => {
    assert.equal(app.v.open.label, "reveal");
    assert.equal(app.v.quick.label, "q");
  });
  await test("Spring: a subclass of the subclass overrides its base's set (nearest provider wins)", () => {
    assert.ok(app.v.quick instanceof Spring);
    assert.equal(app.v.quick.stiffness, 400);
    assert.equal(app.v.quick.damping, 18);
  });
  await test("Spring: the base's behaviour is inherited (a retarget wakes it), a class method works, a use-site super override reaches it", () => {
    assert.equal(app.v.open.running, app.v.plain.running, "at boot the subclass reports what a plain Spring in the same shape reports");
    app.v.quick.stop();
    assert.equal(app.v.quick.running, false);
    app.v.quick.to = 0.5;
    settle();
    assert.equal(app.v.quick.running, true, "a Spring wakes on `to` — the subclass too");
    app.v.quick.stop();
    assert.equal(app.v.open.describe(), "reveal@120");
    assert.equal(app.v.quick.describe(), "q@400");
    assert.equal(app.v.loud.describe(), "loud:reveal@120");
  });
})();

// ── Animator ──────────────────────────────────────────────────────────────────
await (async () => {
  const app = await build(`
class Slide extends Animator [ duration = 300, attribute = x, log: string = "",
    onStart() { log = log + "S" },
    note(t: string) { log = log + t } ]
class Bounce extends Slide [ onStart() { super.onStart(); note("b") } ]
App [ width = 100, height = 100,
    v: View [ width = 10,
        a: Slide [ to = 40 ],
        b: Bounce [ to = 40 ] ] ]`);
  await test("Animator: base slots from the class body, own declaration, a plain method, super through two levels", () => {
    assert.ok(app.v.a instanceof Animator);
    assert.equal(app.v.a.duration, 300);
    assert.equal(app.v.a.to, 40);
    app.v.a.start();
    assert.equal(app.v.a.log, "S");
    app.v.b.start();
    assert.equal(app.v.b.log, "Sb");
  });
})();

// ── Dataset / DataSource ──────────────────────────────────────────────────────
await (async () => {
  const app = await build(`
class Seed extends Dataset [ n: number = 3, contents = { [1, 2, 3].slice(0, n) } ]
class Feed extends DataSource [ url = "/feed.json", format = "json", rows: number = 0,
    onLoad() { rows = value.length },
    count() { return rows } ]
App [ width = 100, height = 100,
    seed: Seed [ ],
    two: Seed [ n = 2 ],
    feed: Feed [ ],
    noisy: Feed [ onLoad() { super.onLoad(); rows = rows * 10 } ] ]`);
  await test("Dataset: a class body's derived contents, parameterized by its own declared attribute", () => {
    assert.ok(app.seed instanceof Dataset);
    assert.deepEqual(app.seed.value, [1, 2, 3]);
    assert.deepEqual(app.two.value, [1, 2]);
  });
  await test("DataSource: url from the class body; onLoad (the event the base fires) and a plain method", async () => {
    const prev = provideTransport(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("[1,2,3,4]"), json: () => Promise.resolve([1, 2, 3, 4]) }));
    try {
      assert.ok(app.feed instanceof DataSource);
      assert.equal(app.feed.url, "/feed.json");
      await app.feed.fetch();
      settle();
      assert.deepEqual(app.feed.value, [1, 2, 3, 4]);
      assert.equal(app.feed.rows, 4);
      assert.equal(app.feed.count(), 4);
      await app.noisy.fetch();
      settle();
      assert.equal(app.noisy.rows, 40, "a use-site override reaches the class's handler through super");
    } finally { provideTransport(prev); }
  });
})();

// ── AnimatorGroup ─────────────────────────────────────────────────────────────
await (async () => {
  const app = await build(`
class Group extends AnimatorGroup [ process = simultaneous, duration = 10, attribute = width,
    Animator [ to = 50 ] ]
App [ width = 100, height = 100,
    v: View [ width = 10, height = 10,
        g: Group [ Animator [ attribute = height, to = 20 ] ] ] ]`);
  await test("AnimatorGroup: the class body's members precede the use site's; the cascade reaches both", () => {
    assert.ok(app.v.g instanceof AnimatorGroup);
    assert.equal(app.v.g.process, "simultaneous");
    assert.equal(app.v.g.children.length, 2);
    assert.deepEqual(app.v.g.children.map((m) => m.attribute), ["width", "height"]);
    assert.deepEqual(app.v.g.children.map((m) => m.duration), [10, 10]);
  });
})();

// ── Keys / Focus / Tip ────────────────────────────────────────────────────────
await (async () => {
  const app = await build(`
class Hot extends Keys [ count: number = 0, last: string = "",
    onKeyDown(e: KeyEvent) { count = count + 1; last = e.key } ]
class Watch extends Focus [ moves: number = 0, onFocusChange(v: View) { moves = moves + 1 } ]
class Tips extends Tip [ seen: number = 0, onTip(e: TipEvent) { seen = seen + 1 } ]
App [ width = 100, height = 100,
    hot: Hot [ ],
    loud: Hot [ onKeyDown(e: KeyEvent) { super.onKeyDown(e); count = count + 100 } ],
    watch: Watch [ ],
    tips: Tips [ ],
    v: View [ width = 10, height = 10, focusable = true ] ]`);
  await test("Keys: the service reaches the subclass's handler; a use-site super override reaches the class's", () => {
    Keys.keyDown(KEY("a"));
    settle();
    assert.equal(app.hot.count, 1);
    assert.equal(app.hot.last, "a");
    assert.equal(app.loud.count, 101);
    Keys.keyUp(KEY("a"));
  });
  await test("Focus: the subclass hears focus changes", () => {
    Focus.focus(app.v);
    settle();
    assert.equal(app.watch.moves, 1);
    Focus.focus(null);
  });
  await test("Tip: a subclass constructs and carries its declaration", () => {
    assert.equal(app.tips.seen, 0);
    assert.equal(app.tips.constructor.name, "Tips");
  });
})();

// ── State ─────────────────────────────────────────────────────────────────────
await (async () => {
  const app = await build(`
class Wide extends State [ threshold: number = 500, log: string = "",
    applied = { parent.width > threshold },
    fill = red,
    onApply() { log = log + "A" },
    Text [ text = "wide" ] ]
App [ width = 100, height = 100,
    a: View [ width = 600, height = 10, fill = blue, s: Wide [ threshold = 100 ] ],
    b: View [ width = 200, height = 10, fill = blue, s: Wide [ ] ],
    c: View [ width = 600, height = 10, fill = blue,
        s: Wide [ threshold = 100, opacity = 0.5, onApply() { super.onApply(); log = log + "c" } ] ] ]`);
  await test("State: own declaration + default, the gate reading it, the class body's override and child", () => {
    assert.ok(app.a.s instanceof State);
    assert.equal(app.a.s.threshold, 100);
    assert.equal(app.a.s.applied, true);
    assert.equal(String(app.a.s.parent.fill), String(app.a.fill), "the class body's override drives the enclosing view");
    assert.equal(app.a.fill, 0xff0000);
    assert.deepEqual(app.a.children.map((c) => c.constructor.name), ["Wide", "Text"], "the class body's child materialized");
    assert.equal(app.b.s.applied, false, "the default threshold gates the other instance off");
    assert.equal(app.b.fill, 0x0000ff);
    assert.equal(app.b.children.length, 1);
  });
  await test("State: a use site adds an override and reaches the class's handler through super", () => {
    assert.equal(app.c.s.applied, true);
    assert.equal(app.c.fill, 0xff0000);
    assert.equal(app.c.opacity, 0.5);
    assert.equal(app.c.s.log, "Ac");
    assert.equal(app.a.s.log, "A");
  });
})();

// ── EventStream (the Stream family's concrete members) ────────────────────────
await (async () => {
  await test("EventStream: a subclass compiles; Stream itself is the one abstract refusal", async () => {
    assert.deepEqual(await errorsOf(`
class Live extends EventStream [ url = "https://x.test/live", retry = 3, seen: number = 0 ]
App [ width = 1, height = 1, live: Live [ ] ]`), []);
    const errs = await errorsOf(`class S extends Stream [ ]\nApp [ width = 1, height = 1 ]`);
    assert.equal(errs.length, 1);
    assert.match(errs[0], /'Stream' is an abstract base — it names no component to construct; extend one of its concrete members \(EventStream, Socket\)/);
    const media = await errorsOf(`class M extends Media [ ]\nApp [ width = 1, height = 1 ]`);
    assert.match(media[0], /'Media' is an abstract base.*\(Video, Audio\)/);
  });
})();

// ── The abstract set cannot drift from the registry ───────────────────────────
await test("ABSTRACT_SCHEMAS is exactly SCHEMAS − the registry (a new component lands in one or the other)", () => {
  const reg = new Set(REGISTRY_NAMES);
  const abstract = Object.keys(SCHEMAS).filter((n) => !reg.has(n)).sort();
  assert.deepEqual(abstract, [...ABSTRACT_SCHEMAS].sort());
});

// ── Checker: a class body is a definition, a use site inherits its sets ───────
await (async () => {
  await test("an animator subclass may leave `attribute` to the use site — and a use site inherits the class's", async () => {
    assert.deepEqual(await errorsOf(`
class Glide extends Spring [ damping = 30 ]
App [ width = 1, height = 1, v: View [ g: Glide [ attribute = x, to = 1 ] ] ]`), []);
    const errs = await errorsOf(`
class Glide extends Spring [ damping = 30 ]
App [ width = 1, height = 1, v: View [ g: Glide [ to = 1 ] ] ]`);
    assert.match(errs[0], /needs 'attribute = <slot>'/);
  });
  await test("a Dataset subclass without data is refused at the use site, not at the class", async () => {
    const errs = await errorsOf(`
class Rows extends Dataset [ n: number = 1 ]
App [ width = 1, height = 1, r: Rows [ ] ]`);
    assert.equal(errs.length, 1);
    assert.match(errs[0], /a Dataset needs data/);
    assert.deepEqual(await errorsOf(`
class Rows extends Dataset [ n: number = 1 ]
App [ width = 1, height = 1, r: Rows { [1] } ]`), []);
  });
  await test("a built-in family node takes inline declarations like a view (the §5 one-off subclass)", async () => {
    const app = await build(`App [ width = 1, height = 1,
      v: View [ width = 10, s: Spring [ attribute = x, to = 1, tag: string = "t" ] ],
      k: Keys [ hits: number = 0, onKeyDown(e: KeyEvent) { hits = hits + 1 } ] ]`);
    assert.equal(app.v.s.tag, "t");
    Keys.keyDown(KEY("b"));
    settle();
    assert.equal(app.k.hits, 1);
    Keys.keyUp(KEY("b"));
  });
  await test("a runtime method of the base is overridable (start, fetch) — a method is a method, everywhere", async () => {
    const app = await build(`
class Reveal extends Spring [ hits: number = 0, start() { hits = hits + 1 } ]
App [ width = 1, height = 1, v: View [ r: Reveal [ attribute = x, to = 1 ] ] ]`);
    app.v.r.stop();
    app.v.r.start();
    assert.equal(app.v.r.hits, 1, "the override runs");
    assert.equal(app.v.r.running, false, "and, saying no super, the runtime's start() does not");
  });
})();

// ── The slimmer keeps the base module for a subclass ──────────────────────────
await (async () => {
  await test("usedComponents of a Spring subclass includes Spring (the slim registry keeps the animation module)", async () => {
    const b = await compileProgram(`
class Reveal extends Spring [ damping = 30 ]
App [ width = 1, height = 1, v: View [ r: Reveal [ attribute = x, to = 1 ] ] ]`, { stripPos: false });
    assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
    assert.ok(b.usedComponents.includes("Spring"), `used: ${b.usedComponents.join(",")}`);
    assert.ok(b.usedComponents.includes("Reveal"));
  });
})();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
