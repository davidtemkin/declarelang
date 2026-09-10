import { assert, test, summarize, withCausal, ready, saved, click, confirm } from './persistence-support.mjs';
async function enter(a, factorId, text) {
  const path = await a.page.evaluate(id => 'app.graph.stage.cards.'
    + __app.graph.stage.cards.children.findIndex(n => n.factorId === id), factorId);
  await click(a, path); await click(a, 'app.inspector.detailBody.assumptionEditor.input');
  await a.page.keyboard.press('Home'); await a.page.keyboard.down('Shift');
  await a.page.keyboard.press('End'); await a.page.keyboard.up('Shift');
  await a.drive.type(text); await a.drive.key('Enter'); await a.drive.settleMotion();
}
const snapshot = a => a.page.evaluate(() => ({ source: __app.workingSourceId,
  assumptions: __app.workingScenario.value.assumptions, values: __app.model.values,
  contributions: __app.model.contributionData.value }));
for (const backendClass of ['DomBackend', 'CanvasBackend']) {
  await test(`${backendClass}: native input, durable return, exact model/bridge and clear cold boot`, () => withCausal(async ({ openApp }) => {
    const a = await openApp({ width: 1280, height: 800 }); await ready(a);
    await click(a, 'app.header.scenarioPicker.4');
    await enter(a, 'jetFuelPrice', '$4.50'); await enter(a, 'demandGrowth', '6%'); await saved(a);
    await click(a, 'app.graph.stage.cards.16'); await a.drive.settleMotion();
    const before = await snapshot(a);
    assert.equal(before.source, 'fuelShock'); assert.equal(before.assumptions.jetFuelPrice, 4.5);
    assert.equal(before.assumptions.demandGrowth, 0.06);
    assert.equal(before.contributions.rows[0].id, 'jetFuelPrice');
    await a.page.close();
    const b = await openApp({ width: 390, height: 844 }); await ready(b);
    assert.equal(await b.page.evaluate(() => __app.activeScenarioId), 'base');
    await click(b, 'app.draftPanel.recovery.restore'); await b.drive.settleMotion();
    assert.deepEqual(await snapshot(b), before);
    await click(b, 'app.draftPanel.clearWork'); await confirm(b, 'clear');
    await b.page.waitForFunction(() => __app.draft.eraseIntent === '' && !__app.draft.savedRecord.disk.exists);
    await b.page.close(); const c = await openApp(); await ready(c);
    assert.deepEqual(await c.page.evaluate(() => [__app.draft.hasCandidate, __app.activeScenarioId,
      __app.workingScenario.value.assumptions.jetFuelPrice]), [false, 'base', 2.7]);
    assert.deepEqual([...a.pageErrors, ...b.pageErrors, ...c.pageErrors], []);
  }, { backendClass }));
}
await test('ordinary browser host autosaves with its real clock and survives cold boot', () => withCausal(async ({ openApp }) => {
  const a = await openApp(); await ready(a);
  await a.page.evaluate(() => { __app.selectFactor('jetFuelPrice'); __app.changeSelectedAssumption(4.4); });
  await a.page.waitForFunction(() => __app.draft.stagedWorkingGeneration === 1);
  // Only this smoke case uses the default real-time provider. The verifier's
  // virtual timer must fire after the real debounce deadline has elapsed.
  await new Promise(resolve => setTimeout(resolve, 350));
  await saved(a); await a.page.close();
  const b = await openApp(); await ready(b);
  assert.equal(await b.page.evaluate(() => __app.draft.savedRecord.disk.candidate.overrides.jetFuelPrice), 4.4);
}, { persistenceModule: null }));
summarize('causal-desk durable return');
