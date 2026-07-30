// Chrome's reported font box for a spread of faces and sizes — the reference
// the native measurer must reproduce. Pair with `ctl.mjs metrics "<css>"`, which
// prints Core Text's raw ascender/descender for the same string, to see which
// rounding rule Chrome is actually applying.
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const p = await b.newPage();
const out = await p.evaluate(() => {
  const c = document.createElement("canvas").getContext("2d");
  const fams = ["ui-monospace, SFMono-Regular, monospace", "system-ui", "600 system-ui", "Georgia"];
  const res = [];
  for (const fam of fams) {
    for (const size of [11, 12, 13, 14, 15, 18, 21, 34]) {
      const weighted = fam.startsWith("600 ");
      c.font = weighted ? `600 ${size}px ${fam.slice(4)}` : `${size}px ${fam}`;
      const m = c.measureText("Mg");
      res.push(`${c.font}\tasc=${m.fontBoundingBoxAscent}\tdesc=${m.fontBoundingBoxDescent}` +
               `\tsum=${m.fontBoundingBoxAscent + m.fontBoundingBoxDescent}`);
    }
  }
  return res;
});
await b.close();
for (const l of out) console.log(l);
