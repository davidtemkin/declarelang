import { assert, test, summarize, withCausal, ready, saved, seed, record, click, confirm } from './persistence-support.mjs';
await test('Restore adopts exact saved work; Discard removes only the durable candidate', () => withCausal(async ({ openApp }) => {
  await seed(openApp);
  const a = await openApp({ width: 1280, height: 800 }); await ready(a);
  await click(a, 'app.draftPanel.recovery.restore'); await saved(a);
  assert.deepEqual(await a.page.evaluate(() => [__app.activeScenarioId, __app.comparisonScenarioId,
    __app.workingSourceId, __app.workingScenario.value.assumptions.jetFuelPrice,
    __app.workingScenario.value.assumptions.averageFareGrowth]), ['working', 'base', 'fuelShock', 4.25, 0.055]);
  await a.page.close();
  const b = await openApp({ width: 390, height: 844 }); await ready(b);
  await click(b, 'app.draftPanel.recovery.discardDraft'); await confirm(b, 'discard');
  await b.page.waitForFunction(() => !__app.draft.hasCandidate && !__app.draft.savedRecord.disk.pending);
  await b.page.close();
  const c = await openApp(); await ready(c);
  assert.deepEqual(await c.page.evaluate(() => [__app.draft.hasCandidate, __app.draft.savedRecord.disk.exists]), [false, false]);
}));
for (const action of ['discard', 'keep', 'restore']) {
  await test(`early edits survive recovery arrival; ${action} is an explicit choice`, () => withCausal(async ({ openApp }) => {
    await seed(openApp);
    const a = await openApp({ width: 1280, height: 800 }); await ready(a);
    await a.page.evaluate(() => { __app.selectFactor('jetFuelPrice'); __app.changeSelectedAssumption(4.8); });
    assert.equal(await a.page.evaluate(() => __app.draft.savedRecord.value), null);
    if (action === 'restore') {
      await click(a, 'app.draftPanel.recovery.restore'); await confirm(a, 'cancel');
      assert.equal(await a.page.evaluate(() => __app.workingScenario.value.assumptions.jetFuelPrice), 4.8);
      await click(a, 'app.draftPanel.recovery.restore'); await confirm(a, 'restore');
    } else {
      await click(a, `app.draftPanel.recovery.${action === 'discard' ? 'discardDraft' : action}`);
      if (action === 'discard') await confirm(a, 'discard');
    }
    await saved(a);
    assert.equal(await a.page.evaluate(() => __app.workingScenario.value.assumptions.jetFuelPrice), action === 'restore' ? 4.25 : 4.8);
    await a.page.close();
    const b = await openApp(); await ready(b);
    assert.equal(await b.page.evaluate(() => __app.draft.validation.record.overrides.jetFuelPrice), action === 'restore' ? 4.25 : 4.8);
  }));
}
await test('invalid business record is Discard-only, never partially restored', () => withCausal(async ({ openApp }) => {
  await seed(openApp, record({ modelRevision: 'old' }));
  const a = await openApp(); await ready(a);
  assert.equal(await a.page.evaluate(() => __app.draft.canRestore), false);
  assert.equal(await a.page.evaluate(() => __app.draft.validation.code), 'stale_revision');
  await click(a, 'app.draftPanel.recovery.discardDraft'); await confirm(a, 'discard');
  await a.page.waitForFunction(() => !__app.draft.hasCandidate);
  assert.equal(await a.page.evaluate(() => __app.workingScenario.value.assumptions.jetFuelPrice), 2.7);
}));
summarize('causal-desk persistence recovery');
