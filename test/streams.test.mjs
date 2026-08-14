// Streams (docs/system-design/streams.md, RULED 2026-07-29): EventStream (SSE)
// and Socket (WebSocket) as sources — the shared Stream surface, the read-only
// lifecycle intrinsics (status/error/open/last), the declared `retry` policy,
// and the provideStreams seam. These tests drive the MODEL through stub
// factories (deterministic message sequences — streams.md §4's unit tier); the
// dev server's SSE fixture route is the browser tier.
import assert from "node:assert";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate, settle, provideStreams } from "../runtime/dist/index.js";

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}

/** A stub factory pair: every dial is recorded with its callbacks, so a test
 *  drives open/message/end by hand and asserts what the component did. */
function stubStreams() {
  const conns = [];
  const record = (kind, url, listen, cb) => {
    const c = { kind, url, listen, cb, closed: false, sent: [] };
    conns.push(c);
    return { close: () => { c.closed = true; }, send: (t) => c.sent.push(t) };
  };
  return {
    conns,
    last: () => conns[conns.length - 1],
    factories: {
      eventSource: (url, listen, cb) => record("es", url, listen, cb),
      socket: (url, cb) => record("ws", url, [], cb),
    },
  };
}

async function compile(src) {
  return await compileProgram(src, { stripPos: false });
}

async function build(src) {
  const r = await compile(src);
  assert.equal(r.errors.length, 0, "compile errors: " + r.errors.map((e) => e.message).join("; "));
  const app = instantiate(r.program);
  settle();
  return app;
}

/** Run `fn` with stub factories installed; returns the stub for assertions. */
async function withStubs(fn) {
  const s = stubStreams();
  const prev = provideStreams(s.factories);
  try { await fn(s); } finally { provideStreams(prev); }
}

console.log("streams — EventStream / Socket over stub factories");

const CHAT = `
App [
    answer: string = "",
    feed: EventStream [ url = "https://x.test/stream",
        onMessage(e: StreamMessage) { app.answer = app.answer + e.data },
        ],
    out: Text [ text = { app.feed.last } ],
    ]`;

await test("a declared EventStream dials at init and reads 'connecting'", async () =>
  await withStubs(async (s) => {
    const app = await build(CHAT);
    assert.equal(s.conns.length, 1);
    assert.equal(s.last().kind, "es");
    assert.equal(s.last().url, "https://x.test/stream");
    assert.equal(app.feed.status, "connecting");
    assert.equal(app.feed.open, false);
    app.discard();
  }));

await test("open → status 'open', the boolean view agrees, error clears", async () =>
  await withStubs(async (s) => {
    const app = await build(CHAT);
    s.last().cb.open();
    settle();
    assert.equal(app.feed.status, "open");
    assert.equal(app.feed.open, true);
    assert.equal(app.feed.error, "");
    app.discard();
  }));

await test("a message lands in `last`, the handler accumulates, bindings follow", async () =>
  await withStubs(async (s) => {
    const app = await build(CHAT);
    s.last().cb.open();
    s.last().cb.message({ data: "Hel", type: "message", id: "" });
    s.last().cb.message({ data: "lo", type: "message", id: "" });
    settle();
    assert.equal(app.feed.last, "lo", "last = the most recent data");
    assert.equal(app.answer, "Hello", "the accumulating handler is app semantics");
    assert.equal(app.out.text, "lo", "the zero-handler tier: text = { feed.last }");
    app.discard();
  }));

await test("an empty url is detached; a url arriving connects (reactive address)", async () =>
  await withStubs(async (s) => {
    const app = await build(`
      App [
          addr: string = "",
          feed: EventStream [ url = { app.addr } ],
          ]`);
    assert.equal(s.conns.length, 0, "nothing to dial yet");
    assert.equal(app.feed.status, "closed");
    app.addr = "https://x.test/live";
    settle();
    assert.equal(s.conns.length, 1);
    assert.equal(s.last().url, "https://x.test/live");
    app.discard();
  }));

await test("a url change closes and reopens at the new address", async () =>
  await withStubs(async (s) => {
    const app = await build(`
      App [
          addr: string = "https://x.test/a",
          feed: EventStream [ url = { app.addr } ],
          ]`);
    s.last().cb.open();
    settle();
    app.addr = "https://x.test/b";
    settle();
    assert.equal(s.conns.length, 2);
    assert.equal(s.conns[0].closed, true, "the old connection is closed");
    assert.equal(s.last().url, "https://x.test/b");
    app.discard();
  }));

await test("active is the gate: false closes, true reopens", async () =>
  await withStubs(async (s) => {
    const app = await build(`
      App [
          on: boolean = true,
          feed: EventStream [ url = "https://x.test/live", active = { app.on } ],
          ]`);
    assert.equal(s.conns.length, 1);
    app.on = false;
    settle();
    assert.equal(s.conns[0].closed, true);
    assert.equal(app.feed.status, "closed");
    app.on = true;
    settle();
    assert.equal(s.conns.length, 2, "flipping back reopens");
    app.discard();
  }));

await test("`listenTo` reaches the factory as the named-event list", async () =>
  await withStubs(async (s) => {
    const app = await build(`
      App [
          feed: EventStream [ url = "https://x.test/ai", listenTo = ["content_block_delta", "message_stop"] ],
          ]`);
    assert.deepEqual(s.last().listen, ["content_block_delta", "message_stop"]);
    app.discard();
  }));

await test("a non-plain item in a bare listenTo list is a pointed compile error", async () => {
  const r = await compile(`App [ feed: EventStream [ url = "x", listenTo = [hovered] ] ]`);
  assert.notEqual(r.errors.length, 0);
  assert.match(r.errors[0].message, /bare list holds plain values/);
});

await test("SSE platform retry (non-final end): 'retrying', error channel quiet", async () =>
  await withStubs(async (s) => {
    const app = await build(`
      App [
          errs: number = 0,
          feed: EventStream [ url = "https://x.test/live",
              onError() { app.errs = app.errs + 1 },
              ],
          ]`);
    s.last().cb.open();
    s.last().cb.end("", false);       // the platform reconnects on its own
    settle();
    assert.equal(app.feed.status, "retrying");
    assert.equal(app.errs, 0, "not a fact for the error channel");
    s.last().cb.open();               // …and it comes back
    settle();
    assert.equal(app.feed.status, "open");
    app.discard();
  }));

await test("terminal failure without retry: 'failed', reason in error, onError+onClose fire", async () =>
  await withStubs(async (s) => {
    const app = await build(`
      App [
          errs: number = 0, closes: number = 0,
          feed: EventStream [ url = "https://x.test/live",
              onError() { app.errs = app.errs + 1 },
              onClose() { app.closes = app.closes + 1 },
              ],
          ]`);
    s.last().cb.open();
    s.last().cb.end("the server closed the stream", true);
    settle();
    assert.equal(app.feed.status, "failed");
    assert.equal(app.feed.error, "the server closed the stream");
    assert.equal(app.errs, 1);
    assert.equal(app.closes, 1, "it had opened, so going down is an onClose fact");
    assert.equal(s.conns.length, 1, "retry = 0 (default): no reconnect");
    app.discard();
  }));

await test("retry = seconds: a terminal loss schedules the reconnect", async () =>
  await withStubs(async (s) => {
    const app = await build(`
      App [
          sock: Socket [ url = "wss://x.test/live", retry = 0.01 ],
          ]`);
    assert.equal(s.last().kind, "ws");
    s.last().cb.open();
    s.last().cb.end("connection lost (code 1006)", true);
    settle();
    assert.equal(app.feed === undefined, true); // guard: this app has no feed
    assert.equal(app.sock.status, "retrying");
    await new Promise((r) => setTimeout(r, 40));
    settle();
    assert.equal(s.conns.length, 2, "the declared retry re-dialed");
    s.last().cb.open();
    settle();
    assert.equal(app.sock.status, "open");
    app.discard();
  }));

await test("active = false cancels a pending retry", async () =>
  await withStubs(async (s) => {
    const app = await build(`
      App [
          on: boolean = true,
          sock: Socket [ url = "wss://x.test/live", retry = 0.01, active = { app.on } ],
          ]`);
    s.last().cb.open();
    s.last().cb.end("connection lost", true);
    settle();
    assert.equal(app.sock.status, "retrying");
    app.on = false;
    settle();
    await new Promise((r) => setTimeout(r, 40));
    settle();
    assert.equal(s.conns.length, 1, "the timer was cancelled — no re-dial");
    assert.equal(app.sock.status, "closed");
    app.discard();
  }));

await test("Socket.send reaches the wire when open; when not, a reported error", async () =>
  await withStubs(async (s) => {
    const app = await build(`
      App [
          errs: number = 0,
          sock: Socket [ url = "wss://x.test/live",
              onError() { app.errs = app.errs + 1 },
              ],
          ]`);
    app.sock.send("too early");       // connecting, not open
    settle();
    assert.equal(app.errs, 1, "send before open is a reported error");
    assert.match(app.sock.error, /not open/);
    assert.deepEqual(s.last().sent, [], "nothing was sent");
    s.last().cb.open();
    settle();
    app.sock.send("hello");
    assert.deepEqual(s.last().sent, ["hello"], "an open socket sends");
    app.discard();
  }));

await test("discard closes the connection, quietly", async () =>
  await withStubs(async (s) => {
    const app = await build(`
      App [
          closes: number = 0,
          feed: EventStream [ url = "https://x.test/live",
              onClose() { app.closes = app.closes + 1 },
              ],
          ]`);
    s.last().cb.open();
    settle();
    app.discard();
    assert.equal(s.last().closed, true, "node removal closes the connection");
  }));

await test("a synchronous factory throw is structural: 'failed', no retry loop", async () =>
  await withStubs(async () => {
    const prev = provideStreams({
      eventSource: (url) => { throw new Error(`network unavailable headless — ${url}`); },
      socket: (url) => { throw new Error(`network unavailable headless — ${url}`); },
    });
    try {
      const app = await build(`
        App [
            errs: number = 0,
            feed: EventStream [ url = "https://x.test/live", retry = 0.01,
                onError() { app.errs = app.errs + 1 },
                ],
            ]`);
      assert.equal(app.feed.status, "failed");
      assert.match(app.feed.error, /network unavailable headless/);
      assert.equal(app.errs, 1, "the refusal lands in onError with the reason");
      await new Promise((r) => setTimeout(r, 40));
      settle();
      assert.equal(app.feed.status, "failed", "structural — even a declared retry does not loop");
      app.discard();
    } finally { provideStreams(prev); }
  }));

console.log("\nstreams — the checked surface");

await test("the lifecycle intrinsics are read-only: assigning one is a compile error", async () => {
  for (const attr of [`status = "open"`, `open = true`, `last = "x"`, `error = "y"`]) {
    const r = await compile(`App [ feed: EventStream [ url = "https://x.test", ${attr} ] ]`);
    assert.notEqual(r.errors.length, 0, `\`${attr}\` should not compile`);
    assert.match(r.errors[0].message, /read-only/, attr);
  }
});

await test("Stream is the abstract base: instantiating it is a pointed error", async () => {
  const r = await compile(`App [ s: Stream [ url = "https://x.test" ] ]`);
  assert.notEqual(r.errors.length, 0);
  assert.match(r.errors[0].message, /abstract base.*EventStream.*Socket/s);
});

await test("send is Socket's alone: a handler calling feed.send is a type error elsewhere", async () => {
  // EventStream is receive-only — its class carries no send; the runtime has
  // none to call. Guarded at the model level: the member simply is not there.
  const r = await compile(`App [ feed: EventStream [ url = "https://x.test" ] ]`);
  assert.equal(r.errors.length, 0);
  const app = instantiate(r.program);
  settle();
  assert.equal(typeof app.feed.send, "undefined");
  app.discard();
});

await test("a stream declares no attributes of its own", async () => {
  const r = await compile(`App [ feed: EventStream [ url = "https://x.test", extra: number = 1 ] ]`);
  assert.notEqual(r.errors.length, 0);
  assert.match(r.errors[0].message, /declares no attributes/);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
