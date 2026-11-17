// The brief's desk journey: no account, the keyboard alone, two seats, a new
// card. Also: a field the service refuses lands on that field, and Enter
// pressed twice on Pay sends one order.
const API = "http://127.0.0.1:8350";

export default async ({ drive, expect, page }) => {
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + name + ".png" }); };
  const focused = () => page.evaluate(() => {
    const a = document.activeElement;
    return a ? (a.getAttribute("aria-label") || a.textContent || "").trim() : "";
  });
  await page.evaluate((api) => fetch(api + "/api/session", { method: "DELETE", credentials: "include" }), API);
  await page.reload();
  await drive.settleData();

  // Tab to the emptiest performance, Fri 11 Dec, and open it
  for (let i = 0; i < 30 && !(await focused()).startsWith("Fri 11 Dec"); i++) await drive.tab();
  expect(await focused()).toMatch(/^Fri 11 Dec, 7:30pm, from \$35\.00/);
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Fri 11 Dec · 7:30pm" })).toBeFocused();
  await shot("d1-hall");

  // Tab into the seats: one stop. Space chooses; the arrows move.
  await drive.tab();
  const first = await focused();
  expect(first).toMatch(/^Orchestra, row [A-Z], seat \d+$/);
  await drive.key("Space");
  await drive.key("ArrowRight");
  const second = await focused();
  expect(second).toMatch(/^Orchestra, row [A-Z], seat \d+$/);
  expect(second).not.toBe(first);
  await drive.key("Space");
  await drive.key("ArrowDown");
  expect(await focused()).toMatch(/, row [A-Z], seat \d+$/);
  await expect(page.getByText("2 seats · $160.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: first, exact: true })).toHaveAttribute("aria-pressed", "true");
  await shot("d2-chosen");

  // on to Continue
  for (let i = 0; i < 12 && (await focused()) != "Continue"; i++) await drive.tab();
  await drive.key("Enter");
  await drive.settleMotion();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeFocused();

  // every field is named by its label, and says what it is for autofill
  const auto = { "Email": "email", "Name on card": "cc-name", "Card number": "cc-number", "Expiry date": "cc-exp",
    "Security code": "cc-csc", "Street address": "address-line1", "Address line 2 (optional)": "address-line2",
    "City": "address-level2", "Postal code": "postal-code" };
  for (const [label, ac] of Object.entries(auto)) await expect(page.getByLabel(label, { exact: true })).toHaveAttribute("autocomplete", ac);

  // Pay before anything is typed: every problem shows, and focus goes to the first
  for (let i = 0; i < 40 && !(await focused()).startsWith("Pay $"); i++) await drive.tab();
  expect(await focused()).toBe("Pay $174.00");
  await drive.key("Enter");
  await expect(page.getByText("Enter the email address to send your tickets to.")).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await shot("d3-required");

  // type it all, Tab between fields
  await drive.type("grace@example.com"); await drive.tab();
  await drive.type("Grace Hopper"); await drive.tab();
  await drive.type("5555555555554444"); await drive.tab();
  await expect(page.getByLabel("Card number")).toHaveValue("5555 5555 5555 4444");
  await drive.type("0"); await drive.type("8"); await drive.type("2"); await drive.type("6"); await drive.tab();
  await expect(page.getByText("That date has passed. Check the expiry on your card.")).toBeVisible();
  await drive.type("12");     // the code
  await drive.tab();
  await expect(page.getByText("Your Mastercard has a 3-digit security code.")).toBeVisible();
  await page.getByLabel("Expiry date").fill("13 / 29");
  await page.getByLabel("Expiry date").press("Tab");
  await expect(page.getByText("There's no month 13. Use 01 to 12.")).toBeVisible();
  await page.getByLabel("Expiry date").fill("");
  await page.getByLabel("Expiry date").pressSequentially("1129");
  await page.getByLabel("Security code").fill("321");
  await page.getByLabel("Street address").focus();
  await drive.type("1 Infinite Loop"); await drive.tab(); await drive.tab();
  await drive.type("New York"); await drive.tab();
  await drive.type("10001"); await drive.tab();
  await drive.type("United St"); await drive.key("Enter");
  await drive.settleMotion();
  await expect(page.getByRole("combobox", { name: "Country" })).toHaveValue("United States");

  // the service: the bank doesn't hold that postal code — said on the field, and the focus goes there
  await page.getByRole("button", { name: "Pay $174.00" }).focus();
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await shot("d4-postal-refused");
  await expect(page.getByLabel("Postal code")).toBeFocused();
  await expect(page.getByText("The postal code doesn't match the card's billing address.")).toBeVisible();
  await page.getByLabel("Postal code").fill("94103");

  // Enter twice on Pay: one order
  await page.getByRole("button", { name: "Pay $174.00" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Processing your payment — this takes a moment.")).toBeVisible();
  await drive.settleData();
  await drive.settleMotion();
  await expect(page.getByText("Sent to grace@example.com")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your 2 tickets" })).toBeFocused();
  await expect.request("POST", "/api/orders", { count: 2 });
  await shot("d5-tickets");

  // and start again
  await page.getByRole("button", { name: "Start again" }).click();
  await drive.settleData();
  await expect(page.getByRole("heading", { name: "The Marriage of Figaro" })).toBeFocused();
};
