// 3. A sale at the Market — two mugs and a print — then one mug refunded.

const read = (drive, path, attr) => drive.page.evaluate((p, a) => {
    const v = window.__declare.find(p)[a]
    return v == null ? v : JSON.parse(JSON.stringify(v))
}, path, attr)

export default async ({ drive, expect, page }) => {
    await drive.waitReal(1500)
    await drive.settleData()
    await drive.key("s")
    await drive.settleMotion()
    const S = "app.editor.form.body.sale"
    await drive.click(S + '.0.Market')
    await drive.click(S + '.tiles."Add Speckled mug, $32.00"')
    await drive.click(S + '.tiles."Add Speckled mug, $32.00"')
    await drive.click(S + '.tiles."Add Art print A4, $24.00"')
    await expect.text("app.editor.form.top.total", "$88.00")
    await drive.click("app.editor.form.foot.Save")
    await drive.waitReal(800); await drive.settleData(); await drive.settleMotion()
    await expect.attr("app", "editing", false)

    // open it in Transactions: the newest market sale of $88.00
    await drive.set("app", "location", "transactions")
    await drive.waitReal(600); await drive.settleData()
    const rows = await read(drive, "app", "rows")
    const sale = rows.find((r) => r.kind == "sale" && r.amount == 8800 && r.channel == "market" && (r.refunded ?? 0) == 0)
    if (sale == null) throw new Error("the sale isn't in the list")
    await drive.page.evaluate((r) => window.__declare.find("app").showTxn(r), sale)
    await drive.waitReal(600); await drive.settleData()
    await expect.text("app.main.pages.transactions.body.detail", "Cost $")
    await expect.text("app.main.pages.transactions.body.detail", "Margin $")

    await drive.click('app.main.pages.transactions.body.detail.col.body.acts."Refund…"')
    await drive.waitReal(800); await drive.settleData(); await drive.settleMotion()
    await drive.click('app.editor.form.body.refund.lines.0.row.qty._more')
    await expect.text("app.editor.form.top.total", "$32.00")
    await drive.click("app.editor.form.foot.Save")
    await drive.waitReal(800); await drive.settleData(); await drive.settleMotion()
    await expect.attr("app", "editing", false)
    await drive.waitReal(600); await drive.settleData()
    await expect.text("app.main.pages.transactions.body.detail", "Refunded $32.00")
    await expect.text("app.main.pages.transactions.body.detail", "1 refunded")
}
