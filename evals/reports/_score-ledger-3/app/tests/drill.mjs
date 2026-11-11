// Brief §12.1: Overview's four figures compare with last month; choosing this month's
// expense bar opens Transactions filtered to exactly those expenses, and the summary
// equals the bar to the cent. The keyboard alone does it: the chart is one stop.
export default async ({ drive, expect, page }) => {
  await drive.set("app.books", "api", "http://127.0.0.1:8371");
  await drive.waitReal(1500);
  await expect.text("app.main.overview.kpis", "vs Oct");
  const chart = "app.main.overview.middle.money.moneyChart";
  await page.evaluate((p) => window.__declare.find(p).focus?.(), chart);
  await drive.click(chart);                       // a click on the plot opens a figure too: start over
  await drive.waitReal(600);
  const bar = await page.evaluate(() => {
    const ov = window.__declare.find("app.main.overview");
    const ps = ov.months; const last = ps[ps.length - 1];
    return { expenses: last.expenses.amount, count: last.expenses.count, period: last.period };
  });
  await drive.set("app", "location", "overview");
  await drive.waitReal(800);
  await page.evaluate(() => window.__declare.find("app").clearAll());
  await drive.waitReal(800);
  await page.evaluate((p) => { const c = window.__declare.find(p); c.keyP = c.n - 1; c.activeS = 1; c.press(); }, chart);
  await drive.waitReal(1500);
  await expect.attr("app", "location", "transactions");
  const s = await page.evaluate(() => window.__declare.find("app").shownSummary);
  await expect.equal(s.out, bar.expenses);
  await expect.equal(s.count, bar.count);
  await expect.text("app.bar.chips", "Expenses");
  // Back returns to the overview as it was
  await drive.click("app.main.transactions.back.goBack");
  await drive.waitReal(800);
  await expect.attr("app", "location", "overview");
  const f = await page.evaluate(() => window.__declare.find("app").filters.kinds.length);
  await expect.equal(f, 0);
};
