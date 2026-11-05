import { chromium } from '/Users/temkin/Code/eval-presentify-react-2/work/app/node_modules/playwright/index.mjs'
const browser = await chromium.launch({ executablePath: '/Users/temkin/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto('http://localhost:5173/')
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/pf/list.png' })
await page.getByRole('button', { name: 'Open Field notes from the coast' }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/pf/editor.png' })
console.log(errors.join('\n'))
await browser.close()
