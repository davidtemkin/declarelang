// The finer points of editing: handles, proportions, groups, the clipboard,
// nudging, and the inspector as one undo step. Makes its own presentation.

export const device = { width: 1440, height: 900 };

const API = "http://127.0.0.1:8360/api";
const read = (page, path, attr) => page.evaluate((p, a) => {
  const v = window.__declare.find(p)[a];
  return JSON.parse(JSON.stringify(v ?? null));
}, path, attr);
const call = (page, method, url, body) => page.evaluate(async (m, u, b) => {
  const r = await fetch(u, { method: m, headers: { "content-type": "application/json" }, body: b == null ? undefined : JSON.stringify(b) });
  return r.status == 204 ? null : r.json();
}, method, url, body ?? null);
const el = async (page, id) => (await read(page, "app.ed", "els")).flatMap(function all(e) { return [e, ...(e.children ?? []).flatMap(all)]; }).find((e) => e.id == id);

export default async ({ drive, expect, page }) => {
  const made = await call(page, "POST", API + "/decks", { title: "Editing test" });
  const s1 = made.slides[0];
  await call(page, "PUT", API + "/slides/" + s1.id, { version: 1, background: "#FFFFFF", elements: [
    { id: "r", kind: "rect", x: 100, y: 100, width: 200, height: 100, fill: "#FF0000", stroke: null, cornerRadius: 30, keepProportions: false },
    { id: "c", kind: "ellipse", x: 500, y: 100, width: 200, height: 200, fill: "#00FF00", stroke: null, keepProportions: true },
    { id: "l", kind: "line", x1: 100, y1: 500, x2: 400, y2: 500, stroke: { color: "#000000", width: 4 } },
    { id: "g", kind: "group", children: [
      { id: "g1", kind: "rect", x: 800, y: 400, width: 100, height: 100, fill: "#0000FF", stroke: null, cornerRadius: 0, keepProportions: false },
      { id: "g2", kind: "rect", x: 950, y: 400, width: 100, height: 100, fill: "#00FFFF", stroke: null, cornerRadius: 0, keepProportions: false }] }] });
  try {
  await drive.set("app", "location", made.deck.id);
  await drive.settleData();
  await drive.settleMotion();

  const slide = page.getByLabel("Slide", { exact: true });
  const box = await slide.boundingBox();
  const k = box.width / 1280;
  const at = (x, y) => ({ x: box.x + x * k, y: box.y + y * k });
  const drag = async (a, b, mods = []) => {
    for (const m of mods) await page.keyboard.down(m);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8);
    await page.mouse.up();
    for (const m of mods) await page.keyboard.up(m);
    await drive.settleMotion();
  };
  const click = async (x, y, mods = []) => {
    for (const m of mods) await page.keyboard.down(m);
    await page.mouse.click(at(x, y).x, at(x, y).y);
    for (const m of mods) await page.keyboard.up(m);
    await drive.settleMotion();
  };

  // resize the rounded rectangle wider from its right handle: the radius stays
  await click(200, 150);
  await drag(at(300, 150), at(500, 150));
  let r = await el(page, "r");
  expect.equal(r.width, 400);
  expect.equal(r.height, 100);
  expect.equal(r.cornerRadius, 30);
  // with shift from a corner, it keeps its proportions
  await drag(at(500, 200), at(600, 260), ["Shift"]);
  r = await el(page, "r");
  expect.equal(Math.round(r.width / r.height * 100), 400);

  // the circle keeps proportions by itself; shift lets it change them once
  await click(600, 200);
  await drag(at(700, 300), at(800, 330));
  let c = await el(page, "c");
  expect.equal(c.width, c.height);
  await drag(at(c.x + c.width, c.y + c.height), at(c.x + c.width + 60, c.y + c.height), ["Shift"]);
  c = await el(page, "c");
  expect.equal(c.width == c.height, false);

  // a line's end handle
  await click(250, 500);
  await drag(at(400, 500), at(400, 600));
  const l = await el(page, "l");
  expect.equal(l.y2, 600);
  expect.equal(l.x1, 100);

  // arrows nudge, shift-arrows by ten; Escape clears
  await drive.key("ArrowRight");
  await drive.key("Shift+ArrowDown");
  const l2 = await el(page, "l");
  expect.equal(l2.x1, 101);
  expect.equal(l2.y1, 510);
  await drive.key("Escape");
  expect.equal((await read(page, "app.ed", "sel")).length, 0);

  // a click on a group selects the group; a double-click selects inside it
  await click(850, 450);
  expect.equal(await read(page, "app.ed", "sel"), ["g"]);
  const st = await page.evaluate(() => { const v = window.__declare.find("app.editor.body.stage"); const o = v.rootOrigin(); return { x: o.x, y: o.y }; });
  await drive.dblclick("app.editor.body.stage", at(1000, 450).x - st.x, at(1000, 450).y - st.y);
  await drive.settleMotion();
  expect.equal(await read(page, "app.ed", "sel"), ["g2"]);
  // moving the inner one leaves the group whole
  await drag(at(1000, 450), at(1000, 550));
  expect.equal((await el(page, "g2")).y, 500);
  expect.equal((await el(page, "g1")).y, 400);
  await drive.key("Escape");
  await drive.key("Escape");

  // ungroup puts the parts back where they were
  await click(850, 450);
  await drive.key("Mod+Shift+G");
  expect.equal((await read(page, "app.ed", "sel")).sort(), ["g1", "g2"]);
  expect.equal((await el(page, "g2")).y, 500);

  // the inspector: a fill applied to two at once is one step
  await page.getByRole("button", { name: /^Fill colour/ }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "#FFC94D" }).click();
  await drive.settleMotion();
  expect.equal((await el(page, "g1")).fill, "#FFC94D");
  expect.equal((await el(page, "g2")).fill, "#FFC94D");
  await drive.key("Mod+Z");
  expect.equal((await el(page, "g1")).fill, "#0000FF");
  expect.equal((await el(page, "g2")).fill, "#00FFFF");
  expect.equal((await read(page, "app.ed", "sel")).sort(), ["g1", "g2"]);

  // duplicate: offset, selected
  await drive.key("Mod+D");
  const sel = await read(page, "app.ed", "sel");
  expect.equal(sel.length, 2);
  const dup = await el(page, sel[0]);
  expect.equal(dup.x - 800 == 20 || dup.x - 950 == 20, true);

  // copy, paste on a new slide, and drag-select (marquee) touching two
  await page.evaluate(() => window.__declare.find("app.ed").copy());
  await page.getByRole("button", { name: "New slide" }).first().click();
  await drive.settleMotion();
  await page.evaluate(() => { const e = window.__declare.find("app.ed"); e.paste(e.clip); });
  expect.equal((await read(page, "app.ed", "els")).length, 2);
  await drive.key("Escape");
  await drag(at(10, 10), at(1270, 710));
  expect.equal((await read(page, "app.ed", "sel")).length, 2);

  await drive.wait(1500);
  await drive.settleData();
  expect.equal(await read(page, "app.saver", "statusText"), "All changes saved");
  const deck = await call(page, "GET", API + "/decks/" + made.deck.id);
  expect.equal(deck.slideOrder.length, 2);
  } finally { await call(page, "DELETE", API + "/decks/" + made.deck.id); }
};
