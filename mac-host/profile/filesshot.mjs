import puppeteer from "puppeteer-core";
const OUT = "/private/tmp/claude-503/-Users-temkin-Code-Declare/c4b17870-b7f5-4138-a938-c0fe32a94c4c/scratchpad";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 950 });
await p.goto("http://127.0.0.1:8215/apps/desktop/", { waitUntil: "networkidle2" });
await p.waitForFunction("window.__app != null"); await new Promise(r => setTimeout(r, 2500));
await p.evaluate("__app.launcher.newFiles()"); await new Promise(r => setTimeout(r, 1500));
const click = async (label) => {
  const box = await p.evaluate((want) => {
    for (const el of document.querySelectorAll("p, span, div")) {
      if (el.children.length) continue;
      if ((el.textContent ?? "").trim() !== want) continue;
      const r = el.getBoundingClientRect(); if (r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } return null; }, label);
  if (!box) { console.log("no label", label); return; }
  const t0 = Date.now(); await p.mouse.click(box.x, box.y); await new Promise(r => setTimeout(r, 1200));
  console.log(label, "clicked, waited", Date.now() - t0, "ms");
};
await p.screenshot({ path: `${OUT}/files-0-open.png` });
await click("Operational"); await p.screenshot({ path: `${OUT}/files-1-operational.png` });
await click("Background"); await p.screenshot({ path: `${OUT}/files-2-background.png` });
await b.close();
