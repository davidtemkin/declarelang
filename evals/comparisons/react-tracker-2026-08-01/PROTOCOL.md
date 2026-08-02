# Measurement protocol

All numbers measured on this machine, headless Chrome at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
(install `puppeteer-core` in this project to drive it), viewport
1560×950, deviceScaleFactor 2.

## Definitions

- **load ms**: fetch + parse of `issues.json`, `performance.now()`
  around the await of `fetch(...)` + `.json()`.
- **ingest ms**: from parsed JSON in hand to the app's data model ready
  (whatever that means in your architecture — state store populated,
  first render dispatched). State the boundary you measured in REPORT.md.
- **search ms**: one keystroke's filter recompute over the full dataset
  (the derivation itself, not the render), measured inside the app and
  shown in its UI (Noun 14).
- **scrub**: the scroll protocol below — median and p90 of 30 steps.

## The scrub probe

Save as `probe.mjs`, run with the app served (any port; adjust URL and
the selector for your scroll container):

```js
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1560, height: 950, deviceScaleFactor: 2 });
await page.goto(process.argv[2] ?? "http://localhost:5173", { waitUntil: "networkidle0" });
// wait until your app reports ready, then set the dataset to 100K first.
const times = await page.evaluate(async (sel) => {
  const el = document.querySelector(sel);
  const out = [];
  for (let i = 1; i <= 30; i++) {
    const t0 = performance.now();
    el.scrollTop = (el.scrollHeight - el.clientHeight) * (i / 30);
    await new Promise((r) => requestAnimationFrame(r));
    out.push(performance.now() - t0);
  }
  return out;
}, process.argv[3] ?? ".list");        // your scroll container selector
const s = [...times].sort((a, b) => a - b);
console.log("scrub median", s[15].toFixed(1), "p90", s[27].toFixed(1));
await browser.close();
```

Report scrub at 100K. A step is one scrollbar teleport + one frame; the
median is the number that matters, the p90 catches jank.

## Sizes

- `npm run build`, then report each emitted asset raw and gzipped
  (`gzip -k -9` or your bundler's report).
- `du -sh node_modules` and the count of DIRECT dependencies
  (dependencies + devDependencies, listed separately).
