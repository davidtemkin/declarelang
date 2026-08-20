import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1200, height: 900 });
const measure = async (url) => {
  await p.goto(url, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 5000));
  return p.evaluate(`(() => {
    const pres = [...document.querySelectorAll("pre")].map(e => {
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top + scrollY), bot: Math.round(r.bottom + scrollY), txt: e.textContent.slice(0, 30) };
    });
    let overlaps = 0, worst = null;
    for (let i = 1; i < pres.length; i++)
      if (pres[i].top < pres[i-1].bot - 2) { overlaps++; if (!worst) worst = [pres[i-1], pres[i]]; }
    return { pres: pres.length, overlaps, worst };
  })()`);
};
console.log("desktop :", JSON.stringify(await measure("http://localhost:8260/apps/desktop/desktop.declare?viewer=reader")));
console.log("desktop2:", JSON.stringify(await measure("http://localhost:8260/apps/desktop2/desktop.declare?viewer=reader")));
console.log("birds   :", JSON.stringify(await measure("http://localhost:8260/apps/birds/birds.declare?viewer=reader")));
await b.close();
