// Render a probe program in Chrome (DOM) and read one row of it, so a native
// capture of the same row can be compared as a curve.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prog = process.argv[2], row = Number(process.argv[3] ?? 100);
const b = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=1"],
  defaultViewport: { width: 400, height: 250, deviceScaleFactor: 1 } });
const p = await b.newPage();
await p.goto(`http://127.0.0.1:8260/apps/probe/${prog}.declare?render=dom`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1200));
writeFileSync("/tmp/probe-web.png", Buffer.from(await p.screenshot({ encoding: "base64" }), "base64"));
await b.close();
console.log(execFileSync("/usr/bin/python3", ["-c",
  `from PIL import Image
im = Image.open('/tmp/probe-web.png').convert('L')
print(' '.join(str(im.getpixel((x, ${row}))) for x in range(0, 400, 20)))`]).toString().trim());
