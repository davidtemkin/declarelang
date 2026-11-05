import { launch, slideBox, drag, api } from './common.mjs'
const { browser, page, errors } = await launch()
const log = (...a) => console.log(...a)
await page.goto('http://localhost:5173/')
await page.getByRole('button', { name: 'New presentation' }).first().click()
await page.waitForURL(/\/d\//)
await page.waitForTimeout(800)
// title is focused & selected
await page.keyboard.type('Quarterly review')
await page.keyboard.press('Enter')
const { at } = await slideBox(page)
// draw dark rect across top
await page.getByRole('button', { name: 'Rectangle', exact: true }).click()
await drag(page, at(0, 0), at(1280, 180))
await page.waitForTimeout(200)
await page.screenshot({ path: '/tmp/pf/s1.png' })
// set fill dark via inspector
await page.getByRole('button', { name: /^Fill:/ }).click()
await page.getByLabel('Fill hex value').fill('17151F')
await page.getByLabel('Fill hex value').press('Enter')
await page.keyboard.press('Escape')
// text on rect
await page.getByRole('button', { name: 'Text', exact: true }).click()
await page.mouse.click(at(640, 90).x, at(640, 90).y)
await page.keyboard.type('Quarterly review')
await page.waitForTimeout(100)
await page.screenshot({ path: '/tmp/pf/s2.png' })
await page.keyboard.press('Escape')
// size 48
await page.getByLabel('Font size').fill('48')
await page.getByLabel('Font size').press('Enter')
await page.waitForTimeout(300)
await page.screenshot({ path: '/tmp/pf/s3.png' })
// three text boxes
for (const [i, x] of [[1, 100], [2, 520], [3, 900]]) {
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await drag(page, at(x, 300 + i * 20), at(x + 260, 340 + i * 20))
  await page.keyboard.type('Column ' + i)
  await page.keyboard.press('Escape')
}
// select the 3 with shift click
await page.keyboard.press('Escape')
const pts = [[130, 330], [550, 350], [930, 370]]
for (const [k, [x, y]] of pts.entries()) {
  const p = at(x + 10, y)
  if (k) await page.keyboard.down('Shift')
  await page.mouse.click(p.x, p.y)
  if (k) await page.keyboard.up('Shift')
  await page.waitForTimeout(350)
}
await page.waitForTimeout(200)
await page.screenshot({ path: '/tmp/pf/s4.png' })
await page.getByRole('button', { name: 'Align tops' }).click()
await page.getByRole('button', { name: 'Distribute across' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: '/tmp/pf/s5.png' })
await page.waitForTimeout(2500)
log('status:', await page.getByRole('status').first().textContent())
const url = page.url(); const deckId = url.split('/d/')[1]
const deck = await api('/api/decks/' + deckId)
const slides = await api('/api/decks/' + deckId + '/slides')
log(JSON.stringify(deck), JSON.stringify(slides.slides[0].elements.map(e => [e.kind, e.x, e.y, e.width, e.height, e.text?.content, e.text?.size, e.text?.color, e.text?.align, e.fill])))
log(errors.join('\n'))
await browser.close()
