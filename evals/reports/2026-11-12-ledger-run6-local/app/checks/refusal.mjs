// When the service refuses a save, the editor stays open with everything typed,
// and the message lands at the field it concerns.

const read = (drive, path, attr) => drive.page.evaluate((p, a) => {
    const v = window.__declare.find(p)[a]
    return v == null ? v : JSON.parse(JSON.stringify(v))
}, path, attr)

export default async ({ drive, expect, page }) => {
    await drive.waitReal(1500); await drive.settleData()
    // a sale of one mug, recorded through the service directly
    const sale = await drive.page.evaluate(async (base) => {
        const r = await fetch(base + "/api/transactions", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind: "sale", date: new Date().toISOString().slice(0, 10), channel: "market", lines: [{ productId: "tall-mug", quantity: 1 }] }) })
        return (await r.json()).transaction
    }, "http://127.0.0.1:8370")
    await drive.page.evaluate((id) => window.__declare.find("app").startRefund(id), sale.id)
    await drive.waitReal(800); await drive.settleData(); await drive.settleMotion()
    await drive.click('app.editor.form.body.refund.lines.0.row.qty._more')
    // meanwhile the mug is refunded elsewhere
    await drive.page.evaluate(async (a) => {
        await fetch(a.base + "/api/transactions", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind: "refund", date: a.date, refundOf: a.id, lines: [{ saleLineId: a.line, quantity: 1 }] }) })
    }, { base: "http://127.0.0.1:8370", id: sale.id, line: sale.lines[0].id, date: sale.date })
    await drive.click("app.editor.form.foot.Save")
    await drive.waitReal(800); await drive.settleData(); await drive.settleMotion()
    await expect.attr("app", "editing", true)
    await expect.text("app.editor.form.body.refund.lines.0", "Refund exceeds the original sale")
    await expect.text("app.editor.form.top.total", "$36.00")      // what was chosen is still there
}
