import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { persistenceEngine } from "./helpers/persistence-engine.mjs";
import { persistenceError } from "../runtime/dist/persistence/errors.js";

await test("P03 opening absent storage never writes the seed", async () => {
  const h = persistenceEngine(); await h.boot();
  assert.equal(h.state.loadStatus, "loaded");
  assert.equal(h.state.saved, false); assert.equal(h.state.dirty, false); assert.equal(h.state.pending, false);
  assert.equal(h.stored(), undefined); assert.equal(h.provider.log.length, 1);
});
await test("untouched automatic boot adopts once without writing", async () => {
  const h = persistenceEngine(); h.seed(); await h.boot();
  assert.equal(h.value.n, 7); assert.equal(h.state.saved, true); assert.equal(h.state.dirty, false);
  assert.equal(h.state.revision, h.state.savedRevision); assert.equal(h.provider.log.length, 1);
});
await test("P04 authored early edits survive delayed read as explicit recovery", async () => {
  const h = persistenceEngine(); h.seed(); h.engine.start(); h.edit({ n: 2 }); await h.flush();
  await h.finish();
  assert.equal(h.value.n, 2); assert.equal(h.state.recovery, "available");
  assert.equal(h.state.candidate.n, 7); assert.ok(Object.isFrozen(h.state.candidate));
  assert.equal(h.state.dirty, true); assert.equal(h.state.pending, false);
  await h.advance(2000); assert.equal(h.provider.pending.length, 0);
});
await test("P05 boot commit saves missing data but refuses an existing candidate", async () => {
  for (const exists of [false, true]) {
    const h = persistenceEngine(); if (exists) h.seed();
    const id = h.engine.commit(); h.engine.start(); await h.flush(); await h.finish();
    if (exists) {
      assert.equal(h.results.find(r => r.requestId === id).error.code, "recovery_pending");
      assert.equal(h.value.n, 0); assert.equal(h.provider.pending.length, 0);
    } else {
      await h.finish(); assert.equal(h.results.find(r => r.requestId === id).ok, true);
      assert.equal(h.state.saved, true);
    }
  }
});
await test("P14 explicit restore consumes candidate, adopts mutable data, resumes", async () => {
  const h = persistenceEngine({ policy: { restoreOn: "manual" } }); h.seed(); await h.boot();
  assert.equal(h.engine.restore(), true); assert.equal(h.engine.restore(), false);
  assert.equal(h.value.n, 7); assert.equal(Object.isFrozen(h.value), false);
  assert.equal(h.state.recovery, "none"); assert.equal(h.state.saved, true);
});
await test("P12 invalid payload remains erasable without becoming typed data", async () => {
  for (const [json, extra, code] of [["{", {}, "invalid_record"], ["{}", { format: 2 }, "unsupported_format"]]) {
    const h = persistenceEngine(); h.seed(json, extra); await h.boot();
    assert.equal(h.state.loadStatus, "loaded"); assert.equal(h.state.recovery, "invalid");
    assert.equal(h.state.error.code, code); assert.equal(h.engine.restore(), false);
    assert.equal(h.value.n, 0); const id = h.engine.erase(); await h.flush(); await h.finish();
    assert.ok(h.results.find(r => r.requestId === id).ok); assert.equal(h.stored().document, null);
  }
});
await test("schema mismatch never adopts and unreadable control cannot be erased", async () => {
  const h = persistenceEngine({ validate: () => { throw persistenceError("schema_mismatch", "load"); } });
  h.seed(); await h.boot(); assert.equal(h.state.error.code, "schema_mismatch"); assert.equal(h.value.n, 0);
  const corrupt = persistenceEngine(); corrupt.provider.inject(corrupt.scope, { control: 2 }); await corrupt.boot();
  const id = corrupt.engine.erase(); await corrupt.flush();
  assert.equal(corrupt.state.error.code, "store_corrupt");
  assert.equal(corrupt.results.find(r => r.requestId === id).error.code, "not_ready");
});
await test("failed replace keeps recovery authority; plain retry cannot overwrite", async () => {
  const h = persistenceEngine({ policy: { restoreOn: "manual" } }); h.seed(); await h.boot();
  h.edit({ n: 8 }); const id = h.engine.replace(); await h.flush(); await h.finish("quota");
  assert.equal(h.state.recovery, "available"); assert.equal(h.value.n, 8);
  const retry = h.engine.retry(); await h.flush();
  assert.equal(h.results.find(r => r.requestId === retry).error.code, "aborted");
  h.engine.replace(); await h.flush(); await h.finish();
  assert.equal(h.state.saved, true); assert.equal(h.state.recovery, "none");
  assert.equal(h.results.filter(r => r.requestId === id).length, 1);
});
await test("load failure refuses queued commits; retry reads before writing", async () => {
  const h = persistenceEngine(); const id = h.engine.commit(); h.engine.start(); await h.flush();
  await h.finish("unavailable");
  assert.equal(h.results.find(r => r.requestId === id).error.code, "unavailable");
  const retry = h.engine.retry(); await h.flush();
  assert.equal(h.provider.pending[0].operation, "load"); await h.finish();
  assert.equal(h.results.find(r => r.requestId === retry).ok, true);
});
await test("reload, including failed reload retry, always preserves live data", async () => {
  const h = persistenceEngine(); await h.boot(); h.seed();
  h.engine.reload(); await h.flush(); await h.finish("unavailable");
  h.engine.retry(); await h.flush(); await h.finish();
  assert.equal(h.state.recovery, "available"); assert.equal(h.value.n, 0);
});
await test("P20 stalled transaction stays pending until conclusive terminal outcome", async () => {
  const h = persistenceEngine(); await h.boot(); h.engine.commit(); await h.flush();
  await h.advance(10_000);
  assert.equal(h.state.pending, true); assert.equal(h.state.error.code, "stalled");
  assert.equal(h.state.error.retryable, false); assert.equal(h.results.filter(r => r.operation === "commit").length, 0);
  await h.finish(); assert.equal(h.state.saved, true); assert.equal(h.state.error, null);
});
await test("P02 configuration failure survives a late successful write", async () => {
  const h = persistenceEngine(); await h.boot(); h.engine.commit(); await h.flush();
  h.engine.configurationFailed(); await h.finish();
  assert.equal(h.state.error.code, "configuration"); assert.equal(h.state.saved, false);
  h.edit({ n: 9 }); await h.flush(); await h.advance(1000);
  assert.equal(h.provider.pending.length, 0);
});
await test("a stalled manual read clears its progress error at terminal success", async () => {
  const h = persistenceEngine({ policy: { restoreOn: "manual" } }); h.seed();
  h.engine.start(); await h.flush(); await h.advance(10_000); await h.finish();
  assert.equal(h.state.pending, false); assert.equal(h.state.error, null);
  assert.equal(h.state.recovery, "available");
});
await test("P18 retirement suppresses events; replacement read waits for old transaction", async () => {
  const h = persistenceEngine(); await h.boot(); h.edit({ n: 42 }); h.engine.commit(); await h.flush();
  const delivered = h.results.length; h.engine.retire();
  const replacement = persistenceEngine({ provider: h.provider, clock: h.clock });
  replacement.engine.start(); await replacement.flush();
  assert.equal(h.provider.pending.length, 1); assert.equal(h.provider.pending[0].operation, "commit");
  await h.finish(); await replacement.flush();
  assert.equal(h.results.length, delivered); assert.equal(h.provider.pending[0].operation, "load");
  await replacement.finish(); assert.equal(replacement.value.n, 42);
});
summarize("persistence-lifecycle");
