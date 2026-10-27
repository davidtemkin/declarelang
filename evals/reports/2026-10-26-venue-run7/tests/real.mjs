// Load the app at its real address from the dev server, as a person would.
import puppeteer from "/Users/temkin/Code/eval-venue-7/work/declarelang/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on("console", (m) => { if (m.type() == "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://127.0.0.1:8200/my-apps/venue/venue.declare", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 4000));
const btn = await page.$('[aria-label^="Fri 13 Nov"]');
console.log("row found:", !!btn);
await btn.click();
await new Promise((r) => setTimeout(r, 2500));
const seats = await page.$$eval('[role="button"][aria-label*=", row "]', (els) => els.length);
console.log("seat buttons:", seats);
await page.screenshot({ path: "/tmp/venue-shots/real-hall.png" });
console.log("errors:", errors);
await browser.close();
