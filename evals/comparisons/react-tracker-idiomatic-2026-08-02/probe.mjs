/**
 * PROTOCOL.md measurements: the scrub probe plus the app's own load / ingest /
 * search numbers, at 10K and 100K. Run against the production preview:
 *
 *   npm run build && npm run preview &
 *   node probe.mjs
 */
import { BASE_URL, LIST, openTracker, setScale, waitForRows } from "./scripts/browser.mjs";

const quantiles = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[15], p90: sorted[27], max: sorted.at(-1) };
};

/** The protocol's scrub: 30 scrollbar teleports, one frame each. */
const scrub = (page) =>
  page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    const out = [];
    for (let i = 1; i <= 30; i++) {
      const t0 = performance.now();
      el.scrollTop = (el.scrollHeight - el.clientHeight) * (i / 30);
      await new Promise((r) => requestAnimationFrame(r));
      out.push(performance.now() - t0);
    }
    return out;
  }, LIST);

/** Contiguous scrolling, as a wheel-style read of the same list. */
const glide = (page) =>
  page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    el.scrollTop = 0;
    await new Promise((r) => requestAnimationFrame(r));
    const out = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      el.scrollTop += 900;
      await new Promise((r) => requestAnimationFrame(r));
      out.push(performance.now() - t0);
    }
    return out;
  }, LIST);

const appMetrics = (page) => page.$$eval("footer span b", (n) => n.map((x) => x.textContent));

/** Types a word one character at a time and reports the app's search ms each time. */
async function keystrokes(page, word) {
  await page.click("#tracker-search");
  await page.$eval("#tracker-search", (el) => el.setSelectionRange(0, el.value.length));
  await page.keyboard.press("Backspace");
  await new Promise((r) => setTimeout(r, 400));

  const samples = [];
  for (const char of word) {
    await page.type("#tracker-search", char);
    await new Promise((r) => setTimeout(r, 260));
    samples.push(Number((await appMetrics(page))[2].replace("ms", "")));
  }
  await page.$eval("#tracker-search", (el) => el.setSelectionRange(0, el.value.length));
  await page.keyboard.press("Backspace");
  await new Promise((r) => setTimeout(r, 400));
  return samples;
}

/** Wall time from a control click until the list has re-rendered. */
async function interaction(page, action) {
  const t0 = Date.now();
  await action();
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.querySelectorAll("[data-index]").length > 0,
    { timeout: 120_000 },
    LIST,
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return Date.now() - t0;
}

const { browser, page } = await openTracker();
console.log(`url ${BASE_URL}, viewport 1560x950 @2x\n`);

for (const scale of ["10K", "100K", "1M"]) {
  if (scale !== "10K") await setScale(page, scale);
  await waitForRows(page);
  await new Promise((r) => setTimeout(r, 500));

  const [load, ingest] = await appMetrics(page);
  const search = await keystrokes(page, "session restore");
  const s = quantiles(await scrub(page));
  const g = quantiles(await glide(page));

  console.log(`── ${scale} ─────────────────────────────`);
  console.log(`load          ${load}`);
  console.log(`ingest        ${ingest}`);
  console.log(
    `search        median ${median(search).toFixed(1)}ms  max ${Math.max(...search).toFixed(1)}ms  (${search.length} keystrokes: ${search.join(", ")})`,
  );
  console.log(`scrub         median ${s.median.toFixed(1)}ms  p90 ${s.p90.toFixed(1)}ms  max ${s.max.toFixed(1)}ms`);
  console.log(`glide         median ${g.median.toFixed(1)}ms  p90 ${g.p90.toFixed(1)}ms  max ${g.max.toFixed(1)}ms`);

  const flip = await interaction(page, () => page.click("[aria-label^='Sort direction']"));
  const byTitle = await interaction(page, () => page.select("[aria-label='Sort field']", "title"));
  const byUpdated = await interaction(page, () => page.select("[aria-label='Sort field']", "updated"));
  const grouping = await interaction(page, () => page.click("[aria-label='Group by status']"));
  await interaction(page, () => page.click("[aria-label='Group by status']"));
  console.log(
    `re-sort       direction ${flip}ms  by title ${byTitle}ms  by updated ${byUpdated}ms  group on ${grouping}ms\n`,
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

await browser.close();
