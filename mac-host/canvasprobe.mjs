import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--no-sandbox","--force-device-scale-factor=2"],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto("http://127.0.0.1:8260/apps/desktop/desktop.declare?render=canvas", { waitUntil: "networkidle0" });
await new Promise(r=>setTimeout(r,4000));
console.log(await p.evaluate(() => {
  const d = window.__declare;
  if (!d) return "no __declare";
  const w = d.find("app.wins");
  const cs = (w && w.children) || [];
  return "windows: " + cs.map(v => `${v.constructor.name}|title=${JSON.stringify(v.title||"")}|${Math.round(v.width)}x${Math.round(v.height)}`).join("  ");
}));
await b.close();
