// What does Chrome ACTUALLY apply to the Viewer's source <pre>? The block spec
// says fontSize 12 / lineHeight 1.25 -> a 15px line box on both backends, but
// the two renders measure 14.0pt and 14.5pt. Ask the reference rather than
// infer from pixels.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=2"],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await p.goto("http://127.0.0.1:8260/apps/desktop/desktop.declare?render=dom", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2500));
await p.mouse.move(497, 700); await new Promise((r) => setTimeout(r, 300));
await p.mouse.click(497, 735);
await new Promise((r) => setTimeout(r, 12000));
await p.mouse.click(609, 160);
await new Promise((r) => setTimeout(r, 3000));

console.log(JSON.stringify(await p.evaluate(() => {
  const pres = [...document.querySelectorAll("pre")];
  const vis = pres.filter((e) => e.offsetHeight > 0);
  const pick = (vis.length ? vis : pres).slice(0, 2);
  return pick.map((e) => {
    const cs = getComputedStyle(e);
    const first = e.firstElementChild;
    return {
      visible: e.offsetHeight > 0,
      inlineFont: e.style.fontSize, inlineLH: e.style.lineHeight,
      computedFont: cs.fontSize, computedLH: cs.lineHeight,
      // what the RUNS carry — a span's own line-height would win inside the box
      runInlineLH: first ? first.style.lineHeight : null,
      runComputedLH: first ? getComputedStyle(first).lineHeight : null,
      runInlineFont: first ? first.style.fontSize : null,
      lines: e.textContent.split("\n").length,
      offsetH: e.offsetHeight,
      perLine: e.offsetHeight / Math.max(1, e.textContent.split("\n").length),
    };
  });
}), null, 1));
await b.close();
