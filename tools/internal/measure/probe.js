// probe.js — TEMPORARY gesture diagnostic (DIAG(probe) — REMOVE with the
// server block in server/create.mjs). Injected into a page by the dev server
// when the URL carries `?probe`; observes browser-level gesture facts a
// Declare handler cannot see — and deliberately declares NOTHING to the
// runtime, so it cannot change the app's own gesture claims (declaring a
// handler IS a claim; a Declare-side probe would distort what it measures).
//
// Batches events → POST /__probe (same origin); the server stamps and appends
// them to tools/internal/measure/probe.jsonl. Also paints a tiny pointer-inert
// HUD so the tester can narrate against what they feel.
(() => {
  const sid = Math.random().toString(36).slice(2, 8);
  const t0 = Date.now();
  const buf = [];
  const log = (kind, data) => { buf.push({ t: Date.now() - t0, k: kind, ...data }); };
  const flush = () => {
    if (buf.length === 0) return;
    const body = JSON.stringify({ sid, events: buf.splice(0, buf.length) });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon("/__probe", body);
      else fetch("/__probe", { method: "POST", body, keepalive: true });
    } catch { /* diagnostics must never break the page */ }
  };
  setInterval(flush, 500);
  addEventListener("pagehide", flush);

  // ── the HUD ────────────────────────────────────────────────────────────────
  const hud = document.createElement("div");
  hud.style.cssText = "position:fixed;left:4px;top:4px;z-index:2147483647;pointer-events:none;" +
    "font:10px/1.4 ui-monospace,monospace;color:#0f0;background:rgba(0,0,0,.65);padding:3px 6px;border-radius:4px;white-space:pre";
  const paintHud = () => {
    const vv = visualViewport;
    hud.textContent =
      `probe ${sid}  tick ${ticks}\n` +
      `scale ${vv ? vv.scale.toFixed(3) : "-"}  vvh ${vv ? Math.round(vv.height) : "-"}\n` +
      `off ${vv ? Math.round(vv.offsetLeft) + "," + Math.round(vv.offsetTop) : "-"}  ` +
      `pg ${Math.round(scrollX)},${Math.round(scrollY)}\n` +
      `fingers ${fingers}  last ${last}`;
  };
  let fingers = 0;
  let last = "-";
  let ticks = 0;
  const note = (s) => { last = s; paintHud(); };
  addEventListener("DOMContentLoaded", () => { document.body.appendChild(hud); paintHud(); });
  if (document.body) { document.body.appendChild(hud); paintHud(); }

  // ── one-time facts at load ─────────────────────────────────────────────────
  const root = () => document.querySelector("[data-declare-app]");
  const meta = () => document.querySelector('meta[name="viewport"]');
  addEventListener("load", () => {
    const r = root();
    log("open", {
      ua: navigator.userAgent,
      touchPoints: navigator.maxTouchPoints,
      dpr: devicePixelRatio,
      inner: [innerWidth, innerHeight],
      vv: visualViewport ? { w: visualViewport.width, h: visualViewport.height, scale: visualViewport.scale } : null,
      meta: meta() ? meta().content : null,
      rootTA: r ? getComputedStyle(r).touchAction : null,
      canvasTA: document.querySelector("canvas") ? getComputedStyle(document.querySelector("canvas")).touchAction : null,
      docH: document.documentElement.scrollHeight,
      url: location.href,
    });
    // The app attaches asynchronously after `load` — poll briefly so the root's
    // realized touch-action (the heart of the claim model) is always captured.
    let tries = 0;
    const poll = setInterval(() => {
      const el = root();
      const cv = document.querySelector("canvas");
      if (el || cv || ++tries > 20) {
        clearInterval(poll);
        const de = document.documentElement;
        const cs = el ? getComputedStyle(el) : null;
        const dcs = getComputedStyle(de);
        log("root", {
          rootTA: el ? cs.touchAction : null,
          canvasTA: cv ? getComputedStyle(cv).touchAction : null,
          meta: meta() ? meta().content : null,
          docH: de.scrollHeight,
          // the page-realization facts: what did THIS engine compute?
          rootOv: cs ? [cs.overflowX, cs.overflowY] : null,
          htmlOv: [dcs.overflowX, dcs.overflowY],
          clientH: de.clientHeight,
          server: !!window.__declareServer,
          // boot timing: navigation start → app-root appearance (this poll tick)
          bootMs: Math.round(performance.now()),
          // the boot ladder's own account: which tier rendered (prewarm/fast/
          // slow) and where the milliseconds went (boot-uniform perfStage)
          perf: window.__declarePerf
            ? {
                path: window.__declarePerf.path || null,
                stages: (window.__declarePerf.stages || []).map(
                  (s) => `${s.stage}:${Math.round(s.dur)}@${Math.round(s.start)}`
                ),
              }
            : null,
          // the network's account: request count, bytes on the wire, and the
          // slowest five resources — transfer vs compute, settled per device
          net: (() => {
            try {
              const res = performance.getEntriesByType("resource");
              return {
                n: res.length,
                bytes: res.reduce((a, e) => a + (e.transferSize || 0), 0),
                slow: res
                  .slice()
                  .sort((a, b) => b.duration - a.duration)
                  .slice(0, 5)
                  .map((e) => `${e.name.split("/").pop().split("?")[0].slice(0, 32)}:${Math.round(e.duration)}`),
              };
            } catch (e) {
              return null;
            }
          })(),
        });
      }
    }, 500);
  });

  // The effective touch-action CHAIN over a point — what the browser actually
  // consults when deciding pan/pinch. Only non-auto entries are interesting.
  const taChain = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const chain = [];
    for (let t = el; t && t !== document.documentElement; t = t.parentElement) {
      const ta = getComputedStyle(t).touchAction;
      const marks =
        (t.dataset && t.dataset.declareApp !== undefined ? "@app" : "") +
        (t.dataset && t.dataset.declareScroll !== undefined ? "@scroll" : "");
      if (ta !== "auto" || marks !== "" || t === el) {
        chain.push(`${t.tagName.toLowerCase()}${marks}:${ta}`);
      }
      if (chain.length >= 6) break;
    }
    return chain;
  };

  // ── viewport + scroll ──────────────────────────────────────────────────────
  // Logged DIRECTLY in the handler, time-throttled — never via rAF: iOS
  // freezes rAF during a pinch, so a rAF-coalesced log turns a continuous
  // zoom into fake steps (seen in the 2026-07-28 iPad session).
  let vvLast = 0;
  let vvScale = 0;
  const vvLog = () => {
    const vv = visualViewport;
    const now = Date.now();
    const s = +vv.scale.toFixed(4);
    if (now - vvLast < 50 && s === vvScale) return;
    vvLast = now;
    vvScale = s;
    log("vv", { scale: s, h: Math.round(vv.height), offT: Math.round(vv.offsetTop), offL: Math.round(vv.offsetLeft) });
    paintHud();
  };
  if (visualViewport) {
    visualViewport.addEventListener("resize", vvLog);
    visualViewport.addEventListener("scroll", vvLog);
  }
  let sQueued = false;
  addEventListener("scroll", (e) => {
    if (e.target === document || e.target === document.documentElement) {
      if (sQueued) return;
      sQueued = true;
      requestAnimationFrame(() => { sQueued = false; log("pagescroll", { x: Math.round(scrollX), y: Math.round(scrollY) }); paintHud(); });
    } else if (e.target instanceof Element) {
      log("elscroll", { el: e.target.tagName.toLowerCase() + (e.target.dataset.declareScroll !== undefined ? "@scroll" : ""), top: Math.round(e.target.scrollTop) });
    }
  }, { capture: true, passive: true });

  // ── touch + pointer + gesture + wheel ──────────────────────────────────────
  const tpoints = (e) => [...e.touches].slice(0, 3).map((t) => [Math.round(t.clientX), Math.round(t.clientY)]);
  addEventListener("touchstart", (e) => {
    fingers = e.touches.length;
    const p = e.touches[0];
    const tgt = p ? document.elementFromPoint(p.clientX, p.clientY) : null;
    const tcs = tgt ? getComputedStyle(tgt) : null;
    log("ts", { n: e.touches.length, pts: tpoints(e), chain: p ? taChain(p.clientX, p.clientY) : [],
      us: tcs ? (tcs.webkitUserSelect || tcs.userSelect) : null });
    note(`ts×${e.touches.length}`);
  }, { capture: true, passive: true });
  addEventListener("touchend", (e) => {
    fingers = e.touches.length;
    log("te", { n: e.touches.length });
    note(`te×${e.touches.length}`);
  }, { capture: true, passive: true });
  addEventListener("touchcancel", (e) => {
    fingers = e.touches.length;
    log("tcancel", { n: e.touches.length });
    note("tcancel");
  }, { capture: true, passive: true });
  addEventListener("pointercancel", (e) => { log("pcancel", { id: e.pointerId, type: e.pointerType }); note("pcancel"); }, { capture: true });
  // iOS-proprietary pinch stream — fires even when touch-action forbids the
  // zoom, so it tells us what the finger DID vs what the browser allowed.
  for (const g of ["gesturestart", "gesturechange", "gestureend"]) {
    addEventListener(g, (e) => {
      log(g.slice(0, 2) === "ge" ? "g" + g.slice(7, 8) : g, { g, scale: e.scale !== undefined ? +e.scale.toFixed(3) : null });
      note(`${g}${e.scale !== undefined ? " " + e.scale.toFixed(2) : ""}`);
    }, { capture: true, passive: true });
  }
  let wheelLast = 0;
  addEventListener("wheel", (e) => {
    const now = Date.now();
    if (now - wheelLast < 120 && !e.ctrlKey) return; // throttle plain scroll-wheel spam
    wheelLast = now;
    log("wheel", { dx: Math.round(e.deltaX), dy: Math.round(e.deltaY), ctrl: e.ctrlKey, x: Math.round(e.clientX), y: Math.round(e.clientY) });
    if (e.ctrlKey) note("wheel+ctrl (pinch)");
  }, { capture: true, passive: true });

  addEventListener("error", (e) => log("err", { msg: String(e.message).slice(0, 200) }));

  // selection activity — the smoking gun for iOS's text-interaction gesture
  // stealing pans over selectable runs: a dead swipe that grows a selection
  // was a selection drag, not a failed scroll
  document.addEventListener("selectionchange", () => {
    const sel = document.getSelection();
    log("sel", { len: sel ? String(sel).length : 0, type: sel ? sel.type : "-" });
  });

  // ── document growth — who gave the page scroll extent? ─────────────────────
  // The homepage is a viewport-sized app (inner scroller); the page should
  // never gain scrollable overflow. When docH grows past the viewport, name
  // the element whose bottom edge defines the new extent.
  let docHLast = 0;
  const culprit = () => {
    let worst = null;
    let worstB = 0;
    const all = document.body.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const cs = getComputedStyle(el);
      if (cs.position === "fixed") continue;
      const r = el.getBoundingClientRect();
      const b = r.bottom + scrollY;
      if (b > worstB) { worstB = b; worst = el; }
    }
    if (worst === null) return null;
    const chain = [];
    for (let t = worst; t && t !== document.body && chain.length < 5; t = t.parentElement) {
      chain.push(t.tagName.toLowerCase() +
        (t.dataset && t.dataset.declareApp !== undefined ? "@app" : "") +
        (t.dataset && t.dataset.declareScroll !== undefined ? "@scroll" : "") +
        (t.id ? "#" + t.id : ""));
    }
    const r = worst.getBoundingClientRect();
    return { bottom: Math.round(worstB), box: [Math.round(r.left + scrollX), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)], chain, text: (worst.textContent || "").slice(0, 40) };
  };
  setInterval(() => {
    const h = document.documentElement.scrollHeight;
    if (h === docHLast) return;
    const grew = h > Math.max(docHLast, innerHeight + 1);
    docHLast = h;
    log("docH", { h, clientH: document.documentElement.clientHeight, ...(grew ? { culprit: culprit() } : {}) });
  }, 1000);

  // ── scroller extent audit — can the pane actually reach its own bottom? ────
  // Every second, find the main scroller and compare its native scroll extent
  // (scrollHeight) against the bottom edge of its deepest PAINTED descendant.
  // A painted bottom past scrollHeight is content the user can only see on
  // overscroll — logged with the offending element's chain. Log on change only.
  let scLast = "";
  setInterval(() => {
    const sc = [...document.querySelectorAll("[data-declare-scroll]")]
      .filter((el) => el.offsetParent !== null && el.clientHeight > 300)
      .sort((a, b) => b.clientHeight - a.clientHeight)[0];
    if (!sc) return;
    const base = sc.getBoundingClientRect().top - sc.scrollTop;
    let maxB = 0;
    let worst = null;
    const all = sc.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.clientWidth === 0 && el.clientHeight === 0) continue;
      const b = el.getBoundingClientRect().bottom - base;
      if (b > maxB) { maxB = b; worst = el; }
    }
    const kidH = sc.firstElementChild ? Math.round(sc.firstElementChild.getBoundingClientRect().height) : 0;
    const key = `${sc.scrollHeight}|${sc.clientHeight}|${Math.round(maxB)}|${kidH}`;
    if (key === scLast) return;
    scLast = key;
    const short = Math.round(maxB) - sc.scrollHeight;
    const chain = [];
    if (short > 1 && worst !== null) {
      for (let t = worst; t && t !== sc && chain.length < 6; t = t.parentElement) {
        const r = t.getBoundingClientRect();
        chain.push(`${t.tagName.toLowerCase()}@${Math.round(r.top - base)}+${Math.round(r.height)}` +
          (getComputedStyle(t).transform !== "none" ? "^T" : ""));
      }
    }
    log("sc", { sh: sc.scrollHeight, ch: sc.clientHeight, top: Math.round(sc.scrollTop),
      painted: Math.round(maxB), short, kidH, ...(chain.length ? { chain, text: (worst.textContent || "").slice(0, 40) } : {}) });
  }, 1000);

  // ── liveness: is the page compositing at all? ──────────────────────────────
  // The HUD's `tick` counter is rAF-driven. Blank screen + counter visibly
  // incrementing = the page composites and the app simply hasn't painted; a
  // frozen counter = rendering itself stalled; no HUD = the probe (or page)
  // never loaded. The stall detector logs when rAF stops for 2s+ while the
  // page is visible (rAF pausing DURING a pinch is normal iOS behavior — a
  // stall matters when no fingers are down).
  let tickLast = Date.now();
  const tick = () => {
    ticks++;
    tickLast = Date.now();
    if (ticks % 30 === 0) paintHud();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setInterval(() => {
    const gap = Date.now() - tickLast;
    if (gap > 2000 && document.visibilityState === "visible") log("stall", { rafGapMs: gap, fingers });
  }, 1000);
  document.addEventListener("visibilitychange", () => log("vis", { state: document.visibilityState }));

  log("probe-boot", {});
})();
