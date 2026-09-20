// driver-exec — the IN-PAGE half of the case runner: it performs a case
// descriptor (cases.mjs) against a mounted app and hands back the meters.
//
// This file is injected into the metered bundle as source text
// (build-runtime.mjs), so it is plain JavaScript with no imports and runs in
// whatever environment the runtime is in: Chrome's DOM and canvas backends, iOS
// Safari, and — through the Mac control channel's `eval` — the native host,
// which has no DOM. THAT IS WHY THE STEP VOCABULARY IS SMALL: everything a case
// needs must be expressible in terms every one of those can perform.
//
// The pointer steps are the exception and are NOT done here on the Mac: a
// browser gets a real PointerEvent from this file, while the Mac adapter
// (exec-mac.mjs) injects a real event through the host's own responder chain.
// Both are "a pointer did this"; neither is a model poke pretending to be one.

// The context — the app, the bindings, the helpers and the step machine. One
// per run in a browser; ONE PERSISTENT ONE on the Mac, where a case arrives as
// several batches of model steps with real input performed between them, and
// the bindings (`@w`, `@s`) have to survive from one batch to the next.
async function makeCtx(opts) {
  opts = opts || {};
  const P = globalThis.__prof;         // the rig's own meters (settle/runs/commit)
  const M = globalThis.__M;            // the hand-placed meters (meters.ts)
  const raf = (fn) => new Promise((r) => requestAnimationFrame((t) => { fn(t); r(); }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => performance.now();

  // ── the app ───────────────────────────────────────────────────────────────
  const findApp = () => {
    if (globalThis.__app && globalThis.__app.width > 0) return globalThis.__app;
    if (typeof document !== "undefined") {
      const el = [...document.querySelectorAll("*")].find((e) => e.__declareApp);
      if (el) { globalThis.__app = el.__declareApp; return el.__declareApp; }
    }
    return null;
  };
  let app = null;
  for (let i = 0; i < 300 && !(app = findApp()); i++) await sleep(100);
  if (!app) throw new Error("no app mounted");
  if (M) M.resetAll();   // a case starts with no landmarks; `reset` steps keep them
  await sleep(opts.settle == null ? 2500 : opts.settle);

  // ── bindings and resolution ───────────────────────────────────────────────
  // "@name" is a binding made by a `bind` step; "app.a.b" walks from the app.
  // A value may also be a small expression string evaluated with `app` and the
  // bindings in scope — kept to reads, because a case that needs real logic is
  // a case that has stopped being data.
  const B = Object.create(null);
  // NAMED RECEIVERS. `@frontWin` and `@scrubber` are things the app made at run
  // time that a case has to be able to address. They were declared in cases.mjs
  // and never wired in here, so every `@frontWin` resolved to undefined and the
  // four cases that use one failed downstream — as `closeWin(undefined)`,
  // `w.rootBounds is not a function`, and a slider with no `input`. Resolved
  // LAZILY, on each use, because the front window is not the same window after
  // one has been opened or closed.
  const RECEIVERS = {
    frontWin: () => app.wm && app.wm.frontWin,
    scrubber: () => FIND(app, (n) => (n && n.scrubber) ? n.scrubber : false),
  };
  const isRef = (v) => typeof v === "string" && v.charAt(0) === "@";
  const expr = (src) => {
    // a bare named receiver, resolved fresh
    const bare = String(src).match(/^@([A-Za-z_$][\w$]*)$/);
    if (bare && !(bare[1] in B) && RECEIVERS[bare[1]]) return RECEIVERS[bare[1]]();
    const names = Object.keys(B);
    // eslint-disable-next-line no-new-func
    const rnames = Object.keys(RECEIVERS).filter((r) => !(r in B));
    const f = new Function("app", "__find", "__menuTitles", ...names, ...rnames,
      "return (" + src.replace(/@([A-Za-z_$][\w$]*)/g, "$1") + ");");
    return f(app, FIND, MENU_TITLES, ...names.map((n) => B[n]), ...rnames.map((r) => RECEIVERS[r]()));
  };
  const val = (v) => {
    if (isRef(v) || (typeof v === "string" && /[@.[(]/.test(v) && !/^[\w\s:,'"-]*$/.test(v))) {
      try { return expr(v); } catch { return v; }
    }
    return v;
  };
  const resolve = (path) => {
    const src = String(path);
    const dot = src.lastIndexOf(".");
    if (dot < 0) return { recv: app, key: src };
    return { recv: expr(src.slice(0, dot)), key: src.slice(dot + 1) };
  };

  const FIND = (n, pred) => {
    if (!n) return null;
    if (pred(n)) return pred(n) === true ? n : pred(n);
    for (const c of n.children || []) { const r = FIND(c, pred); if (r) return r; }
    return null;
  };
  /** The menu-bar title centers, from the MODEL — the x of each title and the
   *  bar's mid-height, so a sweep needs no DOM and works on every host. */
  const MENU_TITLES = (a) => {
    const mb = a.bar && a.bar.mb;
    if (!mb) throw new Error("no menu bar");
    const found = [];
    const walk = (v, d) => {
      if (!v || d > 5) return;
      for (const c of v.children || []) {
        if (c.visible !== false && c.width >= 16 && c.width <= 220 && c.height >= 14 && typeof c.rootBounds === "function") found.push(c);
        walk(c, d + 1);
      }
    };
    walk(mb, 0);
    const barH = a.menuBarH == null ? 32 : a.menuBarH;
    const boxes = found.map((c) => c.rootBounds()).filter((b) => b.y < barH).sort((p, q) => p.x - q.x);
    const y = Math.round(barH / 2);
    const out = [];
    for (const b of boxes) {
      const cx = Math.round(b.x + b.width / 2);
      if (!out.some((p) => Math.abs(p[0] - cx) < 12)) out.push([cx, y]);
    }
    if (out.length < 2) throw new Error("menu titles not found");
    return out;
  };

  // ── pointer: a real event, at root coordinates ────────────────────────────
  let buttons = 0;
  const pointer = (type, x, y) => {
    if (typeof document === "undefined") throw new Error("pointer steps need the host adapter (no DOM here)");
    if (type === "down") buttons = 1; else if (type === "up") buttons = 0;
    const el = document.elementFromPoint(x, y) || document.body;
    const ev = new PointerEvent(
      type === "down" ? "pointerdown" : type === "up" ? "pointerup" : type === "click" ? "click" : "pointermove",
      { clientX: x, clientY: y, pointerType: "mouse", pointerId: 1, isPrimary: true,
        buttons, button: type === "move" ? -1 : 0, bubbles: true, cancelable: true, composed: true });
    el.dispatchEvent(ev);
  };

  // ── frame pacing, recorded for every case ─────────────────────────────────
  const gaps = [];
  let last = 0, going = true;
  const tick = (t) => { if (last) gaps.push(t - last); last = t; if (going) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  const track = [];
  const t0 = now();

  // ── the step machine ──────────────────────────────────────────────────────
  const runSteps = async (steps) => {
    for (const step of steps) {
      if (step.reset) {
        P.reset(); if (M) M.reset(); gaps.length = 0;
        globalThis.__declarePaintStats = { n: 0, ms: 0, full: 0, partial: 0, area: 0 };
        continue;
      }
      if (step.wait != null) { await sleep(step.wait); continue; }
      if (step.frames != null && step.ramp == null) { for (let i = 0; i < step.frames; i++) await raf(() => {}); continue; }
      if (step.bind) { B[step.bind] = val(step.to); if (!B[step.bind] && step.or) throw new Error(step.or); continue; }
      if (step.until) {
        const deadline = now() + (step.timeout || 10000);
        while (now() < deadline && !expr(step.until)) await sleep(100);
        if (!expr(step.until)) throw new Error(step.or || ("condition never held: " + step.until));
        continue;
      }
      if (step.when) { if (expr(step.when)) await runSteps(step.then); continue; }
      if (step.call) {
        const { recv, key } = resolve(step.call);
        const args = (step.args || []).map(val);
        if (step.via === "frame") await raf(() => recv[key].apply(recv, args));
        else recv[key].apply(recv, args);
        continue;
      }
      if (step.set) {
        const { recv, key } = resolve(step.set);
        const to = step.to === "@+1" ? (recv[key] || 0) + 1 : val(step.to);
        if (step.via === "frame") await raf(() => { recv[key] = to; });
        else recv[key] = to;
        continue;
      }
      if (step.ramp) { await ramp(step); continue; }
      if (step.resize) { await resize(step.resize); continue; }
      if (step.pointer) { await doPointer(step); continue; }
      if (step.sweep) { await doSweep(step); continue; }
      throw new Error("unknown step: " + JSON.stringify(step).slice(0, 120));
    }
  };

  /** A ramp writes (or calls) once per frame across a duration or a frame
   *  count. Duration-based ramps take MORE steps on a 120 Hz display than a
   *  60 Hz one — deliberately: it is a fixed wall-clock gesture, and the step
   *  count is reported so two runs can be checked against each other. */
  const ramp = async (step) => {
    const targets = step.ramp.map((p) => (step.as === "call" ? resolve(p) : resolve(p)));
    const from = (step.from || []).map(val), to = (step.to || []).map(val);
    let steps = 0;
    const apply = async (f) => {
      await raf(() => {
        for (let i = 0; i < targets.length; i++) {
          const a = from[i], b = to[i];
          let v = a + (b - a) * f;
          if (step.round) v = Math.round(v);
          const { recv, key } = targets[i];
          if (step.as === "call") recv[key].call(recv, v); else recv[key] = v;
        }
        steps++;
        if (step.track) { try { track.push(expr(step.track)); } catch { /* not available yet */ } }
      });
    };
    if (step.frames != null) { for (let i = 1; i <= step.frames; i++) await apply(i / step.frames); }
    else { const d0 = now(); for (;;) { const f = Math.min(1, (now() - d0) / step.ms); await apply(f); if (f >= 1) break; } }
    rampInfo = { steps, ms: step.ms == null ? null : step.ms };
  };

  /** THE VIEWPORT. In a browser the page cannot resize its own window, so this
   *  writes the app's host extent — the same slots a real resize lands on. The
   *  Mac adapter overrides this step with `liveresize`, which moves a real
   *  window. The result records which was used so the two are never mixed. */
  const resize = async (r) => {
    resizeKind = "model";
    const [w0, h0] = r.from || [app.hostWidth, app.hostHeight];
    const [w1, h1] = r.to;
    if (r.frames) {
      for (let i = 1; i <= r.frames; i++) {
        const f = i / r.frames;
        await raf(() => { app.hostWidth = Math.round(w0 + (w1 - w0) * f); app.hostHeight = Math.round(h0 + (h1 - h0) * f); });
      }
    } else {
      await raf(() => { app.hostWidth = w1; app.hostHeight = h1; });
    }
  };

  const centerOf = (v) => { const b = v.rootBounds(); return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]; };
  const doPointer = async (step) => {
    let at;
    if (step.atView) { const v = val(step.atView); const b = v.rootBounds(); at = [Math.round(b.x + (step.offset ? step.offset[0] : b.width / 2)), Math.round(b.y + (step.offset ? step.offset[1] : b.height / 2))]; }
    else if (step.at === "center") at = [Math.round(app.width / 2), Math.round(app.height / 2)];
    // A RELEASE HAPPENS WHERE THE POINTER IS. `{ pointer: "up" }` carries no
    // coordinate because there is only one place it can mean — and lifting at
    // (0,0) instead would end the drag somewhere the hand never was.
    else if (step.at === undefined && lastAt) at = lastAt;
    else at = val(step.at);
    if (!at) throw new Error(`pointer ${step.pointer}: no coordinate (no "at", and nothing pressed yet)`);
    if (step.pointer === "click") { pointer("down", at[0], at[1]); pointer("up", at[0], at[1]); pointer("click", at[0], at[1]); }
    else pointer(step.pointer, at[0], at[1]);
    lastAt = at;
  };

  const doSweep = async (step) => {
    if (step.sweep === "zigzag") {
      // A FIXED NUMBER OF MOVES. Timed for a fixed duration instead, a faster
      // host fits more frames into the window, makes more moves, and crosses
      // more view boundaries — so the two trees record different hover counts
      // and the pair is not comparable (53 vs 60 on the Mac, where every move
      // is a round trip). The gesture is the same everywhere; what differs is
      // how long it takes, which is the measurement.
      const W = app.width, H = app.height, ROWS = step.rows || 9, N = step.moves || 120;
      for (let i = 1; i <= N; i++) {
        const f = i / N;
        const row = Math.min(ROWS - 1, Math.floor(f * ROWS)), along = (f * ROWS) % 1;
        await raf(() => pointer("move",
          Math.round(8 + (row % 2 === 0 ? along : 1 - along) * (W - 16)),
          Math.round(8 + (row + 0.5) / ROWS * (H - 16))));
      }
      return;
    }
    if (step.sweep === "loop") {
      const v = val(step.around), b = v.rootBounds();
      const x0 = lastAt ? lastAt[0] : Math.round(b.x + b.width / 2);
      const y0 = lastAt ? lastAt[1] : Math.round(b.y + 12);
      const [rx, ry] = step.radius;
      const d0 = now();
      for (;;) {
        const f = Math.min(1, (now() - d0) / step.ms), a = f * Math.PI * 2;
        await raf(() => pointer("move", Math.round(x0 + rx * Math.sin(a)), Math.round(y0 + ry * (1 - Math.cos(a)))));
        if (f >= 1) break;
      }
      return;
    }
    // an explicit path: each point dwelled on, `passes` times
    const pts = val(step.sweep);
    for (let pass = 0; pass < (step.passes || 1); pass++) {
      for (const p of pts) {
        for (let k = 0; k < 6; k++) await raf(() => pointer("move", p[0] - 6 + 2 * k, p[1]));
        await sleep(step.dwell || 200);
      }
    }
  };

  let rampInfo = null, resizeKind = null, lastAt = null;
  return {
    app, runSteps, stop: () => { going = false; },
    read: () => {
      const ms = now() - t0;
      return { ms, rampInfo, resizeKind, gaps, track, P, M };
    },
  };
}

globalThis.__profExec = async function (desc, opts) {
  const ctx = await makeCtx(opts || {});
  let failure = null;
  try { await ctx.runSteps(desc.steps); }
  catch (e) { failure = String(e && e.message ? e.message : e); }
  ctx.stop();
  const { ms, rampInfo, resizeKind, gaps, track, P, M } = ctx.read();
  gaps.sort((a, b) => a - b);
  const pct = (p) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] : 0);
  return {
    case: desc.name, ms, failure,
    meters: M ? M.snapshot() : null,
    prof: P.snapshot(),
    paint: globalThis.__declarePaintStats || null,
    gaps: { n: gaps.length, p50: pct(0.5), p95: pct(0.95), max: gaps.length ? gaps[gaps.length - 1] : 0,
            over20: gaps.filter((g) => g > 20).length, over33: gaps.filter((g) => g > 33).length },
    ramp: rampInfo, resizeKind, track: track.length ? { n: track.length, mean: track.reduce((s, x) => s + x, 0) / track.length } : null,
  };
};

/** THE MAC ENTRY POINT. The native adapter (exec-mac.mjs) performs pointer,
 *  sweep and resize itself — there is no DOM here — and sends every other step
 *  through this, in batches, over the control channel's `eval`. The context is
 *  kept on globalThis so a `bind` made in one batch is still there in the next.
 *  Returns a plain object (stringified by the caller), never a promise the
 *  channel cannot await: the host's `eval` resolves it before replying. */
globalThis.__profExecSteps = function (steps) {
  // ⚠ FIRE AND POLL, NOT AWAIT. The control channel's `eval` hands back the
  // value's STRING FORM, and the string form of a promise is "[object Promise]"
  // — so an `await` on the node side returns the instant the batch STARTS. Each
  // batch was being sent over the top of the one still running: four window
  // opens recorded one, six mode changes recorded one, and the settle windows
  // closed before the work happened (4-19 ms rows that looked plausible).
  // Completion is published HERE and polled by the adapter.
  const run = (globalThis.__caseRun = { done: false, failure: null });
  (async () => {
    try {
      if (!globalThis.__caseCtx) globalThis.__caseCtx = await makeCtx({ settle: 0 });
      await globalThis.__caseCtx.runSteps(steps);
    } catch (e) { run.failure = String(e && e.message ? e.message : e); }
    finally { run.done = true; }
  })();
  return "started";
};
