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
        return page.mouse.wheel({ deltaY: a[2] ?? 0, deltaX: a[3] ?? 0 });
      }
      if (verb === "key") {
        for (const m of a.slice(1)) await page.keyboard.down(MODS[m] ?? m);
        await page.keyboard.press(a[0]);
        for (const m of a.slice(1)) await page.keyboard.up(MODS[m] ?? m);
        return;
      }
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
export function macDriver({ inPath = "/tmp/declare-ctl.in", outPath = "/tmp/declare-ctl.out" } = {}) {
  async function ctl(cmd) {
    if (existsSync(outPath)) unlinkSync(outPath);
    writeFileSync(inPath, cmd + "\n");
    for (let i = 0; i < 300; i++) {
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
      if (verb === "scroll") return void (await ctl(`scroll ${a[0]} ${a[1]} ${a[2] ?? 0} ${a[3] ?? 0}`));
      if (verb === "key") return void (await ctl(`key ${a.join(" ")}`));
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
