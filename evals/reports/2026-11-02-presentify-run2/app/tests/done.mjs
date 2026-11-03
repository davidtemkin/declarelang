// The brief's "what done looks like", driven as a person would.
// Run: npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/done.mjs
export const device = { width: 1440, height: 900, touch: false }

export default async ({ drive, expect, page }) => {
  const app = (expr) => page.evaluate((e) => {
    const a = __declare.find("app")
    return new Function("app", "return (" + e + ")")(a)
  }, expr)
  const settle = async () => { await drive.settleData(); await drive.settleMotion(); await drive.wait(50) }
  // a slide point → the stage surface's own coordinates
  const at = async (x, y) => {
    const g = await app("({ ox: app.stage.ox, oy: app.stage.oy, k: app.stage.k })")
    return [g.ox + x * g.k, g.oy + y * g.k, g.k]
  }
  const clickSlide = async (x, y) => { const [sx, sy] = await at(x, y); await drive.clickAt("app.stage.surface", sx, sy) }
  const dragSlide = async (x, y, dx, dy) => {
    const [sx, sy, k] = await at(x, y)
    await drive.press("app.stage.surface", sx, sy)
    await drive.moveBy(dx * k / 2, dy * k / 2)
    await drive.moveBy(dx * k / 2, dy * k / 2)
    await drive.release()
  }
  const shift = async (fn) => { await page.keyboard.down("Shift"); await fn(); await page.keyboard.up("Shift") }

  await settle()
  // ── A new presentation called "Quarterly review"
  await drive.click('app.home.bar."New presentation"')
  await settle()
  await expect.attr("app", "editorShown", true)
  await drive.selectAll("app.topBar.titleField")
  await drive.type("Quarterly review")
  await drive.key("Enter")
  await settle()
  await expect.equal(await app("app.doc.slides().length"), 1)

  // ── A dark rectangle across the top
  await drive.click('app.topBar.tools.Rectangle')
  await dragSlide(0, 0, 1280, 200)
  await settle()
  await expect.equal(await app("app.els.length"), 1)
  await expect.equal(await app("app.els[0].width"), 1280)
  await drive.click('app.editorFrame.body.inspector.fillBox.1."Fill colour"')
  await settle()
  await drive.click('app.picker."#1E1A2B"')
  await drive.key("Escape")
  await settle()
  await expect.equal(await app("app.els[0].fill"), "#1E1A2B")

  // ── A title typed into it, white, centred, 48 point
  await drive.click('app.topBar.tools.Text')
  await dragSlide(140, 60, 1000, 60)
  await settle()
  await expect.equal(await app("app.editingId != ''"), true)
  await drive.type("Quarterly review")
  await drive.key("Escape")
  await settle()
  await expect.equal(await app("app.els[1].text.content"), "Quarterly review")
  if (process.env.SHOTS) await page.screenshot({ path: "/tmp/pf/s1-title.png" })
  await expect.equal(await app("app.sel.length"), 1)
  await drive.click('app.editorFrame.body.inspector.textBox."Text colour"')
  await settle()
  await drive.click('app.picker."#FFFFFF"')
  await drive.key("Escape")
  await settle()
  await drive.click('app.editorFrame.body.inspector.textBox.Alignment.Centre')
  await drive.selectAll('app.editorFrame.body.inspector.textBox."Font size"')
  await drive.type("48")
  await drive.key("Enter")
  await settle()
  const title = await app("app.els[1].text")
  await expect.equal([title.color, title.align, title.size], ["#FFFFFF", "center", 48])

  // ── Three text boxes side by side; tops aligned; spread evenly
  const words = ["Revenue", "Customers", "Hiring"]
  const xs = [100, 520, 860]
  const ys = [300, 330, 310]
  for (let i = 0; i < 3; i++) {
    await drive.click('app.topBar.tools.Text')
    await clickSlide(xs[i] + 20, ys[i] + 20)
    await settle()
    await drive.type(words[i])
    await drive.key("Escape")
    await settle()
  }
  await expect.equal(await app("app.els.length"), 5)
  const ids = await app("app.els.slice(2).map((e) => e.id)")
  await drive.key("Escape")
  await clickSlide(xs[0] + 40, ys[0] + 30)
  await shift(async () => { await clickSlide(xs[1] + 40, ys[1] + 30); await clickSlide(xs[2] + 40, ys[2] + 30) })
  await settle()
  await expect.equal((await app("app.sel")).length, 3)
  await drive.click('app.editorFrame.body.inspector.arrangeBox.row1."Align tops"')
  await drive.click('app.editorFrame.body.inspector.arrangeBox.row2."Distribute across"')
  await settle()
  if (process.env.SHOTS) await page.screenshot({ path: "/tmp/pf/s2-three.png" })
  const tops = await app("app.els.slice(2).map((e) => e.y)")
  await expect.equal(new Set(tops).size, 1)

  // ── A circle and a label, grouped, moved — and undone, twice
  await drive.key("Escape")
  await drive.click('app.topBar.tools.Ellipse')
  await shift(async () => { await dragSlide(560, 480, 160, 120) })
  await settle()
  const circle = await app("app.els[app.els.length - 1]")
  await expect.equal([circle.width == circle.height, circle.keepProportions], [true, true])
  await drive.click('app.topBar.tools.Text')
  await clickSlide(760, 540)
  await settle()
  await drive.type("Growth")
  await drive.key("Escape")
  await settle()
  await clickSlide(640, 560)
  await shift(async () => { await clickSlide(790, 555) })
  await settle()
  await expect.equal((await app("app.sel")).length, 2)
  await drive.key("Meta+G")
  await settle()
  await expect.equal(await app("app.els[app.els.length - 1].kind"), "group")
  if (process.env.SHOTS) await page.screenshot({ path: "/tmp/pf/s3-group.png" })
  const before = await app("JSON.stringify(app.els)")
  await dragSlide(640, 560, -300, 40)
  await settle()
  await expect.equal(await app("app.els[app.els.length - 1].kind"), "group")
  await drive.click('app.topBar.Undo')
  await settle()
  await expect.equal(await app("JSON.stringify(app.els)"), before)
  await drive.click('app.topBar.Undo')
  await settle()
  await expect.equal(await app("app.els.some((e) => e.kind == 'group')"), false)
  await expect.equal((await app("app.sel")).length, 2)

  // ── Duplicate the slide, change the title, drag the copy above the original
  await drive.key("Escape")
  await drive.key("Shift+Meta+D")
  await settle()
  await expect.equal(await app("app.doc.slides().length"), 2)
  await expect.equal(await app("app.curIndex"), 1)
  const [tx, ty] = await at(640, 90)
  const o = await app("app.stage.surface.rootOrigin()")
  await page.mouse.click(o.x + tx, o.y + ty, { clickCount: 2, count: 2 })
  await settle()
  await expect.equal(await app("app.editingId != ''"), true)
  await drive.selectAll("app.stage.typing.field")
  await drive.type("Quarterly review — draft")
  await drive.key("Escape")
  await settle()
  await expect.equal(await app("app.els[1].text.content"), "Quarterly review — draft")
  const copy = await app("app.cur")
  await drive.press("app.slideList.list.1", 100, 50)
  await drive.moveBy(0, -40)
  await drive.moveBy(0, -80)
  await drive.release()
  await settle()
  await expect.equal(await app("app.doc.slides()[0].id"), copy)

  // ── Present from the start; the arrows go through
  await drive.key("Shift+Alt+Meta+P")
  await settle()
  await expect.attr("app", "presenting", true)
  if (process.env.SHOTS) await page.screenshot({ path: "/tmp/pf/s4-present.png" })
  await expect.equal(await app("app.showAt"), 0)
  await drive.key("ArrowRight")
  await expect.equal(await app("app.showAt"), 1)
  await drive.key("Escape")
  await settle()
  await expect.attr("app", "presenting", false)
  await expect.equal(await app("app.curIndex"), 1)

  // ── Every change saved, without asking
  await drive.wait(2500)
  await settle()
  await drive.wait(1500)
  await settle()
  await expect.equal(await app("app.saver.status"), "saved")
  const deckId = await app("app.saver.deckId")
  const served = await page.evaluate(async (id) => (await (await fetch("http://127.0.0.1:8360/api/decks/" + id + "/slides")).json()), deckId)
  await expect.equal(served.slides.length, 2)
  await expect.equal(served.slides[0].elements[1].text.content, "Quarterly review — draft")

  // ── Meanwhile a colleague edits the second slide in another window
  const second = served.slides[1]
  const theirs = { version: second.version, background: "#FFE6DF", elements: second.elements }
  await page.evaluate(async ([sid, body]) => fetch("http://127.0.0.1:8360/api/slides/" + sid,
    { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), [second.id, theirs])
  await drive.click("app.slideList.list.1")
  await drive.wait(600)
  await settle()
  await expect.visible("app.editorFrame.body.center.conflict")
  if (process.env.SHOTS) await page.screenshot({ path: "/tmp/pf/s5-conflict.png" })
  await drive.click('app.editorFrame.body.center.conflict."Use their version"')
  await settle()
  await expect.equal(await app("app.curSlide.background"), "#FFE6DF")
  await expect.hidden("app.editorFrame.body.center.conflict")
  await drive.wait(1500)
  await settle()
  await expect.equal(await app("app.saver.status"), "saved")

  // tidy: remove the deck this made
  await page.evaluate(async (id) => fetch("http://127.0.0.1:8360/api/decks/" + id, { method: "DELETE" }), deckId)
}
