import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, summarize } from './harness.mjs';
import { compile } from '../compiler/dist/compile-node.js';
import { withHost } from '../tools/internal/verify-behave.mjs';

const appDir = new URL('./fixtures/', import.meta.url).pathname;
const compiled = await compile(await readFile(new URL('./fixtures/persistence-lifecycle.declare', import.meta.url), 'utf8'), { originDir: appDir });
assert.deepEqual(compiled.errors, []);
const ready = async p => { await p.bringToFront(); await p.waitForFunction(() => __app.db.disk.loadStatus === 'loaded'); };
const saved = async p => { await p.bringToFront(); await p.waitForFunction(() => __app.db.disk.saved); };
async function geometry(a, width) {
  assert.deepEqual(await a.page.evaluate(() => ['save','restore','replaceSaved','erase','retry','reload','leave','cancel']
    .map(name => [__app.body[name].width, __app.body[name].height])), Array(8).fill([width - 40, 44]));
  assert.equal(await a.page.evaluate(() => __app.body.status.y + __app.body.status.height <= __app.body.form.y), true);
}
async function setAmount(a, value) {
  await a.page.bringToFront();
  await a.drive.click('app.body.form.amount');
  await a.page.keyboard.press('Home');
  await a.page.keyboard.down('Shift'); await a.page.keyboard.press('End'); await a.page.keyboard.up('Shift');
  await a.page.keyboard.type(String(value));
  await a.page.waitForFunction(n => __app.db.value.amount === n, {}, value);
}
async function click(a, name) {
  await a.page.bringToFront();
  await a.page.evaluate(async name => {
    const n = __declare.inspect('app.body.' + name);
    if (n.rootY < 0 || n.rootY + n.height > innerHeight) __app.scrollY += n.rootY - 100;
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  }, name);
  await a.drive.click('app.body.' + name);
}
for (const backendClass of ['DomBackend', 'CanvasBackend']) {
  await test(`P17/P19/P22 ${backendClass}: real edit, receipt, cold page recovery, erase and empty cold boot`, async () => {
    await withHost({ compiled, appDir, backendClass }, async ({ openApp }) => {
      const a = await openApp({ width: 390, height: 844 }); await ready(a.page);
      await geometry(a, 390);
      await setAmount(a, 42); await click(a, 'save');
      await saved(a.page);
      await a.page.close();
      const b = await openApp({ width: 900, height: 1000 }); await ready(b.page);
      await geometry(b, 900);
      assert.equal(await b.page.evaluate(() => __app.db.disk.candidate.amount), 42);
      assert.equal(await b.page.evaluate(() => __app.db.value.amount), 0);
      await click(b, 'restore'); await saved(b.page);
      assert.equal(await b.page.evaluate(() => __app.db.value.amount), 42);
      await b.page.evaluate(() => history.replaceState(null, '', '?route=changed#changed'));
      await setAmount(b, 43); await click(b, 'save'); await saved(b.page);
      await b.page.close();
      const c = await openApp({ width: 1280, height: 800 }); await ready(c.page);
      await geometry(c, 1280);
      assert.equal(await c.page.evaluate(() => __app.db.disk.candidate.amount), 43);
      await click(c, 'erase'); await c.page.waitForFunction(() => !__app.db.disk.pending && !__app.db.disk.exists);
      await c.page.close();
      const d = await openApp(); await ready(d.page);
      assert.deepEqual(await d.page.evaluate(() => [__app.db.disk.recovery, __app.db.disk.exists]), ['none', false]);
      for (const view of [a,b,c,d]) assert.deepEqual(view.pageErrors, []);
    });
  });
}
await test('P12/P13 real tabs reject a stale writer; reload and explicit replace resolve recovery', async () => {
  await withHost({ compiled, appDir }, async ({ openApp }) => {
    const a = await openApp(), b = await openApp(); await ready(a.page); await ready(b.page);
    await setAmount(a, 1); await click(a, 'save'); await saved(a.page);
    await setAmount(b, 2); await click(b, 'save');
    await b.page.waitForFunction(() => __app.db.disk.error?.code === 'conflict');
    assert.equal(await b.page.evaluate(() => __app.db.value.amount), 2);
    await click(b, 'reload'); await b.page.waitForFunction(() => __app.db.disk.recovery === 'available');
    assert.equal(await b.page.evaluate(() => __app.db.disk.candidate.amount), 1);
    await click(b, 'replaceSaved'); await saved(b.page);
    await a.page.close(); await b.page.close();
    const c = await openApp(); await ready(c.page);
    assert.equal(await c.page.evaluate(() => __app.db.disk.candidate.amount), 2);
  });
});
await test('P20/P21 delayed and failing provider keeps visible state truthful; Cancel ignores receipt', async () => {
  await withHost({ compiled, appDir, persistenceModule: '/test/helpers/persistence-browser-controls.mjs' }, async ({ openApp }) => {
    const a = await openApp({ width: 390, height: 844 }); await ready(a.page);
    await a.page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    assert.equal(await a.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    await setAmount(a, 15);
    await a.page.evaluate(() => { __persistenceTest.hold = true; });
    await click(a, 'leave'); await a.page.waitForFunction(() => __persistenceTest.pending.length === 1);
    await a.page.evaluate(() => __persistenceTest.clock.advance(10000));
    await a.page.waitForFunction(() => __app.db.disk.error?.code === 'stalled');
    assert.equal(await a.page.evaluate(() => __app.db.disk.pending), true);
    assert.match(await a.page.evaluate(() => __app.body.status.text), /not confirmed/);
    await click(a, 'cancel'); await a.page.evaluate(() => { __persistenceTest.hold = false; __persistenceTest.release(); });
    await saved(a.page); assert.equal(await a.page.evaluate(() => __app.left), false);
    await a.page.evaluate(() => { __persistenceTest.failure = 'quota'; });
    await click(a, 'save'); await a.page.waitForFunction(() => __app.db.disk.error?.code === 'quota');
    assert.match(await a.page.evaluate(() => __app.body.status.text), /full or restricted/);
    await click(a, 'retry'); await saved(a.page);
    await click(a, 'leave'); await a.page.waitForFunction(() => __app.left);
    assert.deepEqual(a.pageErrors, []);
  });
});
summarize('persistence-browser');
