import { chromium } from "playwright-core";
const [,, mode = "desk"] = process.argv;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext(mode === "phone"
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  : { viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto("http://127.0.0.1:5178/");
await page.waitForTimeout(800);
await page.screenshot({ path: `/tmp/venue-check/shots/${mode}-list.png`, fullPage: mode !== "phone" });
await page.getByRole("link", { name: /13 November/ }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `/tmp/venue-check/shots/${mode}-hall.png` });
console.log(logs.join("\n"));
await browser.close();
