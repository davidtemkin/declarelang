import { assert, test, summarize, withCausal, ready, saved, click, confirm } from './persistence-support.mjs';
await test('Clear cancel is inert; acknowledgement resets Working and keeps autosave paused', () => withCausal(async ({ openApp }) => {
  const a = await openApp({ width: 390, height: 844 }); await ready(a);
  await a.page.evaluate(() => { __app.selectFactor('jetFuelPrice'); __app.changeSelectedAssumption(4.3); }); await saved(a);
  const baseline = await a.page.evaluate(() => JSON.stringify([__app.modelDocument.value, __app.scenarioDocument.value]));
  await click(a, 'app.draftPanel.clearWork'); await confirm(a, 'cancel');
  assert.equal(await a.page.evaluate(() => __app.workingScenario.value.assumptions.jetFuelPrice), 4.3);
  assert.equal(await a.page.evaluate(() => __app.draft.savedRecord.disk.exists), true);
  await click(a, 'app.draftPanel.clearWork'); await confirm(a, 'clear');
  await a.page.waitForFunction(() => __app.draft.eraseIntent === '' && !__app.draft.savedRecord.disk.exists);
  assert.deepEqual(await a.page.evaluate(() => [__app.activeScenarioId, __app.comparisonScenarioId,
    __app.workingScenario.value.assumptions.jetFuelPrice, __app.draft.savedRecord.disk.autosavePaused]), ['base', 'base', 2.7, true]);
  assert.equal(await a.page.evaluate(() => JSON.stringify([__app.modelDocument.value, __app.scenarioDocument.value])), baseline);
  await a.page.close(); const b = await openApp(); await ready(b);
  assert.equal(await b.page.evaluate(() => __app.draft.hasCandidate), false);
}));
await test('issued save finishes before erase; pending clear locks edits and the next edit resumes saving', () => withCausal(async ({ openApp }) => {
  const a = await openApp({ width: 1280, height: 800 }); await ready(a);
  await a.page.evaluate(() => { __app.selectFactor('jetFuelPrice'); __app.changeSelectedAssumption(4); __persistenceTest.hold = true; });
  await a.page.waitForFunction(() => __app.draft.stagedWorkingGeneration === 1);
  await a.page.evaluate(() => __persistenceTest.clock.advance(1000));
  await a.page.waitForFunction(() => __persistenceTest.pending.length === 1);
  await click(a, 'app.draftPanel.clearWork'); await confirm(a, 'clear');
  assert.equal(await a.page.evaluate(() => __app.draft.editingLocked), true);
  await a.page.evaluate(() => __app.changeSelectedAssumption(4.9));
  assert.equal(await a.page.evaluate(() => __app.workingScenario.value.assumptions.jetFuelPrice), 4);
  await a.page.evaluate(() => __persistenceTest.release());
  await a.page.waitForFunction(() => __persistenceTest.pending.length === 1);
  assert.equal(await a.page.evaluate(() => __app.workingScenario.value.assumptions.jetFuelPrice), 4);
  await a.page.evaluate(() => { __persistenceTest.hold = false; __persistenceTest.release(); });
  await a.page.waitForFunction(() => !__app.draft.editingLocked && !__app.draft.savedRecord.disk.exists);
  assert.equal(await a.page.evaluate(() => __app.workingScenario.value.assumptions.jetFuelPrice), 2.7);
  await a.page.evaluate(() => __app.changeSelectedAssumption(3.8)); await saved(a);
  assert.equal(await a.page.evaluate(() => __app.draft.savedRecord.value.overrides.jetFuelPrice), 3.8);
}, { persistenceModule: '/test/helpers/persistence-browser-controls.mjs' }));
summarize('causal-desk persistence clear');
