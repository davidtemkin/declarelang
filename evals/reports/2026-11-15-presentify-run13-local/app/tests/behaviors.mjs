// The finer rules of the brief (§2–§7, §10), each checked as a person meets
// it. Makes its own presentations on the live service and deletes them.

const B = "app.shell.editor.body.stage.canvas.board";
const H = "app.shell.editor.body.stage.canvas.overlay.boxHandles";
const INS = "app.shell.editor.body.inspector";
const TOOLS = "app.shell.editor.bar.tools.picker";
const ROWS = "app.shell.editor.body.slides.pane.rows";

export default async ({ drive, expect, page }) => {
  const read = (p) => drive.read(p);
  const k = async () => (await read(`${B}.width`)) / 1280;
  const at = async (x, y) => { const s = await k(); return [Math.round(x * s), Math.round(y * s)]; };
  const clickSlide = async (x, y, opts) => { const [px, py] = await at(x, y); await drive.clickAt(B, px, py, opts); };
  const dragSlide = async (x0, y0, x1, y1) => {
    const s = await k();
    await drive.press(B, Math.round(x0 * s), Math.round(y0 * s));
    await drive.moveBy(Math.round((x1 - x0) * s / 2), Math.round((y1 - y0) * s / 2));
    await drive.moveBy(Math.round((x1 - x0) * s / 2), Math.round((y1 - y0) * s / 2));
    await drive.release();
  };
  const dragHandle = async (which, dx, dy, shift) => {
    const s = await k();
    await drive.press(`${H}.${which}`);
    if (shift) await page.keyboard.down("Shift");
    await drive.moveBy(Math.round(dx * s / 2), Math.round(dy * s / 2));
    await drive.moveBy(Math.round(dx * s / 2), Math.round(dy * s / 2));
    await drive.release();
    if (shift) await page.keyboard.up("Shift");
  };
  const doc = () => page.evaluate(() => window.__declare.find("app.deck").value);
  const els = async () => { const d = await doc(); const cur = await read("app.current"); return d.slides.find((s) => s.id == cur).elements; };
  const undos = () => page.evaluate(() => window.__declare.find("app.hist").undos.length);
  const sel = () => read("app.sel");
  const near = (a, b, what) => { if (Math.abs(a - b) > 1.5) throw new Error(`${what}: ${a} is not ${b}`); };

  await page.evaluate(async () => {
    const r = await fetch("http://127.0.0.1:8360/api/decks");
    for (const d of (await r.json()).decks)
      if (!["d1", "d2", "d3"].includes(d.id)) await fetch("http://127.0.0.1:8360/api/decks/" + d.id, { method: "DELETE" });
  });

  // ── §10 labels
  await drive.click("app.shell.home.col.header.newBtn");
  await drive.settleData();
  await drive.settleMotion();
  for (const name of ["Select", "Rectangle", "Ellipse", "Line", "Text"])
    await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
  await expect(page.getByLabel("Slide", { exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Slide 1", exact: true })).toBeVisible();
  const deckA = await read("app.location");
  await drive.key("Escape");

  // ── a rectangle: resize, shift keeps proportions, corners stay a length
  await drive.click(`${TOOLS}.Rectangle`);
  await dragSlide(100, 100, 500, 300);                    // 400 × 200
  let r = (await els())[0];
  near(r.width, 400, "drawn width"); near(r.height, 200, "drawn height");
  expect.equal(r.keepProportions, false);
  await drive.selectAll(`${INS}."Corner radius in points"`);
  await drive.type("30");
  await drive.key("Enter");
  expect.equal((await els())[0].cornerRadius, 30);
  let u = await undos();
  await dragHandle("se", 200, 40, false);                 // free: 600 × 240
  r = (await els())[0];
  near(r.width, 600, "free width"); near(r.height, 240, "free height");
  expect.equal(r.cornerRadius, 30);                        // a wider rectangle keeps its corners
  expect.equal((await undos()) - u, 1);                    // a resize is one step
  await dragHandle("se", 60, -100, true);                  // shift: proportions kept (5:2)
  r = (await els())[0];
  near(r.width / r.height, 600 / 240, "shift ratio");

  // keep proportions, set in the inspector: an edge pull keeps the shape, shift lets it change
  await page.getByRole("checkbox", { name: "Keep proportions" }).click();
  expect.equal((await els())[0].keepProportions, true);
  const ratio = r.width / r.height;
  await dragHandle("e", 80, 0, false);
  r = (await els())[0];
  near(r.width / r.height, ratio, "kept ratio");
  await dragHandle("e", 80, 0, true);
  r = (await els())[0];
  if (Math.abs(r.width / r.height - ratio) < 0.05) throw new Error("shift should let a kept shape change its proportions once");

  // drawn with shift: a square that keeps being one
  await drive.click(`${TOOLS}.Rectangle`);
  const s = await k();
  await drive.press(B, Math.round(900 * s), Math.round(420 * s));
  await page.keyboard.down("Shift");
  await drive.moveBy(Math.round(100 * s), Math.round(40 * s));
  await drive.moveBy(Math.round(100 * s), Math.round(140 * s));
  await drive.release();
  await page.keyboard.up("Shift");
  let sq = (await els())[1];
  expect.equal(sq.width, sq.height);
  expect.equal(sq.keepProportions, true);
  await dragHandle("s", 0, 60, false);
  sq = (await els())[1];
  near(sq.width, sq.height, "square stays square");

  // ── §6 an inspector change is one step, and undo puts the selection back
  u = await undos();
  await drive.click(`${INS}."Fill colour"`);
  await drive.settleMotion();
  await drive.click(`app.colors.palette."#2E9A63"`);
  await drive.key("Escape");
  expect.equal((await els())[1].fill, "#2E9A63");
  expect.equal((await undos()) - u, 1);
  await clickSlide(10, 700);                               // clear the selection
  expect.equal((await sel()).length, 0);
  await drive.key("Meta+Z");
  expect.equal((await els())[1].fill, "#5B3FE0");
  expect.equal((await sel()).length, 1);                   // the square is selected again, as it was
  await drive.key("Meta+Shift+Z");
  expect.equal((await els())[1].fill, "#2E9A63");

  // ── typing is one step; Escape ends it; an empty box goes
  await drive.click(`${TOOLS}.Text`);
  await clickSlide(120, 560);
  await drive.type("Hello");
  await drive.key("Escape");
  let t = (await els()).find((e) => e.kind == "text");
  expect.equal(t.text.content, "Hello");
  u = await undos();
  const [tx, ty] = await at(175, 580);
  await drive.dblclick(B, tx, ty);
  await expect.attr("app", "editingText", t.id);
  await drive.key("End");
  await drive.type(", world");
  await clickSlide(10, 700);                               // a click elsewhere ends editing
  await expect.attr("app", "editingText", "");
  expect.equal((await els()).find((e) => e.kind == "text").text.content, "Hello, world");
  expect.equal((await undos()) - u, 1);
  await drive.key("Meta+Z");
  expect.equal((await els()).find((e) => e.kind == "text").text.content, "Hello");
  const count = (await els()).length;
  await drive.click(`${TOOLS}.Text`);
  await clickSlide(700, 600);
  await drive.key("Escape");                               // left empty: it disappears
  expect.equal((await els()).length, count);

  // ── selecting: shift-click adds and removes; Escape clears; arrows nudge 1 and 10
  await clickSlide(150, 150);
  await clickSlide(950, 470, { modifiers: ["Shift"] });
  expect.equal((await sel()).length, 2);
  await clickSlide(950, 470, { modifiers: ["Shift"] });
  expect.equal((await sel()).length, 1);
  const x0 = (await els())[0].x;
  await drive.key("ArrowRight");
  await drive.key("Shift+ArrowRight");
  expect.equal((await els())[0].x, x0 + 11);
  await drive.key("Escape");
  expect.equal((await sel()).length, 0);

  // ── order: the first rectangle to the front
  await clickSlide(150, 150);
  const first = (await els())[0].id;
  await drive.click(`${INS}."Bring to front"`);
  let e = await els();
  expect.equal(e[e.length - 1].id, first);
  await drive.click(`${INS}."Send backward"`);
  e = await els();
  expect.equal(e[e.length - 2].id, first);

  // ── group and ungroup: the parts come back where they were
  await drive.key("Meta+A");
  const before = (await els()).map((x) => [x.id, x.x, x.y]);
  await drive.key("Meta+G");
  expect.equal((await els()).length, 1);
  await drive.key("Meta+Shift+G");
  const after = (await els()).map((x) => [x.id, x.x, x.y]);
  expect.equal(JSON.stringify(after), JSON.stringify(before));

  // ── duplicate and paste land offset and selected; paste works across slides
  await drive.key("Escape");
  await clickSlide(950, 470);
  const sel0 = (await sel())[0];
  const orig = (await els()).find((x) => x.id == sel0);
  await drive.key("Meta+D");
  const sel1 = (await sel())[0];
  let copy = (await els()).find((x) => x.id == sel1);
  expect.equal(copy.x, orig.x + 20);
  expect.equal(copy.y, orig.y + 20);
  await drive.key("Meta+C");
  expect.equal((await read("app.copied")).length, 1);
  await drive.click("app.shell.editor.body.slides.foot.0");          // a new slide, after this one
  await drive.settleMotion();
  expect.equal((await els()).length, 0);
  await clickSlide(10, 700);
  await drive.key("Meta+V");
  expect.equal(await read("app.pasteN"), 1);
  e = await els();
  expect.equal(e.length, 1);
  expect.equal(e[0].x, copy.x + 20);
  expect.equal((await sel())[0], e[0].id);

  // ── the same from the bar's Edit menu, by pointer alone
  await drive.click("app.shell.editor.bar.menus.Edit");
  await drive.click(`app.editMenu.Copy`);
  await drive.click("app.shell.editor.bar.menus.Edit");
  await drive.click(`app.editMenu.Paste`);
  expect.equal((await els()).length, 2);
  await drive.click("app.shell.editor.bar.menus.Arrange");
  await drive.click(`app.arrangeMenu."Send to Back"`);
  expect.equal((await els())[0].id, (await sel())[0]);

  // ── the keyboard moves between slides in the list
  await drive.click(`${ROWS}.0`);
  const keys = (await doc()).slides.map((x) => x.id);
  await expect.attr("app", "current", keys[0]);
  await drive.key("ArrowDown");
  await expect.attr("app", "current", keys[1]);
  await drive.key("ArrowUp");
  await expect.attr("app", "current", keys[0]);

  // ── slides: the last one can't be deleted; deleting and undoing
  await drive.key("ArrowDown");
  await drive.key("Delete");
  expect.equal((await doc()).slides.length, 1);
  await drive.key("Meta+Z");
  expect.equal((await doc()).slides.length, 2);
  await drive.click(`${ROWS}.0`);
  await drive.key("Delete");
  await drive.wait(400);                                   // a person's pause between keys
  await expect.attr("app.focusedView", "accessibilityLabel", "Slide 1");
  await drive.key("Delete");
  expect.equal((await doc()).slides.length, 1);              // the last stays
  await expect.attr("app.toast", "shown", true);

  // ── paste across presentations
  await drive.waitReal(1500);
  await drive.click("app.shell.editor.bar.\"All presentations\"");
  await drive.settleData();
  await drive.settleMotion();
  await drive.click("app.shell.home.col.header.newBtn");
  await drive.settleData();
  await drive.settleMotion();
  await drive.key("Escape");
  await clickSlide(10, 700);
  await drive.key("Meta+V");
  e = await els();
  expect.equal(e.length, 1);
  expect.equal(e[0].fill, "#2E9A63");

  // ── saved, without a Save
  await drive.key("Meta+S");
  await drive.waitReal(1500);
  await drive.settleData();
  await expect.attr("app.sync", "statusText", "All changes saved");
  const deckB = await read("app.location");
  const saved = await page.evaluate(async (id) => (await (await fetch(`http://127.0.0.1:8360/api/decks/${id}/slides`)).json()).slides, deckB);
  expect.equal(saved[0].elements.length, 1);

  await page.evaluate(async (ids) => { for (const id of ids) await fetch(`http://127.0.0.1:8360/api/decks/${id}`, { method: "DELETE" }); }, [deckA, deckB]);
};
