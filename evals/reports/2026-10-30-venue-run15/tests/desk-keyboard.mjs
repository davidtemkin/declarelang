// A desk, the keyboard alone: a performance, two seats with the arrows and
// Space, checkout by Tab and typing. The bank's refusals arrive at their
// field, focus goes there, and Enter pressed twice sends one payment.

const focusedName = (page) => page.evaluate(() => {
  const e = document.activeElement;
  if (!e) return "";
  const id = e.getAttribute("aria-labelledby");
  return e.getAttribute("aria-label") || (id && document.getElementById(id)?.textContent) || e.textContent || "";
});

const tabTo = async (drive, page, test, max = 40) => {
  for (let i = 0; i < max; i++) {
    await drive.tab();
    const n = (await focusedName(page)).trim();
    if (test(n)) return n;
  }
  throw new Error("Tab never reached it; last: " + (await focusedName(page)));
};

export default async ({ drive, expect, page }) => {
  await drive.settleData();

  await tabTo(drive, page, (n) => n.startsWith("Sat 21 Nov"));
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();

  // into the hall: the arrows walk the seats, Space chooses
  await tabTo(drive, page, (n) => /^Orchestra, row/.test(n));
  await drive.key("Space");
  await drive.key("ArrowDown");
  await drive.key("ArrowDown");
  await drive.key("Space");
  await expect.text("app", "2 seats · $");

  await tabTo(drive, page, (n) => n == "Continue to checkout");
  await drive.key("Enter");
  await drive.settleMotion();

  // the fields, by Tab and typing; the card the service answers on the code
  const fill = async (label, text) => { await tabTo(drive, page, (n) => n.startsWith(label)); await drive.type(text); };
  await fill("Email", "kb@example.com");
  await fill("Name on card", "Kay Board");
  await fill("Card number", "4000000000000127");
  await fill("Expiry", "1129");
  await fill("Security code", "456");
  await fill("Street address", "5 Key Street");
  await fill("City", "New York");
  await fill("Country", "United States");
  await fill("ZIP code", "10001");

  // Enter, twice, at once
  await drive.key("Enter");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1 });
  const where = (await focusedName(page)).trim();
  if (!where.startsWith("Security code")) throw new Error("focus should be on the security code, is on: " + where);
  await expect.text("app", "Security code");

  // a good card now: the postcode is refused next, at its field
  await page.getByLabel("Card number").fill("4242424242424242");
  await page.getByLabel("Security code").fill("456");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  const z = (await focusedName(page)).trim();
  if (!z.startsWith("ZIP code")) throw new Error("focus should be on the ZIP code, is on: " + z);
  await page.screenshot({ path: (process.env.SHOTS || "/tmp/shots") + "/d-zip-refused.png" });
  await page.getByLabel("ZIP code").fill("10002");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.text("app", "Sent to kb@example.com");
  await expect.request("POST", "/api/orders", { count: 3 });
};
