// Done 4: filter to this year, search "adobe", and move the amount slider to
// $20–$100 with the keyboard alone. The chips read as set; the summary count and
// total match the rows; Insights → Breakdown shows only those, with the same
// total; Overview says it is filtered.
import { read, money, settle } from "./lib.mjs";

export default async ({ drive, expect, page }) => {
  await drive.set("app", "location", "transactions");
  await settle(drive);
  // the date range: This year
  await page.getByRole("button", { name: /^Date range/ }).click();
  await settle(drive);
  await page.getByRole("button", { name: "This year" }).click();
  await settle(drive);
  // search
  await page.getByRole("searchbox", { name: "Search transactions" }).fill("adobe");
  await drive.wait(400);
  await settle(drive);
  // the amount, by keyboard alone: Tab to the Amount button, open it, Tab to the handles
  await page.getByRole("button", { name: "Amount" }).focus();
  await drive.key("Enter");
  await settle(drive);
  const low = page.getByRole("slider", { name: /^Minimum/ });
  const high = page.getByRole("slider", { name: /^Maximum/ });
  await low.focus();
  for (let i = 0; i < 20; i++) await drive.key("ArrowRight");
  await high.focus();
  for (let i = 0; i < 50; i++) await drive.key("ArrowLeft");
  await drive.wait(400);
  await settle(drive);
  console.log("handles: " + await low.getAttribute("aria-valuetext") + " / " + await high.getAttribute("aria-valuetext"));
  await drive.key("Escape");
  await settle(drive);

  const f = await read(page, "app", "f");
  console.log("filter " + JSON.stringify(f));
  expect.equal(f.min, 2000);
  expect.equal(f.max, 10000);
  expect.equal(f.q, "adobe");
  await expect.text("app.main.bar", "$20 – $100");
  await expect.text("app.main.bar", "“adobe”");
  await expect.text("app.main.bar", "2026");

  const rows = await read(page, "app", "listRows");
  const sum = await read(page, "app", "listSum");
  const line = await read(page, "app", "summaryLine");
  console.log(line);
  expect.equal(sum.count, rows.length);
  const out = rows.reduce((n, r) => n - r.inFilter, 0);
  expect.equal(sum.out, out);
  if (!rows.every((r) => r.amount >= 2000 && r.amount <= 10000 && r.date.startsWith("2026"))) throw new Error("a row outside the filter");
  if (!line.startsWith(rows.length + " transaction")) throw new Error("summary count");
  if (!line.includes("Out " + money(out))) throw new Error("summary total");

  // Insights → Breakdown: only those, the same total
  await drive.set("app", "location", "insights/breakdown");
  await settle(drive);
  const cats = await read(page, "app.insCats", "value");
  console.log("breakdown total " + money(cats.total.amount) + " over " + cats.categories.length + " categories");
  expect.equal(cats.total.amount, out);
  await expect.text("app.main.page.col.insights.breakdown", money(cats.categories[0].amount));
  await expect.visible("app.main.page.col.filteredNote");

  // Overview says it is filtered
  await drive.set("app", "location", "overview");
  await settle(drive);
  await expect.visible("app.main.page.col.filteredNote");
  await expect.text("app.main.page.col.filteredNote", "Filtered figures");
  const cur = await read(page, "app", "cur");
  expect.equal(cur.expenses.amount, out);
};
