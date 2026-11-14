// axdump.mjs <app-url> — open the app, press the 13 Nov performance, print the a11y nodes whose name mentions "Orchestra"
import puppeteer from "puppeteer-core";
import { launchChrome } from "../../../../tools/internal/chrome.mjs";
const url = process.argv[2];
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--window-size=1280,900"] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 900 });
await page.goto(url, { waitUntil: "networkidle2" });
const all = async () => { const out = []; const w = (n, d) => { out.push([d, n]); for (const c of n.children ?? []) w(c, d + 1); }; w(await page.accessibility.snapshot({ interestingOnly: false }), 0); return out; };
for (let i = 0; i < 60; i++) { if ((await all()).some(([, n]) => /13 Nov/.test(n.name ?? ""))) break; await new Promise(r => setTimeout(r, 250)); }
const perf = (await all()).find(([, n]) => n.role === "button" && /13 Nov/.test(n.name ?? ""))[1];
const h = await perf.elementHandle(); await h.click(); await new Promise(r => setTimeout(r, 2500));
const nodes = await all();
const hits = nodes.filter(([, n]) => /Orchestra|row A/.test(n.name ?? ""));
console.log("total nodes", nodes.length, "orchestra-ish", hits.length);
for (const [d, n] of hits.slice(0, 12)) console.log(d, n.role, JSON.stringify(n.name), n.pressed ?? "", n.checked ?? "", n.disabled ?? "");
const roles = {}; for (const [, n] of nodes) roles[n.role] = (roles[n.role] ?? 0) + 1; console.log(JSON.stringify(roles));
// the DOM of the first free seat-like element
const dom = await page.evaluate(() => { const e = [...document.querySelectorAll("[role],[aria-label]")].filter(e => /Orchestra/.test(e.getAttribute("aria-label") ?? "")).slice(0, 3); return e.map(x => x.outerHTML.slice(0, 300)); });
console.log(dom.join("\n"));
await browser.close();
