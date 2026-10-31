import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173");
await page.getByRole("button", { name: /Fri 13 Nov/ }).waitFor();
await page.screenshot({ path: "/tmp/venue-desktop.png" });
await page.getByRole("button", { name: /Fri 13 Nov/ }).click();
await page.locator(".seat-map .seat.available").first().click();
await page.locator(".seat-map .seat.available").first().click();
await page.getByRole("button", { name: "Continue to checkout" }).click();
await page.getByLabel("Email address").fill("guest@example.com");
await page
  .getByRole("button", { name: "Sign in", exact: true })
  .first()
  .click();
await page
  .getByRole("dialog")
  .getByLabel("Email address")
  .fill("ada@example.com");
await page.getByLabel("Password", { exact: true }).fill("wrong");
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Sign in", exact: true })
  .click();
await page.getByText("That email and password don't match.").waitFor();
await page
  .getByLabel("Password", { exact: true })
  .fill("correct horse battery");
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Sign in", exact: true })
  .click();
await page.getByText("Visa ···· 4242").waitFor();
assert.equal(
  await page.getByLabel("Email address").inputValue(),
  "guest@example.com",
);
assert.equal(await page.locator(".saved-card input:disabled").count(), 1);
await page.getByLabel("Security code").fill("000");
let requests = 0;
page.on("request", (r) => {
  if (r.url().endsWith("/api/orders")) requests++;
});
await page
  .getByRole("button", { name: /^Pay \$/ })
  .first()
  .dblclick();
await page
  .getByRole("alert")
  .filter({ hasText: /declined/i })
  .waitFor();
assert.equal(requests, 1);
assert.equal(await page.getByLabel("Security code").inputValue(), "");
await page.getByLabel("Use a new card").check();
await page.getByLabel("Card number", { exact: false }).fill("4242424242424242");
assert.equal(
  await page.getByLabel("Card number").inputValue(),
  "4242 4242 4242 4242",
);
await page.getByLabel("Expiry").fill("0438");
await page.getByLabel("Security code").fill("123");
await page.getByLabel("Postal code").fill("bad");
await page.getByLabel("City").click();
await page.getByText("Enter a valid postal code for your country.").waitFor();
await page.getByLabel("Postal code").fill("WC1N 1AB");
await page
  .getByRole("button", { name: /^Pay \$/ })
  .first()
  .click();
await page.getByRole("heading", { name: "The evening is yours." }).waitFor();
await page.getByText("Sent to guest@example.com").waitFor();
assert.equal(await page.getByRole("alert").count(), 0);
assert.equal((await page.locator(".barcode svg rect").count()) > 10, true);
await page.getByRole("button", { name: "Next ticket" }).click();
await page.getByText("Ticket 2 of 2").waitFor();
await page.screenshot({ path: "/tmp/venue-ticket.png" });
await page.reload();
await page.getByRole("button", { name: /Sign out/ }).waitFor();
await page.getByRole("button", { name: /Sign out/ }).click();
await page.reload();
await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const phone = await mobile.newPage();
await phone.goto("http://127.0.0.1:5173");
await phone.getByRole("button", { name: /Fri 13 Nov/ }).click();
await phone.locator(".thumb-seats .available").first().click();
const bounds = await phone
  .locator(".thumb-seats .available")
  .first()
  .boundingBox();
assert.ok(bounds.width >= 44 && bounds.height >= 44);
assert.ok(
  await phone.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
);
await phone.screenshot({ path: "/tmp/venue-mobile.png", fullPage: true });
await phone.getByRole("button", { name: "Continue to checkout" }).click();
await phone.getByLabel("Email address").fill("phone@example.com");
await phone.screenshot({
  path: "/tmp/venue-mobile-checkout.png",
  fullPage: true,
});
assert.ok(
  await phone.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
);
assert.deepEqual(errors, []);
console.log(
  "PASS: desktop purchase, failed login, saved-card decline, single submission, input preservation, expired card, new-card validation, tickets, session reload/sign out, 390px touch targets and overflow.",
);
await browser.close();
