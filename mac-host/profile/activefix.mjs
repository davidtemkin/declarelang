// activefix — does w3.active ever recover? Poke frontId and see.
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 950 });
await p.goto(process.argv[2] ?? "http://127.0.0.1:8215/apps/desktop/", { waitUntil: "networkidle2", timeout: 60000 });
await p.waitForFunction("window.__app != null"); await new Promise(r => setTimeout(r, 3000));
const at = await p.evaluate(() => {
  const hits = [];
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length) continue;
    if ((el.textContent ?? "").trim() !== "Background") continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    hits.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  return hits.sort((a, b) => b.y - a.y)[0];
});
await p.mouse.click(at.x, at.y); await new Promise(r => setTimeout(r, 90));
await p.mouse.click(at.x, at.y); await new Promise(r => setTimeout(r, 2500));
const state = () => p.evaluate(() => {
  const wm = globalThis.__app.wm;
  return { frontId: String(wm.frontId ?? ""), front: wm.frontWin?.recId ?? "null", act: wm.windows().map((w) => `${w.recId}:${w.active}`).join(" ") };
});
console.log("  after open        ", JSON.stringify(await state()));
await p.evaluate(`__app.wm.frontId = "w2"`); await new Promise(r => setTimeout(r, 600));
console.log("  frontId := w2      ", JSON.stringify(await state()));
await p.evaluate(`__app.wm.frontId = "w3"`); await new Promise(r => setTimeout(r, 600));
console.log("  frontId := w3      ", JSON.stringify(await state()));
await p.evaluate(`__app.wm.windows()[2].activate()`); await new Promise(r => setTimeout(r, 600));
console.log("  w3.activate()      ", JSON.stringify(await state()));
await b.close();
