// Chrome's measureText for the same faces, so the two engines can be compared.
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const p = await b.newPage();
const out = await p.evaluate(() => {
  const c = document.createElement("canvas").getContext("2d");
  const fonts = ["700 34px system-ui", "bold 34px system-ui", "34px system-ui",
                 "700 13px system-ui", "600 13px system-ui"];
  return fonts.map((f) => {
    c.font = f;
    const m = c.measureText("[  ]");
    return `${f} -> width=${m.width.toFixed(2)} ascent=${m.fontBoundingBoxAscent} descent=${m.fontBoundingBoxDescent} actualAsc=${m.actualBoundingBoxAscent.toFixed(2)} actualDesc=${m.actualBoundingBoxDescent.toFixed(2)}`;
  });
});
await b.close();
for (const l of out) console.log("  " + l);
