// The finer points of editing, against the running service:
//   npx declare-verify my-apps/presentify/presentify.declare
//     --url http://127.0.0.1:8200/my-apps/presentify/presentify.declare --assert my-apps/presentify/checks/editing.mjs
//
// It makes a presentation of its own ("Editing check") and deletes it at the end.

const API = "http://127.0.0.1:8360/api";

export default async ({ drive, expect, page }) => {
  const read = (expr) => page.evaluate((src) => {
    const app = window.__declare.find("app");
    return new Function("app", "return (" + src + ")")(app);
  }, expr);
  const call = (expr) => page.evaluate((src) => { const app = window.__declare.find("app"); new Function("app", src)(app); }, expr);
  const step = async (what, fn) => { try { await fn(); } catch (e) { throw new Error(what + ": " + e.message); } };
  const k = async () => read("app.k");

  await drive.settleData();
  await drive.click('app.gallery."New presentation"');
  await drive.settleData();
  await drive.settleMotion();
  await drive.type("Editing check");
  await drive.key("Enter");
  const deckId = await read("app.doc.value.deckId");

  // a rectangle drawn with shift is a square that keeps its proportions
  await step("shift-draw", async () => {
    await drive.key("r");
    expect.equal(await read("app.tool"), "rect");
    const z = await k();
    await drive.press("app.stage", 100, 100);
    await page.keyboard.down("Shift");
    await drive.moveBy(200 * z, 120 * z);
    await drive.release();
    await page.keyboard.up("Shift");
    const e = await read("app.selOne");
    expect.equal(Math.round(e.width), Math.round(e.height));
    expect.equal(e.keepProportions, true);
    expect.equal(await read("app.tool"), "select");
  });

  // resizing it keeps it square without a key; with shift it lets go
  await step("resize keeps proportions", async () => {
    const z = await k();
    const b = await read("app.selBox");
    await drive.press("app.stage", b.x + b.w, b.y + b.h / 2);   // the right-side handle
    await drive.moveBy(100 * z, 0);
    await drive.release();
    const e = await read("app.selOne");
    expect.equal(Math.round(e.width), Math.round(e.height));
    if (!(e.width > b.w + 50)) throw new Error("did not grow: " + e.width);
    const b2 = await read("app.selBox");
    await page.keyboard.down("Shift");
    await drive.press("app.stage", b2.x + b2.w, b2.y + b2.h);
    await drive.moveBy(80 * z, 0);
    await drive.release();
    await page.keyboard.up("Shift");
    const e2 = await read("app.selOne");
    if (Math.abs(e2.width - e2.height) < 20) throw new Error("shift did not free the proportions: " + e2.width + "×" + e2.height);
  });

  // the corner radius handle rounds it, and a resize keeps the radius
  await step("radius", async () => {
    const z = await k();
    const at = await read("app.radiusAt");
    await drive.press("app.stage", at.x, at.y);
    await drive.moveBy(30 * z, 30 * z);
    await drive.release();
    const r = await read("app.selOne.cornerRadius");
    if (!(r >= 25)) throw new Error("radius " + r);
    const b = await read("app.selBox");
    await drive.press("app.stage", b.x + b.w, b.y + b.h);
    await drive.moveBy(60 * z, 40 * z);
    await drive.release();
    expect.equal(await read("app.selOne.cornerRadius"), r);
  });

  // arrows nudge by one point, shift by ten; each nudge undoes
  await step("nudge", async () => {
    await drive.click("app.editor.body.pane");     // the canvas has the keyboard
    await call("app.sel = [app.els[0].id]");
    const x0 = await read("app.selBox.x");
    await drive.key("ArrowRight");
    expect.equal(await read("app.selBox.x"), x0 + 1);
    await drive.key("Shift+ArrowDown");
    await drive.key("Shift+ArrowRight");
    expect.equal(await read("app.selBox.x"), x0 + 11);
    await drive.key("Meta+Z");
    expect.equal(await read("app.selBox.x"), x0 + 1);
    await drive.key("Shift+Meta+Z");
    expect.equal(await read("app.selBox.x"), x0 + 11);
  });

  // copy, paste onto a new slide, paste again offset
  await step("copy and paste across slides", async () => {
    await drive.key("Meta+C");
    await drive.key("Shift+Meta+N");
    expect.equal(await read("app.doc.slides().length"), 2);
    expect.equal(await read("app.els.length"), 0);
    await drive.key("Meta+V");
    expect.equal(await read("app.els.length"), 1);
    await drive.key("Meta+V");
    expect.equal(await read("app.els.length"), 2);
    expect.equal(await read("app.sel.length"), 1);
    const xs = await read("app.els.map((e) => e.x)");
    expect.equal(xs[1] - xs[0], 20);
  });

  // a line's ends; Escape clears; marquee selects what it touches
  await step("line and marquee", async () => {
    const z = await k();
    await drive.key("l");
    await drive.press("app.stage", 600, 500);
    await drive.moveBy(200 * z, 0);
    await drive.release();
    expect.equal(await read("app.selOne.kind"), "line");
    await drive.press("app.stage", 800, 500);             // its far end
    await drive.moveBy(0, 100 * z);
    await drive.release();
    expect.equal(Math.round(await read("app.selOne.y2")), 600);
    await drive.key("Escape");
    expect.equal(await read("app.sel.length"), 0);
    await drive.press("app.stage", 20, 20);
    await drive.moveBy(1240 * z, 680 * z);
    await drive.release();
    expect.equal(await read("app.sel.length"), 3);
  });

  // group, double-click into the group, ungroup
  await step("groups", async () => {
    await drive.key("Meta+G");
    expect.equal(await read("app.selOne.kind"), "group");
    const g = await read("app.sel[0]");
    const first = await read("app.els[0].children[app.els[0].children.length - 1]");   // the front-most: the line
    await drive.dblclick("app.stage", (first.x1 + first.x2) / 2, (first.y1 + first.y2) / 2);
    expect.equal(await read("app.sel[0]"), first.id);
    expect.equal(await read("app.scope"), g);
    await drive.key("Escape");
    expect.equal(await read("app.sel[0]"), g);
    await drive.key("Shift+Meta+G");
    expect.equal(await read("app.sel.length"), 3);
    expect.equal(await read("app.els.some((e) => e.kind == 'group')"), false);
  });

  // ordering
  await step("order", async () => {
    await call("app.sel = [app.els[0].id]");
    const id = await read("app.sel[0]");
    await drive.key("Shift+Meta+F");
    expect.equal(await read("app.els[app.els.length - 1].id"), id);
    await drive.key("Meta+[");
    expect.equal(await read("app.els[app.els.length - 2].id"), id);
  });

  // deleting a slide, undone, comes back and is saved again
  await step("delete a slide and undo", async () => {
    await drive.wait(1500);
    await drive.settleData();
    await drive.click('app.editor.body.side."Slide 2"');
    await drive.key("Backspace");                                // the list has the keyboard: deletes the slide
    expect.equal(await read("app.doc.slides().length"), 1);
    await drive.wait(1500);
    await drive.settleData();
    let deck = await page.evaluate(async (u) => (await fetch(u)).json(), API + "/decks/" + deckId);
    expect.equal(deck.slideOrder.length, 1);
    await drive.key("Meta+Z");
    expect.equal(await read("app.doc.slides().length"), 2);
    await drive.wait(1500);
    await drive.settleData();
    deck = await page.evaluate(async (u) => (await fetch(u)).json(), API + "/decks/" + deckId);
    expect.equal(deck.slideOrder.length, 2);
    expect.equal(await read("app.sync.status"), "saved");
  });

  // the keyboard moves between slides in the list
  await step("list keys", async () => {
    await drive.click('app.editor.body.side."Slide 1"');
    expect.equal(await read("app.curIndex"), 0);
    await drive.key("ArrowDown");
    expect.equal(await read("app.curIndex"), 1);
    await drive.key("ArrowUp");
    expect.equal(await read("app.curIndex"), 0);
  });

  // the service goes away: changes wait, and arrive when it is back
  await step("unreachable", async () => {
    await call("app.api = 'http://127.0.0.1:9/api'");
    await drive.click("app.editor.body.pane");
    await call("app.sel = [app.els[0].id]");
    await drive.key("ArrowLeft");
    await drive.wait(1500);
    await drive.settleData();
    expect.equal(await read("app.sync.status"), "offline");
    await expect.text("app.editor.top.bar1.status", "Not saved: can't reach the service");
    await call("app.api = 'http://127.0.0.1:8360/api'");
    await drive.wait(12000);
    await drive.settleData();
    expect.equal(await read("app.sync.status"), "saved");
  });

  // back to the presentations; delete this one there
  await step("delete the presentation", async () => {
    await drive.click('app.editor.top.bar1."All presentations"');
    await drive.settleData();
    await drive.settleMotion();
    await call(`app.menuDeck = "${deckId}"`);
    await call("app.deckMenu.picked('delete')");
    await drive.settleMotion();
    await drive.click('app.confirmDelete."Delete"');
    await drive.settleData();
    const st = await page.evaluate(async (u) => (await fetch(u)).status, API + "/decks/" + deckId);
    expect.equal(st, 404);
  });
};
