import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { persistenceEngine } from "./helpers/persistence-engine.mjs";
import { microtasks } from "./helpers/persistence-provider.mjs";

await test("P08 same-turn commits capture final revision and results are deferred", async () => {
  const h = persistenceEngine(); await h.boot();
  const first = h.engine.commit(); h.edit({ n: 2 }); const second = h.engine.commit();
  assert.equal(h.results.filter(r => r.requestId > 0).length, 0);
  await h.flush(); await h.finish(); await h.finish();
  const results = h.results.filter(r => [first, second].includes(r.requestId));
  assert.equal(results.length, 2); assert.equal(results[0].revision, results[1].revision);
  assert.equal(JSON.parse(h.stored().document.json).n, 2); assert.equal(h.state.saved, true);
});
await test("P09 old acknowledgement never replaces latest live revision", async () => {
  const h = persistenceEngine(); await h.boot(); h.edit({ n: 1 }); h.engine.commit(); await h.flush();
  for (let n = 2; n <= 20; n++) { h.edit({ n }); await h.flush(); }
  await h.finish(); assert.equal(h.value.n, 20); assert.equal(h.state.saved, false);
  await h.advance(1000); await h.finish();
  assert.equal(JSON.parse(h.stored().document.json).n, 20); assert.equal(h.state.saved, true);
});
await test("P10 continuous edits hit maxDelay; storage backpressure coalesces latest", async () => {
  const h = persistenceEngine(); await h.boot();
  for (let n = 0; n < 6; n++) { h.edit({ n }); await h.flush(); await h.advance(200); }
  assert.equal(h.provider.pending.length, 1);
  for (let n = 6; n < 30; n++) { h.edit({ n }); await h.flush(); await h.advance(200); }
  assert.equal(h.provider.pending.length, 1);
  await h.finish(); await h.flush();
  await h.advance(1000); await h.finish();
  assert.equal(JSON.parse(h.stored().document.json).n, 29);
});
await test("due autosave after an acknowledgement still waits for a successful settle", async () => {
  const h = persistenceEngine({ policy: { delay: 0 } }); await h.boot();
  h.edit({ n: 1 }); h.engine.commit(); await h.flush();
  h.edit({ n: 2 }); await h.flush();
  h.edit({ n: 3 }); // accepted but not settled when the old receipt arrives
  h.provider.complete(); await microtasks();
  assert.equal(h.provider.pending.length, 0, "acknowledgement cannot capture an unsettled tree");
  await h.flush(); await h.finish();
  assert.equal(JSON.parse(h.stored().document.json).n, 3);
  assert.equal(h.state.savedRevision, h.state.revision);
});
await test("one active plus four explicit slots refuses additional commands", async () => {
  const h = persistenceEngine(); await h.boot(); h.engine.commit(); await h.flush();
  const ids = Array.from({ length: 5 }, () => h.engine.commit()); await h.flush();
  assert.equal(h.results.find(r => r.requestId === ids[4]).error.code, "busy");
  assert.equal(h.state.error, null); assert.equal(h.provider.pending.length, 1);
  for (let i = 0; i < 5; i++) await h.finish();
  assert.equal(h.state.pending, false);
});
await test("snapshot byte budget rejects extra captures without halting admitted writes", async () => {
  const h = persistenceEngine({ policy: { save: "manual" } }); await h.boot();
  h.edit("a".repeat(7 * 1024 * 1024)); h.engine.commit(); await h.flush();
  h.edit("b".repeat(7 * 1024 * 1024)); h.engine.commit(); await h.flush();
  h.edit("c".repeat(7 * 1024 * 1024)); const refused = h.engine.commit(); await h.flush();
  assert.equal(h.results.find(r => r.requestId === refused).error.code, "busy");
  assert.equal(h.state.error, null); await h.finish(); await h.finish(); assert.equal(h.state.dirty, true);
});
await test("P11 failed save aborts queued IDs; retry captures current data", async () => {
  const h = persistenceEngine(); await h.boot(); h.edit({ n: 1 }); const first = h.engine.commit(); await h.flush();
  h.edit({ n: 2 }); const queued = h.engine.commit(); await h.flush(); await h.finish("quota");
  assert.equal(h.results.find(r => r.requestId === queued).error.code, "aborted");
  h.edit({ n: 3 }); await h.flush(); const retry = h.engine.retry(); await h.flush(); await h.finish();
  assert.equal(JSON.parse(h.stored().document.json).n, 3); assert.equal(h.state.saved, true);
  assert.equal(h.results.filter(r => r.requestId === first).length, 1);
  assert.equal(h.results.find(r => r.requestId === retry).ok, true);
});
await test("P15 erase cancels unsent writes, follows running write, and pauses future edits", async () => {
  const h = persistenceEngine(); await h.boot(); h.engine.commit(); await h.flush();
  h.edit({ n: 1 }); const queued = h.engine.commit(); await h.flush();
  const erased = h.engine.erase(); h.edit({ n: 2 }); await h.flush(); await h.finish();
  assert.equal(h.state.autosavePaused, true); await h.finish();
  assert.equal(h.results.find(r => r.requestId === queued).error.code, "aborted");
  assert.equal(h.results.find(r => r.requestId === erased).ok, true); assert.equal(h.stored().document, null);
  h.edit({ n: 0 }); await h.flush(); await h.advance(5000);
  assert.equal(h.provider.pending.length, 0); assert.equal(h.state.dirty, true);
  h.engine.commit(); await h.flush(); h.edit({ n: 4 }); await h.flush(); await h.finish();
  assert.equal(h.state.autosavePaused, false); assert.equal(h.state.saved, false);
  await h.advance(1000); await h.finish(); assert.equal(JSON.parse(h.stored().document.json).n, 4);
});
await test("erase still executes after prior save fails", async () => {
  const h = persistenceEngine(); await h.boot(); h.engine.commit(); await h.flush(); h.engine.erase();
  await h.finish("quota"); assert.equal(h.provider.pending[0].operation, "erase");
  await h.finish(); assert.equal(h.stored().document, null); assert.equal(h.state.autosavePaused, true);
});
await test("P16 erase retry keeps observed revision and reload keeps autosave paused", async () => {
  const h = persistenceEngine(); h.seed(); await h.boot(); h.engine.erase(); await h.flush(); await h.finish("quota");
  const expected = h.provider.log.length;
  h.seed('{"n":8}'); // Same revision initially, then emulate an independent writer's revision.
  const row = h.stored(); row.revision = "b".repeat(32); h.provider.inject(h.scope, row);
  h.edit({ n: 9 }); await h.flush(); h.engine.retry(); await h.flush(); await h.finish();
  assert.equal(h.provider.log.length, expected + 1); assert.equal(h.state.error.code, "conflict");
  assert.equal(h.value.n, 9); h.engine.reload(); await h.flush(); await h.finish();
  assert.equal(h.state.autosavePaused, true); assert.equal(h.state.recovery, "available");
});
await test("P07b failed settle never captures partially stabilized data", async () => {
  const h = persistenceEngine(); await h.boot(); h.edit({ n: 1 }); const id = h.engine.commit();
  h.requested = false; h.engine.settled(false); await h.flush();
  assert.equal(h.results.find(r => r.requestId === id).error.code, "settle_failed");
  assert.equal(h.stored(), undefined); assert.equal(h.state.dirty, true);
  h.edit({ n: 2 }); await h.flush(); await h.advance(1000); assert.equal(h.provider.pending.length, 0);
  h.engine.commit(); await h.flush(); await h.finish(); assert.equal(h.state.saved, true);
});
await test("oversized autosave halts until explicit corrected commit", async () => {
  const h = persistenceEngine(); await h.boot(); h.edit("a".repeat(8 * 1024 * 1024)); await h.flush();
  await h.advance(250); assert.equal(h.state.error.code, "too_large"); assert.equal(h.provider.pending.length, 0);
  h.edit({ n: 2 }); await h.flush(); await h.advance(1000); assert.equal(h.provider.pending.length, 0);
  h.engine.commit(); await h.flush(); await h.finish(); assert.equal(h.state.saved, true);
});
await test("an older queued save cannot resolve a newer capture failure", async () => {
  const h = persistenceEngine(); await h.boot(); h.engine.commit(); await h.flush();
  h.edit({ n: 1 }); h.engine.commit(); await h.flush();
  h.edit({ n: NaN }); h.engine.commit(); await h.flush();
  await h.finish(); await h.finish();
  assert.equal(h.state.error.code, "invalid_record");
  h.edit({ n: 2 }); await h.flush(); await h.advance(1000);
  assert.equal(h.provider.pending.length, 0);
  h.engine.commit(); await h.flush(); await h.finish(); assert.equal(h.state.saved, true);
});
summarize("persistence-queue");
