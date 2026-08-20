// The ISLAND BRIDGE, headless (islands design, ruled 2026-08-20): `external`
// attribute declarations as the typed fact surface, post/onPost as the verb
// pair, linkIslandTenant as the linker. Pins, one per clause:
//   - the TYPE HANDSHAKE: paired names must agree — a mismatch is a LINK error;
//   - facts bridge both directions, per settle, echo-guarded;
//   - initial values: host wins host-writable slots, tenant wins `readonly
//     external` (tenant-owned) ones;
//   - verbs cross both ways with { topic, payload };
//   - the OWNERSHIP referee: a push to a host-bound slot is refused loudly,
//     naming the constraint, without crashing the settle;
//   - the foreign handle: get/set/observe/post/onPost, with set boundary-
//     validated against the declared type;
//   - `external` placement/type rules are checker errors.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle, linkIslandTenant } from "../runtime/dist/index.js";
import { applyDeps } from "../runtime/dist/deps.js";

async function boot(src) {
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, "compiles: " + r.errors.map((e) => e.message).join("; "));
  const program = parseProgram(r.source);
  applyDeps(program, r.deps);
  const app = instantiate(program);
  settle();
  return app;
}

const HOST = `App [ width = 200, height = 100,
    vol: number = 0.7,
    log: string = "",
    isl: DOMIsland [ width = 50, height = 50,
        external volume: number = { app.vol },
        external readonly pos: number = 0,
        onPost(m: IslandPost) { app.log = app.log + m.topic + ":" + m.payload + ";" }
        ],
    readout: Text [ text = { "" + app.isl.pos } ],
    ]`;

const TENANT = `App [ width = 10, height = 10,
    external volume: number = 0,
    external pos: number = 5,
    heard: string = "",
    onPost(m: IslandPost) { app.heard = app.heard + m.topic },
    bump() { this.pos = this.pos + 1 },
    ]`;

await test("link: handshake, initial sync, both directions, per settle", async () => {
  const host = await boot(HOST);
  const tenant = await boot(TENANT);
  const unlink = linkIslandTenant(host.isl, tenant);
  try {
    settle();
    // initial: host wins the host-writable slot; tenant wins the readonly one
    assert.equal(tenant.volume, 0.7, "host's volume delivered at link");
    assert.equal(host.isl.pos, 5, "tenant's pos delivered at link (readonly external = tenant-owned)");
    assert.equal(host.readout.text, "5", "…and host constraints re-derived from it");
    // host → tenant: the bound input follows its source
    host.vol = 0.3;
    settle();
    assert.equal(tenant.volume, 0.3, "a host write crosses at the settle");
    // tenant → host: the export crosses and wakes host readers
    tenant.bump();
    settle();
    assert.equal(host.isl.pos, 6, "a tenant write crosses");
    assert.equal(host.readout.text, "6", "…and re-derives the host's readers");
  } finally { unlink(); host.discard(); tenant.discard(); }
});

await test("verbs: post/onPost cross both ways with { topic, payload }", async () => {
  const host = await boot(HOST);
  const tenant = await boot(TENANT);
  const unlink = linkIslandTenant(host.isl, tenant);
  try {
    host.isl.post("play", 1);
    settle();
    assert.equal(tenant.heard, "play", "host → tenant verb");
    tenant.post("seek", 42);
    settle();
    assert.equal(host.log, "seek:42;", "tenant → host verb, payload carried");
  } finally { unlink(); host.discard(); tenant.discard(); }
});

await test("handshake: a type mismatch is a LINK error, at link time", async () => {
  const host = await boot(`App [ width = 100,
      isl: DOMIsland [ width = 10, height = 10, external volume: number = 0 ] ]`);
  const tenant = await boot(`App [ width = 10, external volume: string = "loud" ]`);
  try {
    assert.throws(() => linkIslandTenant(host.isl, tenant), /external number.*external string.*could not be linked/s);
  } finally { host.discard(); tenant.discard(); }
});

await test("ownership referees direction: a push to a host-bound slot is refused, not crashed", async () => {
  // The STRICT input spelling: the CLASS declares the external, the instance
  // BINDS it — a standing, owning constraint. (A `{ }` DECLARATION DEFAULT is
  // a defBinding — a rank-1 fallback by the language's own rules — so a tenant
  // push legitimately displaces it: the soft-input spelling. Strictness is the
  // author's choice of spelling, not a new rule.)
  const host = await boot(`class Player extends DOMIsland [ external volume: number = 0 ]
App [ width = 200, height = 100,
      vol: number = 0.7,
      isl: Player [ width = 50, height = 50, volume = { app.vol } ],
      ]`);
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(" "));
  try {
    const h = host.isl.foreignHandle();
    h.set("volume", 0.9);             // the tenant tries to write the host's input
    assert.ok(errs.some((e) => /refused/.test(e) && /constraint/.test(e)), "refusal names the owning constraint");
    assert.equal(host.isl.volume, 0.7, "the host's value stands");
  } finally { console.error = orig; host.discard(); }
});

await test("foreign handle: observe, boundary validation, verbs", async () => {
  const host = await boot(HOST);
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(" "));
  try {
    const h = host.isl.foreignHandle();
    // discovery
    assert.deepEqual(h.externals().map((e) => e.name).sort(), ["pos", "volume"]);
    // a typed push lands (pos is readonly external = tenant-owned)
    h.set("pos", 12);
    settle();
    assert.equal(h.get("pos"), 12);
    assert.equal(host.readout.text, "12", "host readers re-derived");
    // a MIStyped push is refused with the type named
    h.set("pos", "twelve");
    assert.ok(errs.some((e) => /expected a number/.test(e)), "boundary validation speaks");
    assert.equal(h.get("pos"), 12, "…and the slot stands");
    // observe: per-settle notification
    let seen = null;
    const un = h.observe("pos", (v) => { seen = v; });
    h.set("pos", 13);
    settle();
    assert.equal(seen, 13, "observe fired with the settled value");
    un();
    // verbs both ways
    let got = null;
    h.onPost((m) => { got = m; });
    host.isl.post("hello", { a: 1 });
    assert.deepEqual(got, { topic: "hello", payload: { a: 1 } }, "host post reaches the foreign tenant");
    h.post("clicked", 3);
    settle();
    assert.equal(host.log, "clicked:3;", "foreign post fires the island's onPost");
  } finally { console.error = orig; host.discard(); }
});

await test("checker: external placement and type rules", async () => {
  // wrong home
  const r1 = await compile(`App [ width = 10, v: View [ external fooX: number = 0 ] ]`, {});
  assert.ok(r1.errors.some((e) => /island-boundary slot/.test(e.message)), "external off an Island/App is refused");
  // component types cannot cross
  const r2 = await compile(`App [ width = 10, isl: DOMIsland [ external v: View = null ] ]`, {});
  assert.ok(r2.errors.some((e) => /cannot cross/.test(e.message)), "a view-typed external is refused");
  // prevailing cannot combine
  const r3 = await compile(`App [ width = 10, isl: DOMIsland [ prevailing external fooX: number = 0 ] ]`, {});
  assert.ok(r3.errors.some((e) => /prevailing and external/.test(e.message)), "prevailing+external is refused");
  // the happy form is clean
  const r4 = await compile(`App [ width = 10, isl: DOMIsland [ external readonly fooX: number = 0 ] ]`, {});
  assert.equal(r4.errors.length, 0, r4.errors.map((e) => e.message).join("; "));
});

summarize("island");
