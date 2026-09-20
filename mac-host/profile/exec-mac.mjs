// exec-mac — the Mac half of the case runner.
//
// The native host has no DOM, so the in-page executor (driver-exec.js) cannot
// perform the pointer steps there: `document.elementFromPoint` does not exist
// and a synthetic `PointerEvent` has nothing to dispatch to. Everything else it
// CAN do, because the model steps are just reads and writes against the mounted
// app, and the host will run them through the control channel's `eval`.
//
// So this adapter splits a case in two:
//
//   model steps    call / set / ramp / until / bind / when / wait / frames
//                  → handed to the in-page executor verbatim, over `eval`.
//   input steps    pointer / sweep / resize
//                  → performed HERE, through Control.swift's own verbs
//                    (`move`, `down`, `up`, `click`, `liveresize`), which put a
//                    real event into the responder chain. A synthetic model
//                    poke would measure a different thing and quietly call it
//                    a drag.
//
// The split is per STEP, not per case, so an interactive case runs its model
// setup and its real input in the right order rather than being skipped.

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

// WHICH HOST THIS IS TALKING TO. The two measurement apps run at the same time
// — "Declare Mac Before" and "Declare Mac After", each with its own control
// pipe — so the pipe is a PARAMETER, never the ambient one from app.mjs.
// Reading the ambient pipe here is how a round measures one app twice and
// labels the second run with the other tree's name.
let CTL_IN = process.env.DECLARE_CTL_PIPE ?? "/tmp/declare-ctl.in";
let CTL_OUT = CTL_IN.replace(/\.in$/, "") + ".out";
export function usePipe(pipe) {
  CTL_IN = pipe;
  CTL_OUT = pipe.replace(/\.in$/, "") + ".out";
}
/** The pipe a measurement tree's host listens on. */
export const pipeForTree = (treeDir) =>
  `/tmp/declare-ctl-${path.basename(treeDir).toLowerCase()}.in`;

/** One control-channel round trip. The pipe is request/response with the reply
 *  written to a second file, so a missing reply means the host is wedged or was
 *  never started with DECLARE_CONTROL=1 — said plainly rather than hung on. */
export async function ctl(cmd, { timeout = 8 } = {}) {
  if (existsSync(CTL_OUT)) unlinkSync(CTL_OUT);
  writeFileSync(CTL_IN, cmd + "\n");
  for (let i = 0; i < timeout * 50; i++) {
    await sleep(0.02);
    if (existsSync(CTL_OUT)) return readFileSync(CTL_OUT, "utf8").trim();
  }
  throw new Error(`no reply to "${cmd.slice(0, 40)}" — is the host running with DECLARE_CONTROL=1?`);
}

/** Evaluate JS in the host and get JSON back.
 *
 *  ⚠ THE SOURCE GOES RAW, and on ONE LINE. `eval` takes the rest of the command
 *  as source — quoting the whole thing (`eval "typeof x"`) makes the host
 *  evaluate a STRING LITERAL and hand the text straight back, which reads
 *  exactly like a working call returning a useless answer: every probe here
 *  echoed its own source and the navigation looked like a silent mount failure.
 *  The control channel is line-based, so a multi-line source is collapsed to
 *  one line before it is sent. Structured values are stringified on the far
 *  side, because what comes back is text. */
export async function evalIn(src, { timeout = 30 } = {}) {
  const line = String(src).replace(/\s*\n\s*/g, " ");
  const out = await ctl("eval " + line, { timeout });
  if (out === null) return null;
  try { return JSON.parse(out); } catch { return out; }
}

const INPUT_STEP = (s) => s.pointer !== undefined || s.sweep !== undefined || s.resize !== undefined;

/** Ask the host where a view is, in root coordinates — the same numbers the
 *  in-page executor reads, so a sweep lands in the same place on both. */
async function boundsOf(expr) {
  return evalIn(`(() => { const b = (${expr}).rootBounds(); return JSON.stringify([Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]); })()`);
}

async function menuTitles() {
  return evalIn(`(() => {
    const a = globalThis.__app, mb = a.bar && a.bar.mb; if (!mb) throw new Error("no menu bar");
    const found = []; const walk = (v, d) => { if (!v || d > 5) return; for (const c of v.children || []) {
      if (c.visible !== false && c.width >= 16 && c.width <= 220 && c.height >= 14 && typeof c.rootBounds === "function") found.push(c); walk(c, d + 1); } };
    walk(mb, 0);
    const barH = a.menuBarH == null ? 32 : a.menuBarH;
    const boxes = found.map((c) => c.rootBounds()).filter((b) => b.y < barH).sort((p, q) => p.x - q.x);
    const y = Math.round(barH / 2); const out = [];
    for (const b of boxes) { const cx = Math.round(b.x + b.width / 2); if (!out.some((p) => Math.abs(p[0] - cx) < 12)) out.push([cx, y]); }
    return JSON.stringify(out);
  })()`);
}

/** Perform one input step with the host's own verbs. */
async function doInput(step, env) {
  if (step.resize) {
    const [w1, h1] = step.resize.to;
    // THE HOST RESIZES ITS OWN WINDOW. `liveresize` drives the real resize path
    // — the one a person dragging a corner takes — instead of writing the app's
    // host extent, which is what a browser has to settle for.
    if (step.resize.frames) {
      const [w0, h0] = step.resize.from ?? [1280, 828];
      await ctl(`liveresize ${w0} ${h0} ${w1} ${h1} ${step.resize.frames}`, { timeout: 30 });
    } else {
      await ctl(`resize ${w1} ${h1}`, { timeout: 20 });
    }
    env.resizeKind = "host";
    return;
  }
  if (step.pointer) {
    let at;
    if (step.atView) {
      const b = await boundsOf(env.expand(step.atView));
      at = [b[0] + (step.offset ? step.offset[0] : Math.round(b[2] / 2)), b[1] + (step.offset ? step.offset[1] : Math.round(b[3] / 2))];
    } else if (step.at === "center") {
      const wh = await evalIn(`JSON.stringify([Math.round(globalThis.__app.width/2), Math.round(globalThis.__app.height/2)])`);
      at = wh;
    } else if (typeof step.at === "string" && step.at.startsWith("@titles")) {
      const t = env.titles ?? (env.titles = await menuTitles());
      at = t[Number((step.at.match(/\[(\d+)\]/) ?? [, 0])[1])];
    } else if (step.at === undefined && env.lastAt) {
      at = env.lastAt;          // a release happens where the pointer is
    } else {
      at = step.at;
    }
    if (!at) throw new Error(`pointer ${step.pointer}: no coordinate`);
    if (step.pointer === "click") await ctl(`click ${at[0]} ${at[1]}`);
    else await ctl(`${step.pointer} ${at[0]} ${at[1]}`);
    env.lastAt = at;
    return;
  }
  if (step.sweep === "zigzag") {
    const wh = await evalIn(`JSON.stringify([globalThis.__app.width, globalThis.__app.height])`);
    const [W, H] = wh, ROWS = step.rows ?? 9, N = step.moves ?? 120;
    // the same fixed count the browser makes — the gesture is the constant
    for (let i = 1; i <= N; i++) {
      const f = i / N;
      const row = Math.min(ROWS - 1, Math.floor(f * ROWS)), along = (f * ROWS) % 1;
      await ctl(`move ${Math.round(8 + (row % 2 === 0 ? along : 1 - along) * (W - 16))} ${Math.round(8 + (row + 0.5) / ROWS * (H - 16))}`);
    }
    return;
  }
  if (step.sweep === "loop") {
    const b = await boundsOf(env.expand(step.around));
    const x0 = env.lastAt ? env.lastAt[0] : b[0] + Math.round(b[2] / 2);
    const y0 = env.lastAt ? env.lastAt[1] : b[1] + 12;
    const [rx, ry] = step.radius, DUR = step.ms ?? 3000;
    const t0 = Date.now();
    for (;;) {
      const f = Math.min(1, (Date.now() - t0) / DUR), a = f * Math.PI * 2;
      await ctl(`move ${Math.round(x0 + rx * Math.sin(a))} ${Math.round(y0 + ry * (1 - Math.cos(a)))}`);
      if (f >= 1) break;
    }
    return;
  }
  // an explicit path (the menu titles)
  const pts = typeof step.sweep === "string" ? (env.titles ?? (env.titles = await menuTitles())) : step.sweep;
  for (let pass = 0; pass < (step.passes ?? 1); pass++) {
    for (const p of pts) {
      for (let k = 0; k < 6; k++) await ctl(`move ${p[0] - 6 + 2 * k} ${p[1]}`);
      await sleep((step.dwell ?? 200) / 1000);
    }
  }
}

/** Run one case against the running Mac host. */
export async function runCaseOnMac(desc, { settle = 2500, tree = null, pipe = null, origin = null } = {}) {
  if (pipe) usePipe(pipe);
  else if (tree) usePipe(pipeForTree(tree));
  // LIVENESS IS A PING, not a file test. The control pipe is written by the
  // caller and CONSUMED by the host, so `existsSync` on it is false most of the
  // time — including immediately after a ping that answered "ok". Asking is the
  // only honest test of whether anything is listening.
  const alive = await ctl("ping", { timeout: 10 }).catch(() => null);
  if (alive !== "ok") throw new Error(`no host on ${CTL_IN} — start it with DECLARE_CONTROL=1 DECLARE_CTL_PIPE=${CTL_IN}`);

  // NAVIGATE THIS HOST TO THIS CASE'S PROGRAM. The app boots on whatever
  // DECLARE_URL it was launched with; a case names its own program, and the
  // host is navigated IN PROCESS (`__declareBoot`) rather than relaunched —
  // the same move the fidelity gate makes, for the same reason: one launch
  // covers a whole corpus.
  if (origin) {
    const url = `${origin}/${desc.app}?render=mac`;
    // A FAILURE TO LOAD IS NOT ONLY ON SCREEN. The host records what a person
    // would have been shown and `lasterror` hands it over (Control.swift;
    // ProgramWindow's own comment says a harness should read the state rather
    // than hang on a modal). It was never asked — so a round against a host
    // sitting on "Could not load this program" reported a mount timeout with no
    // reason, and the reason was visible the whole time. Captured BEFORE the
    // navigation, because the value persists: only a CHANGE belongs to this one.
    const errBefore = await ctl("lasterror", { timeout: 10 });
    await evalIn(`__declareBoot(${JSON.stringify(url)}); "ok"`, { timeout: 60 });
    // ⚠ THE HOST IS SINGLE-THREADED WHILE IT COMPILES. A cold `desktop.declare`
    // compile can run past a 20 s control timeout, and the probe below queues
    // BEHIND it — so a healthy host looked dead and the round aborted on its
    // first case. The probe waits as long as the navigation itself is allowed
    // to, and a timed-out probe is retried rather than thrown: the question
    // "has it mounted yet" has no wrong answer, only a late one.
    const deadline = Date.now() + 120000;
    for (;;) {
      // ⚠ "AN APP IS MOUNTED" IS NOT "THE PROGRAM LOADED". The error page is
      // itself a Declare program, so a failed load mounts IT — `__app` is set,
      // its width is real, and a readiness check that asks only "is something
      // up?" says yes. The runner would then drive the error page and report
      // its numbers as the case's. Ask WHICH program is up: mac-boot publishes
      // the current one as `__declareMain`.
      let st;
      try {
        st = await evalIn(`(() => { const a = globalThis.__app; return JSON.stringify({ w: a ? a.width : 0, main: String(globalThis.__declareMain || "") }); })()`, { timeout: 45 });
      } catch { st = null; }                       // busy compiling; ask again
      if (st === null) {
        if (Date.now() > deadline) throw new Error(`the host never answered while loading ${url}`);
        await sleep(0.5);
        continue;
      }
      const { w, main } = typeof st === "string" ? JSON.parse(st) : st;
      const wanted = url.split("?")[0];
      if (w > 0 && main.split("?")[0] === wanted) break;
      const errNow = await ctl("lasterror", { timeout: 10 });
      if (errNow !== "-" && errNow !== errBefore) throw new Error(`the host could not load ${url}: ${errNow}`);
      if (w > 0 && /platform-apps\/error/.test(main)) throw new Error(`the host is showing its ERROR PAGE instead of ${url} (lasterror: ${errNow})`);
      if (Date.now() > deadline) throw new Error(`the program never mounted within 60 s: ${url} (showing: ${main || "nothing"}; lasterror: ${errNow})`);
      await sleep(0.3);
    }
  }
  const env = { lastAt: null, titles: null, resizeKind: null, expand: (r) => String(r).replace(/^@/, "globalThis.__caseB.") };
  // A CASE STARTS CLEAN. The host is long-lived and runs case after case, so
  // the bindings and the landmarks from the last one have to go — otherwise a
  // later case inherits an earlier one's marks and its fairness check passes on
  // evidence that belongs to something else.
  await evalIn(`globalThis.__caseB = {}; globalThis.__caseCtx = null; if (globalThis.__M) globalThis.__M.resetAll(); "ok"`);
  await sleep(settle / 1000);

  // start the frame/meter window the same way the page does
  await evalIn(`(() => { globalThis.__caseGaps = []; return "ok"; })()`);

  const t0 = Date.now();
  let failure = null;
  try {
    // Model steps run in the host; input steps run here. Consecutive model
    // steps are batched into ONE eval so the round trips do not become the
    // thing being measured.
    let batch = [];
    const flush = async () => {
      if (batch.length === 0) return;
      const sent = batch; batch = [];
      // START it, then WAIT FOR IT. `eval` cannot await — it returns the value's
      // string form, and a promise's is "[object Promise]" — so completion is
      // published on `__caseRun` and polled here. Without this each batch was
      // sent over the top of the one still running.
      await evalIn(`globalThis.__profExecSteps(${JSON.stringify(sent)})`, { timeout: 30 });
      const deadline = Date.now() + 180000;
      for (;;) {
        const st = await evalIn(`(() => { const r = globalThis.__caseRun; return r ? JSON.stringify({ d: r.done, f: r.failure }) : '{"d":true,"f":"no run"}'; })()`, { timeout: 20 });
        const st2 = typeof st === "string" ? JSON.parse(st) : st;
        if (st2.d) { if (st2.f) throw new Error(st2.f); break; }
        if (Date.now() > deadline) throw new Error("a step batch did not finish within 180 s");
        await sleep(0.25);
      }
    };
    for (const step of desc.steps) {
      if (INPUT_STEP(step)) { await flush(); await doInput(step, env); }
      else batch.push(step);
    }
    await flush();
  } catch (e) {
    failure = String(e?.message ?? e);
  }

  const meters = await evalIn(`JSON.stringify(globalThis.__M ? globalThis.__M.snapshot() : null)`, { timeout: 30 });
  const stats = await ctl("stats", { timeout: 20 });
  return { case: desc.name, ms: Date.now() - t0, failure, meters, hostStats: stats, resizeKind: env.resizeKind ?? "host" };
}
