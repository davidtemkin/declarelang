// The rest of the brief, a behaviour at a time, on a presentation of its own.
//   npx declare-verify my-apps/presentify/presentify.declare \
//     --url http://127.0.0.1:8201/my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/more.mjs

export const device = { width: 1440, height: 900, touch: false }

export default async ({ drive, expect, page }) => {
    const app = (expr) => page.evaluate((e) => {
        const a = window.__declare.find("app")
        return JSON.parse(JSON.stringify(new Function("app", "return " + e)(a)) ?? "null")
    }, expr)
    const geo = () => app("({ s: app.canvas.s, ox: app.canvas.ox, oy: app.canvas.oy })")
    const stage = "app.editor.body.canvas.stage"
    const held = async (modifiers, fn) => {
        for (const m of modifiers ?? []) await page.keyboard.down(m)
        await fn()
        for (const m of modifiers ?? []) await page.keyboard.up(m)
    }
    const dragSlide = async (x0, y0, x1, y1, modifiers) => {
        const g = await geo()
        await held(modifiers, async () => {
            await drive.press(stage, g.ox + x0 * g.s, g.oy + y0 * g.s)
            for (let i = 0; i < 6; i++) await drive.moveBy((x1 - x0) * g.s / 6, (y1 - y0) * g.s / 6)
            await drive.release()
        })
    }
    const clickSlide = async (x, y, modifiers) => {
        const g = await geo()
        await held(modifiers, () => drive.clickAt(stage, g.ox + x * g.s, g.oy + y * g.s))
        await drive.wait(450)
    }
    // a handle, by its corner name, dragged by slide points
    const dragGrip = async (which, dx, dy, modifiers) => {
        const g = await geo()
        const i = await app(`app.canvas.chrome.childViews.findIndex((v) => v.which == '${which}' && v.visible)`)
        await held(modifiers, async () => {
            await drive.press(`app.editor.body.canvas.chrome.${i}`)
            for (let k = 0; k < 5; k++) await drive.moveBy(dx * g.s / 5, dy * g.s / 5)
            await drive.release()
        })
    }

    // a presentation of its own
    const id = await page.evaluate(async () => (await (await fetch("http://127.0.0.1:8360/api/decks", { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Behaviour check" }) })).json()).deck.id)
    await drive.set("app", "location", id)
    await drive.settleData()
    await drive.settleMotion()
    await expect.attr("app", "ready", true)

    // ── a rounded rectangle keeps its corners when made wider
    await drive.click("app.editor.top.tools.Rectangle")
    await dragSlide(100, 100, 400, 300)
    await drive.selectAll("app.editor.body.inspector.\"Corner radius\"")
    await drive.type("40")
    await drive.key("Enter")
    await drive.wait(50)
    await expect.equal(await app("app.els[0].cornerRadius"), 40)
    await dragGrip("r", 300, 0)
    await expect.equal(await app("app.els[0].width"), 600)
    await expect.equal(await app("app.els[0].cornerRadius"), 40)

    // the radius handle: drag it in, the corners round further
    await dragGrip("radius", 30, 30)
    await expect.equal(await app("app.els[0].cornerRadius"), 70)

    // ── shift keeps proportions while resizing; "keep proportions" keeps them always
    await dragGrip("rb", 120, 0, ["Shift"])
    const r1 = await app("app.els[0]")
    await expect.equal(Math.round(r1.width / r1.height * 100), 300)
    await drive.click("app.editor.body.inspector.\"Keep proportions\"")
    await expect.equal(await app("app.els[0].keepProportions"), true)
    await dragGrip("rb", -200, 0)
    const r2 = await app("app.els[0]")
    await expect.equal(Math.round(r2.width / r2.height * 100), 300)
    // …and shift lets it change them once
    await dragGrip("rb", 0, 60, ["Shift"])
    const r3 = await app("app.els[0]")
    await expect.equal(Math.round(r3.width / r3.height * 100) != 300, true)

    // ── a circle drawn with shift is round and keeps it
    await drive.click("app.editor.top.tools.Ellipse")
    await dragSlide(800, 100, 950, 180, ["Shift"])
    const c = await app("app.els[1]")
    await expect.equal(c.width, c.height)
    await expect.equal(c.keepProportions, true)

    // ── a line: a handle at each end
    await drive.click("app.editor.top.tools.Line")
    await dragSlide(100, 600, 500, 600)
    await expect.equal(await app("app.selected[0].kind"), "line")
    await dragGrip("b", 100, -100)
    const ln = await app("app.els[2]")
    await expect.equal([ln.x2, ln.y2], [600, 500])

    // ── arrow keys nudge by one, by ten with shift; a run of nudges is one undo step
    await clickSlide(300, 200)
    const x0 = await app("app.els[0].x")
    await drive.key("ArrowRight")
    await drive.key("ArrowRight")
    await drive.key("Shift+ArrowDown")
    await expect.equal(await app("app.els[0].x"), x0 + 2)
    await drive.key("Mod+Z")
    await expect.equal(await app("app.els[0].x"), x0)

    // ── order: send the rectangle to the back, bring it to the front
    await drive.click("app.editor.body.inspector.\"Send to back\"")
    await expect.equal(await app("app.els[0].kind"), "rect")
    await drive.click("app.editor.body.inspector.\"Bring to front\"")
    await expect.equal(await app("app.els[2].kind"), "rect")

    // ── copy, and paste on another slide, offset and selected
    await drive.key("Mod+C")
    await drive.click("app.editor.body.rail.head.\"New slide\"")
    await expect.equal(await app("app.doc.slides().length"), 2)
    await drive.key("Mod+V")
    await expect.equal(await app("app.els.length"), 1)
    await expect.equal(await app("app.sel.length"), 1)
    await expect.equal(await app("app.els[0].x"), r3.x + 16)

    // ── delete a slide; the last one can't be
    await drive.key("Escape")
    await drive.click("app.editor.top.left.row.menus.Slide")
    await drive.click("\"Delete slide\"")
    await expect.equal(await app("app.doc.slides().length"), 1)
    await drive.click("app.editor.top.left.row.menus.Slide")
    await drive.click("\"Delete slide\"")
    await expect.equal(await app("app.doc.slides().length"), 1)
    await drive.key("Escape")

    // ── empty text boxes go away when editing ends
    await drive.click("app.editor.top.tools.Text")
    await clickSlide(700, 400)
    await expect.equal(await app("app.editingId != ''"), true)
    await drive.key("Escape")
    await expect.equal(await app("app.els.some((e) => e.kind == 'text')"), false)

    // ── saving: changes reach the service; when it can't be reached the window says so, and catches up
    await drive.waitReal(1500)
    await drive.settleData()
    await expect.attr("app.sync", "status", "All changes saved")
    await drive.set("app", "api", "http://127.0.0.1:9")
    await clickSlide(300, 200)
    await drive.key("ArrowLeft")
    await drive.waitReal(1500)
    await drive.settleData()
    await expect.attr("app.sync", "status", "Not saved: can't reach the service")
    await drive.set("app", "api", "http://127.0.0.1:8360")
    await drive.waitReal(4000)
    await drive.settleData()
    await expect.attr("app.sync", "status", "All changes saved")
    const served = await page.evaluate(async (d) => (await (await fetch("http://127.0.0.1:8360/api/decks/" + d + "/slides")).json()).slides, id)
    await expect.equal(served[0].elements.find((e) => e.kind == "rect").x, x0 - 1)

    // ── ⌘S saves at once
    await drive.key("ArrowLeft")
    await drive.key("Mod+S")
    await drive.wait(50)
    await expect.request("PUT", "/api/slides/")

    // ── back to the presentations; rename and delete from there, asked first
    await drive.click("app.editor.top.home")
    await drive.settleData()
    await drive.settleMotion()
    await expect.attr("app", "inEditor", false)
    await drive.set("app", "menuDeck", id)
    await page.evaluate(() => window.__declare.find("app").renameBox.show())
    await drive.wait(300)
    await drive.selectAll("app.renameBox.field")
    await drive.type("Checked behaviour")
    await drive.key("Enter")
    await drive.settleData()
    await expect.equal(await app(`app.library.byId('${id}').title`), "Checked behaviour")
    await page.evaluate(() => window.__declare.find("app").confirmDelete.show())
    await drive.wait(300)
    await expect.text("app.confirmDelete", "can’t be undone")
    await drive.click("app.confirmDelete.Delete")
    await drive.settleData()
    await expect.equal(await app(`app.library.byId('${id}')`), null)
}
