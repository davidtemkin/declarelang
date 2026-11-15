// Brief §6: what every chart does. One keyboard stop; the arrow keys move between
// periods and series; each point is announced in a sentence; Enter opens its
// records, and the summary there equals the number chosen; coming back returns to
// the chart as it was. Pointing shows the same facts. Dragging across a time chart
// offers the range as the date filter. Every chart can be seen as a table, whose
// cells open their records too.

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  await page.evaluate(() => window.__declare.find("app").setRange("this-year"));
  await drive.settleData();
  await drive.click("app.side.Insights");
  await drive.settleData();
  const chart = "app.main.page.insights.col.trends.chart";

  // choose a measure, then reach the chart by keyboard
  await page.getByRole("radio", { name: "Expenses" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await page.getByRole("radio", { name: "Months" }).click();
  await drive.settleData();
  await drive.settleMotion();
  let guard = 0;
  while (!(await read(chart, "focused")) && guard++ < 15) await drive.key("Tab");
  expect(await read(chart, "focused")).toBe(true);
  await drive.key("Home");
  await drive.key("ArrowRight");
  await drive.key("ArrowRight");
  await drive.settleMotion();
  // "March 2026, Expenses, $4,120.00, up 6% vs Mar 2025, 87 transactions"
  await expect.announced("Mar 2026, Expenses, $");
  const p = await read(chart, "activePoint");
  expect(p.label).toBe("Mar 2026");
  await expect.visible(chart + ".tip");
  await expect.text(chart + ".tip", "Expenses: $");

  // Enter opens exactly its records
  await drive.key("Enter");
  await drive.settleData();
  expect(await read("app", "screen")).toBe("transactions");
  expect((await read("app", "summary")).out).toBe(p.value);
  expect((await read("app", "summary")).count).toBe(p.count);

  // coming back returns to the chart as it was
  await drive.click("app.main.chipRow.backBtn");
  await drive.settleData();
  await drive.settleMotion();
  expect(await read("app", "screen")).toBe("insights");
  expect(await read("app.main.page.insights", "measure")).toBe("expenses");
  expect(await read("app", "rangeText")).toBe("2026");

  // pointing shows what a mark is
  await drive.hover(chart);
  await drive.settleMotion();
  await expect.visible(chart + ".tip");

  // dragging across a run of months offers it as the date filter
  const w = await read(chart, "width");
  await drive.press(chart, 90, 120);
  await drive.moveBy(Math.round(w * 0.25), 0);
  await drive.release();
  await drive.settleMotion();
  await expect.visible(chart + ".useRange");
  await drive.click(chart + ".useRange.0");
  await drive.settleData();
  expect(await read("app", "preset")).toBe("custom");
  const f = await read("app", "f");
  expect(f.from.startsWith("2026-01")).toBe(true);
  expect(f.to > f.from).toBe(true);

  // Breakdown as a table: a cell opens its records, and the totals agree
  await page.evaluate(() => window.__declare.find("app").setRange("this-year"));
  await drive.settleData();
  await drive.click("app.main.page.insights.col.tabs.Breakdown");
  await drive.settleData();
  await drive.click("app.main.page.insights.col.breakdown.top.tableBtn");
  await drive.settleMotion();
  const cell = page.getByRole("button", { name: /^\$/ }).first();
  const said = await cell.getAttribute("aria-label");
  await cell.click();
  await drive.settleData();
  expect(await read("app", "screen")).toBe("transactions");
  expect("$" + ((await read("app", "summary")).out / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })).toBe(said);
};
