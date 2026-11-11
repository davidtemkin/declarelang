// Brief §12.5: clear the filters; filter to Uncategorised; select all; categorise as
// Other; undo with ⌘Z. Then edit a row in place: Enter saves, and the service hears it.
export default async ({ drive, expect, page }) => {
  await drive.set("app.books", "api", "http://127.0.0.1:8371");
  await drive.set("app", "location", "transactions");
  await drive.waitReal(1500);
  await page.evaluate(() => { const a = window.__declare.find("app"); a.clearAll(); a.setPreset("all"); });
  await drive.click("app.bar.top.buttons.cat");
  await drive.settleMotion();
  await drive.click('app.catPop.panel.list."Uncategorised"');
  await drive.key("Escape");
  await drive.waitReal(1500);
  const n = await page.evaluate(() => window.__declare.find("app").shownSummary.count);
  await drive.click("app.main.transactions.desk.table.summary.all");
  await drive.settleMotion();
  await expect.text("app.main.transactions.desk.table.bulk", "All " + n + " matching transactions selected");
  await drive.click("app.main.transactions.desk.table.bulk.1");
  await drive.settleMotion();
  await drive.click('app.categoriseMenu."Other"');
  await drive.waitReal(1500);
  await expect.request("POST", "/api/transactions/bulk", { body: { action: "categorise", categoryId: "other", expectedCount: n } });
  await expect.text("app.toast", "Categorised");
  const after = await page.evaluate(() => window.__declare.find("app").shownSummary.count);
  await expect.equal(after, 0);
  await drive.key("Mod+Z");
  await drive.waitReal(1500);
  await expect.request("POST", "/api/changes/");
  const back = await page.evaluate(() => window.__declare.find("app").shownSummary.count);
  await expect.equal(back, n);

  // in place: the first row's description, Enter saves it
  await page.evaluate(() => { const a = window.__declare.find("app"); a.clearAll(); });
  await drive.waitReal(1200);
  const first = await page.evaluate(() => window.__declare.find("app").rows[0]);
  await page.evaluate(() => { const a = window.__declare.find("app"); a.beginEdit(a.rows[0], "description"); });
  await drive.settleMotion();
  await drive.selectAll("app.main.transactions.desk.table.frame.grid.0._cells.1.0.editors.desc");
  await drive.type("Edited in place");
  await drive.key("Enter");
  await drive.waitReal(1200);
  await expect.request("PATCH", "/api/transactions/" + first.id, { body: { description: "Edited in place" } });
  await expect.attr("app", "editId", "");
  const now = await page.evaluate(() => window.__declare.find("app").rows[0].description);
  await expect.equal(now, "Edited in place");
};
