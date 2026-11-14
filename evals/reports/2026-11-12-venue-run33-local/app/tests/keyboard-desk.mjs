// Desk, no account, keyboard alone: a performance, two seats, a new card, tickets.
const focusedName = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.getAttribute("aria-label") || a.getAttribute("name") || a.textContent || "").trim() : "";
});
export default async ({ drive, expect, page }) => {
  await drive.tab(2);
  expect(await focusedName(page)).toMatch(/^Fri 13 Nov/);
  await drive.key("ArrowDown").catch(() => {});
  await drive.tab(2);                                    // on to Sun 15 Nov
  expect(await focusedName(page)).toMatch(/^Sun 15 Nov/);
  await drive.key("Enter");
  await drive.settleData(); await drive.settleMotion();
  await drive.tab(1);                                    // into the hall: one stop
  const first = await focusedName(page);
  expect(first).toMatch(/, row [A-Z], seat \d+$/);
  await drive.key("Space");
  await drive.key("ArrowDown");                          // the row behind
  const second = await focusedName(page);
  expect(second).not.toBe(first);
  await drive.key("Space");
  await drive.settleMotion();
  await expect(page.getByText(/^2 seats · \$/)).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/kb-hall.png" });
  await drive.tab(1);
  expect(await focusedName(page)).toBe("Continue");
  await drive.key("Enter");
  await drive.settleMotion();

  await drive.tab(2);                                    // past "Sign in" to Email
  await drive.type("grace@example.com"); await drive.tab();
  await drive.type("Grace Hopper"); await drive.tab();
  await drive.type("4242424242424242"); await drive.tab();
  await drive.type("1130"); await drive.tab();
  await drive.type("123"); await drive.tab();
  await drive.type("1 Navy Yard"); await drive.tab(2);
  await drive.type("Toronto"); await drive.tab();
  await drive.type("Canada"); await drive.tab();
  await drive.type("m5v2t7");
  await drive.key("Enter");                              // Return in the last field pays
  await drive.settleData(); await drive.settleMotion();
  await expect(page.getByText("Sent to grace@example.com")).toBeVisible();
  await expect.request("POST", "/api/orders", { count: 1, body: { email: "grace@example.com" } });
  await page.screenshot({ path: "/tmp/venue-shots/kb-tickets.png" });
};
