// Brief §12, desk 1: Overview shows this month's four figures with their changes
// against last month, and the income vs expenses chart. Choosing this month's
// expense bar opens Transactions filtered to exactly those expenses; the summary
// total equals the bar's value to the cent.
//
//   npx declare-verify my-apps/ledger/ledger.declare --url http://127.0.0.1:8603/my-apps/ledger/ledger.declare --assert my-apps/ledger/tests/desk-1-overview.mjs

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  const fig = "app.main.page.overview.col.figures";
  for (const [k, name] of [["revenue", "Revenue"], ["expenses", "Expenses"], ["net", "Net profit"], ["margin", "Gross margin"]]) {
    await expect.text(`${fig}.${k}`, name);
    await expect.text(`${fig}.${k}`, "vs Oct");
  }
  expect(await read("app", "rangeText")).toBe("Nov 2026");

  // the chart's last month is this month; its expense bar, pressed with the mouse
  const chart = "app.main.page.overview.col.flow.chart";
  const geo = await page.evaluate((p) => {
    const c = window.__declare.find(p);
    const i = c.count - 1;
    const bars = c.series.filter((s) => s.style == "bar").length;
    const bw = Math.max(2, (c.slot * 0.7) / bars);
    const pt = c.series[1].points[i];
    return { x: c.padL + c.slot * i + c.slot * 0.15 + bw * 1 + bw / 2, y: c.yOf(pt.value / 2), value: pt.value, from: pt.from, to: pt.to, name: c.series[1].name };
  }, chart);
  expect(geo.name).toBe("Expenses");
  expect(geo.from).toBe("2026-11-01");
  await drive.hover(chart);
  await drive.clickAt(chart, geo.x, geo.y);
  await drive.settleData();
  await drive.settleMotion();

  expect(await read("app", "screen")).toBe("transactions");
  const f = await read("app", "f");
  expect(f.kinds).toEqual(["expense"]);
  expect(f.from).toBe("2026-11-01");
  const s = await read("app", "summary");
  expect(s.out).toBe(geo.value);                       // to the cent
  expect(s.in).toBe(0);
  const rows = await read("app", "rows");
  expect(rows.every((r) => r.kind == "expense")).toBe(true);
  expect(rows.reduce((t, r) => t - r.signed, 0)).toBe(geo.value);
  await expect.text("app.main.page.transactions.top.summary", "transactions · In $0.00 · Out " );
  await expect.text("app.main.chipRow", "Expenses");

  // the way back returns to the Overview, as it was
  await drive.click("app.main.chipRow.backBtn");
  await drive.settleData();
  expect(await read("app", "screen")).toBe("overview");
  expect((await read("app", "f")).kinds).toEqual([]);

};
