// A chart is one stop for the keyboard: the arrows move between periods and
// series and say each point in a sentence; Enter opens its records.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.settleMotion();
  await page.getByRole("img", { name: /^Income vs expenses, month by month/ }).focus();
  await drive.key("ArrowLeft");
  await drive.key("ArrowDown");
  const sentence = await drive.page.evaluate(() => {
    const c = window.__declare.find("app.shell.main.pages.overview.col.chart.plot");
    return c.sentence(c.keyP, c.keyS);
  });
  await expect.equal(/^October 2026, Expenses, \$[\d,]+\.\d\d, (up|down) [\d.]+% from September 2026, \d+ transactions$/.test(sentence), true);
  await drive.key("Enter");
  await drive.settleData();
  await expect.attr("app", "page", "transactions");
  await expect.attr("app", "fKinds", ["expense"]);
  await expect.attr("app", "from", "2026-10-01");
  await expect.attr("app", "to", "2026-10-31");
};
