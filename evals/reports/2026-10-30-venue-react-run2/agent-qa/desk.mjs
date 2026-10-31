import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const logs = [];
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "warning" || (m.type()==="error" && !m.text().includes("Failed to load"))) logs.push(m.text()); });
const active = () => page.evaluate(() => { const a = document.activeElement; return `${a.tagName} ${a.getAttribute("aria-label") ?? a.textContent?.slice(0, 50)}`; });
const shot = (n) => page.screenshot({ path: `/tmp/venue-check/shots/desk-${n}.png` });
await page.route("**/api/events*", (r) => r.abort());
await page.goto("http://127.0.0.1:5178/");
await page.waitForTimeout(500);
// Tab to the 8th performance (p08, emptier)
let tabs = 0;
while (!(await active()).includes("25 November") && tabs < 40) { await page.keyboard.press("Tab"); tabs++; }
console.log("tabs to p08:", tabs, await active());
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
console.log("after open:", await active());
await page.keyboard.press("Tab");
console.log("in map:", await active());
const pick = async () => {
  for (let i = 0; i < 30; i++) {
    const st = await page.evaluate(() => document.activeElement.dataset.state);
    if (st === "free") { await page.keyboard.press("Space"); return active(); }
    await page.keyboard.press(i % 6 === 5 ? "ArrowDown" : "ArrowRight");
  }
};
console.log("picked", await pick());
await page.keyboard.press("ArrowRight");
console.log("picked", await pick());
console.log("summary:", await page.locator("text=/seats? · \\$/").textContent());
await shot("hall-picked");
// Tab to Continue
tabs = 0;
while (!(await active()).includes("Continue") && tabs < 20) { await page.keyboard.press("Tab"); tabs++; }
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
console.log("checkout focus:", await active());
// try paying empty
await page.getByRole("button", { name: /^Pay/ }).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
console.log("empty submit focus:", await active(), (await page.locator("[role=alert]").allTextContents()).length, "alerts");
await shot("checkout-errors");
const fillKb = async (label, text) => { await page.getByLabel(label, { exact: true }).focus(); await page.keyboard.type(text); };
await fillKb("Email address", "guest@example.com");
await fillKb("Name on card", "Grace Hopper");
await fillKb("Card number", "378282246310005");
console.log("amex grouped:", await page.getByLabel("Card number").inputValue());
await fillKb("Expiry date", "1230");
await fillKb("Security code", "1234");
await page.getByLabel("Country").selectOption("US");
await fillKb("Street address", "1 Main St");
await fillKb("City", "Springfield");
await fillKb("Postal code", "62701");
// someone else buys the first chosen seat
const ids = await page.evaluate(() => [...document.querySelectorAll("li")].length);
const seatIds = JSON.parse((await page.evaluate(() => null)) ?? "null");
const order = await page.evaluate(async () => {
  const r = await fetch("http://127.0.0.1:8351/api/performances/p08/seats");
  return r.ok;
});
const firstSeat = (await page.locator("ul li span").first().textContent());
console.log("first line:", firstSeat);
const m = firstSeat.match(/(.+), row (\w), seat (\d+)/);
const key = { Orchestra: "ORCH", "Grand Tier": "GT", "Dress Circle": "DC", Balcony: "BALC" }[m[1]];
const res = await fetch("http://127.0.0.1:8351/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ performanceId: "p08", seatIds: [`${key}-${m[2]}-${m[3]}`], email: "x@example.com", payment: { card: { number: "4242424242424242", expMonth: 4, expYear: 2028, cvc: "123", name: "X" }, billing: { line1: "1", line2: null, city: "c", postalCode: "94103", country: "US" } } }) });
console.log("rival order:", res.status);
await page.getByLabel("Postal code").press("Enter");

await page.waitForTimeout(2500);
console.log("after rival:", page.url(), await active()); console.log(await page.locator("main").innerText().catch(e=>e.message));
await shot("after-rival");
console.log(logs.join("\n"));
await browser.close();
