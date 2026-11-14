// Editing in place: Enter on a cell edits it, Enter saves, Escape cancels;
// a category is chosen by typing part of its name; ⌘Z takes it back.

const read = (drive, path, attr) => drive.page.evaluate((p, a) => {
    const v = window.__declare.find(p)[a]
    return v == null ? v : JSON.parse(JSON.stringify(v))
}, path, attr)

export default async ({ drive, expect, page }) => {
    await drive.waitReal(1500)
    await drive.settleData()
    await drive.set("app", "location", "transactions")
    await drive.set("app", "kinds", ["expense"])
    await drive.set("app", "cats", ["software"])          // one category each: a split edits its parts in the detail
    await drive.waitReal(500); await drive.settleData()
    const G = "app.main.pages.transactions.body.listArea.grid"
    const first = (await read(drive, "app", "rows"))[0]

    // the first row, by keyboard: focus the grid, move to Description, edit
    await page.getByRole("grid", { name: "Transactions" }).focus()
    await drive.key("ArrowDown")
    await expect.text("app.main.pages.transactions.head.summary", "1 of")      // one selected
    await expect.visible("app.main.pages.transactions.body.detail")          // its detail beside
    await drive.key("ArrowRight")
    await drive.key("Enter")
    await drive.key("Mod+A")
    await drive.type("Changed in place")
    await drive.key("Escape")                                                 // cancels
    await drive.waitReal(300)
    expect.equal((await read(drive, "app", "rows"))[0].description, first.description)

    await drive.key("Enter")
    await drive.key("Mod+A")
    await drive.type("Changed in place")
    await drive.key("Enter")                                                  // saves
    await drive.waitReal(800); await drive.settleData()
    await expect.request("PATCH", "/api/transactions/" + first.id, { body: { description: "Changed in place" } })
    expect.equal((await read(drive, "app", "rows"))[0].description, "Changed in place")

    // undo puts it back
    await drive.key("Mod+Z")
    await drive.waitReal(800); await drive.settleData()
    expect.equal((await read(drive, "app", "rows"))[0].description, first.description)

    // the category: typed, picked with Enter
    await page.getByRole("grid", { name: "Transactions" }).focus()
    await drive.key("ArrowRight")
    await drive.key("Enter")
    await drive.type("Advert")
    await drive.key("Enter")
    await drive.waitReal(800); await drive.settleData()
    await expect.request("PATCH", "/api/transactions/" + first.id, { body: { categoryId: "advertising" } })
    await drive.key("Mod+Z")
    await drive.waitReal(800); await drive.settleData()
    expect.equal((await read(drive, "app", "rows"))[0].categoryId ?? null, first.categoryId ?? null)
}
