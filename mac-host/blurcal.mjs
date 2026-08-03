// Fit the Gaussian sigma the two renderers actually produce for blur(20px).
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URLBASE = "http://127.0.0.1:8260/test/probe/blur2.declare";

async function webProfile(render) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ["--no-sandbox", "--force-device-scale-factor=1"],
    defaultViewport: { width: 400, height: 200, deviceScaleFactor: 1 } });
  const p = await b.newPage();
  await p.goto(`${URLBASE}?render=${render}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));
  const buf = await p.screenshot({ encoding: "base64" });
  await b.close();
  return buf;
}
function fit(vals) {
  // vals: luminance across x at the bar's left edge (x=100). The blurred step
  // is 255 * Phi((x - 100)/sigma); the slope at the edge is 255/(sigma*sqrt(2pi)).
  const slope = (vals[101] - vals[99]) / 2;
  return 255 / (slope * Math.sqrt(2 * Math.PI));
}
const b64 = await webProfile("dom");
const { writeFileSync } = await import("node:fs");
writeFileSync("/tmp/blur-web.png", Buffer.from(b64, "base64"));
const row = JSON.parse(execFileSync("/usr/bin/python3", ["-c",
  `from PIL import Image; import json
im = Image.open('/tmp/blur-web.png').convert('L')
print(json.dumps([im.getpixel((x, 100)) for x in range(400)]))`]).toString());
console.log("web  blur(20px) → sigma =", fit(row).toFixed(2), " edge samples", row.slice(96, 105).join(","));
