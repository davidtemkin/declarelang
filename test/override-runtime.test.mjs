// A method is a method: a program class (or a use site) may replace a
// built-in's RUNTIME method — DataSource.fetch, Animator.start, View.scrollTo
// — and `super.name(…)` reaches the runtime's implementation, the floor of
// every chain. Nearest provider wins (base body over the runtime, derived over
// base, use site over class); the runtime's own internal calls (maybeAuto →
// this.fetch()) land on the override. The compiler resolves `super.fetch()`
// at R1 from the static RUNTIME_METHODS table, pinned here against the actual
// runtime prototypes; a runtime FIELD keeps its refusal; a method the
// reference documents no contract for (plumbing) overrides with a warning.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { compile, settleHeadless } from "../compiler/dist/compile-node.js";
import { settle } from "../runtime/dist/reactive.js";
import { provideMeasurer } from "../runtime/dist/measure.js";
import { provideTransport, DataSource } from "../runtime/dist/data.js";
import { SCHEMAS, RichTextSchema } from "../runtime/dist/schema.js";
import * as reg from "../runtime/dist/registry.js";
import { Media } from "../runtime/dist/media.js";
import { Editor } from "../runtime/dist/editor.js";
import { Stream } from "../runtime/dist/streams.js";
import { RichText } from "../runtime/dist/markdown.js";
import { RUNTIME_METHODS, runtimeMethodsOf } from "../runtime/dist/runtime-methods.js";
import { runtimePlumbing } from "../compiler/dist/scaffold.js";

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
const warningsOf = async (src) => { const r = await compile(src); assert.deepEqual((r.errors ?? []).map((e) => e.message), [], "compiles"); return r.warnings ?? []; };
// A fetch fixture: every request lands [1, 2, 3]. An override that says
// `super.fetch()` without returning it leaves the caller no promise to await,
// so a landing is a few turns of the microtask queue away.
const ROWS = [1, 2, 3];
const fixture = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(ROWS)), json: () => Promise.resolve(ROWS) });
const landed = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); settle(); };

console.log("override-runtime — a method replaces a built-in's runtime method; super reaches the runtime's");

// ── The proof: the override runs AND the runtime's fetch happens ─────────────
await (async () => {
  const prev = provideTransport(fixture);
  try {
    const app = await build(`
class Fetcher extends DataSource [ log: string = "",
    fetch() { log = log + "before;"; super.fetch() } ]
App [ width = 1, height = 1, log: string = "",
    f: Fetcher [ url = "/f.json" ],
    g: Fetcher [ auto = true ],
    d: DataSource [ url = "/d.json", n: number = 0, fetch() { n = n + 1; super.fetch() } ] ]`);
    await test("class override with super: the body runs, then the runtime's fetch lands the data", async () => {
      assert.ok(app.f instanceof DataSource);
      assert.equal(app.f.loaded, false);
      app.f.fetch();
      assert.equal(app.f.log, "before;", "the override ran first");
      await landed();
      assert.equal(app.f.loaded, true, "and super.fetch() reached DataSource.fetch");
      assert.deepEqual(app.f.value, ROWS);
    });
    await test("the runtime's own internal call reaches the override: auto = true routes maybeAuto → this.fetch() through it", async () => {
      // (the headless settle window refuses network by design, so the url
      // arrives after boot — the reactive-address case auto exists for)
      assert.equal(app.g.log, "", "an empty url fetches nothing");
      app.g.url = "/g.json";
      assert.equal(app.g.log, "before;", "the url push ran maybeAuto, which called this.fetch() — the override");
      await landed();
      assert.equal(app.g.loaded, true);
      assert.deepEqual(app.g.value, ROWS);
    });
    await test("a use-site override of a plain DataSource reaches the runtime's fetch through super", async () => {
      app.d.fetch();
      assert.equal(app.d.n, 1);
      await landed();
      assert.equal(app.d.loaded, true);
      assert.deepEqual(app.d.value, ROWS);
    });
  } finally { provideTransport(prev); }
})();

// ── Animators: start() with super moves; without super, the author replaced it ─
await (async () => {
  const app = await build(`
class Bouncy extends Spring [ starts: number = 0, start() { starts = starts + 1; super.start() } ]
class Slide extends Animator [ log: string = "", duration = 300, attribute = x, started = true,
    start() { log = log + "S"; super.start() } ]
class Mute extends Animator [ hits: number = 0, duration = 300, attribute = x, start() { hits = hits + 1 } ]
App [ width = 100, height = 100,
    v: View [ width = 10,
        s: Bouncy [ attribute = x, to = 50 ],
        a: Slide [ to = 40 ],
        m: Mute [ to = 40 ] ] ]`);
  await test("Spring: a start() override with super counts, and the spring still runs", () => {
    app.v.s.stop();
    assert.equal(app.v.s.running, false);
    app.v.s.start();
    assert.equal(app.v.s.starts, 1);
    assert.equal(app.v.s.running, true, "super.start() reached Animator.start");
    app.v.s.stop();
  });
  await test("Animator: the runtime's autoStart (started = true) reaches the override, which reaches the runtime's start", () => {
    assert.equal(app.v.a.log, "S", "autoStart called this.start() — the override");
    assert.equal(app.v.a.running, true);
    app.v.a.stop();
  });
  await test("an override with NO super replaces the runtime's method outright: start() no longer starts", () => {
    app.v.m.start();
    assert.equal(app.v.m.hits, 1);
    assert.equal(app.v.m.running, false, "the author replaced start; the runtime's did not run");
  });
})();

// ── Two-level chain: each super reaches the provider beneath it; the runtime is the floor ─
await (async () => {
  const prev = provideTransport(fixture);
  try {
    const app = await build(`
class A extends DataSource [ log: string = "", fetch() { log = log + "A"; super.fetch() } ]
class B extends A [ fetch() { log = log + "B"; super.fetch() } ]
App [ width = 1, height = 1,
    b: B [ url = "/b.json" ],
    c: B [ url = "/c.json", fetch() { log = log + "U"; super.fetch() } ] ]`);
    await test("class over runtime, subclass over class: B → A → DataSource.fetch", async () => {
      app.b.fetch();
      assert.equal(app.b.log, "BA");
      await landed();
      assert.equal(app.b.loaded, true);
    });
    await test("use site over subclass: U → B → A → DataSource.fetch", async () => {
      app.c.fetch();
      assert.equal(app.c.log, "UBA");
      await landed();
      assert.equal(app.c.loaded, true);
      assert.deepEqual(app.c.value, ROWS);
    });
  } finally { provideTransport(prev); }
})();

// ── A View's runtime method, at a use site, and a Layout-family sanity check ──
await (async () => {
  await test("View: scrollTo replaced at a use site; super reaches View.scrollTo", async () => {
    const app = await build(`App [ width = 100, height = 100,
      v: View [ width = 10, height = 10, asked: number = -1, scrollTo(y: number) { asked = y; super.scrollTo(y) } ] ]`);
    app.v.scrollTo(7);
    assert.equal(app.v.asked, 7);
  });
})();

// ── Refusals that stay ────────────────────────────────────────────────────────
await (async () => {
  await test("super.nonexistent(): neither declared up the chain nor a runtime method — refused at R1", async () => {
    const errs = await errorsOf(`
class F extends DataSource [ go() { super.go() } ]
App [ width = 1, height = 1, f: F [ url = "/x" ] ]`);
    assert.ok(errs.some((m) => /super\.go\(\): no class beneath F extends DataSource declares go\(\)/.test(m)), JSON.stringify(errs));
  });
  await test("a handler's super reaches nothing: the built-in fires the event, it writes no body", async () => {
    const errs = await errorsOf(`
class F extends DataSource [ onLoad() { super.onLoad() } ]
App [ width = 1, height = 1, f: F [ url = "/x" ] ]`);
    assert.ok(errs.some((m) => /no class beneath F extends DataSource declares onLoad\(\) — super reaches a method written in this program or the library, or a built-in's own runtime method/.test(m)), JSON.stringify(errs));
  });
  await test("a method named after a runtime FIELD is still refused, saying field", async () => {
    const r = await compile(`App [ width = 1, height = 1, v: View [ surface() { } ] ]`);
    assert.deepEqual((r.errors ?? []).map((e) => e.message), [], "the checker is runtime-free by design");
    assert.throws(() => settleHeadless(r.source, { deps: r.deps }), /View\.surface: 'surface' is a built-in field of the runtime View, not a method/);
  });
  await test("the super call is typechecked against the runtime method's documented signature", async () => {
    const errs = await errorsOf(`
class F extends DataSource [ fetch() { super.fetch("x") } ]
App [ width = 1, height = 1, f: F [ url = "/x" ] ]`);
    assert.ok(errs.some((m) => /passes 1 arguments but the method declares 0 parameters|Expected 0 arguments/.test(m)), JSON.stringify(errs));
  });
})();

// ── Polarity: overriding runtime PLUMBING is legal and warned ─────────────────
await (async () => {
  await test("overriding a documented runtime method (fetch, start) warns nothing", async () => {
    const ws = await warningsOf(`
class F extends DataSource [ fetch() { super.fetch() } ]
class S extends Spring [ start() { super.start() } ]
App [ width = 1, height = 1, f: F [ url = "/x" ], v: View [ s: S [ attribute = x, to = 1 ] ] ]`);
    assert.deepEqual(ws.filter((w) => w.code === "DECLARE4009"), []);
  });
  await test("overriding runtime plumbing (maybeAuto, tick) compiles, typechecks its super, and warns DECLARE4009", async () => {
    const ws = await warningsOf(`
class F extends DataSource [ maybeAuto() { super.maybeAuto() } ]
class S extends Spring [ tick(now: number) -> boolean { return super.tick(now) } ]
App [ width = 1, height = 1, f: F [ url = "/x" ], v: View [ s: S [ attribute = x, to = 1 ] ] ]`);
    const plumbing = ws.filter((w) => w.code === "DECLARE4009").map((w) => w.message);
    assert.equal(plumbing.length, 2, JSON.stringify(ws.map((w) => w.message)));
    assert.match(plumbing[0], /F\.maybeAuto\(\) replaces DataSource's maybeAuto\(\), which is runtime plumbing/);
    assert.match(plumbing[1], /S\.tick\(\) replaces Spring's tick\(\)/);
  });
})();

// ── The table is pinned against the runtime classes ───────────────────────────
await (async () => {
  const classes = { ...reg.TAGS, ...reg.LAYOUT_BASES, ...reg.DATA, ...reg.ANIMATORS, ...reg.ANIMATOR_GROUPS, ...reg.SOURCES, ...reg.STATES, Media, Editor, Stream, RichText };
  const schemas = { ...SCHEMAS, RichText: RichTextSchema };
  // Every function on the prototype chain below Object.prototype, minus
  // `constructor` and `$`-names — the runtime's own rule (instantiate.ts
  // runtimeMember), applied to the class rather than an instance.
  const chainMethods = (C) => {
    const out = new Set();
    for (let p = C.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      for (const n of Object.getOwnPropertyNames(p)) {
        if (n === "constructor" || n.startsWith("$")) continue;
        if (typeof Object.getOwnPropertyDescriptor(p, n).value === "function") out.add(n);
      }
    }
    return out;
  };
  await test("every schema has a runtime class to pin against, and every table key is a schema", () => {
    for (const s of Object.keys(schemas)) assert.ok(typeof classes[s] === "function", `${s} has no runtime class here — add it to the pin`);
    for (const k of Object.keys(RUNTIME_METHODS)) assert.ok(schemas[k] !== undefined, `RUNTIME_METHODS.${k} names no schema`);
  });
  await test("RUNTIME_METHODS: each schema's OWN list is exactly its class's methods beyond its nearest schema base's", () => {
    for (const s of Object.keys(schemas)) {
      let b = schemas[s].base;
      while (b !== null && classes[b.name] === undefined) b = b.base;
      const beneath = b === null ? new Set() : chainMethods(classes[b.name]);
      const expected = [...chainMethods(classes[s])].filter((n) => !beneath.has(n)).sort();
      assert.deepEqual([...(RUNTIME_METHODS[s] ?? [])].sort(), expected, `RUNTIME_METHODS.${s} drifted from ${classes[s].name}.prototype`);
    }
  });
  await test("runtimeMethodsOf(schema) is the whole prototype chain", () => {
    for (const s of Object.keys(schemas)) {
      assert.deepEqual([...runtimeMethodsOf(s)].sort(), [...chainMethods(classes[s])].sort(), `runtimeMethodsOf(${s})`);
    }
    assert.ok(runtimeMethodsOf("Spring").has("start"), "a Spring reaches Animator's start");
    assert.ok(runtimeMethodsOf("Keys").has("discard"), "a source reaches Node's methods through Source");
    assert.equal(runtimeMethodsOf("NotASchema").size, 0);
  });
  await test("runtimePlumbing agrees with the reference: a runtime method is plumbing exactly when the doc model lists it structural-only", () => {
    const model = JSON.parse(readFileSync(new URL("../docs/declare-model.json", import.meta.url), "utf8"));
    // The model files a method under the class that DECLARES it (Spring
    // re-declares start, documented on Animator), so "documented" is read up
    // the schema chain — the reading a program's override gets.
    const documented = (cls, name) => {
      for (let s = schemas[cls]; s; s = s.base) if (model.reference[`${s.name}.method.${name}`]?.api === true) return true;
      return false;
    };
    let checked = 0;
    for (const [id, node] of Object.entries(model.reference)) {
      if (node.kind !== "method" || node.getter === true || node.isStatic === true) continue;
      const [cls, , name] = id.split(".");
      // a tag or base a program can name (RichText is neither); draw and the
      // service statics are not prototype methods
      if (SCHEMAS[cls] === undefined || !runtimeMethodsOf(cls).has(name)) continue;
      const doc = documented(cls, name);
      assert.equal(doc, !runtimePlumbing(cls).has(name), `${id}: the reference says ${doc ? "documented" : "structural-only"}, the compiler says ${runtimePlumbing(cls).has(name) ? "plumbing" : "documented"}`);
      checked++;
    }
    assert.ok(checked > 60, `pinned ${checked} runtime methods against the model`);
    assert.ok(runtimePlumbing("DataSource").has("maybeAuto"));
    assert.ok(!runtimePlumbing("DataSource").has("fetch"));
    assert.ok(!runtimePlumbing("View").has("discard"), "View documents Node's discard");
    assert.ok(runtimePlumbing("Node").has("discard"), "a bare Node does not");
  });
})();

console.log(`\noverride-runtime: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
