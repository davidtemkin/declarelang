// Desk, keyboard alone, no account: two seats, a new card, pay.
export default async ({ drive, expect, page }) => {
  await drive.settleData();
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.slice(0, 60) || document.activeElement?.tagName);
  await drive.tab(2);              // past Sign in to the first performance
  console.log("1:", await focused());
  await drive.key("Enter");
  await drive.settleData(); await drive.settleMotion();
  console.log("2:", await focused());
  await drive.tab();
  console.log("3:", await focused());
  // walk to two free seats
  let got = 0;
  for (let i = 0; i < 80 && got < 2; i++) {
    const name = await focused();
    const pressed = await page.evaluate(() => document.activeElement?.getAttribute("aria-pressed"));
    const dis = await page.evaluate(() => document.activeElement?.getAttribute("aria-disabled"));
    if (pressed === "false" && dis !== "true" && i > 3) { await drive.key("Space"); got++; console.log("chose", name); }
    await drive.key("ArrowRight");
  }
  await expect(page.getByText(/^2 seats · \$/)).toBeVisible();
  await drive.tab();
  console.log("4:", await focused());
  await drive.key("Enter");
  await drive.settleMotion();
  console.log("5:", await focused());
  await drive.tab(); console.log("6:", await focused());
  await drive.type("kb@example.com"); await drive.key("Enter");
  console.log("7:", await focused());
  await drive.type("Kay Bee"); await drive.key("Enter");
  await drive.type("5555555555554444"); await drive.key("Enter");
  await drive.type("0130"); await drive.key("Enter");
  await drive.type("321"); await drive.key("Enter");
  await drive.type("1 Main St"); await drive.key("Enter");
  await drive.key("Enter");
  await drive.type("Toronto"); await drive.key("Enter");
  console.log("8:", await focused());
  await drive.type("Canada"); await drive.key("Enter"); await drive.key("Enter");
  console.log("9:", await focused());
  await drive.type("m5v2t6");
  await drive.key("Enter");      // the last field: Return pays
  await drive.settleData(); await drive.settleMotion();
  console.log("10:", await focused());
  await drive.waitReal(800);
  await page.screenshot({ path: "/tmp/vshots/k-postal.png" });
  console.log("postal:", await page.evaluate(() => window.__declare.find("app.checkout.pane.col.form").problems.map(p => p.message)));
  await expect(page.getByText(/postal code/i).first()).toBeVisible();
  await page.getByLabel("Postal code").fill("M5H 2N2");
  await page.getByLabel("Postal code").focus();
  await drive.key("Enter");
  await drive.settleData(); await drive.settleMotion();
  console.log("11:", await focused());
  await expect(page.getByText("Sent to kb@example.com", { exact: true })).toBeVisible();
};
