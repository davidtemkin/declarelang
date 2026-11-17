// The brief's "what done looks like", driven as a person would, against the
// running service: npx declare-verify presentify.declare --url <dev address> --assert tests/assert.mjs
//
// It makes a presentation called "Quarterly review" and deletes it at the end.

const API = "http://127.0.0.1:8360";

export default async ({ drive, expect, page }) => {
  const app = (expr) => page.evaluate(`(() => { const app = window.__declare.find("app"); return JSON.parse(JSON.stringify(${expr})) })()`);
  const els = () => app("app.ed.els");
  const s = await app("app.stageScale") || 0;
  const frame = "app.editor.body.stage.frame";
  const catcher = frame + ".catcher";
  // slide points → a point in the frame
  const at = async (x, y) => { const k = await app("app.stageScale"); return [x * k, y * k]; };

  // ── a new presentation, named
  await page.getByRole("button", { name: "New presentation" }).first().click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.visible("app.editor");
  await expect.equal(await app("app.doc.all().length"), 1);
  await drive.type("Quarterly review");
  await drive.key("Enter");
  await expect.equal(await app("app.doc.deck().title"), "Quarterly review");
  const deckId = await app("app.location");
  try {

  // ── a dark rectangle across the top
  await drive.click("app.editor.bar.tools.Rectangle");
  let [px, py] = await at(0, 0);
  await drive.press(catcher, px + 1, py + 1);
  let [qx, qy] = await at(1280, 170);
  await drive.moveBy(qx / 2, qy / 2);
  await drive.moveBy(qx / 2 - 2, qy / 2 - 2);
  await drive.release();
  let e = await els();
  await expect.equal(e.length, 1);
  await expect.equal(e[0].kind, "rect");
  await page.getByRole("button", { name: "Fill colour" }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "#1F2328" }).last().click();
  await drive.settleMotion();
  e = await els();
  await expect.equal(e[0].fill, "#1F2328");
  const rect = e[0];

  // ── a title typed into it, white, centred, 48 point
  await drive.click("app.editor.bar.tools.Text");
  [px, py] = await at(140, 40);
  await drive.press(catcher, px, py);
  [qx, qy] = await at(1000, 80);
  await drive.moveBy(qx, qy);
  await drive.release();
  await drive.settleMotion();
  await expect.equal((await app("app.editingId")) != "", true);
  await drive.type("Quarterly review");
  await drive.key("Escape");
  await drive.settleMotion();
  e = await els();
  const title = e.find((x) => x.kind == "text");
  await expect.equal(title.text.content, "Quarterly review");
  await expect.equal(await app("app.selection"), [title.id]);
  await page.getByRole("button", { name: "Text colour" }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "#FFFFFF" }).last().click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "Centre text" }).click();
  await page.getByLabel("Text size").fill("48");
  await page.getByLabel("Text size").press("Enter");
  e = await els();
  const t2 = e.find((x) => x.id == title.id).text;
  await expect.equal([t2.color, t2.align, t2.size], ["#FFFFFF", "center", 48]);

  // ── three text boxes side by side below it
  const words = ["Revenue", "Customers", "Team"];
  const spots = [[100, 300], [500, 340], [880, 320]];
  for (let i = 0; i < 3; i++) {
    await drive.click("app.editor.bar.tools.Text");
    [px, py] = await at(spots[i][0], spots[i][1]);
    await drive.clickAt(catcher, px, py);
    await drive.settleMotion();
    await drive.type(words[i]);
    await drive.key("Escape");
  }
  e = await els();
  await expect.equal(e.filter((x) => x.kind == "text").length, 4);
  // drag a box on empty slide around the three
  [px, py] = await at(60, 250);
  await drive.press(frame, px, py);
  [qx, qy] = await at(1220, 200);
  await drive.moveBy(qx / 2, qy / 2);
  await drive.moveBy(qx / 2, qy / 2);
  await drive.release();
  await expect.equal((await app("app.selection")).length, 3);
  await page.getByRole("button", { name: "Align tops" }).click();
  await page.getByRole("button", { name: "Distribute evenly across" }).click();
  e = await els();
  const three = e.filter((x) => words.includes(x.text?.content)).sort((a, b) => a.x - b.x);
  await expect.equal(new Set(three.map((x) => x.y)).size, 1);
  const gap1 = three[1].x - (three[0].x + three[0].width), gap2 = three[2].x - (three[1].x + three[1].width);
  await expect.equal(Math.abs(gap1 - gap2) < 0.6, true);

  // ── a circle and a label, grouped, moved, and both undone
  await drive.click("app.editor.bar.tools.Ellipse");
  [px, py] = await at(100, 480);
  await drive.press(catcher, px, py);
  await page.keyboard.down("Shift");
  [qx, qy] = await at(140, 100);
  await drive.moveBy(qx, qy);
  await drive.release();
  await page.keyboard.up("Shift");
  e = await els();
  const circle = e[e.length - 1];
  await expect.equal([circle.kind, circle.width == circle.height, circle.keepProportions], ["ellipse", true, true]);
  await drive.click("app.editor.bar.tools.Text");
  [px, py] = await at(280, 520);
  await drive.clickAt(catcher, px, py);
  await drive.type("Growth");
  await drive.key("Escape");
  e = await els();
  const label = e[e.length - 1];
  [px, py] = await at(circle.x + circle.width / 2, circle.y + circle.height / 2);
  await drive.clickAt(frame, px, py);
  [px, py] = await at(label.x + 30, label.y + 15);
  await drive.clickAt(frame, px, py, { modifiers: ["Shift"] });
  await expect.equal((await app("app.selection")).length, 2);
  await drive.key("Mod+G");
  e = await els();
  const group = e.find((x) => x.kind == "group");
  await expect.equal(group.children.map((c) => c.id), [circle.id, label.id]);
  [px, py] = await at(circle.x + circle.width / 2, circle.y + circle.height / 2);
  await drive.press(frame, px, py);
  await drive.moveBy(40, 10);
  await drive.moveBy(40, 10);
  await drive.release();
  e = await els();
  const moved = e.find((x) => x.kind == "group").children[0];
  await expect.equal(moved.x > circle.x + 100, true);
  await drive.key("Mod+Z");
  await drive.key("Mod+Z");
  e = await els();
  await expect.equal(e.some((x) => x.kind == "group"), false);
  await expect.equal(e.find((x) => x.id == circle.id).x, circle.x);

  // ── the slide duplicated, the copy retitled and dragged above the original
  await drive.click("app.editor.bar.menus.Slide");
  await page.getByRole("menuitem", { name: "Duplicate Slide" }).click();
  await drive.settleMotion();
  await expect.equal(await app("app.doc.all().length"), 2);
  const original = await app("app.doc.all()[0].id");
  const copy = await app("app.doc.all()[1].id");
  await expect.equal(await app("app.current"), copy);
  [px, py] = await at(570, 60);
  await drive.dblclick(frame, px, py);
  await drive.settleMotion();
  await expect.equal((await app("app.editingId")) != "", true);
  await drive.key("Mod+A");
  await drive.type("Quarterly review: the plan");
  await drive.key("Escape");
  await drive.press("app.editor.body.film.list.rows.1", 100, 40);
  await drive.moveBy(0, -60);
  await drive.moveBy(0, -60);
  await drive.release();
  await drive.settleMotion();
  await expect.equal((await app("app.doc.order()"))[0], await app("app.current"));

  // ── presented from the start; the arrows go through; Escape returns
  await drive.click("app.editor.bar.menus.Slide");
  await page.getByRole("menuitem", { name: "Present from the Start" }).click();
  await drive.settleMotion();
  await expect.equal(await app("app.presenting"), true);
  await expect.equal(await app("app.presentAt"), 0);
  await drive.key("ArrowRight");
  await expect.equal(await app("app.presentAt"), 1);
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.equal(await app("app.presenting"), false);
  await expect.equal(await app("app.current"), (await app("app.doc.order()"))[1]);

  // ── everything reaches the service
  await drive.wait(2500);
  await drive.settleData();
  await drive.wait(1500);
  await drive.settleData();
  await expect.equal(await app("app.sync.statusText"), "All changes saved");
  const served = await page.evaluate(async (u) => (await (await fetch(u)).json()), `${API}/api/decks/${deckId}/slides`);
  const local = await app("app.doc.all().map((s) => ({ id: s.id, background: s.background, elements: s.elements }))");
  await expect.equal(served.slides.map((s) => ({ id: s.id, background: s.background, elements: s.elements })), local);

  // ── a colleague changes the second slide in another window
  const second = (await app("app.doc.order()"))[1];
  await drive.click("app.editor.body.film.list.rows.0");
  const theirs = await page.evaluate(async ([u, id]) => {
    const cur = await (await fetch(`${u}/api/slides/${id}`)).json();
    const r = await fetch(`${u}/api/slides/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: cur.version, background: "#FCE7DE", elements: cur.elements.slice(0, 1) }) });
    return r.json();
  }, [API, second]);
  await drive.click("app.editor.body.film.list.rows.1");
  await drive.settleData();
  await drive.wait(200);
  await drive.settleData();
  await expect.visible("app.editor.conflictSlot.conflict");
  await expect.text("app.editor.conflictSlot.conflict", "This slide was changed in another window.");
  await page.getByRole("button", { name: "Use their version" }).click();
  await drive.settleMotion();
  await expect.hidden("app.editor.conflictSlot.conflict");
  await expect.equal(await app("app.doc.body(app.current).background"), "#FCE7DE");
  await expect.equal((await els()).length, 1);
  await drive.wait(2500);
  await drive.settleData();
  await expect.equal(await app("app.sync.statusText"), "All changes saved");

  } finally {
    // tidy up: the presentation this made
    await page.evaluate(async ([u, id]) => fetch(`${u}/api/decks/${id}`, { method: "DELETE" }), [API, deckId]);
  }
};
