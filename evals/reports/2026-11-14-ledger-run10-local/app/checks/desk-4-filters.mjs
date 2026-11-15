// Brief §12, desk 4: filter to this year, search "adobe", and move the amount
// slider to $20–$100 with the keyboard alone. The chips read as set; the summary
// count and total match the rows; Insights → Breakdown shows only those, with the
// same total; Overview says it is filtered.

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  const focusedName = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "");
  await drive.click("app.side.Transactions");
  await drive.settleData();

  // the date range, from its menu, by keyboard
  await drive.key("/");                                   // search takes the focus
  await drive.key("Shift+Tab");                           // back to the comparison…
  await drive.key("Shift+Tab");                           // …the next-period arrow…
  await drive.key("Shift+Tab");                           // …the range itself
  expect(await focusedName()).toContain("Date range");
  await drive.key("Enter");
  await drive.settleMotion();
  for (let i = 0; i < 6; i++) await drive.key("ArrowDown");   // the first press lands on This month; five more to This year
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  expect(await read("app", "preset")).toBe("this-year");
  expect(await read("app", "rangeText")).toBe("2026");

  // search
  await drive.key("/");
  await drive.type("adobe");
  await drive.wait(400);
  await drive.settleData();
  expect((await read("app", "f")).q).toBe("adobe");

  // the amount slider, by keyboard: Tab to the Filters button, open it, Tab to the thumbs
  await drive.key("Tab");
  expect(await focusedName()).toContain("More filters");
  await drive.key("Enter");
  await drive.settleMotion();
  let guard = 0;
  while (!(await focusedName()).startsWith("Minimum amount") && guard++ < 12) await drive.key("Tab");
  expect(await focusedName()).toBe("Minimum amount");
  for (let i = 0; i < 4; i++) await drive.key("ArrowRight");         // $5, $10, $15, $20
  await drive.settleData();
  await drive.key("Tab");
  expect(await focusedName()).toBe("Maximum amount");
  for (let i = 0; i < 13; i++) await drive.key("ArrowLeft");         // from no maximum down to $100
  await drive.settleData();
  const thumb = page.getByRole("slider", { name: "Minimum amount" });
  await expect(thumb).toHaveAttribute("aria-valuetext", "$20");
  await expect(page.getByRole("slider", { name: "Maximum amount" })).toHaveAttribute("aria-valuetext", "$100");
  const f = await read("app", "f");
  expect(f.min).toBe(2000);
  expect(f.max).toBe(10000);
  await drive.key("Escape");
  await drive.settleMotion();
  await drive.settleData();

  // the chips read as set
  await expect.text("app.main.chipRow", "“adobe”");
  await expect.text("app.main.chipRow", "$20 – $100");
  await expect.text("app.main.chipRow", "Filtered figures");

  // the summary matches the rows, to the cent
  const rows = await read("app", "rows");
  const s = await read("app", "summary");
  expect(rows.length).toBeGreaterThan(0);
  expect(s.count).toBe(rows.length);
  expect(rows.every((r) => r.amount >= 2000 && r.amount <= 10000 && r.date.startsWith("2026"))).toBe(true);
  const out = rows.filter((r) => r.kind != "sale").reduce((t, r) => t - r.signed, 0);
  const inn = rows.filter((r) => r.kind == "sale").reduce((t, r) => t + r.signed, 0);
  expect(s.out).toBe(out);
  expect(s.in).toBe(inn);
  const line = await read("app.main.page.transactions.top.summary", "text");
  expect(line).toBe(`${rows.length} transaction${rows.length == 1 ? "" : "s"} · In $${(inn / 100).toFixed(2)} · Out $${(out / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} · Net −$${((out - inn) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);

  // Insights → Breakdown shows only those, with the same total
  await drive.click("app.side.Insights");
  await drive.settleData();
  await drive.click("app.main.page.insights.col.tabs.Breakdown");
  await drive.settleData();
  await drive.settleMotion();
  const sentence = await read("app.main.page.insights.col.breakdown.top.say", "text");
  expect(sentence).toContain("Total $" + (out / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }));
  await expect.text("app.main.page.insights.col.breakdown", "Software");
  await expect.text("app.main.chipRow", "Filtered figures");

  // Overview says it is filtered
  await drive.click("app.side.Overview");
  await drive.settleData();
  await expect.visible("app.main.chipRow.note");
  await expect.text("app.main.chipRow", "Filtered figures");
};
