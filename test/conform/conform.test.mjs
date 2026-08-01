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
// The corpus is the seam probes (apps/probe/*.declare), which exist precisely
// because each puts one Surface capability in a state where its absence shows.

import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { test, summarize } from "../harness.mjs";
import http from "node:http";
import { createDeclareServer } from "../../server/create.mjs";
import { browserDriver, macDriver, macAvailable } from "./driver.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.CONFORM_PORT ?? 8272);
const ORIGIN = process.env.DECLARE_ORIGIN ?? `http://127.0.0.1:${PORT}`;

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

// The caller owns the http.Server (create.mjs's contract), so the conformance
// run brings its own on a private port rather than assuming a dev server.
let server = null;
if (!process.env.DECLARE_ORIGIN) {
  const declare = createDeclareServer({});
  server = http.createServer(declare.handler);
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
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
  if (macAvailable()) {
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
  const ref = JSON.stringify(answers[0].value);
  for (const a of answers.slice(1)) {
    assert.equal(JSON.stringify(a.value), ref,
      `${label}: ${a.host} disagrees with ${answers[0].host}\n` +
      `    ${answers[0].host}: ${ref}\n    ${a.host}: ${JSON.stringify(a.value)}`);
  }
  return { answers, hosts: hs.map((h) => h.label) };
}

// ── the pins ────────────────────────────────────────────────────────────────

await test("conform: a press resolves to the same view on every renderer", async () => {
  // The hit walk is backend-neutral code, but each backend feeds it its own
  // geometry — which is exactly where this session's bugs lived (a missing
  // scroll term, chrome stranded in the wrong parent). explainHit answers with
  // a view PATH, so a disagreement names the view instead of a percentage.
  const r = await conform("apps/probe/ignorescroll.declare", [],
    `__declare.explainHit(200, 10).hit`, "press resolution");
  assert.equal(r.answers[0].value, "app.pane.chrome", "the pinned chrome takes the point");
  console.log(`    hosts agreeing: ${r.hosts.join(", ")}`);
});

await test("conform: a DECLARED scroll offset lands identically on every renderer", async () => {
  // The offset is the program's, not the platform's: `scrollY = 120` must put
  // the same content in the same place whether a browser scroller, a canvas
  // compositor offset, or a CALayer bounds shift realizes it. (This is the slot
  // whose initial value never landed at all until 2026-07-31.)
  await conform("apps/probe/ignorescroll.declare", [],
    `__declare.inspect("app.pane").attrs.scrollY ?? __declare.find("app.pane").scrollY`,
    "declared scroll offset");
});

await test("conform: what a scroll MOVES is the same on every renderer", async () => {
  // Driving the platform's own scroll and then asking where the content ended
  // up — the routing question `parity.mjs` could only answer as a pixel count.
  const r = await conform("apps/probe/ignorescroll.declare",
    [["scroll", 200, 120, 200, 0], ["wait", 0.6]],
    `__declare.find("app.pane").scrollY`, "scroll routing");
  console.log(`    landed at: ${r.answers.map((a) => `${a.host}=${a.value}`).join("  ")}`);
});

await test("conform: the walk's REASONING agrees, not just its answer", async () => {
  // Two backends can agree on the hit and disagree about why — one skipping a
  // view for being invisible where another never reached it. The narration is
  // the stronger assertion, and it is free now that all three hosts answer it.
  await conform("apps/probe/ignorescroll.declare", [],
    `__declare.explainHit(200, 10).steps.map(s => s.path + " :: " + s.why)`,
    "hit-walk reasoning");
});

if (!macAvailable()) {
  console.log("\n  note: no native host running — proved DOM and canvas only.");
  console.log("        Launch it to include the third column:");
  console.log("          DECLARE_CONTROL=1 DECLARE_ORIGIN=" + ORIGIN +
              " '/tmp/Declare Mac.app/Contents/MacOS/Declare Mac' &\n");
}

await browser.close();
if (server?.close) server.close();
summarize("conform");
