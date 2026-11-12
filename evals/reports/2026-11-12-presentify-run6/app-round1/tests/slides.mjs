// Slides: duplicate, reorder by dragging, present, and a colleague's edit
// from another window. Makes its own presentation, deletes it at the end.

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

export default async ({ drive, expect, page }) => {
  // a presentation with a title on its first slide, made through the service
  const made = await call(page, "POST", API + "/decks", { title: "Slides test" });
  const s1 = made.slides[0];
  await call(page, "PUT", API + "/slides/" + s1.id, { version: 1, background: "#FFFFFF", elements: [
    { id: "t", kind: "text", x: 100, y: 100, width: 800, height: 60, keepProportions: false,
      text: { content: "Original title", font: "Georgia", size: 48, weight: 700, italic: false, color: "#111111", align: "center" } }] });
  try {
  await drive.set("app", "location", made.deck.id);
  await drive.settleData();
  await drive.settleMotion();

  // duplicate the slide from the list's menu key, change its title
  await page.getByRole("option", { name: "Slide 1" }).click();
  await drive.key("Mod+D");
  await drive.settleMotion();
  expect.equal((await read(page, "app.doc", "value")).slides.length, 2);
  expect.equal(await read(page, "app.ed", "slideIndex"), 1);
  await page.evaluate(() => window.__declare.find("app.ed").editText("t"));
  await drive.settleMotion();
  await drive.key("Mod+A");
  await drive.type("Copy title");
  await drive.key("Escape");
  const els = await read(page, "app.ed", "els");
  expect.equal(els[0].text.content, "Copy title");

  // drag the copy above the original
  const row2 = page.getByRole("option", { name: "Slide 2" });
  const b = await row2.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - i * 12);
  await page.mouse.up();
  await drive.settleMotion();
  const order = (await read(page, "app.doc", "value")).slides;
  expect.equal(order[0].elements[0].text.content, "Copy title");
  expect.equal(order[1].elements[0].text.content, "Original title");

  await drive.wait(1500);
  await drive.settleData();
  expect.equal(await read(page, "app.saver", "statusText"), "All changes saved");
  const deck = await call(page, "GET", API + "/decks/" + made.deck.id);
  expect.equal(deck.slideOrder.length, 2);
  expect.equal(deck.slideOrder[1], s1.id);

  // present from the start, arrows through, Escape back
  await page.getByRole("option", { name: "Slide 1" }).click();
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await drive.settleMotion();
  expect.equal(await read(page, "app", "presenting"), true);
  await drive.key("ArrowRight");
  expect.equal(await read(page, "app.presenterView", "at"), 1);
  await drive.key("ArrowRight");
  expect.equal(await read(page, "app.presenterView", "at"), 1);
  await drive.key("Escape");
  await drive.settleMotion();
  expect.equal(await read(page, "app", "presenting"), false);
  expect.equal(await read(page, "app.ed", "slideIndex"), 1);

  // meanwhile a colleague edits the original (now second) slide elsewhere
  await page.getByRole("option", { name: "Slide 1" }).click();
  const theirs = await call(page, "GET", API + "/slides/" + s1.id);
  await call(page, "PUT", API + "/slides/" + s1.id, { version: theirs.version, background: "#FFF4DC",
    elements: [{ ...theirs.elements[0], text: { ...theirs.elements[0].text, content: "Colleague's title" } }] });
  // coming back to it, they are told, and take the colleague's version
  await page.getByRole("option", { name: "Slide 2" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("This slide was changed in another window.")).toBeVisible();
  await page.getByRole("button", { name: "Use their version" }).click();
  await drive.settleMotion();
  expect.equal((await read(page, "app.ed", "els"))[0].text.content, "Colleague's title");
  await drive.wait(1500);
  await drive.settleData();
  expect.equal(await read(page, "app.saver", "statusText"), "All changes saved");

  } finally { await call(page, "DELETE", API + "/decks/" + made.deck.id); }
};
