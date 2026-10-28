// The keyboard alone, at a desk: two seats, then checkout, then pay.
const focus = (page) => page.evaluate(() => { const e = document.activeElement; return (e?.getAttribute("aria-label") || e?.textContent || e?.tagName || "").slice(0, 70) })
export default async ({ drive, expect, page }) => {
  await drive.settleData()
  const log = async (what) => console.log(what.padEnd(14), "→", await focus(page))
  await drive.tab(); await drive.tab(); await drive.tab(); await log("tab×3")
  await drive.key("Enter"); await drive.settleData(); await drive.settleMotion(); await log("enter on row")
  await drive.tab(); await log("tab")
  await drive.key("ArrowRight"); await drive.key("ArrowRight"); await log("right×2")
  await drive.key(" "); await drive.settleMotion(); await log("space")
  await drive.key("ArrowRight"); await drive.key(" "); await drive.settleMotion(); await log("right, space")
  await drive.key("Shift+Tab"); await log("shift-tab")
  await drive.key("Enter"); await drive.settleMotion(); await log("enter")
  for (const t of ["guest@example.com", "4242424242424242", "0130", "123", "Ada Guest", "1 Main St", "", "Springfield", "94110"]) {
    await drive.tab(); if (t) await drive.type(t); await log("tab + type")
  }
  await drive.tab(); await log("tab"); await drive.tab(); await log("tab")
  await drive.key("Enter"); await drive.waitReal(2200); await drive.settleData(); await drive.settleMotion(); await log("enter")
  console.log("screen", await page.evaluate(() => window.__declare.find("app").screen))
}
