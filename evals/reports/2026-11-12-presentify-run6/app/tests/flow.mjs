// The brief's "what done looks like", driven as a person would, against the
// live service. It makes its own presentation and deletes it at the end.
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/flow.mjs

export const device = { width: 1440, height: 900 };

const read = (page, path, attr) => page.evaluate((p, a) => {
  const v = window.__declare.find(p)[a];
  return JSON.parse(JSON.stringify(v ?? null));
}, path, attr);

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  // 1. a new presentation, named
  await page.getByRole("button", { name: "New presentation" }).first().click();
  await drive.settleData();
  await drive.settleMotion();
  await drive.wait(600);
  const title = page.getByLabel("Presentation title");
  await expect(title).toBeFocused();
  await drive.type("Quarterly review");
  await drive.key("Enter");
  await drive.settleData();

  const slide = page.getByLabel("Slide", { exact: true });
  const box = await slide.boundingBox();
  const k = box.width / 1280;
  const at = (x, y) => ({ x: box.x + x * k, y: box.y + y * k });
  const dragOn = async (x1, y1, x2, y2, mods = []) => {
    const a = at(x1, y1), b = at(x2, y2);
    for (const m of mods) await page.keyboard.down(m);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8);
    await page.mouse.up();
    for (const m of mods) await page.keyboard.up(m);
    await drive.settleMotion();
  };

  // 2. a dark rectangle across the top
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await dragOn(0, 0, 1280, 200);
  let els = await read(page, "app.ed", "els");
  expect.equal(els.length, 1);
  expect.equal(els[0].kind, "rect");
  expect.equal(els[0].width, 1280);

  await drive.wait(1500);
  await drive.settleData();
  expect.equal(await read(page, "app.saver", "statusText"), "All changes saved");
  await expect.request("POST", "/api/decks", {});

  // 3. undo takes it back in one step, redo returns it
  await drive.key("Mod+Z");
  expect.equal((await read(page, "app.ed", "els")).length, 0);
  await drive.key("Mod+Shift+Z");
  expect.equal((await read(page, "app.ed", "els")).length, 1);

  // 4. a text box made with a click, typed into
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(at(200, 380).x, at(200, 380).y);
  await drive.settleMotion();
  await drive.type("Hello there");
  await drive.key("Escape");
  await drive.settleMotion();
  els = await read(page, "app.ed", "els");
  expect.equal(els.length, 2);
  expect.equal(els[1].text.content, "Hello there");

  // 5. three things: group two, move, undo twice
  await page.getByRole("button", { name: "Ellipse", exact: true }).click();
  await dragOn(700, 400, 800, 500, ["Shift"]);
  els = await read(page, "app.ed", "els");
  expect.equal(els[2].kind, "ellipse");
  expect.equal(els[2].width, els[2].height);
  expect.equal(els[2].keepProportions, true);

  // shift-click the text to add it, then group
  await page.mouse.click(at(240, 400).x, at(240, 400).y, {});
  await page.keyboard.down("Shift");
  await page.mouse.click(at(750, 450).x, at(750, 450).y);
  await page.keyboard.up("Shift");
  expect.equal((await read(page, "app.ed", "sel")).length, 2);
  await drive.key("Mod+G");
  els = await read(page, "app.ed", "els");
  expect.equal(els.length, 2);
  expect.equal(els[1].kind, "group");
  await dragOn(750, 450, 850, 500);
  await drive.key("Mod+Z");
  await drive.key("Mod+Z");
  els = await read(page, "app.ed", "els");
  expect.equal(els.length, 3);

  await drive.wait(2000);
  await drive.settleData();
  expect.equal(await read(page, "app.saver", "statusText"), "All changes saved");

  // clean up: delete this presentation through the service
  const deckId = await read(page, "app.saver", "deckId");
  await page.evaluate((id) => fetch("http://127.0.0.1:8360/api/decks/" + id, { method: "DELETE" }), deckId);
};
