// evalcount — how many times a PRODUCTION page constructs code from text
// (Function / eval) during boot, and what text. A precompiled build should need
// none; each remaining call is a page a strict CSP would break.
//   node mac-host/profile/evalcount.mjs [apps…]
import http from "node:http"; import path from "node:path"; import { readFileSync } from "node:fs"; import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildProduction } = await import(path.join(ROOT, "tools/declarec.mjs"));
const apps = process.argv.slice(2).length ? process.argv.slice(2) : ["calendar", "desktop", "tracker", "weather", "marketmap"];
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
for (const app of apps) {
  const dir = path.join(ROOT, "apps", app);
  const out = await buildProduction(readFileSync(path.join(dir, app + ".declare"), "utf8"), { name: app, originDir: dir, precompile: !process.env.TEXT, debug: !!process.env.DEBUG });
  const files = new Map(out.files.map((f) => ["/" + f.name, Buffer.from(f.contents)]));
  const srv = http.createServer((req, res) => {
    const p = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
    let body = files.get(p); if (!body) { try { body = readFileSync(path.join(dir, decodeURIComponent(p))); } catch { res.writeHead(404); res.end(); return; } }
    res.writeHead(200, { "content-type": p.endsWith(".html") ? "text/html" : p.endsWith(".js") ? "application/javascript" : p.endsWith(".json") ? "application/json" : "application/octet-stream" }); res.end(body);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const pg = await browser.newPage();
  await pg.evaluateOnNewDocument(() => {
    const calls = (globalThis.__evalCalls = []);
    const F = Function;
    const P = new Proxy(F, { construct(t, args) { calls.push(String(args[args.length - 1] ?? "").slice(-110)); return Reflect.construct(t, args); }, apply(t, self, args) { calls.push(String(args[args.length - 1] ?? "").slice(-110)); return Reflect.apply(t, self, args); } });
    globalThis.Function = P; F.prototype.constructor = P;
  });
  const errs = []; pg.on("pageerror", (e) => errs.push(String(e.stack || e)));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const calls = await pg.evaluate(() => globalThis.__evalCalls);
  const distinct = [...new Set(calls)];
  console.log(`${app.padEnd(10)} Function() calls during boot: ${calls.length}${errs.length ? " · PAGE ERRORS: " + errs.slice(0, 2).join(" | ").slice(0, 200) : ""}`);
  for (const c of (process.env.ALL ? distinct : distinct.slice(0, 6))) console.log("           " + JSON.stringify(c));
  if (process.env.DEBUG && errs.length) console.log(errs[0].split("\n").slice(0, 14).join("\n"));
  await pg.close(); srv.close();
}
await browser.close();
