import puppeteer from "puppeteer-core";
import { ORIGIN } from "./app.mjs";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--no-sandbox","--force-device-scale-factor=2"],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
const prog = process.argv[2] || "apps/desktop/desktop.declare";
await p.goto(`${ORIGIN}/${prog}?render=canvas`, { waitUntil: "networkidle0" });
await new Promise(r=>setTimeout(r,4000));
console.log(JSON.stringify(await p.evaluate(() => window.__declare.stats())));
await b.close();
