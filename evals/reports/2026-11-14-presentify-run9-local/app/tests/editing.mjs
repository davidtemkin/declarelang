// Direct manipulation and its undo, the inspector's mixed values, the
// clipboard across slides and presentations, and saving when the service
// can't be reached. Makes its own presentations through the service and
// deletes them at the end.
//
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/editing.mjs

const C = "app.shell.editor.body.canvas";
const H = C + ".overlay.handles";
const INS = "app.shell.editor.body.inspector";
const API = "http://127.0.0.1:8360";
const HANDLE = { nw: 0, n: 1, ne: 2, e: 3, se: 4, s: 5, sw: 6, w: 7, p1: 8, p2: 9, radius: 10 };

export default async ({ drive, expect, page }) => {
  const rd = (p) => drive.read(p);
  const els = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__declare.find("app.ed").els)));
  const el = async (id) => (await els()).find((x) => x.id == id);
  const sel = async () => JSON.parse(JSON.stringify(await rd("app.ed.selection")));
  const geo = async () => ({ s: await rd(C + ".s"), sx: await rd(C + ".sx"), sy: await rd(C + ".sy") });
  const at = async (x, y) => { const g = await geo(); return [g.sx + x * g.s, g.sy + y * g.s]; };
  const clickOn = async (x, y, opts) => { const [a, b] = await at(x, y); await drive.clickAt(C, a, b, opts); await drive.settleMotion(); };
  const dragOn = async (x0, y0, x1, y1) => {
    const [a, b] = await at(x0, y0), [c, d] = await at(x1, y1);
    await drive.press(C, a, b); await drive.moveBy((c - a) / 2, (d - b) / 2); await drive.moveBy((c - a) / 2, (d - b) / 2);
    await drive.release(); await drive.settleMotion();
  };
  const handle = async (h, dx, dy, mods) => {
    const path = H + "." + HANDLE[h];
    if (mods) await page.keyboard.down("Shift");
    await drive.press(path); await drive.moveBy(dx / 2, dy / 2); await drive.moveBy(dx / 2, dy / 2); await drive.release();
    if (mods) await page.keyboard.up("Shift");
    await drive.settleMotion();
  };
  const check = (cond, what) => { if (!cond) throw new Error(what); };
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const post = (path, body) => page.evaluate(async (u, b) => (await (await fetch(u, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json()), API + path, body);

  // ── a presentation to work in: a rounded rectangle, a circle, a text box; an empty second slide
  const made = await post("/api/decks", { title: "Editing check" });
  const deckId = made.deck.id, s1 = made.slides[0].id;
  await page.evaluate(async (u, b) => fetch(u, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }),
    API + "/api/slides/" + s1, { version: made.slides[0].version, background: "#FFFFFF", elements: [
      { id: "r1", kind: "rect", x: 100, y: 100, width: 400, height: 200, fill: "#4C7DFF", stroke: null, cornerRadius: 40, keepProportions: false },
      { id: "o1", kind: "ellipse", x: 700, y: 100, width: 200, height: 200, fill: "#FF5F3A", stroke: { color: "#1F2328", width: 4 }, keepProportions: true },
      { id: "t1", kind: "text", x: 100, y: 420, width: 500, height: 40, keepProportions: false,
        text: { content: "Hello", font: "Inter", size: 32, weight: 400, italic: false, color: "#1F2328", align: "left" } } ] });
  const second = await post("/api/decks/" + deckId + "/slides", {});
  const other = await post("/api/decks", { title: "Paste target" });
  try {
  await drive.set("app", "location", "deck/" + deckId);
  await drive.settleData();
  await drive.settleMotion();
  check((await els()).length == 3, "opened with its three elements");

  // ── resizing: a side handle changes one side; a rounded rectangle keeps its corners
  await clickOn(300, 200);
  check((await sel()).join() == "r1", "a click selects one thing");
  const g = await geo();
  await handle("e", 100 * g.s, 0);
  let r = await el("r1");
  check(near(r.width, 500, 2) && near(r.height, 200) && r.cornerRadius == 40, "wider, corners kept: " + JSON.stringify(r));
  await drive.key("Mod+Z");
  await drive.settleMotion();
  r = await el("r1");
  check(near(r.width, 400), "undo the resize: " + r.width);

  // shift on a corner keeps proportions
  await handle("se", 100 * g.s, 20 * g.s, true);
  r = await el("r1");
  check(near(r.width / r.height, 2, 0.02), "shift keeps 2:1: " + r.width + "x" + r.height);
  await drive.key("Mod+Z");

  // the radius handle rounds the corners
  await drive.settleMotion();
  await handle("radius", 30 * g.s, 30 * g.s);
  r = await el("r1");
  check(r.cornerRadius > 55 && r.cornerRadius < 80, "radius dragged: " + r.cornerRadius);
  await drive.key("Mod+Z");
  await drive.settleMotion();

  // the circle keeps its proportions without a key, and shift lets it change once
  await clickOn(800, 200);
  await handle("se", 60 * g.s, 0);
  let o = await el("o1");
  check(near(o.width, o.height, 1) && o.width > 240, "a circle stays round: " + o.width + "x" + o.height);
  await handle("e", 60 * g.s, 0, true);
  o = await el("o1");
  check(o.width > o.height + 40, "shift lets it change: " + o.width + "x" + o.height);
  await drive.key("Mod+Z");
  await drive.key("Mod+Z");
  await drive.settleMotion();

  // ── drawing with shift makes a square that keeps its proportions
  await drive.click(C + ".tools.Rectangle");
  const [a0, b0] = await at(200, 520), [a1, b1] = await at(330, 690);
  await drive.press(C, a0, b0);
  await page.keyboard.down("Shift");
  await drive.moveBy((a1 - a0) / 2, (b1 - b0) / 2); await drive.moveBy((a1 - a0) / 2, (b1 - b0) / 2);
  await drive.release();
  await page.keyboard.up("Shift");
  await drive.settleMotion();
  let all = await els();
  const sq = all[all.length - 1];
  check(sq.kind == "rect" && near(sq.width, sq.height, 0.5) && sq.keepProportions === true, "a square, kept: " + JSON.stringify(sq));
  await drive.key("Mod+Z");
  await drive.settleMotion();
  check((await els()).length == 3, "undo the drawing");

  // ── a line has a handle at each end
  await drive.click(C + ".tools.Line");
  await dragOn(700, 500, 1100, 600);
  all = await els();
  const ln = all[all.length - 1];
  check(ln.kind == "line" && near(ln.x2, 1100, 1) && near(ln.y2, 600, 1), "a line: " + JSON.stringify(ln));
  await expect.visible(H + "." + HANDLE.p2);
  await handle("p2", 0, -100 * g.s);
  const ln2 = (await els()).find((x) => x.id == ln.id);
  check(near(ln2.y2, 500, 2) && near(ln2.x1, 700, 0.5), "an end moved: " + JSON.stringify(ln2));

  // ── moving by keys, deleting, Escape
  await clickOn(300, 200);
  await drive.key("ArrowRight");
  await drive.key("Shift+ArrowDown");
  r = await el("r1");
  check(near(r.x, 101, 0.01) && near(r.y, 110, 0.01), "nudged 1 and 10: " + r.x + "," + r.y);
  await drive.key("Escape");
  check((await sel()).length == 0, "Escape clears the selection");

  // ── the marquee, and the inspector with differing values
  await dragOn(60, 60, 960, 330);
  check((await sel()).sort().join() == "o1,r1", "the marquee takes what it touches: " + (await sel()));
  await expect.text(INS + ".pane.fillSec", "Mixed");
  await drive.click(INS + '.pane.fillSec."Fill colour"');
  await drive.settleMotion();
  await drive.click('app.colorPop.grid."#3DD68C"');
  await drive.key("Escape");
  await drive.settleMotion();
  check((await el("r1")).fill == "#3DD68C" && (await el("o1")).fill == "#3DD68C", "a change applies to all");
  await expect.text(INS + ".pane.fillSec", "#3DD68C");
  await drive.key("Mod+Z");
  await drive.settleMotion();
  check((await el("r1")).fill == "#4C7DFF" && (await el("o1")).fill == "#FF5F3A", "styling undone, each as it was");

  // ── stacking order
  await clickOn(300, 200);
  await drive.click('app.shell.editor.bar."Arrange"');
  await drive.settleMotion();
  await drive.click('app.arrangeMenu."Bring to front"');
  await drive.settleMotion();
  all = await els();
  check(all[all.length - 1].id == "r1", "brought to front: " + all.map((x) => x.id));
  await drive.key("Mod+Z");

  // ── groups: a double-click picks a part; ungroup leaves each where it was
  await drive.settleMotion();
  await clickOn(300, 200);
  await clickOn(800, 200, { modifiers: ["Shift"] });
  await drive.key("Mod+G");
  await drive.settleMotion();
  const gid = (await sel())[0];
  {
    const [a, b] = await at(800, 200);
    await drive.dblclick(C, a, b);
    await drive.settleMotion();
  }
  check((await sel()).join() == "o1", "a double-click selects inside the group: " + (await sel()));
  await drive.key("Escape");
  check((await sel()).join() == gid, "Escape leaves the group, selecting it");
  const beforeUngroup = (await el(gid)).children.map((x) => JSON.stringify(x));
  await drive.key("Mod+Shift+G");
  await drive.settleMotion();
  check(JSON.stringify(await el("r1")) == beforeUngroup[0] && JSON.stringify(await el("o1")) == beforeUngroup[1], "ungrouped, each where it was");

  // ── a text box left empty disappears, leaving nothing to undo
  const depth = (await rd("app.history.undos")).length;
  await drive.click(C + ".tools.Text");
  await clickOn(900, 650);
  check((await rd("app.ed.editingId")) != "", "a click with Text starts typing");
  await drive.key("Escape");
  await drive.settleMotion();
  check(!(await els()).some((x) => x.kind == "text" && x.text.content == ""), "the empty box is gone");
  check((await rd("app.history.undos")).length == depth, "and left no step");

  // typing is one step
  {
    const [a, b] = await at(150, 435);
    await drive.dblclick(C, a, b);
    await drive.settleMotion();
  }
  await drive.key("End");
  await drive.type(", world");
  await drive.key("Escape");
  await drive.settleMotion();
  check((await el("t1")).text.content == "Hello, world", "typed: " + (await el("t1")).text.content);
  await drive.key("Mod+Z");
  await drive.settleMotion();
  check((await el("t1")).text.content == "Hello", "a run of typing undoes as one step: " + (await el("t1")).text.content);

  // ── slides: add, delete, reorder, each undoable
  await drive.click("app.shell.editor.body.rail.head.\"New slide\"");
  await drive.settleMotion();
  let n = (await page.evaluate(() => window.__declare.find("app.doc").value.slides.length));
  check(n == 3, "a slide added after the current one: " + n);
  await drive.key("Mod+Z");
  await drive.settleMotion();
  n = await page.evaluate(() => window.__declare.find("app.doc").value.slides.length);
  check(n == 2, "and undone: " + n);
  await drive.click("app.shell.editor.body.rail.list.1");
  await drive.key("Delete");
  await drive.settleMotion();
  n = await page.evaluate(() => window.__declare.find("app.doc").value.slides.length);
  check(n == 1, "a slide deleted from the list: " + n);
  await drive.key("Delete");
  n = await page.evaluate(() => window.__declare.find("app.doc").value.slides.length);
  check(n == 1, "the last slide can't be deleted");
  await drive.key("Mod+Z");
  await drive.settleMotion();
  n = await page.evaluate(() => window.__declare.find("app.doc").value.slides.length);
  check(n == 2, "deleting undone: " + n);

  // ── copy here, paste on another slide, and in another presentation
  await drive.click("app.shell.editor.body.rail.list.0");
  await clickOn(300, 200);
  await drive.key("Mod+C");
  await drive.click("app.shell.editor.body.rail.list.1");
  await clickOn(640, 360);
  await drive.key("Mod+V");
  await drive.settleMotion();
  all = await els();
  check(all.length == 1 && all[0].kind == "rect" && all[0].id != "r1" && all[0].x == 125, "pasted on another slide, offset: " + JSON.stringify(all));
  check((await sel()).join() == all[0].id, "and selected");

  // ── Command-S sends at once, without waiting for a pause
  await drive.wait(1500);
  await drive.settleData();
  await drive.key("ArrowLeft");
  await drive.key("Mod+S");
  await drive.settleData();
  await expect.text("app.shell.editor.bar.status", "All changes saved");
  await drive.key("ArrowRight");

  // ── nothing is lost when the service can't be reached
  await drive.wait(1500);
  await drive.settleData();
  await page.setOfflineMode(true);
  await drive.key("ArrowRight");
  await drive.wait(1200);
  await drive.waitReal(400);
  await drive.wait(200);
  await expect.text("app.shell.editor.bar.status", "Not saved: can't reach the service");
  await page.screenshot({ path: "/tmp/edit-offline.png" });
  await page.setOfflineMode(false);
  await drive.wait(4000);
  await drive.waitReal(600);
  await drive.wait(3000);
  await drive.settleData();
  await expect.text("app.shell.editor.bar.status", "All changes saved");
  const srv = await page.evaluate(async (u) => (await (await fetch(u)).json()), API + "/api/slides/" + second.slide.id);
  check(srv.elements.length == 1 && srv.elements[0].x == 126, "the change made offline reached the service: " + JSON.stringify(srv.elements));

  // paste in another presentation
  await drive.click("app.shell.editor.bar.home");
  await drive.settleData();
  await drive.settleMotion();
  await drive.set("app", "location", "deck/" + other.deck.id);
  await drive.settleData();
  await drive.settleMotion();
  await clickOn(640, 360);
  await drive.key("Mod+V");
  await drive.settleMotion();
  all = await els();
  check(all.length == 1 && all[0].kind == "rect" && all[0].cornerRadius == 40, "pasted in another presentation: " + JSON.stringify(all));
  await drive.wait(1500);
  await drive.settleData();
  await expect.text("app.shell.editor.bar.status", "All changes saved");

  } finally {
    await page.setOfflineMode(false);
    for (const id of [deckId, other.deck.id])
      await page.evaluate(async (u) => { await fetch(u, { method: "DELETE" }); }, API + "/api/decks/" + id);
  }
};
