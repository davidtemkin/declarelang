// The brief's "what done looks like", driven as a person would, against the
// running service: npx declare-verify my-apps/presentify/presentify.declare
//   --url http://127.0.0.1:8200/my-apps/presentify/presentify.declare --assert my-apps/presentify/checks/flow.mjs
//
// It makes a presentation of its own ("Quarterly review") and leaves it there.

const API = "http://127.0.0.1:8360/api";

export default async ({ drive, expect, page }) => {
  const read = (expr) => page.evaluate((src) => {
    const app = window.__declare.find("app");
    return new Function("app", "return (" + src + ")")(app);
  }, expr);
  const step = async (what, fn) => { try { await fn(); } catch (e) { throw new Error(what + ": " + e.message); } };

  await drive.settleData();
  await drive.settleMotion();

  // ── a new presentation called "Quarterly review"
  await step("new presentation", async () => {
    await drive.click('app.gallery."New presentation"');
    await drive.settleData();
    await drive.settleMotion();
    await drive.type("Quarterly review");
    await drive.key("Enter");
    await drive.wait(1500);
    await drive.settleData();
    expect.equal(await read("app.doc.value.title"), "Quarterly review");
    expect.equal(await read("app.doc.slides().length"), 1);
  });
  const deckId = await read("app.doc.value.deckId");

  // ── a dark rectangle across the top
  await step("dark rectangle", async () => {
    await drive.click('app.editor.top.bar2.tools."Rectangle"');
    await drive.press("app.stage", 0, 0);
    await drive.moveBy(1280 * 0.6687, 180 * 0.6687);
    await drive.release();
    expect.equal(await read("app.sel.length"), 1);
    expect.equal(await read("app.selOne.kind"), "rect");
    await drive.click('app.editor.body.inspSide."Fill colour"');
    await drive.settleMotion();
    await drive.click('app.palette."#1F2328"');
    await drive.settleMotion();
    expect.equal(await read("app.selOne.fill"), "#1F2328");
  });
  const rectId = await read("app.sel[0]");

  // ── a title typed into it, white, centred, 48 point
  await step("title", async () => {
    await drive.click('app.editor.top.bar2.tools."Text"');
    await drive.clickAt("app.stage", 200, 80);
    expect.equal(await read("app.editingId != ''"), true);
    await drive.type("Quarterly review");
    await drive.key("Escape");
    expect.equal(await read("app.editingId"), "");
    expect.equal(await read("app.selOne.text.content"), "Quarterly review");
    await drive.click('app.editor.body.inspSide."Text colour"');
    await drive.settleMotion();
    await drive.click('app.palette."#FFFFFF"');
    await drive.settleMotion();
    await drive.click('app.editor.body.inspSide."Centre"');
    await drive.selectAll('app.editor.body.inspSide."Font size"');
    await drive.type("48");
    await drive.key("Enter");
    const t = await read("app.selOne.text");
    expect.equal(t.color, "#FFFFFF");
    expect.equal(t.align, "center");
    expect.equal(t.size, 48);
  });

  // ── three text boxes side by side, tops aligned, evenly spread
  const boxes = [];
  for (const [x, y, words] of [[80, 330, "Revenue"], [520, 300, "Customers"], [900, 360, "Next quarter"]]) {
    await step("text box " + words, async () => {
      await drive.click('app.editor.top.bar2.tools."Text"');
      await drive.press("app.stage", x, y);
      await drive.moveBy(260 * 0.6687, 40 * 0.6687);
      await drive.release();
      await drive.type(words);
      await drive.key("Escape");
      boxes.push(await read("app.sel[0]"));
    });
  }
  await step("align and distribute", async () => {
    await page.evaluate((ids) => { window.__declare.find("app").sel = ids; }, boxes);
    await drive.settleMotion();
    await drive.click('app.editor.body.inspSide."Align tops"');
    const ys = await read(`app.sel.map((id) => findElY(id))`.replace("findElY(id)", "app.els.find((e) => e.id == id).y"));
    expect.equal(new Set(ys).size, 1);
    await drive.click('app.editor.body.inspSide."Distribute across"');
    const xs = await read("app.sel.map((id) => app.els.find((e) => e.id == id)).map((e) => [e.x, e.width]).sort((a, b) => a[0] - b[0])");
    const gap1 = xs[1][0] - (xs[0][0] + xs[0][1]), gap2 = xs[2][0] - (xs[1][0] + xs[1][1]);
    if (Math.abs(gap1 - gap2) > 0.5) throw new Error("gaps differ: " + gap1 + " vs " + gap2);
  });

  // ── a circle and a label, grouped, moved; then undo, twice
  let groupId = "";
  await step("group a circle and a label", async () => {
    await drive.click('app.editor.top.bar2.tools."Ellipse"');
    await drive.press("app.stage", 100, 520);
    await drive.moveBy(100 * 0.6687, 60 * 0.6687, );
    await drive.release();
    const circle = await read("app.sel[0]");
    await drive.click('app.editor.top.bar2.tools."Text"');
    await drive.press("app.stage", 240, 540);
    await drive.moveBy(200 * 0.6687, 30 * 0.6687);
    await drive.release();
    await drive.type("Label");
    await drive.key("Escape");
    const label = await read("app.sel[0]");
    await drive.click("app.stage", { modifiers: [] });       // nothing there: clears
    await page.evaluate((ids) => { window.__declare.find("app").sel = ids; }, [circle, label]);
    await drive.key("Meta+G");
    expect.equal(await read("app.selOne.kind"), "group");
    groupId = await read("app.sel[0]");
  });
  await step("move the group, then undo twice", async () => {
    const before = await read("JSON.stringify(app.els)");
    const beforeGroup = await read("app.selBox.x");
    await drive.press("app.stage", 150, 550);
    await drive.moveBy(200, 0);
    await drive.release();
    const after = await read("app.selBox.x");
    if (!(after > beforeGroup + 100)) throw new Error("the group did not move: " + beforeGroup + " → " + after);
    await drive.key("Meta+Z");      // the move
    expect.equal(await read("app.selBox.x"), beforeGroup);
    await drive.key("Meta+Z");      // the grouping
    expect.equal(await read("app.els.some((e) => e.kind == 'group')"), false);
    expect.equal(await read("app.sel.length"), 2);
  });

  await drive.wait(2500);
  await drive.settleData();
  expect.equal(await read("app.sync.status"), "saved");

  // ── duplicate the slide, change its title, drag the copy above the original
  await step("duplicate the slide", async () => {
    await drive.key("Shift+Meta+D");
    expect.equal(await read("app.doc.slides().length"), 2);
    expect.equal(await read("app.curIndex"), 1);
    const titleId = await read("app.els.find((e) => e.kind == 'text' && e.text.size == 48).id");
    await page.evaluate((id) => { window.__declare.find("app").sel = [id]; }, titleId);
    await page.evaluate((id) => { window.__declare.find("app").editText(id); }, titleId);
    await drive.settleMotion();
    await drive.key("Meta+A");
    await drive.type("Quarterly review — draft");
    await drive.key("Escape");
    expect.equal(await read("app.selOne.text.content"), "Quarterly review — draft");
  });
  await step("drag the copy above the original", async () => {
    const copyKey = await read("app.current");
    await drive.press("app.editor.body.side.0.rows.1", 120, 50);
    await drive.moveBy(0, -60);
    await drive.moveBy(0, -60);
    await drive.release();
    await drive.settleMotion();
    expect.equal(await read("app.doc.keys()[0]"), copyKey);
  });

  // ── present from the start; the arrows go through
  await step("present", async () => {
    await page.evaluate(() => { window.__declare.find("app").goTo(window.__declare.find("app").doc.keys()[0]); });
    await drive.click('app.editor.top.bar1."Present"');
    await drive.settleMotion();
    expect.equal(await read("app.presenting"), true);
    expect.equal(await read("app.presenter.at"), 0);
    await drive.key("ArrowRight");
    expect.equal(await read("app.presenter.at"), 1);
    await drive.key("Escape");
    await drive.settleMotion();
    expect.equal(await read("app.presenting"), false);
    expect.equal(await read("app.curIndex"), 1);
  });

  await drive.wait(2500);
  await drive.settleData();
  expect.equal(await read("app.sync.status"), "saved");

  // ── meanwhile, a colleague changes the second slide in another window
  await step("a colleague's change", async () => {
    await page.evaluate(() => { const a = window.__declare.find("app"); a.goTo(a.doc.keys()[0]); });
    await drive.settleData();
    const sid = await read("app.sync.remote[app.doc.keys()[1]].sid");
    const slide = await page.evaluate(async (u) => (await fetch(u)).json(), API + "/slides/" + sid);
    slide.elements.push({ id: "colleague1", kind: "rect", x: 1000, y: 600, width: 200, height: 80, fill: "#FF6B4A",
      stroke: null, cornerRadius: 12, keepProportions: false });
    const put = await page.evaluate(async ([u, body]) => (await fetch(u, { method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify(body) })).status, [API + "/slides/" + sid, { version: slide.version, background: slide.background, elements: slide.elements }]);
    expect.equal(put, 200);
    await page.evaluate(() => { const a = window.__declare.find("app"); a.goTo(a.doc.keys()[1]); });
    await drive.settleData();
    await drive.wait(1000);
    await drive.settleData();
    await drive.settleMotion();
    await expect.visible("app.editor.body.pane.banner");
    await drive.click('app.editor.body.pane.banner."Use their version"');
    await drive.settleMotion();
    expect.equal(await read("app.els.some((e) => e.id == 'colleague1')"), true);
    await expect.hidden("app.editor.body.pane.banner");
  });

  await drive.wait(2500);
  await drive.settleData();
  expect.equal(await read("app.sync.status"), "saved");

  // ── and it is all on the service
  const deck = await page.evaluate(async (u) => (await fetch(u)).json(), API + "/decks/" + deckId);
  expect.equal(deck.title, "Quarterly review");
  expect.equal(deck.slideOrder.length, 2);
  const local = await read("JSON.stringify(app.doc.slides().map((s) => ({ background: s.background, elements: s.elements })))");
  const remote = await page.evaluate(async (u) => (await fetch(u)).json(), API + "/decks/" + deckId + "/slides");
  expect.equal(JSON.stringify(remote.slides.map((s) => ({ background: s.background, elements: s.elements }))), local);
};
