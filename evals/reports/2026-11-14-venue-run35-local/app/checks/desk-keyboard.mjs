// At a desk, with no account and the keyboard alone: pick a performance, choose
// two seats, fill in a new card and an address, pay, and get the tickets.
export default async ({ drive, expect, page }) => {
  const focusedName = () => page.evaluate(() => {
    const el = document.activeElement;
    return el ? (el.getAttribute("aria-label") || el.textContent || "").trim() : "";
  });

  // Tab to the first performance that is not nearly sold out, open it with Enter.
  await drive.tab(2);
  console.log("focused:", await focusedName());
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Nov");

  // Into the hall: one Tab stop; arrows move, Space chooses.
  await drive.tab();
  console.log("in hall:", await focusedName());
  await drive.key("Space");
  await drive.key("ArrowDown");
  await drive.key("ArrowDown");
  await drive.key("ArrowRight");
  console.log("second:", await focusedName());
  await drive.key("Space");
  await drive.settleMotion();
  const chosen = page.getByRole("button", { pressed: true, name: /, row .*, seat / });
  await expect(chosen).toHaveCount(2);
  await expect(page.getByText(/^2 seats · \$\d+\.\d\d$/)).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/k-hall.png" });

  // On to checkout by keyboard: Tab until Continue has focus.
  for (let i = 0; i < 12; i++) {
    if ((await focusedName()) == "Continue") break;
    await drive.tab();
  }
  await drive.key("Enter");
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  // Fill the form by typing, moving on with Tab as a person does.
  await page.getByLabel("Email").focus();
  await drive.type("kb@example.com");
  await drive.tab(); await drive.type("4242424242424242");
  await expect(page.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  await drive.tab(); await drive.type("Kay Board");
  await drive.tab(); await drive.type("0429");
  await expect(page.getByLabel("Expiry")).toHaveValue("04/29");
  await drive.tab(); await drive.type("123");
  await drive.tab();   // country (US)
  await drive.tab(); await drive.type("1 Main Street");
  await drive.tab();   // line 2
  await drive.tab(); await drive.type("Springfield");
  await drive.tab(); await drive.type("94103");
  await page.screenshot({ path: "/tmp/venue-shots/k-checkout.png" });

  const pay = page.getByRole("button", { name: /^Pay \$\d+\.\d\d$/ });
  const label = await pay.innerText();
  console.log("pay label:", label);
  await drive.key("Enter");             // Return in the last field pays
  await drive.key("Enter");             // and a second Return sends nothing more
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1 });
  await expect(page.getByText("Sent to kb@example.com")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your 2 tickets" })).toBeVisible();
  await page.screenshot({ path: "/tmp/venue-shots/k-tickets.png" });
};
