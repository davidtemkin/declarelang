// Pictures of the screens a person reaches, for a look by eye:
//   npx declare-verify my-apps/presentify/presentify.declare --url … --assert my-apps/presentify/tests/looks.mjs
const API = "http://127.0.0.1:8360";
const shot = (page, name) => page.screenshot({ path: `/tmp/look-${name}.png` });
const val = (page, expr) => page.evaluate((e) => JSON.parse(JSON.stringify(new Function("app", "return " + e)(window.__declare.find("app")))), expr);

export default async ({ drive, expect, page }) => {
  await shot(page, "home");
  await drive.click("app.home.page.grid.0");
  await drive.settleData(); await drive.settleMotion();
  // a colleague changes slide 2 while it is open here
  const id = await val(page, "app.loadedId");
  const slides = await page.evaluate(async ([a, d]) => (await (await fetch(`${a}/api/decks/${d}/slides`)).json()).slides, [API, id]);
  const s = slides[1];
  await page.evaluate(async ([a, s]) => fetch(`${a}/api/slides/${s.id}`, { method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: s.version, background: "#DDEBFF", elements: s.elements }) }), [API, s]);
  await drive.click("app.editor.body.slides.list.1");
  await drive.settleData(); await drive.settleMotion();
  await shot(page, "conflict");
  await page.getByRole("button", { name: "Keep mine" }).click();
  await drive.wait(1500); await drive.settleData();
  await expect.equal(await val(page, "app.saver.status"), "saved");
  // a context menu, a group stepped into, a line
  await drive.click("app.editor.body.slides.list.0");
  await drive.click("app.editor.bar.tools.Line");
  await drive.press("app.editor.body.stage.paper", 100, 330);
  await drive.moveBy(300, 20); await drive.release();
  await shot(page, "line");
  await drive.clickAt("app.editor.body.stage.paper", 620, 100, { button: "right" });
  await drive.settleMotion();
  await shot(page, "menu");
  await drive.key("Escape");
  await drive.click("app.editor.bar.right.2");
  await drive.settleMotion();
  await shot(page, "editmenu");
  await drive.key("Escape");
  await drive.click("app.editor.bar.left.back");
  await drive.settleData(); await drive.settleMotion();
  await shot(page, "home-after");
  await drive.click("app.home.page.grid.0.meta.more");
  await drive.settleMotion();
  await shot(page, "deckmenu");
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await drive.settleMotion();
  await shot(page, "confirm");
  await page.getByRole("button", { name: "Cancel" }).click();
  await drive.settleMotion();
};
