// The conformance DRIVER SEAM — two verbs, three backends.
//
// A Declare program must behave the same wherever it runs. Proving that needs
// exactly two things of a host: drive semantic input at MODEL coordinates, and
// ask the program a question. Everything else about a host — CDP, AppKit, a
// DOM, a compositor — is plumbing the conformance question does not care about.
//
//   drive(step)   ["click", x, y] ["move", x, y] ["scroll", x, y, dy, dx]
//                 ["wait", seconds]
//   ask(expr)     any `__declare` expression, evaluated in the program's own
//                 context, returning plain JSON
//
// WHY THIS EXISTS. `desktop-input` proves one behavioural contract twice — six
// DOM tests and three canvas — by writing every step against `page.mouse` and
// `page.evaluate` directly. That works for two hosts that happen to share a
// browser and cannot reach a third: the native host has no CDP, and never will,
// because having no DOM is the point of it. Written against this seam instead,
// one test body runs on all three, and the third column is a constructor
// argument rather than a rewrite.
//
// WHAT MAKES IT POSSIBLE. Both verbs already exist everywhere, in the same
// shape. Model coordinates: the browser's viewport IS model space for a
// top-level app, and Control.swift's `click`/`move`/`scroll` take model points
// deliberately ("no window-origin arithmetic and no drift when the window
// moves"). And `__declare` is now installed on all three hosts, answering
// byte-identical JSON — the reason the ask verb can be one string of code
// rather than a per-host query language.
//
// The two are NOT symmetric in what they can prove, and the tests must respect
// that: this seam carries the LANGUAGE's semantics (what a press resolves to,
// what a scroll moves, what a slot settles to). It carries nothing about the
// platform's own arbitration — touch-action, scroll chaining, compositing —
// which exists only in the browser and must stay in the browser suites.

import { execFileSync } from "node:child_process";
import { CTL_IN, CTL_OUT } from "../../mac-host/app.mjs";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** Modifier spellings: the control channel's vocabulary (Control.swift) mapped
 *  to the browser's. One `["key", "Tab", "shift"]` step, two transports. */
const MODS = { shift: "Shift", cmd: "Meta", meta: "Meta", ctrl: "Control", alt: "Alt", option: "Alt" };

/** A puppeteer-backed host: the DOM and canvas renderers, which differ only by
 *  the `render=` query the page was opened with. */
export function browserDriver(page, label) {
  return {
    label,
    page,
    /** Chrome delivers input only to the FOREGROUND tab. A conformance run
     *  holds one page per renderer open at once, so without this the second
     *  one's `mouse.wheel` never returns — it is not slow, it is never
     *  dispatched, and it reads as a protocol timeout rather than as "this tab
     *  was in the background". Cheap and idempotent. */
    async focus() { await page.bringToFront(); },
    async drive(step) {
      const [verb, ...a] = step;
      if (verb === "wait") return sleep(a[0]);
      if (verb === "move") return page.mouse.move(a[0], a[1]);
      if (verb === "click") {
        await page.mouse.move(a[0], a[1]);
        await sleep(0.05);
        return page.mouse.click(a[0], a[1]);
      }
      if (verb === "scroll") {
        await page.mouse.move(a[0], a[1]);
        await sleep(0.05);
        // a[4] = pinch: a desktop pinch IS a ctrl+wheel (gestures.md), and
        // puppeteer's mouse carries the keyboard's live modifiers, so held
        // Control makes this the browser's own trackpad-pinch spelling
        if (a[4]) {
          await page.keyboard.down("Control");
          await page.mouse.wheel({ deltaY: a[2] ?? 0, deltaX: a[3] ?? 0 });
          await page.keyboard.up("Control");
          return;
        }
        return page.mouse.wheel({ deltaY: a[2] ?? 0, deltaX: a[3] ?? 0 });
      }
      if (verb === "key") {
        for (const m of a.slice(1)) await page.keyboard.down(MODS[m] ?? m);
        await page.keyboard.press(a[0]);
        for (const m of a.slice(1)) await page.keyboard.up(MODS[m] ?? m);
        return;
      }
      // a fast fling: the platform's own gesture at full speed (a wheel burst
      // here), for checks that care what is on screen once it stops, not where
      if (verb === "flick") {
        await page.mouse.move(a[0], a[1]);
        for (let i = 0; i < 30; i++) { await page.mouse.wheel({ deltaY: a[2] * 600 }); await sleep(0.008); }
        return;
      }
      // the viewport changes size (a window resized, a device turned)
      if (verb === "resize") return page.setViewport({ width: a[0], height: a[1] });
      throw new Error(`conform: unknown step ${verb}`);
    },
    ask(expr) {
      // The SAME expression string every host evaluates — that identity is the
      // whole point, so it is passed through untouched rather than translated.
      return page.evaluate(`(() => (${expr}))()`);
    },
  };
}

/** The native host, over the control channel. Same two verbs; the transport is
 *  a FIFO and a screenshot tool instead of CDP, which the caller never sees. */
export function macDriver({ inPath = CTL_IN, outPath = CTL_OUT } = {}) {
  /** One command, one reply — with a HANDSHAKE, because the channel has a race
   *  and the client cannot see it lose.
   *
   *  Control.swift polls the inbox, READS it, and THEN clears it. A write that
   *  lands between those two steps is erased: the command never runs, no reply
   *  is ever written, and the caller simply times out — or worse, moves on
   *  having silently skipped a step. That is what made keyboard conformance a
   *  coin toss: three Tabs sent, two arriving, and focus landing wherever the
   *  survivors left it. Measured 2026-08-01 — two of three probes in a row came
   *  back "(no reply)" while the host was perfectly healthy.
   *
   *  So: wait for the inbox to DRAIN before writing (the host has taken the
   *  previous command and cleared it), then write, then wait for the reply.
   *  A dropped command is now impossible rather than merely unlikely. */
  async function ctl(cmd) {
    for (let i = 0; i < 300 && existsSync(inPath) && readFileSync(inPath, "utf8").trim() !== ""; i++) {
      await sleep(0.02);
    }
    if (existsSync(outPath)) unlinkSync(outPath);
    writeFileSync(inPath, cmd + "\n");
    // Patient on purpose: the host's control poll shares its main loop with
    // compiling and booting a program, so a reply can legitimately be seconds
    // out while `__declareBoot` runs. Too short a wait reports a healthy host
    // as dead — which is itself a coin toss, just a different one.
    for (let i = 0; i < 1500; i++) {
      await sleep(0.02);
      if (existsSync(outPath)) return readFileSync(outPath, "utf8").trim();
    }
    throw new Error("conform: the native host did not answer — is it running with DECLARE_CONTROL=1?");
  }
  return {
    label: "mac",
    ctl,
    async drive(step) {
      const [verb, ...a] = step;
      if (verb === "wait") return sleep(a[0]);
      if (verb === "move") return void (await ctl(`move ${a[0]} ${a[1]}`));
      if (verb === "click") return void (await ctl(`click ${a[0]} ${a[1]}`));
      if (verb === "scroll") return void (await ctl(`scroll ${a[0]} ${a[1]} ${a[2] ?? 0} ${a[3] ?? 0} ${a[4] ? 1 : 0}`));
      if (verb === "key") return void (await ctl(`key ${a.join(" ")}`));
      if (verb === "flick") { for (let i = 0; i < 30; i++) await ctl(`scroll ${a[0]} ${a[1]} ${a[2] * 60} 0 0`); return; }
      if (verb === "resize") return void (await ctl(`resize ${a[0]} ${a[1]}`));
      throw new Error(`conform: unknown step ${verb}`);
    },
    async ask(expr) {
      // `eval` returns the value's string form, so the expression is wrapped to
      // produce JSON on the far side — the one place the transports differ, and
      // it is a serialization detail, not a difference in the question.
      //
      // THE CONTROL PROTOCOL IS LINE-BASED (Control.swift polls the FIFO and
      // splits on newlines), so a multi-line expression would arrive as several
      // commands and only its first line would run — silently, returning
      // whatever that fragment evaluated to. Collapsed to one line here, which
      // is why an `ask` expression may not contain `//` comments: use `/* */`.
      const oneLine = expr.replace(/\s*\n\s*/g, " ");
      const out = await ctl(`eval JSON.stringify((() => (${oneLine}))())`);
      if (out === "undefined" || out === "") return undefined;
      try { return JSON.parse(out); } catch { return out; }
    },
    /** Navigate in process, and wait for the program rather than a fixed sleep
     *  (gate.mjs learned this the hard way: a flat sleep races a cold boot and
     *  measures the PREVIOUS program). */
    async open(url) {
      // A NEW PAGE, natively. The host is one long-lived process where a
      // browser would give each program a fresh document, so the singleton
      // services (Focus's focused view and root, Keys's held-set) carry across
      // `__declareBoot` unless something clears them — which is what made the
      // first keyboard conformance run non-reproducible.
      await ctl("eval typeof __declareReset === 'function' ? __declareReset() : 'no reset verb'");
      const layers = async () => {
        const m = (await ctl("geom")).match(/layers=(\d+)/);
        return m ? +m[1] : NaN;
      };
      const before = await layers();
      await ctl(`eval __declareBoot(${JSON.stringify(url + "?render=mac")}); 'ok'`);
      const t0 = Date.now();
      let changed = Number.isNaN(before), stable = 0, last = NaN;
      while (Date.now() - t0 < 20000) {
        await sleep(0.25);
        const n = await layers();
        if (!changed && n !== before) changed = true;
        stable = n === last ? stable + 1 : 0;
        last = n;
        if (changed && stable >= 2 && Date.now() - t0 > 1500) break;
        if (stable >= 6 && Date.now() - t0 > 3000) break;
      }
      await sleep(1);
    },
  };
}

/** Should this run include the native column? REQUESTED, never inferred.
 *
 *  Mac conformance is deliberately not a per-commit cost: it needs the host
 *  launched, a window server, and a GUI session, so a developer opts in with
 *  `--mac` (or CONFORM_MAC=1) and CI simply does not. Auto-detecting "is a host
 *  running?" was wrong in the other direction — it would silently widen or
 *  narrow what a run proved depending on what happened to be open, which is the
 *  one thing a conformance gate must never do.
 *
 *  Asked for but not there is an ERROR, not a skip: a run that was told to
 *  prove three renderers must never quietly prove two. */
export function macRequested() {
  return process.argv.includes("--mac") || process.env.CONFORM_MAC === "1";
}

export function macLive() {
  try {
    return execFileSync(new URL("../../mac-host/winb", import.meta.url).pathname, { encoding: "utf8" }).trim() !== "";
  } catch {
    return false;
  }
}

/** WebKit (or Firefox) through Playwright: the same two verbs. Opt-in, like the
 *  native column — Playwright is not a dependency, so the run is told where it
 *  is (PLAYWRIGHT_CORE, a path to playwright-core's index.mjs) or finds it
 *  installed; asked for and absent is an error. */
export async function loadPlaywright() {
  const at = process.env.PLAYWRIGHT_CORE;
  try { return at ? await import(at) : await import("playwright-core"); } catch { return null; }
}
export function webkitRequested() {
  return process.argv.includes("--webkit") || process.env.CONFORM_WEBKIT === "1";
}
export function playwrightDriver(page, label) {
  return {
    label,
    page,
    async focus() { await page.bringToFront(); },
    async drive(step) {
      const [verb, ...a] = step;
      if (verb === "wait") return sleep(a[0]);
      if (verb === "move") return page.mouse.move(a[0], a[1]);
      if (verb === "click") { await page.mouse.move(a[0], a[1]); await sleep(0.05); return page.mouse.click(a[0], a[1]); }
      if (verb === "scroll") { await page.mouse.move(a[0], a[1]); await sleep(0.05); return page.mouse.wheel(a[3] ?? 0, a[2] ?? 0); }
      if (verb === "key") {
        for (const m of a.slice(1)) await page.keyboard.down(MODS[m] ?? m);
        await page.keyboard.press(a[0]);
        for (const m of a.slice(1)) await page.keyboard.up(MODS[m] ?? m);
        return;
      }
      if (verb === "flick") {
        await page.mouse.move(a[0], a[1]);
        for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, a[2] * 600); await sleep(0.008); }
        return;
      }
      if (verb === "resize") return page.setViewportSize({ width: a[0], height: a[1] });
      throw new Error(`conform: unknown step ${verb}`);
    },
    ask(expr) { return page.evaluate(`(() => (${expr}))()`); },
  };
}

/** Safari on the iOS simulator, through Appium (XCUITest): ask runs in the
 *  page; a flick is a real touch flick (the simulator's own momentum). No
 *  pointer or keyboard — `click`, `move`, `scroll` and `key` are refused, so a
 *  test says which of its steps a touch host cannot take. Opt-in (--ios),
 *  with an Appium server at APPIUM (default :4723) and a booted simulator
 *  (UDID). */
export function iosRequested() {
  return process.argv.includes("--ios") || process.env.CONFORM_IOS === "1";
}
export async function iosDriver({ appium = process.env.APPIUM ?? "http://127.0.0.1:4723", udid = process.env.UDID } = {}) {
  // The sequence is my-apps/simcheck's, which drives the simulator reliably:
  // navigate from inside the page, wait, then take a FRESH session (navigation
  // breaks the old one's debugger) and find the web context showing the page.
  let base = "";
  // every call has a deadline: a helper that stops answering (WebDriverAgent,
  // the app Appium runs in the simulator for touches) fails the step, never hangs it
  const req = async (method, p, body) => {
    let res;
    try { res = await fetch(base + p, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) }); }
    catch (e) { throw new Error(`conform (ios): ${method} ${p} got no answer in 30 s${p.includes("context") || p.includes("orientation") || /mobile:/.test(JSON.stringify(body ?? "")) ? " — WebDriverAgent (touches, rotation) may have stopped" : ""}`); }
    const j = await res.json();
    if (j.value?.error) throw new Error(`conform (ios): ${p} — ${String(j.value.message).split("\n")[0].slice(0, 200)}`);
    return j.value;
  };
  const session = async () => {
    if (base !== "") await fetch(base, { method: "DELETE" }).catch(() => {});
    // headless: the simulator runs without its window (nothing appears on screen)
    const caps = { platformName: "iOS", "appium:automationName": "XCUITest", browserName: "Safari", "appium:newCommandTimeout": 1800, "appium:isHeadless": true };
    if (udid) caps["appium:udid"] = udid;
    const r = await (await fetch(appium + "/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: { alwaysMatch: caps } }) })).json();
    if (!r.value?.sessionId) throw new Error("conform (ios): Appium gave no session — " + JSON.stringify(r.value).slice(0, 200));
    base = `${appium}/session/${r.value.sessionId}`;
  };
  // the web context showing `at` (Safari may hold other tabs)
  let at = "", ctx = null;
  const web = async () => {
    if (ctx !== null) { await req("POST", "/context", { name: ctx }); return; }
    for (let tries = 0; tries < 20; tries++) {
      for (const c of (await req("GET", "/contexts")).filter((x) => String(x).startsWith("WEBVIEW"))) {
        try {
          await req("POST", "/context", { name: c });
          const href = await req("POST", "/execute/sync", { script: "return location.href", args: [] });
          if (at === "" || String(href).startsWith(at)) { ctx = c; return; }
        } catch { /* the debugger is reattaching after the navigation */ }
      }
      await sleep(1);
    }
    throw new Error("conform (ios): no web context shows " + at);
  };
  await session();
  // touches and rotation go through WebDriverAgent: prove it answers before any scenario needs it
  await req("POST", "/context", { name: "NATIVE_APP" });
  await req("GET", "/window/rect");
  return {
    label: "ios",
    touch: true,
    async open(url) {
      // navigate inside the tab the session holds, then take a fresh session.
      // (Open a program by its DIRECTORY: a `.declare` URL is also the address
      // the page fetches its source from, and the tab the fresh session finds
      // can be one Safari restored from its cache — the source, as text.)
      ctx = null; at = "";
      await web();
      await req("POST", "/execute/sync", { script: "setTimeout(() => { if (location.href === arguments[0]) location.reload(); else location.href = arguments[0]; }, 50); return 1", args: [url] });
      await sleep(8);
      at = url; ctx = null;
      await session();
      await web();
      for (let i = 0; i < 60; i++) {
        if (await req("POST", "/execute/sync", { script: "return typeof __declare !== 'undefined' && typeof __declare.find === 'function' && __declare.find('app') != null", args: [] }) === true) { await sleep(1); return; }
        await sleep(0.5);
      }
      throw new Error(`conform (ios): ${url} shows, but the program never started`);
    },
    async drive(step) {
      const [verb, ...a] = step;
      if (verb === "wait") return sleep(a[0]);
      // (gestures and rotation are Appium's own commands, answered in the web
      // context too: no switch to the native one, which can hang there)
      if (verb === "flick") {
        const up = a[2] > 0;
        await req("POST", "/execute/sync", { script: "mobile: dragFromToWithVelocity", args: [{ fromX: 200, fromY: up ? 650 : 250, toX: 200, toY: up ? 250 : 650, pressDuration: 0.05, holdDuration: 0.01, velocity: 6000 }] });
        return;
      }
      // a phone resizes by turning: wider than tall is landscape
      if (verb === "resize") {
        await req("POST", "/orientation", { orientation: a[0] > a[1] ? "LANDSCAPE" : "PORTRAIT" });
        return;
      }
      throw new Error(`conform (ios): the touch host takes no ${verb} step`);
    },
    // the web context stays selected between questions (each switch is a round
    // trip of its own); a stale one is found again and the question asked once more
    async ask(expr) {
      const q = () => req("POST", "/execute/sync", { script: `return (() => (${expr}))()`, args: [] });
      try { return await q(); }
      catch (first) {
        try { await web(); } catch (again) { throw new Error(`${first.message} — then, finding the page again: ${again.message}`); }
        return q();
      }
    },
    async close() { await fetch(base, { method: "DELETE" }).catch(() => {}); },
  };
}
