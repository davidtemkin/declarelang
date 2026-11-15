// Brief §5: the date range as two dates of the person's own, the arrows stepping a
// range of the same length, the comparison period chosen beside it, and the
// appearance switched to dark and back.

export default async ({ drive, expect, page }) => {
  const read = (p, a) => page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  await drive.click("app.main.bar.dates.range");
  await drive.settleMotion();
  await page.getByRole("menuitemradio", { name: "Custom range…" }).click();
  await drive.settleMotion();
  const pop = page.getByRole("dialog", { name: "Custom range" });
  await expect(pop).toBeVisible();
  await expect(pop.getByRole("button", { name: "Apply" })).toBeEnabled();
  await pop.getByRole("button", { name: "Apply" }).click();
  await drive.settleData();
  await drive.settleMotion();
  expect(await read("app", "preset")).toBe("custom");
  const f = await read("app", "f");
  expect(f.from).toBe("2026-11-01");

  // a two-week range steps by two weeks
  await page.evaluate(() => window.__declare.find("app").setDates("2026-10-01", "2026-10-14"));
  await drive.settleData();
  await drive.key("[");
  await drive.settleData();
  const g = await read("app", "f");
  expect([g.from, g.to]).toEqual(["2026-09-17", "2026-09-30"]);
  await drive.click("app.main.bar.dates.next");
  await drive.settleData();
  expect((await read("app", "f")).from).toBe("2026-10-01");

  // the comparison: the same period last year
  await drive.click("app.main.bar.dates.cmp");
  await drive.settleMotion();
  await page.getByRole("menuitemradio", { name: "Same period last year" }).click();
  await drive.settleData();
  expect(await read("app", "cmpRange")).toEqual(["2025-10-01", "2025-10-14"]);

  // dark, and back
  await page.getByRole("radio", { name: "Dark" }).click();
  await drive.settleMotion();
  expect(await read("app", "dark")).toBe(true);
  await drive.click("app.side.Overview");
  await drive.settleData();
  await drive.settleMotion();
  await page.getByRole("radio", { name: "Light" }).click();
  expect(await read("app", "dark")).toBe(false);
};
