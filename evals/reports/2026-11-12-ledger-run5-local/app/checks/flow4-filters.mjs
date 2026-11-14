// This year, search "adobe", amount $20–$100 by keyboard alone. The chips
// say so; the summary matches the rows; Breakdown shows the same total;
// Overview says it is filtered.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.set("app", "location", "transactions");
  await drive.settleData();
  await drive.click("app.shell.main.bar.filters.controls.dates.1");      // the range menu
  await page.getByText("This year", { exact: true }).click();
  await drive.settleData();
  await page.getByRole("searchbox", { name: "Search transactions" }).click();
  await drive.type("adobe");
  await drive.settleData();
  await drive.click("app.shell.main.bar.filters.controls.amountBtn");
  await drive.settleMotion();
  const lo = page.getByRole("slider", { name: /Minimum amount/ });
  await lo.focus();
  for (let i = 0; i < 4; i++) await drive.key("ArrowRight");
  const hi = page.getByRole("slider", { name: /Maximum amount/ });
  await hi.focus();
  for (let i = 0; i < 13; i++) await drive.key("ArrowLeft");
  await drive.key("Escape");
  await drive.settleData();
  await expect.attr("app", "fMin", 2000);
  await expect.attr("app", "fMax", 10000);
  await expect.text("app.shell.main.bar.filters.chipRow", "Search “adobe”");
  await expect.text("app.shell.main.bar.filters.chipRow", "$20 – $100");
  const r = await drive.page.evaluate(() => {
    const a = window.__declare.find("app");
    const out = a.rows.reduce((n, t) => n + (t.inFilter < 0 ? -t.inFilter : 0), 0);
    return { n: a.rows.length, count: a.summary.count, out: out, sOut: a.summary.out, from: a.from };
  });
  await expect.equal(r.count, r.n);
  await expect.equal(r.sOut, r.out);
  await expect.equal(r.n > 0, true);
  await drive.set("app", "location", "insights");
  await drive.set("app", "insightsTab", "breakdown");
  await drive.settleData();
  const b = await drive.page.evaluate(() => {
    const v = window.__declare.find("app.shell.main.pages.insights");
    const bd = v.col.childViews.find((c) => c.now != null && c.side != null);
    return { total: bd.now.value.total.amount, cats: bd.now.value.categories.map((c) => c.categoryId) };
  });
  await expect.equal(b.total, r.sOut);
  await expect.text("app.shell.main.pages.insights", "Filtered");
  await drive.set("app", "location", "overview");
  await drive.settleData();
  await expect.text("app.shell.main.pages.overview", "Filtered — these figures cover only");
};
