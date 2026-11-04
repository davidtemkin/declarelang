// The brief's "what done looks like", driven as a person would, against the
// running service. It makes its own presentation and deletes it at the end.
//
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/assert.mjs

export default async ({ drive, expect, page }) => {
  const read = (path, attr) => page.evaluate((p, a) => {
    const v = window.__declare.find(p)[a];
    return JSON.parse(JSON.stringify(v ?? null));
  }, path, attr);
  const call = async (expr) => { await page.evaluate((e) => new Function("app", e)(window.__declare.find("app")), expr); await drive.wait(30); };
  const stage = "app.editor.body.stage";
  const at = async (px, py) => {
    const ox = await read(stage, "ox"), oy = await read(stage, "oy"), k = await read(stage, "k");
    return [ox + px * k, oy + py * k, k];
  };
  const dragOnStage = async (x0, y0, x1, y1) => {
    const [sx, sy, k] = await at(x0, y0);
    await drive.press(stage, sx, sy);
    await drive.moveBy((x1 - x0) * k / 2, (y1 - y0) * k / 2);
    await drive.moveBy((x1 - x0) * k / 2, (y1 - y0) * k / 2);
    await drive.release();
    await drive.settleMotion();
  };
  const els = () => read("app", "els");

  // ── a new presentation, called "Quarterly review"
  await drive.settleData();
  await drive.click('app.home.bar."New presentation"');
  await drive.settleData();
  await drive.settleMotion();
  await drive.wait(500);
  await expect.attr("app", "ready", true);
  await expect.attr("app.doc", "count", 1);
  await drive.type("Quarterly review");
  await drive.key("Enter");
  await expect.attr("app.doc", "title", "Quarterly review");

  // ── a dark rectangle across the top, a white centred 48-point title in it
  await drive.click("app.editor.top.tools.Rectangle");
  await dragOnStage(0, 0, 1280, 170);
  let e = await els();
  expect.equal(e.length, 1);
  expect.equal(e[0].kind, "rect");
  expect.equal(e[0].width, 1280);
  await call('app.colourTarget = "fill"; app.pickColour("#14111C")');
  e = await els();
  expect.equal(e[0].fill, "#14111C");

  await drive.click("app.editor.top.tools.Text");
  await dragOnStage(140, 50, 1140, 120);
  await expect.attr("app", "editingId", (await els())[1].id);
  await drive.type("Quarterly review");
  await drive.key("Escape");
  await expect.attr("app", "editingId", "");
  await call('app.setTextField("color", "#FFFFFF", "Text Colour"); app.setTextField("align", "center", "Text Alignment"); app.setTextField("size", 48, "Text Size")');
  e = await els();
  expect.equal(e[1].text.content, "Quarterly review");
  expect.equal(e[1].text.color, "#FFFFFF");
  expect.equal(e[1].text.align, "center");
  expect.equal(e[1].text.size, 48);

  // ── three text boxes side by side, tops aligned, spread evenly
  const made = [];
  for (const [x, y] of [[120, 260], [500, 290], [900, 250]]) {
    await drive.wait(500);
    await drive.click("app.editor.top.tools.Text");
    const [sx, sy] = await at(x, y);
    await drive.clickAt(stage, sx, sy);
    await drive.type("Point " + (made.length + 1));
    await drive.key("Escape");
    made.push((await els()).at(-1).id);
  }
  await call(`app.select(${JSON.stringify(made)})`);
  await drive.click("app.editor.body.inspector.arrangeSec.\"Align tops\"");
  await drive.click("app.editor.body.inspector.arrangeSec.\"Distribute across\"");
  e = await els();
  const boxes = made.map((id) => e.find((x) => x.id == id));
  expect.equal(new Set(boxes.map((b) => b.y)).size, 1);
  const sorted = boxes.slice().sort((a, b) => a.x - b.x);
  const gap1 = sorted[1].x - (sorted[0].x + sorted[0].width), gap2 = sorted[2].x - (sorted[1].x + sorted[1].width);
  if (Math.abs(gap1 - gap2) > 1) throw new Error(`gaps differ: ${gap1} vs ${gap2} ` + JSON.stringify(boxes.map((b) => [b.x, b.y, b.width])));

  // ── a circle and a label, grouped, moved, then undone twice
  await drive.click("app.editor.top.tools.Ellipse");
  const [cx, cy] = await at(200, 480);
  await drive.press(stage, cx, cy, ); await drive.page.keyboard.down("Shift");
  const k = await read(stage, "k");
  await drive.moveBy(60 * k, 40 * k); await drive.moveBy(60 * k, 80 * k);
  await drive.release(); await drive.page.keyboard.up("Shift");
  await drive.settleMotion();
  e = await els();
  const circle = e.at(-1);
  expect.equal(circle.kind, "ellipse");
  expect.equal(circle.width, circle.height);
  expect.equal(circle.keepProportions, true);
  await drive.click("app.editor.top.tools.Text");
  const [lx, ly] = await at(360, 520);
  await drive.clickAt(stage, lx, ly);
  await drive.type("A label");
  await drive.key("Escape");
  const label = (await els()).at(-1);
  await call(`app.select(${JSON.stringify([circle.id, label.id])})`);
  await drive.key("Meta+G");
  e = await els();
  const group = e.at(-1);
  expect.equal(group.kind, "group");
  expect.equal(group.children.length, 2);
  const [gx, gy] = await at(circle.x + 20, circle.y + 20);
  await drive.press(stage, gx, gy);
  await drive.moveBy(30, 10); await drive.moveBy(60, 20);
  await drive.release();
  await drive.settleMotion();
  const moved = (await els()).at(-1);
  if (moved.children[0].x == circle.x) throw new Error("the group did not move");
  await drive.key("Meta+Z");                         // undo the move
  await drive.key("Meta+Z");                         // undo the grouping
  e = await els();
  expect.equal(e.some((x) => x.kind == "group"), false);
  expect.equal(e.find((x) => x.id == circle.id).x, circle.x);
  expect.equal(JSON.stringify(await read("app", "selection")), JSON.stringify([circle.id, label.id]));

  // ── duplicate the slide, change its title, drag it above the original
  await call('app.select([])');
  await call('app.duplicateSlide()');
  await expect.attr("app.doc", "count", 2);
  const copyKey = await read("app", "currentKey");
  const titleId = (await els())[1].id;
  await call(`app.select(["${titleId}"]); app.startTyping("${titleId}", false)`);
  await drive.wait(50);
  await drive.type("Quarterly review — draft");
  await drive.key("Escape");
  expect.equal((await els())[1].text.content, "Quarterly review — draft");
  await drive.settleMotion();
  await drive.press("app.editor.body.list.scroller.\"Slide 2\"", 100, 60);
  await drive.moveBy(0, -40); await drive.moveBy(0, -80);
  await drive.release();
  await drive.settleMotion();
  const order = (await read("app.doc", "value")).slides.map((s) => s.id);
  expect.equal(order[0], copyKey);

  // ── present from the start; the arrows go through
  await call('app.goTo(app.doc.slides()[0].id)');
  await drive.click('app.editor.top."Present"');
  await drive.settleMotion();
  await expect.attr("app", "presenting", true);
  await expect.attr("app", "presentIndex", 0);
  await drive.key("ArrowRight");
  await expect.attr("app", "presentIndex", 1);
  await drive.key("ArrowLeft");
  await drive.key("ArrowRight");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.attr("app", "presenting", false);
  await expect.attr("app", "currentKey", order[1]);

  // ── everything saves without being asked
  await drive.wait(2500);
  await drive.settleData();
  await drive.wait(2500);
  await drive.settleData();
  await expect.attr("app.sync", "status", "saved");

  // ── a colleague changes the second slide in another window
  const deckId = await read("app.doc", "deckId");
  const ids = await read("app.sync", "ids");
  const sid = ids[order[1]];
  await page.evaluate(async (id) => {
    const s = await (await fetch("http://127.0.0.1:8360/api/slides/" + id)).json();
    s.elements[1].text.content = "Quarterly review (final)";
    await fetch("http://127.0.0.1:8360/api/slides/" + id, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: s.version, background: s.background, elements: s.elements }) });
  }, sid);
  await call('app.goTo(app.doc.slides()[0].id)');
  await drive.settleData();
  await call(`app.goTo("${order[1]}")`);
  await drive.settleData();
  await drive.wait(100);
  await expect.visible("app.editor.body.stage.banner");
  await drive.click('app.editor.body.stage.banner."Use this version"');
  await drive.wait(100);
  expect.equal((await els())[1].text.content, "Quarterly review (final)");
  await expect.hidden("app.editor.body.stage.banner");

  await drive.wait(2500);
  await drive.settleData();
  await expect.attr("app.sync", "status", "saved");

  // ── tidy up: the presentation this made goes
  await page.evaluate((id) => fetch("http://127.0.0.1:8360/api/decks/" + id, { method: "DELETE" }), deckId);
};
