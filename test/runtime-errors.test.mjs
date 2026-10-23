// test/runtime-errors.test.mjs — a runtime failure is LOUD, ATTRIBUTED, and
// NEVER FATAL (field report 2026-08-21, batch 3).
//
// Three silent deaths found the same week: a handler that threw took the whole
// boot with it (blank page, nothing named); a per-frame exception ran for nine
// minutes at 60Hz with a minified stack naming nothing; a throwing onLoad
// marked a perfectly good response as a source failure. The rule all three now
// share: the throw is logged as a Declare error that NAMES the handler and the
// node it sits on, and the program around it keeps running — one broken
// handler may not take down the tree, the frame loop, or the data it rode in
// on.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { buildProgram, settle } from "../runtime/dist/index.js";
import { Clock, setClock } from "../runtime/dist/animate.js";
import { provideTransport } from "../runtime/dist/data.js";

/** Run `fn` with console.error captured; returns the logged lines. */
async function logged(fn) {
  const lines = [];
  const orig = console.error;
  console.error = (...a) => lines.push(a.map((x) => String(x?.message ?? x)).join(" "));
  try { await fn(); } finally { console.error = orig; }
  return lines;
}

/** The fake frame scheduler (unit.test.mjs's) — frames fire when told to. */
function fakeScheduler() {
  let cb = null;
  let handle = 0;
  let last = 0;
  return {
    now: () => last,
    request(fn) { cb = fn; return ++handle; },
    cancel() { cb = null; },
    frame(now) { const fn = cb; cb = null; if (fn) { last = now; fn(now); } },
    advance(now) { last = now; },
    get scheduled() { return cb !== null; },
  };
}

const reply = (status, body) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  text: () => Promise.resolve(JSON.stringify(body)),
  json: () => Promise.resolve(body),
});

await test("a thrown handler is logged with its name and node path — and the boot survives", async () => {
  const r = await compile(`App [ width = 100, height = 100,
    ok: Text [ text = "alive" ],
    boom: View [ onInit() { (null as any).x } ],
  ]`);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  let a;
  const lines = await logged(() => { a = buildProgram(r.program); settle(); });
  assert.equal(a.ok.text, "alive", "the sibling still built — one broken handler is not fatal");
  assert.ok(lines.some((l) => l.includes("[Declare] onInit on app.boom threw")),
    `the log names the handler AND the node: ${JSON.stringify(lines)}`);
});

await test("a throwing onTick cannot wedge the tab: three in a row stop the Time, restartably", async () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const r = await compile(`App [ width = 100, height = 100,
    hb: Time [ tick = frame, onTick(dt: number) { (null as any).x } ],
  ]`);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  let a;
  const lines = await logged(() => {
    a = buildProgram(r.program); settle();
    // frame 0 is the baseline; 16/32/48 each throw; the third stops it
    for (const t of [0, 16, 32, 48, 64, 80]) sched.frame(t);
  });
  assert.equal(a.hb.running, false, "three consecutive throws turn the Time off");
  assert.equal(lines.filter((l) => l.includes("onTick on Time 'hb' threw")).length, 3,
    `exactly the three throws are logged (then it is OFF, not throwing 60Hz): ${JSON.stringify(lines)}`);
  assert.ok(lines.some((l) => l.includes("stopped") && l.includes("running = true")),
    "the stop line says how to restart");
  // and `running = true` really does restart it (the counter was reset)
  const again = await logged(() => {
    a.hb.running = true; settle();
    sched.frame(100); sched.frame(116);
  });
  assert.ok(again.some((l) => l.includes("onTick on Time 'hb' threw")), "restarted and ticking again");
});

await test("a throwing onLoad does NOT mark the source failed — the data arrived", async () => {
  const r = await compile(`App [ width = 100, height = 100,
    ds: DataSource [ url = "/api/thing", onLoad() { (null as any).x } ],
  ]`);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const a = buildProgram(r.program);
  const prev = provideTransport(() => reply(200, { n: 7 }));
  try {
    const lines = await logged(() => a.ds.fetch());
    assert.equal(a.ds.failed, false, "the response was good; the handler's bug is the handler's");
    assert.equal(a.ds.value.n, 7);
    assert.ok(lines.some((l) => l.includes("[Declare] onLoad on DataSource")),
      `the throw is still loud and attributed: ${JSON.stringify(lines)}`);
  } finally { provideTransport(prev); }
});

await test("a throwing onMessage does not kill the stream (fire's guard)", async () => {
  const r = await compile(`App [ width = 100, height = 100,
    got: number = 0,
    es: EventStream [ url = "", onMessage(m: StreamMessage) { app.got = app.got + 1; (null as any).x } ],
  ]`);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const a = buildProgram(r.program);
  settle();
  const lines = await logged(() => {
    // deliver two messages through the same protected fire the seam uses:
    // the first handler call throws, the second must still arrive
    a.es.$fire("onMessage", { data: "one" });
    a.es.$fire("onMessage", { data: "two" });
  });
  assert.equal(a.got, 2, "the burst survives its first bad message");
  assert.equal(lines.filter((l) => l.includes("onMessage on EventStream threw")).length, 2);
});

// A THROWING CONSTRAINT IS ITS OWN FAILURE. A theme switch woke three rules in
// one settle and the middle one threw: the settle stopped there and dropped the
// third, which kept the old theme's value until one of its own inputs moved
// again — half the screen switched, half did not, and the uncaught error named
// no rule. Now the rule that threw is named and keeps its last value, every
// other rule in the settle still runs, and settle() still throws the error.
const THEMED = `App [ width = 100, height = 100,
    night: boolean = true,
    wash: Text [ text = { app.night ? "dark fill" : "light fill" } ],
    badge: Text [ text = { app.night ? "badge" : (null as any).x } ],
    ink: Text [ text = { app.night ? "dark ink" : "light ink" } ],
  ]`;

await test("a constraint that throws is named, and the rules queued behind it in the settle still run", async () => {
  const r = await compile(THEMED);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const a = buildProgram(r.program);
  settle();
  assert.equal(a.ink.text, "dark ink");
  let thrown = null;
  const lines = await logged(() => {
    a.night = false;
    try { settle(); } catch (e) { thrown = e; }
  });
  assert.ok(thrown instanceof TypeError, `settle() still throws the body's own error: ${thrown}`);
  assert.equal(a.wash.text, "light fill", "the rule before the throw updated");
  assert.equal(a.ink.text, "light ink", "the rule queued behind the throw updated too");
  assert.equal(a.badge.text, "badge", "the rule that threw keeps its last value");
  const named = lines.filter((l) => l.startsWith("[Declare] ") && l.includes(" threw: "));
  assert.equal(named.length, 1, `the throw is logged once: ${JSON.stringify(lines)}`);
  assert.match(named[0], /Text\.text \(line 4, col \d+\) threw/, `the log names the rule that threw: ${named[0]}`);
});

await test("a constraint that throws on every run is not retried: once per settle that wakes it", async () => {
  const r = await compile(THEMED);
  const a = buildProgram(r.program);
  settle();
  const lines = await logged(() => {
    a.night = false;
    assert.throws(() => settle(), TypeError);
    settle();   // nothing is left queued: no throw, no re-run
    settle();
  });
  assert.equal(lines.filter((l) => l.includes(" threw: ")).length, 1, `one throw, one line: ${JSON.stringify(lines)}`);
  a.night = true;
  settle();   // the rule recovers the moment its input lets it
  assert.deepEqual([a.wash.text, a.badge.text, a.ink.text], ["dark fill", "badge", "dark ink"]);
  await logged(() => { a.night = false; assert.throws(() => settle(), TypeError); });
  assert.deepEqual([a.wash.text, a.badge.text, a.ink.text], ["light fill", "badge", "light ink"]);
});

summarize("runtime-errors");
