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
export const saved = a => a.page.waitForFunction(() => __app.draft.saved);
export const record = (overrides = {}) => ({ schemaVersion: 1, modelId: 'airline-operating-margin',
  modelRevision: '1', workingSourceId: 'fuelShock', overrides: { jetFuelPrice: 4.25 },
  savedAt: '2026-09-10T12:00:00.000Z', ...overrides });
export async function seed(openApp, value = record()) {
  const a = await openApp({ width: 1280, height: 800 }); await ready(a);
  await a.page.evaluate(value => { __app.draft.savedRecord.set([], value); __app.draft.savedRecord.disk.commit(); }, value);
  await a.page.waitForFunction(() => __app.draft.savedRecord.disk.saved);
  await a.page.close();
}
