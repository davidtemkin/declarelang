import { chromium } from "playwright";
export const URL = "http://127.0.0.1:8200/my-apps/venue/venue.declare";
export async function open({ phone = false } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => { if (r.url().includes(":8350/api/") && r.method() != "GET") requests.push([r.method(), r.url(), r.postData()]); });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(URL);
  await page.waitForTimeout(2500);
  return { browser, page, requests };
}
export async function freeSeats(page, n, step = 5, section = "") {
  const free = page.locator(`[role=button][aria-description$="free"]${section ? `[aria-label^="${section}"]` : ""}`);
  const out = [];
  for (let i = 0; out.length < n; i += step) out.push(await free.nth(i).getAttribute("aria-label"));
  return out;
}
export const seat = (page, name) => page.getByRole("button", { name, exact: true });
