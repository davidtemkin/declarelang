// The brief's "what done looks like", driven as a person would, against the
// running service. It makes a new presentation each run and deletes it at the end.
//
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/flow.mjs

const C = "app.shell.editor.body.canvas";
const INS = "app.shell.editor.body.inspector";
const API = "http://127.0.0.1:8360";

export default async ({ drive, expect, page }) => {
  const rd = (p) => drive.read(p);
  const els = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__declare.find("app.ed").els)));
  const doc = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__declare.find("app.doc").value)));
  const geo = async () => ({ s: await rd(C + ".s"), sx: await rd(C + ".sx"), sy: await rd(C + ".sy") });
  const pt = (g, x, y) => [g.sx + x * g.s, g.sy + y * g.s];
  const dragOn = async (x0, y0, x1, y1) => {
    const g = await geo();
    const [a, b] = pt(g, x0, y0), [c, d] = pt(g, x1, y1);
    await drive.press(C, a, b);
    await drive.moveBy((c - a) / 2, (d - b) / 2);
    await drive.moveBy((c - a) / 2, (d - b) / 2);
    await drive.release();
    await drive.settleMotion();
  };
  const clickOn = async (x, y, opts) => {
    const g = await geo();
    const [a, b] = pt(g, x, y);
    await drive.clickAt(C, a, b, opts);
    await drive.settleMotion();
  };
  const tool = async (name) => { await drive.click(C + ".tools." + name); };
  const check = (cond, what) => { if (!cond) throw new Error(what); };

  // ── A new presentation, called "Quarterly review"
  await drive.click('app.shell.library.header."New presentation"');
  await drive.settleData();
  await drive.wait(400);
  await drive.settleMotion();
  const made = await rd("app.openId");
  try {
  check(made != "", "a new presentation opens straight into editing");
  check((await doc()).slides.length == 1, "with one empty slide");
  await expect.visible(C + ".hint");
  await drive.type("Quarterly review");
  await drive.key("Enter");
  await drive.settleMotion();
  check((await doc()).title == "Quarterly review", "the title is set: " + (await doc()).title);

  // ── A dark rectangle across the top
  await tool("Rectangle");
  await dragOn(0, 0, 1280, 170);
  let e = await els();
  check(e.length == 1 && e[0].kind == "rect", "a rectangle is drawn: " + JSON.stringify(e));
  check(Math.abs(e[0].width - 1280) < 2 && Math.abs(e[0].height - 170) < 2, "dragged to size: " + JSON.stringify(e[0]));
  await drive.click(INS + '.pane.fillSec."Fill colour"');
  await drive.settleMotion();
  await drive.click('app.colorPop.grid."#15121C"');
  await drive.settleMotion();
  await drive.key("Escape");
  e = await els();
  check(e[0].fill == "#15121C", "the rectangle is dark: " + e[0].fill);

  // ── A title typed into it: white, centred, 48 point
  await tool("Text");
  await dragOn(80, 40, 1200, 120);
  await drive.type("Quarterly review");
  await drive.key("Escape");
  await drive.settleMotion();
  e = await els();
  check(e.length == 2 && e[1].kind == "text" && e[1].text.content == "Quarterly review", "the title is typed: " + JSON.stringify(e[1]));
  check((await rd("app.ed.selection")).length == 1, "the text box stays selected");
  await drive.click(INS + '.pane.textSec."Text colour"');
  await drive.settleMotion();
  await drive.click('app.colorPop.grid."#FFFFFF"');
  await drive.key("Escape");
  await drive.settleMotion();
  check(!(await rd("app.colorPop.shown")), "Escape closes the colours");
  await drive.click(INS + '.pane.textSec."Align centre"');
  await drive.settleMotion();
  await drive.selectAll(INS + '.pane.textSec."Font size"');
  await drive.type("48");
  await drive.key("Enter");
  await drive.settleMotion();
  e = await els();
  check(e[1].text.color == "#FFFFFF" && e[1].text.align == "center" && e[1].text.size == 48, "title styled: " + JSON.stringify(e[1].text));

  await page.screenshot({ path: "/tmp/flow-1-title.png" });

  // ── Three text boxes side by side, tops aligned, spread evenly
  const words = ["Revenue", "Customers", "Next quarter"];
  const spots = [[120, 300], [520, 340], [880, 320]];
  for (let i = 0; i < 3; i++) {
    await tool("Text");
    await clickOn(spots[i][0], spots[i][1]);
    await drive.type(words[i]);
    await drive.key("Escape");
    await drive.settleMotion();
  }
  e = await els();
  check(e.length == 5, "three text boxes: " + e.length);
  const ids = e.slice(2).map((x) => x.id);
  await clickOn(130, 300 + 5);
  await clickOn(530, 340 + 5, { modifiers: ["Shift"] });
  await clickOn(890, 320 + 5, { modifiers: ["Shift"] });
  check((await rd("app.ed.selection")).length == 3, "shift-click adds: " + JSON.stringify(await rd("app.ed.selection")));
  await drive.click(INS + '.pane.arrangeSec."Align tops"');
  await drive.click(INS + '.pane.arrangeSec."Distribute across"');
  await drive.settleMotion();
  e = await els();
  const three = ids.map((id) => e.find((x) => x.id == id));
  check(three.every((x) => Math.abs(x.y - three[0].y) < 0.01), "tops aligned: " + three.map((x) => x.y));
  const gaps = [three[1].x - (three[0].x + three[0].width), three[2].x - (three[1].x + three[1].width)];
  check(Math.abs(gaps[0] - gaps[1]) < 0.05, "evenly spread: " + gaps);
  await page.screenshot({ path: "/tmp/flow-2-three.png" });

  // ── A circle and a label, grouped, moved, then undone twice
  await tool("Ellipse");
  await clickOn(300, 560);
  await tool("Text");
  await clickOn(420, 560);
  await drive.type("Growth");
  await drive.key("Escape");
  await drive.settleMotion();
  e = await els();
  const circle = e[e.length - 2], label = e[e.length - 1];
  check(circle.kind == "ellipse" && label.kind == "text", "circle and label: " + e.map((x) => x.kind));
  await clickOn(300, 560);
  await clickOn(430, 560, { modifiers: ["Shift"] });
  await drive.key("Mod+G");
  await drive.settleMotion();
  e = await els();
  const g = e[e.length - 1];
  check(g.kind == "group" && g.children.length == 2, "grouped: " + JSON.stringify(e.map((x) => x.kind)));
  const before = JSON.stringify(e);
  await dragOn(300, 560, 500, 520);
  e = await els();
  const moved = e.find((x) => x.kind == "group");
  check(moved && Math.abs(moved.children[0].x - (circle.x + 200)) < 14, "the group moved as one: " + JSON.stringify(moved && moved.children[0]));
  await drive.key("Mod+Z");
  await drive.settleMotion();
  check(JSON.stringify(await els()) == before, "undo puts the group back where it was");
  check((await rd("app.ed.selection")).join() == g.id, "and selects it as it was");
  await drive.key("Mod+Z");
  await drive.settleMotion();
  e = await els();
  check(!e.some((x) => x.kind == "group") && e.length == 7, "undo again ungroups: " + e.map((x) => x.kind));
  await page.screenshot({ path: "/tmp/flow-3-group.png" });

  // ── The slide duplicated, the copy's title changed, the copy dragged above
  const firstId = (await doc()).slides[0].id;
  await drive.click('app.shell.editor.bar."Slide"');
  await drive.settleMotion();
  await drive.click('app.slideMenu."Duplicate slide"');
  await drive.settleMotion();
  let d = await doc();
  check(d.slides.length == 2, "duplicated: " + d.slides.length);
  const copyId = d.slides[1].id;
  check((await rd("app.ed.currentId")) == copyId, "the copy is the slide being edited");
  {
    const gg = await geo();
    const [a, b] = pt(gg, 640, 80);
    await drive.dblclick(C, a, b);
    await drive.settleMotion();
  }
  check((await rd("app.ed.editingId")) != "", "double-click edits the title in place");
  await drive.key("Mod+A");
  await drive.type("Quarterly review: the plan");
  await clickOn(640, 700);
  check((await rd("app.ed.editingId")) == "", "a click elsewhere ends editing");
  e = await els();
  check(e[1].text.content == "Quarterly review: the plan", "the copy's title changed: " + e[1].text.content);
  d = await doc();
  check(d.slides[0].elements[1].text.content == "Quarterly review", "the original keeps its title");
  await drive.press("app.shell.editor.body.rail.list.1", 100, 40);
  await drive.moveBy(0, -30);
  await drive.moveBy(0, -60);
  await page.screenshot({ path: "/tmp/flow-4-dragging.png" });
  await drive.release();
  await drive.settleMotion();
  d = await doc();
  check(d.slides[0].id == (await rd("app.ed.currentId")) && d.slides[1].id == firstId, "the copy is now first: " + d.slides.map((x) => x.id));
  await page.screenshot({ path: "/tmp/flow-5-reordered.png" });

  // ── Presenting from the start; the arrow keys go through
  await drive.click('app.shell.editor.bar."Slide"');
  await drive.settleMotion();
  await drive.click('app.slideMenu."Present from the start"');
  await drive.settleMotion();
  check(await rd("app.presenting"), "presenting");
  check((await rd("app.at")) == 0, "from the start");
  await page.screenshot({ path: "/tmp/flow-6-present.png" });
  await drive.key("ArrowRight");
  check((await rd("app.at")) == 1, "the arrow key goes on");
  await drive.key("ArrowLeft");
  await drive.key("Space");
  check((await rd("app.at")) == 1, "space goes on");
  await drive.key("Escape");
  await drive.settleMotion();
  check(!(await rd("app.presenting")), "Escape ends presenting");
  check((await rd("app.ed.currentId")) == firstId, "back on the slide it ended on");

  // ── Every change saved without a thought
  await drive.wait(1500);
  await drive.settleData();
  await expect.text("app.shell.editor.bar.status", "All changes saved");
  const deckId = await rd("app.openId");
  const server = await page.evaluate(async (u) => (await (await fetch(u)).json()), API + "/api/decks/" + deckId + "/slides");
  d = await doc();
  check(server.slides.map((x) => x.id).join() == d.slides.map((x) => x.id).join(), "the service has the order");
  for (let i = 0; i < d.slides.length; i++)
    check(JSON.stringify(server.slides[i].elements) == JSON.stringify(d.slides[i].elements), "the service has slide " + (i + 1));

  // ── Meanwhile a colleague edits the second slide in another window
  const theirs = server.slides[1];
  const edited = { ...theirs, elements: [...theirs.elements, { id: "colleague", kind: "rect", x: 900, y: 500, width: 200, height: 120,
    fill: "#3DD68C", stroke: null, cornerRadius: 24, keepProportions: false }] };
  const put = await page.evaluate(async (u, body) => (await fetch(u, { method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify(body) })).status, API + "/api/slides/" + theirs.id, { version: theirs.version, background: edited.background, elements: edited.elements });
  check(put == 200, "the colleague's save: " + put);
  await drive.click("app.shell.editor.body.rail.list.0");
  await drive.settleData();
  await drive.click("app.shell.editor.body.rail.list.1");
  await drive.settleData();
  await drive.wait(500);
  await drive.settleData();
  await drive.settleMotion();
  await expect.visible(C + ".banner");
  await page.screenshot({ path: "/tmp/flow-7-conflict.png" });
  await drive.click(C + '.banner."Use their version"');
  await drive.settleMotion();
  e = await els();
  check(e.some((x) => x.id == "colleague"), "their version is on screen");
  await drive.wait(1500);
  await drive.settleData();
  await expect.text("app.shell.editor.bar.status", "All changes saved");

  // ── Back to the list; the presentation is there; then it is deleted, asked first
  await drive.click("app.shell.editor.bar.home");
  await drive.settleData();
  await drive.settleMotion();
  await page.screenshot({ path: "/tmp/flow-8-list.png" });
  const titles = await page.evaluate(() => JSON.parse(JSON.stringify(window.__declare.find("app.library").value.decks.map((x) => x.title))));
  check(titles.includes("Quarterly review"), "listed: " + titles);
  } finally {
    await page.evaluate(async (u) => { await fetch(u, { method: "DELETE" }) }, API + "/api/decks/" + made);
  }
};
