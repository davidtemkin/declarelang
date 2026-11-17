// Nothing is lost while the service can't be reached: the edit waits, the
// window says so, and it arrives when the service is back.
//   npx declare-verify … --url … --assert my-apps/presentify/tests/offline.mjs
const API = "http://127.0.0.1:8360";
const val = (page, expr) => page.evaluate((e) => JSON.parse(JSON.stringify(new Function("app", "return " + e)(window.__declare.find("app")))), expr);

export default async ({ drive, expect, page }) => {
  await drive.click("app.home.bar.2");
  await drive.settleData(); await drive.settleMotion();
  const id = await val(page, "app.loadedId");
  await drive.type("Offline test"); await drive.key("Enter");
  await drive.wait(1500); await drive.settleData();
  await expect.equal(await val(page, "app.saver.status"), "saved");

  await drive.set("app", "api", "http://127.0.0.1:9");          // the service goes away
  await page.getByRole("button", { name: "Add a title" }).click();
  await drive.type("Written while away");
  await drive.key("Escape");
  await drive.wait(2000); await drive.settleData();
  await expect.equal(await val(page, "app.saver.status"), "offline");
  await expect.text("app.editor.bar.left.named.status", "Not saved: can't reach the service");
  await expect.equal(await val(page, "app.unsavedChanges"), true);

  await drive.set("app", "api", API);                            // and comes back
  await drive.wait(3500); await drive.settleData();
  await drive.wait(1000); await drive.settleData();
  await expect.equal(await val(page, "app.saver.status"), "saved");
  await expect.text("app.editor.bar.left.named.status", "All changes saved");
  const slides = await page.evaluate(async ([a, d]) => (await (await fetch(`${a}/api/decks/${d}/slides`)).json()).slides, [API, id]);
  await expect.equal(slides[0].elements[0].text.content, "Written while away");
};
