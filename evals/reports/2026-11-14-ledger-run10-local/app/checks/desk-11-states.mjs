// Brief §4 and §9: "Save & new" keeps the person in flow; nothing matching names the
// filters and offers the change that brings results back; a slow service says it
// is still working; a failed load says so in place with Retry, and the rest of the
// screen still works; a change of filters keeps the old results until the new arrive.

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  await drive.click("app.side.Transactions");
  await drive.settleData();

  // Save & new: the next one starts with the same date; the amount is empty and focused
  await drive.key("n");
  await drive.settleMotion();
  const sheet = page.getByRole("dialog", { name: "Record a transaction" });
  await drive.type("4.20");
  await sheet.getByRole("textbox", { name: "Date" }).fill("yesterday");
  await sheet.getByRole("combobox", { name: "Category" }).click();
  await drive.type("Other");
  await drive.key("Enter");
  await sheet.getByRole("button", { name: "Save & new" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Amount" })).toHaveValue("");
  await expect(sheet.getByRole("textbox", { name: "Amount" })).toBeFocused();
  await expect(sheet.getByRole("textbox", { name: "Date" })).toHaveValue("13 Nov 2026");
  expect(await read("app.toast", "message")).toBe("Saved expense · $4.20");   // the toast sits over the open sheet
  expect(await read("app.toast", "shown")).toBe(true);
  // a mistake is said where it was made, and the first one is focused
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await drive.settleMotion();
  await expect(sheet).toContainText("Enter the amount.");
  await expect(sheet.getByRole("textbox", { name: "Amount" })).toBeFocused();
  await drive.key("Escape");
  await drive.settleMotion();
  await expect(sheet).toBeHidden();

  // nothing matches: the empty view names the filters and offers the way back
  await drive.click("app.main.bar.search");
  await drive.type("adobe 999");
  await drive.wait(400);
  await drive.settleData();
  await expect.text("app.main.page.transactions.body.list.empty", "No transactions match these filters");
  await expect.text("app.main.page.transactions.body.list.empty", "“adobe 999”");
  await expect.text("app.main.page.transactions.body.list.empty", "Remove “adobe 999” to see");
  await page.getByRole("button", { name: /^Remove “adobe 999” to see/ }).click();
  await drive.settleData();
  expect((await read("app", "f")).q).toBe("");
  expect(await read("app", "total")).toBeGreaterThan(0);

  // a slow answer: the old rows stay (dimmed), and it says it is still working
  const before = await read("app", "total");
  const held = await drive.hold({ method: "GET", path: "/api/transactions" });
  await page.evaluate(() => window.__declare.find("app").setRange("last-month"));
  await drive.wait(2000);
  expect(await read("app", "total")).toBe(before);
  expect(await read("app.main.page.transactions.body.list", "opacity")).toBeLessThan(1);
  await expect.visible("app.main.bar.busy");
  await expect.text("app.main.bar.busy", "Still working");
  await held.release();
  await drive.settleData();
  await drive.settleMotion();
  expect(await read("app", "rangeText")).toBe("Oct 2026");
  expect(await read("app.main.page.transactions.body.list", "opacity")).toBe(1);

  // a failed load: said in place, with Retry; the rest still works
  await page.evaluate(() => { window.__declare.find("app").api = "http://127.0.0.1:1"; });
  await drive.settleData();
  await expect.visible("app.main.page.transactions.failed");
  await expect.text("app.main.page.transactions.failed", "Couldn’t load transactions.");
  await drive.click("app.side.Overview");
  await drive.settleData();
  await expect.visible("app.main.page.overview.col.failed");
  await expect.text("app.main.page.overview.col.failed", "Couldn’t load the figures.");
  await drive.click("app.main.page.overview.col.failed.1");          // Retry, while the service is still away
  await drive.settleData();
  await expect.visible("app.main.page.overview.col.failed");
  await expect.request("GET", /aggregates\/periods/, {});
  // the service is back: everything loads again
  await page.evaluate(() => { window.__declare.find("app").api = "http://127.0.0.1:8370"; });
  await drive.settleData();
  await expect.hidden("app.main.page.overview.col.failed");
  expect(await read("app", "total")).toBeGreaterThan(0);
};
