export const device = { width: 390, height: 844, touch: true }
const free = (page, key, n) => page.evaluate(([key, n]) => {
  const v = window.__declare.find("app.house").value
  const s = v.sections.find((x) => x.key == key)
  const out = []
  for (const r of s.rows) for (const seat of r.seats) if (seat.status == "available" && out.length < n) out.push({ name: s.name + ", row " + r.name + ", seat " + seat.number, id: seat.id })
  return out
}, [key, n])
const shot = (page, n) => page.screenshot({ path: `/tmp/vshots/phone-${n}.png` })

export default async ({ drive, expect, page }) => {
  await drive.settleData()
  await shot(page, "1-list")
  await drive.click('app.screens.list.col.list.0')
  await drive.settleData(); await drive.settleMotion()
  const a = await free(page, "ORCH", 2), b = await free(page, "GT", 1)
  for (const s of [...a, ...b]) { await drive.reveal(`app.screens.hall.hallPane.map."${s.name}"`); await drive.click(`app.screens.hall.hallPane.map."${s.name}"`) }
  await drive.settleMotion()
  await shot(page, "2-hall")
  await expect.text("app.screens.hall.side.total", "3 seats · $225.00")
  await drive.click('app.screens.hall.side.total.Continue')
  await drive.settleMotion()
  const f = 'app.screens.pay.formPane.col.form'
  await drive.click(`${f}."Email"`); await drive.type("typed@example.com")
  await shot(page, "3-pay-guest")
  // sign in halfway
  await drive.click(`${f}.who."Sign in"`)
  await drive.settleMotion()
  await drive.click('app.signInSheet."Email"'); await drive.type("ada@example.com")
  await drive.click('app.signInSheet."Password"'); await drive.type("wrong")
  await drive.click('app.signInSheet."Sign in"')
  await drive.waitReal(600); await drive.settleData(); await drive.settleMotion()
  await shot(page, "4-signin-wrong")
  await expect.text("app.signInSheet", "That email and password don't match.")
  await drive.selectAll('app.signInSheet."Password"'); await drive.type("correct horse battery")
  await drive.click('app.signInSheet."Sign in"')
  await drive.waitReal(800); await drive.settleData(); await drive.settleMotion()
  await expect.attr("app", "email", "typed@example.com")
  await expect.attr("app", "payWith", "card_1")
  await shot(page, "5-pay-saved")
  await drive.click(`${f}.saved."Security code"`); await drive.type("000")
  await drive.click('app.screens.pay.side."Pay $245.00"')
  await drive.waitReal(2500); await drive.settleData(); await drive.settleMotion()
  console.log("after decline:", await page.evaluate(() => window.__declare.find("app").payProblem))
  await shot(page, "6-declined")
  // a new card, and a postcode the bank doesn't hold
  await drive.click(`${f}.methods."A new card"`)
  await drive.settleMotion()
  await drive.click(`${f}."Card number"`); await drive.type("5555555555554444")
  await drive.click(`${f}."Expiry (MM / YY)"`); await drive.type("0429")
  await drive.click(`${f}.card.codes."Security code"`); await drive.type("321")
  await drive.selectAll(`${f}."Postal code"`); await drive.type("SW1A")
  await drive.click(`${f}."City"`)   // leave the field: it is judged now
  await drive.settleMotion()
  await shot(page, "7-postcode-left")
  await drive.selectAll(`${f}."Postal code"`); await drive.type("SW1A 1AA")
  console.log("vals", await page.evaluate(() => { const a = window.__declare.find("app"); return [a.country, a.line1, a.city, a.cardName, a.email] }))
  await drive.click('app.screens.pay.side."Pay $245.00"')
  await drive.waitReal(2500); await drive.settleData(); await drive.settleMotion()
  console.log("focus:", await page.evaluate(() => document.activeElement?.getAttribute("autocomplete") + " / " + document.activeElement?.getAttribute("aria-label")))
  await shot(page, "8-postcode-refused")
  // someone else buys one of the seats first
  await page.evaluate((id) => fetch("http://127.0.0.1:8350/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ performanceId: "p01", seatIds: [id], email: "x@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "X" },
        billing: { line1: "1 A St", line2: null, city: "B", postalCode: "94110", country: "US" } } }) }), b[0].id)
  await drive.waitReal(2200); await drive.settleData(); await drive.settleMotion()
  console.log("chosen after live take:", await page.evaluate(() => window.__declare.find("app").chosen), "notice:", await page.evaluate(() => window.__declare.find("app").notice), "screen", await page.evaluate(() => window.__declare.find("app").screen))
  await shot(page, "9-after-take")
}
