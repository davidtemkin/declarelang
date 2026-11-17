// The rest of what a person reaches: renaming and deleting from the list,
// a double-click into a group, a click through a presentation.
//   npx declare-verify my-apps/presentify/presentify.declare \
//     --url http://127.0.0.1:8200/my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/more.mjs

const API = "http://127.0.0.1:8360";
const val = (page, expr) => page.evaluate((e) => JSON.parse(JSON.stringify(new Function("app", "return " + e)(window.__declare.find("app")))), expr);
const decks = (page) => page.evaluate(async (a) => (await (await fetch(`${a}/api/decks`)).json()).decks, API);

export default async ({ drive, expect, page }) => {
  // A presentation to rename and then delete.
  await drive.click("app.home.bar.2");
  await drive.settleData(); await drive.settleMotion();
  const id = await val(page, "app.loadedId");
  await drive.click("app.editor.bar.left.back");
  await drive.settleData(); await drive.settleMotion();
  await expect.equal(await val(page, "app.home.page.grid.childViews[0].deckId"), id);

  await page.getByRole("button", { name: "More for Untitled presentation" }).first().click();
  await drive.settleMotion();
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  await drive.settleMotion();
  await page.getByLabel("Title", { exact: true }).fill("Renamed in the list");
  await page.getByRole("button", { name: "Rename" }).click();
  await drive.settleData(); await drive.settleMotion();
  await expect.equal((await decks(page)).find((d) => d.id == id).title, "Renamed in the list");
  await expect.text("app.home.page.grid", "Renamed in the list");

  // A double-click steps into a group and selects one thing in it.
  await drive.set("app", "location", "d1");
  await drive.settleData(); await drive.settleMotion();
  const z = await val(page, "app.zoom");
  await drive.clickAt("app.editor.body.stage.paper", Math.round(1000 * z), Math.round(650 * z));
  await expect.equal(await val(page, "app.ed.sel"), ["e5"]);
  await drive.dblclick("app.editor.body.stage.paper", Math.round(1000 * z), Math.round(650 * z));
  await expect.equal(await val(page, "app.ed.scope"), "e5");
  await expect.equal((await val(page, "app.ed.sel")).length, 1);
  if ((await val(page, "app.ed.sel[0]")) == "e5") throw new Error("the double-click did not step into the group");
  await drive.key("Escape");
  await expect.equal(await val(page, "app.ed.sel"), ["e5"]);
  await expect.equal(await val(page, "app.ed.scope"), "");
  await drive.key("Escape");

  // A click moves through a presentation; past the end, a closing card; Escape ends it.
  await page.getByRole("button", { name: "Slide 7", exact: true }).click();
  await drive.click("app.editor.bar.right.Present");
  await drive.settleMotion();
  await drive.click("app.presenter.screen");
  await expect.equal(await val(page, "app.presenter.at"), 7);
  await drive.click("app.presenter.screen");
  await expect.equal(await val(page, "app.presenter.done"), true);
  await expect.visible("app.presenter.screen.end");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.equal(await val(page, "app.ed.index"), 7);
  await expect.equal(await val(page, "app.saver.status"), "saved");

  // Deleting asks first, and Cancel keeps it.
  await drive.set("app", "location", "");
  await drive.settleData(); await drive.settleMotion();
  const more = page.getByRole("button", { name: "More for Renamed in the list" });
  await more.first().click();
  await drive.settleMotion();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "Cancel" }).click();
  await drive.settleMotion();
  await expect.equal((await decks(page)).some((d) => d.id == id), true);
  while (await more.count() > 0) {
    await more.first().click();
    await drive.settleMotion();
    await page.getByRole("menuitem", { name: "Delete…" }).click();
    await drive.settleMotion();
    await page.getByRole("button", { name: "Delete" }).click();
    await drive.settleData(); await drive.settleMotion();
  }
  await expect.equal((await decks(page)).some((d) => d.id == id), false);
};
