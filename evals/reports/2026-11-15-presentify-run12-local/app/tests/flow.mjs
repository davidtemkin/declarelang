// The brief's "what done looks like", driven as a person would, against the
// running service. Run where the app is served:
//   npx declare-verify my-apps/presentify/presentify.declare \
//     --url http://127.0.0.1:8200/my-apps/presentify/presentify.declare \
//     --assert my-apps/presentify/tests/flow.mjs

const API = "http://127.0.0.1:8360";
const S = "app.editor.body.stage";
const P = S + ".paper";
const read = (page, path) => page.evaluate((p) => {
  const parts = p.split(".");
  const attr = parts.pop();
  return window.__declare.find(parts.join("."))[attr];
}, path);
const val = (page, expr) => page.evaluate((e) => {
  const app = window.__declare.find("app");
  return JSON.parse(JSON.stringify(new Function("app", "return " + e)(app)));
}, expr);

export default async ({ drive, expect, page }) => {
  let z = 1;
  const at = (x, y) => [Math.round(x * z), Math.round(y * z)];   // slide points → paper pixels

  // ── A new presentation, called "Quarterly review"
  await drive.click("app.home.bar.2");
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal(await val(page, "app.ed.count"), 1);
  z = await read(page, "app.zoom");
  await drive.type("Quarterly review");
  await drive.key("Enter");
  await expect.equal(await val(page, "app.doc.value.title"), "Quarterly review");

  // ── A dark rectangle across the top
  await drive.click("app.editor.bar.tools.Rectangle");
  await drive.press(P, ...at(40, 30));
  await drive.moveBy(Math.round(1200 * z), Math.round(170 * z));
  await drive.release();
  await expect.equal(await val(page, "app.ed.els.length"), 1);
  await expect.equal(await val(page, "app.ed.tool"), "select");
  await drive.click("app.editor.body.inspector.body.fillSec.body.0");
  await drive.settleMotion();
  await page.getByRole("dialog", { name: "Colours" }).getByRole("button", { name: "#1F2328" }).click();
  await drive.settleMotion();
  await expect.equal(await val(page, "app.ed.els[0].fill"), "#1F2328");

  // ── A title typed into it: white, centred, 48 point
  await drive.click("app.editor.bar.tools.Text");
  await drive.clickAt(P, ...at(200, 80));
  await drive.settleMotion();
  await expect.equal(await val(page, "app.ed.editingId != ''"), true);
  await drive.type("Quarterly review");
  await drive.key("Escape");
  await expect.equal(await val(page, "app.ed.editingId"), "");
  await expect.equal(await val(page, "app.ed.els.length"), 2);
  await expect.equal(await val(page, "app.ed.els[1].text.content"), "Quarterly review");
  await expect.equal(await val(page, "app.ed.sel.length"), 1);
  await page.getByRole("option", { name: "Align centre" }).click();
  const size = page.getByLabel("Text size", { exact: true });
  await size.fill("48");
  await size.press("Enter");
  await page.getByRole("button", { name: /^Text colour/ }).click();
  await drive.settleMotion();
  await page.getByRole("dialog", { name: "Colours" }).getByRole("button", { name: "#FFFFFF" }).click();
  await drive.settleMotion();
  const title = await val(page, "app.ed.els[1].text");
  await expect.equal([title.align, title.size, title.color], ["center", 48, "#FFFFFF"]);

  // ── Three text boxes side by side, tops aligned, evenly distributed
  for (const [x, y, words] of [[100, 330, "Revenue"], [520, 350, "Customers"], [860, 320, "Outlook"]]) {
    await drive.click("app.editor.bar.tools.Text");
    await drive.clickAt(P, ...at(x, y));
    await drive.settleMotion();
    await drive.type(words);
    await drive.key("Escape");
  }
  await expect.equal(await val(page, "app.ed.els.length"), 5);
  const ids = await val(page, "app.ed.els.slice(2).map((e) => e.id)");
  await drive.set("app.ed", "sel", ids);    // (shift-clicks are checked below, with the group)
  await page.getByRole("button", { name: "Align tops" }).click();
  await page.getByRole("button", { name: "Distribute across" }).click();
  const ys = await val(page, "app.ed.els.slice(2).map((e) => e.y)");
  await expect.equal(new Set(ys).size, 1);
  const xs = await val(page, "app.ed.els.slice(2).map((e) => [e.x, e.width])");
  const gap1 = xs[1][0] - (xs[0][0] + xs[0][1]), gap2 = xs[2][0] - (xs[1][0] + xs[1][1]);
  if (Math.abs(gap1 - gap2) > 0.5) throw new Error(`gaps differ: ${gap1} vs ${gap2}`);

  // ── A circle and a label, grouped, moved, then two undos
  await drive.click("app.editor.bar.tools.Ellipse");
  await page.keyboard.down("Shift");
  await drive.press(P, ...at(560, 500));
  await drive.moveBy(Math.round(120 * z), Math.round(90 * z));
  await drive.release();
  await page.keyboard.up("Shift");
  const circle = await val(page, "app.ed.els[5]");
  await expect.equal([circle.kind, circle.width, circle.height, circle.keepProportions], ["ellipse", circle.width, circle.width, true]);
  await drive.click("app.editor.bar.tools.Text");
  await drive.clickAt(P, ...at(720, 560));
  await drive.settleMotion();
  await drive.type("Growth");
  await drive.key("Escape");
  await expect.equal(await val(page, "app.ed.els.length"), 7);
  // shift-click the circle to add it to the label
  await drive.click(P + ".art.5", { modifiers: ["Shift"] });
  await expect.equal((await val(page, "app.ed.sel")).length, 2);
  await drive.key("Mod+G");
  await expect.equal(await val(page, "app.ed.single.kind"), "group");
  const before = await val(page, "app.ed.selBox");
  await drive.drag(P + ".art.5.0", Math.round(-200 * z), Math.round(-40 * z));
  const after = await val(page, "app.ed.selBox");
  if (Math.abs(after.x - before.x) < 50) throw new Error("the group did not move");
  await drive.key("Mod+Z");
  await expect.equal(await val(page, "app.ed.selBox"), before);
  await drive.key("Mod+Z");
  await expect.equal(await val(page, "app.ed.els.length"), 7);
  await expect.equal(await val(page, "app.ed.els.some((e) => e.kind == 'group')"), false);

  // ── Duplicate the slide, change its title, drag the copy above the original
  await page.getByRole("button", { name: "Duplicate slide" }).click();
  await drive.settleMotion();
  await expect.equal(await val(page, "app.ed.count"), 2);
  await expect.equal(await val(page, "app.ed.index"), 1);
  await drive.dblclick(P + ".art.1");
  await drive.settleMotion();
  await drive.key("Mod+A");
  await drive.type("Quarterly review — draft");
  await drive.key("Escape");
  await expect.equal(await val(page, "app.ed.els[1].text.content"), "Quarterly review — draft");
  const copyKey = await val(page, "app.ed.cur");
  await drive.press("app.editor.body.slides.list.1", 80, 40);
  await drive.moveBy(0, -140);
  await drive.release();
  await drive.settleMotion();
  await expect.equal(await val(page, "app.doc.keys()[0]"), copyKey);

  // ── Present from the start; the arrow keys go through
  await drive.click("app.editor.body.slides.list.0");
  await drive.click("app.editor.bar.right.Present");
  await drive.settleMotion();
  await expect.equal(await read(page, "app.presenter.shown"), true);
  await expect.equal(await read(page, "app.presenter.at"), 0);
  await drive.key("ArrowRight");
  await expect.equal(await read(page, "app.presenter.at"), 1);
  await drive.key("ArrowLeft");
  await drive.key("Space");
  await expect.equal(await read(page, "app.presenter.at"), 1);
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.equal(await read(page, "app.presenter.shown"), false);
  await expect.equal(await val(page, "app.ed.index"), 1);

  // ── Everything reached the service
  await drive.key("Mod+S");
  await drive.wait(1500);
  await drive.settleData();
  await expect.equal(await read(page, "app.saver.status"), "saved");
  const deckId = await read(page, "app.loadedId");
  const server = await page.evaluate(async ([api, id]) => (await (await fetch(`${api}/api/decks/${id}/slides`)).json()), [API, deckId]);
  await expect.equal(server.slides.length, 2);
  await expect.equal(server.slides[0].elements[1].text.content, "Quarterly review — draft");
  await expect.equal(server.slides[1].elements[1].text.content, "Quarterly review");

  // ── A colleague edits the second slide in another window
  const s2 = server.slides[1];
  await page.evaluate(async ([api, s]) => {
    const els = s.elements.map((e) => e.kind == "text" && e.text.content == "Quarterly review"
      ? { ...e, text: { ...e.text, content: "Q3 review (from Sam)" } } : e);
    await fetch(`${api}/api/slides/${s.id}`, { method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: s.version, background: s.background, elements: els }) });
  }, [API, s2]);
  await drive.click("app.editor.body.slides.list.0");
  await drive.click("app.editor.body.slides.list.1");
  await drive.settleData();
  await drive.settleMotion();
  await expect.visible(S + ".banner");
  await expect.text(S + ".banner", "was changed in another window");
  await page.getByRole("button", { name: "Show their version" }).click();
  await drive.settleMotion();
  await expect.equal(await val(page, "app.ed.els[1].text.content"), "Q3 review (from Sam)");
  await drive.wait(1500);
  await drive.settleData();
  await expect.equal(await read(page, "app.saver.status"), "saved");
  await expect.text("app.editor.bar.left.named.status", "All changes saved");
};
