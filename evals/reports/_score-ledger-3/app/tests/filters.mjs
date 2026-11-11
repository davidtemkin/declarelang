// Brief §12.4: this year, search "adobe", amount $20–$100 by the keyboard alone. The chips
// read as set; the summary matches the rows; Insights → Breakdown shows the same total;
// Overview says it is filtered.
export default async ({ drive, expect, page }) => {
  await drive.set("app.books", "api", "http://127.0.0.1:8371");
  await drive.waitReal(1500);
  await drive.click("app.bar.top.range.pick");
  await drive.settleMotion();
  await drive.click('app.rangePop.picker.presets."This year"');
  await drive.settleMotion();
  await expect.attr("app", "rangeName", "2026");
  await drive.click("app.bar.top.search");
  await drive.type("adobe");
  await drive.waitReal(400);
  await drive.click("app.bar.top.buttons.amt");
  await drive.settleMotion();
  // the minimum handle: Page Up steps a bucket — $5, $10, $20
  await page.evaluate(() => window.__declare.find("app.amountPop.panel.slider.minHandle").focus?.());
  await drive.click("app.amountPop.panel.slider.minHandle");
  for (let i = 0; i < 3; i++) await drive.key("PageUp");
  await expect.attr("app.amountPop.panel.slider.minHandle", "accessibilityValueText", "$20");
  await drive.tab();
  for (let i = 0; i < 11; i++) await drive.key("PageDown");
  await expect.attr("app.amountPop.panel.slider.maxHandle", "accessibilityValueText", "$100");
  await drive.key("Escape");
  await drive.waitReal(1200);
  await expect.text("app.bar.chips", "“adobe”");
  await expect.text("app.bar.chips", "Amount $20 – $100");
  await drive.set("app", "location", "transactions");
  await drive.waitReal(1200);
  const t = await page.evaluate(() => {
    const a = window.__declare.find("app");
    return { count: a.shownSummary.count, out: a.shownSummary.out, rows: a.rows.length,
      sum: a.rows.reduce((n, r) => n + r.inFilter, 0), net: a.shownSummary.net,
      ok: a.rows.every((r) => r.amount >= 2000 && r.amount <= 10000 && r.date >= "2026-01-01") };
  });
  await expect.equal(t.count, t.rows);
  await expect.equal(t.sum, t.net);
  await expect.equal(t.ok, true);
  await expect.text("app.main.transactions.desk.table.summary.line", t.count + " transactions");
  await drive.set("app", "location", "insights");
  await drive.set("app", "insightTab", "breakdown");
  await drive.waitReal(1500);
  const b = await page.evaluate(() => window.__declare.find("app.main.insights.breakdown").total);
  await expect.equal(b, t.out);
  await drive.set("app", "location", "overview");
  await drive.waitReal(800);
  await expect.visible("app.main.overview.0");
  await expect.text("app.main.overview.0", "Filtered");
};
