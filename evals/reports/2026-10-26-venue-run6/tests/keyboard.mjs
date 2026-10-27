// At a desk with no account, two seats booked with the keyboard alone.
// Run: npx declare-verify my-apps/venue/venue.declare --assert ../checks/keyboard.mjs

const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.getAttribute("aria-label") || a.textContent || "").trim() : "";
});

async function tabUntil(drive, page, test, max = 40, key = "Tab") {
  for (let i = 0; i < max; i++) {
    await drive.key(key);
    const name = await active(page);
    if (test(name)) return name;
  }
  throw new Error("never reached: last focus " + (await active(page)));
}

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await tabUntil(drive, page, (n) => n.startsWith("Wed 18 Nov"));
  await drive.key("Enter");
  await drive.settleData();
  await expect.attr("app", "stage", "hall");
  if (!/Wed 18 Nov/.test(await active(page))) throw new Error("focus not on the performance heading: " + (await active(page)));

  const first = await tabUntil(drive, page, (n) => n.startsWith("Orchestra, row"));
  await drive.key("Space");
  await drive.key("ArrowDown");                    // the row behind
  const second = await active(page);
  await drive.key("Space");
  const chosen = await page.evaluate(() => document.querySelectorAll('[role="checkbox"][aria-checked="true"]').length);
  if (chosen !== 2) throw new Error(`expected 2 chosen seats after ${first} / ${second}, got ${chosen}`);

  await tabUntil(drive, page, (n) => n == "Continue to payment", 10, "Shift+Tab");
  await drive.key("Enter");
  await expect.attr("app", "stage", "pay");
  if (await active(page) !== "Checkout") throw new Error("focus not on Checkout: " + (await active(page)));

  await tabUntil(drive, page, (n) => n == "Email");
  await drive.type("kay@example.com");
  for (const [field, text] of [["Name on card", "Kay Nunn"], ["Card number", "5555555555554444"],
      ["Expiry date", "0931"], ["Security code", "321"], ["Street address", "1 Front St W"],
      ["Address line 2 (optional)", ""], ["City", "Toronto"], ["Postal code", "M5J 2N8"]]) {
    await drive.key("Tab");
    const at = await active(page);
    if (at !== field) throw new Error(`expected ${field}, focus on ${at}`);
    if (text) await drive.type(text);
  }
  await drive.key("Tab");
  await drive.type("Can");
  await drive.key("Enter");
  await expect.attr("app.form", "country", "CA");
  await drive.key("Shift+Tab");                  // back to a field, and Enter pays
  await drive.key("Enter");
  await drive.key("Enter");                      // Enter twice: still one payment
  await drive.settleData();
  await expect.request("POST", "/api/orders", { count: 1, body: { email: "kay@example.com",
    payment: { card: { number: "5555555555554444", expMonth: 9, expYear: 2031 }, billing: { country: "CA", postalCode: "M5J 2N8" } } } });
  await expect.attr("app", "stage", "tickets");
  if (await active(page) !== "You're going.") throw new Error("focus not on the tickets: " + (await active(page)));
};
