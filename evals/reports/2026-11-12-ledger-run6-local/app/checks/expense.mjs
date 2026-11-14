// 2. A $120 expense from a new vendor, split; saving waits until nothing remains.

const read = (drive, path, attr) => drive.page.evaluate((p, a) => {
    const v = window.__declare.find(p)[a]
    return v == null ? v : JSON.parse(JSON.stringify(v))
}, path, attr)

export default async ({ drive, expect, page }) => {
    await drive.waitReal(1500)
    await drive.settleData()
    const vendor = "Printworks " + Date.now().toString(36).slice(-4)

    await drive.key("e")                                  // the key for a new expense
    await drive.settleMotion()
    const F = "app.editor.form.body.expense"
    await drive.type("120")                              // the amount field has the focus
    await drive.click(F + ".1.vendorBox.entry")
    await drive.type(vendor)
    await drive.key("Enter")                             // "Add “Printworks …”"
    await drive.waitReal(600); await drive.settleData()
    await expect.text("app.editor.form", vendor)

    await drive.click(F + ".2.catRow.Split")
    const L = F + ".splitBox.list"
    await drive.click(L + ".0.row.cat.entry"); await drive.type("Stock"); await drive.key("Enter")
    await drive.click(L + ".0.row.amt"); await drive.type("90")
    await drive.click(L + ".1.row.cat.entry"); await drive.type("Shipping"); await drive.key("Enter")
    await drive.click(L + ".1.row.amt"); await drive.type("20")
    await drive.click("app.editor.form.foot.Save")
    await drive.settleMotion()
    await expect.text("app.editor.form", "Remaining to allocate: $10.00")
    await expect.attr("app", "editing", true)

    await drive.click(F + '.splitBox."Add a part"')
    await drive.click(L + ".2.row.cat.entry"); await drive.type("Packag"); await drive.key("Enter")
    await expect.text("app.editor.form", "Remaining to allocate: $0.00")
    await drive.click("app.editor.form.foot.Save")
    await drive.waitReal(800); await drive.settleData(); await drive.settleMotion()
    await expect.attr("app", "editing", false)
    await expect.request("POST", "/api/transactions", { body: { kind: "expense", amount: 12000 } })

    // it is in the list at once
    const rows = await read(drive, "app", "rows")
    const mine = rows.find((r) => r.contactName == vendor)
    if (mine == null) throw new Error("the new expense isn't in the list")
    expect.equal(mine.amount, 12000)
    expect.equal(mine.split.parts, 3)
}
