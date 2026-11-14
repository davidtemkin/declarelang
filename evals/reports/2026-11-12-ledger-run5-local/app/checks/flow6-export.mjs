// Export this month's expenses as CSV; its total matches the summary line.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.set("app", "location", "transactions");
  await drive.settleData();
  await page.getByRole("button", { name: "Kind" }).click();
  await drive.settleMotion();
  await page.getByText("Expenses", { exact: true }).last().click();
  await drive.key("Escape");
  await drive.settleData();
  await expect.attr("app", "fKinds", ["expense"]);
  const file = await drive.download(() => page.getByRole("button", { name: "Export CSV" }).click());
  const lines = file.text.trim().split("\n");
  await expect.equal(lines[0], "id,date,kind,description,contact,category,channel,amount");
  const cents = lines.slice(1).map((l) => { const a = l.split(","); return Math.round(Number(a[a.length - 1]) * 100) });
  const s = await drive.page.evaluate(() => window.__declare.find("app").summary);
  await expect.equal(cents.length, s.count);
  await expect.equal(-cents.reduce((n, c) => n + c, 0), s.out);
  await expect.equal(/^\d{4}-\d{2}-\d{2}$/.test(lines[1].split(",")[1]), true);
  await expect.text("app.shell.main.pages.transactions.sumRow", "Out " + ("$" + (s.out / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })));
};
