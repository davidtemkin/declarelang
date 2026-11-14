// 5. Uncategorised, select all, categorise as Other, undo with ⌘Z.
// 6. This month's expenses as a CSV whose total matches the summary.
// 7. A $30 monthly budget for Software, said in words.

const read = (drive, path, attr) => drive.page.evaluate((p, a) => {
    const v = window.__declare.find(p)[a]
    return v == null ? v : JSON.parse(JSON.stringify(v))
}, path, attr)

export default async ({ drive, expect, page }) => {
    await drive.waitReal(1500)
    await drive.settleData()
    await drive.set("app", "location", "transactions")

    // 5.
    await drive.page.evaluate(() => window.__declare.find("app").clearAll())
    await drive.click("app.main.bar.category")
    await drive.settleMotion()
    await page.getByRole("checkbox", { name: "Uncategorised" }).click()
    await drive.key("Escape")
    await drive.waitReal(800); await drive.settleData()
    const before = (await read(drive, "app", "summary")).count
    if (before == 0) throw new Error("nothing uncategorised to work with")
    await drive.click('app.main.pages.transactions.head.acts."Select all ' + before.toLocaleString("en-US") + '"')
    await expect.text("app.main.pages.transactions.bulk", "All " + before.toLocaleString("en-US") + " transactions matching the filters are selected")
    await drive.click("app.main.pages.transactions.bulk.bar.Categorise")
    await drive.click("Other")
    await drive.waitReal(1000); await drive.settleData()
    await expect.request("POST", "/api/transactions/bulk", { body: { action: "categorise", categoryId: "other" } })
    await expect.text("app.toast", "Categorised")
    await expect.text("app.toast", "Undo")
    const after = (await read(drive, "app", "summary")).count
    if (after >= before) throw new Error("categorising left " + after + " of " + before)
    await drive.key("Mod+Z")
    await drive.waitReal(1000); await drive.settleData()
    await expect.request("POST", /\/api\/changes\/.*\/undo/)
    expect.equal((await read(drive, "app", "summary")).count, before)

    // 6.
    await drive.page.evaluate(() => window.__declare.find("app").clearAll())
    await drive.click("app.main.bar.kind")
    await drive.click("Expenses")
    await drive.waitReal(800); await drive.settleData()
    const s = await read(drive, "app", "summary")
    const file = await drive.download(() => drive.click('app.main.pages.transactions.head.acts."Export as CSV"'))
    const lines = file.text.trim().split("\n").slice(1)
    expect.equal(lines.length, s.count)
    const total = lines.reduce((a, l) => a + Math.round(Number(l.split(",").pop()) * 100), 0)
    expect.equal(total, s.net)
    if (!/^t\d+,\d{4}-\d\d-\d\d,expense,/.test(lines[0])) throw new Error("unexpected CSV row: " + lines[0])

    // 7.
    await drive.page.evaluate(() => window.__declare.find("app").clearAll())
    await drive.set("app", "location", "budgets")
    await drive.waitReal(600); await drive.settleData()
    const has = (await read(drive, "app.budgets", "value")).budgets.some((b) => b.categoryId == "software")
    if (!has) {
        await drive.click("app.main.pages.budgets.col.1.body.add.newCat.entry")
        await drive.type("Software"); await drive.key("Enter")
        await drive.click("app.main.pages.budgets.col.1.body.add.newAmt")
        await drive.type("30"); await drive.key("Enter")
    } else {
        await drive.page.evaluate(() => window.__declare.find("app").writer.setBudget(window.__declare.find("app").budgetMonth, "software", 3000))
    }
    await drive.waitReal(800); await drive.settleData()
    const b = (await read(drive, "app.budgets", "value")).budgets.find((x) => x.categoryId == "software")
    expect.equal(b.amount, 3000)
    await expect.text("app.main.pages.budgets", "Software")
    const words = b.spent > 3000 ? "Over by" : "On track"
    await expect.text("app.main.pages.budgets", words)
}
