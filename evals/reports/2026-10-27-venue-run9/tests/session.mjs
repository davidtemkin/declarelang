const free = (page, n) => page.evaluate((n) => {
  const v = window.__declare.find("app.house").value, out = []
  for (const s of v.sections) for (const r of s.rows) for (const seat of r.seats) if (seat.status == "available" && out.length < n) out.push(seat.id)
  return out }, n)
export default async ({ drive, expect, page }) => {
  await drive.settleData()
  await drive.click('app.bar."Sign in"'); await drive.settleMotion()
  await page.screenshot({ path: "/tmp/vshots/desk-signin.png" })
  await drive.click('app.signInSheet."Email"'); await drive.type("a@a.co")
  await drive.click('app.signInSheet."Password"'); await drive.type("pass")
  await drive.key("Enter"); await drive.waitReal(700); await drive.settleData(); await drive.settleMotion()
  await expect.attr("app", "signingIn", false)
  await page.reload(); await drive.waitReal(1500); await drive.settleData()
  console.log("after reload:", await page.evaluate(() => window.__declare.find("app").account?.email))
  // double press of Pay with a saved card
  await drive.set("app", "location", "p03"); await drive.settleData(); await drive.waitReal(500); await drive.settleData()
  for (const id of await free(page, 1)) await drive.page.evaluate((id) => { window.__declare.find("app").toggleSeat(id); return null }, id)
  await drive.set("app", "waypoint", "pay"); await drive.settleMotion()
  await drive.click('app.screens.pay.formPane.col.form.saved."Security code"'); await drive.type("123")
  const before = (await drive.requests()).filter((r) => r.method == "POST" && r.path.startsWith("/api/orders")).length
  const pay = (await page.evaluate(() => window.__declare.find("app").totalCents))
  const label = 'app.screens.pay.side."Pay $' + (pay / 100).toFixed(2) + '"'
  await drive.click(label); await drive.click('app.screens.pay.side."Paying…"'); await drive.key("Enter")
  await drive.waitReal(2500); await drive.settleData(); await drive.settleMotion()
  const after = (await drive.requests()).filter((r) => r.method == "POST" && r.path.startsWith("/api/orders")).length
  console.log("orders sent by double press:", after - before, "screen:", await page.evaluate(() => window.__declare.find("app").screen))
  await drive.click('app.bar."Sign out"'); await drive.waitReal(500); await drive.settleData()
  await page.reload(); await drive.waitReal(1500); await drive.settleData()
  console.log("after sign-out + reload:", await page.evaluate(() => window.__declare.find("app").account?.email ?? "signed out"))
}
