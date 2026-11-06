// What a program needs from HTTP, through Declare's own sources — so no program
// reaches for fetch and its classes (docs: DataSource, EventStream). Against a
// real local server, through the platform fetch. Pins:
//   - DataSource.responseHeaders: the reply's headers, names lowercased, a
//     refusal's included;
//   - DataSource format = "bytes": the body as a Uint8Array;
//   - a newer fetch stops the one in flight, and clear() stops it;
//   - EventStream with a request (a POST, headers, a body): the reply read as
//     server-sent events as it arrives, named events by listenTo, a clean end
//     closing the stream; a refusal failing it with its status and what it said;
//   - a plain GET EventStream where the host has no EventSource reads the same way.
import assert from "node:assert/strict";
import http from "node:http";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle } from "../runtime/dist/index.js";
import { applyDeps } from "../runtime/dist/deps.js";

let slowStarted = 0, slowClosed = 0;
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString("utf8");
  if (req.url === "/echo") {
    res.writeHead(200, { "content-type": "application/json", "X-Page": "2", ETag: '"v7"' });
    res.end(JSON.stringify({ method: req.method, token: req.headers["x-token"] ?? null, body }));
  } else if (req.url === "/bytes") {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end(Buffer.from([0, 1, 2, 250, 255]));
  } else if (req.url === "/refuse") {
    res.writeHead(429, { "content-type": "application/json", "Retry-After": "30" });
    res.end(JSON.stringify({ error: "slow down" }));
  } else if (req.url === "/slow") {
    slowStarted++;
    req.socket.on("close", () => { slowClosed++; });
    setTimeout(() => { if (!res.destroyed) { res.writeHead(200, { "content-type": "application/json" }); res.end('{"late":true}'); } }, 1500);
  } else if (req.url === "/sse") {
    res.writeHead(200, { "content-type": "text/event-stream" });
    const said = `${req.method} ${req.headers["x-token"] ?? "-"} ${body}`;
    const lines = [": a comment\n\n", `data: one ${said}\n\n`, "data: two\ndata: lines\n\n", "event: progress\ndata: 50\n\n", "event: ignored\ndata: x\n\n", "data: last\r\n\r\n"];
    let i = 0;
    const t = setInterval(() => { if (i < lines.length) res.write(lines[i++]); else { clearInterval(t); res.end(); } }, 20);
  } else if (req.url === "/sse-refuse") {
    res.writeHead(401, { "content-type": "text/plain" });
    res.end("no token");
  } else { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${server.address().port}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await wait(10); };

async function boot(src) {
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, "compiles: " + r.errors.map((e) => e.message).join("; "));
  const program = parseProgram(r.source);
  applyDeps(program, r.deps);
  const app = instantiate(program);
  settle();
  return app;
}

await test("DataSource: the reply's headers, names lowercased — a refusal's too", async () => {
  const app = await boot(`App [ width = 10, height = 10,
    d: DataSource [ url = "${B}/echo" ],
    r: DataSource [ url = "${B}/refuse" ] ]`);
  await app.d.fetch();
  assert.equal(app.d.responseHeaders["x-page"], "2");
  assert.equal(app.d.responseHeaders.etag, '"v7"');
  await app.r.fetch();
  assert.equal(app.r.statusCode, 429);
  assert.equal(app.r.responseHeaders["retry-after"], "30", "a refusal says when to come back");
  app.d.clear();
  assert.equal(app.d.responseHeaders, null, "clear() forgets them");
});

await test('DataSource: format = "bytes" reads the body as bytes', async () => {
  const app = await boot(`App [ width = 10, height = 10, d: DataSource [ url = "${B}/bytes", format = "bytes" ] ]`);
  await app.d.fetch();
  assert.ok(app.d.value instanceof Uint8Array);
  assert.deepEqual([...app.d.value], [0, 1, 2, 250, 255]);
});

await test("DataSource: a fetch() beside autoFetch, after a write that moves the address, loads — it does not abort both", async () => {
  // Venue run 21: a handler wrote the id the url reads, then called fetch(); the settle
  // inside fetch() started autoFetch's request, which fetch() then aborted as older —
  // and the source failed with an abort while its own reply was discarded
  const app = await boot(`App [ width = 10, height = 10, id: string = "",
    d: DataSource [ url = { app.id == "" ? "" : "${B}/echo" }, autoFetch = true ] ]`);
  app.id = "p01";
  await app.d.fetch();
  await until(() => !app.d.loading);
  assert.equal(app.d.failed, false, `failed: ${app.d.error}`);
  assert.equal(app.d.value?.method, "GET");
});

await test("DataSource: a newer fetch, or clear(), stops the request in flight", async () => {
  const app = await boot(`App [ width = 10, height = 10,
    d: DataSource [ url = { app.u } ],
    u: string = "${B}/slow" ]`);
  slowStarted = 0; slowClosed = 0;
  const first = app.d.fetch();
  await until(() => slowStarted === 1);
  app.u = `${B}/echo`;
  await app.d.fetch();
  await first;
  await until(() => slowClosed === 1);
  assert.equal(slowClosed, 1, "the superseded request was closed, not left to finish");
  assert.equal(app.d.value.method, "GET", "the newer reply is the value");
  app.u = `${B}/slow`;
  app.d.fetch();
  await until(() => slowStarted === 2);
  app.d.clear();
  await until(() => slowClosed === 2);
  assert.equal(slowClosed, 2, "clear() closed the request");
  await wait(50);
  assert.equal(app.d.failed, false, "a stopped request is not a failure");
});

await test("EventStream with a request: a POST's reply read as events, as it arrives", async () => {
  const app = await boot(`App [ width = 10, height = 10,
    got: string[] = [],
    closed: boolean = false,
    s: EventStream [ url = "${B}/sse", method = "POST", body = { { q: "hi" } }, headers = { { "x-token": "abc" } },
        listenTo = ["progress"],
        onMessage(m: StreamMessage) { app.got = [...app.got, m.type + ":" + m.data] },
        onClose() { app.closed = true } ] ]`);
  await until(() => app.closed);
  assert.deepEqual(app.got, [
    'message:one POST abc {"q":"hi"}',
    "message:two\nlines",
    "progress:50",
    "message:last",
  ], "unnamed events always, a named one only when listened to; data lines joined");
  assert.equal(app.s.status, "closed", "the reply's end closes the stream");
  assert.equal(app.s.last, "last");
});

await test("EventStream with a request: a refusal fails it with its status and what it said", async () => {
  const app = await boot(`App [ width = 10, height = 10,
    s: EventStream [ url = "${B}/sse-refuse", method = "POST", body = { "x" } ] ]`);
  await until(() => app.s.status === "failed");
  assert.equal(app.s.status, "failed");
  assert.match(app.s.error, /HTTP 401 .*no token/);
});

await test("EventStream: a plain GET where the host has no EventSource reads as a request", async () => {
  assert.equal(typeof globalThis.EventSource === "function" ? "skip" : "none", "none", "this host has no EventSource");
  const app = await boot(`App [ width = 10, height = 10,
    n: number = 0,
    s: EventStream [ url = "${B}/sse", onMessage(m: StreamMessage) { app.n = app.n + 1 } ] ]`);
  await until(() => app.s.status === "closed");
  assert.equal(app.n, 3, "the three unnamed events");
});

server.close();
summarize("fetch-family");
