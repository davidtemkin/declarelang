// Drawing, typing, undo and saving, on a presentation of its own.
//   npx declare-verify presentify.declare --assert tests/draw.mjs
// It makes a presentation of its own on the service, and deletes it at the end.

const STAGE = "app.editorFrame.inner.ed.body.centre.stage";

export default async ({ drive, expect, page }) => {
  const read = (path) => page.evaluate((p) => {
    const parts = p.split(".");
    let v = window.__declare.find(parts.slice(0, -1).join("."));
    return JSON.parse(JSON.stringify(v[parts[parts.length - 1]]));
  }, path);
  const els = async () => read("app.doc.els");
  // a point on the slide (in slide points) as a point inside the stage
  const at = async (sx, sy) => {
    const s = await read(STAGE + ".s"), ox = await read(STAGE + ".ox"), oy = await read(STAGE + ".oy");
    return [ox + sx * s, oy + sy * s, s];
  };

  const DECK = await page.evaluate(async () => {
    const r = await fetch("http://127.0.0.1:8360/api/decks", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test: draw" }) });
    return (await r.json()).deck.id;
  });
  await drive.set("app", "location", DECK);
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "ready", true);
  const start = (await els()).length;

  // A rectangle across the top, by dragging.
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await expect.attr("app", "tool", "rect");
  let [x, y, s] = await at(60, 40);
  await drive.press(STAGE, x, y);
  await drive.moveBy(200 * s, 60 * s);
  await drive.moveBy(1160 * s - 200 * s, 150 * s - 60 * s);
  await drive.release();
  let list = await els();
  expect.equal(list.length, start + 1);
  const rect = list[list.length - 1];
  expect.equal(rect.kind, "rect");
  expect.equal(Math.round(rect.width), 1160);
  await expect.attr("app", "tool", "select");

  // One step: undo takes it away, redo puts it back.
  await drive.key("Mod+Z");
  expect.equal((await els()).length, start);
  await drive.key("Mod+Shift+Z");
  expect.equal((await els()).length, start + 1);

  // A text box, by a click with the Text tool, typed into.
  await page.getByRole("button", { name: "Text", exact: true }).click();
  [x, y] = await at(400, 400);
  await drive.clickAt(STAGE, x, y);
  await drive.settleMotion();
  expect.equal((await read("app.editingText")) != "", true);
  await drive.type("Quarterly review");
  await drive.key("Escape");
  list = await els();
  const t = list[list.length - 1];
  expect.equal(t.kind, "text");
  expect.equal(t.text.content, "Quarterly review");
  await expect.attr("app", "editingText", "");

  // An empty text box disappears when editing ends, and leaves no step.
  const steps = (await read("app.doc.history.undos")).length;
  await page.getByRole("button", { name: "Text", exact: true }).click();
  [x, y] = await at(200, 600);
  await drive.clickAt(STAGE, x, y);
  await drive.key("Escape");
  expect.equal((await els()).length, start + 2);
  expect.equal((await read("app.doc.history.undos")).length, steps);

  // Saved within about two seconds.
  await drive.waitReal(2500);
  await drive.settleData();
  await expect.attr("app.sync", "status", "saved");
  const saved = await page.evaluate(async (d) => {
    const r = await fetch("http://127.0.0.1:8360/api/decks/" + d + "/slides");
    return (await r.json()).slides[0].elements.length;
  }, DECK);
  expect.equal(saved, start + 2);

  await page.evaluate(async (d) => { await fetch("http://127.0.0.1:8360/api/decks/" + d, { method: "DELETE" }); }, DECK);
};
