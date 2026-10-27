// verify-behave — verify's rungs 5 and 6 (docs/system-design/verify-and-evals.md §2.4–§2.5):
// drive the compiled app with REAL input in a real browser, assert at the
// language's altitude (named views and attributes through the __declare
// bridge — never DOM selectors), with deterministic motion (the driven clock)
// and fixture data (no live network); and capture NAMED VISUAL STATES,
// compared against blessed baselines by in-page pixel diff (the perceptual
// suite's technique — the browser's own PNG decode, no Node-side dependency).
// Loaded lazily by tools/verify.mjs; also the eval harness's execution seam.

import http from "node:http";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, extname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sharedChrome } from "./chrome.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".png": "image/png",
  ".jpg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".woff": "font/woff", ".map": "application/json",
  ".declare": "text/plain", ".txt": "text/plain",
};

function findChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

/** The one failure type the runners report in the diagnostic register. */
export class VerifyAssertion extends Error {}

// ── the ephemeral host (shared by rungs 5 and 6) ────────────────────────────
// A static server over the repo tree (the app's <base> resolves its own data
// and resources), a fixtures overlay mapped over the app's base (verify NEVER
// touches live network, §2.6), one headless Chrome, and a host page embedding
// the ALREADY-built program — the dev server's own host-page shape.
//
// `built` runs a PRODUCTION build instead (declarec's files, built with
// `bridge: true` so the rungs can drive it): its files are served over the
// app's folder and its own index.html is the page — how the corpus gate
// proves a slimmed build behaves as the program does.

/** A request body, parsed when it is JSON. */
function parseBody(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  try { return JSON.parse(raw); } catch { return raw; }
}
/** Does `body` hold every field `want` names, with the same value (deeply)? */
function bodyHas(body, want) {
  if (want === null || typeof want !== "object") return body === want;
  if (body === null || typeof body !== "object") return false;
  return Object.entries(want).every(([k, v]) => bodyHas(body[k], v));
}

async function withHost({ compiled, appDir, fixturesDir = null, backendClass = "DomBackend", built = null, scrollbars = false, url = null }, fn) {
  const baseHref = "/" + relative(ROOT, resolve(appDir)).split("\\").join("/") + "/";
  const builtFiles = new Map((built?.files ?? []).map((f) => [f.name, f.contents]));
  const cfg = { backend: backendClass, program: compiled?.program ?? null };
  // The viewport meta is LOAD-BEARING: without it a mobile-sized emulation
  // renders the legacy 980px desktop layout viewport, so every phone assertion
  // silently measured a desktop — which falsified the mobile half of any
  // multi-viewport claim made through this harness.
  const hostPage = `<!doctype html><meta charset="utf-8"><title>verify</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${baseHref}">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
import { bootHost } from "/browser/host-client.js";
const cfg = ${JSON.stringify(cfg)};
// a program this one embeds (an AppIsland) is fetched beside it and compiled by
// this harness's server, as the dev server compiles one
cfg.islandBase = ${JSON.stringify(baseHref)};
cfg.compile = async (source, name, dir) => {
  const r = await fetch("/__verify__/compile", { method: "POST", body: JSON.stringify({ source, name, dir: dir || cfg.islandBase }) });
  return r.ok ? r.json() : null;
};
bootHost(cfg);
</script>`;

  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (pathname === "/__verify__/compile" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", async () => {
        try {
          const { source, name, dir } = JSON.parse(body);
          const { compile } = await import(pathToFileURL(join(ROOT, "compiler/dist/compile-node.js")).href);
          const file = join(ROOT, String(dir ?? baseHref), String(name) + ".declare");
          const r = await compile(source, { originDir: dirname(file) });
          const out = r.errors.length > 0 ? { report: r.errors.map((e) => e.message).join("\n") } : { program: r.program };
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(out));
        } catch (e) {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end(String(e?.message ?? e));
        }
      });
      return;
    }
    if (pathname === "/__verify__/" || pathname === "/__verify__/index.html") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(hostPage);
    }
    if (pathname.startsWith(baseHref) && builtFiles.has(pathname.slice(baseHref.length))) {
      res.writeHead(200, { "content-type": MIME[extname(pathname)] ?? "application/octet-stream" });
      return res.end(builtFiles.get(pathname.slice(baseHref.length)));
    }
    const candidates = [];
    if (fixturesDir !== null && pathname.startsWith(baseHref)) {
      candidates.push(join(resolve(fixturesDir), pathname.slice(baseHref.length)));
    }
    candidates.push(join(ROOT, pathname));
    for (const file of candidates) {
      if (!file.startsWith(ROOT) && (fixturesDir === null || !file.startsWith(resolve(fixturesDir)))) continue;
      if (existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
        return res.end(readFileSync(file));
      }
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found: " + pathname);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  // by package name, as Node resolves it: installed as a project's dependency,
  // the package manager may hoist it above this package's own node_modules
  const { default: puppeteer } = await import("puppeteer-core");
  // A behavior run shows real scrollbars, so a script can grab a thumb and drag
  // it as a person would: headless Chrome hides them, and an overlay scrollbar
  // (macOS) has no thumb until it is scrolling — so both are turned off, and the
  // page gets the classic bar Windows and Linux draw. The visual rung keeps them
  // hidden, as its baselines were drawn.
  // a Chrome kept running between calls (chrome.mjs): each run works in a
  // browser context of its own, so nothing carries from one run to the next
  const { context: browser, release } = await sharedChrome({
    args: ["--no-sandbox", ...(scrollbars ? ["--disable-features=OverlayScrollbar,OverlayScrollbars"] : [])],
    ...(scrollbars ? { ignoreDefaultArgs: ["--hide-scrollbars"] } : {}) });
  try {
    /** A fresh page with the app booted and the language-altitude API bound. */
    const openApp = async ({ width = 1024, height = 768, clock = null, scheme = "light", dpr = 1, touch = false, hideScrollbars = false, echoConsole = false, onPage = null, budgetMs = 15000, check = null } = {}) => {
      const page = await browser.newPage();
      // watched from before the program's first line: a program that stops
      // answering — while it boots, or later, under a click — is paused where it
      // is and its lines quoted, rather than holding the run until a timeout
      const watch = watchPage(page, budgetMs);
      onPage?.(page);
      // what the page writes to its console, from its first line (declare-look --console)
      // (the browser's own request for a favicon is not the program's)
      if (echoConsole) page.on("console", (m) => { if (!/favicon\.ico$/.test(m.location()?.url ?? "")) console.log("console." + m.type() + ": " + m.text()); });
      // scrollbars drawn or not is the page's from its first paint
      if (hideScrollbars) await (await page.target().createCDPSession()).send("Emulation.setScrollbarsHidden", { hidden: true });
      // `touch`: a phone or tablet — touch is the device's input, and every
      // press, drag and hold the driver makes is a FINGER (touch events), not a
      // mouse in a small window: no hover, gesture claims, a drag that scrolls.
      // `dpr` rasterizes at device pixels per CSS pixel — a specimen sheet whose
      // subject IS the rendering (stroke weight, a 1px hairline) needs the real
      // pixels, not a 1× approximation of them. Layout is unchanged; only the
      // raster grid is finer, so the baseline is dpr× the clip in each axis.
      await page.setViewport({ width, height, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
      // A PINNED COLOUR SCHEME, for the same reason as the pinned clock: an app
      // that follows `prefers-color-scheme` renders whatever the HOST MACHINE
      // happens to be wearing, so baselines blessed in daylight fail when macOS
      // turns itself dark in the evening. Measured exactly that, mid-session.
      // Default light; a state asks for dark with `scheme: "dark"`.
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e)));
      // what the page's own boot says went wrong, so a boot that fails is
      // reported by its reason rather than by the wait for a ready signal it
      // will never give
      const bootSaid = [];
      // …and what the program threw that the runtime caught and logged with
      // its place (`onClick on app.b threw: …`): an error, though not the page's
      const thrown = [];
      // …and every error the page logged, the last few — what a boot that never
      // came up is said with when nothing else names its reason
      const pageSaid = [];
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const t = m.text().replace(/(?: JSHandle@\w+)+$/, "");
        pageSaid.push(t.split("\n")[0].slice(0, 300));
        if (pageSaid.length > 5) pageSaid.shift();
        if (t.startsWith("[Declare] boot failed")) bootSaid.push(consoleText(m));
        else if (/^\[Declare\] .* threw: /.test(t)) thrown.push(t.slice("[Declare] ".length));
      });
      // THE REQUESTS THE PROGRAM MAKES — its DataSources, streams and sockets,
      // not the page's own scripts, styles, fonts and pictures — in order, with
      // what each carried and what came back: a check asks what was sent
      // (expect.request) rather than inferring it from the screen.
      const requests = [];
      const PROGRAM_KINDS = new Set(["fetch", "xhr", "eventsource", "websocket"]);
      page.on("request", (r) => {
        if (!PROGRAM_KINDS.has(r.resourceType()) || r.method() === "OPTIONS") return;
        const u = new URL(r.url());
        requests.push({ method: r.method(), url: r.url(), path: u.pathname + u.search, body: parseBody(r.postData()), status: null, $req: r });
      });
      page.on("response", (res) => {
        const e = requests.find((q) => q.$req === res.request());
        if (e !== undefined) e.status = res.status();
      });
      // A PINNED WALL CLOCK, installed before any page script runs. An app whose
      // initial state derives from today — the calendar's month grid, a "3 days
      // ago" label — otherwise photographs a different program every day, and
      // its baselines rot with nobody having changed a line. `clock` is an ISO
      // string given by the state; `Date.now()` and `new Date()` answer from it,
      // while the DRIVEN animation clock (window.__declare.clock) is untouched,
      // so motion still settles frame-exactly.
      if (clock !== null) {
        await page.evaluateOnNewDocument((iso) => {
          const fixed = new Date(iso).getTime();
          const Real = Date;
          const Pinned = function (...a) { return a.length === 0 ? new Real(fixed) : new Real(...a); };
          Pinned.prototype = Real.prototype;
          Pinned.now = () => fixed;
          Pinned.parse = Real.parse;
          Pinned.UTC = Real.UTC;
          globalThis.Date = Pinned;
        }, clock);
      }
      // VIRTUAL DEFERRED TIME. settleMotion drives the animation clock
      // frame-exactly and costs no real time, so declared motion is already
      // deterministic — but a raw `setTimeout` (a tooltip's 1s show delay, a
      // 220ms press flash) runs on WALL time, invisible to it. Whether such a
      // timer had fired when the frame was captured then depended on machine
      // load, which is a visual flake nobody can reproduce.
      //
      // So DELAYED timers (> 0ms) are virtualized: they fire only when the
      // harness advances time — each driven clock step (clock.onStepped) and
      // each drive.wait(ms). A real stall adds no virtual time, so the same
      // route always yields the same picture.
      //
      // Zero-delay timers stay REAL: `setTimeout(fn, 0)` is ordering ("after
      // this task"), not timing, and boot-time deferrals depend on it running
      // without anyone driving the clock.
      await page.evaluateOnNewDocument(() => {
        const realSet = globalThis.setTimeout.bind(globalThis);
        const realClear = globalThis.clearTimeout.bind(globalThis);
        // the platform's own processes (the user's scroll going quiet) keep real
        // time: runtime/src/platform-time.ts reads this pair
        globalThis.__declarePlatformTimers = { set: realSet, clear: realClear };
        let now = 0, seq = 0;
        const pend = new Map();   // id → { due, fn, args, every }
        globalThis.setTimeout = (fn, ms, ...args) => {
          const d = Number(ms) || 0;
          if (d <= 0) return realSet(fn, d, ...args);
          const id = "v" + ++seq;
          pend.set(id, { due: now + d, fn, args, every: 0 });
          return id;
        };
        globalThis.setInterval = (fn, ms, ...args) => {
          const d = Math.max(1, Number(ms) || 1);
          const id = "v" + ++seq;
          pend.set(id, { due: now + d, fn, args, every: d });
          return id;
        };
        globalThis.clearTimeout = globalThis.clearInterval = (id) => {
          if (typeof id === "string" && pend.has(id)) { pend.delete(id); return; }
          realClear(id);
        };
        // The frames the app has asked for and not yet had: a wait that drives
        // the clock lets one go by while any is owed (an afterDelay arms its
        // timer only once the frame it was asked in has been shown).
        const realRaf = globalThis.requestAnimationFrame.bind(globalThis);
        const realCaf = globalThis.cancelAnimationFrame.bind(globalThis);
        const owed = new Set();
        globalThis.requestAnimationFrame = (fn) => { const id = realRaf((t) => { owed.delete(id); fn(t); }); owed.add(id); return id; };
        globalThis.cancelAnimationFrame = (id) => { owed.delete(id); realCaf(id); };
        globalThis.__declareTimers = {
          framesOwed: () => owed.size,
          nextFrame: () => new Promise((r) => realRaf(() => r())),
          advance(ms) {
            now += ms;
            // due-ordered, and re-read each pass: a fired callback may arm more
            for (;;) {
              let next = null;
              for (const [id, t] of pend) if (t.due <= now && (next === null || t.due < next[1].due)) next = [id, t];
              if (next === null) return;
              const [id, t] = next;
              if (t.every > 0) t.due += t.every; else pend.delete(id);
              try { t.fn(...t.args); } catch (e) { console.error("virtual timer:", e); }
            }
          },
          pending: () => pend.size,
        };
      });
      // READY WHEN THE APP IS: booted, and nothing it asked for still on its way.
      // This counts the page's own requests (a stream or a socket, open for good,
      // is not one), and is quiet once none is in flight and two frames have
      // gone by with none begun — a request the program makes is announced
      // before the frame after it, so a data source that fetches as the app
      // boots, or fetches again from what came back, has begun by then. No
      // window of silence is waited out.
      let inflight = 0, lastChange = Date.now();
      const LONG_LIVED = new Set(["eventsource", "websocket"]);
      page.on("request", (r) => { if (!LONG_LIVED.has(r.resourceType())) { inflight++; lastChange = Date.now(); } });
      const settled = (r) => { if (!LONG_LIVED.has(r.resourceType())) { inflight = Math.max(0, inflight - 1); lastChange = Date.now(); } };
      page.on("requestfinished", settled);
      page.on("requestfailed", settled);
      const quiet = async (timeoutMs = 10000) => {
        const until = Date.now() + timeoutMs;
        while (Date.now() < until) {
          if (inflight > 0) { await new Promise((r) => setTimeout(r, 10)); continue; }
          const seen = lastChange;
          await frames(page);
          if (inflight === 0 && lastChange === seen) return;
        }
      };
      // THE PAGE ARRIVING — at the start, and again after drive.device() loads it
      // on another device: up (or said why not), its fonts in, its requests
      // quiet, its opening motion run, and its deferred time on the driven clock.
      // One sequence, so a reloaded page is as ready as the first.
      const arrive = async (load) => {
        await watch.during("boot", async () => {
          await load();
          // A page served elsewhere (--url) boots by its own path, after its load
          // event, and the page's own timers are virtual here — so a polling wait
          // inside the page would never poll again. It is polled from outside,
          // its time let pass as it comes up.
          const served = async () => {
            const until = Date.now() + 10000;
            for (;;) {
              const up = await page.evaluate(() => (globalThis.__declareTimers?.advance?.(50), !!window.__declare?.inspect)).catch(() => false);
              if (up) return;
              if (Date.now() > until) throw new Error("Waiting failed: 10000ms exceeded");
              await new Promise((r) => setTimeout(r, 50));
            }
          };
          await (url === null ? page.waitForFunction("!!window.__declare?.inspect", { timeout: 10000, polling: 10 }) : served()).catch(async (e) => {
            const lines = bootFailure(await Promise.all(bootSaid), pageErrors);
            // nothing named a reason: say what is known, never the bare timeout
            if (lines.length === 0) {
              const loaded = await page.evaluate(() => ({ declare: typeof window.__declare, scripts: document.scripts.length })).catch(() => null);
              lines.push(`boot: the page loaded, but the program never came up within 10 s (${e?.message ?? "no answer"}), and the page reported no error`);
              if (loaded !== null && loaded.declare === "undefined") lines.push("  the runtime never started on the page: its script did not run (a request for it failed, or it was blocked)");
              for (const t of pageSaid) lines.push(`  the page logged: ${t}`);
            }
            throw Object.assign(new VerifyAssertion(lines.join("\n")), { lines });
          });
          // the program's own fonts: a Font starts its faces' loads as the app comes
          // up, and the browser's document.fonts.ready can resolve before they begin
          await page.waitForFunction(() => {
            const pending = (n) => n.$pending === true || (n.children ?? []).some(pending);
            return !pending(window.__declare.find("app"));
          }, { timeout: 8000, polling: 20 }).catch(() => {});
          await quiet();
          await page.evaluate(() => document.fonts.ready);
          // …and at rest: motion the app starts as it comes up (a spring settling into
          // place) is run to its end on the driven clock — a loop that never ends
          // does not hold it — and two frames go by, for what the page applies after
          // a settle (its scroll extent among them)
          await page.evaluate(() => { const c = window.__declare.clock; c?.settleMotion?.(5000); c?.auto?.(); });
          await frames(page);
        });
        // Deferred time now rides the driven clock for every stepper — the
        // asserts' clock.step, settleMotion, and the states' routes alike.
        await page.evaluate(() => {
          const c = window.__declare.clock, T = globalThis.__declareTimers;
          if (c && T && typeof c.onStepped === "function") c.onStepped((ms) => T.advance(ms));
        });
      };
      // --url: the app where it is served (a dev server, its own address), not the
      // verify host's copy — what a person opening it gets, its origin included
      await arrive(() => page.goto(url ?? `http://127.0.0.1:${port}${built !== null ? baseHref + "index.html" : "/__verify__/"}`, { waitUntil: "load", timeout: 30000 }));

      const log = [];
      const step = (s) => log.push(s);
      // RUNG 4'S LAYOUT QUESTIONS, ASKED WHERE THE SCRIPT HAS DRIVEN IT. The boot
      // check sees the screen the program starts on; a sheet opened, a list
      // filled, a seat map built only after a press were never asked about a
      // finger's reach or a control another view covers. With `check` set, every
      // place the script lets the program come to rest (settleMotion,
      // settleData) — and its end — is asked the same questions, on the same
      // device, and remembers which of the program's own classes were built.
      const checks = [];
      const reported = new Set(check?.skip ?? []);
      const checkHere = async (where) => {
        if (check === null) return;
        try {
          // SCROLLING IS THE PLATFORM'S, AND ASYNC: a fling after a drag, an
          // animated reveal, a script's own scrollIntoView all land over frames
          // of their own, and the model's scroll positions follow the browser's
          // events. Asked mid-scroll, the check would measure a place about to
          // change. So wait as the driver's own swipes do — three frames with no
          // scroll event and no scroller reporting the user's scroll live, in
          // real time, at most 2.5 s — then two frames for the model to take
          // the last position.
          await page.evaluate(() => new Promise((done) => {
            const until = performance.now() + 2500;
            let n = 0, seen = -1, still = 0;
            const count = () => { n++; };
            addEventListener("scroll", count, true);
            const live = () => {
              const visit = (v) => v.userScrolling === true || (v.childViews ?? []).some(visit);
              const app = window.__declare?.find?.("app");
              return app != null && visit(app);
            };
            const frame = () => {
              still = n === seen ? still + 1 : 0;
              seen = n;
              if ((still >= 3 && !live()) || performance.now() > until) {
                removeEventListener("scroll", count, true);
                requestAnimationFrame(() => requestAnimationFrame(done));
              } else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          }));
          const r = await page.evaluate((o) => window.__declare?.bootCheck?.(o) ?? null, { touch, realText: true, classes: check.classes ?? [], skip: [...reported] });
          if (r !== null) {
            for (const k of r.flagged ?? []) reported.add(k);
            checks.push({ where, layout: r.layout, notes: r.notes, unbuilt: r.unbuilt, flagged: r.flagged ?? [] });
          }
        } catch { /* a page that went away answers nothing */ }
      };
      const atRest = () => checkHere(log.length > 1 ? `after ${log[log.length - 2]}` : "at the start");
      const node = async (path) => {
        const n = await page.evaluate((p) => window.__declare.inspect(p), path);
        if (n === null) throw new VerifyAssertion(`no node at '${path}'`);
        return n;
      };
      // the nearest view above `path` whose own visible is false, by its path
      const hider = (path) => page.evaluate((p) => {
        const segs = p.match(/"[^"]*"|[^.]+/g) ?? [];
        for (let k = segs.length - 1; k > 0; k--) if (window.__declare.find(segs.slice(0, k).join("."))?.visible === false) return segs.slice(0, k).join(".");
        return "an ancestor";
      }, path);
      // rootX/rootY is where the view is SEEN (inspect.ts takes every enclosing
      // scroll out). It used to be a plain sum of ancestor x/y, so driving
      // anything below a scrolled pane's fold aimed at the position the view
      // would have had unscrolled, and missed.
      // A point inside a view, in its own units, as seen: through every scale,
      // rotation and scroll above it (a scaled figure's middle is not its
      // origin plus half its unscaled size).
      const pointIn = async (path, x, y) => {
        const p = await page.evaluate((q, px, py) => window.__declare.rootPoint?.(q, px, py) ?? null, path, x, y);
        if (p !== null) return p;
        const n = await node(path);
        return { x: n.rootX + x, y: n.rootY + y };
      };
      const center = async (path) => {
        const n = await node(path);
        return pointIn(path, n.width / 2, n.height / 2);
      };

      // THE SCROLL A PERSON MAKES. Reaching a view off the window (or under a
      // pane's fold, or under pinned chrome) is a SWIPE — a finger on a touch
      // device, the wheel elsewhere — sent through Chrome's own gesture
      // synthesizer, so the browser scrolls natively, as it does for a hand:
      // touch (or wheel) events, scroll frames, momentum's end, `scrollend`. It is
      // the platform's process and ASYNC, so the driver never moves a scroll
      // offset or asks the program to: it swipes, waits until the platform says
      // the scroll is over, looks where the view is now, and swipes again if it
      // must — the same split the language has between the scroll position (a
      // fact the platform reports) and a request to scroll (which may wait).
      let gestureSession = null;
      const swipe = async (x, y, dx, dy) => {
        gestureSession ??= await page.target().createCDPSession();
        // (the gesture's distance is the finger's travel: content scrolled down,
        // toward its end, is a finger moving up)
        await gestureSession.send("Input.synthesizeScrollGesture", {
          x: Math.round(x), y: Math.round(y), xDistance: Math.round(-dx), yDistance: Math.round(-dy),
          gestureSourceType: touching() ? "touch" : "mouse", speed: 1200, preventFling: true,
        });
      };
      // over when no scroll event has come for three frames and no scroller
      // holding the view reports the user's scroll live — in REAL time (the
      // platform's), at most 2.5 s; answers whether a scroll was still live
      const scrollOver = (path) => page.evaluate((p) => new Promise((done) => {
        const until = performance.now() + 2500;
        let n = 0, seen = -1, still = 0;
        const count = () => { n++; };
        addEventListener("scroll", count, true);
        const live = () => { for (let v = window.__declare.find(p); v != null; v = v.parent) if (v.userScrolling === true) return true; return false; };
        const frame = () => {
          still = n === seen ? still + 1 : 0;
          seen = n;
          if ((still >= 3 && !live()) || performance.now() > until) { removeEventListener("scroll", count, true); done(live()); }
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }), path);
      // where the view's point is in the window, and every scroller holding it:
      // its box in the window (clipped to it) and how far it can still go
      const scrollPlan = (path, at) => page.evaluate((p, at) => {
        const d = window.__declare, t = d.find(p);
        if (t == null) return null;
        const pt = (v, x, y) => d.rootPoint(v, x, y);
        const c = at !== null ? pt(t, at.x, at.y) : pt(t, t.width / 2, t.height / 2);
        const scrollers = [];
        for (let v = t.parent; v != null; v = v.parent) {
          const ax = v.scrolls;
          if (ax !== "y" && ax !== "x" && ax !== "both") continue;
          // its box as it sits in its parent — the point of a view inside it
          // would carry its own scroll; the root's is the window
          const a = v.parent == null ? { x: 0, y: 0 } : pt(v.parent, v.x, v.y);
          const b = v.parent == null ? { x: innerWidth, y: innerHeight } : pt(v.parent, v.x + v.width, v.y + v.height);
          if (a === null || b === null) continue;
          scrollers.push({
            at: scrollers.length, name: v.name ?? v.constructor.name, y: ax !== "x", x: ax !== "y", scrolling: v.userScrolling === true,
            box: { l: Math.max(0, Math.min(a.x, b.x)), t: Math.max(0, Math.min(a.y, b.y)), r: Math.min(innerWidth, Math.max(a.x, b.x)), b: Math.min(innerHeight, Math.max(a.y, b.y)) },
            up: Math.max(0, v.scrollY ?? 0), down: Math.max(0, (v.contentHeight ?? 0) - v.height - (v.scrollY ?? 0)),
            left: Math.max(0, v.scrollX ?? 0), right: Math.max(0, (v.contentWidth ?? 0) - v.width - (v.scrollX ?? 0)),
          });
        }
        return { c, scrollers };
      }, path, at);
      // A GESTURE BELONGS TO THE SCROLLER UNDER THE FINGER where it starts — a
      // swipe begun over a pane inside the page scrolls the pane. So the finger
      // starts where the nearest scroller is the one meant, with its travel
      // inside it, as a person puts a thumb on the page and not on the list in it.
      const startOn = (path, pick, dx, dy) => page.evaluate((p, idx, box, dx, dy) => {
        const d = window.__declare, t = d.find(p);
        let want = null;
        for (let v = t?.parent, k = 0; v != null; v = v.parent) {
          const ax = v.scrolls;
          if (ax !== "y" && ax !== "x" && ax !== "both") continue;
          if (k++ === idx) { want = v; break; }
        }
        const owner = (x, y) => {
          const h = d.at(x, y);
          if (h === null) return null;
          for (let v = d.find(h.path); v != null; v = v.parent) if (v.scrolls === "y" || v.scrolls === "x" || v.scrolls === "both") return v;
          return null;
        };
        const xs = [0.5, 0.3, 0.7, 0.15, 0.85, 0.03, 0.97].map((f) => box.l + (box.r - box.l) * f);
        const ys = [0.5, 0.6, 0.4, 0.7, 0.3, 0.8, 0.2, 0.9, 0.1].map((f) => box.t + (box.b - box.t) * f);
        for (const sx0 of xs) for (const sy0 of ys) {
          const sx = Math.min(Math.max(sx0, box.l + 4 + Math.max(0, dx)), box.r - 4 + Math.min(0, dx));
          const sy = Math.min(Math.max(sy0, box.t + 4 + Math.max(0, dy)), box.b - 4 + Math.min(0, dy));
          if (owner(sx, sy) === want) return { x: sx, y: sy };
        }
        return null;
      }, path, pick.at, pick.box, dx, dy);
      // Swipe until the view's point rests inside `band` (a window rectangle)
      // and inside every pane holding it: the nearest scroller that can still
      // move it there is the one swiped, at most most of its height per swipe.
      // Answers the point and what was tried, for a failure that says what the
      // platform did ("2 swipes up on App moved it 0 px").
      const scrollInto = async (path, at, band) => {
        const tried = [];
        let P = await scrollPlan(path, at);
        for (let i = 0; P !== null && i < 8; i++) {
          let pick = null, by = null, short = null;
          for (const s of P.scrollers) {
            const lo = Math.max(band.t, s.box.t + 8), hi = Math.min(band.b, s.box.b - 8);
            const lx = Math.max(band.l, s.box.l + 8), hx = Math.min(band.r, s.box.r - 8);
            const needY = s.y && lo < hi && (P.c.y < lo || P.c.y > hi) ? P.c.y - (lo + hi) / 2 : 0;
            const needX = s.x && lx < hx && (P.c.x < lx || P.c.x > hx) ? P.c.x - (lx + hx) / 2 : 0;
            if (needY === 0 && needX === 0) continue;
            const ny = needY > 0 ? Math.min(needY, s.down) : Math.max(needY, -s.up);
            const nx = needX > 0 ? Math.min(needX, s.right) : Math.max(needX, -s.left);
            if (Math.abs(ny) < 1 && Math.abs(nx) < 1) { short ??= s; continue; }   // at its end that way
            pick = s; by = { x: nx, y: ny };
            break;
          }
          if (pick === null) return { c: P.c, tried, short };
          const bw = pick.box.r - pick.box.l, bh = pick.box.b - pick.box.t;
          const dy = Math.sign(by.y) * Math.min(Math.abs(by.y), bh * 0.7), dx = Math.sign(by.x) * Math.min(Math.abs(by.x), bw * 0.7);
          // where to start it (startOn), and a shorter swipe where a long one has
          // nowhere to start: a thumb above the list, not on it
          let start = null, gx = dx, gy = dy;
          for (const f of [1, 0.6, 0.35]) {
            gx = dx * f; gy = dy * f;
            start = await startOn(path, pick, gx, gy);
            if (start !== null) break;
          }
          if (start === null) { tried.push({ on: pick.name, way: dy > 0 ? "up" : "down", moved: 0, live: false, nowhere: true }); break; }
          await swipe(start.x, start.y, gx, gy);
          const live = await scrollOver(path);
          await page.evaluate(() => window.__declare.clock?.settleMotion?.());
          const was = P.c;
          P = await scrollPlan(path, at);
          if (P === null) break;
          const moved = Math.round(Math.hypot(P.c.x - was.x, P.c.y - was.y));
          tried.push({ on: pick.name, way: Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? "up" : "down") : (dx > 0 ? "left" : "right"), moved, live });
          if (moved === 0 && tried.length >= 2 && tried[tried.length - 2].moved === 0) break;
        }
        return { c: P?.c ?? null, tried, short: null };
      };
      const toldTried = (r) => {
        if (r.tried.some((t) => t.nowhere)) return `no point on '${r.tried.find((t) => t.nowhere).on}' to start a swipe from: what is under a finger there belongs to another scroller`;
        if (r.tried.length === 0) return r.short !== null ? `'${r.short.name}' is already at its end that way` : "nothing holding it scrolls that way";
        const by = new Map();
        for (const t of r.tried) { const k = `${t.way} on '${t.on}'`; const e = by.get(k) ?? { n: 0, moved: 0, live: false }; e.n++; e.moved += t.moved; e.live ||= t.live; by.set(k, e); }
        return [...by].map(([k, e]) => `${e.n} swipe${e.n === 1 ? "" : "s"} ${k} moved it ${e.moved} px${e.live ? " (its scroll was still live — scrolling = true — when the driver gave up waiting)" : ""}`).join("; ");
      };

      // Where a press on a view lands, as a person's would: a view below the fold
      // is scrolled into sight first (as a person scrolls to it), and a point some
      // other view covers is said, not pressed — a press that reaches nothing used
      // to pass in silence, and the step after it failed for a reason it never named.
      // `at`, a point inside the view in its own units, is the one checked and
      // returned in place of the centre (clickAt: a day on a drawn chart).
      // `drag`: a finger's drag over a view that takes no presses is the scroll of
      // the pane holding it, so reaching that pane there is reaching the view
      const reach = async (path, at = null, { drag = false } = {}) => {
        const spot = () => at === null ? center(path) : pointIn(path, at.x, at.y);
        // A TARGET STILL MOVING is aimed at where it will be, not where it was: a
        // native smooth scroll, or a scroll request that lands a frame later,
        // moves it between the look and the press. Wait (in real frames, up to
        // about half a second) until three looks in a row agree — a scroll asked
        // for this frame starts only on the next; one that never settles is said.
        // Asked first, and again after each scroll made here.
        const still = async () => {
          let c = await spot();
          for (let tries = 0, same = 0; same < 3; tries++) {
            await frames(page);
            const again = await spot();
            if (Math.abs(again.x - c.x) < 0.5 && Math.abs(again.y - c.y) < 0.5) { same++; continue; }
            same = 0;
            c = again;
            if (tries >= 40) throw new VerifyAssertion(`'${path}' is still moving (now at (${Math.round(c.x)}, ${Math.round(c.y)})) — a press would land where it was, not where it is going. Let its motion finish first (drive.wait, or settleMotion)`);
          }
          return c;
        };
        let c = await still();
        const vp = page.viewport() ?? { width: 1280, height: 800 };
        const off = (q) => q.x < 0 || q.y < 0 || q.x >= vp.width || q.y >= vp.height;
        const whole = { l: 0, t: 0, r: vp.width, b: vp.height };
        if (off(c)) {
          const r = await scrollInto(path, at, whole);
          c = await still();
          if (off(c)) throw new VerifyAssertion(`'${path}' is outside the window at (${Math.round(c.x)}, ${Math.round(c.y)}), and swiping did not bring it in: ${toldTried(r)}`);
        }
        // the view a press there reaches must be the target, inside it, or what holds it;
        // one that pinned chrome covers is scrolled clear of it first, as a person would
        // pressAt: where a real press goes, past views that take none (a
        // container's box over a control is not in its way)
        const reaches = () => page.evaluate((p, x, y) => {
          const d = window.__declare, at = (d.pressAt ?? d.at)(x, y);
          if (at === null) return { ok: false, path: null };
          const t = d.find(p), h = d.find(at.path);
          const inside = (a, b) => { for (let n = a; n != null; n = n.parent) if (n === b) return true; return false; };
          // a scroller that holds the target, hit where the target should be,
          // is the pane it is clipped by there — not a press that reaches it
          const clipped = t !== null && h !== null && h !== t && inside(t, h) && h.scrolls !== undefined && h.scrolls !== "none";
          return { ok: t !== null && h !== null && !clipped && (inside(h, t) || inside(t, h)), path: at.path, clipped };
        }, path, c.x, c.y);
        const reachesFor = async () => { const h = await reaches(); return drag && touching() && h.clipped ? { ...h, ok: true, clipped: false } : h; };
        let hit = await reachesFor();
        // below its pane's fold, though on the screen: scrolled into its pane, as a person would
        if (hit.clipped) {
          await scrollInto(path, at, whole);
          c = await still();
          hit = await reachesFor();
        }
        if (!hit.ok) {
          // past the covering view, as a person scrolls it clear. Which side it
          // covers from is read in the WINDOW, where the press is: a cover in the
          // upper half is a header, and the view must come to rest below it; one
          // lower down is a bar at the window's foot, and the view rests above it.
          // (the cover is the whole thing in the way — the outermost view over
          // the hit that does not hold the target: the bar, not its button)
          const k = hit.path === null ? null : await page.evaluate((p, cover) => {
            const d = window.__declare, t = d.find(p);
            let n = d.find(cover);
            if (n == null) return null;
            const holds = (a, b) => { for (let v = b; v != null; v = v.parent) if (v === a) return true; return false; };
            while (n.parent != null && !holds(n.parent, t)) n = n.parent;
            const a = d.rootPoint(n, 0, 0), b = d.rootPoint(n, n.width, n.height);
            return a && b ? { t: Math.min(a.y, b.y), b: Math.max(a.y, b.y) } : null;
          }, path, hit.path);
          if (k !== null) {
            const band = (k.t + k.b) / 2 < vp.height / 2 ? { ...whole, t: k.b + 8 } : { ...whole, b: k.t - 8 };
            if (band.b > band.t) { await scrollInto(path, at, band); c = await still(); hit = await reachesFor(); }
          }
        }
        if (!hit.ok)
          throw new VerifyAssertion(`a press on '${path}'${at === null ? "" : ` at (${at.x}, ${at.y}) in it`} — (${Math.round(c.x)}, ${Math.round(c.y)}) in the window — would reach ${hit.path === null ? "nothing" : `'${hit.path}'`}: it is covered there, or takes no presses`);
        // A FINGER IS NOT A POINT. A browser moves a tap onto a control within a
        // finger's reach of where it landed (Chrome's touch adjustment, as phones
        // do), so a tap a few pixels from a pinned button is the button's. On touch
        // the ring a finger covers is checked too, and a control there that is not
        // the target, inside it or holding it is said, not tapped.
        if (touching() && !drag) {
          const takerAt = (q) => page.evaluate((p, x, y) => {
            const d = window.__declare, t = d.find(p);
            const inside = (a, b) => { for (let n = a; n != null; n = n.parent) if (n === b) return true; return false; };
            const presses = (v) => typeof v.press === "function" || typeof v.onClick === "function" || (typeof v.link === "string" && v.link !== "");
            for (const r of [6, 12]) for (let k = 0; k < 8; k++) {
              const a = (d.pressAt ?? d.at)(x + r * Math.cos(k * Math.PI / 4), y + r * Math.sin(k * Math.PI / 4));
              if (a === null) continue;
              // the nearest view holding the hit that takes a press, by its path
              const segs = a.path.match(/"[^"]*"|[^.]+/g) ?? [];
              let n = segs.length, v = null;
              for (; n > 0; n--) { v = d.find(segs.slice(0, n).join(".")); if (v != null && presses(v)) break; }
              if (n > 0 && v !== t && !inside(v, t) && !inside(t, v)) return { path: segs.slice(0, n).join("."), r };
            }
            return null;
          }, path, q.x, q.y);
          let taker = await takerAt(c);
          // a control that stays put beside it (a bar pinned to the window's
          // foot): scrolled up clear of it, into the upper third, as a person would
          if (taker !== null) {
            await scrollInto(path, at, { ...whole, t: Math.round(vp.height * 0.2), b: Math.round(vp.height * 0.45) });
            const was = c;
            c = await still();
            if (!off(c) && (await reaches()).ok && (await takerAt(c)) === null) taker = null;
            else c = was;
          }
          if (taker !== null)
            throw new VerifyAssertion(`a tap on '${path}'${at === null ? "" : ` at (${at.x}, ${at.y}) in it`} lands within ${taker.r} px of '${taker.path}', and a finger there is taken by it — a browser moves a tap onto a control that close. Tap farther from it, or give the two more room`);
        }
        return c;
      };

      // ON A TOUCH DEVICE THE PRESS IS A FINGER. The page decides by the
      // viewport it was given (openApp's `touch`, declare-look's --touch): every
      // verb below then sends touch events, as a hand would — a mouse in a
      // phone-sized window would hover, never claim a gesture, and pass tests
      // a finger fails.
      const touching = () => page.viewport()?.hasTouch === true;
      // WHAT A PRESS STARTS, LANDED: a handler that hands its work to the next
      // frame (afterDelay(0) — a Menu passing on its choice) has run before the
      // script reads, as it has for a person, who never acts within one frame
      const landed = async () => {
        await frames(page);
        await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
      };
      const press = async (x, y) => {
        if (touching()) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        await landed();
      };
      // a pointer held down between press() and release(): where it is, and the finger
      let held = null;
      const drive = {
        /** Bring a view into sight as a person does — swiping the page (and any
         *  pane holding it) until it is in the window, waiting each time for the
         *  platform to say the scroll is over. Nothing is pressed. */
        async reveal(path) {
          step(`reveal ${path}`);
          const vp = page.viewport() ?? { width: 1280, height: 800 };
          const r = await scrollInto(path, null, { l: 0, t: 0, r: vp.width, b: vp.height });
          if (r.c === null) throw new VerifyAssertion(`no node at '${path}'`);
          const c = r.c;
          if (c.x < 0 || c.y < 0 || c.x >= vp.width || c.y >= vp.height)
            throw new VerifyAssertion(`'${path}' is outside the window at (${Math.round(c.x)}, ${Math.round(c.y)}), and swiping did not bring it in: ${toldTried(r)}`);
        },
        async click(path) {
          const c = await reach(path);
          step(`${touching() ? "tap" : "click"} ${path}`);
          await press(c.x, c.y);
        },
        /** Make the page another device, and load the app again on it:
         *  `{ width, height, touch }` — a phone is `{ width: 390, height: 844,
         *  touch: true }`. On a touch device every press, drag and hold after
         *  this is a finger. */
        async device({ width, height, touch = false } = {}) {
          const vp = page.viewport() ?? { width: 1024, height: 768 };
          step(`device ${width ?? vp.width}x${height ?? vp.height}${touch ? " touch" : ""}`);
          await page.setViewport({ ...vp, width: width ?? vp.width, height: height ?? vp.height, hasTouch: touch, isMobile: touch });
          await arrive(() => page.reload({ waitUntil: "load", timeout: 30000 }));
        },
        /** Press and hold `ms` (the app's time advances by exactly that), then
         *  release in place — a finger's press-and-hold, or a held mouse button.
         *  What `onHold` answers, and a context menu on a touch screen. */
        async hold(path, ms = 600) {
          const c = await reach(path);
          step(`hold ${path} for ${ms} ms`);
          if (touching()) {
            const t = await page.touchscreen.touchStart(c.x, c.y);
            await this.wait(ms);
            await t.end();
          } else {
            await page.mouse.move(c.x, c.y);
            await page.mouse.down();
            await this.wait(ms);
            await page.mouse.up();
          }
          await landed();
        },
        /** A pinch on the view about its centre, spread (scale > 1) or drawn
         *  together (< 1), as the device makes it. On a touch device, two
         *  fingers — the program's onPinch* run. Otherwise a trackpad pinch,
         *  which the browser delivers as wheel events with ctrl held — the
         *  program's onWheel runs with `e.pinch` true, as under a Mac trackpad. */
        async pinch(path, scale, steps = 12) {
          const c = await reach(path);
          step(`pinch ${path} by ${scale}${touching() ? "" : " (trackpad)"}`);
          const s = await page.target().createCDPSession();
          if (!touching()) {
            // Chrome scales a page by exp(-deltaY / 100) per ctrl-wheel, so the
            // same total delta is what a trackpad sends for this scale
            const total = -100 * Math.log(scale);
            await page.mouse.move(c.x, c.y);
            for (let i = 0; i < steps; i++) {
              await s.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: c.x, y: c.y, deltaX: 0, deltaY: total / steps, modifiers: 2 });
              await new Promise((r) => setTimeout(r, 16));
            }
            await s.detach();
            return;
          }
          const d0 = 40, d1 = d0 * scale;
          const at = (d) => [{ x: c.x - d, y: c.y, id: 1 }, { x: c.x + d, y: c.y, id: 2 }];
          await s.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(d0) });
          for (let i = 1; i <= steps; i++) {
            await s.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(d0 + (d1 - d0) * i / steps) });
            await new Promise((r) => setTimeout(r, 16));
          }
          await s.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await s.detach();
        },
        /** Press at (x, y) inside the view, from its top-left in its own units —
         *  a part of a drawn control (a step of a scale, a day of a chart) that
         *  is not a view of its own. Reached as `click` reaches the view, at that
         *  point: one some other view covers there is said, not pressed. */
        async clickAt(path, x, y) {
          const p = await reach(path, { x, y });
          step(`${touching() ? "tap" : "click"} ${path} at (${x}, ${y})`);
          await press(p.x, p.y);
        },
        async drag(path, dx, dy = 0, steps = 10) {
          const c = await reach(path, null, { drag: true });
          step(`drag ${path} by (${dx}, ${dy})`);
          if (touching()) {
            // a finger's drag, a frame between moves: inside a scroller it is
            // the page's scroll unless the view claims it, as under a hand
            const t = await page.touchscreen.touchStart(c.x, c.y);
            for (let i = 1; i <= steps; i++) {
              await t.move(c.x + (dx * i) / steps, c.y + (dy * i) / steps);
              await new Promise((r) => setTimeout(r, 16));
            }
            await t.end();
            await landed();
            return;
          }
          await page.mouse.move(c.x, c.y);
          await page.mouse.down();
          await page.mouse.move(c.x + dx, c.y + dy, { steps });
          await page.mouse.up();
          await landed();
        },
        /** A drag a step at a time, to look at it mid-gesture: `press` puts the
         *  pointer down on the view (at `x, y` inside it, else its centre) and
         *  keeps it down; `moveBy` moves it while held, in steps a frame apart;
         *  `release` lets go. Between them a script reads, expects and takes
         *  pictures of the drag in progress — the ghost, the target lit. A
         *  finger under touch, a mouse otherwise, as `drag`. */
        async press(path, x, y) {
          if (held !== null) throw new VerifyAssertion(`press ${path}: the pointer is already down — release it first`);
          const c = await reach(path, x === undefined ? null : { x, y });
          step(`press ${path}${x === undefined ? "" : ` at (${x}, ${y})`}`);
          if (touching()) held = { at: c, finger: await page.touchscreen.touchStart(c.x, c.y) };
          else { await page.mouse.move(c.x, c.y); await page.mouse.down(); held = { at: c, finger: null }; }
          await frames(page);
        },
        async moveBy(dx, dy = 0, steps = 10) {
          if (held === null) throw new VerifyAssertion(`moveBy(${dx}, ${dy}): nothing is pressed — press a view first`);
          step(`move by (${dx}, ${dy})`);
          const from = held.at, to = { x: from.x + dx, y: from.y + dy };
          for (let i = 1; i <= steps; i++) {
            const p = { x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps };
            if (held.finger !== null) await held.finger.move(p.x, p.y); else await page.mouse.move(p.x, p.y);
            await new Promise((r) => setTimeout(r, 16));
          }
          held.at = to;
          await frames(page);
        },
        async release() {
          if (held === null) throw new VerifyAssertion("release: nothing is pressed");
          step("release");
          if (held.finger !== null) await held.finger.end(); else await page.mouse.up();
          held = null;
          await landed();
        },
        /** Turn the wheel over a view: `dy` (and `dx`) in pixels, as a trackpad
         *  or wheel would — the view under the pointer, or a scroller above it,
         *  takes it. */
        async wheel(path, dy, dx = 0) {
          const c = await reach(path);
          step(`wheel ${path} by (${dx}, ${dy})`);
          await page.mouse.move(c.x, c.y);
          // A native scroll lands after the wheel event, over frames of its own:
          // count the page's scroll events, and wait until three frames go by
          // with none (or a second and a half, for a scroll that never stops).
          await page.evaluate(() => {
            window.__declareScrolls = 0;
            if (window.__declareScrollCount === undefined) {
              window.__declareScrollCount = () => { window.__declareScrolls++; };
              addEventListener("scroll", window.__declareScrollCount, true);
            }
          });
          await page.mouse.wheel({ deltaX: dx, deltaY: dy });
          await page.evaluate(() => new Promise((done) => {
            const until = performance.now() + 1500;
            let seen = -1, still = 0;
            const frame = () => {
              const n = window.__declareScrolls;
              still = n === seen ? still + 1 : 0;
              seen = n;
              if (still >= 3 || performance.now() > until) done(); else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          }));
          // …and until the user's scroll is over: the wheel's stream ends when it
          // goes quiet (real time), and a request made before that would wait
          await page.evaluate((p) => new Promise((done) => {
            const until = performance.now() + 1000;
            const live = () => { for (let n = window.__declare.find(p); n != null; n = n.parent) if (n.userScrolling === true) return true; return false; };
            const frame = () => { if (!live() || performance.now() > until) done(); else requestAnimationFrame(frame); };
            frame();
          }), path);
        },
        /** The requests the program has made so far: { method, url, path, body,
         *  status } each, in order (body parsed when it is JSON). */
        requests() { return requests.map(({ $req, ...q }) => q); },
        /** A key, or a chord written with "+": "Enter", "Shift+Tab", "Meta+Z". */
        async key(name) {
          step(`key ${name}`);
          const parts = name.length > 1 ? name.split("+") : [name];
          const mods = parts.slice(0, -1), last = parts[parts.length - 1] || "+";
          for (const m of mods) await page.keyboard.down(m);
          await page.keyboard.press(last);
          for (const m of mods.reverse()) await page.keyboard.up(m);
          // Select-all is the platform's editing command, which a real keyboard
          // runs and a headless one does not: done here, in the focused text
          // field, as a person's ⌘A / Ctrl+A does before typing over a value.
          if (mods.length === 1 && /^(meta|control)$/i.test(mods[0]) && last.toLowerCase() === "a") {
            await page.evaluate(() => {
              const el = document.activeElement;
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select();
            });
          }
          await landed();
        },
        async type(text) { step(`type "${text}"`); await page.keyboard.type(text); await landed(); },
        /** Select everything in a text field (focusing it): what select-all does
         *  before typing over a value. */
        async selectAll(path) {
          const field = (p) => {
            const n = window.__declare.find(p);
            if (n == null) return `no view at '${p}'`;
            if (typeof n.select !== "function") return `'${p}' is not a text field — it has no select()`;
            return null;
          };
          const r = await page.evaluate(field, path);
          if (r !== null) throw new VerifyAssertion(`selectAll: ${r}`);
          // a press into the field, as a person gives it focus, then its whole text
          await this.click(path);
          step(`select all in ${path}`);
          await page.evaluate((p) => { window.__declare.find(p).select("all"); }, path);
          await landed();
        },
        async tab(n = 1) { for (let i = 0; i < n; i++) await this.key("Tab"); },
        /** Let `ms` of REAL time pass — what runs on the world's clock (a
         *  service's own schedule, a socket's timed frames) — then let the
         *  app's clock catch up on what arrived. drive.wait never waits for
         *  real; this is the one that does. */
        async waitReal(ms) {
          await new Promise((r) => setTimeout(r, ms));
          await this.wait(50);
        },
        /** Let `ms` of the app's time pass: its clock is driven through it a
         *  frame at a time — motion moves, later calls (`afterDelay`, a hold's
         *  timer) come due — so a route that waits 300 ms always sees exactly
         *  300 ms of the app's time, whatever the machine is doing, and none of
         *  it is waited out for real. What the browser still owes — a request
         *  the app made, the frame after — is waited for, as it lands. */
        async wait(ms) {
          await page.evaluate(async (m) => {
            const c = window.__declare.clock, T = globalThis.__declareTimers, was = c.mode;
            c.manual();
            // a frame the app is owed goes by for real — never more of them, in
            // all, than `ms` of real time would have held
            const until = performance.now() + m;
            const owed = async () => { while (T.framesOwed() > 0 && performance.now() < until) await T.nextFrame(); };
            await owed();
            for (let t = 0; t < m; t += 16.7) { c.step(Math.min(16.7, m - t)); await owed(); }
            if (was === "auto") c.auto();
            // A NATIVE SCROLL IN FLIGHT — a smooth scrollIntoView, the browser's
            // own glide — runs on real frames, which the driven steps above do
            // not give it: let it land (three quiet frames, or as long as the
            // wait asked for), or it stops where the burst left it
            let seen = scrollY, still = 0;
            const quietUntil = performance.now() + Math.max(m, 300);
            while (still < 3 && performance.now() < quietUntil) {
              await T.nextFrame();
              const y = scrollY + [...document.querySelectorAll("[data-declare-scroll]")].reduce((n, e) => n + e.scrollTop + e.scrollLeft, 0);
              still = Math.abs(y - seen) < 0.5 ? still + 1 : 0;
              seen = y;
            }
          }, ms);
          await quiet(Math.max(ms, 1000));
        },
        /** Run in-flight motion to rest DETERMINISTICALLY (driven clock,
         *  in-page, frame-exact), then hand the clock back to rAF. */
        async settleMotion(maxMs = 5000) {
          step("settleMotion");
          const ok = await page.evaluate((m) => {
            const done = window.__declare.clock.settleMotion(m);
            window.__declare.clock.auto();
            return done;
          }, maxMs);
          if (!ok) throw new VerifyAssertion(`motion did not settle within ${maxMs} ms`);
          await atRest();
        },
        async settleData() { step("settleData"); await quiet(); await atRest(); },
        /** Assign an attribute on a live node — the write twin of the asserts'
         *  find-based read. An assignment, so constraints fire exactly as a
         *  handler's write would; a { }-owned slot refuses exactly as it should. */
        async set(path, name, value) {
          step(`set ${path}.${name}`);
          await page.evaluate((p, a, v) => { window.__declare.find(p)[a] = v; }, path, name, value);
        },
        page,
      };

      const fail = (msg) => { throw new VerifyAssertion(msg); };
      // An attribute written with a dot — expect.attr("app", "weekCount.shown") — when
// the part before the dot is a node: the path and the attribute split there.
const nodeAttrHint = async (path, name, v) => {
  if (v !== undefined || !name.includes(".")) return "";
  const head = name.slice(0, name.indexOf(".")), rest = name.slice(name.indexOf(".") + 1);
  const isNode = await page.evaluate((p) => { const n = window.__declare.find(p); return n != null && typeof n === "object" && "children" in n; }, `${path}.${head}`);
  return isNode ? ` — '${head}' is a node, not an attribute: the path is "${path}.${head}" and the attribute "${rest}"` : "";
};
const expect = {
        /** The program sent a request: `method` and a path (a string the
         *  request's path starts with, or a RegExp), optionally how many times
         *  (`count`) and what its body holds (`body`: the fields that must
         *  match). Fails naming the requests that were sent. */
        async request(method, path, { count, body } = {}) {
          await quiet();   // a request just made has reached the log, and come back
          const matches = requests.filter((q) => q.method === method.toUpperCase()
            && (path instanceof RegExp ? path.test(q.path) : q.path.startsWith(path))
            && (body === undefined || bodyHas(q.body, body)));
          const said = requests.map((q) => `${q.method} ${q.path}${q.status !== null ? ` → ${q.status}` : ""}`).join(", ") || "none";
          if (count === undefined ? matches.length === 0 : matches.length !== count)
            fail(`expected ${count === undefined ? "a" : count} ${method.toUpperCase()} ${path}${body !== undefined ? ` with ${JSON.stringify(body)}` : ""} — sent: ${said}`);
          step(`request ${method.toUpperCase()} ${path} ✓`);
        },
        async exists(path) { await node(path); },
        // SHOWN, not just its own slot: a view inside a hidden panel has
        // `visible` true and is not on screen, so the answer is the view's and
        // every ancestor's, with a size — and a failure names what hides it
        async visible(path) {
          const n = await node(path);
          if (n.shown && n.width > 0 && n.height > 0) return;
          const why = !n.visible ? "its own visible is false"
            : !n.shown ? `'${await hider(path)}' above it is hidden`
            : `it has no size (${Math.round(n.width)}×${Math.round(n.height)})`;
          fail(`expected '${path}' visible — it isn't: ${why}`);
        },
        async hidden(path) {
          const n = await node(path);   // a path that names nothing is said, never a pass
          if (n.shown && n.width > 0 && n.height > 0) fail(`expected '${path}' hidden — it is shown (${Math.round(n.width)}×${Math.round(n.height)} at (${Math.round(n.rootX)}, ${Math.round(n.rootY)}))`);
        },
        async attr(path, name, expected) {
          // find(path)[attr] is the LIVE read — it answers for formula-defaulted
          // slots too, where explain()'s value can be absent (a formula has no
          // cell); explain stays the fallback for what find cannot reach.
          const v = await page.evaluate((p, a) => {
            const n = window.__declare.find(p);
            return n != null && a in n ? n[a] : window.__declare.explain(p, a)?.value;
          }, path, name);
          // STRUCTURAL equality: these values crossed the page boundary as
          // JSON, so identity is the wrong comparator — it failed every array
          // while printing two identical-looking values at the reader.
          const same = v === expected || JSON.stringify(v) === JSON.stringify(expected);
          if (!same) {
            const waiting = await page.evaluate(() => globalThis.__declareTimers?.pending?.() ?? 0);
            fail(`expected ${path}.${name} = ${JSON.stringify(expected)}, got ${JSON.stringify(v)}${await nodeAttrHint(path, name, v)}${waiting > 0 ? ` (${waiting} timer${waiting === 1 ? "" : "s"} still waiting — drive.wait(ms) runs them)` : ""}`);
          }
        },
        async approx(path, name, expected, tol = 1) {
          const v = await page.evaluate((p, a) => {
            const n = window.__declare.find(p);
            return n != null && a in n ? n[a] : window.__declare.explain(p, a)?.value;
          }, path, name);
          if (typeof v !== "number" || Math.abs(v - expected) > tol) fail(`expected ${path}.${name} ≈ ${expected} (±${tol}), got ${JSON.stringify(v)}${await nodeAttrHint(path, name, v)}`);
        },
        /** Structural equality on any two values the script already holds —
         *  for reads made through page.evaluate, where identity never holds. */
        equal(actual, expected, label = "values") {
          if (actual !== expected && JSON.stringify(actual) !== JSON.stringify(expected)) {
            fail(`expected ${label} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
          }
        },
        /** The text the view shows — its own, or, for a row or a card, all its
         *  visible descendants' together, in tree order. */
        async text(path, contains) {
          await node(path);
          const said = await page.evaluate((p) => {
            const words = [];
            const walk = (v) => {
              if (v == null || v.visible === false) return;
              if (typeof v.text === "string" && v.text !== "") words.push(v.text);
              for (const c of v.children ?? []) walk(c);
            };
            walk(window.__declare.find(p));
            return words.join(" ");
          }, path);
          if (!said.includes(contains)) {
            const waiting = await page.evaluate(() => globalThis.__declareTimers?.pending?.() ?? 0);
            fail(`expected '${path}' text to contain "${contains}", got "${said}"${waiting > 0 ? ` (${waiting} timer${waiting === 1 ? "" : "s"} still waiting — drive.wait(ms) runs them)` : ""}`);
          }
        },
        async count(path, kind, expected) {
          const n = await node(path);
          let c = 0;
          const walk = (x) => { if (x.kind === kind) c++; x.children.forEach(walk); };
          walk(n);
          if (c !== expected) fail(`expected ${expected} ${kind} under '${path}', found ${c}`);
        },
        async explain(path, name) {
          return page.evaluate((p, a) => window.__declare.explain(p, a), path, name);
        },
        /** The wake trace: start recording, then read what each settle since
         *  changed and what opened it — as data, or as lines. */
        async traceStart(n = 64) { step("trace start"); await page.evaluate((k) => window.__declare.trace.start(k), n); },
        async trace() { return page.evaluate(() => window.__declare.trace.read()); },
        async traceText() { return page.evaluate(() => window.__declare.trace.text()); },
        fail,
      };

      /** Run `work` (a script, a route) with the page watched: if the program
       *  stops answering, the run fails at once, naming the step it was on and
       *  the program's lines it was running. */
      const watched = (work) => watch.during(() => log.length > 0 ? `during ${log[log.length - 1]}` : "the script", work);
      return { page, drive, expect, node, log, pageErrors, thrown, quiet, watched, checks, checkHere };
    };

    return await fn({ openApp });
  } finally {
    await release();
    server.close();
  }
}

// ── rung 5: behavior ────────────────────────────────────────────────────────

// ── rung 4 in a browser: the boot, with real layout and real text ──────────
// The program booted in the Chrome kept running (chrome.mjs), at each window
// asked, and asked rung 4's questions through the page bridge
// (runtime/src/boot-check.ts) — the same questions the headless boot asks, now
// with text measured for real. A boot that does not settle within its budget is
// caught by the watch every page has (below), and the lines it was running quoted.

export async function runBootInBrowser({ compiled, appDir, windows, queries = null, classes = [], budgetMs = 15000 }) {
  return withHost({ compiled, appDir }, async ({ openApp }) => {
    const out = [];
    let first = true;
    for (const w of windows) {
      const record = { ok: false, nodes: 0, ms: 0, errors: [], notes: [], layout: [], unbuilt: [], answers: [], samples: [] };
      const contained = [];
      const t0 = Date.now();
      let app;
      try {
        app = await openApp({ width: w.size[0], height: w.size[1], touch: w.touch, budgetMs, onPage: (p) => {
          // (a message that also hands over the error object already says what it was)
          p.on("console", (m) => { const t = m.text().replace(/(?: JSHandle@\w+)+$/, ""); if (m.type() === "error" && t.startsWith("[Declare] ")) contained.push(t.slice("[Declare] ".length)); });
        } });
      } catch (e) {
        record.errors.push(...(e?.lines ?? [`boot: ${String(e?.message ?? e).split("\n")[0]}`]));
        out.push(record);
        if (e?.lines !== undefined) break;   // a program that runs away does so at every size
        continue;
      }
      record.ms = Date.now() - t0;
      try {
        const r = await app.watched(() => app.page.evaluate((o) => window.__declare.bootCheck(o), { touch: w.touch, realText: true, classes, feed: true, queries: first ? queries : null }));
        Object.assign(record, r);
      } catch (e) {
        record.errors.push(...(e?.lines ?? [`boot: ${String(e?.message ?? e).split("\n")[0]}`]));
      }
      for (const e of app.pageErrors) record.errors.push(`boot: ${e}`);
      for (const c of new Set(contained)) record.errors.push(`boot: ${c}`);
      record.ok = record.errors.length === 0;
      await app.page.close().catch(() => {});
      out.push(record);
      first = false;
    }
    return out;
  });
}

// ── a page that stops answering ─────────────────────────────────────────────
// Every page a rung opens is watched the same way, from before the program's
// first line to its close. The watch asks the page a trivial question every
// moment; a page that leaves it unanswered for the budget is running something
// that does not return. It is paused there — through a debugger enabled before
// the program ran, since a page already caught in a loop cannot be given one —
// the program's own lines on its stack are quoted, and the page is closed from
// the browser's side, so the run fails at once with the line rather than at
// some timeout with none.

/** Race `p` against `ms`; `TIMED_OUT` when the time ran out first. Its timer is
 *  cleared either way, so a watch ended early holds nothing open. */
const TIMED_OUT = Symbol("timed out");
function within(p, ms) {
  let timer;
  return Promise.race([p, new Promise((r) => { timer = setTimeout(() => r(TIMED_OUT), ms); })]).finally(() => clearTimeout(timer));
}

/** A console message's text with its error arguments spelled out (the
 *  browser's own text for `console.error("…", e)` names the error only as a
 *  handle). */
async function consoleText(m) {
  const parts = await Promise.all(m.args().map((h) => h.evaluate((v) => (v instanceof Error ? v.stack ?? v.message : String(v))).catch(() => null)));
  return parts.length > 0 && parts.every((p) => p !== null) ? parts.join(" ") : m.text();
}

/** The lines that say why a boot never came up: what the boot logged as it
 *  failed — its header and the error's own first line, without the runtime's
 *  frames — or, failing that, the page's uncaught errors. Empty when the page
 *  said nothing. */
function bootFailure(said, pageErrors) {
  const lines = [];
  for (const s of said) {
    const rest = s.replace(/^\[Declare\] boot failed\s*(?:—[^:\n]*)?:?\s*/, "").split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("at "));
    lines.push(`boot: the program compiled but did not come up — ${(rest[0] ?? "no reason given").replace(/^Error: /, "")}`);
  }
  if (lines.length === 0) for (const e of pageErrors) lines.push(`boot: the program did not come up — ${e}`);
  return [...new Set(lines)];
}

function watchPage(page, budgetMs) {
  let pausing = false;
  const session = page.target().createCDPSession().then(async (s) => {
    // a `debugger` statement in the program is not a pause the watch asked for
    s.on("Debugger.paused", () => { if (!pausing) s.send("Debugger.resume").catch(() => {}); });
    await s.send("Debugger.enable");
    return s;
  }).catch(() => null);
  const secs = Math.round(budgetMs / 1000);

  /** Resolves once the page has gone the budget without answering; never, while
   *  it answers or after `stop.done`. */
  const silence = async (stop) => {
    const s = await session;
    while (s !== null && !stop.done && !page.isClosed()) {
      const asked = Date.now();
      const answer = s.send("Runtime.evaluate", { expression: "0" }).then(() => true, () => true);
      if (await within(answer, budgetMs) === TIMED_OUT) { if (!stop.done && !page.isClosed()) return; break; }
      await new Promise((r) => setTimeout(r, Math.max(0, 200 - (Date.now() - asked))));
    }
    return new Promise(() => {});
  };

  return {
    /** `work` with the page watched; if the program stops answering, throws a
     *  VerifyAssertion whose `lines` say so, `what` it was doing (or a function
     *  that says, asked then), and where. */
    async during(what, work) {
      const stop = { done: false };
      const SILENT = Symbol("silent");
      const r = await Promise.race([
        Promise.resolve().then(work).then((v) => ({ v }), (e) => ({ e })),
        silence(stop).then(() => SILENT),
      ]);
      stop.done = true;
      if (r !== SILENT) { if ("e" in r) throw r.e; return r.v; }
      if (typeof what === "function") what = what();   // the step it had reached
      const boot = what === "boot";
      const head = boot
        ? `boot: did not settle within ${secs} s — something the boot ran does not finish (a loop whose exit never comes, most often)`
        : `${what}: the program stopped answering for ${secs} s — something it ran does not finish (a loop whose exit never comes, most often)`;
      const quoted = await pausedLines(await session, () => { pausing = true; });
      const lines = [head, ...quoted.map((q) => (boot ? "boot: " : "  ") + q)];
      // left paused (so it answers), and closed from the browser's side
      await within(page.close().catch(() => {}), 2000);
      throw Object.assign(new VerifyAssertion(lines.join("\n")), { lines });
    },
  };
}

/** Pause a page whose program is running away, and quote the program's own
 *  lines on its stack (a body compiled from source has no file: its text is
 *  the clearer name). */
async function pausedLines(s, asking) {
  if (s === null) return [];
  const quoted = [];
  try {
    asking();
    const frames = await within(new Promise((resolve) => { s.once("Debugger.paused", (e) => resolve(e.callFrames)); s.send("Debugger.pause").catch(() => resolve([])); }), 3000);
    for (const f of frames === TIMED_OUT ? [] : frames) {
      if (quoted.length >= 4) break;
      const src = (await s.send("Debugger.getScriptSource", { scriptId: f.location.scriptId })).scriptSource ?? "";
      if (!src.startsWith("(function anonymous(") && !src.startsWith("(async function anonymous(")) continue;
      // a body's first line carries the shared preamble: quote around where it was
      // …past the preamble that unpacks the program's names, which is not its code
      const whole = src.split("\n")[f.location.lineNumber] ?? "";
      const pre = whole.lastIndexOf("} = $d;", f.location.columnNumber ?? 0);
      const full = pre >= 0 ? whole.slice(pre + "} = $d;".length).trimStart() : whole;
      const col = Math.max(0, (f.location.columnNumber ?? 0) - (whole.length - full.length));
      const ret = full.lastIndexOf("return (", col);
      const from = ret >= 0 && col - ret < 70 ? ret : Math.max(0, col - 40);
      let line = full.length <= 110 ? full.trim() : full.slice(from, from + 110).trim();
      line = line.replace(/this\.\$root\./g, "app.").replace(/^"use strict";\s*/, "");
      if (full.length > 110 && from > 0 && ret < 0) line = "…" + line;
      if (full.length > 110 && from + 110 < full.length) line = line + "…";
      if (line !== "" && !quoted.includes(line)) quoted.push(line);
    }
  } catch { /* no stack to report: the budget message stands alone */ }
  if (quoted.length === 0) return [];
  return [`it was running  ${quoted[0]}`, ...quoted.slice(1).map((q) => `  called from  ${q}`)];
}

/** Two frames: what the page applies after a change has been applied, and
 *  presented — and the browser's reports of what shows (IntersectionObserver,
 *  which the renderer's visibility and raster density follow) delivered and
 *  answered. Those come in a task of their own after a frame, so a frame count
 *  alone can beat them; one observer's first report arrives in the same task
 *  as every other observer's. */
function frames(page) {
  return page.evaluate(() => new Promise((r) => {
    const io = new IntersectionObserver(() => {
      io.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    });
    io.observe(document.documentElement);
  }));
}

/** Load an assert or states script. A script that does not parse is said
 *  with its place — Node's import gives a SyntaxError with no line ("missing )
 *  after argument list"), so the file is checked again to find it. */
async function importScript(path) {
  try {
    return await import(pathToFileURL(resolve(path)).href);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    const r = spawnSync(process.execPath, ["--check", resolve(path)], { encoding: "utf8" });
    // Node names the file by its real path (/private/var/… for /var/…): the
    // place is the line that ends in the file's name and a line number
    const said = (r.stderr ?? "").split("\n");
    const base = path.split(/[\\/]/).pop().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const at = said.findIndex((l) => new RegExp(`${base}:\\d+$`).test(l));
    const place = at >= 0 ? `${path}:${said[at].match(/:(\d+)$/)[1]}` : path;
    const code = at >= 0 ? said.slice(at + 1, at + 3).filter((l) => l.trim() !== "") : [];
    throw new VerifyAssertion([`${place} — the script does not parse: ${e.message}`, ...code.map((l) => `  ${l}`)].join("\n"));
  }
}

export async function runBehavior({ compiled, appDir, assertPath, fixturesDir = null, backendClass = "DomBackend", built = null, budgetMs = 15000, url = null, classes = null, skip = [] }) {
  // the writes the script sent to a live service (no fixtures answered them):
  // what they made stays there — a failed run's half-finished story included —
  // so a run reports them
  const writesOf = (app) => fixturesDir !== null ? [] : app.drive.requests()
    .filter((q) => q.method !== "GET" && q.method !== "HEAD").map((q) => `${q.method} ${q.path}`);
  return withHost({ compiled, appDir, fixturesDir, backendClass, built, scrollbars: true, url }, async ({ openApp }) => {
    const failures = [];
    // a script may name the device it runs on — `export const device = { width,
    // height, touch }` — so the app loads once, on it, rather than twice
    const mod = await importScript(assertPath);
    if (typeof mod.default !== "function") throw new VerifyAssertion(`${assertPath} has no default export function`);
    let app;
    try {
      app = await openApp({ ...(mod.device ?? {}), budgetMs, check: classes === null ? null : { classes, skip } });
    } catch (e) {
      if (e?.lines === undefined) throw e;
      return { ok: false, failures: e.lines, log: [] };
    }
    try {
      await app.watched(() => mod.default({ drive: app.drive, expect: app.expect, page: app.page }));
    } catch (e) {
      if (e?.lines !== undefined) { failures.push(...e.lines); return { ok: false, failures, log: app.log, writes: writesOf(app) }; }
      const where = app.log.length > 0 ? ` (after: ${app.log.slice(-3).join(" → ")})` : "";
      // For an unexpected error, the first stack frame is the difference
      // between "my assert threw here" and an anonymous page error a reader
      // cannot distinguish from a runtime crash.
      const frame = e instanceof VerifyAssertion ? "" :
        (String(e?.stack ?? "").split("\n").find((l) => l.includes(".mjs")) ?? "").trim();
      failures.push(`${e instanceof VerifyAssertion ? "" : "unexpected error: "}${e?.message ?? e}${where}${frame ? `\n      at ${frame}` : ""}`);
    }
    if (failures.length === 0) { await app.quiet(2000); await app.checkHere("at the end of the script"); }
    for (const e of app.pageErrors) failures.push(`page error: ${e}`);
    for (const e of new Set(app.thrown)) failures.push(`error: ${e}`);
    return { ok: failures.length === 0, failures, log: app.log, writes: writesOf(app), checks: app.checks };
  });
}

// ── rung 6: named visual states vs blessed baselines ───────────────────────

/** Screenshot the APP's box (the tree's own extent, not the viewport), at the
 *  page's scroll: a route that scrolls the page captures what it scrolled to.
 *
 *  PRESENTED, not just settled. The model can be at rest while the COMPOSITOR
 *  still owes a frame: a `backdrop` (frost) samples what lies beneath and is
 *  re-rastered on the GPU, so a capture taken the instant the model quiesces
 *  can catch the blur one frame stale. Measured as exactly that — the sampler's
 *  frosted `appearance-menu-dark` differing by max Δ 10 over ~0.2% of the image,
 *  perhaps one run in four, and only ever under load. Two frames are the
 *  standard guarantee (the first schedules, the second runs after that frame is
 *  presented), so the pixels being read are the pixels a user would see. */
async function shootApp(page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const app = await page.evaluate(() => {
    const a = window.__declare.inspect();
    return { width: a.width, height: a.height, top: window.scrollY };
  });
  return page.screenshot({
    clip: { x: 0, y: app.top, width: Math.max(1, Math.ceil(app.width)), height: Math.max(1, Math.ceil(app.height)) },
    encoding: "base64",
  });
}

/** A LONG DOCUMENT, captured as a sequence of settled viewport frames instead of
 *  one very tall image.
 *
 *  A document app's extent is its content, which can be many screens; shooting it
 *  whole makes an image nobody can look at, and any single shifted pixel fails the
 *  whole page without saying where. A frame sequence is bounded, and a failure
 *  names the frame — which is the part of the document to go and look at.
 *
 *  Each frame is SETTLED before it is shot, not merely scrolled to: the scroll is
 *  requested through the app's own page scroller, the model is allowed to quiesce
 *  (a virtualized flow builds rows on arrival, prose re-measures), and then the
 *  two-frame present guarantee applies as it does for a whole-app shot. The last
 *  frame is clamped to the document's end, so a document that is not a whole
 *  multiple of the viewport does not get a band of background in its baseline. */
async function shootFrames(page, viewportH) {
  // The document's length is the app's CONTENT extent, not its box. An app that
  // scrolls its own page is exactly viewport-high by construction — reading
  // `height` there gave one frame for a document of any length, which is the
  // whole case this exists for.
  // The document's length is what SCROLLS, not the app's box. An app that scrolls
  // its own page is exactly viewport-high by construction, so reading the box gave
  // one frame for a document of any length — the whole case this exists for. The
  // page's scroll extent is the honest measure, and it is what the scroll below
  // actually moves through; the app's own box is the floor for an app that does
  // not scroll at all.
  const extent = await page.evaluate(() => {
    const a = window.__declare.inspect();
    const doc = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
    return { w: a.width, h: Math.max(a.height ?? 0, doc) };
  });
  const total = Math.max(1, Math.ceil(extent.h));
  const step = Math.max(1, Math.floor(viewportH));
  const tops = [];
  for (let y = 0; y < total; y += step) tops.push(Math.min(y, Math.max(0, total - step)));
  const shots = [];
  for (const top of [...new Set(tops)]) {
    await page.evaluate((y) => { window.scrollTo(0, y); }, top);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    shots.push({
      top,
      data: await page.screenshot({
        clip: { x: 0, y: top, width: Math.max(1, Math.ceil(extent.w)), height: Math.min(step, total - top) },
        encoding: "base64",
      }),
    });
  }
  await page.evaluate(() => { window.scrollTo(0, 0); });
  return shots;
}

/** In-page strict pixel diff (per-channel tolerance): the browser's own PNG
 *  decode — the perceptual suite's technique. Returns { over, max, total }.
 *
 *  `mask` excludes rectangles from the comparison — for regions that measure
 *  the MACHINE rather than the design. The tracker's `loadMs`/`adoptMs` readouts
 *  are the case in point: they render `performance.now()` deltas, so they differ
 *  every run by construction, and no amount of settling or clock-pinning makes
 *  them stable (the animation clock IS performance.now, so freezing it would
 *  stop motion instead). Masking states the truth — this rectangle is not part
 *  of the visual contract — rather than loosening the tolerance everywhere and
 *  going blind to the 1px shifts a chrome change actually produces. */
async function diffPng(page, aBase64, bBase64, tolerance = 4, mask = []) {
  return page.evaluate(async (a, b, tol, boxes) => {
    const load = async (b64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return { d: ctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
    };
    const A = await load(a), B = await load(b);
    if (A.w !== B.w || A.h !== B.h) return { over: -1, max: 0, total: 0, note: `size ${A.w}x${A.h} vs ${B.w}x${B.h}` };
    const masked = new Uint8Array(A.w * A.h);
    for (const r of boxes || []) {
      for (let y = Math.max(0, r.y); y < Math.min(A.h, r.y + r.h); y++) {
        for (let x = Math.max(0, r.x); x < Math.min(A.w, r.x + r.w); x++) masked[y * A.w + x] = 1;
      }
    }
    let over = 0, max = 0;
    for (let p = 0; p < masked.length; p++) {
      if (masked[p]) continue;
      const i = p * 4;
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(A.d[i + k] - B.d[i + k]);
        if (d > max) max = d;
        if (d > tol) { over++; break; }
      }
    }
    return { over, max, total: A.d.length / 4 };
  }, aBase64, bBase64, tolerance, mask);
}

/** Run a states module: capture each named state, bless or compare.
 *  States module default export:
 *    [{ name, viewport?, clock?, scheme?, dpr?, mask?, route?: async ({drive, expect, page}) }]
 *  `clock` (ISO string) pins the wall clock before the app boots — required by
 *  any app whose initial state derives from today, or its baselines rot on
 *  their own. `scheme` pins `prefers-color-scheme` ("light" default, "dark" to
 *  capture a dark state) so a capture never depends on the host machine's own
 *  appearance. `mask` is a list of {x,y,w,h} rectangles excluded from the diff,
 *  for regions that measure the machine (see diffPng). */
export async function runStates({ compiled, appDir, statesPath, baselinesDir, bless = false, fixturesDir = null, backendClass = "DomBackend", tolerance = 4, built = null, budgetMs = 15000, classes = null, skip = [] }) {
  const mod = await importScript(statesPath);
  const states = mod.default;
  if (!Array.isArray(states)) throw new VerifyAssertion(`${statesPath} must default-export an array of states`);
  const suffix = backendClass === "CanvasBackend" ? "-canvas" : "";

  return withHost({ compiled, appDir, fixturesDir, backendClass, built }, async ({ openApp }) => {
    const failures = [];
    const results = [];
    const checks = [];
    const reported = new Set(skip);
    const KNOWN_STATE_KEYS = new Set(["name", "viewport", "clock", "scheme", "dpr", "touch", "mask", "route", "frames"]);
    for (const st of states) {
      for (const k of Object.keys(st)) {
        if (KNOWN_STATE_KEYS.has(k)) continue;
        // Unknown keys used to be IGNORED, which is how an agent shipped
        // `width`/`height` at the top level and got 1024×768 baselines with no
        // warning — a silently-wrong capture is worse than a loud one.
        const hint = k === "width" || k === "height" ? ` — did you mean viewport: { width, height }?` : "";
        console.warn(`states: '${st.name ?? "?"}' has unknown key '${k}' (ignored)${hint}`);
      }
      const viewport = st.viewport ?? { width: 1024, height: 768 };
      let app;
      try {
        app = await openApp({ ...viewport, clock: st.clock ?? null, scheme: st.scheme ?? "light", dpr: st.dpr ?? 1, touch: st.touch === true, budgetMs, check: classes === null ? null : { classes, skip: [...reported] } });
      } catch (e) {
        if (e?.lines === undefined) throw e;
        failures.push(...e.lines.map((l, i) => i === 0 ? `${st.name}: ${l}` : l));
        break;   // a program that runs away as it boots does so in every state
      }
      // a text caret blinks on its own clock: a picture taken mid-blink would
      // differ from its baseline by the caret alone, so a state hides it
      await app.page.addStyleTag({ content: "* { caret-color: transparent !important; }" });
      try {
        // the route and the capture alike, with the page watched
        await app.watched(async () => {
          if (typeof st.route === "function") await st.route({ drive: app.drive, expect: app.expect, page: app.page });
          // LET LATE DATA LAND. The page is `networkidle0` when the program boots,
          // but an `auto` DataSource fetches AFTER that — so a document app can be
          // captured before its own document arrives. The viewer was exactly this:
          // blessed empty at 360×220 one run and full at 1024×768 the next, which
          // makes a baseline a coin toss rather than a fact.
          //
          // Tolerant by construction: an app that never goes idle (a live stream, a
          // poll) simply proceeds after the wait times out, because "no more
          // requests" is a convenience here and never a requirement.
          await app.quiet(5000);
          // AND LET MOTION FINISH. A focus ring travels on springs, a menu opens on
          // one, a dock magnifies on one — so a capture two frames after the model
          // quiesces can still catch a spring mid-flight, and the frame it catches
          // depends on how busy the machine was. That is what made the sampler's
          // `focus-first-tab` differ run to run by tens of channels while nothing
          // about the program changed.
          //
          // `motionBusy` is the shared clock's own answer (inspect.ts stats): true
          // while any animator or spring is still running. Waiting for it makes the
          // captured frame a property of the PROGRAM rather than of the machine.
          // Perpetual motion — a `Time` at `tick = frame`, an idle animation — never
          // rests, so this is a bounded wait and not a requirement; such a state
          // should pin the clock instead.
          try {
            await app.page.waitForFunction(
              () => window.__declare?.stats?.().motionBusy === false,
              { timeout: 5000, polling: 50 });
          } catch { /* perpetual motion: capture it where it is */ }
          // the state, at rest, asked rung 4's layout questions
          await app.checkHere(`in state '${st.name}'`);
          for (const c of app.checks) for (const k of c.flagged) reported.add(k);
          checks.push(...app.checks.map((c) => c.where.startsWith("in state") ? c : { ...c, where: `in state '${st.name}', ${c.where}` }));
          // `frames: true` — a long document, as a sequence of settled viewport
          // frames rather than one very tall image. Each frame is its own baseline,
          // so a failure names the screen to go and look at.
          const shots = st.frames === true
            ? await shootFrames(app.page, viewport.height)
            : [{ top: null, data: await shootApp(app.page) }];
          const base = join(resolve(baselinesDir), `${st.name}@${viewport.width}x${viewport.height}${suffix}`);
          for (let i = 0; i < shots.length; i++) {
            const { top, data: shot } = shots[i];
            const label = top === null ? st.name : `${st.name} frame ${i + 1}/${shots.length} (y ${top})`;
            const file = top === null ? `${base}.png` : `${base}.f${i + 1}.png`;
            if (bless) {
              mkdirSync(dirname(file), { recursive: true });
              writeFileSync(file, Buffer.from(shot, "base64"));
              results.push(`${label}: blessed → ${relative(ROOT, file)}`);
            } else if (!existsSync(file)) {
              failures.push(`${label}: no baseline (${relative(ROOT, file)}) — run with --bless to create it`);
            } else {
              const baseline = readFileSync(file).toString("base64");
              const d = await diffPng(app.page, baseline, shot, tolerance, st.mask ?? []);
              if (d.over !== 0) {
                const actual = file.replace(/\.png$/, ".actual.png");
                writeFileSync(actual, Buffer.from(shot, "base64"));
                failures.push(`${label}: ${d.over === -1 ? d.note : `${d.over} channel values past tolerance (max Δ ${d.max})`} — actual saved to ${relative(ROOT, actual)}`);
              } else {
                results.push(`${label}: matches baseline`);
              }
            }
          }
        });
        for (const e of app.pageErrors) failures.push(`${st.name}: page error: ${e}`);
        for (const e of new Set(app.thrown)) failures.push(`${st.name}: error: ${e}`);
      } catch (e) {
        if (e?.lines !== undefined) failures.push(...e.lines.map((l, i) => i === 0 ? `${st.name}: ${l}` : l));
        else failures.push(`${st.name}: ${e?.message ?? e}`);
      } finally {
        await app.page.close().catch(() => {});
      }
    }
    return { ok: failures.length === 0, failures, results, checks };
  });
}
