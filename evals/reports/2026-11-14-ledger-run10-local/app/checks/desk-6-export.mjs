// Brief §12, desk 6: export this month's expenses as a CSV; its total matches the
// summary line. One row per transaction, ISO dates, amounts as plain numbers.

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  await drive.click("app.side.Transactions");
  await drive.settleData();
  await drive.click("app.main.bar.more");
  await drive.settleMotion();
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await drive.settleData();
  await drive.key("Escape");
  await drive.settleMotion();
  expect((await read("app", "f")).kinds).toEqual(["expense"]);
  expect(await read("app", "rangeText")).toBe("Nov 2026");
  const s = await read("app", "summary");

  const file = await drive.download(() => page.getByRole("button", { name: "Export the filtered transactions as CSV" }).click());
  expect(file.name).toBe("ledger-2026-11-01-to-2026-11-30.csv");
  const lines = file.text.trim().split("\n");
  expect(lines[0]).toBe("id,date,kind,description,contact,category,channel,amount");
  const body = lines.slice(1);
  expect(body.length).toBe(s.count);
  // the last field is the amount, a plain number; split on the last comma (descriptions are quoted when they hold one)
  const amounts = body.map((l) => l.slice(l.lastIndexOf(",") + 1));
  expect(amounts.every((a) => /^-?\d+\.\d\d$/.test(a))).toBe(true);
  const cents = amounts.reduce((t, a) => t + Math.round(Number(a) * 100), 0);
  expect(cents).toBe(-s.out);
  expect(body.every((l) => /^t\d+,2026-11-\d\d,expense,/.test(l))).toBe(true);
  const said = await read("app.main.page.transactions.top.summary", "text");
  expect(said).toContain("Out $" + (s.out / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }));
};
