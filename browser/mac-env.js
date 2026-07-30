// mac-env — the browser-shaped environment JavaScriptCore does not ship.
//
// The native host's design bet (docs/system-design/native-host.md §4) is that
// the runtime should not know it is native: the input router, the keyboard
// adapter, the environment wiring, and DataSource all keep working if the few
// globals they touch exist. So this file installs them — thinly, over the host
// primitives Swift provides on `__declareMacHost` — and nothing above it
// changes. It is evaluated FIRST, as a plain script, before the bundle: the
// runtime's module-level code must find a furnished world.
//
// This is a shim, not an emulation: `window`/`document` exist only as far as
// the runtime's guarded probes reach (addEventListener, innerWidth, body.style,
// fonts.ready). Everything genuinely visual is the native backend's job.

(function installEnv(g) {
  "use strict";
  const H = g.__declareMacHost;
  if (!H) throw new Error("mac-env: host bridge missing");

  // ── console + clocks ──────────────────────────────────────────────────────
  const fmt = (args) => args.map((a) => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(" ");
  g.console = {
    log: (...a) => H.log("log", fmt(a)), info: (...a) => H.log("log", fmt(a)),
    warn: (...a) => H.log("warn", fmt(a)), error: (...a) => H.log("error", fmt(a)),
    debug: (...a) => H.log("log", fmt(a)), trace: () => {}, group: () => {}, groupEnd: () => {},
  };
  g.performance = { now: () => H.now() };
  if (typeof g.queueMicrotask !== "function") {
    g.queueMicrotask = (fn) => { Promise.resolve().then(fn); };
  }

  // ── timers (host-driven; Swift fires __declareTimerFire) ──────────────────
  let timerSeq = 1;
  const timers = new Map();
  g.setTimeout = (fn, ms, ...args) => {
    const id = timerSeq++;
    timers.set(id, { fn, args, repeat: 0 });
    H.timer(id, Math.max(0, ms | 0), 0);
    return id;
  };
  g.setInterval = (fn, ms, ...args) => {
    const id = timerSeq++;
    timers.set(id, { fn, args, repeat: 1 });
    H.timer(id, Math.max(1, ms | 0), 1);
    return id;
  };
  g.clearTimeout = g.clearInterval = (id) => { timers.delete(id); H.clearTimer(id | 0); };
  g.__declareTimerFire = (id) => {
    const t = timers.get(id);
    if (!t) return;
    if (!t.repeat) timers.delete(id);
    try { t.fn(...t.args); } catch (e) { g.console.error("timer: " + (e && e.message || e)); }
  };

  // ── the frame pump: one display-link tick drives rAF AND the op flush ─────
  let rafSeq = 1;
  let rafQueue = new Map();
  g.requestAnimationFrame = (fn) => {
    const id = rafSeq++;
    rafQueue.set(id, fn);
    H.needFrame();
    return id;
  };
  g.cancelAnimationFrame = (id) => { rafQueue.delete(id); };
  g.__declareFrame = (t) => {
    const due = rafQueue;
    rafQueue = new Map();
    for (const fn of due.values()) {
      try { fn(t); } catch (e) { g.console.error("raf: " + (e && e.message || e)); }
    }
  };

  // ── URL / URLSearchParams (absent from bare JSC) ──────────────────────────
  // Enough of RFC 3986 for what the runtime does: absolute parse, relative
  // resolution against a base, query and hash access.
  function normalizePath(p) {
    const abs = p.startsWith("/");
    const out = [];
    for (const seg of p.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") { out.pop(); continue; }
      out.push(seg);
    }
    let s = out.join("/");
    if (abs) s = "/" + s;
    if (p.endsWith("/") && !s.endsWith("/")) s += "/";
    return s;
  }
  class DeclareURLSearchParams {
    constructor(init) {
      this._p = [];
      if (typeof init === "string") {
        for (const pair of init.replace(/^\?/, "").split("&")) {
          if (!pair) continue;
          const i = pair.indexOf("=");
          const k = i < 0 ? pair : pair.slice(0, i);
          const v = i < 0 ? "" : pair.slice(i + 1);
          this._p.push([decodeURIComponent(k.replace(/\+/g, " ")), decodeURIComponent(v.replace(/\+/g, " "))]);
        }
      } else if (init && typeof init === "object") {
        for (const k of Object.keys(init)) this._p.push([k, String(init[k])]);
      }
    }
    get(k) { const e = this._p.find((p) => p[0] === k); return e ? e[1] : null; }
    getAll(k) { return this._p.filter((p) => p[0] === k).map((p) => p[1]); }
    has(k) { return this._p.some((p) => p[0] === k); }
    set(k, v) { const e = this._p.find((p) => p[0] === k); if (e) e[1] = String(v); else this._p.push([k, String(v)]); }
    append(k, v) { this._p.push([k, String(v)]); }
    delete(k) { this._p = this._p.filter((p) => p[0] !== k); }
    forEach(fn) { for (const [k, v] of this._p) fn(v, k, this); }
    keys() { return this._p.map((p) => p[0])[Symbol.iterator](); }
    values() { return this._p.map((p) => p[1])[Symbol.iterator](); }
    entries() { return this._p.map((p) => [p[0], p[1]])[Symbol.iterator](); }
    [Symbol.iterator]() { return this.entries(); }
    toString() {
      return this._p.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
    }
  }
  const ABS = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/;
  const SCHEME_ONLY = /^([a-zA-Z][a-zA-Z0-9+.-]*):([^/].*)$/;   // data:, mailto:
  class DeclareURL {
    constructor(input, base) {
      let href = String(input);
      const m0 = SCHEME_ONLY.exec(href);
      if (m0 && !href.startsWith("file:") && !ABS.test(href)) {
        this.protocol = m0[1] + ":"; this.host = ""; this.hostname = ""; this.port = "";
        this.pathname = m0[2]; this.search = ""; this.hash = ""; this.origin = m0[1] + ":";
        this.searchParams = new DeclareURLSearchParams("");
        return;
      }
      let m = ABS.exec(href);
      if (!m && base !== undefined && base !== null) {
        const b = base instanceof DeclareURL ? b_href(base) : String(base);
        const bm = ABS.exec(b);
        if (!bm) throw new TypeError("Invalid base URL: " + b);
        if (href.startsWith("//")) href = bm[1] + ":" + href;
        else if (href.startsWith("/")) href = bm[1] + "://" + bm[2] + href;
        else if (href.startsWith("?")) href = bm[1] + "://" + bm[2] + (bm[3] || "/") + href;
        else if (href.startsWith("#")) href = bm[1] + "://" + bm[2] + (bm[3] || "/") + (bm[4] || "") + href;
        else {
          const dir = (bm[3] || "/").replace(/[^/]*$/, "");
          href = bm[1] + "://" + bm[2] + normalizePath(dir + href);
        }
        m = ABS.exec(href);
      }
      if (!m) throw new TypeError("Invalid URL: " + input);
      this.protocol = m[1] + ":";
      this.host = m[2];
      const at = this.host.lastIndexOf("@");
      const hostPart = at >= 0 ? this.host.slice(at + 1) : this.host;
      const colon = hostPart.lastIndexOf(":");
      this.hostname = colon > 0 ? hostPart.slice(0, colon) : hostPart;
      this.port = colon > 0 ? hostPart.slice(colon + 1) : "";
      this.pathname = normalizePath(m[3] || "/") || "/";
      this.search = m[4] || "";
      this.hash = m[5] || "";
      this.origin = this.protocol + "//" + this.host;
      this.searchParams = new DeclareURLSearchParams(this.search);
    }
    // `href` is LIVE (a getter): callers mutate `.search`/`.hash` and read
    // `.href` back — a frozen copy silently drops the mutation, which is
    // exactly how the first boot lost its `?program`.
    get href() { return this.origin + this.pathname + this.search + this.hash; }
    set href(v) { const u = new DeclareURL(v); Object.assign(this, { protocol: u.protocol, host: u.host,
      hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin }); }
    toString() { return this.href; }
  }
  const b_href = (u) => u.href;
  g.URL = DeclareURL;
  g.URLSearchParams = DeclareURLSearchParams;

  // ── a minimal EventTarget, and the window/document the runtime probes ─────
  class Target {
    constructor() { this._l = new Map(); }
    addEventListener(type, fn) {
      if (!this._l.has(type)) this._l.set(type, new Set());
      this._l.get(type).add(fn);
    }
    removeEventListener(type, fn) { this._l.get(type)?.delete(fn); }
    dispatchEvent(ev) {
      const set = this._l.get(ev.type);
      if (!set) return true;
      for (const fn of [...set]) {
        try { fn(ev); } catch (e) { g.console.error(ev.type + ": " + (e && e.message || e)); }
      }
      return !ev.defaultPrevented;
    }
  }
  const win = new Target();
  win.innerWidth = 1280; win.innerHeight = 800; win.scrollY = 0; win.scrollX = 0;
  win.devicePixelRatio = H.scale ? H.scale() : 2;
  win.getSelection = () => null;
  win.open = (u) => H.openExternal(String(u));
  g.window = win;
  g.self = win;
  g.addEventListener = (t, f) => win.addEventListener(t, f);
  g.removeEventListener = (t, f) => win.removeEventListener(t, f);
  g.devicePixelRatio = win.devicePixelRatio;
  g.innerWidth = win.innerWidth;
  g.innerHeight = win.innerHeight;

  const styleStub = () => new Proxy({}, { get: () => "", set: () => true });
  const bodyEl = { style: styleStub(), appendChild() {}, removeChild() {}, contains: () => false };
  const doc = new Target();
  doc.body = bodyEl;
  // `clientWidth`/`clientHeight` are LIVE, and they are the host's content box.
  // boot.ts sizes the app from `documentElement.client*` rather than
  // `window.inner*` because on iOS the latter track the VISUAL viewport, so a
  // pinch re-lays the app out mid-gesture. Natively there is no visual viewport
  // to diverge from — the window's content box is both — so these mirror
  // `win.inner*`, which the host keeps current on every resize. Getters, not
  // values: the shim object is built once at boot and the window resizes later.
  doc.documentElement = {
    style: styleStub(),
    get clientWidth() { return win.innerWidth; },
    get clientHeight() { return win.innerHeight; },
  };
  doc.getSelection = () => null;
  doc.activeElement = null;
  doc.fonts = { ready: Promise.resolve(), add() {}, check: () => true, forEach() {} };
  doc.createElement = (tag) => {
    // image.ts builds its loader with document.createElement("img") — NOT
    // `new Image()`, because the Image class is shadowed inside that module.
    // Returning the generic stub for it meant `img.src = …` set a property on
    // a dummy object: nothing loaded, onload never fired, and every Image in
    // the app stayed an empty box.
    if (String(tag).toLowerCase() === "img") return new DeclareImage();
    return { style: styleStub(), appendChild() {}, remove() {}, setAttribute() {}, getContext: () => null };
  };
  doc.querySelector = () => null;
  doc.querySelectorAll = () => [];
  doc.getElementById = () => null;
  doc.createTextNode = (t) => ({ textContent: t });
  g.document = doc;
  // ⚠ AND on `window`, which is a DISTINCT object here (this context has no
  // `window === globalThis` identity). Code that reaches the DOM as a bare
  // `document` worked without this; code that goes through `window.document`
  // — which boot.ts's host sizing now does — saw `undefined` and threw.
  win.document = doc;

  // The runtime guards on these being callable; keeping them undefined is the
  // signal that this is not a DOM (dom-backend paths must never run here).
  g.getComputedStyle = undefined;

  // `instanceof Element` / `instanceof HTMLElement` appear in shared paths
  // WITHOUT a typeof guard (boot.ts's pointer wiring is one), so the names
  // must EXIST or every pointer event throws. Nothing is ever an instance —
  // which is exactly the truthful answer here: there are no DOM elements.
  class DeclareElement {}
  g.Element = DeclareElement;
  g.HTMLElement = class DeclareHTMLElement extends DeclareElement {};
  g.HTMLInputElement = class extends g.HTMLElement {};
  g.HTMLTextAreaElement = class extends g.HTMLElement {};
  g.Node = class DeclareDOMNode {};

  // The media queries the runtime actually asks: appearance, and pointer
  // coarseness (a Mac is never coarse — the desktop's mouse-only affordances
  // depend on that answer being honest).
  g.matchMedia = (q) => {
    const dark = /prefers-color-scheme\s*:\s*dark/.test(q);
    const light = /prefers-color-scheme\s*:\s*light/.test(q);
    const mq = new Target();
    mq.media = q;
    Object.defineProperty(mq, "matches", { get: () => (
      dark ? H.appearance() === "dark" : light ? H.appearance() !== "dark" : false) });
    mq.addListener = (fn) => mq.addEventListener("change", fn);
    mq.removeListener = (fn) => mq.removeEventListener("change", fn);
    mediaQueries.add(mq);
    return mq;
  };
  const mediaQueries = new Set();
  win.matchMedia = g.matchMedia;
  g.__declareAppearanceChanged = () => {
    for (const mq of mediaQueries) mq.dispatchEvent({ type: "change", matches: mq.matches, media: mq.media });
  };

  // ── fetch over URLSession (host-driven completion) ────────────────────────
  let fetchSeq = 1;
  const pending = new Map();
  g.fetch = (input, init) => new Promise((resolve, reject) => {
    const id = fetchSeq++;
    const url = typeof input === "string" ? input : String(input.url ?? input);
    const method = (init && init.method) || "GET";
    const body = (init && init.body) || "";
    pending.set(id, { resolve, reject, url });
    try { H.fetch(id, method, url, typeof body === "string" ? body : String(body)); }
    catch (e) { pending.delete(id); reject(e); }
  });
  g.__declareFetchDone = (id, status, text, contentType) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (status < 0) { p.reject(new Error("network error: " + p.url)); return; }
    p.resolve({
      ok: status >= 200 && status < 300,
      status,
      url: p.url,
      headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? contentType : null) },
      text: () => Promise.resolve(text),
      json: () => Promise.resolve(JSON.parse(text)),
    });
  };

  // ── images (ImageIO on the far side; the handle is what the backend sends) ─
  let imgSeq = 1;
  const images = new Map();
  class DeclareImage {
    constructor() {
      this.__handle = imgSeq++;
      this.width = 0; this.height = 0; this.naturalWidth = 0; this.naturalHeight = 0;
      this.complete = false;
      this.onload = null; this.onerror = null;
      this._src = "";
      images.set(this.__handle, this);
    }
    get src() { return this._src; }
    set src(v) {
      this._src = String(v);
      // Resolve against the PROGRAM's base, exactly as the transport does. The
      // host side hands the string to URL(string:), which cannot make sense of
      // a relative path — so every relative image src silently loaded nothing.
      let abs = this._src;
      try { abs = new g.URL(this._src, g.__declareBase || "http://127.0.0.1/").href; } catch (e) { /* keep raw */ }
      H.loadImage(this.__handle, abs);
    }
    addEventListener(t, fn) { if (t === "load") this.onload = fn; if (t === "error") this.onerror = fn; }
    removeEventListener() {}
  }
  g.Image = DeclareImage;
  g.__declareImageDone = (handle, w, h, ok) => {
    const im = images.get(handle);
    if (!im) return;
    im.width = im.naturalWidth = w;
    im.height = im.naturalHeight = h;
    im.complete = true;
    try { if (ok) im.onload?.({ type: "load", target: im }); else im.onerror?.({ type: "error", target: im }); }
    catch (e) { g.console.error("image: " + (e && e.message || e)); }
  };

  // ── the measurer: a canvas-2d-shaped façade over Core Text ────────────────
  // measure.ts asks for exactly this interface (provideMeasurer), so the one
  // text-metrics seam the runtime already has is where the platform plugs in.
  g.__declareMeasurer = {
    font: "13px system-ui",
    letterSpacing: "0px",
    measureText(text) {
      const ls = parseFloat(this.letterSpacing) || 0;
      const m = H.measure(String(text), this.font, ls);
      return {
        width: m[0],
        fontBoundingBoxAscent: m[1],
        fontBoundingBoxDescent: m[2],
        actualBoundingBoxAscent: m[3],
        actualBoundingBoxDescent: m[4],
      };
    },
  };

  // ── synthetic events the host dispatches (pointer, key, resize) ───────────
  function ev(type, props) {
    const e = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
                stopPropagation() {}, isTrusted: true, target: null };
    return Object.assign(e, props);
  }
  g.__declareHitDebug = false;   // flipped on by the host when DECLARE_DEBUG_HIT is set
  g.__declarePointer = (type, x, y, buttons, mods) => {
    win.dispatchEvent(ev(type, {
      clientX: x, clientY: y, pageX: x, pageY: y, button: 0, buttons,
      pointerType: "mouse", pointerId: 1, isPrimary: true, relatedTarget: null,
      shiftKey: !!(mods & 1), metaKey: !!(mods & 2), ctrlKey: !!(mods & 4), altKey: !!(mods & 8),
    }));
  };
  g.__declareKey = (type, key, mods, repeat) => {
    win.dispatchEvent(ev(type, {
      key, code: key, repeat: !!repeat,
      shiftKey: !!(mods & 1), metaKey: !!(mods & 2), ctrlKey: !!(mods & 4), altKey: !!(mods & 8),
    }));
    doc.dispatchEvent(ev(type, { key, code: key, repeat: !!repeat,
      shiftKey: !!(mods & 1), metaKey: !!(mods & 2), ctrlKey: !!(mods & 4), altKey: !!(mods & 8) }));
  };
  g.__declareResize = (w, h, scale) => {
    win.innerWidth = w; win.innerHeight = h;
    g.innerWidth = w; g.innerHeight = h;
    win.devicePixelRatio = scale; g.devicePixelRatio = scale;
    win.dispatchEvent(ev("resize", {}));
  };
})(globalThis);
