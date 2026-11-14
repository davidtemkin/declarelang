// 4. This year, "adobe", amount $20–$100 by keyboard alone: chips, summary,
//    breakdown and overview all agree.

const read = (drive, path, attr) => drive.page.evaluate((p, a) => {
    const v = window.__declare.find(p)[a]
    return v == null ? v : JSON.parse(JSON.stringify(v))
}, path, attr)

export default async ({ drive, expect, page }) => {
    await drive.waitReal(1500)
    await drive.settleData()
    await drive.set("app", "location", "transactions")

    // this year, from the date menu
    await drive.click("app.main.bar.dates.range")
    await drive.click('This year')
    await expect.attr("app", "preset", "this-year")

    // "/" goes to the search
    await drive.key("/")
    await drive.type("adobe")
    await drive.key("Tab")         // on, leaving the query (Escape would clear it)
    await expect.attr("app", "query", "adobe")

    // the amount: open the picker from the keyboard, and walk the handles
    await page.getByRole("button", { name: "Amount filter" }).focus()
    await drive.key("Enter")
    await drive.settleMotion()
    for (let i = 0; i < 3; i++) await drive.key("ArrowRight")     // $0 → $5 → $10 → $20
    await drive.key("Tab")
    for (let i = 0; i < 11; i++) await drive.key("ArrowLeft")     // no maximum → $100
    await drive.key("Escape")
    await drive.waitReal(800); await drive.settleData()
    await expect.attr("app", "minAmt", 2000)
    await expect.attr("app", "maxAmt", 10000)

    // the chips read as set
    await expect.text("app.main.chips", "Amount $20 – $100")
    await expect.text("app.main.chips", "“adobe”")
    await expect.text("app.main.chips", "Filtered")

    // the summary matches the rows
    const s = await read(drive, "app", "summary")
    const rows = await read(drive, "app", "rows")
    expect.equal(s.count, rows.length)
    expect.equal(s.net, rows.reduce((a, r) => a + r.inFilter, 0))
    if (rows.length == 0) throw new Error("nothing matched — expected some Adobe charges")

    // Insights → Breakdown shows only those, with the same total
    await drive.set("app", "location", "insights")
    await drive.set("app", "insightTab", "breakdown")
    await drive.waitReal(600); await drive.settleData()
    const agg = await read(drive, "app.catAgg", "value")
    expect.equal(agg.total.amount, s.out)
    expect.equal(agg.total.count, s.count)
    await expect.text("app.main.pages.insights.col.breakdown", "Software")

    // Overview says it is filtered
    await drive.set("app", "location", "overview")
    await expect.visible("app.main.chips.note")
}
