// The ISLAND BOUNDARY, headless: what crosses says its direction. DOWN, the
// island lists names in `provides` and the tenant reads them with
// `hostProvided(name, default)`; UP, the tenant's App lists names in `exposes`
// and the host reads them with `island.exposed(name, default)`; post/onPost
// carry the verbs; linkIslandTenant is the linker. Pins, one per clause:
//   - values cross both directions, per settle, from the first frame;
//   - only LISTED names cross, either way;
//   - the default types a read: a value of another kind answers the default;
//   - a read with no default and nothing provided throws, naming it;
//   - verbs cross both ways with { topic, payload };
//   - the foreign handle: hostProvided/watchProvided/expose/post/onPost/provides;
//   - the page is the topmost host: App.provide / exposed / watchExposed;
//   - `external` is gone, with a migration error that names the new words.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle, linkIslandTenant, islandProvisions, withHostProvides } from "../runtime/dist/index.js";
import { applyDeps } from "../runtime/dist/deps.js";

async function boot(src, { settled = true } = {}) {
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, "compiles: " + r.errors.map((e) => e.message).join("; "));
  const program = parseProgram(r.source);
  applyDeps(program, r.deps);
  const app = instantiate(program);
  if (settled) settle();
  return app;
}

/** console.warn captured over `fn` */
async function warnings(fn) {
  const seen = [];
  const orig = console.warn;
  console.warn = (...a) => seen.push(a.join(" "));
  try { await fn(); } finally { console.warn = orig; }
  return seen;
}

const HOST = `App [ width = 200, height = 100,
    vol: number = 0.7,
    log: string = "",
    isl: DOMIsland [ width = 50, height = 50,
        provides = ["volume"],
        volume: number = { app.vol },
        secret: number = 99,
        onPost(m: IslandPost) { app.log = app.log + m.topic + ":" + m.payload + ";" }
        ],
    readout: Text [ text = { "" + app.isl.exposed("pos", 0) } ],
    ]`;

const TENANT = `App [ width = 10, height = 10,
    exposes = ["pos"],
    volume: number = { hostProvided("volume", 0) },
    secret: number = { hostProvided("secret", -1) },
    pos: number = 5,
    hidden: number = 8,
    heard: string = "",
    onPost(m: IslandPost) { app.heard = app.heard + m.topic },
    bump() { this.pos = this.pos + 1 },
    ]`;

await test("link: both directions, per settle, from the first frame", async () => {
  const host = await boot(HOST);
  // linked BEFORE its first settle, as every host links a tenant
  const tenant = await boot(TENANT, { settled: false });
  const unlink = linkIslandTenant(host.isl, tenant);
  try {
    settle();
    assert.equal(tenant.volume, 0.7, "what the island provides is there at the first settle");
    assert.equal(host.isl.exposed("pos", 0), 5, "what the tenant exposes is there at link");
    assert.equal(host.readout.text, "5", "…and host constraints re-derived from it");
    host.vol = 0.3;
    settle();
    assert.equal(tenant.volume, 0.3, "a host change crosses at the settle");
    tenant.bump();
    settle();
    assert.equal(host.isl.exposed("pos", 0), 6, "a tenant change crosses");
    assert.equal(host.readout.text, "6", "…and re-derives the host's readers");
  } finally { unlink(); host.discard(); tenant.discard(); }
});

await test("built with its island's provisions, a tenant's very first evaluation sees them", async () => {
  // what a DataSource url or an onInit reads is evaluated at instantiate —
  // before any link — so a host builds the tenant WITH the values
  const host = await boot(`App [ width = 100,
      isl: DOMIsland [ width = 10, height = 10, provides = ["base"], base: string = "../cal/" ] ]`);
  const r = await compile(`App [ width = 10, seen: string = "", onInit() { this.seen = hostProvided("base", "none") } ]`, {});
  const program = parseProgram(r.source);
  applyDeps(program, r.deps);
  const tenant = withHostProvides(islandProvisions(host.isl), () => instantiate(program));
  try {
    assert.equal(tenant.seen, "../cal/", "onInit read the provided value");
  } finally { host.discard(); tenant.discard(); }
});

await test("only listed names cross, either way", async () => {
  const host = await boot(HOST);
  const tenant = await boot(TENANT, { settled: false });
  const unlink = linkIslandTenant(host.isl, tenant);
  try {
    settle();
    assert.equal(tenant.secret, -1, "an island attribute not in `provides` is not provided");
    assert.equal(host.isl.exposed("hidden", 0), 0, "a tenant attribute not in `exposes` is not exposed");
  } finally { unlink(); host.discard(); tenant.discard(); }
});

await test("the default types a read: another kind answers the default, with a warning", async () => {
  const host = await boot(`App [ width = 100,
      isl: DOMIsland [ width = 10, height = 10, provides = ["volume"], volume: number = 3 ] ]`);
  const tenant = await boot(`App [ width = 10, loud: string = { hostProvided("volume", "quiet") } ]`, { settled: false });
  const unlink = linkIslandTenant(host.isl, tenant);
  settle();
  let loud;
  const w = await warnings(() => { loud = tenant.loud; });
  try {
    assert.equal(loud, "quiet", "a number where a string was asked for answers the default");
    assert.ok(w.some((m) => /volume/.test(m)), "…and says so, naming the value");
  } finally { unlink(); host.discard(); tenant.discard(); }
});

await test("a read with no default and nothing provided throws, naming it", async () => {
  const tenant = await boot(`App [ width = 10 ]`);
  try {
    assert.throws(() => tenant.$hostProvided("volume"), /volume/);
    assert.equal(tenant.$hostProvided("volume", 4), 4, "with a default, the default");
  } finally { tenant.discard(); }
});

await test("verbs: post/onPost cross both ways with { topic, payload }", async () => {
  const host = await boot(HOST);
  const tenant = await boot(TENANT, { settled: false });
  const unlink = linkIslandTenant(host.isl, tenant);
  try {
    settle();
    host.isl.post("play", 1);
    settle();
    assert.equal(tenant.heard, "play", "host → tenant verb");
    tenant.post("seek", 42);
    settle();
    assert.equal(host.log, "seek:42;", "tenant → host verb, payload carried");
  } finally { unlink(); host.discard(); tenant.discard(); }
});

await test("foreign handle: provides, hostProvided, watchProvided, expose, verbs", async () => {
  const host = await boot(HOST);
  try {
    const h = host.isl.foreignHandle();
    assert.deepEqual(h.provides(), ["volume"], "discovery lists what the host provides");
    assert.equal(h.hostProvided("volume"), 0.7);
    const w = await warnings(() => assert.equal(h.hostProvided("secret"), undefined, "an unlisted name reads undefined"));
    assert.ok(w.some((m) => /secret/.test(m)), "…with a warning naming it");
    // a watch: the value now, then each settle that changed it
    const seen = [];
    const un = h.watchProvided("volume", (v) => seen.push(v));
    host.vol = 0.2;
    settle();
    un();
    assert.deepEqual(seen, [0.7, 0.2]);
    // expose: host readers re-derive
    h.expose("pos", 12);
    settle();
    assert.equal(host.readout.text, "12", "host readers re-derived from the foreign expose");
    h.expose("pos", undefined);
    settle();
    assert.equal(host.readout.text, "0", "exposing undefined withdraws it — the default answers");
    // verbs both ways
    let got = null;
    h.onPost((m) => { got = m; });
    host.isl.post("hello", { a: 1 });
    assert.deepEqual(got, { topic: "hello", payload: { a: 1 } }, "host post reaches the foreign tenant");
    h.post("clicked", 3);
    settle();
    assert.equal(host.log, "clicked:3;", "foreign post fires the island's onPost");
  } finally { host.discard(); }
});

await test("the page is the topmost host: provide, exposed, watchExposed", async () => {
  const app = await boot(`App [ width = 10,
      exposes = ["total"],
      theme2: string = { hostProvided("mode", "light") },
      total: number = { app.theme2 == "dark" ? 2 : 1 },
      ]`);
  try {
    assert.equal(app.theme2, "light", "unprovided: the default");
    const seen = [];
    const un = app.watchExposed("total", (v) => seen.push(v));
    app.provide("mode", "dark");
    settle();
    assert.equal(app.theme2, "dark", "a page provide reaches hostProvided");
    assert.equal(app.exposed("total"), 2);
    assert.equal(app.exposed("theme2"), undefined, "a name not in `exposes` is not readable from the page");
    app.provide("mode", undefined);
    settle();
    assert.equal(app.theme2, "light", "providing undefined withdraws it");
    un();
    assert.deepEqual(seen, [1, 2, 1]);
  } finally { app.discard(); }
});

await test("`external` and `env` are not part of the language", async () => {
  // NOT a migration check. `external` was recognized for one release so its
  // error could name the words that replaced it; that path is gone (DT,
  // 2026-09-20: "there will be no migration happening"), so the word is now
  // nothing — an ordinary identifier in a position that takes none, refused by
  // the grammar like any other stray token.
  const r = await compile(`App [ width = 10, isl: DOMIsland [ external v: number = 0 ] ]`, {});
  assert.ok(r.errors.length > 0, "`external` is not a declaration modifier");
  assert.ok(!r.errors.some((e) => /no longer|used to|instead of/i.test(e.message)),
    "the error should not offer a migration: " + r.errors.map((e) => e.message).join("; "));
  const r2 = await compile(`App [ width = 10, env = "dark=1" ]`, {});
  assert.ok(r2.errors.length > 0, "`env` is no longer an App attribute");
});

summarize("island");
