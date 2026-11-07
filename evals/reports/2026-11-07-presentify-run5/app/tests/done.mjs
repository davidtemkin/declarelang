// The brief's "what done looks like", as a person would do it, against the
// running service. Run with:
//   npx declare-verify my-apps/presentify/presentify.declare \
//     --url http://127.0.0.1:8201/my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/done.mjs
//
// It makes a new presentation each run (the service remembers), so it never
// depends on what an earlier run left behind.

export const device = { width: 1440, height: 900, touch: false }

export default async ({ drive, expect, page }) => {
    const app = (expr) => page.evaluate((e) => {
        const a = window.__declare.find("app")
        return JSON.parse(JSON.stringify(new Function("app", "return " + e)(a)))
    }, expr)
    const geo = () => app("({ s: app.canvas.s, ox: app.canvas.ox, oy: app.canvas.oy })")
    const stage = "app.editor.body.canvas.stage"
    // a press at a slide point, a drag to another, a step at a time
    const held = async (modifiers, fn) => {
        for (const m of modifiers ?? []) await page.keyboard.down(m)
        await fn()
        for (const m of modifiers ?? []) await page.keyboard.up(m)
    }
    const dragSlide = async (x0, y0, x1, y1, modifiers) => {
        const g = await geo()
        await held(modifiers, async () => {
            await drive.press(stage, g.ox + x0 * g.s, g.oy + y0 * g.s)
            const steps = 6
            for (let i = 0; i < steps; i++) await drive.moveBy((x1 - x0) * g.s / steps, (y1 - y0) * g.s / steps)
            await drive.release()
        })
    }
    const clickSlide = async (x, y, opts) => {
        const g = await geo()
        await held(opts?.modifiers, () => drive.clickAt(stage, g.ox + x * g.s, g.oy + y * g.s))
        await drive.wait(450)
    }

    // ── a new presentation called "Quarterly review"
    await drive.settleData()
    await drive.click("app.home.bar.\"New presentation\"")
    await drive.settleData()
    await drive.settleMotion()
    await expect.attr("app", "ready", true)
    await drive.type("Quarterly review")
    await drive.key("Enter")
    await drive.wait(100)
    await expect.equal(await app("app.doc.title()"), "Quarterly review")
    await expect.equal(await app("app.doc.slides().length"), 1)

    // ── a dark rectangle across the top
    await drive.click("app.editor.top.tools.Rectangle")
    await dragSlide(0, 0, 1280, 200)
    await expect.equal(await app("app.els.length"), 1)
    await drive.selectAll("app.editor.body.inspector.\"Fill hex value\"")
    await drive.type("#1A1830")
    await drive.key("Enter")
    await drive.wait(50)
    await expect.equal(await app("app.els[0].fill"), "#1A1830")

    // ── a title in it, white, centred, 48 point
    await drive.click("app.editor.top.tools.Text")
    await dragSlide(140, 60, 1140, 120)
    await drive.wait(50)
    await drive.type("Quarterly review")
    await drive.key("Escape")
    await drive.wait(50)
    const title = await app("app.els[1]")
    await expect.equal(title.text.content, "Quarterly review")
    await expect.equal(await app("app.sel.length"), 1)
    await drive.click("app.editor.body.inspector.\"Align centre\"")
    await drive.wait(50)
    await expect.equal(await app("app.els[1].text.align"), "center")
    await expect.equal(await app("app.els[1].text.color"), "#FFFFFF")
    await drive.selectAll("app.editor.body.inspector.\"Text size\"")
    await drive.type("48")
    await drive.key("Enter")
    await drive.wait(50)
    await expect.equal(await app("app.els[1].text.size"), 48)

    // ── three text boxes side by side, tops aligned, evenly spaced
    for (const [x, y, w] of [[100, 300, 280], [470, 330, 300], [900, 290, 260]]) {
        await drive.click("app.editor.top.tools.Text")
        await dragSlide(x, y, x + w, y + 40)
        await drive.type("Point at " + x)
        await drive.key("Escape")
        await drive.wait(30)
    }
    await expect.equal(await app("app.els.length"), 5)
    await clickSlide(110, 310)
    await clickSlide(480, 340, { modifiers: ["Shift"] })
    await clickSlide(910, 300, { modifiers: ["Shift"] })
    await expect.equal(await app("app.sel.length"), 3)
    await drive.click("app.editor.body.inspector.\"Align tops\"")
    await drive.click("app.editor.body.inspector.\"Distribute across\"")
    const tops = await app("app.els.slice(2).map((e) => e.y)")
    await expect.equal(new Set(tops).size, 1)

    // ── a circle and a label, grouped, moved, and the move undone twice
    await drive.key("Escape")
    await drive.click("app.editor.top.tools.Ellipse")
    await dragSlide(560, 480, 680, 600, ["Shift"])
    await drive.click("app.editor.top.tools.Text")
    await dragSlide(700, 520, 900, 560)
    await drive.type("Label")
    await drive.key("Escape")
    await clickSlide(620, 540)
    await clickSlide(720, 530, { modifiers: ["Shift"] })
    await expect.equal(await app("app.sel.length"), 2)
    await drive.key("Mod+G")
    await expect.equal(await app("app.selected[0].kind"), "group")
    const before = await app("app.selBox")
    await dragSlide(620, 540, 520, 440)
    const after = await app("app.selBox")
    await expect.equal(Math.round(after.x), Math.round(before.x - 100))
    await drive.key("Mod+Z")
    await expect.equal(Math.round((await app("app.selBox")).x), Math.round(before.x))
    await drive.key("Mod+Z")
    await expect.equal(await app("app.els.some((e) => e.kind == 'group')"), false)

    // ── duplicate the slide, change its title, drag it above the original
    await drive.click("app.editor.top.left.row.menus.Slide")
    await drive.click("\"Duplicate slide\"")
    await expect.equal(await app("app.doc.slides().length"), 2)
    await expect.equal(await app("app.index"), 1)
    const t = await app("app.els.find((e) => e.kind == 'text').id")
    const tb = await app(`(() => { const e = app.els.find((x) => x.id == '${t}'); return { x: e.x + 20, y: e.y + 20 } })()`)
    await clickSlide(tb.x, tb.y)
    await drive.dblclick(stage, (await geo()).ox + tb.x * (await geo()).s, (await geo()).oy + tb.y * (await geo()).s)
    await drive.wait(50)
    await expect.equal(await app("app.editingId != ''"), true)
    await drive.key("Mod+A")
    await drive.type("Second take")
    await drive.key("Escape")
    await expect.equal(await app(`app.els.find((e) => e.id == '${t}').text.content`), "Second take")
    await drive.press("app.editor.body.rail.list.content.1", 100, 40)
    for (let i = 0; i < 6; i++) await drive.moveBy(0, -20)
    await drive.release()
    await drive.settleMotion()
    await expect.equal(await app("app.doc.slides()[0].elements.some((e) => e.text && e.text.content == 'Second take')"), true)

    // ── present from the start; the arrows take them through
    await drive.click("app.editor.top.left.row.menus.File")
    await drive.click("\"Present from start\"")
    await expect.attr("app", "presenting", true)
    await expect.attr("app", "presentAt", 0)
    await drive.key("ArrowRight")
    await expect.attr("app", "presentAt", 1)
    await drive.key("ArrowLeft")
    await drive.key("ArrowRight")
    await drive.key("Escape")
    await expect.attr("app", "presenting", false)
    await expect.attr("app", "index", 1)

    // ── everything saved without asking
    await drive.waitReal(2500)
    await drive.settleData()
    await expect.attr("app.sync", "status", "All changes saved")
    const deck = await app("app.doc.deckId")
    const served = await page.evaluate(async (d) => (await (await fetch("http://127.0.0.1:8360/api/decks/" + d + "/slides")).json()).slides, deck)
    await expect.equal(served.length, 2)
    await expect.equal(served[0].elements.some((e) => e.text && e.text.content == "Second take"), true)
    await expect.equal(served[1].elements[1].text.size > 0, true)

    // ── meanwhile a colleague changed the second slide in another window
    const s2 = served[1]
    await page.evaluate(async (s) => {
        await fetch("http://127.0.0.1:8360/api/slides/" + s.id, { method: "PUT", headers: { "content-type": "application/json" },
            body: JSON.stringify({ version: s.version, background: "#FFE1D9", elements: s.elements }) })
    }, s2)
    await drive.click("app.editor.body.rail.list.content.0")
    await drive.click("app.editor.body.rail.list.content.1")
    await drive.settleData()
    await expect.visible("app.editor.body.canvas.banner")
    await expect.text("app.editor.body.canvas.banner", "changed in another window")
    await drive.click("app.editor.body.canvas.banner.\"Use their version\"")
    await expect.equal(await app("app.slideBackground"), "#FFE1D9")
    await expect.hidden("app.editor.body.canvas.banner")
    await drive.waitReal(2000)
    await drive.settleData()
    await expect.attr("app.sync", "status", "All changes saved")
}
