// test/request-failures.test.mjs — why a request failed, and whether a write was
// carried out (DataSource.failure, DataSource.timeout).
//
// Ledger run 3 (2026-11-11): a save's answer was lost and a stalled request
// could hold a form `pending` forever. A failure now says which of a closed set
// it was — the program retries some, reports others, and for a write knows
// whether it went through — and a request that goes silent for `timeout`
// seconds is given up.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { buildProgram, settle } from "../runtime/dist/index.js";
import { provideTransport } from "../runtime/dist/data.js";

const reply = (status, body, type = "json") => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  text: () => Promise.resolve(type === "json" ? JSON.stringify(body) : String(body)),
  json: () => (type === "json" ? Promise.resolve(body) : Promise.reject(new SyntaxError("Unexpected token <"))),
});

async function app(attrs = `url = "/api/thing"`) {
  const r = await compile(`App [ width=1, height=1, errors: number = 0,
    ds: DataSource [ ${attrs}, onError() { app.errors = app.errors + 1 } ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  return buildProgram(r.program);
}

async function failureFor(transport, attrs) {
  const a = await app(attrs);
  const prev = provideTransport(transport);
  try { await a.ds.fetch(); settle(); return a; } finally { provideTransport(prev); }
}

await test("a 4xx is rejected, a 5xx a server error; success is none", async () => {
  assert.equal((await failureFor(() => reply(422, { field: "email" }))).ds.failure, "rejected");
  assert.equal((await failureFor(() => reply(503, "down", "text"))).ds.failure, "serverError");
  const ok = await failureFor(() => reply(200, { a: 1 }));
  assert.equal(ok.ds.failure, "none");
  assert.equal(ok.ds.failed, false);
});

await test("a network error is networkError; the same while the platform says offline is offline", async () => {
  const net = await failureFor(() => Promise.reject(new TypeError("Failed to fetch")));
  assert.equal(net.ds.failure, "networkError");
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
  try {
    const off = await failureFor(() => Promise.reject(new TypeError("Failed to fetch")));
    assert.equal(off.ds.failure, "offline");
  } finally {
    if (nav !== undefined) Object.defineProperty(globalThis, "navigator", nav);
    else delete globalThis.navigator;
  }
});

await test("a 200 that isn't JSON is unreadable — the server answered; an empty 200 is null", async () => {
  const bad = await failureFor(() => reply(200, "<html>sign in</html>", "text"));
  assert.equal(bad.ds.failure, "unreadable");
  const empty = await failureFor(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(""), json: () => Promise.reject(new SyntaxError("x")) }));
  assert.equal(empty.ds.failed, false, "an empty 200 is no failure");
  assert.equal(empty.ds.value, null);
});

await test("a request silent for `timeout` seconds is timedOut, and onError runs once", async () => {
  const a = await failureFor(() => new Promise(() => {}), `url = "/api/slow", method = "POST", body = { { a: 1 } }, timeout = 0.05`);
  assert.equal(a.ds.failure, "timedOut");
  assert.equal(a.ds.loading, false, "pending ends");
  assert.equal(a.errors, 1);
  assert.match(a.ds.error, /may or may not have been carried out/, "a write's outcome is said to be unknown");
});

await test("after a 2xx, a reply that stops arriving is unreadable, not unknown", async () => {
  const body = { getReader: () => ({ read: () => new Promise(() => {}) }) };
  const a = await failureFor(() => Promise.resolve({ ok: true, status: 201, body, text: () => new Promise(() => {}), json: () => new Promise(() => {}) }),
    `url = "/api/x", method = "POST", body = { { a: 1 } }, timeout = 0.05`);
  assert.equal(a.ds.failure, "unreadable");
  assert.match(a.ds.error, /carried out/);
});

await test("a 304 keeps the value it had, as an arrival", async () => {
  const a = await app();
  let prev = provideTransport(() => reply(200, { n: 1 }));
  try { await a.ds.fetch(); } finally { provideTransport(prev); }
  prev = provideTransport(() => Promise.resolve({ ok: false, status: 304, text: () => Promise.resolve("") }));
  try { await a.ds.fetch(); settle(); } finally { provideTransport(prev); }
  assert.equal(a.ds.failed, false);
  assert.deepEqual(a.ds.value, { n: 1 });
});

await test("timeout = 0 waits without limit", async () => {
  const a = await app(`url = "/api/slow", timeout = 0`);
  let release;
  const prev = provideTransport(() => new Promise((r) => { release = () => r({ ok: true, status: 200, text: () => Promise.resolve("{}"), json: () => Promise.resolve({}) }); }));
  try {
    const p = a.ds.fetch();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(a.ds.loading, true, "still waiting");
    release(); await p; settle();
    assert.equal(a.ds.failed, false);
  } finally { provideTransport(prev); }
});

summarize("request-failures");
