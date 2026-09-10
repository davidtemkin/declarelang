import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, summarize } from './harness.mjs';
import { buildProduction } from '../tools/declarec.mjs';
import { persistenceBrowser } from './helpers/persistence-browser.mjs';

for (const render of ['dom', 'canvas']) {
  await test(`${render}: slim production artifact boots Persistence and recovers its own entry-program scope`, async () => {
    const source = await readFile(new URL('./fixtures/persistence-lifecycle.declare', import.meta.url), 'utf8');
    const build = await buildProduction(source, { name: 'persistence-lifecycle', render,
      originDir: new URL('./fixtures/', import.meta.url).pathname });
    assert.equal(build.ok, true, build.report);
    assert.ok(build.usedComponents.includes('Persistence'));
    const h = await persistenceBrowser({ artifacts: build.files });
    try {
      const errors = [];
      const p = await h.browser.newPage(); p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await p.goto(h.origin + '/production/');
      await p.waitForSelector('input,textarea');
      await p.click('input,textarea');
      await p.keyboard.press('Home'); await p.keyboard.down('Shift'); await p.keyboard.press('End'); await p.keyboard.up('Shift');
      await p.keyboard.type('81'); await p.keyboard.press('Tab'); await p.keyboard.press('Enter');
      const appId = h.origin + '/production/persistence-lifecycle.declare';
      await p.waitForFunction(async appId => {
        const { IndexedDBProvider } = await import('/runtime/dist/persistence/indexeddb.js');
        const provider = new IndexedDBProvider({ factory: indexedDB });
        try { const r = await provider.read({appId, namespace: 'default', key: 'persistence-lifecycle'});
          return r.kind === 'document' && JSON.parse(r.json).amount === 81;
        } finally { provider.close(); }
      }, {}, appId);
      assert.deepEqual(errors, []); await p.close();
      const q = await h.browser.newPage(); await q.goto(h.origin + '/production/?route=another#details');
      await q.waitForSelector('input,textarea');
      assert.notEqual(await q.$eval('input,textarea', e => e.value), '81', 'manual recovery does not prefill the editor');
      await q.click('input,textarea'); await q.keyboard.press('Tab'); await q.keyboard.press('Tab'); await q.keyboard.press('Enter');
      await q.waitForFunction(() => document.querySelector('input,textarea').value === '81');
      const inspector = await h.page();
      const result = await inspector.evaluate(appId => provider.read({ appId, namespace: 'default', key: 'persistence-lifecycle' }),
        h.origin + '/production/persistence-lifecycle.declare');
      assert.equal(JSON.parse(result.json).amount, 81);
    } finally { await h.close(); }
  });
}
summarize('persistence-production');
