// On a phone: open Overview, then record an expense with the thumb.
export const device = { width: 390, height: 844, touch: true }

export default async ({ drive, expect, page }) => {
    await drive.waitReal(1500)
    await drive.settleData()
    await expect.attr("app", "page", "overview")
    await expect.text("app.main.pages.overview.col.figures", "Net profit")
    await drive.click("app.main.tabs.add")
    await drive.click("New expense")
    await drive.settleMotion()
    await drive.type("18.50")
    await drive.click("app.editor.form.body.expense.1.vendorBox.entry")
    await drive.type("Adobe")
    await drive.click('Adobe')
    await expect.text("app.editor.form.body.expense", "Software")        // the vendor's usual category
    await drive.click("app.editor.form.foot.Save")
    await drive.waitReal(800); await drive.settleData(); await drive.settleMotion()
    await expect.attr("app", "editing", false)
    await expect.request("POST", "/api/transactions", { body: { kind: "expense", amount: 1850, categoryId: "software" } })
    await expect.text("app.toast", "Expense of $18.50 recorded")
}
