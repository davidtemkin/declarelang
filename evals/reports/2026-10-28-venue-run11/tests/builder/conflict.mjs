import { chromium } from "playwright";
import { URL, freeSeats, seat } from "./lib.mjs";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await page.route("**/api/events**", (r) => r.abort());
try {
  await page.goto(URL + "#p03"); await page.waitForTimeout(2500);
  const names = await freeSeats(page, 2, 11, "Dress Circle");
  for (const n of names) await seat(page, n).tap();
  await page.getByRole("button", { name: "Continue" }).tap();
  const [row, num] = names[0].replace("Dress Circle, row ", "").split(", seat ");
  await fetch("http://127.0.0.1:8350/api/orders", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ performanceId: "p03", seatIds: [`DC-${row}-${num}`], email: "x@y.co", payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2030, cvc: "123", name: "X" }, billing: { line1: "1", city: "c", postalCode: "94103", country: "US" } } }) });
  const tb = (n) => page.getByRole("textbox", { name: n, exact: true });
  await tb("Email").fill("c@example.com"); await tb("Name on card").fill("C D");
  await tb("Card number").fill("4242424242424242"); await tb("Expiry (MM / YY)").fill("0430"); await tb("Security code").fill("123");
  await tb("Street address").fill("1 Main"); await tb("City").fill("NYC"); await tb("Postal code").fill("10002");
  await page.getByRole("button", { name: /^Pay/ }).tap();
  await page.waitForTimeout(2500);
  console.log("on hall:", await page.getByText(/^1 seat · /).count(), await page.getByText(/just taken/).allTextContents());
  console.log(names[0], await seat(page, names[0]).getAttribute("aria-disabled"), names[1], await seat(page, names[1]).getAttribute("aria-pressed"));
  await page.screenshot({ path: "/tmp/vshots/conflict.png" });
  await page.getByRole("button", { name: "Continue" }).tap();
  await page.waitForTimeout(500);
  console.log("fields intact:", await tb("Card number").inputValue(), await tb("Postal code").inputValue());
  await tb("Postal code").fill("10001");
  await page.getByRole("button", { name: /^Pay/ }).tap();
  await page.waitForTimeout(2500);
  console.log("postal 422 focus:", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), await page.getByText(/postal|ZIP/i).allTextContents());
  await page.screenshot({ path: "/tmp/vshots/postal422.png" });
} finally { await browser.close(); }
