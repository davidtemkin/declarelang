import { assert, test, summarize, withCausal, ready, saved, seed, record, click, confirm } from './persistence-support.mjs';
const controlled = { persistenceModule: '/test/helpers/persistence-browser-controls.mjs' };
const held = { persistenceModule: '/apps/causal-desk/tests/persistence-held-host.mjs' };
const release = (a, failure = null) => a.page.evaluate(failure => {
  __persistenceTest.failure = failure; __persistenceTest.hold = false; __persistenceTest.release();
}, failure);
const flush = async a => {
  await a.page.waitForFunction(() => __app.draft.workingGeneration === __app.draft.stagedWorkingGeneration);
  await a.page.evaluate(() => __persistenceTest.clock.advance(1000));
};
await test('edits during initial read are held, then the latest full snapshot saves', () => withCausal(async ({ openApp }) => {
  const a = await openApp();
  assert.equal(await a.page.evaluate(() => __app.draft.checking), true);
  await a.page.evaluate(() => { __app.selectFactor('jetFuelPrice'); __app.changeSelectedAssumption(4); __app.changeSelectedAssumption(4.4); });
  assert.equal(await a.page.evaluate(() => __app.draft.savedRecord.value), null);
  await release(a); await ready(a); await flush(a); await saved(a);
  assert.equal(await a.page.evaluate(() => __app.draft.savedRecord.value.overrides.jetFuelPrice), 4.4);
}, held));
for (const code of ['unavailable', 'store_corrupt', 'unsupported']) {
  await test(`${code} initial read preserves analysis and only safe reads offer Retry`, () => withCausal(async ({ openApp }) => {
    const a = await openApp(); await release(a, code); await ready(a);
    await a.page.evaluate(() => { __app.selectFactor('jetFuelPrice'); __app.changeSelectedAssumption(4.1); });
    assert.deepEqual(await a.page.evaluate(() => [__app.draft.failureCode, __app.draft.canRetry,
      __app.workingScenario.value.assumptions.jetFuelPrice, __app.draft.savedRecord.value]), [code, code === 'unavailable', 4.1, null]);
    assert.match(await a.page.evaluate(() => __app.draft.failureText), /Current-session analysis/);
    if (code === 'unavailable') {
      await click(a, 'app.draftPanel.failure.retryAction'); await ready(a); await flush(a); await saved(a);
      assert.equal(await a.page.evaluate(() => __app.draft.failureCode), '');
    }
  }, held));
}
await test('quota retry saves latest accepted work, never the failed snapshot', () => withCausal(async ({ openApp }) => {
  const a = await openApp(); await ready(a);
  await a.page.evaluate(() => { __persistenceTest.failure = 'quota'; __app.selectFactor('jetFuelPrice'); __app.changeSelectedAssumption(4); });
  await flush(a); await a.page.waitForFunction(() => __app.draft.failureCode === 'quota');
  await a.page.evaluate(() => __app.changeSelectedAssumption(4.6));
  await click(a, 'app.draftPanel.failure.retryAction'); await saved(a);
  assert.equal(await a.page.evaluate(() => __app.draft.savedRecord.value.overrides.jetFuelPrice), 4.6);
  await a.page.close(); const b = await openApp(); await ready(b);
  assert.equal(await b.page.evaluate(() => __app.draft.savedRecord.disk.candidate.overrides.jetFuelPrice), 4.6);
}, controlled));
await test('failed Clear releases edit lock, keeps work and retries the original delete intent', () => withCausal(async ({ openApp }) => {
  const a = await openApp(); await ready(a);
  await a.page.evaluate(() => { __app.selectFactor('jetFuelPrice'); __app.changeSelectedAssumption(4); }); await flush(a); await saved(a);
  await a.page.evaluate(() => { __persistenceTest.failure = 'io'; });
  await click(a, 'app.draftPanel.clearWork'); await confirm(a, 'clear');
  await a.page.waitForFunction(() => __app.draft.failureCode === 'io');
  assert.deepEqual(await a.page.evaluate(() => [__app.draft.editingLocked, __app.draft.eraseIntent,
    __app.workingScenario.value.assumptions.jetFuelPrice, __app.draft.savedRecord.disk.autosavePaused]), [false, 'clear', 4, true]);
  await a.page.evaluate(() => __app.changeSelectedAssumption(4.2));
  await click(a, 'app.draftPanel.failure.retryAction');
  await a.page.waitForFunction(() => __app.draft.eraseIntent === '' && !__app.draft.savedRecord.disk.exists);
  assert.equal(await a.page.evaluate(() => __app.workingScenario.value.assumptions.jetFuelPrice), 2.7);
}, controlled));
await test('stalled write is unconfirmed and cannot be retried while pending', () => withCausal(async ({ openApp }) => {
  const a = await openApp(); await ready(a);
  await a.page.evaluate(() => { __persistenceTest.hold = true; __app.selectFactor('jetFuelPrice'); __app.changeSelectedAssumption(4); });
  await flush(a); await a.page.waitForFunction(() => __persistenceTest.pending.length === 1);
  await a.page.evaluate(() => __persistenceTest.clock.advance(60000));
  assert.deepEqual(await a.page.evaluate(() => [__app.draft.failureCode, __app.draft.canRetry, __app.draft.saved]), ['stalled', false, false]);
  await release(a); await saved(a);
}, controlled));
for (const [name, value, expected] of [
  ['stale revision', record({ modelRevision: 'old' }), 'stale_revision'],
  ['unknown factor', record({ overrides: { imaginary: 1 } }), 'unknown_factor'],
  ['out of bounds', record({ overrides: { jetFuelPrice: 999 } }), 'out_of_range'],
  ['non-numeric override', record({ overrides: { jetFuelPrice: 'NaN' } }), 'malformed'],
]) {
  await test(`${name} is rejected atomically and can only be discarded`, () => withCausal(async ({ openApp }) => {
    await seed(openApp, value); const a = await openApp(); await ready(a);
    assert.deepEqual(await a.page.evaluate(() => [__app.draft.canRestore, __app.draft.canKeep,
      __app.draft.failureCode, __app.workingScenario.value.assumptions.jetFuelPrice]), [false, false, expected, 2.7]);
    await click(a, 'app.draftPanel.recovery.discardDraft'); await confirm(a, 'discard');
    await a.page.waitForFunction(() => !__app.draft.hasCandidate);
  }));
}
for (const [name, change, code, discard] of [
  ['corrupt JSON', '{broken', 'invalid_record', true],
  ['non-finite JSON number', '{"value":1e400}', 'invalid_record', true],
  ['unknown payload format', 'format', 'unsupported_format', true],
  ['corrupt control metadata', 'metadata', 'store_corrupt', false],
]) {
  await test(`${name} never reaches Working; discard requires readable control metadata`, () => withCausal(async ({ openApp }) => {
    const a = await openApp(); await release(a); await ready(a);
    await a.page.evaluate(value => { __app.draft.savedRecord.set([], value); __app.draft.savedRecord.disk.commit(); }, record());
    await a.page.waitForFunction(() => __app.draft.savedRecord.disk.saved);
    await a.page.evaluate(change => __causalStorageCorrupt(change), change); await a.page.close();
    const b = await openApp(); await release(b); await ready(b);
    assert.deepEqual(await b.page.evaluate(() => [__app.draft.failureCode, __app.draft.canRestore,
      __app.draft.hasCandidate, __app.workingScenario.value.assumptions.jetFuelPrice]), [code, false, discard, 2.7]);
    if (discard) {
      await click(b, 'app.draftPanel.recovery.discardDraft'); await confirm(b, 'discard');
      await b.page.waitForFunction(() => !__app.draft.hasCandidate);
    }
  }, held));
}
summarize('causal-desk persistence errors');
