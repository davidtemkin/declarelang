// Copy, cut and paste in a real browser (runtime clipboard.ts), by the page's
// own clipboard events. Pins:
//   - a copy goes to the focused view's nearest ancestor declaring the handler,
//     and puts every representation it was given; the platform's copy is stood down;
//   - a cut is its own handler; a paste reads every representation and the files;
//   - a view with no taker above it leaves the command to the browser;
//   - a focused text field keeps the clipboard for itself;
//   - Clipboard.copy from a press writes every representation.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";
import { launchChrome, findChrome } from "../tools/internal/chrome.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = createDeclareServer({ mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }], mode: "distro" });
const httpServer = http.createServer((req, res) => server.handler(req, res));
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

const browser = await launchChrome({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 600, height: 400 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(`${B}/test/probe/clipboard-probe.declare`, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(`window.__declare && __declare.find("app").board`, { timeout: 30000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The browser's clipboard event at the focused element, with a clipboard
 *  holding `data`: what it holds after, and whether the platform was stood down. */
const fire = (type, data = {}, file = null) => page.evaluate((type, data, file) => {
  const dt = new DataTransfer();
  for (const [k, v] of Object.entries(data)) dt.setData(k, v);
  if (file !== null) dt.items.add(new File([file], "shot.png", { type: "image/png" }));
  const e = new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true });
  (document.activeElement ?? document.body).dispatchEvent(e);
  const out = {};
  for (const t of dt.types) if (t !== "Files") out[t] = dt.getData(t);
  return { prevented: e.defaultPrevented, out };
}, type, data, file);
const app = (k) => page.evaluate((k) => __declare.find("app")[k], k);

// focus moved as a program moves it (a press on a plain view does not take
// focus); a text field takes it from a click, as a person gives it
const click = async (p) => {
  if (p === "field") {
    const c = await page.evaluate(() => { const v = __declare.find("app").field; const o = v.rootOrigin(); return { x: o.x + 20, y: o.y + v.height / 2 }; });
    await page.mouse.click(c.x, c.y);
  } else if (p === "copyLink") {
    const c = await page.evaluate(() => { const v = __declare.find("app").copyLink; const o = v.rootOrigin(); return { x: o.x + v.width / 2, y: o.y + v.height / 2 }; });
    await page.mouse.click(c.x, c.y);
  } else {
    await page.evaluate((p) => { const a = __declare.find("app"); a.focusOn(p.split(".").reduce((o, k) => o[k], a)); }, p);
  }
  await wait(50);
};

await test("a copy goes to the nearest view declaring it, with every representation", async () => {
  await click("chip.inner");
  const r = await fire("copy");
  assert.equal(r.prevented, true, "the platform's copy stood down");
  assert.deepEqual(r.out, { "text/plain": "tomato", "application/x-chip": JSON.stringify({ word: "tomato" }) });
});

await test("a paste reads what is on offer, its own type first", async () => {
  await click("board");
  const r = await fire("paste", { "text/plain": "tomato", "application/x-chip": JSON.stringify({ word: "basil" }) });
  await wait(50);
  assert.equal(r.prevented, true);
  assert.equal(await app("pasted"), "basil");
  assert.equal(await app("types"), "text/plain,application/x-chip");
  await fire("paste", { "text/plain": "thyme" });
  await wait(50);
  assert.equal(await app("pasted"), "thyme", "plain text when its own type is absent");
  await fire("paste", {}, "PNGBYTES");
  await wait(50);
  assert.equal(await app("pastedFiles"), 1, "a pasted image arrives as a file");
});

await test("a cut is its own handler", async () => {
  await click("chip");
  const r = await fire("cut");
  await wait(50);
  assert.deepEqual(r.out, { "text/plain": "tomato" });
  assert.equal(await app("word"), "");
});

await test("with no view to take it, the command is the browser's", async () => {
  await click("plain");
  const r = await fire("copy");
  assert.equal(r.prevented, false);
  assert.deepEqual(r.out, {});
});

await test("a focused text field keeps the clipboard for itself", async () => {
  await click("field");
  const r = await fire("paste", { "text/plain": "not for the board" });
  await wait(50);
  assert.equal(r.prevented, false);
  assert.equal(await app("pasted"), "", "board untouched");
});

await test("Clipboard.copy from a press writes every representation", async () => {
  // the browser's copy command, answered into a clipboard the test can read
  await page.evaluate(() => {
    window.__held = null;
    document.execCommand = (cmd) => {
      if (cmd !== "copy") return false;
      const dt = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
      window.__held = {};
      for (const t of dt.types) window.__held[t] = dt.getData(t);
      return true;
    };
  });
  await click("copyLink");
  assert.deepEqual(await page.evaluate(() => window.__held), {
    "text/plain": "https://example.test", "text/html": "<a href=\"https://example.test\">example</a>",
  });
});

assert.deepEqual(errors, []);
await browser.close();
httpServer.close();
summarize("clipboard-browser");
