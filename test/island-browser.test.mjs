// The island bridge END TO END, in a real browser, on BOTH backends
// (test/probe/bridge-host.declare + bridge-tenant.declare). The DOM run mounts
// the tenant into the island's box; the CANVAS run mounts it by SURFACE
// COMPOSITION (mountEmbeddedApp — no element anywhere). Same program, same
// bridge, same pins:
//   - the tenant mounts and the link forms (handshake clean);
//   - tenant→host: the tenant's `pos` export crossed at link, host text shows it;
//   - host→tenant: writing the host's `vol` re-derives the tenant's binding;
//   - verbs round-trip: host post → tenant onPost bumps its export and acks →
//     host sees both the new pos and the ack.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(label, url, tenantOf) {
  const page = await browser.newPage();
  await page.setViewport({ width: 600, height: 400 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setBypassServiceWorker", { bypass: true });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  // the tenant mounts asynchronously (compile ladder) — wait for the link
  await page.waitForFunction(tenantOf + " != null", { timeout: 30000 });
  await sleep(200);

  await test(`${label}: the tenant mounted and its export crossed at link`, async () => {
    const s = await page.evaluate(`({
      pos: window.__app.player.pos,
      hostText: window.__declare.evaluate("app.posOut", "text").value ?? window.__app.posOut.text,
      tenantVol: ${tenantOf}.volume,
    })`);
    assert.equal(s.pos, 3, "tenant's initial pos crossed (readonly external = tenant-owned)");
    assert.equal(s.hostText, "pos=3", "…and the host's reader re-derived");
    assert.equal(s.tenantVol, 0.7, "the host's volume crossed the other way");
  });

  await test(`${label}: a host write re-derives the tenant's binding`, async () => {
    await page.evaluate(`window.__app.vol = 0.2`);
    await sleep(100);
    const v = await page.evaluate(`${tenantOf}.volume`);
    assert.equal(v, 0.2);
    const t = await page.evaluate(`${tenantOf}.volT.text`);
    assert.equal(t, "v0.2", "the tenant's own constraint saw it");
  });

  await test(`${label}: verbs round-trip — post bumps the export, the ack comes home`, async () => {
    await page.evaluate(`window.__app.player.post("go", 1)`);
    await sleep(150);
    const s = await page.evaluate(`({ pos: window.__app.player.pos, log: window.__app.log })`);
    assert.equal(s.pos, 4, "tenant's onPost bumped its export and the bump crossed");
    assert.equal(s.log, "ack;", "…and the tenant's post landed on the island's onPost");
  });

  await test(`${label}: no page errors`, async () => {
    assert.deepEqual(errors, []);
  });
  await page.close();
}

// DOM: the tenant lives in the island's box element
await run("dom", `${B}/test/probe/bridge-host.declare`,
  `document.querySelector('[data-declare-slot^="run:"]')?.__childApp`);

// The FOREIGN handle (DOM only — a raw-JS tenant speaking through the
// sanctioned `el.__declareIsland`): discovery, a validated push that host
// constraints re-derive from, and the verb into the island's onPost.
await test("dom: a foreign tenant works the same bridge through __declareIsland", async () => {
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setBypassServiceWorker", { bypass: true });
  await page.goto(`${B}/test/probe/bridge-host.declare`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(`document.querySelector('[data-declare-slot="note"]')?.__declareIsland != null`, { timeout: 30000 });
  const s = await page.evaluate(`(() => {
    const h = document.querySelector('[data-declare-slot="note"]').__declareIsland;
    const names = h.externals().map((e) => e.name);
    h.set("txt", "from raw JS");
    h.post("hello", null);
    return { names, txt: h.get("txt") };
  })()`);
  assert.deepEqual(s.names, ["txt"], "discovery lists the declared surface");
  assert.equal(s.txt, "from raw JS", "the validated push landed");
  await sleep(120);
  const after = await page.evaluate(`({ out: window.__app.noteOut.text, log: window.__app.log })`);
  assert.equal(after.out, "from raw JS", "host constraints re-derived from the foreign push");
  assert.ok(after.log.includes("note:hello;"), "the foreign post fired the island's onPost");
  await page.close();
});

// CANVAS: no element — surface composition; the child rides the island view
await run("canvas", `${B}/test/probe/bridge-host.declare?render=canvas`,
  `window.__declare?.find("app.player")?.__childApp`);

await browser.close();
httpServer.close();
summarize("island-browser");
