// Resize cost, the same gesture on all three renderers.
//
// The native half is measured by the host's own stats (`ctl.mjs statsreset` →
// drag → `stats`). This measures the two browser renderers the same way it can
// be measured from inside a page: a rAF recorder timestamps every frame, and a
// main-thread stall shows up as a long gap between them — the same thing the
// native MOTION gap detects.
//
//   node resizebench.mjs            # dom + canvas
//   node resizebench.mjs dom        # one of them
//
// ⚠ The renderers do NOT share a frame budget: headless Chrome drives rAF at
// 60Hz (16.7ms), the native host at 120Hz (8.3ms). So each renderer's own
// median interval is reported as its baseline, and "long" is >1.5x that.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ORIGIN = process.env.DECLARE_ORIGIN ?? "http://127.0.0.1:8260";
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const MODES = only.length ? only : ["dom", "canvas"];
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

async function run(mode) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ["--no-sandbox", "--force-device-scale-factor=2"],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
  const p = await b.newPage();
  const errs = [];
  p.on("console", (m) => { if (/error/i.test(m.text())) errs.push(m.text().slice(0, 90)); });
  await p.goto(`${ORIGIN}/apps/desktop/desktop.declare?render=${mode}`, { waitUntil: "networkidle0" });
  await sleep(3);

  // THE JOT WINDOW is the like-for-like target: it carries a Markdown body (so
  // the reflow path is exercised) and it exists on all three renderers. The
  // Viewer cannot be used — the canvas backend's `setEmbed` is a no-op, so an
  // AppIsland never mounts there and the Viewer window does not exist at all.
  const corner = await p.evaluate(() => {
    const d = window.__declare;
    const wins = d && d.find ? d.find("app.wins") : null;
    const cs = (wins && wins.children) || [];
    for (const w of cs) {
      if (w && w.constructor && w.constructor.name === "JotWindow") {
        // ⚠ +2, NOT −2: the resize strip is the HALO, which sits just OUTSIDE
        // the window box (`app.wins.N.halo.cr`). Two pixels inside is the
        // `veil`, and grabbing that does not resize.
        return [Math.round(w.x + w.width + 2), Math.round(w.y + w.height + 2),
                Math.round(w.width), Math.round(w.height)];
      }
    }
    return null;
  });
  if (corner === null) { await b.close(); return { mode, error: "JotWindow not found" }; }

  // frame recorder
  await p.evaluate(() => {
    window.__frames = [];
    const tick = (t) => { window.__frames.push(t); window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
  });

  // the same drag the native harness runs: 6 steps of -25px on x
  const [cx, cy] = corner;
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  for (let i = 1; i <= 6; i++) { await p.mouse.move(cx - 25 * i, cy); await sleep(0.016); }
  await p.mouse.up();
  await sleep(1.5);

  const r = await p.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    const f = window.__frames;
    const gaps = [];
    for (let i = 1; i < f.length; i++) gaps.push(f[i] - f[i - 1]);
    gaps.sort((a, b) => a - b);
    const pct = (q) => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(q * (gaps.length - 1)))] : 0;
    return { n: gaps.length, p50: pct(0.5), p95: pct(0.95), max: gaps[gaps.length - 1] ?? 0 };
  });
  const after = await p.evaluate(() => {
    const d = window.__declare; const cs = (d.find("app.wins").children) || [];
    for (const w of cs) if (w.constructor && w.constructor.name === "JotWindow") return Math.round(w.width);
    return 0;
  });
  await b.close();
  const budget = r.p50 * 1.5;
  return { mode, ...r, budget, long: 0, widthBefore: corner[2], widthAfter: after, errs: errs.slice(0, 2) };
}

console.log("\n  renderer   frames  median   p95      max     resized");
console.log("  " + "─".repeat(58));
for (const m of MODES) {
  const r = await run(m);
  if (r.error) { console.log(`  ${m.padEnd(10)} ${r.error}`); continue; }
  console.log(`  ${m.padEnd(10)} ${String(r.n).padStart(5)}  ${r.p50.toFixed(1).padStart(6)}ms ${r.p95.toFixed(1).padStart(7)}ms ${r.max.toFixed(1).padStart(8)}ms   ${r.widthBefore}→${r.widthAfter}`);
  if (r.errs.length) console.log(`             page errors: ${r.errs.join(" | ")}`);
}
console.log();
