// Run every Slice 1–4 behavioral contract in a fresh, isolated browser host.
import { test, summarize, withCausal } from './persistence-support.mjs';
for (const name of ['assert', 'responsive', 'numeric-entry', 'keyboard', 'reduced-motion', 'error-state']) {
  const { default: run } = await import(`./${name}.mjs`);
  await test(`Causal Desk ${name}`, () => withCausal(async ({ openApp }) => {
    const app = await openApp({ width: 1280, height: 800 });
    await run({ drive: app.drive, expect: app.expect, page: app.page });
    if (app.pageErrors.length) throw new Error(app.pageErrors.join('\n'));
  }));
}
summarize('causal-desk regression');
