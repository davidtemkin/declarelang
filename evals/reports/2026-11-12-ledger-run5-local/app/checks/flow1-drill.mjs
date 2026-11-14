// Overview → this month's expense bar → Transactions filtered to exactly
// those expenses; the summary's Out equals the bar's value to the cent.
export default async ({ drive, expect }) => {
  await drive.settleData();
  await drive.settleMotion();
  const plot = "app.shell.main.pages.overview.col.chart.plot";
  const g = await drive.page.evaluate((p) => {
    const c = window.__declare.find(p);
    const ov = window.__declare.find("app.shell.main.pages.overview");
    const i = c.n - 1;
    const bw = Math.min(28, c.slot * 0.7 / 2);
    return { x: c.xOf(i) + bw / 2, y: c.yOf(0) - 3, value: ov.months[i].expenses.amount, count: ov.months[i].expenses.count };
  }, plot);
  await drive.clickAt(plot, g.x, g.y);
  await drive.settleData();
  await expect.attr("app", "page", "transactions");
  await expect.attr("app", "fKinds", ["expense"]);
  const s = await drive.page.evaluate(() => window.__declare.find("app").summary);
  await expect.equal(s.out, g.value);
  await expect.equal(s.count, g.count);
  // and Back returns to the chart
  await drive.click("app.shell.main.bar.titleRow.back");
  await expect.attr("app", "page", "overview");
  await expect.attr("app", "fKinds", []);
};
