// chrome.mjs — the one way the suite and the gates launch Chrome.
//
//   import { launchChrome, findChrome } from "…/tools/internal/chrome.mjs";
//   const browser = await launchChrome({ args: ["--no-sandbox"] });   // puppeteer.launch's options
//
// WHY ONE PLACE. Chrome starts helpers of its own — the crash handler, and on
// a branded install the Google updater — and they inherit its stdio. Puppeteer
// pipes Chrome's output to read the DevTools address, so after Chrome exits
// those helpers still hold the far end of the pipe, and a finished test's
// process waited on it: 20 s of nothing after the last result, every browser
// test file (measured 2026-10-03: draw-bounds 44 s → 24 s). Launch flags do not
// stop the helpers; releasing the pipes once launch has read the address does.

import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

/** The Chrome to drive: PUPPETEER_EXECUTABLE_PATH / CHROME_PATH, else the usual installs. */
export function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

/** puppeteer.launch, with Chrome found and its pipes released after launch. */
export async function launchChrome(opts = {}) {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, ...opts });
  const proc = browser.process();
  for (const s of [proc?.stdin, proc?.stdout, proc?.stderr]) s?.unref?.();
  return browser;
}
