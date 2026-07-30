// Where does the REFERENCE break the reader's prose? Pair with
// `ctl.mjs lines <id>`: the measurers agree on advances to the last digit, so a
// wrap divergence is the two wrap ENGINES disagreeing, and the only way to see
// it is break-for-break against Chrome.
//
// Line boundaries are found by walking the text node one character at a time and
// watching the client rect's top jump — the browser will not name its own line
// breaks, but it will place every character.
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

console.log(await p.evaluate(() => {
  // the first visible prose paragraph of the reader
  const all = [...document.querySelectorAll("p")].filter((e) => e.offsetHeight > 0);
  const inventory = all.map((e) => `  cand clientWidth=${e.clientWidth} chars=${e.textContent.length}`);
  // the viewer's reader column is 504 wide (the native flow reports the same)
  const ps = all.filter((e) => Math.abs(e.clientWidth - 504) < 2 && e.textContent.length > 200);
  if (!ps.length) return "no 504-wide prose paragraph found\n" + inventory.join("\n");
  const el = ps[0];
  const cs = getComputedStyle(el);
  const out = [`clientWidth=${el.clientWidth} width=${cs.width} fontSize=${cs.fontSize}` +
               ` lineHeight=${cs.lineHeight} family=${cs.fontFamily.slice(0, 30)}` +
               ` chars=${el.textContent.length}`];
  // walk characters, watching for the line top to change
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const r = document.createRange();
  let idx = 0, lastTop = null, lineStart = 0, lineMaxRight = 0, lineLeft = null, node;
  const text = el.textContent;
  const flush = (end) => {
    if (lastTop !== null) {
      out.push(`  line chars=${lineStart}..${end} inkW=${(lineMaxRight - lineLeft).toFixed(2)}` +
               `  ${JSON.stringify(text.slice(lineStart, end))}`);
    }
  };
  while ((node = walk.nextNode())) {
    for (let i = 0; i < node.length; i++) {
      r.setStart(node, i); r.setEnd(node, i + 1);
      const rect = r.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { idx++; continue; }
      if (lastTop === null || Math.abs(rect.top - lastTop) > 2) {
        flush(idx);
        lastTop = rect.top; lineStart = idx; lineLeft = rect.left; lineMaxRight = rect.right;
      } else lineMaxRight = Math.max(lineMaxRight, rect.right);
      idx++;
    }
  }
  flush(idx);
  return out.join("\n");
}));
await b.close();
