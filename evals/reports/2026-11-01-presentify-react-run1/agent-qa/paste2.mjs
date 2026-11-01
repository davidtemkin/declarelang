import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';
const deck = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { console.log('setItem', k, v.slice(-16), new Error().stack.split('\n').slice(2, 5).join(' | ')); return orig.call(this, k, v); };
});
page.on('console', (m) => m.text().startsWith('setItem') && console.log(m.text()));
await page.goto('http://localhost:5199/p/' + deck);
await page.waitForTimeout(1000);
const slide = page.getByLabel('Slide', { exact: true });
const b = await slide.boundingBox(); const s = b.width / 1280; const P = (x, y) => [b.x + x * s, b.y + y * s];
await page.mouse.click(...P(300, 650));
await page.keyboard.press('Meta+c');
console.log('--- paste');
await page.keyboard.press('Meta+v');
await page.waitForTimeout(300);
await browser.close();
