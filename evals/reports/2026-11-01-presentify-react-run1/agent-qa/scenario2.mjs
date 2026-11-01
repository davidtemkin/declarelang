import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';
const deck = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n) => page.screenshot({ path: `/tmp/pwscripts/${n}.png` });
await page.goto('http://localhost:5199/p/' + deck);
await page.waitForTimeout(1000);
const slide = page.getByLabel('Slide', { exact: true });
const b = await slide.boundingBox();
const s = b.width / 1280;
const P = (x, y) => [b.x + x * s, b.y + y * s];
// circle with shift
await page.getByRole('button', { name: 'Ellipse', exact: true }).click();
await page.mouse.move(...P(200, 500)); await page.mouse.down();
await page.keyboard.down('Shift');
await page.mouse.move(...P(260, 540), { steps: 4 }); await page.mouse.move(...P(320, 560), { steps: 4 });
await page.mouse.up(); await page.keyboard.up('Shift');
console.log('keep proportions checked', await page.getByLabel('Keep proportions').isChecked());
// label
await page.keyboard.press('t');
await page.mouse.click(...P(340, 540));
await page.keyboard.type('Label');
await page.keyboard.press('Escape');
// shift-click circle to add
await page.mouse.click(...P(260, 560), { modifiers: ['Shift'] });
console.log('header', await page.locator('.inspector-header').innerText());
await page.keyboard.press('Meta+g');
console.log('after group', await page.locator('.inspector-header').innerText());
// move group
await page.mouse.move(...P(260, 560)); await page.mouse.down();
await page.mouse.move(...P(400, 600), { steps: 10 }); await page.mouse.up();
await shot('g1');
const undo = page.getByRole('button', { name: 'Undo' });
await undo.click(); // undo move
await shot('g2');
await undo.click(); // undo group
console.log('after 2 undos', await page.locator('.inspector-header').innerText());
await shot('g3');
// duplicate slide
await page.getByRole('button', { name: 'Slide', exact: true }).click();
await page.getByRole('menuitem', { name: 'Duplicate Slide' }).click();
await page.waitForTimeout(200);
console.log('slides', await page.getByRole('option').allInnerTexts());
// change title on slide 2: dblclick title text
await page.mouse.dblclick(...P(640, 90));
await page.keyboard.press('Meta+a');
await page.keyboard.type('Quarterly review: the copy');
await page.keyboard.press('Escape');
// drag slide 2 above slide 1
const s2 = await page.getByRole('option', { name: 'Slide 2' }).boundingBox();
const s1 = await page.getByRole('option', { name: 'Slide 1' }).boundingBox();
await page.mouse.move(s2.x + s2.width / 2, s2.y + s2.height / 2); await page.mouse.down();
await page.mouse.move(s2.x + s2.width / 2, s2.y + 10, { steps: 5 });
await page.mouse.move(s1.x + s1.width / 2, s1.y + 15, { steps: 10 });
await shot('drag');
await page.mouse.up();
await page.waitForTimeout(300);
await shot('g4');
await page.waitForTimeout(2500);
console.log('status', await page.locator('.save-status').innerText());
// present from start
await page.getByRole('button', { name: 'Slide', exact: true }).click();
await page.getByRole('menuitem', { name: 'Present from Start' }).click();
await page.waitForTimeout(500);
await shot('p1');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
await shot('p2');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
console.log('current after present', await page.locator('[role=option][aria-selected=true]').getAttribute('aria-label'));
console.log(errors.join('\n'));
await browser.close();
