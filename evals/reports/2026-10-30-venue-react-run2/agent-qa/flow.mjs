import { chromium } from "playwright-core";
const mode = process.argv[2] ?? "phone";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext(mode === "phone"
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  : { viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
const orders = [];
page.on("response", async (r) => { if (r.url().includes("/api/orders")) orders.push(r.status() + " " + (await r.text()).slice(0, 200)); }); page.on("load", () => console.log("LOAD", page.url())); page.on("framenavigated", (f) => console.log("nav", f.url()));
await page.addInitScript(() => {
  for (const k of ["pushState", "replaceState"]) {
    const orig = history[k].bind(history);
    history[k] = (...a) => { console.warn(k, a[2], new Error().stack.split("\n").slice(5, 30).join(" | ")); return orig(...a); };
  }
});
const shot = (n) => page.screenshot({ path: `/tmp/venue-check/shots/${mode}-${n}.png` });

await page.goto("http://127.0.0.1:5178/");
await page.getByRole("link", { name: /13 November/ }).click();
await page.waitForTimeout(600);
await shot("hall");
// pick 3 free seats: two orchestra, one grand tier
const free = async (prefix) => page.locator(`button[data-seat^="${prefix}"][data-state="free"]`).first().getAttribute("aria-label");
const picks = [];
for (const prefix of ["ORCH-", "ORCH-", "GT-"]) {
  const name = await free(prefix);
  picks.push(name);
  const btn = page.getByRole("button", { name, exact: true });
  if (mode === "phone") await btn.tap(); else await btn.click();
}
console.log("picked", picks);
console.log("summary:", await page.locator("text=/\\d+ seats? · \\$/").textContent());
await shot("hall-picked");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(400);
await shot("checkout");
// sign in mid-checkout after typing something
await page.getByLabel("Email address").fill("someone@example.com");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByLabel("Email", { exact: true }).fill("ada@example.com");
await page.getByLabel("Password").fill("wrong");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForTimeout(400);
console.log("bad pw:", await page.getByRole("alert").first().textContent());
await page.getByLabel("Password").fill("correct horse battery");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForTimeout(800);
console.log("focused:", await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 100)));
await shot("checkout-signed-in");
const radios = await page.getByRole("radio").evaluateAll((els) => els.map((e) => `${e.closest("label").textContent} checked=${e.checked} disabled=${e.disabled}`));
console.log(radios);
const pay = page.getByRole("button", { name: /^Pay \$/ });
console.log("pay label:", await pay.textContent());
await page.getByLabel("Security code").fill("000");
await pay.dblclick();
await page.waitForTimeout(2500);
console.log("decline:", await page.getByRole("alert").allTextContents());
await shot("declined");
await page.getByRole("radio", { name: /new card/ }).check();
console.log("email kept:", await page.getByLabel("Email address").inputValue());
await page.getByLabel("Card number").pressSequentially("4242424242424242");
console.log("grouped:", await page.getByLabel("Card number").inputValue());
await page.getByLabel("Expiry date").pressSequentially("1329");
await page.getByLabel("Expiry date").blur();
console.log("expiry:", await page.getByLabel("Expiry date").inputValue(), await page.locator("[role=alert]").allTextContents());
await page.getByLabel("Expiry date").fill("");
await page.getByLabel("Expiry date").pressSequentially("0428");
await page.getByLabel("Security code").fill("123");
await page.getByLabel("Postal code").fill("WC1N");
await page.getByLabel("City").focus();
console.log("postal:", await page.locator("[role=alert]").allTextContents());
await page.getByLabel("Postal code").fill("SW1A 1AA");
await pay.click();
await page.waitForTimeout(2500);
console.log("postal server:", await page.locator("[role=alert]").allTextContents(), await page.evaluate(() => document.activeElement?.id));
await page.getByLabel("Postal code").fill("WC1N 1AB");
await shot("before-pay");
await pay.click();
await page.waitForTimeout(2500);
console.log("url:", page.url());
console.log(await page.locator("main").innerText());
await shot("tickets");
console.log("orders sent:", orders.length, orders.map((o) => o.slice(0, 120)));
console.log(logs.join("\n"));
await browser.close();
