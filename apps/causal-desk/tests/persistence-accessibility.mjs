import { assert, test, summarize, withCausal, ready, saved, seed } from './persistence-support.mjs';
async function tabTo(a, path) {
  for (let i = 0; i < 70; i++) {
    if (await a.page.evaluate(path => __declare.find(path).focused === true, path)) return;
    await a.drive.key('Tab');
  }
  assert.fail(`Keyboard could not reach ${path}`);
}
async function activate(a, path) { await tabTo(a, path); await a.drive.key('Enter'); }
async function dialogAction(a, id) {
  await a.page.waitForFunction(() => __app.draftDialog.shown);
  await a.page.waitForFunction(() => {
    const d = __app.draftDialog;
    return d.panel.col.btns[d.arrangement === 'stack' ? 'stackInner' : 'rowInner'].children.some(n => n.focused);
  });
  const path = await a.page.evaluate(id => {
    const d = __app.draftDialog, arrangement = d.arrangement === 'stack' ? 'stackInner' : 'rowInner';
    const rows = d.panel.col.btns[arrangement];
    return 'app.draftDialog.panel.col.btns.' + arrangement + '.'
      + rows.children.findIndex(n => n.label === d.buttons.find(b => b.id === id).label);
  }, id);
  await tabTo(a, path); await a.drive.key('Space'); await a.drive.wait(25); await a.drive.settleMotion();
  await a.page.waitForFunction(() => !__app.draftDialog.shown);
}
for (const backendClass of ['DomBackend', 'CanvasBackend']) {
  await test(`${backendClass}: keyboard recovery, Cancel, trapped confirmation, Clear and Discard`, () => withCausal(async ({ openApp }) => {
    await seed(openApp); const a = await openApp({ width: 390, height: 844 }); await ready(a);
    await activate(a, 'app.draftPanel.recovery.restore');
    await a.page.waitForFunction(() => __app.activeScenarioId === 'working');
    assert.equal(await a.page.evaluate(() => __app.header.scenarioPicker.segs().find(n => n.focused)?.t.text), 'Working');
    await activate(a, 'app.draftPanel.clearWork');
    await a.page.waitForFunction(() => __app.draftDialog.shown);
    await a.page.waitForFunction(() => __app.draftDialog.panel.col.btns.stackInner.children.some(n => n.focused));
    for (let i = 0; i < 8; i++) {
      await a.drive.key('Tab');
      const trapped = await a.page.evaluate(() => {
        const d = __app.draftDialog, rows = d.panel.col.btns[d.arrangement === 'stack' ? 'stackInner' : 'rowInner'];
        const focused = [];
        const walk = (n, path) => { if (n.focused) focused.push(path); (n.children || []).forEach((c, i) => walk(c, path + '.' + (c.name || i))); };
        walk(__app, 'app');
        return { ok: rows.children.some(n => n.focused), shown: d.shown, focused };
      });
      assert.equal(trapped.ok, true, `Dialog must trap focus: ${JSON.stringify(trapped)}`);
    }
    await dialogAction(a, 'cancel');
    assert.equal(await a.page.evaluate(() => __app.draftPanel.clearWork.focused), true, 'Cancel returns focus to opener');
    await activate(a, 'app.draftPanel.clearWork'); await dialogAction(a, 'clear');
    await a.page.waitForFunction(() => __app.draft.eraseIntent === '' && !__app.draft.savedRecord.disk.exists);
    await a.page.close(); await seed(openApp);
    const b = await openApp(); await ready(b);
    await activate(b, 'app.draftPanel.recovery.discardDraft'); await dialogAction(b, 'discard');
    await b.page.waitForFunction(() => !__app.draft.hasCandidate);
    assert.deepEqual([...a.pageErrors, ...b.pageErrors], []);
  }, { backendClass }));
}
await test('keyboard Retry recovers a failed initial read', () => withCausal(async ({ openApp }) => {
  const a = await openApp();
  await a.page.evaluate(() => { __persistenceTest.failure = 'unavailable'; __persistenceTest.hold = false; __persistenceTest.release(); });
  await ready(a); await activate(a, 'app.draftPanel.failure.retryAction');
  await a.page.waitForFunction(() => __app.draft.savedRecord.disk.loadStatus === 'loaded');
  assert.equal(await a.page.evaluate(() => __app.draft.failureCode), '');
}, { persistenceModule: '/apps/causal-desk/tests/persistence-held-host.mjs' }));
await test('responsive recovery preserves selection, graph scroll and Working under reduced motion', () => withCausal(async ({ openApp }) => {
  await seed(openApp); const a = await openApp({ width: 1280, height: 800 }); await ready(a);
  await a.page.evaluate(() => { __app.selectFactor('jetFuelPrice'); __app.changeSelectedAssumption(4.8); __app.reducedMotionOverride = true; });
  for (const [width, height] of [[1280, 800], [900, 1000], [390, 844], [1280, 800]]) {
    await a.drive.page.setViewport({ width, height }); await a.drive.settleMotion();
    await a.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const facts = await a.page.evaluate(() => {
      const panel = __app.draftPanel, r = panel.recovery;
      return { overflow: document.documentElement.scrollWidth > innerWidth,
        gap: __app.graph.y - panel.y - panel.height, selected: __app.selectedFactorId,
        value: __app.workingScenario.value.assumptions.jetFuelPrice, candidate: __app.draft.hasCandidate,
        targets: [r.restore, r.discardDraft, r.keep].map(n => [n.width, n.height]),
        messageBottom: r.message.y + r.message.height, buttonsTop: r.restore.y };
    });
    assert.equal(facts.overflow, false, `${width}px: ${JSON.stringify(facts)}`); assert.ok(facts.gap >= 28);
    assert.equal(facts.selected, 'jetFuelPrice'); assert.equal(facts.value, 4.8); assert.equal(facts.candidate, true);
    assert.ok(facts.targets.every(([w, h]) => w >= 44 && h >= 44));
    assert.ok(facts.messageBottom <= facts.buttonsTop, 'Recovery text must not overlap actions');
  }
  await a.drive.page.setViewport({ width: 390, height: 844 });
  await a.page.evaluate(() => __app.graph.scrollToX(150));
  const before = await a.page.evaluate(() => __app.graph.scrollX);
  await a.page.evaluate(() => __app.draft.keepCurrentWork()); await saved(a);
  assert.equal(await a.page.evaluate(() => __app.graph.scrollX), before);
  const ax = await a.page.accessibility.snapshot({ interestingOnly: false });
  assert.match(JSON.stringify(ax), /Saved on this device/);
}));
summarize('causal-desk persistence accessibility');
