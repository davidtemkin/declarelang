// tools/internal/sim/regress.mjs — the FULL iOS gesture regression, driven
// against a booted simulator (DIAG-adjacent tooling, keep with drive.mjs).
// Everything the 2026-08-06 model validation measured, as one repeatable run:
// the touch-family books, the hold-gated claim, the scroll-takeover cancel,
// resolved-layer delivery (click/dblClick/hold), axis-scoped claims, flow
// selection, tap-to-stop, pinch survival — and the homepage regression pack
// (text pans, pinned navbar, double-tap, links). Aim points are computed
// LIVE from the DOM (never hardcoded): a press point is believed only after
// elementFromPoint confirms it — the hunt's hard-won rule.
//
//   node regress.mjs <sessionId> [serverBase]
//
// Exits non-zero on any failure. Needs the dev server running (default
// http://127.0.0.1:8300) and an Appium session (drive.mjs header recipe).

const [sid, baseArg, only] = process.argv.slice(2);
if (!sid) { console.error("usage: node regress.mjs <sessionId> [base]"); process.exit(2); }
const A = `http://127.0.0.1:4723/session/${sid}`;
const BASE = baseArg || "http://127.0.0.1:8300";
// Safari's top chrome in portrait: native-point y = client y + OFF (measured;
// see drive.mjs header — recalibrate with ?probe on a new device/orientation).
const OFF = 62;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(path, body) {
  const r = await fetch(A + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const j = await r.json();
  if (j.value && j.value.error) throw new Error(`${j.value.error}: ${j.value.message}`);
  return j.value;
}
const js = (script) => post("/execute/sync", { script, args: [] });
const jsj = async (script) => JSON.parse(await js(script));
async function go(path) { await post("/url", { url: BASE + path }); await sleep(2800); }

const finger = (seq, id = "f1") => ({ type: "pointer", id, parameters: { pointerType: "touch" }, actions: seq });
const seqDrag = (x, y, x2, y2, ms = 260) => [
  { type: "pointerMove", duration: 0, x, y }, { type: "pointerDown", button: 0 },
  { type: "pointerMove", duration: ms, x: x2, y: y2 }, { type: "pointerUp", button: 0 }];
const seqTap = (x, y) => [
  { type: "pointerMove", duration: 0, x, y }, { type: "pointerDown", button: 0 },
  { type: "pause", duration: 70 }, { type: "pointerUp", button: 0 }];
// The humanized double tap: 3px jitter and a ~170ms gap. Pixel-identical
// rapid synthetic taps trip iOS's OWN double-tap recognizer, which then
// swallows the second tap's pointer pair entirely (~measured 20-50% drop);
// jittered, human-paced taps delivered 10/10.
const seqDbl = (x, y) => [...seqTap(x, y), { type: "pause", duration: 170 },
  { type: "pointerMove", duration: 0, x: x + 3, y: y + 3 },
  { type: "pointerDown", button: 0 }, { type: "pause", duration: 55 }, { type: "pointerUp", button: 0 }];
const seqHold = (x, y, ms = 900) => [
  { type: "pointerMove", duration: 0, x, y }, { type: "pointerDown", button: 0 },
  { type: "pause", duration: ms }, { type: "pointerUp", button: 0 }];
const act = (...fingers) => post("/actions", { actions: fingers });
// SIMULATOR QUIRK (measured 2026-08-06): after a synthetic long-press —
// W3C pause-in-sequence AND native touchAndHold alike — the synthesis layer
// silently drops the NEXT continuous drag (zero events reach the page; taps
// and holds still deliver). A quick tap in between clears it. Real fingers
// have no such state; this is rig hygiene, not product behavior. Call after
// every hold-shaped gesture, aimed at inert chrome.
async function clearingTap(x = 200, y = 100) {
  await act(finger(seqTap(x, y)));
  await sleep(350);
}

/** Live aim point: the leaf whose text starts with `needle`, center of its
 *  first line, CONFIRMED by elementFromPoint — returns native coords. */
async function aim(needle) {
  const r = await jsj(`
    const s=[...document.querySelectorAll("span,div,p")].find(e=>e.childElementCount===0&&e.textContent.trim().startsWith(${JSON.stringify(needle)}));
    if(!s) return JSON.stringify(null);
    s.scrollIntoView({block:"center"});
    const r=s.getBoundingClientRect();
    const cx=Math.round(r.left+Math.min(r.width/2,130)), cy=Math.round(r.top+9);
    const hit=document.elementFromPoint(cx,cy);
    return JSON.stringify({cx,cy,ok:hit===s||s.contains(hit)||(hit&&hit.contains(s))});`);
  if (!r || !r.ok) throw new Error(`aim failed for "${needle}": ${JSON.stringify(r)}`);
  return { x: r.cx, y: r.cy + OFF, clientY: r.cy };
}
/** Aim at the nth <a> overlay (Declare link regions carry no text of their
 *  own, so text-matching cannot find them). */
async function aimLink(n) {
  const r = await jsj(`
    const a=document.querySelectorAll("a")[${n}];
    if(!a) return JSON.stringify(null);
    a.scrollIntoView({block:"center"});
    const r=a.getBoundingClientRect();
    return JSON.stringify({cx:Math.round(r.left+Math.min(r.width/2,100)),cy:Math.round(r.top+r.height/2)});`);
  if (!r) throw new Error(`aimLink(${n}) found no anchor`);
  return { x: r.cx, y: r.cy + OFF };
}
const app = (expr) => jsj(`const a=window.__declare.find("app"); return JSON.stringify(${expr});`);
const pageY = () => js("return Math.round(scrollY);");
const paneTop = () => js(`const p=[...document.querySelectorAll("div")].find(d=>d.clientHeight>0&&d.scrollHeight>d.clientHeight+10); return p?Math.round(p.scrollTop):-1;`);

let pass = 0, fail = 0;
const section = (name) => !only || only === name;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ok — ${name}`); }
  else { fail++; console.log(`  FAIL — ${name}  ${detail}`); }
}

// ── TouchLab: the pane lab ───────────────────────────────────────────────────
if (section("touchlab")) {
console.log("touchlab (pane lab)");
await go("/tools/internal/sim/touchlab.declare");
  const padAim = await aim("pad — onTouch*").then(a => ({ x: a.x + 40, y: a.y + 60 }));
  await act(finger(seqTap(padAim.x, padAim.y))); await sleep(500);
  let a = await app("({S:a.starts,M:a.moves,E:a.ends,C:a.cancels,down:a.down})");
  check("pad tap: books balance", a.S === 1 && a.E === 1 && a.C === 0 && a.down === 0, JSON.stringify(a));

  await act(finger(seqDrag(padAim.x - 40, padAim.y + 40, padAim.x + 60, padAim.y - 20))); await sleep(500);
  a = await app("({S:a.starts,M:a.moves,E:a.ends,C:a.cancels,down:a.down})");
  check("pad swipe: moves stream, clean end", a.S === 2 && a.M > 3 && a.E === 2 && a.C === 0 && a.down === 0, JSON.stringify(a));

  // two fingers, staggered lifts — the finger-leak law on a subtree claim
  await act(
    finger([...seqDrag(padAim.x - 50, padAim.y, padAim.x - 80, padAim.y + 50, 300), { type: "pause", duration: 180 }], "f1"),
    finger([{ type: "pointerMove", duration: 0, x: padAim.x + 50, y: padAim.y }, { type: "pointerDown", button: 0 },
      { type: "pointerMove", duration: 300, x: padAim.x + 80, y: padAim.y - 50 }, { type: "pause", duration: 180 }, { type: "pointerUp", button: 0 }], "f2"));
  await sleep(700);
  a = await app("({S:a.starts,E:a.ends,C:a.cancels,down:a.down})");
  const sc1 = await js("return visualViewport.scale;");
  check("pad two-finger staggered: books balance, no zoom", a.S === 4 && a.E === 4 && a.C === 0 && a.down === 0 && sc1 === 1, JSON.stringify(a) + " scale " + sc1);

  const chip = await aim("hold ");
  await act(finger(seqTap(chip.x, chip.y))); await sleep(500);
  let c = await jsj(`const c=window.__declare.find("app.pane.chip"); return JSON.stringify({taps:c.taps,held:c.held,gone:c.gone,drags:c.drags});`);
  check("chip tap: click coexists with the hold-gated claim", c.taps === 1 && c.held === 0 && c.gone === 0, JSON.stringify(c));

  const pt0 = await paneTop();
  await act(finger(seqDrag(chip.x, chip.y, chip.x, chip.y - 90, 120))); await sleep(900);
  c = await jsj(`const c=window.__declare.find("app.pane.chip"); return JSON.stringify({gone:c.gone,drags:c.drags});`);
  const pt1 = await paneTop();
  check("chip flick: scroll wins, canceled release delivered", c.gone === 1 && pt1 > pt0, JSON.stringify(c) + ` pane ${pt0}→${pt1}`);

  await js(`const p=[...document.querySelectorAll("div")].find(d=>d.clientHeight>0&&d.scrollHeight>d.clientHeight+10); p.scrollTop=0; return 1;`);
  await sleep(400);
  const chip2 = await aim("hold ");
  // the native press-then-drag (XCUITest dragFromToWithVelocity) — the W3C
  // pause-inside-a-pointer-sequence path proved flaky for hold recognition
  await post("/execute/sync", { script: "mobile: dragFromToWithVelocity", args: [{
    fromX: chip2.x, fromY: chip2.y, toX: chip2.x, toY: chip2.y - 60,
    pressDuration: 0.9, holdDuration: 0.1, velocity: 400 }] });
  await sleep(900);
  c = await jsj(`const c=window.__declare.find("app.pane.chip"); return JSON.stringify({held:c.held,drags:c.drags});`);
  const pt2 = await paneTop();
  check("chip hold-drag: claim beats scroll, drags delivered", c.held >= 1 && c.drags > 0 && pt2 === 0, JSON.stringify(c) + ` pane ${pt2}`);
}

if (section("touchlab")) {
  // the selection-edges fix (2026-08-06): a long-press on the GAP between
  // pad and pane — painted background — must select NOTHING (it used to hit
  // the selectable body and pop a Range over painted UI)
  await js("getSelection().removeAllRanges(); return 1;");
  const pad = await aim("pad — onTouch*");
  await act(finger(seqHold(pad.x, pad.y + 245, 1000))); // ~12px gap below the pad
  await sleep(700);
  const gapSel = await js("return getSelection().type;");
  check("gap long-press selects nothing (painted UI, none baseline)", gapSel !== "Range", "sel " + gapSel);
  await clearingTap();
}

// ── TouchLab-full: the full-claim App ───────────────────────────────────────
if (section("full")) {
console.log("touchlab-full (full gesture control)");
await go("/tools/internal/sim/touchlab-full.declare");
  await act(
    finger([...seqDrag(150, 350, 150, 450, 400), { type: "pause", duration: 200 }], "f1"),
    finger([{ type: "pointerMove", duration: 0, x: 250, y: 350 }, { type: "pointerDown", button: 0 },
      { type: "pointerMove", duration: 400, x: 250, y: 250 }, { type: "pause", duration: 200 }, { type: "pointerUp", button: 0 }], "f2"));
  await sleep(800);
  const a = await app("({S:a.starts,E:a.ends,C:a.cancels,down:a.down,peak:a.peak})");
  const sc = await js("return visualViewport.scale;");
  check("full claim, two-finger staggered spread: books balance, browser kept out",
    a.S === 2 && a.E === 2 && a.C === 0 && a.down === 0 && a.peak === 2 && sc === 1, JSON.stringify(a) + " scale " + sc);
}

// ── TouchLab-page: the page shape ───────────────────────────────────────────
if (section("page")) {
console.log("touchlab-page (page shape)");
await go("/tools/internal/sim/touchlab-page.declare");
  const clicky = await aim("click");
  await act(finger(seqTap(clicky.x, clicky.y))); await sleep(500);
  let a = await app("({c:a.clicks})");
  check("resolved layer: tap clicks", a.c === 1, JSON.stringify(a));

  const dbly = await aim("dbl");
  await act(finger(seqDbl(dbly.x, dbly.y))); await sleep(800);
  a = await app("({d:a.dbls})");
  const sc = await js("return visualViewport.scale;");
  check("resolved layer: double tap delivers, page does NOT zoom", a.d === 1 && sc === 1, JSON.stringify(a) + " scale " + sc);

  const holdy = await aim("hold");
  await act(finger(seqHold(holdy.x, holdy.y))); await sleep(500);
  a = await app("({h:a.holds})");
  check("resolved layer: hold fires", a.h === 1, JSON.stringify(a));
  await clearingTap();

  const dragy = await aim("drag (mine)");
  const y0 = await pageY();
  await act(finger(seqDrag(dragy.x, dragy.y, dragy.x, dragy.y - 90))); await sleep(700);
  a = await app("({m:a.dragM,u:a.dragUp,x:a.dragC})");
  check("immediate claim: moves delivered, page held still", a.m > 3 && a.u === 1 && a.x === 0 && (await pageY()) === y0, JSON.stringify(a));

  const dragx = await aim("x-drag");
  await act(finger(seqDrag(dragx.x + 30, dragx.y, dragx.x - 90, dragx.y))); await sleep(700);
  a = await app("({m:a.xM,u:a.xUp,x:a.xC})");
  check("claim=x, sideways: the app's axis", a.m > 3 && a.u === 1 && a.x === 0, JSON.stringify(a));

  const dragx2 = await aim("x-drag");
  const y1 = await pageY();
  await act(finger(seqDrag(dragx2.x, dragx2.y, dragx2.x, dragx2.y - 90))); await sleep(900);
  a = await app("({u:a.xUp,x:a.xC})");
  check("claim=x, vertical: the page's axis, canceled release", a.x === 1 && a.u === 1 && (await pageY()) !== y1, JSON.stringify(a));

  await js("getSelection().removeAllRanges(); return 1;");
  const prose = await aim("Press and");
  await act(finger(seqHold(prose.x, prose.y, 1000))); await sleep(700);
  const sel = await js("return getSelection().type;");
  check("flow species: long-press selects", sel === "Range", "sel " + sel);
  await clearingTap();

  await js("getSelection().removeAllRanges(); scrollTo(0,0); return 1;"); await sleep(400);
  const strip = await aim("strip 2");
  await act(finger(seqTap(strip.x, strip.y))); await sleep(500);
  a = await app("({s:a.stripT})");
  check("tap at rest clicks", a.s === 1, JSON.stringify(a));

  await act(finger([
    { type: "pointerMove", duration: 0, x: 200, y: 520 }, { type: "pointerDown", button: 0 },
    { type: "pointerMove", duration: 90, x: 200, y: 270 }, { type: "pointerUp", button: 0 },
    { type: "pause", duration: 250 }, ...seqTap(200, 400)]));
  await sleep(1400);
  a = await app("({s:a.stripT})");
  check("tap-to-stop clicks NOTHING (the scroll owns it)", a.s === 1, JSON.stringify(a));

  await act(
    finger(seqDrag(200, 430, 200, 560, 350), "f1"),
    finger(seqDrag(200, 330, 200, 200, 350), "f2"));
  await sleep(1000);
  const sc2 = await js("return visualViewport.scale;");
  check("unclaimed page: the user's pinch survives", sc2 > 1.15, "scale " + sc2);
}

// ── PinchLab: the recognized two-finger family (compositing.md §II.2) ───────
if (section("pinch")) {
console.log("pinchlab (the onPinch family)");
await go("/tools/internal/sim/pinchlab.declare");
  // two fingers spread INSIDE the pinch view (page y 100..520 → native +OFF)
  await act(
    finger([{ type: "pointerMove", duration: 0, x: 150, y: 350 }, { type: "pointerDown", button: 0 },
      { type: "pointerMove", duration: 400, x: 110, y: 350 }, { type: "pause", duration: 150 }, { type: "pointerUp", button: 0 }], "f1"),
    finger([{ type: "pointerMove", duration: 0, x: 230, y: 350 }, { type: "pointerDown", button: 0 },
      { type: "pointerMove", duration: 400, x: 300, y: 350 }, { type: "pause", duration: 150 }, { type: "pointerUp", button: 0 }], "f2"));
  await sleep(800);
  let a = await app("({S:a.pS,M:a.pM,E:a.pE,x:a.pX})");
  const psc = await js("return visualViewport.scale;");
  check("pinch claim: two fingers recognized, cumulative scale, browser kept out",
    a.S === 1 && a.M > 3 && a.E === 1 && a.x > 1.5 && psc === 1, JSON.stringify(a) + " scale " + psc);
  // one finger over the same view: pan stays the enclosing regime's
  const py0 = await pageY();
  await act(finger(seqDrag(200, 400, 200, 250)));
  await sleep(800);
  a = await app("({S:a.pS})");
  const py1 = await pageY();
  check("pinch claim narrows: one finger over the pinch view still pans the page",
    py1 !== py0 && a.S === 1, "y " + py0 + "→" + py1 + " " + JSON.stringify(a));
}

// ── Homepage: the regression pack ───────────────────────────────────────────
if (section("homepage")) {
console.log("homepage");
await go("/apps/homepage/");
  const para = await aim("Just as SQL");
  const y0 = await pageY();
  await act(finger(seqDrag(para.x, para.y, para.x, para.y - 90))); await sleep(900);
  const y1 = await pageY();
  check("prose pans (the solved EventRegion bug stays solved)", y1 !== y0, `pageY ${y0}→${y1}`);

  const head = await aim("is a UI language");
  const y2 = await pageY();
  await act(finger(seqDrag(head.x, head.y, head.x, head.y - 90))); await sleep(900);
  check("40px selectable headline pans", (await pageY()) !== y2, "");

  const bar0 = await jsj(`const f=[...document.querySelectorAll("div")].find(d=>getComputedStyle(d).position==="fixed"); return JSON.stringify(f?f.getBoundingClientRect().toJSON():null);`);
  await act(finger(seqDrag(385, 500, 385, 300))); await sleep(900);
  const bar1 = await jsj(`const f=[...document.querySelectorAll("div")].find(d=>getComputedStyle(d).position==="fixed"); return JSON.stringify(f?f.getBoundingClientRect().toJSON():null);`);
  check("ignoreScroll navbar stays pinned under page scroll",
    bar0 !== null && bar1 !== null && Math.abs(bar0.top - bar1.top) < 2, `top ${bar0 && bar0.top}→${bar1 && bar1.top}`);

  const para2 = await aim("Just as SQL");
  await act(finger(seqDbl(para2.x, para2.y))); await sleep(800);
  const sc = await js("return visualViewport.scale;");
  check("double-tap on prose does not zoom", sc === 1, "scale " + sc);

  await js("getSelection().removeAllRanges(); return 1;");
  const head2 = await aim("is a UI language");
  await act(finger(seqHold(head2.x, head2.y, 1000))); await sleep(700);
  const sel = await js("return getSelection().type;");
  check("long-press on selectable headline selects", sel === "Range", "sel " + sel);
  await clearingTap(380, 100);

  await go("/apps/homepage/"); // reset any selection/zoom state
  const link = await aimLink(0); // the "Why a new language, now?" arrow
  await act(finger(seqTap(link.x, link.y))); await sleep(1500);
  const loc = await js("return location.pathname+location.hash;");
  check("hero link navigates on a rested tap", loc.includes("#why"), loc);
}

console.log(`\nregress: ${pass} passed, ${fail} failed`);
if (fail === 0) {
  // Stamp the green run: run-gates compares the touch-input sources against
  // this hash and prints its advisory only when they have moved since
  // (the real-device pass is too heavy for routine gates — David, 2026-08-06).
  const { fileSet, setHash } = await import("../filesets.mjs");
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { resolve: rp, dirname: dn } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = rp(dn(fileURLToPath(import.meta.url)), "../../..");
  const IOS_INPUTS = ["runtime/src/input.ts", "runtime/src/dom-backend.ts",
    "runtime/src/canvas-backend.ts", "runtime/src/interaction.ts",
    "runtime/src/viewport-lock.ts",
    // by extension, matching run-gates: a bare dir would sweep node_modules
    // and the ever-growing appium.log, and the stamp would never go quiet
    { dir: "tools/internal/sim", ext: ".mjs" },
    { dir: "tools/internal/sim", ext: ".declare" }];
  const stamp = rp(ROOT, ".derive/ios-regress.json");
  mkdirSync(dn(stamp), { recursive: true });
  writeFileSync(stamp, JSON.stringify({ hash: setHash(ROOT, fileSet(ROOT, IOS_INPUTS)), at: new Date().toISOString() }, null, 1) + "\n");
  console.log("regress: stamped .derive/ios-regress.json — gates go quiet until the touch-input sources move");
}
process.exit(fail > 0 ? 1 : 0);
