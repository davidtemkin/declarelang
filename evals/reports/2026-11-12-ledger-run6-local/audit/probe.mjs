// probe.mjs — audit harness: starts its own ledger service on 8370 (stops it after),
// opens an app, runs a step file's default export (page, h) and prints what it returns.
//   node evals/reports/2026-11-12-ledger-run6-local/audit/probe.mjs <app-url> <steps.mjs>
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { launchChrome } from "../../../../tools/internal/chrome.mjs";

const [APP, STEPS] = process.argv.slice(2);
const ROOT = resolve(import.meta.dirname, "../../../..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const svc = spawn(process.execPath, [join(ROOT, "evals/apps/ledger/api/server.mjs"), "--port=8370"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:8370/api/today")).ok) break; } catch {} await sleep(100); }
const browser = await launchChrome({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") console.log(`console.${m.type()}:`, m.text().slice(0, 300)); });
  await page.goto(APP, { waitUntil: "networkidle2", timeout: 30000 });
  await sleep(2500);
  const nodes = async () => {
    const out = [];
    const walk = (n, d) => { if (!(["generic", "none", "InlineTextBox", "StaticText", "LineBreak", "paragraph", "group", "Section"].includes(n.role) && !n.name)) out.push({ ...n, depth: d, children: undefined }); for (const c of n.children ?? []) walk(c, d + 1); };
    walk(await page.accessibility.snapshot({ interestingOnly: false }), 0);
    return out;
  };
  const h = { sleep, nodes, api: async (p) => (await fetch("http://127.0.0.1:8370" + p)).json() };
  const mod = await import(resolve(STEPS));
  console.log(JSON.stringify(await mod.default(page, h), null, 1));
} finally {
  await browser.close();
  svc.kill("SIGTERM");
}
