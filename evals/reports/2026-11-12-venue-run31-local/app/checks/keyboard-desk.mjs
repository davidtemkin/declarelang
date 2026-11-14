// At a desk with the keyboard alone: reach a performance, walk the hall with
// the arrows, choose two seats with Space, and get to checkout.
const focusedName = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return el ? (el.getAttribute("aria-label") || el.textContent || "").trim() : "";
});

async function tabUntil(drive, page, test, max = 40) {
  for (let i = 0; i < max; i++) {
    await drive.tab();
    const name = await focusedName(page);
    if (test(name)) return name;
  }
  throw new Error("Tab never reached it; last: " + (await focusedName(page)));
}

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await tabUntil(drive, page, (n) => n.startsWith("Wed 18 Nov"));
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();

  const first = await tabUntil(drive, page, (n) => n.startsWith("Orchestra, row"));
  await drive.key("Space");
  await drive.key("ArrowDown");
  const second = await focusedName(page);
  expect(second).not.toBe(first);
  expect(second.startsWith("Orchestra, row")).toBe(true);
  await drive.key("ArrowLeft");
  const third = await focusedName(page);
  await drive.key("Space");
  await drive.settleMotion();
  await expect(page.getByRole("checkbox", { name: first, exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: third, exact: true })).toBeChecked();
  await expect(page.getByText("2 seats · $160.00")).toBeVisible();

  await tabUntil(drive, page, (n) => n == "Continue to checkout");
  await drive.key("Enter");
  await drive.settleMotion();
  await tabUntil(drive, page, (n) => n == "Email" || n.startsWith("Email"));
  await page.screenshot({ path: "/tmp/venue-keyboard.png" });
};
