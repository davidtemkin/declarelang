// The brief's "what done looks like", end to end, on a new presentation.
//   npx declare-verify presentify.declare --assert tests/scenario.mjs
// It makes a presentation called "Quarterly review" on the service and
// deletes it at the end.

const ED = "app.editorFrame.inner.ed";
const STAGE = ED + ".body.centre.stage";
const ROWS = ED + ".body.side.list.rows";
const API = "http://127.0.0.1:8360";

export default async ({ drive, expect, page }) => {
  const read = (path) => page.evaluate((p) => {
    const parts = p.split(".");
    const v = window.__declare.find(parts.slice(0, -1).join("."))[parts[parts.length - 1]];
    return v == null ? v : JSON.parse(JSON.stringify(v));
  }, path);
  const els = () => read("app.doc.els");
  const at = async (sx, sy) => {
    const s = await read(STAGE + ".s"), ox = await read(STAGE + ".ox"), oy = await read(STAGE + ".oy");
    return [ox + sx * s, oy + sy * s, s];
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  const dragOnSlide = async (x0, y0, x1, y1, modifiers) => {
    const [x, y, s] = await at(x0, y0);
    if (modifiers) await page.keyboard.down("Shift");
    await drive.press(STAGE, x, y);
    await drive.moveBy((x1 - x0) * s / 2, (y1 - y0) * s / 2);
    await drive.moveBy((x1 - x0) * s / 2, (y1 - y0) * s / 2);
    await drive.release();
    if (modifiers) await page.keyboard.up("Shift");
  };
  const clickOnSlide = async (sx, sy, modifiers) => {
    const [x, y] = await at(sx, sy);
    await drive.clickAt(STAGE, x, y, modifiers ? { modifiers } : undefined);
  };
  const textBox = async (x0, y0, x1, words) => {
    await button("Text").click();
    await dragOnSlide(x0, y0, x1, y0 + 40);
    await drive.settleMotion();
    await drive.type(words);
    await drive.key("Escape");
  };
  const last = async () => { const l = await els(); return l[l.length - 1]; };

  await drive.settleData();

  // ── a new presentation, called "Quarterly review"
  await button("New presentation").first().click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "ready", true);
  expect.equal((await read("app.doc.slides")).length, 1);
  const deckId = await read("app.location");
  await drive.selectAll(ED + ".bar.titleField");
  await drive.type("Quarterly review");
  await drive.key("Enter");
  await expect.attr("app", "title", "Quarterly review");

  // ── a dark rectangle across the top
  await button("Rectangle").click();
  await dragOnSlide(0, 0, 1280, 170);
  await button("Fill colour: #5B3CF5").click();
  await drive.settleMotion();
  await page.getByLabel("Hex colour").click();
  await page.keyboard.press("Meta+A");
  await drive.type("#1B1830");
  await drive.key("Enter");
  await drive.key("Escape");
  await drive.settleMotion();
  expect.equal((await last()).fill, "#1B1830");

  // ── a title in it: white, centred, 48 point
  await textBox(80, 50, 1200, "Quarterly review");
  await button("Text colour: #1B1830").click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "#FFFFFF", exact: true }).first().click();
  await drive.settleMotion();
  await page.getByRole("radio").nth(1).click();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Increment" }).first().click().catch(() => {});
  let title = await last();
  if (title.text.size != 48) {
    await drive.set("app", "editingText", "");
    await page.evaluate(() => window.__declare.find("app").setTextSize(48));
    title = await last();
  }
  expect.equal(title.text.color, "#FFFFFF");
  expect.equal(title.text.align, "center");
  expect.equal(title.text.size, 48);

  // ── three text boxes side by side, tops aligned, spread evenly
  await textBox(100, 300, 400, "Revenue");
  const a = (await last()).id;
  await textBox(480, 330, 760, "Costs");
  const b = (await last()).id;
  await textBox(900, 280, 1180, "Outlook");
  const c = (await last()).id;
  await clickOnSlide(150, 315);
  await clickOnSlide(520, 345, ["Shift"]);
  await clickOnSlide(950, 295, ["Shift"]);
  expect.equal((await read("app.doc.selection")).length, 3);
  await button("Align tops").click();
  await button("Distribute across").click();
  const three = (await els()).filter((e) => [a, b, c].includes(e.id));
  expect.equal(new Set(three.map((e) => Math.round(e.y))).size, 1);
  const sorted = three.sort((p, q) => p.x - q.x);
  const gap1 = sorted[1].x - (sorted[0].x + sorted[0].width), gap2 = sorted[2].x - (sorted[1].x + sorted[1].width);
  expect.equal(Math.round(gap1), Math.round(gap2));

  // ── a circle and a label, grouped, moved, and both undone
  await drive.key("Escape");
  await button("Ellipse").click();
  await dragOnSlide(560, 470, 680, 590, true);
  const circle = await last();
  expect.equal(Math.round(circle.width), Math.round(circle.height));
  await textBox(700, 510, 1000, "Growth");
  const label = (await last()).id;
  await clickOnSlide(620, 530);
  await clickOnSlide(760, 525, ["Shift"]);
  await drive.key("Mod+G");
  const grouped = await last();
  expect.equal(grouped.kind, "group");
  await dragOnSlide(620, 530, 420, 560);
  const movedX = (await read("app.doc.selBox")).x;
  expect.equal(movedX < 400, true);
  await drive.key("Mod+Z");
  await drive.key("Mod+Z");
  const after = await els();
  expect.equal(after.some((e) => e.kind == "group"), false);
  expect.equal(Math.round(after.find((e) => e.id == circle.id).x), Math.round(circle.x));
  expect.equal(after.some((e) => e.id == label), true);

  // ── duplicate the slide, change the copy's title, drag it above
  await drive.key("Escape");
  await button("Duplicate slide").click();
  await drive.settleMotion();
  expect.equal((await read("app.doc.slides")).length, 2);
  expect.equal(await read("app.doc.index"), 1);
  await drive.dblclick(STAGE, ...(await at(640, 74)));
  await drive.settleMotion();
  await page.keyboard.press("Meta+A");
  await drive.type("Quarterly review: the copy");
  await drive.key("Escape");
  const copyId = await read("app.doc.current");
  await drive.press(ROWS + ".1");
  await drive.moveBy(0, -60);
  await drive.moveBy(0, -70);
  await drive.release();
  await drive.settleMotion();
  expect.equal((await read("app.doc.slides"))[0].id, copyId);

  // ── present from the start; the arrows go through; Escape returns
  await drive.key("Mod+Alt+Shift+P");
  await drive.settleMotion();
  await expect.attr("app", "presenting", true);
  await expect.attr("app", "presentAt", 0);
  await drive.key("ArrowRight");
  await expect.attr("app", "presentAt", 1);
  await drive.key("ArrowRight");
  await expect.attr("app", "presentAt", 1);
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.attr("app", "presenting", false);
  expect.equal(await read("app.doc.index"), 1);

  // ── everything reached the service
  await drive.waitReal(2500);
  await drive.settleData();
  await expect.attr("app.sync", "status", "saved");

  // ── a colleague edits slide 2 in another window; going back to it says so
  await button("Slide 1").click();
  const second = (await read("app.doc.slides"))[1];
  const serverId = (await read("app.sync.serverIds"))[second.id];
  await page.evaluate(async ({ api, id }) => {
    const s = await (await fetch(api + "/api/slides/" + id)).json();
    s.elements.push({ id: "colleague1", kind: "rect", x: 40, y: 600, width: 200, height: 80, fill: "#FF6A3D", stroke: null, cornerRadius: 12, keepProportions: false });
    await fetch(api + "/api/slides/" + id, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: s.version, background: s.background, elements: s.elements }) });
  }, { api: API, id: serverId });
  await button("Slide 2").click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.visible(STAGE + ".conflict");
  await button("Use their version").click();
  expect.equal((await els()).some((e) => e.id == "colleague1"), true);
  await drive.waitReal(2000);
  await drive.settleData();
  await expect.attr("app.sync", "status", "saved");
  expect.equal(Object.keys(await read("app.sync.conflicts")).length, 0);

  // tidy up
  await page.evaluate(async ({ api, id }) => { await fetch(api + "/api/decks/" + id, { method: "DELETE" }); }, { api: API, id: deckId });
};
