// Pictures of the screens a person reaches, for looking at (not a test of
// behaviour): npx declare-verify presentify.declare --url <dev address> --assert tests/look.mjs
// Writes PNGs to $LOOK_DIR (default /tmp/presentify-look). Works on a scratch
// presentation it makes and deletes.

const API = "http://127.0.0.1:8360";
const DIR = process.env.LOOK_DIR || "/tmp/presentify-look";

export default async ({ drive, expect, page }) => {
  const fs = await import("node:fs");
  fs.mkdirSync(DIR, { recursive: true });
  const shot = async (name) => { await drive.settleMotion(); await page.screenshot({ path: `${DIR}/${name}.png` }); };
  const app = (expr) => page.evaluate(`(() => { const app = window.__declare.find("app"); return JSON.parse(JSON.stringify(${expr})) })()`);
  const at = async (x, y) => { const k = await app("app.stageScale"); return [x * k, y * k]; };
  const frame = "app.editor.body.stage.frame";

  await shot("01-home");

  // a scratch copy of the sample deck's slides
  const made = await page.evaluate(async (u) => {
    const src = await (await fetch(`${u}/api/decks/d1/slides`)).json();
    const r = await (await fetch(`${u}/api/decks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Look: field notes" }) })).json();
    let after = r.slides[0].id;
    await fetch(`${u}/api/slides/${after}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: r.slides[0].version, background: src.slides[0].background, elements: src.slides[0].elements }) });
    for (const s of src.slides.slice(1)) {
      const x = await (await fetch(`${u}/api/decks/${r.deck.id}/slides`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ after, background: s.background, elements: s.elements }) })).json();
      after = x.slide.id;
    }
    return r.deck.id;
  }, API);
  try {
  await page.evaluate(() => window.__declare.find("app").decks.fetch());
  await drive.settleData();
  await shot("02-home-more");

  await page.getByRole("button", { name: "Open Look: field notes" }).click();
  await drive.settleData();
  await shot("03-editor");

  // a single selection: the sun
  let [px, py] = await at(960, 270);
  await drive.clickAt(frame, px, py);
  await shot("04-selected-ellipse");

  // a group's text, gone into
  await drive.click("app.editor.body.film.list.rows.1");
  [px, py] = await at(300, 270);
  await drive.clickAt(frame, px, py);
  await shot("05-group-selected");
  await drive.dblclick(frame, px, py);
  await shot("06-inside-group");
  await drive.key("Escape");
  await drive.key("Escape");

  // several selected: mixed values
  await drive.key("Mod+A");
  await shot("07-all-selected-mixed");
  await drive.key("Escape");

  // the colour picker
  [px, py] = await at(140, 270);
  await drive.clickAt(frame, px, py);
  await page.getByRole("button", { name: "Fill colour" }).click();
  await shot("08-colour-picker");
  await drive.key("Escape");

  // a rectangle mid-drag, with a guide
  await drive.click("app.editor.body.film.list.rows.2");
  await drive.click("app.editor.bar.tools.Rectangle");
  [px, py] = await at(700, 420);
  await drive.press(frame + ".catcher", px, py);
  await drive.moveBy(60, 40);
  await drive.moveBy(60, 40);
  await shot("09-drawing");
  await drive.release();
  await shot("10-drawn-rect");
  // resize mid-drag
  const h = await page.evaluate(() => { const v = window.__declare.find("app.editor.body.stage.frame.overlay.sel"); return [v.width, v.height]; });
  await drive.press("app.editor.body.stage.frame.overlay.sel.8", 11, 11);
  await drive.moveBy(40, 20);
  await shot("11-resizing");
  await drive.release();

  // editing text in place
  await drive.click("app.editor.body.film.list.rows.0");
  [px, py] = await at(300, 250);
  await drive.dblclick(frame, px, py);
  await shot("12-editing-text");
  await drive.key("Escape");

  // dragging a slide in the list
  await drive.press("app.editor.body.film.list.rows.3", 100, 40);
  await drive.moveBy(0, -60);
  await drive.moveBy(0, -60);
  await shot("13-reordering");
  await drive.release();
  await shot("14-reordered");

  // menus
  await drive.click("app.editor.bar.menus.Arrange");
  await shot("15-arrange-menu");
  await drive.key("Escape");

  // can't reach the service
  await page.evaluate(() => { const a = window.__declare.find("app"); a.base = "http://127.0.0.1:9"; });
  await drive.key("ArrowRight");
  await drive.wait(1500);
  await drive.settleData();
  await shot("16-save-failed");
  await page.evaluate(() => { const a = window.__declare.find("app"); a.base = "http://127.0.0.1:8360"; });
  await page.getByRole("button", { name: "Try saving again" }).click();
  await drive.settleData();
  await drive.wait(1200);
  await drive.settleData();
  await shot("17-saved-again");

  // conflict
  const cur = await app("app.current");
  await page.evaluate(async ([u, id]) => {
    const s = await (await fetch(`${u}/api/slides/${id}`)).json();
    await fetch(`${u}/api/slides/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: s.version, background: "#FFD166", elements: s.elements }) });
  }, [API, cur]);
  await page.evaluate(() => window.__declare.find("app").sync.check(window.__declare.find("app").current));
  await drive.wait(100);
  await drive.settleData();
  await shot("18-conflict");
  await page.getByRole("button", { name: "Keep mine" }).click();
  await drive.wait(1200);
  await drive.settleData();

  // presenting
  await drive.click("app.editor.bar.present");
  await shot("19-presenting");
  await drive.key("End");
  await drive.key("ArrowRight");
  await shot("20-presenting-end");
  await drive.key("Escape");
  await drive.settleMotion();

  // back home, a card's menu, the delete question
  await drive.click("app.editor.bar.home");
  await drive.settleData();
  await shot("21-home-after");
  await page.getByRole("button", { name: "More for Look: field notes" }).click();
  await shot("22-card-menu");
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await shot("23-delete-dialog");
  await page.getByRole("button", { name: "Cancel" }).click();
  } finally {
    await page.evaluate(async ([u, id]) => fetch(`${u}/api/decks/${id}`, { method: "DELETE" }), [API, made]);
  }
};
