// Presentify: direct manipulation, each piece of §3–§6 of the brief.
// Works in a presentation it makes, and deletes it at the end.
//
//   npx declare-verify my-apps/presentify/presentify.declare --no-boot --assert my-apps/presentify/tests/manipulation.mjs

const STAGE = "app.workspace.body.stage";
const H = `${STAGE}.handles`;
const API = "http://127.0.0.1:8360";

export default async ({ drive, expect, page }) => {
  const read = (p) => drive.read(p);
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: `/tmp/presentify-check-m-${name}.png` }); };
  const at = async (x, y) => {
    const left = await read(`${STAGE}.left`), top = await read(`${STAGE}.top`), fit = await read(`${STAGE}.fit`);
    return [left + x * fit, top + y * fit];
  };
  const fit = () => read(`${STAGE}.fit`);
  const drawOn = async (tool, x0, y0, x1, y1, shift) => {
    await drive.click(`app.workspace.bar.tools.${tool}`);
    const [ax, ay] = await at(x0, y0);
    const [bx, by] = await at(x1, y1);
    if (shift) await page.keyboard.down("Shift");
    await drive.press(STAGE, ax, ay);
    await drive.moveBy((bx - ax) / 2, (by - ay) / 2);
    await drive.moveBy((bx - ax) / 2, (by - ay) / 2);
    await drive.release();
    if (shift) await page.keyboard.up("Shift");
  };
  const clickSlide = async (x, y, modifiers) => {
    const [ax, ay] = await at(x, y);
    await drive.clickAt(STAGE, ax, ay, modifiers ? { modifiers } : undefined);
  };
  // drag a handle by slide points
  const dragHandle = async (kind, dx, dy, shift) => {
    const k = await fit();
    const path = await page.evaluate((kind) => {
      const h = window.__declare.find("app.workspace.body.stage.handles");
      const i = h.childViews.findIndex((c) => c.kind == kind && c.visible);
      return i;
    }, kind);
    if (shift) await page.keyboard.down("Shift");
    await drive.press(`${H}.${path}`);
    await drive.moveBy(dx * k / 2, dy * k / 2);
    await drive.moveBy(dx * k / 2, dy * k / 2);
    await drive.release();
    if (shift) await page.keyboard.up("Shift");
  };
  const elements = () => page.evaluate(() => window.__declare.find("app.editor").elements);
  const selection = () => page.evaluate(() => window.__declare.find("app.editor").selection);
  const last = async () => { const e = await elements(); return e[e.length - 1]; };

  await drive.click('app.library.col.bar."New presentation"');
  await drive.settleData();
  await drive.settleMotion();
  await drive.key("Escape");
  const deckId = await read("app.deckId");
  try {
    // ── a rectangle: resized from its corner, and with shift in proportion
    await drawOn("Rectangle", 100, 100, 300, 200);
    let r = await last();
    await expect.equal([r.x, r.y, r.width, r.height], [100, 100, 200, 100]);
    await dragHandle("rb", 100, 20);
    r = await last();
    await expect.equal([r.width, r.height], [300, 120]);
    await dragHandle("rb", 60, 0, true);                      // shift keeps proportions
    r = await last();
    await expect.equal(Math.abs(r.width / r.height - 300 / 120) < 0.01, true);
    await dragHandle("l", -50, 0);                            // a side handle: one dimension, other edge planted
    const r2 = await last();
    await expect.equal(r2.x + r2.width, r.x + r.width);
    await expect.equal(r2.height, r.height);

    // ── corners: rounded by the handle, and kept when resized
    await dragHandle("radius", 30, 0);
    r = await last();
    await expect.equal(r.cornerRadius, 30);
    await dragHandle("rb", 200, 100);
    await expect.equal((await last()).cornerRadius, 30);
    await shot("rounded");

    // ── keep proportions, set in the inspector: a corner drag keeps them, shift lets go once
    await drive.click('app.workspace.body.side.Inspector."Keep proportions"');
    r = await last();
    await expect.equal(r.keepProportions, true);
    const ratio = r.width / r.height;
    await dragHandle("rb", 80, 0);
    r = await last();
    await expect.equal(Math.abs(r.width / r.height - ratio) < 0.01, true);
    await dragHandle("rb", 0, 60, true);
    r = await last();
    await expect.equal(Math.abs(r.width / r.height - ratio) > 0.05, true);

    // ── a line, and its end dragged
    await drawOn("Line", 700, 100, 1000, 100);
    let l = await last();
    await expect.equal([l.kind, l.x1, l.y1, l.x2, l.y2], ["line", 700, 100, 1000, 100]);
    await dragHandle("end2", 0, 150);
    l = await last();
    await expect.equal([l.x2, l.y2], [1000, 250]);

    // ── a drag on empty slide selects everything the box touches
    await drawOn("Ellipse", 700, 400, 900, 520);
    await drive.key("Escape");
    await expect.equal((await selection()).length, 0);
    const [mx0, my0] = await at(900, 140);
    const [mx1, my1] = await at(1100, 300);
    await drive.press(STAGE, mx0, my0);
    await drive.moveBy(mx1 - mx0, my1 - my0);
    await shot("marquee");
    await drive.release();
    await expect.equal((await selection()).length, 1);         // the line
    // ── nudged by the keys: one point, ten with shift
    l = await last().then(() => elements()).then((els) => els.find((e) => e.kind == "line"));
    await drive.key("ArrowRight");
    await drive.key("Shift+ArrowDown");
    const l2 = (await elements()).find((e) => e.kind == "line");
    await expect.equal([l2.x1 - l.x1, l2.y1 - l.y1], [1, 10]);

    // ── the inspector says when things differ, and a change goes to all
    await drive.key("Mod+A");
    await expect.equal((await selection()).length, 3);
    await expect.text("app.workspace.body.side.Inspector", "Mixed");
    await drive.click('app."Outline colour"');
    await drive.click('app.colorPop."#FF5B3A"');
    const els = await elements();
    await expect.equal(els.every((e) => e.stroke?.color == "#FF5B3A"), true);
    await drive.key("Mod+Z");
    await expect.equal((await elements()).filter((e) => e.stroke?.color == "#FF5B3A").length, 0);
    await shot("mixed");

    // ── copy, and paste on another slide: offset, selected
    await clickSlide(800, 460);
    const ellipse = (await elements()).find((e) => e.kind == "ellipse");
    await drive.key("Mod+C");
    await drive.click('app.workspace.body.slides.head."New slide"');
    await expect.equal(await read("app.deck.count"), 2);
    await expect.equal((await elements()).length, 0);
    await drive.key("Mod+V");
    let pasted = await elements();
    await expect.equal(pasted.length, 1);
    await expect.equal([pasted[0].x - ellipse.x, pasted[0].y - ellipse.y], [20, 20]);
    await expect.equal(pasted[0].id == ellipse.id, false);
    await expect.equal(await selection(), [pasted[0].id]);
    await drive.key("Mod+D");
    await expect.equal((await elements()).length, 2);

    // ── a group: one thing; a double-click goes inside it; ungrouped, each where it was
    await drive.key("Mod+A");
    await drive.key("Mod+G");
    let g = await last();
    await expect.equal(g.kind, "group");
    await expect.equal(await selection(), [g.id]);
    await drive.key("Escape");
    const c0 = g.children[g.children.length - 1];              // the one on top
    await drive.dblclick(STAGE, ...(await at(c0.x + c0.width / 2, c0.y + c0.height / 2)));
    await expect.equal(await selection(), [c0.id]);
    await expect.equal(await read("app.editor.scope"), g.id);
    await drive.key("Escape");
    await expect.equal(await selection(), [g.id]);
    await drive.key("Mod+Shift+G");
    const parts = await elements();
    await expect.equal(parts.length, 2);
    await expect.equal(parts[parts.length - 1].x, c0.x);

    // ── slides: delete is undone, the last one can't go
    await drive.settleMotion();
    await drive.click("app.workspace.body.slides.pane.rows.1", { button: "right" });
    await drive.click('app.slideMenu."Delete slide"');
    await expect.equal(await read("app.deck.count"), 1);
    await drive.click("app.workspace.body.slides.pane.rows.0", { button: "right" });
    await expect.equal(await page.evaluate(() => window.__declare.find("app.slideMenu").items.find((i) => i.id == "delete").enabled), false);
    await drive.key("Escape");
    await drive.key("Mod+Z");
    await expect.equal(await read("app.deck.count"), 2);

    // ── a text box: a click makes one; it grows taller as it fills; left empty, it goes
    await drive.click('app.workspace.bar.tools.Text');
    await clickSlide(100, 400);
    await drive.type("One line of words that goes on long enough to wrap onto a second line and then a third, as words do");
    await drive.key("Escape");
    await drive.wait(100);
    let t = await last();
    await expect.equal(t.height > 80, true);
    await drive.click('app.workspace.bar.tools.Text');
    await clickSlide(100, 650);
    await drive.key("Escape");
    await expect.equal((await last()).id, t.id);

    // everything reached the service
    await drive.wait(1500);
    await drive.settleData();
    await drive.wait(300);
    await drive.settleData();
    await expect.attr("app.sync", "status", "saved");
    await shot("end");
  } finally {
    await page.evaluate(async (url) => { await fetch(url, { method: "DELETE" }); }, `${API}/api/decks/${deckId}`);
  }
};
