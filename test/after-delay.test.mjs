// `afterDelay(ms, fn)` — one call later, owned by the node that asked — and a
// numeric `Time.tick`, a period in milliseconds. Both read the one wall-clock
// seam (wallclock.ts), so a hand-driven host drives them here; and a { } body
// is answered with these, never with the host's timers or fetch.
import assert from "node:assert";
import { compile, settleHeadless } from "../compiler/dist/compile-node.js";
import { settle } from "../runtime/dist/reactive.js";
import { setTimeHost } from "../runtime/dist/wallclock.js";
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
async function errorsOf(src) {
  const r = await compile(src);
  return (r.errors ?? []).map((e) => e.message);
}

/** A hand-driven clock: timers and frames queue; `advance(ms)` runs what falls due. */
const fakeHost = (start = 1_000_000) => {
  const h = {
    t: start, timers: [], frames: [],
    now: () => h.t,
    setTimeout: (fn, ms) => { const id = { fn, at: h.t + ms }; h.timers.push(id); return id; },
    clearTimeout: (id) => { h.timers = h.timers.filter((x) => x !== id); h.frames = h.frames.filter((x) => x !== id); },
    frame: (fn) => { const id = { fn }; h.frames.push(id); return id; },
    cancelFrame: (id) => { h.frames = h.frames.filter((x) => x !== id); },
    /** show one frame: run the frame callbacks queued before it */
    showFrame: () => { const fs = h.frames; h.frames = []; for (const f of fs) f.fn(); },
    advance: (ms) => {
      const end = h.t + ms;
      for (;;) {
        h.timers.sort((a, b) => a.at - b.at);
        const next = h.timers[0];
        if (next === undefined || next.at > end) break;
        h.timers.shift();
        h.t = Math.max(h.t, next.at);
        next.fn();
      }
      h.t = end;
    },
  };
  return h;
};

console.log("afterDelay(ms, fn) and a numeric tick");

await test("afterDelay(ms, fn) runs once, ms later, and never before the frame is shown", async () => {
  const h = fakeHost(); setTimeHost(h);
  try {
    const app = await build(`App [ width = 100, height = 100, n: number = 0,
        go() { afterDelay(500, () => { app.n = app.n + 1 }) } ]`);
    app.go();
    h.advance(1000); settle();
    assert.equal(app.n, 0, "nothing runs until the asking frame is shown");
    h.showFrame(); h.advance(0); settle();
    assert.equal(app.n, 1, "the time already waited counts: it runs as soon as the frame is shown");
    h.advance(5000); h.showFrame(); settle();
    assert.equal(app.n, 1, "once");
  } finally { setTimeHost(null); }
});

await test("afterDelay(0, fn) is the next frame", async () => {
  const h = fakeHost(); setTimeHost(h);
  try {
    const app = await build(`App [ width = 100, height = 100, n: number = 0,
        go() { afterDelay(0, () => { app.n = 7 }) } ]`);
    app.go(); settle();
    assert.equal(app.n, 0);
    h.showFrame(); h.advance(0); settle();
    assert.equal(app.n, 7);
  } finally { setTimeHost(null); }
});

await test("cancel() drops a wait that has not run", async () => {
  const h = fakeHost(); setTimeHost(h);
  try {
    const app = await build(`App [ width = 100, height = 100, n: number = 0,
        go() { const w = afterDelay(100, () => { app.n = 1 }); w.cancel() } ]`);
    app.go(); h.showFrame(); h.advance(500); settle();
    assert.equal(app.n, 0);
    assert.equal(h.timers.length + h.frames.length, 0, "nothing left armed");
  } finally { setTimeHost(null); }
});

await test("a discarded node's waits are cancelled", async () => {
  const h = fakeHost(); setTimeHost(h);
  try {
    const app = await build(`App [ width = 100, height = 100, n: number = 0,
        d: Dataset { { "rows": [ { "id": 1 } ] } },
        box: View [ datapath = { app.d.value },
          View [ datapath = :rows[], width = 10, height = 10,
            onInit() { afterDelay(200, () => { app.n = 1 }) } ] ] ]`);
    h.showFrame(); settle();
    assert.equal(h.timers.length, 1, "armed");
    app.d.set(["rows"], []); settle();
    assert.equal(h.timers.length + h.frames.length, 0, "the replica went, and its wait with it");
    h.advance(500); settle();
    assert.equal(app.n, 0);
  } finally { setTimeHost(null); }
});

await test("afterDelay() in a { } value is refused", async () => {
  const errs = await errorsOf(`App [ width = 100, height = 100, n: number = { afterDelay(5, () => {}) ? 1 : 0 } ]`);
  assert.ok(errs.some((m) => /afterDelay\(\) waits, and a \{ \} value computes/.test(m)), errs.join("\n"));
});

await test("the host's timers, fetch and globalThis are refused in a body, with the Declare way named", async () => {
  const cases = [
    ["setTimeout(() => {}, 5)", /afterDelay\(ms, fn\)/],
    ["setInterval(() => {}, 5)", /Time \[ tick = 5000/],
    ["fetch(\"/x\")", /DataSource/],
    ["(globalThis as any).x = 1", /global object/],
  ];
  for (const [body, re] of cases) {
    const errs = await errorsOf(`App [ width = 100, height = 100, go() { ${body} } ]`);
    assert.ok(errs.some((m) => re.test(m)), `${body}: ${errs.join("\n")}`);
  }
});

await test("a script block may still use the host's timers", async () => {
  const errs = await errorsOf(`script { function later(fn: () => void) { setTimeout(fn, 10) } }
    App [ width = 100, height = 100, go() { later(() => {}) } ]`);
  assert.deepEqual(errs, []);
});

await test("Time [ tick = 5000 ] fires every five seconds from when it starts, dt in seconds", async () => {
  const h = fakeHost(1_000_123); setTimeHost(h);
  try {
    const app = await build(`App [ width = 100, height = 100, ticks: number = 0, lastDt: number = 0,
        poll: Time [ tick = 5000, onTick(dt: number) { app.ticks = app.ticks + 1; app.lastDt = dt } ] ]`);
    h.advance(4999); settle();
    assert.equal(app.ticks, 0, "not aligned to the clock: counted from the start");
    h.advance(1); settle();
    assert.equal(app.ticks, 1);
    assert.equal(app.lastDt, 5);
    h.advance(5000); settle();
    assert.equal(app.ticks, 2);
    h.advance(60_000); settle();
    assert.ok(app.ticks >= 3 && app.lastDt <= 5, "a late wake clamps dt to one period");
  } finally { setTimeHost(null); }
});

await test("a numeric tick out of range is refused at compile", async () => {
  const errs = await errorsOf(`App [ width = 100, height = 100, t: Time [ tick = 0 ] ]`);
  assert.ok(errs.length > 0);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
