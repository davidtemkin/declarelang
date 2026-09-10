import { assert, test, summarize, withCausal, ready, seed } from './persistence-support.mjs';
await test('empty storage leaves Base usable and does not write a seed', () => withCausal(async ({ openApp }) => {
  const a = await openApp(); await ready(a);
  assert.deepEqual(await a.page.evaluate(() => [__app.activeScenarioId, __app.draft.state,
    __app.draft.savedRecord.disk.exists]), ['base', 'none', false]);
  assert.deepEqual(a.pageErrors, []);
}));
await test('cold boot exposes validated recovery without adopting Working', () => withCausal(async ({ openApp }) => {
  await seed(openApp);
  const a = await openApp(); await ready(a);
  assert.deepEqual(await a.page.evaluate(() => [__app.activeScenarioId, __app.comparisonScenarioId,
    __app.workingScenario.value.assumptions.jetFuelPrice, __app.draft.canRestore,
    __app.draft.validation.record.overrides.jetFuelPrice]), ['base', 'base', 2.7, true, 4.25]);
  assert.deepEqual(a.pageErrors, []);
}));
summarize('causal-desk persistence lifecycle');
