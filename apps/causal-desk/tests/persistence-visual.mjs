// Real platform-host snapshots. Failure injection is available only in tests.
// Run normally to compare; --capture writes review candidates; --bless accepts.
import { readFile, writeFile } from 'node:fs/promises';
import { assert, test, summarize, withCausal, ready, record, click } from './persistence-support.mjs';
const bless = process.argv.includes('--bless'), capture = process.argv.includes('--capture');
const viewports = [[1280, 800], [900, 1000], [390, 844]];
const names = ['recovery', 'saved', 'unavailable', 'stale', 'clear-confirmation'];
// Same per-channel tolerance as Declare's R6 verifier; PNG byte identity is
// stricter than the rendered-pixel contract (GPU shadow rounding can differ by 1).
async function comparePixels(page, expected, actual) {
  if (expected.equals(actual)) return { over: 0, max: 0 };
  return page.evaluate(async sources => {
    const images = await Promise.all(sources.map(async source => {
      const image = new Image(); image.src = 'data:image/png;base64,' + source; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height);
    }));
    const [a, b] = images;
    if (a.width !== b.width || a.height !== b.height) return { over: -1, max: 255 };
    let over = 0, max = 0;
    for (let i = 0; i < a.data.length; i++) {
      const delta = Math.abs(a.data[i] - b.data[i]);
      max = Math.max(max, delta); if (delta > 4) over++;
    }
    return { over, max };
  }, [expected.toString('base64'), actual.toString('base64')]);
}
for (const [width, height] of viewports) for (const name of names) {
  await test(`draft ${name} at ${width}×${height}`, () => withCausal(async ({ openApp }) => {
    const a = await openApp({ width, height, clock: '2026-09-10T12:00:00.000Z' });
    await a.page.evaluate(name => {
      __persistenceTest.failure = name === 'unavailable' ? 'unavailable' : null;
      __persistenceTest.hold = false; __persistenceTest.release();
    }, name);
    await ready(a);
    if (name !== 'unavailable') {
      await a.page.evaluate(value => { __app.draft.savedRecord.set([], value); __app.draft.savedRecord.disk.commit(); },
        record(name === 'stale' ? { modelRevision: 'old' } : {}));
      await a.page.waitForFunction(() => __app.draft.savedRecord.disk.saved);
      await a.page.evaluate(() => __app.draft.savedRecord.disk.reload());
      await a.page.waitForFunction(() => __app.draft.hasCandidate);
      if (name === 'saved' || name === 'clear-confirmation') {
        await click(a, 'app.draftPanel.recovery.restore');
        if (name === 'clear-confirmation') {
          await click(a, 'app.draftPanel.clearWork');
          await a.page.waitForFunction(() => __app.draftDialog.shown);
        }
      }
    }
    await a.drive.settleMotion();
    await a.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const base = new URL(`baselines/draft-${name}@${width}x${height}.png`, import.meta.url);
    const actual = new URL(`baselines/draft-${name}@${width}x${height}.actual.png`, import.meta.url);
    const shot = Buffer.from(await a.page.screenshot({ encoding: 'binary' }));
    if (bless) await writeFile(base, shot);
    else if (capture) await writeFile(actual, shot);
    else {
      const expected = await readFile(base);
      const difference = await comparePixels(a.page, expected, shot);
      if (difference.over !== 0) await writeFile(actual, shot);
      assert.equal(difference.over, 0, `Visual mismatch ${JSON.stringify(difference)}: ${actual.pathname}`);
    }
    assert.deepEqual(a.pageErrors, []);
  }, { persistenceModule: '/apps/causal-desk/tests/persistence-held-host.mjs' }));
}
summarize('causal-desk persistence visuals');
