// Dumps the Cells page's accessibility tree roles: is the body's `grid` role exposed, and with what?
import { launchChrome } from "~/Code/Declare/tools/internal/chrome.mjs";
const APP = process.argv[2] ?? "http://127.0.0.1:8290/my-apps/7guis-run3/7guis.declare";
const b = await launchChrome({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
await p.goto(APP, { waitUntil: "networkidle2" });
await new Promise(r => setTimeout(r, 1500));
await (await p.$('::-p-aria([name="Cells"][role="tab"])')).click();
await new Promise(r => setTimeout(r, 1200));
const snap = await p.accessibility.snapshot({ interestingOnly: false });
const counts = {}; const out = [];
const walk = (n, d) => { counts[n.role] = (counts[n.role] ?? 0) + 1; if (["grid","row","gridcell","cell","columnheader","rowheader","textbox"].includes(n.role)) out.push(`${"  ".repeat(Math.min(d,6))}${n.role} "${n.name ?? ""}"`); for (const c of n.children ?? []) walk(c, d + 1); };
walk(snap, 0);
console.log(out.slice(0, 20).join("\n")); console.log(JSON.stringify(counts));
const dom = await p.evaluate(() => [...document.querySelectorAll('[role=grid]')].map(e => ({ role: e.getAttribute('role'), label: e.getAttribute('aria-label'), kids: e.children.length })));
console.log("DOM role=grid:", JSON.stringify(dom));
await b.close();
