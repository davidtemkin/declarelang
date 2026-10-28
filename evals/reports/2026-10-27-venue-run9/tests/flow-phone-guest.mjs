// A guest at a desk: two seats, a declined card, then a good one.
const free = (page, key, n) => page.evaluate(([key, n]) => {
  const v = window.__declare.find("app.house").value
  const s = v.sections.find((x) => x.key == key)
  const out = []
  for (const r of s.rows) for (const seat of r.seats) if (seat.status == "available" && out.length < n) out.push(s.name + ", row " + r.name + ", seat " + seat.number)
  return out
}, [key, n])

export const device = { width: 390, height: 844, touch: true }
export default async ({ drive, expect, page }) => {
  await drive.settleData()
  await drive.click('app.screens.list.col.list.0')
  await drive.settleData()
  await drive.settleMotion()
  const seats = await free(page, "ORCH", 2)
  console.log("picking", seats)
  for (const s of seats) { await drive.reveal(`app.screens.hall.hallPane.map."${s}"`); await drive.click(`app.screens.hall.hallPane.map."${s}"`) }
  await drive.settleMotion()
  await expect.text("app.screens.hall.side.total", "2 seats · $160.00")
  await drive.click('app.screens.hall.side.total.Continue')
  await drive.settleMotion()
  await expect.visible("app.screens.pay")
  // try to pay with nothing filled: every problem shows
  await drive.click('app.screens.pay.side."Pay $174.00"')
  await drive.settleMotion()
  await expect.request("POST", "/api/orders", { count: 0 })
  const f = 'app.screens.pay.formPane.col.form'
  await drive.click(`${f}."Email"`); await drive.type("guest@example.com")
  await drive.click(`${f}."Card number"`); await drive.type("4000000000000002")
  await expect.attr("app", "cardNumber", "4000 0000 0000 0002")
  await drive.click(`${f}."Expiry (MM / YY)"`); await drive.type("1230")
  await expect.attr("app", "expiry", "12 / 30")
  await drive.click(`${f}."Security code"`); await drive.type("123")
  await drive.click(`${f}."Name on card"`); await drive.type("Grace Hopper")
  await drive.click(`${f}."Street address"`); await drive.type("1 Main Street")
  await drive.click(`${f}."City"`); await drive.type("Springfield")
  await drive.click(`${f}."Postal code"`); await drive.type("94110")
  await drive.click('app.screens.pay.side."Pay $174.00"')
  await drive.waitReal(2500)
  await drive.settleData()
  await drive.settleMotion()
  await expect.request("POST", "/api/orders", { count: 1 })
  console.log("problem:", await page.evaluate(() => window.__declare.find("app").payProblem))
  await expect.attr("app", "code", "")
  await expect.attr("app", "cardNumber", "4000 0000 0000 0002")
  // a good card
  await drive.selectAll(`${f}."Card number"`); await drive.type("4242424242424242")
  await drive.click(`${f}."Security code"`); await drive.type("123")
  await drive.click('app.screens.pay.side."Pay $174.00"')
  await drive.waitReal(2500)
  await drive.settleData()
  await drive.settleMotion()
  await expect.visible("app.screens.tickets")
  await expect.text("app.screens.tickets", "Sent to guest@example.com")
  await page.screenshot({ path: "/tmp/vshots/" + "phone" + "-tickets.png" })
}
