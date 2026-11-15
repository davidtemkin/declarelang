// Brief §12, desk 5: clear the filters; filter to Uncategorised; select all;
// categorise as Other; undo with ⌘Z.

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  await drive.click("app.side.Transactions");
  await drive.settleData();

  // something to clear first: a search and a later range
  await drive.click("app.main.bar.search");
  await drive.type("postage");
  await drive.wait(400);
  await drive.settleData();
  await drive.click("app.main.chipRow.clear");
  await drive.settleData();
  const f0 = await read("app", "f");
  expect(f0.q).toBe("");
  expect(await read("app", "rangeText")).toBe("Nov 2026");          // "Clear all" returns to this month and nothing else
  expect(await read("app", "narrowed")).toBe(false);

  // Uncategorised, from the filter panel
  await drive.click("app.main.bar.more");
  await drive.settleMotion();
  await page.getByRole("checkbox", { name: "Uncategorised" }).click();
  await drive.settleData();
  await drive.key("Escape");
  await drive.settleMotion();
  await drive.settleData();
  expect((await read("app", "f")).cats).toEqual(["none"]);
  await expect.text("app.main.chipRow", "Uncategorised");
  const n = await read("app", "total");
  expect(n).toBeGreaterThan(0);
  const ids = (await read("app", "rows")).map((r) => r.id);

  // select all: every match, and it says so
  await drive.click("app.main.page.transactions.body.list.grid");
  await drive.key("Mod+A");
  await drive.settleMotion();
  expect(await read("app", "allMatching")).toBe(true);
  await expect.text("app.main.page.transactions.bulk", `All ${n} matching transactions selected`);

  // categorise as Other
  await drive.click("app.main.page.transactions.bulk.cat");
  await drive.settleMotion();
  await page.getByRole("menuitem", { name: "Other", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/transactions/bulk", { body: { action: "categorise", categoryId: "other", expectedCount: n } });
  await expect(page.getByText(`Categorised ${n} transaction${n == 1 ? "" : "s"}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  expect(await read("app", "total")).toBe(0);
  await expect.text("app.main.page.transactions.body.list.empty", "No transactions match these filters");

  // ⌘Z undoes it
  await drive.key("Mod+Z");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/changes/");
  expect(await read("app", "total")).toBe(n);
  expect((await read("app", "rows")).map((r) => r.id).sort()).toEqual([...ids].sort());
  await expect(page.getByText("Undone")).toBeVisible();
};
