import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 800 });
await p.goto("http://127.0.0.1:8215/apps/calendar/", { waitUntil: "networkidle2", timeout: 60000 });
await p.waitForFunction("window.__app != null"); await new Promise(r => setTimeout(r, 2500));
const out = await p.evaluate(() => {
  const D = globalThis.__declare, r = {};
  const t = (k, f) => { try { const v = f(); r[k] = typeof v === "string" ? v.slice(0, 160) : JSON.parse(JSON.stringify(v)); } catch (e) { r[k] = "ERROR " + String(e).slice(0, 90); } };
  t("stats", () => D.stats());
  t("inspect", () => { const n = D.inspect("app"); return { kind: n.kind, attrs: Object.keys(n.attrs ?? {}).slice(0, 6), kids: (n.children ?? []).length }; });
  t("explain", () => { const e = D.explain("app", "width"); return { kind: e.kind, why: String(e.why ?? e.source ?? "").slice(0, 80), deps: (e.deps ?? []).slice(0, 4) }; });
  t("dependents", () => D.dependents("app", "width")?.slice(0, 3));
  t("slots", () => Object.keys(D.slots("app") ?? {}).slice(0, 6));
  t("evaluate", () => D.evaluate("app.width"));
  t("clock", () => ({ keys: Object.keys(D.clock ?? {}).slice(0, 6) }));
  return r;
});
console.log(JSON.stringify(out, null, 1).slice(0, 1500));
await b.close();
