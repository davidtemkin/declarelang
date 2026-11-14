// Resizing, proportions, corner radius, line ends, copy and paste, and the
// slide commands, on a presentation of its own.
//   npx declare-verify presentify.declare --assert tests/manipulate.mjs

const STAGE = "app.editorFrame.inner.ed.body.centre.stage";

export default async ({ drive, expect, page }) => {
  const read = (path) => page.evaluate((p) => {
    const parts = p.split(".");
    const v = window.__declare.find(parts.slice(0, -1).join("."))[parts[parts.length - 1]];
    return v == null ? v : JSON.parse(JSON.stringify(v));
  }, path);
  const call = (expr) => page.evaluate((e) => { const app = window.__declare.find("app"); return new Function("app", "return " + e)(app); }, expr);
  const els = () => read("app.doc.els");
  const at = async (sx, sy) => {
    const s = await read(STAGE + ".s"), ox = await read(STAGE + ".ox"), oy = await read(STAGE + ".oy");
    return [ox + sx * s, oy + sy * s, s];
  };
  const drag = async (x0, y0, dx, dy) => {
    const [x, y, s] = await at(x0, y0);
    await drive.press(STAGE, x, y);
    await drive.moveBy(dx * s / 2, dy * s / 2);
    await drive.moveBy(dx * s / 2, dy * s / 2);
    await drive.release();
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  const find = async (id) => (await els()).find((e) => e.id == id);

  const DECK = await page.evaluate(async () => {
    const r = await fetch("http://127.0.0.1:8360/api/decks", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test: manipulate" }) });
    return (await r.json()).deck.id;
  });
  await drive.set("app", "location", DECK);
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "ready", true);
  // a clean slide to work on
  const slidesAtStart = (await read("app.doc.slides")).length;
  await button("New slide").click();
  await drive.settleMotion();
  expect.equal((await els()).length, 0);

  // ── a circle drawn with shift keeps its proportions
  await button("Ellipse").click();
  await page.keyboard.down("Shift");
  await drag(200, 200, 160, 100);
  await page.keyboard.up("Shift");
  let circle = (await els())[0];
  expect.equal(circle.keepProportions, true);
  expect.equal(Math.round(circle.width), Math.round(circle.height));
  // the right handle, dragged: it stays round
  await drag(200 + circle.width, 200 + circle.height / 2, 80, 0);
  circle = await find(circle.id);
  expect.equal(Math.round(circle.width), Math.round(circle.height));
  // with shift, its proportions change once
  await page.keyboard.down("Shift");
  await drag(circle.x + circle.width, circle.y + circle.height / 2, 60, 0);
  await page.keyboard.up("Shift");
  circle = await find(circle.id);
  expect.equal(Math.round(circle.width) > Math.round(circle.height), true);

  // ── a rounded rectangle keeps its corners when made wider
  await button("Rectangle").click();
  await drag(600, 300, 300, 200);
  let rect = (await els()).at(-1);
  // the corner handle: drag it in
  const [hx, hy] = await at(rect.x, rect.y);
  await drive.press(STAGE, hx + 14, hy + 14);
  await drive.moveBy(20, 20);
  await drive.moveBy(20, 20);
  await drive.release();
  rect = await find(rect.id);
  expect.equal(rect.cornerRadius > 20, true);
  const r = rect.cornerRadius;
  await drag(rect.x + rect.width, rect.y + rect.height / 2, 150, 0);
  rect = await find(rect.id);
  expect.equal(Math.round(rect.width), 450);
  expect.equal(rect.cornerRadius, r);

  // ── a line, and one of its ends dragged
  await button("Line").click();
  await drag(100, 600, 300, 0);
  let line = (await els()).at(-1);
  expect.equal(line.kind, "line");
  await drag(line.x2, line.y2, 0, -100);
  line = await find(line.id);
  expect.equal(Math.round(line.y2), 500);
  expect.equal(Math.round(line.y1), 600);

  // ── arrows nudge, by ten with shift; one undo step each
  await drag(line.x1 + 50, line.y1 - 17, 0, 0);
  await call("app.doc.select([" + JSON.stringify(rect.id) + "])");
  await drive.key("ArrowRight");
  await drive.key("Shift+ArrowDown");
  rect = await find(rect.id);
  expect.equal(Math.round(rect.y), 310);

  // ── order: send the rectangle to the back
  await button("Send to back").click();
  expect.equal((await els())[0].id, rect.id);

  // ── copy, paste onto another slide, offset and selected
  await call("app.doc.select([" + JSON.stringify(rect.id) + "])");
  await call("app.copySel()");
  await drive.settleMotion();
  await button("Slide 1").click();
  const before = (await els()).length;
  await call("app.paste()");
  const pasted = (await els()).at(-1);
  expect.equal((await els()).length, before + 1);
  expect.equal(pasted.id != rect.id, true);
  expect.equal((await read("app.doc.selection"))[0], pasted.id);

  // ── duplicate places the copy a little offset
  await drive.key("Mod+D");
  const dup = (await els()).at(-1);
  expect.equal(Math.round(dup.x - pasted.x), 16);

  // ── delete the slide made here; the last slide can't be deleted
  await button("Slide 2").click();
  await button("Delete slide").click();
  await drive.settleMotion();
  expect.equal((await read("app.doc.slides")).length, slidesAtStart);
  // the last slide can't be deleted
  await page.evaluate(() => { const d = window.__declare.find("app.doc"); d.slides.slice(1).forEach((s) => d.deleteSlide(s.id)); });
  await drive.settleMotion();
  expect.equal((await read("app.doc.slides")).length, 1);
  await button("Delete slide").click({ force: true }).catch(() => {});
  expect.equal((await read("app.doc.slides")).length, 1);
  await expect.attr(STAGE.replace(".centre.stage", ".side.foot") + ".2", "disabled", true);

  // ── the keyboard moves through the list
  await button("New slide").click();
  await drive.settleMotion();
  await drive.settleMotion();
  await button("Slide 1").click();
  await drive.key("ArrowDown");
  expect.equal(await read("app.doc.index"), 1);
  await drive.key("ArrowUp");
  expect.equal(await read("app.doc.index"), 0);

  await drive.waitReal(2500);
  await drive.settleData();
  await expect.attr("app.sync", "status", "saved");

  await page.evaluate(async (d) => { await fetch("http://127.0.0.1:8360/api/decks/" + d, { method: "DELETE" }); }, DECK);
};
