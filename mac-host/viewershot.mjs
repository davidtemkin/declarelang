// Open the Viewer from the dock in the DOM renderer and screenshot it, so the
// native rendering of the same app can be held against it.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=2"],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
p.on("console", (m) => { const t = m.text(); if (/error|Error/.test(t)) console.log("  page:", t.slice(0, 120)); });
await p.goto("http://127.0.0.1:8260/apps/desktop/desktop.declare?render=dom", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2500));
await p.mouse.move(497, 700);
await new Promise((r) => setTimeout(r, 300));
await p.mouse.click(497, 735);
await new Promise((r) => setTimeout(r, 12000));
writeFileSync("/tmp/viewer-web.png", Buffer.from(await p.screenshot({ encoding: "base64" }), "base64"));
await b.close();
console.log("ok");
