// focusab — WHICH change broke it? Serves the tree with the PROFILING boot
// bundle (the one build that still carries the runtime-development switches),
// opens a folder window in Desktop, and reports whether any window ends up
// focused — once per switch.
//
// The symptom (DT, 2026-09-17): double-clicking a folder in Files opens a second
// window, nothing is focused afterwards (every window's chrome goes grey), and
// further clicks do nothing. Main focuses the new window; this tree does not.
//
//   node mac-host/profile/focusab.mjs
import http from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const PROFILE = path.join(ROOT, "mac-host/bundles/declare-boot.profile.js");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const { createDeclareServer } = await import(path.join(ROOT, "server/create.mjs"));
const server = createDeclareServer({ mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }], mode: "distro" });
const profileSrc = readFileSync(PROFILE);
const httpServer = http.createServer((req, res) => {
  if (/\/bundles\/declare-boot\.js(\?|$)/.test(req.url)) {
    res.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" });
    res.end(profileSrc);
    return;
  }
  server.handler(req, res);
}).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

/** Open a folder window, then report which windows exist and which is active. */
async function run(label, flags) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950 });
  if (flags.length > 0) await page.evaluateOnNewDocument((fs) => { for (const f of fs) globalThis[f] = true; }, flags);
  await page.goto(`${B}/apps/desktop/desktop.declare?render=dom`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction("window.__app != null", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));
  const at = await page.evaluate(() => {
    const hits = [];
    for (const el of document.querySelectorAll("p, span, div")) {
      if (el.children.length) continue;
      if ((el.textContent ?? "").trim() !== "Background") continue;
      const r = el.getBoundingClientRect(); if (!r.width) continue;
      hits.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    return hits.sort((a, b) => b.y - a.y)[0] ?? null;
  });
  if (at === null) { await page.close(); return `${label}: no Background row`; }
  await page.mouse.click(at.x, at.y);
  await new Promise((r) => setTimeout(r, 90));
  await page.mouse.click(at.x, at.y);
  await new Promise((r) => setTimeout(r, 2500));
  const out = await page.evaluate(() => {
    const wins = globalThis.__app.wm.windows();
    return {
      n: wins.length,
      active: wins.filter((w) => w.active === true).map((w) => `${w.constructor?.name}:${w.title ?? ""}`),
      files: wins.filter((w) => w.constructor?.name === "FilesWindow").map((w) => `${w.title}@${Math.round(w.x)},${Math.round(w.y)}`),
      frontId: String(globalThis.__app.wm.frontId ?? ""),
      frontWin: globalThis.__app.wm.frontWin == null ? "null" : (globalThis.__app.wm.frontWin.constructor?.name ?? "?"),
    };
  });
  await page.close();
  return `${label.padEnd(30)} windows=${out.n} · files=[${out.files.join(", ")}] · frontId=${out.frontId || "(empty)"} · frontWin=${out.frontWin} · ACTIVE=[${out.active.join(", ") || "NOTHING"}]`;
}

console.log("double-click a folder in Files, then: is anything focused?\n");
for (const [label, flags] of [
  ["as shipped", []],
  ["--noring (per-read tracking)", ["__declareNoTrackRing"]],
  ["--settleempty (settle always)", ["__declareSettleEmpty"]],
  ["--noextent (JS auto-extent)", ["__declareNoKernelExtent"]],
  ["--placepersize (old layout)", ["__declareLayoutPlacePerSize"]],
]) console.log("  " + await run(label, flags));

await browser.close();
httpServer.close();
