// shot.mjs — capture a screenshot of an app at a given size, after it settles.
//   node shot.mjs <url> <width> <height> <out.png> [waitMs=4000]
import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function L(o){ for(let i=0;i<8;i++){ try{ return await pp.launch(o);}catch(e){ await sleep(1200);} } throw 0; }
const [url, w, h, out, waitMs] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], +(process.argv[6]||4000)];
const b = await L({ executablePath: CHROME, headless: "new", userDataDir: "/tmp/shot-" + Date.now(), args: ["--no-sandbox","--window-size="+w+","+h] });
const p = await b.newPage(); await p.setViewport({ width: w, height: h });
await p.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
await sleep(waitMs);
await p.screenshot({ path: out });
const t = await p.evaluate(() => (document.body.innerText || "").slice(0, 50)).catch(() => "");
console.log(`  ${out} (${w}x${h})  text: ${JSON.stringify(t)}`);
await b.close();
