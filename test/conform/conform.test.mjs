// Behavioural conformance — the same program, the same semantic input, three
// renderers, and the LANGUAGE's answers compared directly.
//
//   npm run test:conform            DOM + canvas (+ Mac, if a host is running)
//
// OPT-IN, never per-commit: the third column needs the native host launched with
// DECLARE_CONTROL=1 and a window server. Without it the run says so and proves
// two thirds rather than quietly claiming three.
//
// WHY BEHAVIOUR AND NOT PIXELS. The visual axis is already covered, in two
// halves that meet in the middle: `perceptual` holds DOM and canvas to each
// other (near-equality — both rasterize with Skia), and `mac-host/gate.mjs`
// holds the native renderer to the DOM one (baselined, because Core Text will
// never match Skia glyph for glyph). What neither can do is say WHAT diverged.
// `parity.mjs` drives a script on two hosts and then pixel-diffs the end state,
// so a routing bug arrives as "43% differing" — true, and useless.
//
// Asked instead of looked at, the same divergence names itself: a view path, a
// slot, a value. And it needs no tolerance. Text metrics differ between
// rasterizers, so measured geometry legitimately differs and is compared with a
// tolerance or not at all — but "which view took this press", "what does this
// slot hold", "where did this scroll land" are the language's own answers, and
// they must be IDENTICAL. A backend that disagrees is wrong, not different.
//
// The corpus is the seam probes (test/probe/*.declare), which exist precisely
// because each puts one Surface capability in a state where its absence shows.

import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { test, summarize } from "../harness.mjs";
import http from "node:http";
import { createDeclareServer } from "../../server/create.mjs";
import { browserDriver, macDriver, macRequested, macLive } from "./driver.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Port 0 = let the OS pick a free one. A fixed default collides with whatever
// dev servers a developer already has up, and a conformance run failing to bind
// reads like a conformance failure.
const PORT = Number(process.env.CONFORM_PORT ?? 0);
let ORIGIN = process.env.DECLARE_ORIGIN ?? "";

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

// The native host renders at a fixed 1280×800 content box (fidelity.mjs's W/H),
// so the browsers are opened at the same size — conformance compares programs,
// never window managers.
const W = 1280, H = 800;

// Requested, never inferred (driver.mjs macRequested).
const MAC = macRequested();

// The caller owns the http.Server (create.mjs's contract), so the conformance
// run brings its own on a private port rather than assuming a dev server.
let server = null;
if (!process.env.DECLARE_ORIGIN) {
  const declare = createDeclareServer({});
  server = http.createServer(declare.handler);
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  ORIGIN = `http://127.0.0.1:${server.address().port}`;
}

// Asked for but absent is an ERROR, not a skip: a run told to prove three
// renderers must never quietly prove two. Checked here, once the origin exists,
// so the message can name the command that fixes it.
if (MAC && !macLive()) {
  console.error("conform: --mac was requested but no native host is running.\n" +
    "  DECLARE_CONTROL=1 '/tmp/Declare Mac.app/Contents/MacOS/Declare Mac' &\n" +
    "  (any origin — the run navigates it to " + ORIGIN + " itself)");
  if (server) server.close();
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true, args: ["--no-sandbox"],
  defaultViewport: { width: W, height: H },
  // `Input.dispatchMouseEvent` for a wheel can outlast the 30s default while
  // the compositor settles a momentum scroll; the conformance run drives real
  // wheels deliberately, so it gives the protocol room rather than reading a
  // client-side timeout as a backend disagreement.
  protocolTimeout: 120000,
});

/** Open one program on every available host and hand back their drivers. */
async function hosts(program) {
  const url = `${ORIGIN}/${program}`;
  const out = [];
  for (const render of ["dom", "canvas"]) {
    const page = await browser.newPage();
    await page.goto(`${url}?render=${render}`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForFunction(() => globalThis.__declare !== undefined, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1200));
    out.push(browserDriver(page, render));
  }
  if (MAC) {
    const mac = macDriver();
    await mac.open(url);
    out.push(mac);
  }
  return out;
}

const close = async (hs) => { for (const h of hs) if (h.label !== "mac") await h.page?.close?.(); };

/** Run one script on every host, ask one question, and require identical
 *  answers. The DOM is the reference only for reporting — a disagreement is a
 *  disagreement, and naming which host is "right" is the reader's job. */
async function conform(program, script, question, label) {
  const hs = await hosts(program);
  const answers = [];
  for (const h of hs) {
    await h.focus?.();
    for (const step of script) await h.drive(step);
    await new Promise((r) => setTimeout(r, 400));
    answers.push({ host: h.label, value: await h.ask(question) });
  }
  for (const h of hs) if (h.label !== "mac") await h.page?.close?.();
  compare(label, answers);
  return { answers, hosts: hs.map((h) => h.label) };
}


// ── KNOWN DIVERGENCES ───────────────────────────────────────────────────────
// A conformance gate that stays red teaches people to ignore it, and one that
// quietly drops a failing case teaches nothing at all. So a divergence that is
// UNDERSTOOD is recorded here with its reason, and the suite holds it to that
// exact value: it passes while the gap is what we said it is, and fails the
// moment it changes — including when it CLOSES, so the entry gets removed
// rather than outliving the bug. Same discipline as gate.mjs's annotated
// baselines and test/seam.test.mjs's table.
const SKIP = Symbol("not proven on this host");
const KNOWN = {
  /* EMPTY, and the emptiness is the point: every divergence found by this
     suite so far has been fixed rather than recorded. The longest-lived one —
     keyboard focus on the native host — is worth its history, because five
     successive diagnoses were wrong before counters replaced inference:

       · keyboard navigation had never been wired natively at all (boot.ts's
         wiring was believed skipped for a `chrome` host);
       · then a re-registration per boot was blamed — partly right, wrongly
         located;
       · then AppKit's responder chain — wrong, and retracted (the `key` verb
         bypasses NSEvent entirely);
       · then the control channel's read-then-clear race — real, fixed (the
         host now takes the inbox by atomic rename), but not this bug;
       · the truth, measured as nextCalls = 9, 16, 25, 36 across four boots:
         wireInput runs per mount, and neither Keys.listen nor deliverKeys was
         re-entrant, so N mounts stacked N listeners × N delivery handlers and
         one Tab advanced focus N² times — N²'s PARITY alternating per boot,
         which is what made it read as a coin toss for two days.

     The fix is in the runtime, where it belongs: `listen` is idempotent per
     target (a repeat call replaces the liveness probe), `deliverKeys` is once
     per service pair. A browser could never see this bug — one document, one
     mount; a long-lived host re-mounts forever. That asymmetry is exactly what
     this suite exists to catch. */
};

/** Hold every host to the reference answer, except where a divergence is
 *  recorded — then hold it to the recorded value instead, and say so. */
function compare(label, answers) {
  const ref = answers[0];
  const refText = JSON.stringify(ref.value);
  for (const a of answers.slice(1)) {
    const text = JSON.stringify(a.value);
    const gap = KNOWN[label]?.[a.host];
    if (gap === SKIP) {
      console.log(`    ⚠ ${a.host}: NOT PROVEN — ${text}  (see KNOWN["${label}"])`);
      continue;
    }
    if (gap !== undefined) {
      assert.equal(text, gap,
        `${label}: ${a.host}'s divergence CHANGED — the recorded gap no longer describes it.\n` +
        `    recorded: ${gap}\n    now:      ${text}\n` +
        `    If it closed, delete the KNOWN entry. If it moved, re-describe it.\n` +
        `    why: ${KNOWN[label].why}`);
      console.log(`    ⚠ ${a.host}: known gap — ${text} (see KNOWN["${label}"])`);
      continue;
    }
    assert.equal(text, refText,
      `${label}: ${a.host} disagrees with ${ref.host}\n` +
      `    ${ref.host}: ${refText}\n    ${a.host}: ${text}`);
  }
}

// ── the pins ────────────────────────────────────────────────────────────────

await test("conform: a press resolves to the same view on every renderer", async () => {
  // The hit walk is backend-neutral code, but each backend feeds it its own
  // geometry — which is exactly where this session's bugs lived (a missing
  // scroll term, chrome stranded in the wrong parent). explainHit answers with
  // a view PATH, so a disagreement names the view instead of a percentage.
  const r = await conform("test/probe/ignorescroll.declare", [],
    `__declare.explainHit(200, 10).hit`, "press resolution");
  assert.equal(r.answers[0].value, "app.pane.chrome", "the pinned chrome takes the point");
  console.log(`    hosts agreeing: ${r.hosts.join(", ")}`);
});

// ── transforms ──────────────────────────────────────────────────────────────
// Until 2026-08-14 nothing in this corpus set `scale` or `rotation`, so the one
// gate that holds three renderers together never asked whether they agree about
// a TRANSFORMED hit. That gap was not theoretical: the same day, moving a DOM
// box's position into its transform left `throughTransforms` inverting scale and
// rotation but not the new translate, and every localized point came out short
// by posX/k. A single desktop-input assertion caught it, and only because that
// window happened to sit at a non-zero position.
//
// The points below are chosen so that a backend which IGNORES the transform
// gives a DIFFERENT answer, not merely a less precise one — an axis-aligned
// bounding-box test hits where the rotated shape does not, and vice versa.
// `test/probe/rotation.declare` supplies the geometry: `turn` is 100x100 at
// (40,60) turned 30° about its centre; `unit` is the same box at (180,60)
// scaled 0.8 AND turned 45°, carrying a child at (25,25) 50x50.

await test("conform: a rotated view's own hit shape agrees on every renderer", async () => {
  // (90,110) is the pivot — inside under any reading, so this pins that the
  // rotated view is reachable at all before the sharper question below.
  const r = await conform("test/probe/rotation.declare", [],
    `__declare.explainHit(90, 110).hit`, "rotated view: centre");
  assert.equal(r.answers[0].value, "app.turn", "the turned square takes its own centre");
  console.log(`    hosts agreeing: ${r.hosts.join(", ")}`);
});

await test("conform: a point inside the AABB but outside the TURN misses, everywhere", async () => {
  // The discriminating one. (25,45) sits inside the turned square's axis-aligned
  // bounding box (21.7,41.7)-(158.3,178.3) and outside the square itself —
  // inverse-rotating it lands at x=1.2, well left of the view's own box. A
  // backend testing the AABB reports `app.turn`; one that honours the rotation
  // reports the App. Both are self-consistent, which is exactly why only a
  // cross-renderer comparison finds the disagreement.
  const r = await conform("test/probe/rotation.declare", [],
    `__declare.explainHit(25, 45).hit`, "rotated view: AABB corner");
  assert.equal(r.answers[0].value, "app",
    "a corner of the bounding box is NOT inside the turned square");
});

await test("conform: a hit descends through a scaled AND rotated parent, everywhere", async () => {
  // `unit` composes both terms, so this catches an inverse that undoes one and
  // forgets the other — the shape of the bug fixed on the DOM side. (230,127)
  // is the child's own (245,125) carried forward through scale 0.8 then 45°.
  const r = await conform("test/probe/rotation.declare", [],
    `__declare.explainHit(230, 127).hit`, "scaled+rotated parent: child");
  assert.match(String(r.answers[0].value), /^app\.unit\b/,
    "the point resolves INTO the transformed subtree, not to the App behind it");
});

await test("conform: the transform actually MOVES the hit shape, everywhere", async () => {
  // (195,75) is inside `unit`'s box as authored and outside it once scaled and
  // turned. A backend that never applied the transform to its hit geometry —
  // the exact failure the native host had for `ignoreScroll`, found by absence —
  // answers `app.unit` here. Every renderer must answer the App.
  const r = await conform("test/probe/rotation.declare", [],
    `__declare.explainHit(195, 75).hit`, "scaled+rotated parent: vacated point");
  assert.equal(r.answers[0].value, "app",
    "the untransformed box is vacated — nothing is there once the view is scaled and turned");
});

await test("conform: a DECLARED scroll offset lands identically on every renderer", async () => {
  // The offset is the program's, not the platform's: `scrollY = 120` must put
  // the same content in the same place whether a browser scroller, a canvas
  // compositor offset, or a CALayer bounds shift realizes it. (This is the slot
  // whose initial value never landed at all until 2026-07-31.)
  await conform("test/probe/ignorescroll.declare", [],
    `__declare.inspect("app.pane").attrs.scrollY ?? __declare.find("app.pane").scrollY`,
    "declared scroll offset");
});

await test("conform: what a scroll MOVES is the same on every renderer", async () => {
  // Driving the platform's own scroll and then asking where the content ended
  // up — the routing question `parity.mjs` could only answer as a pixel count.
  const r = await conform("test/probe/ignorescroll.declare",
    [["scroll", 200, 120, 200, 0], ["wait", 0.6]],
    `__declare.find("app.pane").scrollY`, "scroll routing");
  console.log(`    landed at: ${r.answers.map((a) => `${a.host}=${a.value}`).join("  ")}`);
});

await test("conform: an onWheel CLAIM hears its stream on every renderer", async () => {
  // The routing the visual gates cannot see (a wired and an unwired host
  // render identically at rest): a wheel over the claimant delivers to its
  // handler — same delta, same count — and the browser/compositor/host
  // scroller machinery all stand aside. Until 2026-08-06 the native host
  // routed EVERY wheel straight to the scrollers; this is the pin that
  // keeps the claim walk (`macWheel`) from silently regressing to that.
  const r = await conform("test/probe/wheelclaim.declare",
    [["scroll", 100, 60, 60, 0], ["wait", 0.4]],
    `(() => { const z = __declare.find("app.zoomer"); return { hits: z.hits, dy: z.wdy, pinch: z.wpinch }; })()`,
    "wheel claim delivery");
  assert.equal(r.answers[0].value.hits, 1, "the claimant heard exactly one wheel");
  assert.equal(r.answers[0].value.dy, 60, "the delta arrived unscaled");
});

await test("conform: a scroller nested INSIDE the claimant keeps its own wheel", async () => {
  // The delegation walk's other half: the nearer scroller wins, the claimant
  // hears nothing, the pane moves — identically on all three.
  const r = await conform("test/probe/wheelclaim.declare",
    [["scroll", 120, 170, 60, 0], ["wait", 0.5]],
    `(() => { const z = __declare.find("app.zoomer"); return { hits: z.hits, paneY: Math.round(z.pane.scrollY) }; })()`,
    "wheel delegation to the nested scroller");
  assert.equal(r.answers[0].value.hits, 0, "the claimant never heard the pane's wheel");
  assert.ok(r.answers[0].value.paneY > 0, "the pane scrolled");
});

await test("conform: a desktop PINCH arrives on the wheel stream with `pinch` set, everywhere", async () => {
  // gestures.md's desktop contract, now three-way: Chrome spells trackpad
  // pinch as ctrl+wheel; the native host spells magnify(with:) the same way
  // (App.swift), so `e.pinch` zoom math ports between them unchanged.
  const r = await conform("test/probe/wheelclaim.declare",
    [["scroll", 100, 60, -40, 0, true], ["wait", 0.4]],
    `(() => { const z = __declare.find("app.zoomer"); return { dy: z.wdy, pinch: z.wpinch }; })()`,
    "pinch-as-wheel");
  assert.equal(r.answers[0].value.pinch, true, "the pinch flag arrived");
  assert.equal(r.answers[0].value.dy, -40, "zoom-in is a negative delta");
});

await test("conform: the walk's REASONING agrees, not just its answer", async () => {
  // Two backends can agree on the hit and disagree about why — one skipping a
  // view for being invisible where another never reached it. The narration is
  // the stronger assertion, and it is free now that all three hosts answer it.
  await conform("test/probe/ignorescroll.declare", [],
    `__declare.explainHit(200, 10).steps.map(s => s.path + " :: " + s.why)`,
    "hit-walk reasoning");
});


// ── GEOMETRY: does the program lay out the same everywhere? ─────────────────
// A category the visual gates cannot isolate. A pixel diff conflates "this box
// is 3px wider" with "this glyph rasterized differently", and the second is
// permanent — Core Text and Skia will never agree glyph for glyph. Asked
// structurally the two separate cleanly: the tree's SHAPE (paths, kinds,
// nesting) must be identical, and each box's geometry must agree within a
// tolerance that text measurement can explain and a layout bug cannot.

const TREE = `(() => {
  const walk = (n) => ({ path: n.path, kind: n.kind,
    x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.width), h: Math.round(n.height),
    rx: Math.round(n.rootX), ry: Math.round(n.rootY),
    kids: n.children.map(walk) });
  return walk(__declare.inspect());
})()`;

/** Flatten a tree snapshot to path → box. */
function boxes(node, out = new Map()) {
  out.set(node.path, node);
  for (const k of node.kids) boxes(k, out);
  return out;
}

await test("conform: the tree's SHAPE is identical on every renderer", async () => {
  // Structure carries no measurement, so it admits no tolerance at all: same
  // paths, same kinds, same nesting, or a backend is building a different
  // program.
  const hs = await hosts("test/probe/ignorescroll.declare");
  const shapes = [];
  for (const h of hs) {
    const t = await h.ask(TREE);
    const shape = [...boxes(t).values()].map((n) => `${n.path}:${n.kind}`).sort().join("\n");
    shapes.push({ host: h.label, shape, n: boxes(t).size });
  }
  await close(hs);
  for (const s2 of shapes.slice(1)) {
    assert.equal(s2.shape, shapes[0].shape, `${s2.host} builds a different tree than ${shapes[0].host}`);
  }
  console.log(`    ${shapes[0].n} nodes, identical across ${shapes.map((x) => x.host).join(", ")}`);
});

await test("conform: every box lands in the same place, within text-measurement tolerance", async () => {
  // 2px: enough to absorb a rounded ascent or an advance-width difference on an
  // auto-sized run, far too little to hide a layout bug — a wrong scroll term
  // or a missed offset moves things by tens or hundreds.
  const TOL = 2;
  const hs = await hosts("test/probe/ignorescroll.declare");
  const snaps = [];
  for (const h of hs) snaps.push({ host: h.label, box: boxes(await h.ask(TREE)) });
  await close(hs);
  const ref = snaps[0];
  const bad = [];
  for (const s2 of snaps.slice(1)) {
    for (const [pathKey, a] of ref.box) {
      const b = s2.box.get(pathKey);
      if (b === undefined) continue;
      for (const f of ["x", "y", "w", "h", "rx", "ry"]) {
        if (Math.abs(a[f] - b[f]) > TOL) bad.push(`${pathKey}.${f}: ${ref.host}=${a[f]} ${s2.host}=${b[f]}`);
      }
    }
  }
  assert.deepEqual(bad, [], `geometry diverges beyond ${TOL}px:\n    ` + bad.join("\n    "));
  console.log(`    ${ref.box.size} boxes agree within ${TOL}px across ${snaps.map((x) => x.host).join(", ")}`);
});

// ── KEYBOARD / FOCUS ────────────────────────────────────────────────────────
// The third input modality, and the one with no conformance coverage anywhere:
// `desktop-input` drives the pointer, `gesture` drives touch, nothing drives
// keys across renderers. The native host routes them through its own responder
// chain and the browser through the DOM's, converging on the same Focus service
// — exactly the shape where two implementations drift quietly.

await test("conform: keyboard focus advances identically on every renderer", async () => {
  // KEYBOARD ONLY, deliberately. Click-to-focus is excluded from the native
  // column because Control.swift injects at `__declarePointer` and says so:
  // that path "does not exercise NSEvent delivery, tracking areas or the
  // responder chain" — and a native NSTextField's focus IS the responder
  // chain. Driving it there would test the injection seam, not the program.
  // Tab advancement runs through the language's own Focus service on every
  // host, which is the thing conformance is about.
  const hs = await hosts("test/probe/editable.declare");
  const answers = [];
  for (const h of hs) {
    await h.focus?.();
    // Let the editables exist before asking the focus service to traverse them.
    // A native field is created on the far side of a command buffer, so it is
    // not focusable the instant the tree settles — Tabbing too early traverses
    // a shorter sequence and lands somewhere legitimate but different, which
    // reads exactly like a focus bug.
    await h.drive(["wait", 1.5]);
    const seen = [];
    for (let i = 0; i < 3; i++) {
      await h.drive(["key", "Tab"]);
      await h.drive(["wait", 0.35]);
      seen.push(await h.ask(`__declare.inspect("app.filled").attrs.focused === true ? "filled" : __declare.inspect("app.empty").attrs.focused === true ? "empty" : "none"`));
    }
    answers.push({ host: h.label, value: JSON.stringify(seen) });
  }
  await close(hs);
  compare("focus order", answers.map((a) => ({ host: a.host, value: JSON.parse(a.value) })));
  console.log(`    Tab order ${answers[0].value} on ${answers[0].host}`);
});

if (!MAC) {
  console.log("\n  DOM and canvas only. Add --mac (or CONFORM_MAC=1) with a native host running");
  console.log("  to prove the third renderer too.\n");
}

await browser.close();
if (server?.close) server.close();
summarize("conform");
