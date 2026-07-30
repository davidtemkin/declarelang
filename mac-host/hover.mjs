// Screenshot the DOM render with the pointer parked at a model coordinate, so
// hover states can be compared against a native capture of the same point.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [mx, my] = [Number(process.argv[2]), Number(process.argv[3])];
const b = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=2"],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto("http://127.0.0.1:8260/apps/desktop/desktop.declare?render=dom", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2500));
await p.mouse.move(mx - 40, my);
await new Promise((r) => setTimeout(r, 120));
await p.mouse.move(mx, my);
await new Promise((r) => setTimeout(r, 1200));
writeFileSync("/tmp/hover-web.png", Buffer.from(await p.screenshot({ encoding: "base64" }), "base64"));
await b.close();
console.log("ok");
