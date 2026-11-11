// §12.6: this month's expenses as a CSV: one row per transaction, ISO dates, plain
// amounts, and its total matches the summary line.
export default async ({ drive, expect, page }) => {
  await drive.set("app.books", "api", "http://127.0.0.1:8371");
  await drive.set("app", "location", "transactions");
  await drive.waitReal(1200);
  await page.evaluate(() => window.__declare.find("app").toggleIn("kinds", "expense"));
  await drive.waitReal(1200);
  const r = await page.evaluate(() => {
    const a = window.__declare.find("app");
    return { out: a.shownSummary.out, count: a.shownSummary.count, csv: a.csvText() };
  });
  const lines = r.csv.trim().split("\n");
  await expect.equal(lines[0], "id,date,kind,description,contact,category,channel,amount");
  await expect.equal(lines.length - 1, r.count);
  const sum = lines.slice(1).reduce((n, l) => n + Math.round(parseFloat(l.split(",").pop()) * 100), 0);
  await expect.equal(-sum, r.out);
  await expect.equal(/^t\d+,2026-11-\d\d,expense,/.test(lines[1]), true);
  await drive.click("app.main.transactions.desk.table.summary.export");
  await drive.wait(100);
  await expect.text("app.toast", "Exported " + r.count + " transactions");
};
