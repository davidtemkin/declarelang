// Shared puppeteer harness for the probes and the acceptance driver.
import puppeteer from "puppeteer-core";

export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const BASE_URL = process.env.TRACKER_URL ?? "http://localhost:5175";
export const LIST = "[data-testid='list']";

export async function openTracker({ width = 1560, height = 950, url = BASE_URL } = {}) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--js-flags=--max-old-space-size=8192"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  page.on("pageerror", (error) => console.error("[page error]", error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console]", msg.text());
  });
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForSelector(LIST);
  await waitForRows(page);
  return { browser, page };
}

/** Resolves once the list has committed at least one row. */
export async function waitForRows(page) {
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.querySelectorAll("[data-index]").length > 0,
    { timeout: 120_000 },
    LIST,
  );
}

export async function setScale(page, label) {
  await page.click(`button[title$="issues"][aria-pressed="false"]::-p-text(${label})`).catch(async () => {
    const handles = await page.$$("[role='group'][aria-label='Dataset scale'] button");
    for (const handle of handles) {
      const text = await handle.evaluate((el) => el.textContent.trim());
      if (text === label) return handle.click();
    }
    throw new Error(`scale button ${label} not found`);
  });
  await page.waitForFunction(() => !document.querySelector("[role='status']"), { timeout: 180_000 });
  await waitForRows(page);
}

/** Text of every rendered row, top to bottom. */
export const rowTitles = (page) =>
  page.$$eval(`${LIST} [data-index]`, (nodes) =>
    nodes.map((n) => n.textContent.replace(/\s+/g, " ").trim()),
  );

export const shownCount = (page) =>
  page.$$eval("[aria-live='polite'] strong", (nodes) => nodes.map((n) => n.textContent));
