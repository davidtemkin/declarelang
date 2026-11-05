import { chromium } from '/Users/temkin/Code/eval-presentify-react-2/work/app/node_modules/playwright/index.mjs'
export async function launch(w = 1440, h = 900) {
  const browser = await chromium.launch({ executablePath: '/Users/temkin/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' })
  const context = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  return { browser, context, page, errors }
}
export async function slideBox(page) {
  const b = await page.getByLabel('Slide', { exact: true }).boundingBox()
  const s = b.width / 1280
  return { b, s, at: (x, y) => ({ x: b.x + x * s, y: b.y + y * s }) }
}
export async function drag(page, from, to, opts = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const steps = opts.steps ?? 8
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
  await page.mouse.up()
}
export const api = (path, init) => fetch('http://127.0.0.1:8361' + path, init).then((r) => r.json())
