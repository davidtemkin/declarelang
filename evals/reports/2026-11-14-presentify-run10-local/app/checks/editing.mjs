// The rest of what the brief asks of editing, each checked as a person does it.
// Run:
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/editing.mjs
// It makes two presentations and deletes them at the end.

const API = "http://127.0.0.1:8360";
const shot = (page, name) => page.screenshot({ path: `/tmp/pe-${name}.png` });
const STAGE = "app.editor.body.desk.stage";

async function at(drive, x, y) { const s = await drive.read("app.k"); return [x * s, y * s]; }
async function drag(drive, path, x0, y0, dx, dy, keys = []) {
  for (const key of keys) await drive.page.keyboard.down(key);
  await drive.press(path, x0, y0);
  await drive.moveBy(dx / 3, dy / 3);
  await drive.moveBy(dx / 3, dy / 3);
  await drive.moveBy(dx / 3, dy / 3);
  await drive.release();
  for (const key of keys) await drive.page.keyboard.up(key);
  await drive.settleMotion();
}
async function drawOnSlide(drive, x0, y0, x1, y1, keys = []) {
  const [px, py] = await at(drive, x0, y0);
  const [qx, qy] = await at(drive, x1, y1);
  await drag(drive, STAGE, px, py, qx - px, qy - py, keys);
}
async function clickSlide(drive, x, y, modifiers) {
  const [px, py] = await at(drive, x, y);
  await drive.clickAt(STAGE, px, py, modifiers ? { modifiers } : undefined);
  await drive.settleMotion();
}
// a handle of the selection, by kind, in the stage's pixels
async function handleAt(page, kind) {
  return page.evaluate((kind) => {
    const o = window.__declare.find("app.editor.body.desk.stage.overlay");
    const all = [...o.hs.childViews, ...o.ends.childViews];
    const h = all.find((v) => v.kind == kind);
    return [h.cx, h.cy];
  }, kind);
}
async function dragHandle(drive, page, kind, dx, dy, keys = []) {
  const [hx, hy] = await handleAt(page, kind);
  await drag(drive, STAGE, hx, hy, dx, dy, keys);
}
const els = (page) => page.evaluate(() => window.__declare.find("app.ed").els);
const last = async (page) => { const e = await els(page); return e[e.length - 1]; };
const sel = (page) => page.evaluate(() => [...window.__declare.find("app").sel]);
const slides = (page) => page.evaluate(() => window.__declare.find("app.doc").value.slides.map((s) => s.id));
async function newDeck(drive, expect) {
  await drive.click("app.home.body.grid.0");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "ready", true);
}

export default async ({ drive, expect, page }) => {
  await newDeck(drive, expect);
  const deckA = await drive.read("app.deckId");
  await drive.type("Editing checks");
  await drive.key("Enter");
  await drive.settleMotion();

  // ── a line, its ends dragged, shift keeping it at 45°
  await drive.key("l");
  await expect.attr("app", "tool", "line");
  await drawOnSlide(drive, 100, 600, 500, 650);
  let ln = await last(page);
  await expect.equal([ln.kind, ln.x1, ln.y1, ln.x2, ln.y2], ["line", 100, 600, 500, 650]);
  await expect.equal(ln.stroke != null && ln.stroke.width > 0, true);
  await expect.attr("app", "tool", "select");
  const k = await drive.read("app.k");
  await dragHandle(drive, page, "end2", 0, -150 * k);
  ln = await last(page);
  await expect.equal([ln.x2, Math.round(ln.y2)], [500, 500]);
  await dragHandle(drive, page, "end2", 37 * k, 0, ["Shift"]);
  ln = await last(page);
  await expect.equal(Math.abs(ln.y2 - ln.y1) < 0.5, true);   // nearest of 0°, 45°, 90°: flat here
  await shot(page, "01-line");

  // ── a rectangle: rounded by its corner handle; the radius survives a resize
  await drive.key("r");
  await drawOnSlide(drive, 300, 100, 700, 300);
  let r = await last(page);
  await expect.equal([r.kind, r.width, r.height, r.cornerRadius, r.keepProportions], ["rect", 400, 200, 0, false]);
  await dragHandle(drive, page, "radius", 30 * k, 30 * k);
  r = await last(page);
  const radius = r.cornerRadius;
  await expect.equal(radius > 30 && radius <= 100, true);
  await dragHandle(drive, page, "e", 200 * k, 0);
  r = await last(page);
  await expect.equal([Math.round(r.width), r.height, r.cornerRadius], [600, 200, radius]);
  // shift on a corner keeps its proportions (3:1)
  await dragHandle(drive, page, "se", -300 * k, 0, ["Shift"]);
  r = await last(page);
  await expect.equal(Math.abs(r.width / r.height - 3) < 0.02, true);
  await shot(page, "02-rect");

  // keep proportions, set in the inspector: no key needed, and shift frees it once
  await page.getByRole("checkbox", { name: /Keep proportions/ }).click();
  await drive.settleMotion();
  r = await last(page);
  await expect.equal(r.keepProportions, true);
  const ratio = r.width / r.height;
  await dragHandle(drive, page, "e", 90 * k, 0);
  r = await last(page);
  await expect.equal(Math.abs(r.width / r.height - ratio) < 0.02, true);
  await dragHandle(drive, page, "s", 0, 60 * k, ["Shift"]);
  r = await last(page);
  await expect.equal(Math.abs(r.width / r.height - ratio) > 0.1, true);
  await expect.equal(r.keepProportions, true);

  // ── an ellipse drawn with shift is a circle, and stays one
  await drive.key("o");
  await drawOnSlide(drive, 900, 380, 1000, 420, ["Shift"]);
  let c = await last(page);
  await expect.equal([c.kind, c.width == c.height, c.keepProportions], ["ellipse", true, true]);
  await dragHandle(drive, page, "e", 60 * k, 0);
  c = await last(page);
  await expect.equal(Math.abs(c.width - c.height) < 0.5, true);

  // ── nudging: one point, ten with shift
  const cx = c.x, cy = c.y;
  await drive.key("ArrowRight");
  await drive.key("Shift+ArrowDown");
  await drive.settleMotion();
  c = await last(page);
  await expect.equal([c.x, c.y], [cx + 1, cy + 10]);

  // ── a text box made by a click, left empty: gone when a click lands elsewhere
  const before = (await els(page)).length;
  await drive.key("t");
  await clickSlide(drive, 200, 420);
  await expect.equal((await els(page)).length, before + 1);
  await expect.equal((await drive.read("app.editingId")) != "", true);
  await clickSlide(drive, 1200, 680);
  await expect.attr("app", "editingId", "");
  await expect.equal((await els(page)).length, before);

  // ── the marquee selects everything it touches; Escape clears
  await drawOnSlide(drive, 80, 60, 720, 700);
  await expect.equal((await sel(page)).length, 2);
  await shot(page, "03-marquee");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.equal((await sel(page)).length, 0);

  // ── stacking order: the line to the back, then forward again
  let ids = (await els(page)).map((e) => e.id);
  const lineId = ids[0];
  const ccx = c.x + c.width / 2, ccy = c.y + c.height / 2;
  await clickSlide(drive, ccx, ccy);             // the circle, which is last
  const circleId = (await sel(page))[0];
  await page.getByRole("button", { name: "Send to back" }).click();
  await drive.settleMotion();
  ids = (await els(page)).map((e) => e.id);
  await expect.equal(ids[0], circleId);
  await page.getByRole("button", { name: "Bring forward" }).click();
  await drive.settleMotion();
  ids = (await els(page)).map((e) => e.id);
  await expect.equal(ids[1], circleId);
  await drive.key("Mod+Shift+]");
  await drive.settleMotion();
  ids = (await els(page)).map((e) => e.id);
  await expect.equal(ids[ids.length - 1], circleId);

  // ── undo puts the selection back as it was
  await drive.key("Escape");
  await drive.settleMotion();
  await drive.key("Mod+Z");
  await drive.settleMotion();
  await expect.equal(await sel(page), [circleId]);
  await drive.key("Mod+Shift+Z");
  await drive.settleMotion();

  // ── a group, and a double-click inside it selects one thing
  await clickSlide(drive, ccx, ccy);
  await clickSlide(drive, 500, 200, ["Shift"]);
  await drive.key("Mod+G");
  await drive.settleMotion();
  const g = await last(page);
  await expect.equal(g.kind, "group");
  await clickSlide(drive, ccx, ccy);
  await expect.equal(await sel(page), [g.id]);
  await drive.dblclick(STAGE, ...(await at(drive, ccx, ccy)));
  await drive.settleMotion();
  await expect.equal(await sel(page), [circleId]);
  await shot(page, "04-inside-group");
  await drive.key("Escape");
  await drive.wait(600);
  await clickSlide(drive, ccx, ccy);
  await drive.key("Mod+Shift+G");
  await drive.settleMotion();
  await expect.equal((await els(page)).some((e) => e.kind == "group"), false);
  await expect.equal((await sel(page)).length, 2);

  // ── copy, then paste on a new slide: same things, slightly offset, selected
  await drive.key("Mod+C");
  await drive.click("app.editor.body.rail.foot.0");
  await drive.settleMotion();
  let ss = await slides(page);
  await expect.equal(ss.length, 2);
  await expect.attr("app", "curId", ss[1]);
  await drive.key("Mod+V");
  await drive.settleMotion();
  const pasted = await els(page);
  await expect.equal(pasted.length, 2);
  await expect.equal((await sel(page)).length, 2);
  // duplicate: a copy, offset, selected
  await drive.key("Mod+D");
  await drive.settleMotion();
  await expect.equal((await els(page)).length, 4);
  await drive.key("Backspace");
  await drive.settleMotion();
  await expect.equal((await els(page)).length, 2);

  // ── the keyboard moves between slides in the list
  await page.getByRole("tab", { name: "Slide 2", exact: true }).click();
  await drive.settleMotion();
  await drive.key("ArrowUp");
  await drive.settleMotion();
  await expect.attr("app", "curId", ss[0]);
  await drive.key("ArrowDown");
  await drive.settleMotion();
  await expect.attr("app", "curId", ss[1]);
  // deleting a slide; the last one can't be
  await drive.key("Backspace");
  await drive.settleMotion();
  ss = await slides(page);
  await expect.equal(ss.length, 1);
  await drive.key("Backspace");
  await drive.settleMotion();
  await expect.equal((await slides(page)).length, 1);

  // ── saved, then to the presentations; paste into another presentation
  await drive.key("Mod+S");
  for (let i = 0; i < 5; i++) { await drive.wait(700); await drive.settleData(); }
  await expect.attr("app.sync", "status", "All changes saved");
  await drive.click("app.editor.bar.here.home");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "screen", "home");
  await newDeck(drive, expect);
  const deckB = await drive.read("app.deckId");
  await drive.key("Enter");
  await drive.key("Mod+V");
  await drive.settleMotion();
  await expect.equal((await els(page)).length, 2);
  await shot(page, "05-pasted-elsewhere");
  for (let i = 0; i < 5; i++) { await drive.wait(700); await drive.settleData(); }
  await expect.attr("app.sync", "status", "All changes saved");

  // ── renamed and deleted from the presentations, the delete asked first
  await drive.click("app.editor.bar.here.home");
  await drive.settleData();
  await drive.settleMotion();
  await page.getByRole("button", { name: "More for Editing checks", exact: true }).click();
  await drive.settleMotion();
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  await drive.settleMotion();
  await page.getByRole("textbox", { name: "Title" }).fill("Editing checks, renamed");
  await page.getByRole("button", { name: "Rename" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.equal((await (await page.evaluate(async ([api, id]) => (await fetch(api + "/api/decks/" + id)).json(), [API, deckA]))).title, "Editing checks, renamed");
  await page.getByRole("button", { name: "More for Editing checks, renamed", exact: true }).click();
  await drive.settleMotion();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await drive.settleMotion();
  await shot(page, "06-delete-asked");
  await page.getByRole("button", { name: "Cancel" }).click();
  await drive.settleData();
  await drive.settleMotion();
  let all = await page.evaluate(async (api) => (await (await fetch(api + "/api/decks")).json()).decks.map((d) => d.id), API);
  await expect.equal(all.includes(deckA), true);
  await page.getByRole("button", { name: "More for Editing checks, renamed", exact: true }).click();
  await drive.settleMotion();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "Delete" }).click();
  await drive.settleData();
  await drive.settleMotion();
  all = await page.evaluate(async (api) => (await (await fetch(api + "/api/decks")).json()).decks.map((d) => d.id), API);
  await expect.equal(all.includes(deckA), false);
  await shot(page, "07-home-after");

  await page.evaluate(async ([api, id]) => { await fetch(api + "/api/decks/" + id, { method: "DELETE" }); }, [API, deckB]);
};
