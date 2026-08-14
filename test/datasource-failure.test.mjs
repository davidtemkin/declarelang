// test/datasource-failure.test.mjs — a REFUSAL is data, not a dead end.
//
// Two failures found the same way (eval report, 2026-08-03): someone wrote an
// ordinary fetch against a server that said no, and the program could not tell
// them what happened.
//
//   1. `if (!res.ok) throw` fired BEFORE any body was read, so the part of a
//      4xx that says why — the field that failed, the rate-limit reset, the
//      validation list — was discarded. `.error` held a status number and the
//      author held nothing to act on. `.statusCode` did not exist at all, so
//      "retry" and "report" could not be told apart from a constraint.
//
//   2. The message re-read `this.url` AFTER the await. `url` is a slot like any
//      other, so a constraint may re-settle it mid-flight — and the failure then
//      names an address the request never went to. Reported as the longest debug
//      of that build, which is exactly the cost of a diagnostic that lies.
//
// The rule both share: what the SERVER answered is kept apart from whether it
// worked, and neither may disturb `.value`/`.loaded`.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { build } from "../runtime/dist/index.js";
import { provideTransport } from "../runtime/dist/data.js";

const reply = (status, body, type = "json") => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  text: () => Promise.resolve(type === "json" ? JSON.stringify(body) : String(body)),
  json: () => Promise.resolve(body),
});

/** A one-source program, compiled and built. */
async function app(attrs = `url = "/api/thing"`) {
  const r = await compile(`App [ width=1, height=1, ds: DataSource [ ${attrs} ] ]`);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  return build(r.source);
}

await test("a refusal keeps its BODY — the part that says why", async () => {
  const a = await app();
  const prev = provideTransport(() => reply(422, { error: "invalid", field: "email" }));
  try {
    await a.ds.fetch();
    assert.equal(a.ds.status, "failed");
    assert.equal(a.ds.statusCode, 422, "the code is readable on its own");
    assert.deepEqual(a.ds.errorBody, { error: "invalid", field: "email" },
      "the parsed refusal body survives the throw");
    assert.match(a.ds.error, /HTTP 422/, "and `error` is still the one-line message");
  } finally { provideTransport(prev); }
});

await test("a non-JSON refusal is handed back as TEXT, not swallowed", async () => {
  const a = await app();
  const prev = provideTransport(() => reply(503, "upstream down, retry after 30s", "text"));
  try {
    await a.ds.fetch();
    assert.equal(a.ds.statusCode, 503);
    assert.equal(a.ds.errorBody, "upstream down, retry after 30s");
  } finally { provideTransport(prev); }
});

await test("an EMPTY refusal body is null, not the empty string", async () => {
  // "" would read in a constraint as if something had been said
  const a = await app();
  const prev = provideTransport(() => reply(404, "", "text"));
  try {
    await a.ds.fetch();
    assert.equal(a.ds.statusCode, 404);
    assert.equal(a.ds.errorBody, null);
  } finally { provideTransport(prev); }
});

await test("a SUCCESS leaves the failure slots clear", async () => {
  const a = await app();
  const prev = provideTransport(() => reply(200, { ok: 1 }));
  try {
    await a.ds.fetch();
    assert.equal(a.ds.loaded, true);
    assert.equal(a.ds.statusCode, 200, "the code is reported for a success too");
    assert.equal(a.ds.errorBody, null);
    assert.deepEqual(a.ds.value, { ok: 1 }, ".value is untouched by any of this");
  } finally { provideTransport(prev); }
});

await test("a retry after a refusal RESETS the failure slots", async () => {
  // stale failure state is worse than none: a constraint reading `.statusCode`
  // must not still see the last 500 while the next request is in flight
  const a = await app();
  const prev = provideTransport(() => reply(500, { error: "boom" }));
  try {
    await a.ds.fetch();
    assert.equal(a.ds.statusCode, 500);
    provideTransport(() => reply(200, { ok: 1 }));
    await a.ds.fetch();
    assert.equal(a.ds.statusCode, 200);
    assert.equal(a.ds.errorBody, null, "the previous refusal's body is gone");
    provideTransport(() => reply(500, { error: "boom" }));
    await a.ds.fetch();
    a.ds.clear();
    assert.equal(a.ds.statusCode, 0, "clear() resets to 'no reply yet'");
    assert.equal(a.ds.errorBody, null);
  } finally { provideTransport(prev); }
});

await test("the message names the address that was REQUESTED, not the current one", async () => {
  // the url re-settles while the request is in flight — the exact shape of a
  // reactive address (`url = { app.selected ? … : "" }`) landing mid-fetch
  const a = await app();
  let asked = null;
  const prev = provideTransport((u) => {
    asked = u;
    a.ds.url = "/api/somewhere-else"; // a constraint re-settling underneath
    return reply(404, { error: "nope" });
  });
  try {
    await a.ds.fetch();
    assert.equal(asked, "/api/thing", "the request went to the original address");
    assert.match(a.ds.error, /\/api\/thing/, `the message must name it; got: ${a.ds.error}`);
    assert.ok(!/somewhere-else/.test(a.ds.error),
      `it must NOT name the address that was never contacted; got: ${a.ds.error}`);
  } finally { provideTransport(prev); }
});

await test("an UNREADABLE body does not replace the real failure", async () => {
  // a body may be absent, already consumed, or truncated mid-flight; reading it
  // is best-effort, and a reader that throws must not turn `HTTP 404` into a
  // TypeError about the reader
  for (const res of [
    { ok: false, status: 404 },                                             // no text() at all
    { ok: false, status: 404, text: () => Promise.reject(new Error("aborted")) },
    { ok: false, status: 404, text: () => { throw new Error("consumed"); } },
  ]) {
    const a = await app();
    const prev = provideTransport(() => Promise.resolve(res));
    try {
      await a.ds.fetch();
      assert.match(a.ds.error, /HTTP 404/, `got: ${a.ds.error}`);
      assert.equal(a.ds.statusCode, 404, "the code still lands");
      assert.equal(a.ds.errorBody, null);
    } finally { provideTransport(prev); }
  }
});

await test("a transport that never reaches a server leaves statusCode 0", async () => {
  // there is no reply to report, and 0 says that — distinct from any real code
  const a = await app();
  const prev = provideTransport(() => Promise.reject(new Error("network unreachable")));
  try {
    await a.ds.fetch();
    assert.equal(a.ds.status, "failed");
    assert.equal(a.ds.statusCode, 0);
    assert.match(a.ds.error, /network unreachable/);
  } finally { provideTransport(prev); }
});

await test("the lifecycle is DECLARED surface: readable, refused on assignment", async () => {
  // findings 2026-08-04: DataSource declared only its five settable attrs, so
  // its whole lifecycle reached no generated reference — declare-model.json
  // denied attributes declare.md §7 and guide/09-data.md teach. The stated
  // reason was a comment saying read-only means omit, which is false for every
  // other class in the file: `readOnly` exists so a computed slot can be BOTH
  // declared and unsettable, exactly as View.hovered and Stream.status are.
  const errs = async (src) => ((await compile(src, {})).errors ?? []).map((e) => e.message).join("\n");
  for (const slot of ["status", "loaded", "failed", "idle", "loading", "error", "statusCode", "errorBody"]) {
    const m = await errs(`App [ width=1, height=1, d: DataSource [ url = "/x", ${slot} = 1 ] ]`);
    assert.match(m, new RegExp(`DataSource\\.${slot} is read-only`), `${slot} must refuse assignment`);
  }
  assert.match(await errs(`App [ width=1, height=1, s: Dataset [ value = 1 ] ]`), /Dataset\.value is read-only/);
  // …and every one of them still READS clean
  assert.deepEqual(await errs(`App [ width=1, height=1, d: DataSource [ url = "/x" ],
      t: Text [ text = { "" + d.status + d.idle + d.loading + d.loaded + d.failed
                          + d.error + d.statusCode + JSON.stringify(d.errorBody) + JSON.stringify(d.value) } ] ]`), "");
});

summarize("datasource-failure");
