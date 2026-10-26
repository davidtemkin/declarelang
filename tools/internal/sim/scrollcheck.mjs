// tools/internal/sim/scrollcheck.mjs — the iOS CROSS-CHECK for the user's
// scroll (test/scroll-reach.test.mjs). That suite is the standard: Chrome, its
// gesture synthesizer, the verify driver. This runs the same page (scrolllab)
// under real fingers on a booted simulator — XCUITest touches, which WebKit
// scrolls natively — and reads what the page saw, frame by frame, so the model
// the driver and the runtime assume can be checked against WebKit's. Not part
// of the suite and not agent-facing (DIAG-adjacent, like regress.mjs).
//
//   node scrollcheck.mjs <sessionId> [serverBase]
//
// Needs the dev server (default http://127.0.0.1:8300) and an Appium Safari
// session (drive.mjs header recipe; Xcode 27: "appium:isHeadless": true).

const [sid, baseArg] = process.argv.slice(2);
if (!sid) { console.error("usage: node scrollcheck.mjs <sessionId> [base]"); process.exit(2); }
const A = `http://127.0.0.1:4723/session/${sid}`;
const BASE = baseArg || "http://127.0.0.1:8300";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(path, body) {
  const r = await fetch(A + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const j = await r.json();
  if (j.value && j.value.error) throw new Error(`${j.value.error}: ${j.value.message}`);
  return j.value;
}
const js = (script) => post("/execute/sync", { script, args: [] });
const jsj = async (script) => JSON.parse(await js(script));
async function go(path) {
  const url = BASE + path;
  await js(`location.href = ${JSON.stringify(url)}; return 1`);
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try { if (await js("return document.readyState === 'complete' && window.__declare ? location.href : ''") === url) break; } catch { /* changing pages */ }
  }
  await sleep(1500);
}
const finger = (actions) => post("/actions", { actions: [{ type: "pointer", id: "f1", parameters: { pointerType: "touch" }, actions }] });
const tap = (x, y) => finger([{ type: "pointerMove", duration: 0, x: Math.round(x), y: Math.round(y) }, { type: "pointerDown", button: 0 }, { type: "pause", duration: 70 }, { type: "pointerUp", button: 0 }]);
// a person's swipe: down, travel at a steady pace, a beat, up (no fling)
const swipe = (x, y, x2, y2, ms = 400) => finger([
  { type: "pointerMove", duration: 0, x: Math.round(x), y: Math.round(y) }, { type: "pointerDown", button: 0 },
  { type: "pointerMove", duration: ms, x: Math.round(x2), y: Math.round(y2) }, { type: "pause", duration: 120 }, { type: "pointerUp", button: 0 }]);
const fling = (x, y, x2, y2) => finger([
  { type: "pointerMove", duration: 0, x: Math.round(x), y: Math.round(y) }, { type: "pointerDown", button: 0 },
  { type: "pointerMove", duration: 90, x: Math.round(x2), y: Math.round(y2) }, { type: "pointerUp", button: 0 }]);

// THE PAGE'S OWN RECORD: `userScrolling` and the page offset every frame, with the
// time — read back after a gesture, so nothing depends on sampling mid-action
const trace = () => js(`window.__t = []; const t0 = performance.now();
  const f = () => { const a = window.__declare.find("app"); window.__t.push([Math.round(performance.now() - t0), a.userScrolling ? 1 : 0, Math.round(scrollY)]); if (window.__t.length < 900) requestAnimationFrame(f); };
  requestAnimationFrame(f); return 1`);
const traced = () => jsj("return JSON.stringify(window.__t)");
const runs = (t) => { const out = []; let from = null; for (const [ms, on] of t) { if (on && from === null) from = ms; if (!on && from !== null) { out.push([from, ms]); from = null; } } if (from !== null) out.push([from, null]); return out; };
const where = (path) => jsj(`const d = window.__declare, n = d.find(${JSON.stringify(path)}); const p = d.rootPoint(${JSON.stringify(path)}, n.width / 2, n.height / 2); return JSON.stringify(p)`);

let fails = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "ok  " : "FAIL"} — ${name}${detail ? `\n       ${detail}` : ""}`); if (!ok) fails++; };

await go("/tools/internal/sim/scrolllab.declare");

// CALIBRATION: native point y = page client y + OFF (Safari's chrome above the page)
await js(`window.__cal = null; addEventListener("touchstart", (e) => { window.__cal = e.touches[0].clientY; }, { once: true, capture: true }); return 1`);
await tap(200, 500);
await sleep(300);
const calY = await js("return window.__cal");
const OFF = calY == null ? 62 : 500 - calY;
console.log(`calibration: native y = client y + ${OFF}${calY == null ? " (default — the tap was not heard)" : ""}`);
const view = await jsj("return JSON.stringify({ w: innerWidth, h: innerHeight })");

// 1. a native swipe scrolls the page, `userScrolling` is on while it lasts, and off after
{
  await trace();
  await swipe(200, 650 + OFF - 62, 200, 250 + OFF - 62);
  await sleep(1500);
  const t = await traced(), r = runs(t), moved = t[t.length - 1][2] - t[0][2];
  const restAt = (() => { for (let i = t.length - 1; i > 0; i--) if (t[i][2] !== t[i - 1][2]) return t[i][0]; return 0; })();
  const off = r.length > 0 ? r[r.length - 1][1] : null;
  check("a finger's swipe scrolls the page natively; `userScrolling` is on while it moves and falls when it rests", moved > 100 && off !== null && off - restAt < 700,
    `moved ${moved} px; last movement at ${restAt} ms; scrolling runs (ms): ${JSON.stringify(r)}`);
}

// 2. a fling: momentum after the lift keeps `userScrolling` on, and it ends when the page comes to rest
{
  await trace();
  await fling(200, 650 + OFF - 62, 200, 350 + OFF - 62);
  await sleep(3500);
  const t = await traced(), r = runs(t);
  const restAt = (() => { for (let i = t.length - 1; i > 0; i--) if (t[i][2] !== t[i - 1][2]) return t[i][0]; return 0; })();
  const off = r.length > 0 ? r[r.length - 1][1] : null;
  check("a fling's momentum is the user's scroll, and the fact falls when the page rests (not at a 3 s backstop)",
    off !== null && off >= restAt - 50 && off - restAt < 700, `last movement at ${restAt} ms; scrolling runs ${JSON.stringify(r)}`);
}

// 3. the clamp after a tap: swipe down to Collapse, tap it, and the page's clamp is not the user's scroll
{
  for (let i = 0; i < 8; i++) {
    const p = await where("app.col.collapse");
    if (p.y > 120 && p.y < view.h - 140) break;
    await swipe(30, 650 + OFF - 62, 30, 250 + OFF - 62);   // at the left edge: the page, not the pane
    await sleep(900);
  }
  const p = await where("app.col.collapse");
  await sleep(600);
  await trace();
  await tap(p.x, p.y + OFF);
  await sleep(1200);
  const t = await traced(), r = runs(t), clamped = t[0][2] - t[t.length - 1][2];
  const open = await js(`return window.__declare.find("app").open`);
  check("a tap that shrinks the page: the clamp that follows does not turn `userScrolling` on",
    open === false && r.length === 0, `collapsed: ${open === false}; page clamped by ${clamped} px; scrolling runs ${JSON.stringify(r)}`);
}

// 4. a swipe begun over the pane inside the page scrolls the pane, not the page
{
  await go("/tools/internal/sim/scrolllab.declare");
  for (let i = 0; i < 6; i++) {
    const p = await where("app.col.pane");
    if (p.y > 250 && p.y < view.h - 250) break;
    await swipe(30, 650 + OFF - 62, 30, 350 + OFF - 62);
    await sleep(900);
  }
  const p = await where("app.col.pane");
  const before = await jsj(`return JSON.stringify([scrollY, window.__declare.find("app.col.pane").scrollY])`);
  await swipe(p.x, p.y + OFF + 60, p.x, p.y + OFF - 60, 300);
  await sleep(1200);
  const after = await jsj(`return JSON.stringify([scrollY, window.__declare.find("app.col.pane").scrollY])`);
  check("a swipe that starts over the pane belongs to the pane", after[1] > before[1] + 20 && Math.abs(after[0] - before[0]) < 5,
    `page ${before[0]} → ${after[0]}, pane ${before[1]} → ${after[1]}`);
}

console.log(fails === 0 ? "scrollcheck: all agree" : `scrollcheck: ${fails} disagree`);
process.exit(fails === 0 ? 0 : 1);
