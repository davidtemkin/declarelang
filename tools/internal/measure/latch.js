// latch.js — shared instrument for the PAN-LATCH experiment (DIAG(probe) —
// REMOVE with the rest of the rig). Question under test: is Safari's
// scroll-latch absolute for an OVERFLOW PANE while a DOCUMENT scroll can
// upgrade to pinch-zoom mid-gesture? Two matched pages (latch-doc.html /
// latch-pane.html) load this; every touch/pointer/gesture/viewport event is
// logged raw to the dev server's /__probe recorder, plus derived events that
// measure the latch variables directly:
//   spread-shape — finger 2 landed: its latency after finger 1 and how far
//                  finger 1 had traveled by then (THE latch predictors);
//   latch        — pointercancel with one finger down: the pan commit, with
//                  ms-since-touchdown and finger-1 travel at commit;
//   verdict      — gesture over: did the viewport scale actually move?
window.initLatch = (pg) => {
  const sid = Math.random().toString(36).slice(2, 8);
  let tag = "-";           // which scripted move the tester is performing
  let ta = "pan-y pinch-zoom"; // the scroll surface's touch-action condition
  const t0 = performance.now();
  const now = () => Math.round(performance.now() - t0);
  const buf = [];
  const log = (k, data) => { buf.push({ t: now(), k, pg, tag, ...data }); paint(); };
  setInterval(() => {
    if (buf.length === 0) return;
    const body = JSON.stringify({ sid, events: buf.splice(0, buf.length) });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon("/__probe", body);
      else fetch("/__probe", { method: "POST", body, keepalive: true });
    } catch { /* never break the page */ }
  }, 400);
  addEventListener("pagehide", () => {
    try { navigator.sendBeacon("/__probe", JSON.stringify({ sid, events: buf })); } catch { /* ditto */ }
  });

  // ── HUD + phase buttons ────────────────────────────────────────────────────
  const hud = document.createElement("div");
  hud.style.cssText = "position:fixed;right:8px;top:8px;z-index:99999;pointer-events:none;" +
    "font:12px/1.5 ui-monospace,monospace;color:#0f0;background:rgba(0,0,0,.75);padding:6px 10px;border-radius:6px;white-space:pre;text-align:right";
  let lastNote = "-";
  const paint = () => {
    const vv = visualViewport;
    hud.textContent = `${pg}  sid ${sid}\nphase ${tag}   ta ${ta}\n` +
      `scale ${vv ? vv.scale.toFixed(3) : "-"}  fingers ${fingers}\n${lastNote}`;
  };
  const bar = document.createElement("div");
  bar.style.cssText = "position:fixed;left:8px;top:8px;z-index:99999;display:flex;gap:8px;touch-action:manipulation";
  const IDLE = "font:14px system-ui;padding:10px 14px;border-radius:8px;border:1px solid #0f0;background:#032;color:#0f0";
  const ACTIVE = "font:15px system-ui;font-weight:700;padding:10px 14px;border-radius:8px;border:2px solid #ff0;background:#ff0;color:#000";
  const phaseBtns = {};
  const setPhase = (p) => {
    tag = p;
    for (const [k, b] of Object.entries(phaseBtns)) b.style.cssText = k === p ? ACTIVE : IDLE;
    log("phase", {});
  };
  const mkBtn = (label, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = IDLE;
    b.addEventListener("click", fn);
    bar.appendChild(b);
    return b;
  };
  phaseBtns.A = mkBtn("A deliberate", () => setPhase("A"));
  phaseBtns.B = mkBtn("B sloppy", () => setPhase("B"));
  phaseBtns.C = mkBtn("C after-flick", () => setPhase("C"));
  const other = pg === "doc" ? "pane" : "doc";
  const jump = mkBtn(`→ ${other.toUpperCase()} page`, () => { location.href = `/latch-${other}`; });
  jump.style.background = "#a40";
  jump.style.borderColor = "#fa0";
  jump.style.color = "#fff";
  const taBtn = mkBtn("TA: declare", () => {
    ta = ta === "pan-y pinch-zoom" ? "auto" : "pan-y pinch-zoom";
    document.querySelectorAll("[data-latch-surface]").forEach((el) => { el.style.touchAction = ta; });
    taBtn.textContent = ta === "auto" ? "TA: AUTO" : "TA: declare";
    taBtn.style.background = ta === "auto" ? "#065" : "#032";
    log("ta-set", { ta });
  });
  addEventListener("DOMContentLoaded", () => { document.body.append(bar, hud); paint(); });

  // ── raw streams ────────────────────────────────────────────────────────────
  let fingers = 0;
  // the current gesture's shape, for the derived events
  let g = null; // { t1, x1, y1, lastX, lastY, twoAt, canceledAt, scale0, maxScale, moved }
  const ids = (e) => [...e.touches].map((t) => t.identifier % 1000);
  const pts = (e) => [...e.touches].slice(0, 3).map((t) => [Math.round(t.clientX), Math.round(t.clientY)]);
  addEventListener("touchstart", (e) => {
    fingers = e.touches.length;
    if (e.touches.length === 1) {
      const p = e.touches[0];
      g = { t1: now(), x1: p.clientX, y1: p.clientY, lastX: p.clientX, lastY: p.clientY,
        twoAt: null, canceledAt: null, scale0: visualViewport ? visualViewport.scale : 1, maxDev: 0 };
    } else if (e.touches.length === 2 && g !== null && g.twoAt === null) {
      g.twoAt = now();
      const travel = Math.hypot(g.lastX - g.x1, g.lastY - g.y1);
      log("spread-shape", { lat: g.twoAt - g.t1, travel: Math.round(travel), afterCancel: g.canceledAt !== null });
    }
    log("ts", { n: e.touches.length, ids: ids(e), pts: pts(e) });
    lastNote = `ts×${e.touches.length}`;
  }, { capture: true, passive: true });
  addEventListener("touchmove", (e) => {
    if (g !== null && e.touches.length >= 1) {
      const p = e.touches[0];
      g.lastX = p.clientX; g.lastY = p.clientY;
    }
    log("tm", { n: e.touches.length, ids: ids(e), pts: pts(e) });
  }, { capture: true, passive: true });
  const endGesture = (kind, e) => {
    fingers = e.touches.length;
    log(kind, { n: e.touches.length, ids: ids(e) });
    if (g !== null && e.touches.length === 0) {
      const vv = visualViewport;
      const zoomed = vv ? Math.abs(vv.scale - g.scale0) > 0.01 : false;
      log("verdict", { zoomed, twoFingers: g.twoAt !== null, latched: g.canceledAt !== null,
        scaleFrom: +g.scale0.toFixed(3), scaleTo: vv ? +vv.scale.toFixed(3) : null });
      lastNote = zoomed ? "→ ZOOMED" : g.canceledAt !== null ? "→ latched (scroll)" : "→ no zoom";
      g = null;
      paint();
    }
  };
  addEventListener("touchend", (e) => endGesture("te", e), { capture: true, passive: true });
  addEventListener("touchcancel", (e) => endGesture("tcancel", e), { capture: true, passive: true });
  addEventListener("pointerdown", (e) => log("pd", { id: e.pointerId % 1000, primary: e.isPrimary }), { capture: true, passive: true });
  addEventListener("pointerup", (e) => log("pu", { id: e.pointerId % 1000 }), { capture: true, passive: true });
  addEventListener("pointercancel", (e) => {
    if (g !== null && g.canceledAt === null) {
      g.canceledAt = now();
      const travel = Math.hypot(g.lastX - g.x1, g.lastY - g.y1);
      log("latch", { sinceTs: g.canceledAt - g.t1, travel: Math.round(travel), fingers });
      lastNote = "latch (pan commit)";
    }
    log("pc", { id: e.pointerId % 1000 });
  }, { capture: true });
  for (const gn of ["gesturestart", "gesturechange", "gestureend"]) {
    addEventListener(gn, (e) => log(gn.slice(7, 8) === "s" ? "gs" : gn.slice(7, 8) === "c" ? "gc" : "ge",
      { scale: e.scale !== undefined ? +e.scale.toFixed(3) : null }), { capture: true, passive: true });
  }
  let vvLast = 0;
  const vvLog = () => {
    const t = Date.now();
    if (t - vvLast < 50) return;
    vvLast = t;
    const vv = visualViewport;
    log("vv", { scale: +vv.scale.toFixed(4), h: Math.round(vv.height), offT: Math.round(vv.offsetTop) });
  };
  if (visualViewport) {
    visualViewport.addEventListener("resize", vvLog);
    visualViewport.addEventListener("scroll", vvLog);
  }
  addEventListener("scroll", (e) => {
    const t = e.target === document ? "doc" : "pane";
    const top = t === "doc" ? Math.round(scrollY) : Math.round(e.target.scrollTop ?? -1);
    log("sc", { s: t, top });
  }, { capture: true, passive: true });
  addEventListener("load", () => {
    log("open", { ua: navigator.userAgent, inner: [innerWidth, innerHeight],
      vv: visualViewport ? { h: Math.round(visualViewport.height), scale: visualViewport.scale } : null });
  });
};
