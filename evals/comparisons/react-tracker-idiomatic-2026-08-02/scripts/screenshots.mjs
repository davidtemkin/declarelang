// Captures the screenshots referenced by REPORT.md.
import { LIST, openTracker, setScale } from "./browser.mjs";

const shot = (page, name) =>
  page.screenshot({ path: new URL(`../screenshots/${name}.png`, import.meta.url).pathname });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const { browser, page } = await openTracker();

await shot(page, "light");

await page.click("[aria-label='dark theme']");
await wait(300);
await shot(page, "dark");

// grouped, with a row open for editing
await page.click("[aria-label='Group by status']");
await wait(400);
const rows = await page.$$(`${LIST} [data-issue-id]`);
await rows[2].$eval("button[aria-expanded]", (b) => b.click());
await wait(500);
await shot(page, "editor");

await page.keyboard.press("Escape");
await page.click("[aria-label='Group by status']");
await page.click("[aria-label='light theme']");
await wait(300);

// a selection with the bulk bar showing, at 100K
await setScale(page, "100K");
await wait(500);
const some = await page.$$(`${LIST} [data-issue-id]`);
for (const [i, row] of some.slice(0, 5).entries()) {
  await row.evaluate((n, meta) => {
    n.firstElementChild.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: meta }));
  }, i > 0);
}
await wait(300);
await shot(page, "selection");

await page.setViewport({ width: 400, height: 820, deviceScaleFactor: 2 });
await wait(500);
await shot(page, "narrow");
await page.click("[aria-label='Toggle filters and statistics']");
await wait(500);
await shot(page, "narrow-panel");

await browser.close();
console.log("screenshots written");
