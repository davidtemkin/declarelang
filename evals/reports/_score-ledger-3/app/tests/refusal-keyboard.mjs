// A refused save keeps the editor open with what was typed, the message at the field it
// concerns. And a chart is one keyboard stop: arrows move, a sentence is announced, Enter opens.
export default async ({ drive, expect, page }) => {
  await drive.set("app.books", "api", "http://127.0.0.1:8371");
  await drive.waitReal(1500);
  await drive.click("app.head.newExpense");
  await drive.settleMotion();
  await drive.type("42.50");
  // an archived category can't be picked in the editor; the service would refuse it, so ask it
  await page.evaluate(() => { window.__declare.find("app.recordSheet.body.expense").categoryId = "travel"; });
  await drive.click("app.recordSheet.body.expense.foot.row.save");
  await drive.waitReal(1200);
  await expect.attr("app", "recording", "expense");
  await expect.attr("app.recordSheet.body.expense.catBlock.pick.category", "refused", "Category was archived");
  await expect.attr("app.recordSheet.body.expense", "amountText", "42.50");
  await drive.key("Escape");
  await drive.settleMotion();

  // the chart, by keyboard
  const chart = "app.main.overview.middle.money.moneyChart";
  await drive.click("app.bar.top.search");
  for (let i = 0; i < 20; i++) {
    await drive.tab();
    const on = await page.evaluate((p) => window.__declare.find(p).focused, chart);
    if (on) break;
  }
  await expect.attr(chart, "focused", true);
  await drive.key("ArrowLeft");
  await drive.key("ArrowDown");
  const said = await page.evaluate((p) => window.__declare.find(p).spoken, chart);
  await expect.equal(/^October 2026, Expenses, \$[\d,]+\.\d\d, (up|down) .* from the month before, \d+ transactions$/.test(said), true);
  await drive.key("Enter");
  await drive.waitReal(1200);
  await expect.attr("app", "location", "transactions");
  await expect.attr("app", "rangeName", "October 2026");
};
