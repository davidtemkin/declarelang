import { launch, slideBox, drag, api } from './common.mjs'
const post = (p, b) => api(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
let deck = (await post('/api/decks', { title: 'A very long presentation title that keeps going and going well past where any sensible person would stop typing it, just to see what happens' })).deck
const colors = ['#FFFFFF', '#0E3B43', '#FFF6DB', '#5B3DF5']
for (let i = 1; i < 100; i++) {
  await post(`/api/decks/${deck.id}/slides`, { background: colors[i % 4], elements: [{ id: 'e1', kind: 'text', x: 100, y: 300, width: 1080, height: 120, keepProportions: false, text: { content: 'Slide number ' + (i + 1), font: 'Inter', size: 96, weight: 700, italic: false, color: i % 4 === 1 || i % 4 === 3 ? '#FFFFFF' : '#17151F', align: 'center' } }, { id: 'e2', kind: 'ellipse', x: 1000, y: 50, width: 200, height: 200, fill: '#FF6A4D', stroke: null, keepProportions: true }] })
}
const { browser, page, errors } = await launch()
const t0 = Date.now()
await page.goto('http://localhost:5173/d/' + deck.id)
await page.getByRole('option', { name: 'Slide 100' }).waitFor()
console.log('open ms', Date.now() - t0)
await page.getByRole('option', { name: 'Slide 1', exact: true }).click()
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown')
console.log('current', await page.locator('[role=option][aria-selected=true]').getAttribute('aria-label'))
const { at } = await slideBox(page)
const t1 = Date.now()
await drag(page, at(1100, 150), at(700, 400), { steps: 30 })
console.log('drag ms', Date.now() - t1)
await page.screenshot({ path: '/tmp/pf/h1.png' })
await page.setViewportSize({ width: 1100, height: 700 })
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/pf/h2.png' })
await page.goto('http://localhost:5173/')
await page.waitForTimeout(1200)
await page.screenshot({ path: '/tmp/pf/h3.png' })
console.log(errors.join('\n'))
await browser.close()
