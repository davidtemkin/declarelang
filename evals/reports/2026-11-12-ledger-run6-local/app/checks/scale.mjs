// The whole history: End jumps to the oldest at once. And a chart by keyboard:
// one stop, arrows move, each point said in a sentence, Enter opens it.

export default async ({ drive, expect, page }) => {
    await drive.waitReal(1500); await drive.settleData()
    await drive.set("app", "location", "transactions")
    await drive.page.evaluate(() => window.__declare.find("app").setPreset("all"))
    await drive.waitReal(1500); await drive.settleData()
    const n = await drive.page.evaluate(() => window.__declare.find("app").rows.length)
    if (n < 4000) throw new Error("expected the whole history, got " + n)
    await page.getByRole("grid", { name: "Transactions" }).focus()
    await drive.key("ArrowDown")
    const t0 = Date.now()
    await drive.key("End")
    await drive.settleMotion()
    const ms = Date.now() - t0
    await expect.text("app.main.pages.transactions.body.detail", "2024")   // the oldest record, open beside
    console.log("End took " + ms + " ms over " + n + " rows")

    await drive.page.evaluate(() => window.__declare.find("app").setPreset("this-year"))
    await drive.set("app", "location", "insights")
    await drive.set("app", "insightTab", "flow")
    await drive.waitReal(1000); await drive.settleData()
    await page.getByRole("button", { name: "Income vs expenses", exact: true }).last().focus()
    await drive.key("Home")
    await drive.key("ArrowDown")
    const said = await drive.page.evaluate(() => { const c = window.__declare.find("app.main.pages.insights.col.flow.body.chart"); return c.sentence(c.active, c.activeSeries) })
    console.log("said: " + said)
    if (!/^January 2026, Expenses, \$[\d,]+\.\d\d, .*transactions$/.test(said)) throw new Error("no sentence for the point")
    await drive.key("Enter")
    await drive.waitReal(800); await drive.settleData()
    await expect.attr("app", "page", "transactions")
    await expect.attr("app", "kinds", ["expense"])
    await expect.attr("app", "from", "2026-01-01")
    await expect.attr("app", "to", "2026-01-31")
}
