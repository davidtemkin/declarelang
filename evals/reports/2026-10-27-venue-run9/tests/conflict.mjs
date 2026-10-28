const free = (page, n) => page.evaluate((n) => {
  const v = window.__declare.find("app.house").value, out = []
  for (const s of v.sections) for (const r of s.rows) for (const seat of r.seats) if (seat.status == "available" && out.length < n) out.push(seat.id)
  return out }, n)
export default async ({ drive, expect, page }) => {
  await drive.settleData()
  await drive.set("app", "location", "p08"); await drive.settleData(); await drive.waitReal(500); await drive.settleData()
  const ids = await free(page, 3)
  for (const id of ids) await page.evaluate((id) => { window.__declare.find("app").toggleSeat(id); return null }, id)
  await drive.set("app", "waypoint", "pay"); await drive.settleMotion()
  await drive.set("app.live", "active", false)
  await page.evaluate((id) => fetch("http://127.0.0.1:8350/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ performanceId: "p08", seatIds: [id], email: "x@example.com",
      payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "X" },
        billing: { line1: "1 A St", line2: null, city: "B", postalCode: "94110", country: "US" } } }) }).then(() => null), ids[1])
  await drive.waitReal(1800)
  const f = 'app.screens.pay.formPane.col.form'
  for (const [l, t] of [["Email", "g@example.com"], ["Card number", "4242424242424242"], ["Expiry (MM / YY)", "0131"], ["Name on card", "G"], ["Street address", "1 Main"], ["City", "Town"], ["Postal code", "94110"]]) { await drive.click(`${f}."${l}"`); await drive.type(t) }
  await drive.click(`${f}.card.codes."Security code"`); await drive.type("123")
  const a = await page.evaluate(() => window.__declare.find("app"))
  await drive.click('app.screens.pay.side.payRow.1.pay')
  await drive.waitReal(2500); await drive.settleData(); await drive.settleMotion()
  console.log(await page.evaluate(() => { const a = window.__declare.find("app"); return JSON.stringify({ screen: a.screen, chosen: a.chosen, notice: a.notice, summary: a.summary }) }))
  await page.screenshot({ path: "/tmp/vshots/desk-conflict.png" })
}
