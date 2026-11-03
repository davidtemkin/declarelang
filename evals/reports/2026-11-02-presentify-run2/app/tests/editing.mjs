// Direct manipulation, the clipboard, the keyboard, saving offline, and the gallery.
// Run: npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/editing.mjs
export const device = { width: 1440, height: 900, touch: false }

export default async ({ drive, expect, page }) => {
  const app = (expr) => page.evaluate((e) => new Function("app", "return (" + e + ")")(__declare.find("app")), expr)
  const settle = async () => { await drive.settleData(); await drive.settleMotion(); await drive.wait(50) }
  const geo = async () => app("({ ox: app.stage.ox, oy: app.stage.oy, k: app.stage.k })")
  const press = async (x, y) => { const g = await geo(); await drive.press("app.stage.surface", g.ox + x * g.k, g.oy + y * g.k) }
  const clickSlide = async (x, y) => { const g = await geo(); await drive.clickAt("app.stage.surface", g.ox + x * g.k, g.oy + y * g.k) }
  const moveSlide = async (dx, dy) => { const g = await geo(); await drive.moveBy(dx * g.k, dy * g.k) }
  const shift = async (fn) => { await page.keyboard.down("Shift"); await fn(); await page.keyboard.up("Shift") }
  const handle = async (which) => {
    const i = { lt: 0, t: 1, rt: 2, r: 3, rb: 4, b: 5, lb: 6, l: 7, end1: 8, end2: 9 }[which]
    return which == "radius" ? "app.stage.handles.radius" : "app.stage.handles." + i
  }

  await settle()
  await drive.click('app.home.bar."New presentation"')
  await settle()
  await drive.selectAll("app.topBar.titleField")
  await drive.type("Presentify test deck")
  await drive.key("Enter")

  // ── a rounded rectangle keeps its corners when made wider
  await drive.key("R")
  await press(200, 200); await moveSlide(150, 100); await moveSlide(150, 100); await drive.release()
  await settle()
  await expect.equal(await app("[app.els[0].width, app.els[0].height]"), [300, 200])
  await drive.press(await handle("radius")); await drive.moveBy(30, 30); await drive.release()
  await settle()
  const r = await app("app.els[0].cornerRadius")
  await expect.equal(r > 20 && r <= 100, true)
  await drive.press(await handle("r")); await drive.moveBy(130, 0); await drive.release()
  await settle()
  await expect.equal(await app("app.els[0].cornerRadius"), r)
  await expect.equal(await app("app.els[0].width > 450"), true)
  await expect.equal(await app("app.els[0].height"), 200)

  // ── shift while resizing keeps proportions; "Keep proportions" then keeps them always
  const ratio = await app("app.els[0].width / app.els[0].height")
  await shift(async () => { await drive.press(await handle("rb")); await drive.moveBy(60, 10); await drive.release() })
  await settle()
  await expect.approx("app", "zoom", 1, 0.01)
  const ratio2 = await app("app.els[0].width / app.els[0].height")
  await expect.equal(Math.abs(ratio2 - ratio) < 0.01, true)
  await drive.click('app.editorFrame.body.inspector.keepBox."Keep proportions"')
  await settle()
  await expect.equal(await app("app.els[0].keepProportions"), true)
  await drive.press(await handle("rb")); await drive.moveBy(-80, 0); await drive.release()
  await settle()
  await expect.equal(Math.abs(await app("app.els[0].width / app.els[0].height") - ratio) < 0.01, true)
  // shift lets it change them, once
  await shift(async () => { await drive.press(await handle("b")); await drive.moveBy(0, 40); await drive.release() })
  await settle()
  await expect.equal(Math.abs(await app("app.els[0].width / app.els[0].height") - ratio) > 0.05, true)

  // ── arrows nudge by one, by ten with shift; one undo puts it back
  const x0 = await app("app.els[0].x")
  await drive.key("ArrowRight")
  await drive.key("Shift+ArrowRight")
  await settle()
  await expect.equal(await app("app.els[0].x"), x0 + 11)
  await drive.key("Meta+Z")
  await settle()
  await expect.equal(await app("app.els[0].x"), x0 + 1)
  await drive.key("Shift+Meta+Z")
  await settle()
  await expect.equal(await app("app.els[0].x"), x0 + 11)

  // ── a line, drawn with shift, lies at 45° steps; its ends are its handles
  await drive.key("L")
  await shift(async () => { await press(100, 600); await moveSlide(200, 10); await moveSlide(200, 10); await drive.release() })
  await settle()
  const line = await app("app.els[app.els.length - 1]")
  await expect.equal([line.kind, line.y1 == line.y2], ["line", true])
  await drive.press(await handle("end2")); await drive.moveBy(0, -40); await drive.release()
  await settle()
  await expect.equal(await app("app.els[app.els.length - 1].y2 < app.els[app.els.length - 1].y1"), true)

  // ── copy, then paste onto another slide: offset, selected
  await clickSlide(400, 250)
  await settle()
  await drive.key("Meta+C")
  await drive.click('app.slideList.head."New slide after this one"')
  await settle()
  await expect.equal(await app("app.doc.slides().length"), 2)
  await drive.click("app.stage.surface")
  await drive.key("Meta+V")
  await settle()
  await expect.equal(await app("app.els.length"), 1)
  await expect.equal(await app("app.sel.length"), 1)
  await drive.key("Meta+D")
  await settle()
  await expect.equal(await app("app.els.length"), 2)
  await expect.equal(await app("app.els[1].x - app.els[0].x"), 24)
  await drive.key("Backspace")
  await settle()
  await expect.equal(await app("app.els.length"), 1)

  // ── the keyboard moves through the slide list
  await drive.click("app.slideList.list.0")
  await drive.key("ArrowDown")
  await settle()
  await expect.equal(await app("app.curIndex"), 1)
  await drive.key("ArrowUp")
  await settle()
  await expect.equal(await app("app.curIndex"), 0)

  // ── no service: the work is kept, the window says so, and it saves when it can
  await drive.wait(1500); await settle()
  await expect.equal(await app("app.saver.status"), "saved")
  await drive.set("app", "api", "http://127.0.0.1:8399")
  await drive.click("app.stage.surface")
  await clickSlide(400, 250)
  await drive.key("Shift+ArrowDown")
  await drive.wait(1500); await settle()
  await drive.wait(1500); await settle()
  await expect.equal(await app("app.saver.status"), "offline")
  await expect.text("app.topBar.status", "Not saved: can't reach the service")
  if (process.env.SHOTS) await page.screenshot({ path: "/tmp/pf/e1-offline.png" })
  await drive.set("app", "api", "http://127.0.0.1:8360")
  await drive.key("Meta+S")
  await drive.wait(1500); await settle()
  await drive.wait(800); await settle()
  await expect.equal(await app("app.saver.status"), "saved")
  const deckId = await app("app.saver.deckId")
  const served = await page.evaluate(async (id) => (await (await fetch("http://127.0.0.1:8360/api/decks/" + id + "/slides")).json()), deckId)
  await expect.equal(served.slides[0].elements[0].y, await app("app.doc.slides()[0].elements[0].y"))

  // ── back to the gallery; rename and delete (asked first)
  await drive.click("app.topBar.back")
  await settle()
  await expect.attr("app", "editorShown", false)
  await expect.text("app.home.page.grid", "Presentify test deck")
  await drive.click('app.home.page.grid.1."More for Presentify test deck"')
  await settle()
  await drive.click('app.deckMenu."Rename…"')
  await settle()
  await drive.selectAll("app.renameDialog.field")
  await drive.type("Renamed test deck")
  await drive.key("Enter")
  await settle()
  await expect.text("app.home.page.grid", "Renamed test deck")
  await drive.click('app.home.page.grid.1."More for Renamed test deck"')
  await settle()
  await drive.click('app.deckMenu."Delete…"')
  await settle()
  await drive.key("Escape")
  await settle()
  await expect.text("app.home.page.grid", "Renamed test deck")
  await drive.click('app.home.page.grid.1."More for Renamed test deck"')
  await settle()
  await drive.click('app.deckMenu."Delete…"')
  await settle()
  if (process.env.SHOTS) await page.screenshot({ path: "/tmp/pf/e2-delete.png" })
  await drive.click("app.deleteDialog.Delete")
  await settle()
  // The dialog leaves the screen, then delivers (Dialog.pick): the deck is let go
  // and its DELETE sent. (Under this runner's driven clock the request itself is
  // not flushed; in a browser it is — checked with declare-look.)
  await expect.attr("app.deleteDialog", "shown", false)
  await expect.equal(await app("app.saver.deckId"), "")
  await page.evaluate(async (id) => fetch("http://127.0.0.1:8360/api/decks/" + id, { method: "DELETE" }), await app("app.menuDeck"))
}
