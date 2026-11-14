// Done 1: Overview shows this month's four figures with their changes against last
// month, and the income vs expenses chart; choosing this month's expense bar opens
// Transactions filtered to exactly those expenses, the summary equal to the bar.
import { read, money, settle } from "./lib.mjs";

export default async ({ drive, expect, page }) => {
  await expect.text("app.main.page.col.overview.figures", "Revenue");
  await expect.text("app.main.page.col.overview.figures", "Expenses");
  await expect.text("app.main.page.col.overview.figures", "Net profit");
  await expect.text("app.main.page.col.overview.figures", "Gross margin");
  await expect.text("app.main.page.col.overview.figures", "vs Oct");
  await expect.text("app.main.page.col.overview.ive", "Income vs expenses");

  const chart = "app.main.page.col.overview.ive.chart";
  const pts = await read(page, "app", "trendPts");
  const last = pts.length - 1;
  const expense = pts[last].v[1];
  // aim at this month's expense bar: the second bar in the last period's slot
  const geo = await page.evaluate((p) => { const c = window.__declare.find(p);
    return { slot: c.slot, padL: c.padL, half: c.yOf(c.lerpAt(c.points.length - 1, 1) / 2) }; }, chart);
  const bw = geo.slot * 0.7 / 2;
  const x = geo.padL + geo.slot * last + geo.slot * 0.15 + bw * 1.5;
  await drive.clickAt(chart, x, geo.half);
  await settle(drive);
  await expect.attr("app", "screen", "transactions");
  const f = await read(page, "app", "f");
  expect.equal(f.kinds.join(","), "expense");
  expect.equal(f.from, pts[last].from);
  expect.equal(f.to, pts[last].to);
  const line = await read(page, "app", "summaryLine");
  console.log("bar " + money(expense) + " → " + line);
  if (!line.includes("Out " + money(expense))) throw new Error("summary " + line + " does not show the bar's " + money(expense));
  const sum = await read(page, "app", "listSum");
  expect.equal(sum.out, expense);
  await expect.text("app.main.txScreen.drillBar", "Back to Overview");
  // and back to the chart as it was
  await drive.click("app.main.txScreen.drillBar.1");
  await settle(drive);
  await expect.attr("app", "screen", "overview");
  const f2 = await read(page, "app", "f");
  expect.equal(f2.kinds.length, 0);
};
