// The brief's "what done looks like" (§12), driven as a person would, against
// the live service. It makes its own presentation ("Quarterly review") and
// deletes it at the end, so the service's other presentations are untouched.

const API = "http://127.0.0.1:8360";
const B = "app.shell.editor.body.stage.canvas.board";
const INS = "app.shell.editor.body.inspector";
const TOOLS = "app.shell.editor.bar.tools.picker";

export default async ({ drive, expect, page }) => {
  // leftovers of an earlier run that stopped part-way
  await page.evaluate(async () => {
    const r = await fetch("http://127.0.0.1:8360/api/decks");
    for (const d of (await r.json()).decks)
      if (!["d1", "d2", "d3"].includes(d.id) && /^(Quarterly review|Untitled presentation)/.test(d.title))
        await fetch("http://127.0.0.1:8360/api/decks/" + d.id, { method: "DELETE" });
  });
  const read = (p) => drive.read(p);
  const k = async () => (await read(`${B}.width`)) / 1280;
  // slide points → a point inside the board
  const at = async (x, y) => { const s = await k(); return [Math.round(x * s), Math.round(y * s)]; };
  const clickSlide = async (x, y, opts) => { const [px, py] = await at(x, y); await drive.clickAt(B, px, py, opts); };
  const dragSlide = async (x0, y0, x1, y1) => {
    const s = await k();
    await drive.press(B, Math.round(x0 * s), Math.round(y0 * s));
    await drive.moveBy(Math.round((x1 - x0) * s / 2), Math.round((y1 - y0) * s / 2));
    await drive.moveBy(Math.round((x1 - x0) * s / 2), Math.round((y1 - y0) * s / 2));
    await drive.release();
  };
  const els = async () => {
    const doc = await page.evaluate(() => window.__declare.find("app.deck").value);
    const cur = await read("app.current");
    return doc.slides.find((s) => s.id == cur).elements;
  };
  const typeText = async (words) => { await drive.type(words); await drive.key("Escape"); };

  // ── a new presentation, named
  await drive.click("app.shell.home.col.header.newBtn");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "ready", true);
  await expect.count(`app.shell.editor.body.slides.pane.rows`, "SlideThumb", 1);
  await drive.type("Quarterly review");
  await drive.key("Enter");
  expect.equal(await page.evaluate(() => window.__declare.find("app.deck").value.title), "Quarterly review");
  const deckId = await read("app.location");

  // ── a dark rectangle across the top
  await drive.click(`${TOOLS}.Rectangle`);
  await dragSlide(40, 40, 1240, 200);
  let e = await els();
  expect.equal(e.length, 1);
  expect.equal(e[0].kind, "rect");
  await drive.click(`${INS}."Fill colour"`);
  await drive.settleMotion();
  await drive.click(`app.colors.palette."#1D1830"`);
  await drive.key("Escape");
  e = await els();
  expect.equal(e[0].fill, "#1D1830");

  // ── a title in it, white, centred, 48 point
  await drive.click(`${TOOLS}.Text`);
  await dragSlide(80, 90, 1200, 130);
  await expect.attr("app", "editingText", (await els())[1].id);
  await typeText("Quarterly review");
  e = await els();
  expect.equal(e.length, 2);
  expect.equal(e[1].text.content, "Quarterly review");
  await drive.click(`${INS}."Text colour"`);
  await drive.settleMotion();
  await drive.click(`app.colors.palette."#FFFFFF"`);
  await drive.key("Escape");
  await drive.click(`${INS}."Align centre"`);
  await drive.selectAll(`${INS}."Font size"`);
  await drive.type("48");
  await drive.key("Enter");
  e = await els();
  expect.equal(e[1].text.color, "#FFFFFF");
  expect.equal(e[1].text.align, "center");
  expect.equal(e[1].text.size, 48);

  // ── three text boxes side by side, tops aligned, spread evenly
  const words = ["Revenue", "Costs", "Outlook"];
  const spots = [[100, 300], [470, 340], [930, 320]];
  for (let i = 0; i < 3; i++) {
    await drive.click(`${TOOLS}.Text`);
    await clickSlide(spots[i][0], spots[i][1]);
    await typeText(words[i]);
  }
  e = await els();
  expect.equal(e.length, 5);
  // select the three: a click and two shift-clicks
  await clickSlide(110, 312);
  await clickSlide(480, 352, { modifiers: ["Shift"] });
  await clickSlide(940, 332, { modifiers: ["Shift"] });
  expect.equal((await read("app.sel")).length, 3);
  await drive.click(`${INS}."Align tops"`);
  await drive.click(`${INS}."Distribute across"`);
  e = await els();
  const three = e.slice(2);
  expect.equal(new Set(three.map((t) => t.y)).size, 1);
  const gaps = [three[1].x - (three[0].x + three[0].width), three[2].x - (three[1].x + three[1].width)];
  if (Math.abs(gaps[0] - gaps[1]) > 1) throw new Error("not evenly distributed: gaps " + gaps);

  // ── a circle and a label, grouped, moved, then undone twice
  await drive.click(`${TOOLS}.Ellipse`);
  const s = await k();
  await drive.press(B, Math.round(150 * s), Math.round(470 * s));
  await page.keyboard.down("Shift");
  await drive.moveBy(Math.round(60 * s), Math.round(40 * s));
  await drive.moveBy(Math.round(60 * s), Math.round(80 * s));
  await drive.release();
  await page.keyboard.up("Shift");
  e = await els();
  const circle = e[e.length - 1];
  expect.equal(circle.kind, "ellipse");
  expect.equal(circle.width, circle.height);
  expect.equal(circle.keepProportions, true);
  await drive.click(`${TOOLS}.Text`);
  await clickSlide(300, 510);
  await typeText("Label");
  await clickSlide(210, 530);
  await clickSlide(320, 525, { modifiers: ["Shift"] });
  expect.equal((await read("app.sel")).length, 2);
  await drive.key("Meta+G");
  e = await els();
  const group = e[e.length - 1];
  expect.equal(group.kind, "group");
  const undosBefore = await page.evaluate(() => window.__declare.find("app.hist").undos.length);
  // move the group by its circle
  await drive.press(B, Math.round(210 * s), Math.round(530 * s));
  await drive.moveBy(Math.round(100 * s), Math.round(-50 * s));
  await drive.moveBy(Math.round(100 * s), Math.round(-50 * s));
  await drive.release();
  e = await els();
  const movedGroup = e.find((x) => x.id == group.id);
  if (!movedGroup || movedGroup.children[0].x == circle.x) throw new Error("the group did not move");
  expect.equal((await page.evaluate(() => window.__declare.find("app.hist").undos.length)) - undosBefore, 1);   // a drag is one step
  await drive.click("app.shell.editor.bar.tools.Undo");
  await drive.click("app.shell.editor.bar.tools.Undo");
  e = await els();
  if (e.some((x) => x.kind == "group")) throw new Error("undo twice should take the group apart again");
  expect.equal((await read("app.sel")).length, 2);   // the selection is back as it was

  // ── duplicate the slide, retitle the copy, drag it above the original
  await clickSlide(1250, 700);   // empty corner: nothing selected
  await drive.key("Meta+D");
  await expect.count(`app.shell.editor.body.slides.pane.rows`, "SlideThumb", 2);
  const copyKey = await read("app.current");
  const titleId = (await els())[1].id;
  await drive.dblclick(B, ...(await at(640, 110)));
  await drive.dblclick(B, ...(await at(640, 110)));
  await expect.attr("app", "editingText", titleId);
  await drive.key("Meta+A");
  await drive.type("Quarterly review — draft 2");
  await drive.key("Escape");
  await drive.settleMotion();
  await drive.press("app.shell.editor.body.slides.pane.rows.1", 100, 50);
  await drive.moveBy(0, -40);
  await drive.moveBy(0, -40);
  await drive.moveBy(0, -30);
  await drive.release();
  await drive.settleMotion();
  const order = await page.evaluate(() => window.__declare.find("app.deck").value.slides.map((s) => s.id));
  expect.equal(order[0], copyKey);

  // ── present from the start; the arrows go through; Escape comes back
  await drive.click("app.shell.editor.body.slides.pane.rows.0");
  await drive.click("app.shell.editor.bar.Present");
  await expect.attr("app", "presenting", true);
  await expect.attr("app", "presentAt", 0);
  await drive.key("ArrowRight");
  await expect.attr("app", "presentAt", 1);
  await drive.key("ArrowLeft");
  await drive.key("ArrowRight");
  await drive.key("Escape");
  await expect.attr("app", "presenting", false);
  await expect.attr("app", "current", order[1]);

  // ── everything reached the service without a Save
  await drive.waitReal(2500);
  await drive.settleData();
  await drive.wait(1500);
  await drive.settleData();
  await expect.attr("app.sync", "statusText", "All changes saved");
  const saved = await page.evaluate(async (id) => {
    const r = await fetch(`http://127.0.0.1:8360/api/decks/${id}/slides`);
    return (await r.json()).slides;
  }, deckId);
  expect.equal(saved.length, 2);
  expect.equal(saved[0].elements[1].text.content, "Quarterly review — draft 2");
  expect.equal(saved[1].elements[1].text.content, "Quarterly review");

  // ── a colleague edits the second slide in another window
  const second = saved[1];
  await page.evaluate(async (s) => {
    const els = s.elements.map((e) => e.kind == "text" && e.text.content == "Quarterly review"
      ? { ...e, text: { ...e.text, content: "Quarterly review (colleague's edit)" } } : e);
    await fetch(`http://127.0.0.1:8360/api/slides/${s.id}`, { method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: s.version, background: s.background, elements: els }) });
  }, second);
  await drive.click("app.shell.editor.body.slides.pane.rows.0");
  await drive.click("app.shell.editor.body.slides.pane.rows.1");
  await drive.settleData();
  await expect.attr("app", "conflictHere", true);
  await expect.text("app.shell.editor.body.stage.banner", "was changed in another window");
  await drive.click(`app.shell.editor.body.stage.banner."Use their version"`);
  e = await els();
  expect.equal(e[1].text.content, "Quarterly review (colleague's edit)");
  await expect.attr("app", "conflictHere", false);
  await drive.waitReal(2000);
  await drive.settleData();
  await expect.attr("app.sync", "statusText", "All changes saved");

  // ── tidy up: back to the list, and the scratch presentation goes
  await drive.click("app.shell.editor.bar.\"All presentations\"");
  await drive.settleMotion();
  await page.evaluate(async (id) => { await fetch(`http://127.0.0.1:8360/api/decks/${id}`, { method: "DELETE" }); }, deckId);
};
