// Brief §3: the whole history, smooth at that size. Scrolling stays smooth through
// thousands of rows, and jumping to the end is immediate. Moving through rows with
// the keyboard moves the detail with them. Columns sort and hide.

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  const grid = "app.main.page.transactions.body.list.grid";
  await drive.click("app.side.Transactions");
  await drive.settleData();
  await page.evaluate(() => window.__declare.find("app").setRange("all"));
  await drive.settleData();
  await drive.settleMotion();
  const total = await read("app", "total");
  expect(total).toBeGreaterThan(4000);
  expect((await read("app", "rows")).length).toBe(total);
  // only a screenful of rows is built
  const built = await page.evaluate((p) => window.__declare.find(p).childViews.length, grid);
  expect(built).toBeLessThan(80);

  // scrolling through as a hand does, a wheel notch at a time: every frame reaches the
  // screen within about two refreshes (the time from a frame's start to its picture)
  const prof = await drive.profile(async () => {
    for (let i = 0; i < 40; i++) await drive.wheel(grid, 120);
  });
  expect(prof.frames.p95).toBeLessThan(34);
  expect(prof.frames.worst).toBeLessThan(60);

  // jumping to the end: one key, and the last row (the oldest) is there and selected
  await drive.click(grid);
  await drive.settleMotion();
  const t0 = Date.now();
  await drive.key("End");
  await drive.settleMotion();
  const took = Date.now() - t0;
  const rows = await read("app", "rows");
  const last = rows[rows.length - 1];
  expect(await read("app", "openId")).toBe(last.id);
  await expect.text(grid, shortDay(last.date));
  expect(took).toBeLessThan(1500);

  // the keyboard moves the detail with it
  await drive.key("ArrowUp");
  await drive.settleData();
  expect(await read("app", "openId")).toBe(rows[rows.length - 2].id);
  await expect.text("app.main.page.transactions.body.pane", rows[rows.length - 2].kind == "sale" ? "SALE" : rows[rows.length - 2].kind == "refund" ? "REFUND" : "EXPENSE");
  await drive.key("Home");
  await drive.settleData();
  expect(await read("app", "openId")).toBe(rows[0].id);

  // shift-click selects a range, and the summary line describes the selection
  const first = page.getByRole("row").nth(2);
  await first.click();
  await page.getByRole("row").nth(5).click({ modifiers: ["Shift"] });
  await drive.settleMotion();
  expect((await read("app", "selection")).length).toBe(4);
  expect(await read("app.main.page.transactions.top.summary", "text")).toMatch(/^4 transactions · In \$/);
  await drive.key("Escape");

  // sort by amount, from the header
  await drive.click(grid + "._hdr.4");
  await drive.settleData();
  await drive.settleMotion();
  expect(await read("app", "sortOn")).toBe("amount");
  const sorted = await read("app", "rows");
  const dir = await read("app", "sortDir");
  for (let i = 1; i < sorted.length; i++) expect(dir == "asc" ? sorted[i - 1].signed <= sorted[i].signed : sorted[i - 1].signed >= sorted[i].signed).toBe(true);
  await expect.request("GET", /sort=amount/);

  // hide a column, and bring it back
  await drive.click("app.main.page.transactions.top.tools.0");
  await drive.settleMotion();
  await page.getByRole("menuitemcheckbox", { name: "Channel" }).click();
  await drive.settleMotion();
  expect(await read("app", "hiddenCols")).toEqual(["channel"]);
  await expect(page.getByRole("columnheader", { name: "Channel" })).toHaveCount(0);
  await drive.click("app.main.page.transactions.top.tools.0");
  await drive.settleMotion();
  await page.getByRole("menuitemcheckbox", { name: "Channel" }).click();
  await drive.settleMotion();
  expect(await read("app", "hiddenCols")).toEqual([]);
};

function shortDay(s) {
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m, d] = s.split("-").map(Number);
  return d + " " + M[m - 1] + " " + y;
}
