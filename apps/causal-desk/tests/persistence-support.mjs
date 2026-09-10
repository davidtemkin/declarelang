import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compile } from '../../../compiler/dist/compile-node.js';
import { withHost } from '../../../tools/internal/verify-behave.mjs';
export { test, summarize } from '../../../test/harness.mjs';
export { assert };
export const appDir = new URL('../', import.meta.url).pathname;
const compiled = await compile(await readFile(new URL('../causal-desk.declare', import.meta.url), 'utf8'), { originDir: appDir });
assert.deepEqual(compiled.errors, []);
export const withCausal = (fn, options = {}) => withHost({ compiled, appDir, ...options }, fn);
export const ready = async a => {
  await a.page.bringToFront();
  await a.page.waitForFunction(() => __app.draft.savedRecord.disk.loadStatus !== 'loading');
};
export const saved = async a => {
  // The verifier virtualizes debounce timers; wall-clock polling cannot fire them.
  await a.drive.wait(1000);
  await a.page.waitForFunction(() => __app.draft.saved);
};
export async function click(a, path) {
  await a.page.bringToFront();
  await a.page.evaluate(async path => {
    const n = __declare.find(path); n.scrollIntoView('nearest');
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  }, path);
  await a.drive.click(path);
}
export async function confirm(a, id) {
  await a.page.waitForFunction(() => __app.draftDialog.shown);
  const path = await a.page.evaluate(id => {
    const d = __app.draftDialog;
    const rows = d.arrangement === 'stack' ? d.panel.col.btns.stackInner : d.panel.col.btns.rowInner;
    const label = d.buttons.find(b => b.id === id).label;
    const button = rows.children.find(b => b.label === label);
    return 'app.draftDialog.panel.col.btns.' + (d.arrangement === 'stack' ? 'stackInner' : 'rowInner')
      + '.' + rows.children.indexOf(button);
  }, id);
  await click(a, path);
  await a.drive.wait(25);
  await a.drive.settleMotion();
  await a.page.waitForFunction(() => !__app.draftDialog.shown);
}
export const record = (overrides = {}) => ({ schemaVersion: 1, modelId: 'airline-operating-margin',
  modelRevision: '1', workingSourceId: 'fuelShock', overrides: { jetFuelPrice: 4.25 },
  savedAt: '2026-09-10T12:00:00.000Z', ...overrides });
export async function seed(openApp, value = record()) {
  const a = await openApp({ width: 1280, height: 800 }); await ready(a);
  await a.page.evaluate(value => { __app.draft.savedRecord.set([], value); __app.draft.savedRecord.disk.commit(); }, value);
  await a.page.waitForFunction(() => __app.draft.savedRecord.disk.saved);
  await a.page.close();
}
