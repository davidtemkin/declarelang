// The brief's "what done looks like", on a desk, against the running service.
// Run: npx declare-verify my-apps/ledger/ledger.declare --assert my-apps/ledger/checks/flows.mjs

const read = (drive, path, attr) => drive.page.evaluate((p, a) => {
    const v = window.__declare.find(p)[a]
    return v == null ? v : JSON.parse(JSON.stringify(v))
}, path, attr)
const call = (drive, js) => drive.page.evaluate(js)

export default async ({ drive, expect, page }) => {
    await drive.waitReal(1500)
    await drive.settleData()

    // 1. Overview: this month's expense bar opens exactly those expenses.
    await expect.text("app.main.pages.overview.col.figures", "Revenue")
    await expect.text("app.main.pages.overview.col.figures", "vs Oct")
    const chart = "app.main.pages.overview.col.cards.flow.body.chart"
    const pts = await read(drive, chart, "points")
    const last = pts.length - 1
    const barValue = pts[last].v[1]
    const x = await drive.page.evaluate((p, i) => { const c = window.__declare.find(p); return c.xOf(i) + c.barW / 2 }, chart, last)
    const y = await drive.page.evaluate((p) => { const c = window.__declare.find(p); return c.yOf(0) - 3 }, chart)
    await drive.clickAt(chart, x, y)
    await drive.waitReal(800); await drive.settleData()
    await expect.attr("app", "page", "transactions")
    const s1 = await read(drive, "app", "summary")
    expect.equal(s1.out, barValue)
    expect.equal(s1.in, 0)
    await expect.text("app.main.pages.transactions.head.summary", "transactions · In $0.00 · Out ")
    // Back returns to the overview as it was
    await drive.click("app.main.pages.transactions.head.back")
    await expect.attr("app", "page", "overview")
    await expect.attr("app", "kinds", [])
}
