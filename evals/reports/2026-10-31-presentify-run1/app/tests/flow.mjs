// The brief's "what done looks like", driven as a person would:
// npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/flow.mjs
//
// It talks to the live service on port 8360: it creates a presentation
// called "Quarterly review" and deletes it at the end.

const STAGE = "app.editor.body.middle.stage";
const TOOLS = "app.editor.body.middle.tools.toolset";
const INSP = "app.editor.body.inspector";

export default async ({ drive, expect }) => {
  const read = (path, attr) => drive.page.evaluate(([p, a]) => {
    const j = JSON.stringify(window.__declare.find(p)[a]);
    return j === undefined ? null : JSON.parse(j);
  }, [path, attr]);

  // slide points → a point inside the stage view
  const at = async (x, y) => {
    const s = await read(STAGE, "s"), ox = await read(STAGE, "ox"), oy = await read(STAGE, "oy");
    return [ox + x * s, oy + y * s];
  };
  const pressAt = async (x, y) => { const [px, py] = await at(x, y); await drive.press(STAGE, px, py); };
  const clickAt = async (x, y) => { const [px, py] = await at(x, y); await drive.clickAt(STAGE, px, py); };
  const dragOnSlide = async (x0, y0, x1, y1) => {
    const s = await read(STAGE, "s");
    await pressAt(x0, y0);
    await drive.moveBy((x1 - x0) * s / 2, (y1 - y0) * s / 2);
    await drive.moveBy((x1 - x0) * s / 2, (y1 - y0) * s / 2);
    await drive.release();
  };
  const items = async () => (await read("app.doc", "items")) ?? [];
  const sel = async () => (await read("app.doc", "sel")) ?? [];
  const saved = async () => { await drive.wait(1500); await drive.settleData(); await drive.wait(800); await drive.settleData(); };

  // ── a new presentation, opened straight into editing, one empty slide
  await drive.settleData();
  await drive.click('app.listing.bar."New presentation"');
  await drive.settleData();
  await drive.wait(100);
  await drive.settleData();
  await expect.attr("app", "inEditor", true);
  await expect.attr("app.doc", "ready", true);
  await expect.equal(await drive.page.evaluate(() => window.__declare.find("app.doc").pages().length), 1);

  // ── named "Quarterly review"
  await drive.selectAll("app.editor.head.title");
  await drive.type("Quarterly review");
  await drive.key("Enter");
  await expect.attr("app.doc", "title", "Quarterly review");

  // ── a dark rectangle across the top
  await drive.click(`${TOOLS}.Rectangle`);
  await dragOnSlide(0, 0, 1280, 180);
  let els = await items();
  await expect.equal(els.length, 1);
  await expect.equal(els[0].kind, "rect");
  await drive.click(`${INSP}.itemPane.Fill`);              // the Fill well
  await drive.wait(400);
  await drive.click('app.palette."#1F2328"');
  await drive.wait(400);
  els = await items();
  await expect.equal(els[0].fill, "#1F2328");

  // ── a title typed into it: white, centred, 48 point
  await drive.click(`${TOOLS}.Text`);
  await dragOnSlide(140, 50, 1140, 110);
  await drive.wait(50);
  await drive.type("Quarterly review");
  await drive.key("Escape");
  await drive.wait(50);
  els = await items();
  await expect.equal(els.length, 2);
  await expect.equal(els[1].text.content, "Quarterly review");
  await drive.click(`${INSP}.itemPane.textRows."Text colour"`);
  await drive.wait(400);
  await drive.click('app.palette."#FFFFFF"');
  await drive.wait(400);
  await drive.click(`${INSP}.itemPane.textRows."Align centre"`);
  await drive.selectAll(`${INSP}.itemPane.textRows."Text size"`);
  await drive.type("48");
  await drive.key("Enter");
  els = await items();
  await expect.equal(els[1].text.color, "#FFFFFF");
  await expect.equal(els[1].text.align, "center");
  await expect.equal(els[1].text.size, 48);

  // ── three text boxes side by side; tops aligned, spread evenly
  const words = ["Revenue", "Customers", "Hiring"];
  const xs = [120, 520, 980], ys = [300, 330, 310];
  for (let i = 0; i < 3; i++) {
    await drive.click(`${TOOLS}.Text`);
    await dragOnSlide(xs[i], ys[i], xs[i] + 220, ys[i] + 40);
    await drive.wait(50);
    await drive.type(words[i]);
    await drive.key("Escape");
    await drive.wait(50);
  }
  els = await items();
  await expect.equal(els.length, 5);
  const ids = els.slice(2).map((e) => e.id);
  await clickAt(xs[0] + 110, ys[0] + 20);
  await drive.key("Shift+ArrowLeft"); await drive.key("Shift+ArrowRight");   // nudge out and back: two steps
  const [p1x, p1y] = await at(xs[1] + 110, ys[1] + 20);
  await drive.page.keyboard.down("Shift");
  await drive.clickAt(STAGE, p1x, p1y);
  const [p2x, p2y] = await at(xs[2] + 110, ys[2] + 20);
  await drive.clickAt(STAGE, p2x, p2y);
  await drive.page.keyboard.up("Shift");
  await expect.equal((await sel()).length, 3);
  await drive.click(`${INSP}.itemPane."Align tops"`);
  await drive.click(`${INSP}.itemPane."Distribute across"`);
  els = await items();
  const three = ids.map((id) => els.find((e) => e.id === id));
  await expect.equal(three[0].y === three[1].y && three[1].y === three[2].y, true);
  const gap1 = three[1].x - (three[0].x + three[0].width), gap2 = three[2].x - (three[1].x + three[1].width);
  await expect.equal(Math.abs(gap1 - gap2) < 0.05, true);

  // ── a circle and a label, grouped, moved — then undo, twice
  await drive.key("Escape");
  await drive.click(`${TOOLS}.Ellipse`);
  await drive.page.keyboard.down("Shift");
  await dragOnSlide(160, 480, 260, 560);
  await drive.page.keyboard.up("Shift");
  els = await items();
  const circle = els[els.length - 1];
  await expect.equal(circle.width, circle.height);
  await expect.equal(circle.keepProportions, true);
  await drive.click(`${TOOLS}.Text`);
  await dragOnSlide(290, 500, 600, 540);
  await drive.wait(50);
  await drive.type("Our team");
  await drive.key("Escape");
  await drive.wait(50);
  els = await items();
  const label = els[els.length - 1];
  await drive.set("app.doc", "sel", [circle.id, label.id]);
  await drive.key("Meta+G");
  els = await items();
  const group = els[els.length - 1];
  await expect.equal(group.kind, "group");
  const before = JSON.stringify(els);
  await dragOnSlide(200, 520, 400, 420);
  const afterMove = JSON.stringify(await items());
  await expect.equal(afterMove !== before, true);
  await drive.key("Meta+Z");                                  // the move
  await expect.equal(JSON.stringify(await items()), before);
  await drive.key("Meta+Z");                                  // the grouping
  els = await items();
  await expect.equal(els.some((e) => e.kind === "group"), false);
  await expect.equal((await sel()).sort().join(), [circle.id, label.id].sort().join());

  await saved();
  await expect.text("app.editor.head", "All changes saved");

  // ── duplicate the slide, retitle the copy, drag it above the original
  await drive.click('app.editor.body.rail.foot."Duplicate slide"');
  await expect.attr("app.doc", "currentIndex", 1);
  els = await items();
  const titleBox = els.find((e) => e.kind === "text" && e.text.content === "Quarterly review");
  await drive.clickAt(STAGE, 8, 8);                           // the stage takes the keyboard
  await drive.set("app.doc", "sel", [titleBox.id]);
  await drive.key("Enter");                                   // edit the selected text box
  await drive.wait(50);
  await drive.key("Meta+A");
  await drive.type("Quarterly review — detail");
  await drive.key("Escape");
  await drive.wait(50);
  const copyId = await read("app.doc", "current");
  await drive.press("app.editor.body.rail.list.1");
  await drive.moveBy(0, -40);
  await drive.moveBy(0, -60);
  await drive.release();
  const pages = await drive.page.evaluate(() => window.__declare.find("app.doc").pages().map((p) => p.id));
  await expect.equal(pages[0], copyId);
  await saved();
  await expect.text("app.editor.head", "All changes saved");

  // ── present from the start; the arrows take them through
  await drive.click('app.editor.head.menus.Slide');
  await drive.wait(300);
  await drive.click('app.editor.head.menus."Present from Start"');
  await drive.wait(300);
  await expect.attr("app", "presenting", true);
  await expect.attr("app", "showAt", 0);
  await drive.key("ArrowRight");
  await expect.attr("app", "showAt", 1);
  await drive.key("Escape");
  await expect.attr("app", "presenting", false);
  await expect.attr("app.doc", "currentIndex", 1);

  // ── a colleague edits slide 1 in another window; returning, they're told
  const deckId = await read("app.doc", "deckId");
  const sid = await drive.page.evaluate(() => window.__declare.find("app.doc").pages()[0].sid);
  await drive.page.evaluate(async (id) => {
    const s = await (await fetch("http://127.0.0.1:8360/api/slides/" + id)).json();
    s.elements = s.elements.concat([{ id: "colleague", kind: "rect", x: 900, y: 600, width: 200, height: 80,
      fill: "#E5484D", stroke: null, cornerRadius: 12, keepProportions: false }]);
    await fetch("http://127.0.0.1:8360/api/slides/" + id, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: s.version, background: s.background, elements: s.elements }) });
    return null;
  }, sid);
  await drive.click("app.editor.body.rail.list.0");
  await drive.settleData();
  await drive.wait(100);
  await expect.visible("app.editor.body.middle.clash");
  await drive.click('app.editor.body.middle.clash."Use their version"');
  els = await items();
  await expect.equal(els.some((e) => e.id === "colleague"), true);
  await expect.hidden("app.editor.body.middle.clash");

  // ── every change saved without their thinking about it
  await saved();
  await expect.text("app.editor.head", "All changes saved");
  const server = await drive.page.evaluate(async (id) =>
    (await (await fetch("http://127.0.0.1:8360/api/decks/" + id)).json()), deckId);
  await expect.equal(server.title, "Quarterly review");
  await expect.equal(server.slideOrder.length, 2);

  // tidy the service: this run's presentation goes
  await drive.page.evaluate(async (id) => { await fetch("http://127.0.0.1:8360/api/decks/" + id, { method: "DELETE" }); return null; }, deckId);
};
