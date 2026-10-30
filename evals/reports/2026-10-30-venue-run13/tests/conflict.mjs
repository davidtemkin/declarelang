import { chromium } from "playwright"
const API = "http://127.0.0.1:8350"
const buy = (perf, ids) => fetch(API + "/api/orders", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: perf, seatIds: ids, email: "x@example.com",
        payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2029, cvc: "123", name: "X" },
            billing: { line1: "1 A St", line2: null, city: "NYC", postalCode: "94110", country: "US" } } }) }).then((r) => r.status)
const ok = (c, w) => console.log((c ? "  ✓ " : "  ✗ ") + w)
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message))
await page.goto("http://127.0.0.1:8200/my-apps/venue/venue.declare#p20")
await page.getByText(/seats free/).first().waitFor(); await page.waitForTimeout(800)
const free = await page.evaluate(() => [...document.querySelectorAll('[aria-pressed="false"]')].filter((e) => e.getAttribute("aria-disabled") != "true").map((e) => e.getAttribute("aria-label")).filter((l) => l.startsWith("Dress Circle")).slice(0, 3))
const idOf = (l) => { const m = l.match(/^(.*), row (\w+), seat (\d+)$/); return ({ "Dress Circle": "DC" })[m[1]] + "-" + m[2] + "-" + m[3] }
for (const l of free) await page.getByRole("button", { name: l, exact: true }).click()
ok(await page.getByText("3 seats · $150.00").isVisible(), "3 seats chosen")
console.log("   outside buys", free[0], await buy("p20", [idOf(free[0])]))
await page.waitForTimeout(1500)
ok(await page.getByText("2 seats · $100.00").isVisible(), "taken seat left the choice")
ok(await page.getByText(/Someone else just bought Dress Circle/).first().isVisible(), "told which: " + await page.getByText(/Someone else just bought/).first().innerText())
ok(await page.getByRole("button", { name: free[0], exact: true }).isDisabled(), "the seat now reads as taken")
await page.getByRole("button", { name: "Continue" }).click(); await page.waitForTimeout(400)
await page.getByLabel("Email").fill("kim@example.com"); await page.getByLabel("Name on card").fill("Kim")
await page.getByLabel("Card number").fill("4242424242424242"); await page.getByLabel("Expiry").fill("0429")
await page.getByLabel("Security code").fill("123"); await page.getByLabel("Street address").fill("1 Main")
await page.getByLabel("City").fill("NYC"); await page.getByLabel("Postal code").fill("94110")
const outside = buy("p20", [idOf(free[1])])
await page.waitForTimeout(100)
await page.getByRole("button", { name: "Pay $110.00" }).click()
console.log("   outside:", await outside)
await page.waitForTimeout(2500)
await page.screenshot({ path: "/tmp/conflict.png" })
ok(await page.getByText("1 seat · $50.00").isVisible(), "back in the hall with the rest of the choice")
console.log("   toast:", await page.getByText(/no longer available|taken|sold/i).allInnerTexts())
await b.close()
