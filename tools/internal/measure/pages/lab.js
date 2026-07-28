// Shared instrumentation: a live scale/height readout, an on-screen log, and a
// beacon to the server. Every page calls lab(pageName).
window.lab = function lab(page) {
  const bar = document.createElement("div");
  bar.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:9999;background:#111;color:#0f0;" +
    "font:16px/1.4 -apple-system,monospace;padding:6px 10px;pointer-events:none";
  document.body.appendChild(bar);
  const logEl = document.createElement("div");
  logEl.style.cssText =
    "position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#111;color:#ccc;" +
    "font:12px/1.5 monospace;padding:4px 10px;max-height:26vh;overflow:hidden;pointer-events:none";
  document.body.appendChild(logEl);

  let tag = "";
  const lines = [];
  function send(event, extra) {
    const vv = window.visualViewport;
    const rec = {
      page, event, tag,
      scale: vv ? +vv.scale.toFixed(4) : null,
      vvHeight: vv ? Math.round(vv.height) : null,
      ...extra,
    };
    fetch("/beacon", { method: "POST", body: JSON.stringify(rec) }).catch(() => {});
    lines.unshift(`${event}${tag ? " [" + tag + "]" : ""} scale=${rec.scale} h=${rec.vvHeight}` +
      (extra ? " " + JSON.stringify(extra) : ""));
    logEl.innerHTML = lines.slice(0, 12).join("<br>");
  }
  function paint() {
    const vv = window.visualViewport;
    bar.textContent = `${page}   scale=${vv ? vv.scale.toFixed(4) : "?"}   vvH=${vv ? Math.round(vv.height) : "?"}` +
      (tag ? `   next: ${tag}` : "");
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => { paint(); send("vv-resize"); });
  }
  // Pinch ATTEMPTS: two-finger touch events reach JS even when touch-action or
  // the viewport meta blocks the browser's zoom — so a logged attempt with an
  // unmoved scale is a definitive "blocked", not an absence of evidence.
  let lastAttempt = 0;
  function attempt(extra) {
    const now = Date.now();
    if (now - lastAttempt > 600) { lastAttempt = now; send("pinch-attempt", extra); }
  }
  window.addEventListener("gesturestart", (e) => attempt({ via: "gesture" }), { passive: true });
  window.addEventListener("gesturechange", (e) => attempt({ via: "gesture", gs: +(+e.scale).toFixed(3) }), { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (e.touches.length >= 2) attempt({ via: "touch" });
  }, { passive: true });
  window.addEventListener("pagehide", () => send("pagehide"));
  paint();
  send("open", { ua: navigator.userAgent });
  return {
    send,
    paint,
    // Tag buttons: the human taps one BEFORE a pinch so the log says where the
    // pinch happened; native pinches carry no target information of their own.
    setTag(t) { tag = t; paint(); send("tag-set"); },
  };
};
