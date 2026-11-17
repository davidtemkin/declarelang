// The rest of the brief, driven as a person would, against the running service:
// npx declare-verify presentify.declare --url <dev address> --assert tests/more.mjs
// It makes two scratch presentations and deletes them at the end.

const API = "http://127.0.0.1:8360";

export default async ({ drive, expect, page }) => {
  const app = (expr) => page.evaluate(`(() => { const app = window.__declare.find("app"); return JSON.parse(JSON.stringify(${expr})) })()`);
  const els = () => app("app.ed.els");
  const frame = "app.editor.body.stage.frame";
  const catcher = frame + ".catcher";
  const at = async (x, y) => { const k = await app("app.stageScale"); return [x * k, y * k]; };
  const k = async () => app("app.stageScale");
  const saved = async () => { await drive.wait(1500); await drive.settleData(); await drive.wait(300); await drive.settleData(); };
  const made = [];

  // two scratch presentations, from the service directly
  for (const t of ["Scratch A", "Scratch B"]) {
    const r = await page.evaluate(async ([u, t]) => (await fetch(`${u}/api/decks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: t }) })).json(), [API, t]);
    made.push(r.deck.id);
  }
  try {
    await page.evaluate(() => window.__declare.find("app").decks.fetch());
    await drive.settleData();

    // ── renaming from the presentations, through the card's menu
    await page.getByRole("button", { name: "More for Scratch A" }).click();
    await page.getByRole("menuitem", { name: "Rename…" }).click();
    await drive.settleMotion();
    await page.getByLabel("Title").fill("Scratch A, renamed");
    await page.getByRole("button", { name: "Rename" }).click();
    await drive.settleData();
    await drive.settleData();
    await expect.equal((await app("app.decks.value.decks")).some((d) => d.title == "Scratch A, renamed"), true);

    // ── deleting asks first; Cancel keeps it
    await page.getByRole("button", { name: "More for Scratch B" }).click();
    await page.getByRole("menuitem", { name: "Delete…" }).click();
    await drive.settleMotion();
    await expect.equal(await page.getByRole("dialog").getByText("This can't be undone.", { exact: false }).count() > 0, true);
    await page.getByRole("button", { name: "Cancel" }).click();
    await drive.settleData();
    await expect.equal((await app("app.decks.value.decks")).some((d) => d.id == made[1]), true);

    // ── open Scratch A; an empty slide says how to start
    await page.getByRole("button", { name: "Open Scratch A, renamed" }).click();
    await drive.settleData();
    await drive.settleMotion();
    await expect.visible("app.editor.body.stage.hint");

    // ── R for Rectangle; drawn with Shift it is a square that keeps its proportions
    await drive.key("r");
    await expect.equal(await app("app.tool"), "rect");
    let [px, py] = await at(200, 200);
    await drive.press(catcher, px, py);
    await page.keyboard.down("Shift");
    await drive.moveBy(80, 40);
    await drive.release();
    await page.keyboard.up("Shift");
    let e = await els();
    const sq = e[0];
    await expect.equal([sq.width == sq.height, sq.keepProportions], [true, true]);
    // resizing it by a side keeps it square, without a key
    const handle = async (which) => page.evaluate((w) => {
      const sel = window.__declare.find("app.editor.body.stage.frame.overlay.sel");
      const i = sel.childViews.findIndex((v) => v.which == w);
      return "app.editor.body.stage.frame.overlay.sel." + i;
    }, which);
    await drive.press(await handle("e"), 11, 11);
    await drive.moveBy(50, 0);
    await drive.release();
    e = await els();
    await expect.equal(e[0].width == e[0].height && e[0].width > sq.width, true);
    // Shift lets it change them once
    await drive.press(await handle("e"), 11, 11);
    await page.keyboard.down("Shift");
    await drive.moveBy(40, 0);
    await drive.release();
    await page.keyboard.up("Shift");
    e = await els();
    await expect.equal(e[0].width > e[0].height, true);
    await expect.equal(e[0].keepProportions, true);

    // ── corner radius: the handle rounds it, and a resize keeps the radius
    const radius = "app.editor.body.stage.frame.overlay.sel.radius";
    await drive.press(radius, 10, 10);
    await drive.moveBy(15, 15);
    await drive.release();
    e = await els();
    const r = e[0].cornerRadius;
    await expect.equal(r > 10, true);
    await drive.press(await handle("se"), 11, 11);
    await page.keyboard.down("Shift");
    await drive.moveBy(60, 30);
    await drive.release();
    await page.keyboard.up("Shift");
    e = await els();
    await expect.equal(e[0].cornerRadius, r);
    // the inspector agrees, and changes it as one step
    await page.getByLabel("Corner radius").fill("24");
    await page.getByLabel("Corner radius").press("Enter");
    await expect.equal((await els())[0].cornerRadius, 24);
    await drive.key("Mod+Z");
    await expect.equal((await els())[0].cornerRadius, r);

    // ── arrows nudge by 1, Shift by 10
    const x0 = (await els())[0].x;
    await page.evaluate(() => window.__declare.find("app").focusStage());
    await drive.key("ArrowRight");
    await drive.key("Shift+ArrowRight");
    await expect.equal((await els())[0].x, x0 + 11);

    // ── a line, and its ends
    await drive.key("l");
    [px, py] = await at(100, 600);
    await drive.press(catcher, px, py);
    [px, py] = await at(400, 0);
    await drive.moveBy(px / 2, -20);
    await drive.moveBy(px / 2, 20);
    await drive.release();
    e = await els();
    const line = e[e.length - 1];
    await expect.equal(line.kind, "line");
    await expect.equal(line.stroke != null, true);
    const ends = await page.evaluate(() => {
      const o = window.__declare.find("app.editor.body.stage.frame.overlay");
      return o.childViews.map((v, i) => v.which ? i : -1).filter((i) => i >= 0);
    });
    await drive.press("app.editor.body.stage.frame.overlay." + ends[1], 11, 11);
    await drive.moveBy(0, -30);
    await drive.moveBy(0, -30);
    await drive.release();
    e = await els();
    await expect.equal(e[e.length - 1].y2 < line.y2 - 50, true);
    await expect.equal(e[e.length - 1].x1, line.x1);

    // ── copy, paste (offset, selected), duplicate, delete
    await page.evaluate(() => window.__declare.find("app").focusStage());
    await drive.key("Mod+C");
    await drive.key("Mod+V");
    e = await els();
    const pasted = e[e.length - 1];
    await expect.equal([pasted.x1, pasted.y1], [line.x1 + 20, line.y1 + 20]);
    await expect.equal(await app("app.selection"), [pasted.id]);
    await drive.key("Mod+D");
    e = await els();
    await expect.equal(e.length, 4);
    await drive.key("Backspace");
    e = await els();
    await expect.equal(e.length, 3);

    // ── a text box clicked and left empty disappears
    await drive.key("t");
    [px, py] = await at(700, 500);
    await drive.clickAt(catcher, px, py);
    await expect.equal((await app("app.editingId")) != "", true);
    await drive.key("Escape");
    await expect.equal((await els()).length, 3);
    await expect.equal(await app("app.editingId"), "");

    // ── slides: a new one after the current, undone and redone; the last can't be deleted
    await expect.equal(await app("app.doc.all().length"), 1);
    await page.getByRole("button", { name: "New slide" }).click();
    await expect.equal(await app("app.doc.all().length"), 2);
    await expect.equal(await app("app.doc.at(app.current)"), 1);
    await drive.key("Mod+Z");
    await expect.equal(await app("app.doc.all().length"), 1);
    await drive.key("Mod+Shift+Z");
    await expect.equal(await app("app.doc.all().length"), 2);
    // the list's keys
    await drive.click("app.editor.body.film.list.rows.0");
    await drive.key("ArrowDown");
    await expect.equal(await app("app.doc.at(app.current)"), 1);
    await drive.key("Backspace");
    await expect.equal(await app("app.doc.all().length"), 1);
    await drive.key("Backspace");
    await expect.equal(await app("app.doc.all().length"), 1);
    await drive.key("Enter");
    await expect.equal(await app("app.doc.all().length"), 2);
    await drive.settleMotion();

    // ── paste onto another slide, then into another presentation
    await drive.click("app.editor.body.film.list.rows.0");
    await page.evaluate(() => window.__declare.find("app").focusStage());
    await drive.key("Mod+A");
    await drive.key("Mod+C");
    await drive.click("app.editor.body.film.list.rows.1");
    await page.evaluate(() => window.__declare.find("app").focusStage());
    await drive.key("Mod+V");
    await expect.equal((await els()).length, 3);
    await expect.equal((await app("app.selection")).length, 3);

    // ── ⌘S sends at once
    await drive.key("ArrowLeft");
    await drive.key("Mod+S");
    await drive.settleData();
    await drive.wait(50);
    await drive.settleData();
    await expect.equal(await app("app.sync.statusText"), "All changes saved");

    // ── the service unreachable: the change is kept, said, and saved once it's back
    await page.evaluate(() => { window.__declare.find("app").base = "http://127.0.0.1:9"; });
    await drive.key("ArrowDown");
    await saved();
    await expect.equal(await app("app.sync.statusText"), "Not saved: can't reach the service");
    await expect.text("app.editor.bar.titles", "Not saved: can't reach the service");
    const want = await app("app.doc.all().map((s) => ({ id: s.id, background: s.background, elements: s.elements }))");
    await page.evaluate(() => { window.__declare.find("app").base = "http://127.0.0.1:8360"; });
    await page.getByRole("button", { name: "Try saving again" }).click();
    await saved();
    await expect.equal(await app("app.sync.statusText"), "All changes saved");
    const deckA = made[0];
    const served = await page.evaluate(async (u) => (await (await fetch(u)).json()), `${API}/api/decks/${deckA}/slides`);
    await expect.equal(served.slides.map((s) => ({ id: s.id, background: s.background, elements: s.elements })), want);

    // into the other presentation
    await drive.click("app.editor.bar.home");
    await drive.settleData();
    await drive.settleMotion();
    await page.getByRole("button", { name: "Open Scratch B" }).click();
    await drive.settleData();
    await drive.settleMotion();
    await page.evaluate(() => window.__declare.find("app").focusStage());
    await drive.key("Mod+V");
    await expect.equal((await els()).length, 3);
    await saved();
    await expect.equal(await app("app.sync.statusText"), "All changes saved");

    // ── deleting a presentation, confirmed
    await drive.click("app.editor.bar.home");
    await drive.settleData();
    await drive.settleMotion();
    await page.getByRole("button", { name: "More for Scratch B" }).click();
    await page.getByRole("menuitem", { name: "Delete…" }).click();
    await drive.settleMotion();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await drive.settleData();
    await drive.settleData();
    await expect.equal((await app("app.decks.value.decks")).some((d) => d.id == made[1]), false);
  } finally {
    for (const id of made) await page.evaluate(async ([u, id]) => fetch(`${u}/api/decks/${id}`, { method: "DELETE" }), [API, id]);
  }
};
