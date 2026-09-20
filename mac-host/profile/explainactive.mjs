// explainactive — ask the runtime's OWN introspection (the surface the Inspector
// and an agent use) to explain `active` on each window, before and after a
// folder window opens.
import puppeteer from "puppeteer-core";
const URL_ = process.argv[2] ?? "http://127.0.0.1:8215/apps/desktop/";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 950 });
await p.goto(URL_, { waitUntil: "networkidle2", timeout: 60000 });
await p.waitForFunction("window.__app != null"); await new Promise(r => setTimeout(r, 3000));
console.log(URL_);
console.log("  __declare surface:", await p.evaluate("Object.keys(globalThis.__declare ?? {}).join(', ')"));
const explain = (tag) => p.evaluate((t) => {
  const wm = globalThis.__app.wm, wins = wm.windows();
  const D = globalThis.__declare;
  const rows = wins.map((w) => {
    let prov = null;
    try { prov = D?.explain ? D.explain(w, "active") : null; } catch (e) { prov = { error: String(e).slice(0, 80) }; }
    return { win: `${w.constructor?.name}#${w.recId}`, active: w.active, prov: JSON.parse(JSON.stringify(prov ?? null)) };
  });
  return { tag: t, frontId: String(wm.frontId ?? ""), rows };
}, tag);
console.log(" ", JSON.stringify(await explain("boot")));
const at = await p.evaluate(() => {
  const hits = [];
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length) continue;
    if ((el.textContent ?? "").trim() !== "Background") continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    hits.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  return hits.sort((a, b) => b.y - a.y)[0] ?? null;
});
await p.mouse.click(at.x, at.y); await new Promise(r => setTimeout(r, 90));
await p.mouse.click(at.x, at.y); await new Promise(r => setTimeout(r, 2500));
console.log(" ", JSON.stringify(await explain("after open")));
await b.close();
