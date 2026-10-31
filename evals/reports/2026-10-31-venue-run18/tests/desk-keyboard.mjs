// A guest at a desk with the keyboard alone: a performance, two seats, to checkout.
// npx declare-verify my-apps/venue/venue.declare --assert my-apps/venue/checks/desk-keyboard.mjs

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  // the masthead first: the title, then Sign in; then the performances
  await drive.tab(3);
  await expect(page.getByRole("button", { name: /^Fri 13 Nov/ })).toBeFocused();
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  // the screen's heading has the focus, so a screen reader says where we are
  await expect(page.getByRole("heading", { name: /Fri 13 Nov/ })).toBeFocused();

  // Tab on to the plan: one stop for the whole hall, then the arrows walk it
  for (let i = 0; i < 6; i++) {
    const inHall = await page.evaluate(() => (document.activeElement?.getAttribute("aria-label") ?? "").includes(", row "));
    if (inHall) break;
    await drive.tab();
  }
  const first = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (!first || !first.includes(", row ")) throw new Error("Tab never reached the seats; focus is on " + first);
  await drive.key("Space");
  await drive.key("ArrowLeft");
  const second = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await drive.key("Enter");
  await expect(page.getByRole("button", { name: first, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: second, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^2 seats · \$/)).toBeVisible();
  // Tab leaves the plan in one step, and on to the way forward
  await drive.tab();
  await expect(page.getByRole("button", { name: "Continue to payment" })).toBeFocused();
  await drive.key("Enter");
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeFocused();
};
