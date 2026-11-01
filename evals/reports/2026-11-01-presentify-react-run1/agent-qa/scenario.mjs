import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n) => page.screenshot({ path: `/tmp/pwscripts/${n}.png` });
await page.goto('http://localhost:5199/');
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'New presentation' }).first().click();
await page.waitForTimeout(1000);
const title = page.getByLabel('Presentation title');
console.log('title focused', await title.evaluate((el) => el === document.activeElement));
await page.keyboard.type('Quarterly review');
await page.keyboard.press('Enter');
const slide = page.getByLabel('Slide', { exact: true });
const b = await slide.boundingBox();
const s = b.width / 1280;
const P = (x, y) => [b.x + x * s, b.y + y * s];
// draw dark rectangle across top
await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
await page.mouse.move(...P(0, 0)); await page.mouse.down();
await page.mouse.move(...P(600, 100), { steps: 5 }); await page.mouse.move(...P(1280, 180), { steps: 5 }); await page.mouse.up();
await shot('s1');
// set fill via hex input
await page.getByRole('button', { name: /^Fill:/ }).click();
await page.locator('.color-popover-hex input').fill('#1F2328');
await page.keyboard.press('Enter');
await page.keyboard.press('Escape');
// text box on top
await page.getByRole('button', { name: 'Text', exact: true }).click();
await page.mouse.move(...P(80, 50)); await page.mouse.down();
await page.mouse.move(...P(600, 60), { steps: 5 }); await page.mouse.move(...P(1200, 60), { steps: 5 }); await page.mouse.up();
await page.keyboard.type('Quarterly review');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
// style: white, centred, 48
await page.getByRole('radio', { name: 'Align Centre' }).click();
await page.getByLabel('Size', { exact: true }).fill('48'); await page.keyboard.press('Enter');
await page.getByRole('button', { name: /^Text Colour:/ }).click();
await page.locator('.color-popover-hex input').fill('#FFFFFF');
await page.keyboard.press('Enter');
await page.keyboard.press('Escape');
await shot('s2');
// three text boxes
for (const [i, x] of [[0, 100], [1, 500], [2, 900]]) {
  await page.keyboard.press('t');
  await page.mouse.click(...P(x, 300 + i * 30));
  await page.keyboard.type('Point ' + (i + 1));
  await page.keyboard.press('Escape');
}
await page.mouse.click(...P(640, 700)); // empty -> deselect
// marquee select them
await page.mouse.move(...P(50, 260)); await page.mouse.down(); await page.mouse.move(...P(1270, 420), { steps: 8 }); await page.mouse.up();
await shot('s3');
console.log('inspector header', await page.locator('.inspector-header').innerText());
await page.getByRole('button', { name: 'Align Tops' }).click();
await page.getByRole('button', { name: 'Distribute Horizontally' }).click();
await shot('s4');
await page.waitForTimeout(2500);
console.log('status', await page.locator('.save-status').innerText());
console.log(errors.join('\n'));
console.log('url', page.url());
await browser.close();
