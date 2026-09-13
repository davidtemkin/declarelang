// super (2026-09-12 ruling): a method is a method, and a subclass's method
// replaces its base's. `super.name(args)` calls the nearest provider of `name`
// beneath the calling body in the class chain — anywhere in the body, or not
// at all. Handlers are methods and get no rule of their own.
import assert from "node:assert";
import { compile, settleHeadless } from "../compiler/dist/compile-node.js";
import { settle } from "../runtime/dist/reactive.js";
import { provideMeasurer } from "../runtime/dist/measure.js";
provideMeasurer({ set font(_) {}, set letterSpacing(_) {}, measureText: (t) => ({ width: t.length * 7, fontBoundingBoxAscent: 11, fontBoundingBoxDescent: 3, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }) });
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
async function build(src) {
  const r = await compile(src);
  assert.deepEqual((r.errors ?? []).map((e) => e.message), [], "compiles");
  return settleHeadless(r.source, { deps: r.deps });
}
const errorsOf = async (src) => ((await compile(src)).errors ?? []).map((e) => e.message);
console.log("super — calling the base's method");

await (async () => {
  const app = await build(`
class A extends View [ log: string = "",
    step(tag: string) { log = log + "A" + tag },
    onInit() { log = log + "a" } ]
class B extends A [
    step(tag: string) { log = log + "("; super.step(tag); log = log + ")" },
    onInit() { super.onInit(); log = log + "b" } ]
class C extends B [
    step(tag: string) { super.step(tag + "!"); log = log + "C" },
    onInit() { log = log + "c"; super.onInit() } ]
class Quiet extends A [ step(tag: string) { log = log + "q" } ]
App [ width = 100, height = 100,
    c: C [ ],
    q: Quiet [ ],
    u: B [ step(tag: string) { log = log + "u"; super.step(tag) } ] ]`);
  test("boot fired the handler chain through super: c first, then a, then b", () => {
    assert.equal(app.c.log.slice(0, 3), "cab");
  });
  test("each body's super reaches the provider beneath it, through three levels", () => {
    app.c.log = ""; app.c.step("x");
    assert.equal(app.c.log, "(Ax!)C");
  });
  test("never calling super is legal: the base's method simply does not run", () => {
    app.q.log = ""; app.q.step("x");
    assert.equal(app.q.log, "q");
  });
  test("a use-site override reaches the class's method", () => {
    app.u.log = ""; app.u.step("y");
    assert.equal(app.u.log, "u(Ay)");
  });
})();

await (async () => {
  // dispatch inside the base stays virtual: a base method calling this.other()
  // reaches the subclass's override, as in any class language
  const app = await build(`
class Base extends View [ out: string = "",
    name() -> string { return "base" },
    greet() { out = "hi " + name() } ]
class Sub extends Base [
    name() -> string { return "sub/" + super.name() },
    greet() { super.greet(); out = out + "." } ]
App [ width = 100, height = 100, s: Sub [ ] ]`);
  test("the base body's own calls dispatch to the override (virtual), super only reaches down", () => {
    app.s.greet();
    assert.equal(app.s.out, "hi sub/base.");
  });
})();

await (async () => {
  // a constraint that calls an override which calls super: the base body's
  // reads are wired, so the constraint follows a slot only the base reads
  const app = await build(`
class Base extends View [ k: number = 1,
    size() -> number { return k * 10 } ]
class Sub extends Base [ extra: number = 0,
    size() -> number { return super.size() + extra } ]
App [ width = 300, height = 300,
    s: Sub [ ],
    shown: number = { app.s.size() } ]`);
  test("dependencies flow through super: a slot only the base body reads is wired", () => {
    assert.equal(app.shown, 10);
    app.s.k = 3; settle();
    assert.equal(app.shown, 30, "the base's read of k woke the constraint");
    app.s.extra = 5; settle();
    assert.equal(app.shown, 35);
  });
})();

await (async () => {
  const app = await build(`
class Loud extends Button [ presses: number = 0,
    press() { presses = presses + 1; super.press() } ]
App [ width = 300, height = 300, clicks: number = 0,
    b: Loud [ label = "go", onClick() { app.clicks = app.clicks + 1 } ] ]`);
  test("a library class's method is reachable: super.press() runs Button's press", () => {
    app.b.press();
    assert.equal(app.b.presses, 1);
    assert.equal(app.clicks, 1, "Button.press called onClick");
  });
})();

await (async () => {
  const e1 = await errorsOf(`class A extends View [ ]
class B extends A [ go() { super.go() } ]
App [ B [ ] ]`);
  test("no provider beneath the body: refused", () => {
    assert.ok(e1.some((m) => /super\.go\(\): no class beneath B extends A declares go\(\)/.test(m)), JSON.stringify(e1));
  });
  const e2 = await errorsOf(`App [ onInit() { super.onInit() } ]`);
  test("a built-in base offers no body to call — the same refusal for a handler", () => {
    assert.ok(e2.some((m) => /no class beneath App declares onInit\(\) — super reaches a method written in this program or the library/.test(m)), JSON.stringify(e2));
  });
  const e3 = await errorsOf(`class A extends View [ f() -> number { return 1 } ]
class B extends A [ w: number = { super.f() } ]
App [ B [ ] ]`);
  test("super in a { } value is refused", () => {
    assert.ok(e3.some((m) => /super is for a method body/.test(m)), JSON.stringify(e3));
  });
  const e4 = await errorsOf(`class A extends View [ f() { } ]
class B extends A [ f() { const g = super.f } ]
App [ B [ ] ]`);
  test("super not in call position is refused", () => {
    assert.ok(e4.some((m) => /write super\.name\(…\)/.test(m)), JSON.stringify(e4));
  });
  const e5 = await errorsOf(`class A extends View [ f(n: number) { } ]
class B extends A [ f(n: number) { super.f("x") } ]
App [ B [ ] ]`);
  test("the call is typechecked against the base method's signature", () => {
    assert.ok(e5.some((m) => /not assignable to parameter of type 'number'/.test(m)), JSON.stringify(e5));
  });
  const e6 = await errorsOf(`class A extends View [ f() { } ]
class B extends A [ kid: View [ f() { super.f() } ] ]
App [ B [ ] ]`);
  test("a nested child's body reaches its own tag's chain, not the enclosing class's", () => {
    assert.ok(e6.some((m) => /no class beneath View declares f\(\)/.test(m)), JSON.stringify(e6));
  });
})();

console.log(`super: ${pass} passed, ${fail} failed`);
// Button's press flash leaves an animation timer armed; the verdict is in
process.exit(fail ? 1 : 0);
