// wideblur — the canvas-filter fallback at the wallpaper's scale: agreement with
// Chrome's native blur (mean/max channel Δ over a grid) and render cost, DOM and
// canvas renderers. `node mac-host/profile/wideblur.mjs`
import http from "node:http"; import path from "node:path"; import { fileURLToPath } from "node:url"; import puppeteer from "puppeteer-core";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { createDeclareServer } = await import(path.join(ROOT, "server/create.mjs"));
const server = createDeclareServer({ mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }], mode: "distro" });
const hs = http.createServer(server.handler).on("upgrade", server.upgrade); await new Promise((r) => hs.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${hs.address().port}`;
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
async function grab(render, fallback) {
  const pg = await browser.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(String(e))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); }); await pg.setViewport({ width: 600, height: 400, deviceScaleFactor: 2 });
  await pg.evaluateOnNewDocument(`window.__declareForceFilterFallback = ${fallback}`);
  // PROFILE=1: the metered bundle (rasterizes on the main thread, where the force switch reaches)
  if (process.env.PROFILE) {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(path.join(ROOT, "mac-host/bundles/declare-boot.profile.js"), "utf8");
    await pg.setRequestInterception(true);
    pg.on("request", (req) => { if (/\/bundles\/declare-boot\.js(\?|$)/.test(req.url())) req.respond({ status: 200, contentType: "application/javascript", body: src }); else req.continue(); });
  }
  await pg.goto(`${B}/${process.env.PROBE ?? "test/probe/wideblur.declare"}?render=${render}`, { waitUntil: "networkidle0", timeout: 60000 });
  await pg.waitForFunction("window.__declarePerf && window.__declarePerf.completed", { timeout: 30000 });
  const r = await pg.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1200));
    const c = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const g = c.getContext("2d"); const out = []; const N = 48;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const d = g.getImageData(Math.floor((i + 0.5) * c.width / N), Math.floor((j + 0.5) * c.height / N), 1, 1).data; out.push(d[0], d[1], d[2]); }
    const st = window.__declarePerf.stages; const rs = st.find((s) => s.stage === "render");
    return { px: out, render: rs?.dur ?? null, size: c.width + "x" + c.height };
  });
  if (errs.length) console.log("   page errors:", errs.slice(0, 2).join(" | ").slice(0, 300));
  await pg.close(); return r;
}
for (const render of ["dom", "canvas"]) {
  const n = await grab(render, false), f = await grab(render, true);
  let sum = 0, max = 0; for (let i = 0; i < n.px.length; i++) { const d = Math.abs(n.px[i] - f.px[i]); sum += d; if (d > max) max = d; }
  console.log(`${render.padEnd(6)} canvas ${n.size}: fallback vs native mean Δ ${(sum / n.px.length).toFixed(2)} max ${max} · render stage native ${n.render?.toFixed(1)} ms, fallback ${f.render?.toFixed(1)} ms`);
}
await browser.close(); hs.close();
