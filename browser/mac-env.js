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
  // the host's name, as a script's `host` mark names it (instantiate.ts)
  g.__declareHostName = "mac";

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

  // structuredClone — a host chore the prelude declares (compiler scaffold.ts
  // HOST_GLOBALS), so a body may call it on every host. The browser's copies
  // data: plain objects and arrays, Date, RegExp, Map, Set, ArrayBuffer and
  // typed arrays, with shared and circular references kept; a function (or
  // anything with no data shape) is refused, as there.
  if (typeof g.structuredClone !== "function") {
    g.structuredClone = (value) => {
      const seen = new Map();
      const copy = (v) => {
        if (v === null || typeof v !== "object") {
          if (typeof v === "function" || typeof v === "symbol") throw new TypeError("structuredClone: " + typeof v + " could not be cloned");
          return v;
        }
        if (seen.has(v)) return seen.get(v);
        let out;
        if (Array.isArray(v)) { out = new Array(v.length); seen.set(v, out); for (let i = 0; i < v.length; i++) if (i in v) out[i] = copy(v[i]); return out; }
        if (v instanceof Date) { out = new Date(v.getTime()); seen.set(v, out); return out; }
        if (v instanceof RegExp) { out = new RegExp(v.source, v.flags); seen.set(v, out); return out; }
        if (v instanceof Map) { out = new Map(); seen.set(v, out); for (const [k, x] of v) out.set(copy(k), copy(x)); return out; }
        if (v instanceof Set) { out = new Set(); seen.set(v, out); for (const x of v) out.add(copy(x)); return out; }
        if (v instanceof ArrayBuffer) { out = v.slice(0); seen.set(v, out); return out; }
        if (ArrayBuffer.isView(v)) { out = new v.constructor(v); seen.set(v, out); return out; }
        out = {};
        seen.set(v, out);
        for (const k of Object.keys(v)) out[k] = copy(v[k]);
        return out;
      };
      return copy(value);
    };
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
  // Passive frame observers — the boot pumps' seam. A rAF callback is a DEMAND
  // for a frame: registering one calls H.needFrame(), which keeps the native
  // display link running until it is served. A pump that re-armed itself with
  // rAF therefore held the link awake at the display's refresh rate FOREVER —
  // measured as the mac host's entire idle cost. An observer runs after the
  // rAF callbacks of every frame that happens for a real reason and demands
  // nothing itself; return false to retire. The bet this makes explicit: every
  // change a pump watches for is caused by an event, a timer, or a completion
  // callback, and each of those already requests the frame the observer rides.
  const frameObservers = [];
  g.__declareObserveFrames = (fn) => { frameObservers.push(fn); };
  g.__declareFrame = (t) => {
    const due = rafQueue;
    rafQueue = new Map();
    for (const fn of due.values()) {
      try { fn(t); } catch (e) { g.console.error("raf: " + (e && e.message || e)); }
    }
    for (let i = frameObservers.length - 1; i >= 0; i--) {
      let keep;
      try { keep = frameObservers[i](t); } catch (e) { g.console.error("frame observer: " + (e && e.message || e)); }
      if (keep === false) frameObservers.splice(i, 1);
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
    // a path ending in a directory ("/", "/.", "/..") keeps its trailing slash
    if (/(^|\/)(\.\.?)?$/.test(p) && !s.endsWith("/")) s += "/";
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
  // `add()` is a no-op because loading IS registering here: FontFace.load()
  // hands the bytes to the host, which files them under the face's family.
  // `delete()` withdraws that family — font.ts registers each generation of a
  // Font under a family of its own, so the family is exactly the unit to remove.
  doc.fonts = {
    ready: Promise.resolve(), add() {}, check: () => true, forEach() {},
    delete(face) { try { H.unloadFont?.(String(face && face.family)); } catch (e) { /* host without the verb */ } return true; },
  };
  doc.createElement = (tag) => {
    // image.ts builds its loader with document.createElement("img") — NOT
    // `new Image()`, because the Image class is shadowed inside that module.
    // Returning the generic stub for it meant `img.src = …` set a property on
    // a dummy object: nothing loaded, onload never fired, and every Image in
    // the app stayed an empty box.
    const t = String(tag).toLowerCase();
    if (t === "img") return new DeclareImage();
    // media.ts reaches its element through this same seam (its design note
    // says so): these two answers are what make Video and Audio native here.
    if (t === "video" || t === "audio") return new DeclareMediaElement(t);
    return { style: styleStub(), appendChild() {}, remove() {}, setAttribute() {}, getContext: () => null };
  };
  doc.querySelector = () => null;
  doc.querySelectorAll = () => [];
  doc.getElementById = () => null;
  doc.createTextNode = (t) => ({ textContent: t });
  // Page Visibility, fed by the WINDOW's occlusion state (ProgramWindow
  // windowDidChangeOcclusionState → __declareVisibilityChanged): the runtime's
  // wireVisibility reads `document.visibilityState` and listens for
  // `visibilitychange`, exactly as in a browser — and the native signal is
  // strictly better, since AppKit reports covered-by-another-window, which
  // Safari never does. The app's `pageVisible` fact follows; a Time
  // pauses itself on it (leaving the clock), and an occluded window goes truly idle.
  let pageVisible = true;
  Object.defineProperty(doc, "visibilityState", { get: () => (pageVisible ? "visible" : "hidden") });
  g.__declareVisibilityChanged = (visible) => {
    const v = visible === true;
    if (pageVisible === v) return;
    pageVisible = v;
    doc.dispatchEvent({ type: "visibilitychange" });
  };
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

  // ── fetch, and the classes that come with it ──────────────────────────────
  //
  // The fetch family the prelude declares portable (compiler scaffold.ts
  // HOST_GLOBALS): fetch, Response, Headers, Blob, FormData, AbortController,
  // AbortSignal — the web's shapes, over URLSession. Swift sends the request
  // with its headers and bytes, and answers in three calls: the head (status
  // and every header), the body chunk by chunk as it arrives (base64), and the
  // end — so a reply reads whole (text/json/arrayBuffer/blob) or as a stream
  // (body.getReader(), how an event stream reads one). abort() cancels the
  // request. Bytes cross the bridge as base64; text is UTF-8.

  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const B64_AT = new Uint8Array(128);
  for (let i = 0; i < 64; i++) B64_AT[B64.charCodeAt(i)] = i;
  const fromBase64 = (s) => {
    let n = s.length;
    while (n > 0 && s[n - 1] === "=") n--;
    const out = new Uint8Array((n * 3) >> 2);
    let o = 0;
    for (let i = 0; i < n; i += 4) {
      const a = B64_AT[s.charCodeAt(i)], b = B64_AT[s.charCodeAt(i + 1)];
      const c = i + 2 < n ? B64_AT[s.charCodeAt(i + 2)] : 0, d = i + 3 < n ? B64_AT[s.charCodeAt(i + 3)] : 0;
      out[o++] = (a << 2) | (b >> 4);
      if (i + 2 < n) out[o++] = ((b & 15) << 4) | (c >> 2);
      if (i + 3 < n) out[o++] = ((c & 3) << 6) | d;
    }
    return out;
  };
  const toBase64 = (u8) => {
    let s = "";
    for (let i = 0; i < u8.length; i += 3) {
      const a = u8[i], b = i + 1 < u8.length ? u8[i + 1] : 0, c = i + 2 < u8.length ? u8[i + 2] : 0;
      s += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)]
        + (i + 1 < u8.length ? B64[((b & 15) << 2) | (c >> 6)] : "=") + (i + 2 < u8.length ? B64[c & 63] : "=");
    }
    return s;
  };

  // UTF-8, both ways; decode keeps a sequence split across chunks for the next
  // ({ stream: true }), as the web's does
  if (typeof g.TextEncoder !== "function") {
    g.TextEncoder = class TextEncoder {
      get encoding() { return "utf-8"; }
      encode(str = "") {
        const s = String(str), out = [];
        for (let i = 0; i < s.length; i++) {
          let c = s.charCodeAt(i);
          if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
            const d = s.charCodeAt(i + 1);
            if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
          }
          if (c < 0x80) out.push(c);
          else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
          else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
          else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        }
        return new Uint8Array(out);
      }
    };
  }
  if (typeof g.TextDecoder !== "function") {
    g.TextDecoder = class TextDecoder {
      constructor() { this._rest = new Uint8Array(0); }
      get encoding() { return "utf-8"; }
      decode(input, opts) {
        let u8 = input == null ? new Uint8Array(0) : input instanceof Uint8Array ? input
          : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
        if (this._rest.length > 0) { const j = new Uint8Array(this._rest.length + u8.length); j.set(this._rest); j.set(u8, this._rest.length); u8 = j; }
        let end = u8.length;
        if (opts && opts.stream) {
          // hold back a sequence the chunk cut off
          let k = end - 1, back = 0;
          while (k >= 0 && back < 3 && (u8[k] & 0xc0) === 0x80) { k--; back++; }
          if (k >= 0) {
            const lead = u8[k], need = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
            if (end - k < need) end = k;
          }
        }
        this._rest = u8.slice(end);
        let s = "";
        for (let i = 0; i < end;) {
          const a = u8[i];
          let c, n;
          if (a < 0x80) { c = a; n = 1; }
          else if (a >= 0xf0) { c = ((a & 7) << 18) | ((u8[i + 1] & 63) << 12) | ((u8[i + 2] & 63) << 6) | (u8[i + 3] & 63); n = 4; }
          else if (a >= 0xe0) { c = ((a & 15) << 12) | ((u8[i + 1] & 63) << 6) | (u8[i + 2] & 63); n = 3; }
          else if (a >= 0xc0) { c = ((a & 31) << 6) | (u8[i + 1] & 63); n = 2; }
          else { c = 0xfffd; n = 1; }
          s += String.fromCodePoint(c);
          i += n;
        }
        return s;
      }
    };
  }
  const utf8 = new g.TextEncoder();
  const bytesOf = (v) => v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v)
    : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : utf8.encode(String(v));
  const join = (parts) => {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };

  class Headers {
    constructor(init) {
      this._h = new Map();          // lowercased name → [name as given, value]
      if (init instanceof Headers) init.forEach((v, k) => this.append(k, v));
      else if (Array.isArray(init)) for (const [k, v] of init) this.append(k, v);
      else if (init && typeof init === "object") for (const k of Object.keys(init)) this.append(k, init[k]);
    }
    append(k, v) { const n = String(k).toLowerCase(), had = this._h.get(n); this._h.set(n, [String(k), had ? had[1] + ", " + String(v) : String(v)]); }
    set(k, v) { this._h.set(String(k).toLowerCase(), [String(k), String(v)]); }
    get(k) { const e = this._h.get(String(k).toLowerCase()); return e ? e[1] : null; }
    has(k) { return this._h.has(String(k).toLowerCase()); }
    delete(k) { this._h.delete(String(k).toLowerCase()); }
    forEach(fn, self) { for (const [n, [, v]] of [...this._h].sort()) fn.call(self, v, n, this); }
    *entries() { for (const [n, [, v]] of [...this._h].sort()) yield [n, v]; }
    *keys() { for (const [n] of this.entries()) yield n; }
    *values() { for (const [, v] of this.entries()) yield v; }
    [Symbol.iterator]() { return this.entries(); }
  }

  class Blob {
    constructor(parts = [], opts = {}) {
      this._bytes = join(parts.map((p) => p instanceof Blob ? p._bytes : bytesOf(p)));
      this.type = opts.type ? String(opts.type).toLowerCase() : "";
    }
    get size() { return this._bytes.length; }
    slice(start = 0, end = this._bytes.length, type = "") { const b = new Blob([], { type }); b._bytes = this._bytes.slice(start, end); return b; }
    arrayBuffer() { return Promise.resolve(this._bytes.slice().buffer); }
    bytes() { return Promise.resolve(this._bytes.slice()); }
    text() { return Promise.resolve(new g.TextDecoder().decode(this._bytes)); }
  }

  class FormData {
    constructor() { this._e = []; }
    append(k, v, filename) { this._e.push([String(k), v instanceof Blob ? v : String(v), v instanceof Blob ? (filename ?? v.name ?? "blob") : undefined]); }
    set(k, v, filename) { this.delete(k); this.append(k, v, filename); }
    get(k) { const e = this._e.find((x) => x[0] === String(k)); return e ? e[1] : null; }
    getAll(k) { return this._e.filter((x) => x[0] === String(k)).map((x) => x[1]); }
    has(k) { return this._e.some((x) => x[0] === String(k)); }
    delete(k) { this._e = this._e.filter((x) => x[0] !== String(k)); }
    forEach(fn, self) { for (const [k, v] of this._e) fn.call(self, v, k, this); }
    *entries() { for (const [k, v] of this._e) yield [k, v]; }
    *keys() { for (const [k] of this._e) yield k; }
    *values() { for (const [, v] of this._e) yield v; }
    [Symbol.iterator]() { return this.entries(); }
    // multipart/form-data, as a request body
    _encode() {
      const boundary = "----DeclareFormBoundary" + Math.random().toString(36).slice(2);
      const parts = [];
      for (const [k, v, filename] of this._e) {
        const name = k.replace(/"/g, "%22");
        if (v instanceof Blob) {
          parts.push(utf8.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${String(filename).replace(/"/g, "%22")}"\r\nContent-Type: ${v.type || "application/octet-stream"}\r\n\r\n`), v._bytes, utf8.encode("\r\n"));
        } else {
          parts.push(utf8.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${v}\r\n`));
        }
      }
      parts.push(utf8.encode(`--${boundary}--\r\n`));
      return { bytes: join(parts), type: "multipart/form-data; boundary=" + boundary };
    }
  }

  const abortError = (reason) => {
    if (reason !== undefined) return reason;
    const e = new Error("The operation was aborted."); e.name = "AbortError"; return e;
  };
  class AbortSignal {
    constructor() { this.aborted = false; this.reason = undefined; this.onabort = null; this._fns = new Set(); }
    addEventListener(type, fn) { if (type === "abort") this._fns.add(fn); }
    removeEventListener(type, fn) { if (type === "abort") this._fns.delete(fn); }
    throwIfAborted() { if (this.aborted) throw this.reason; }
    _abort(reason) {
      if (this.aborted) return;
      this.aborted = true; this.reason = abortError(reason);
      const ev = { type: "abort", target: this };
      if (typeof this.onabort === "function") this.onabort(ev);
      for (const fn of [...this._fns]) fn(ev);
    }
    static abort(reason) { const s = new AbortSignal(); s._abort(reason); return s; }
    static timeout(ms) { const s = new AbortSignal(); g.setTimeout(() => { const e = new Error("The operation timed out."); e.name = "TimeoutError"; s._abort(e); }, ms); return s; }
  }
  class AbortController {
    constructor() { this.signal = new AbortSignal(); }
    abort(reason) { this.signal._abort(reason); }
  }

  // A reply's body: the chunks as they arrive, read whole or through a reader.
  class Body {
    constructor() { this._chunks = []; this._done = false; this._error = null; this._wait = null; this._used = false; }
    _push(u8) { this._chunks.push(u8); this._wake(); }
    _end(error) { this._done = true; this._error = error; this._wake(); }
    _wake() { const w = this._wait; this._wait = null; if (w) w(); }
    _next() { return new Promise((r) => { this._wait = r; }); }
    getReader() {
      this._used = true;
      return {
        read: async () => {
          for (;;) {
            if (this._chunks.length > 0) return { done: false, value: this._chunks.shift() };
            if (this._error) throw this._error;
            if (this._done) return { done: true, value: undefined };
            await this._next();
          }
        },
        cancel: async () => { this._chunks = []; this._end(null); if (this._cancel) this._cancel(); },
        releaseLock: () => {},
      };
    }
    async _all() {
      if (this._used) throw new TypeError("the body has already been read");
      const r = this.getReader(), parts = [];
      for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); }
      return join(parts);
    }
    [Symbol.asyncIterator]() { const r = this.getReader(); return { next: () => r.read() }; }
  }

  class Response {
    constructor(body = null, init = {}) {
      this.status = init.status ?? 200;
      this.statusText = init.statusText ?? "";
      this.headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers);
      this.url = "";
      this.type = "default";
      this.redirected = false;
      if (body instanceof Body || body === null) this.body = body;
      else {
        const b = new Body();
        const bytes = body instanceof Blob ? body._bytes : bytesOf(body);
        if (typeof body === "string" && !this.headers.has("content-type")) this.headers.set("content-type", "text/plain;charset=UTF-8");
        b._push(bytes); b._end(null);
        this.body = b;
      }
    }
    get ok() { return this.status >= 200 && this.status < 300; }
    get bodyUsed() { return this.body !== null && this.body._used; }
    async arrayBuffer() { return (this.body === null ? new Uint8Array(0) : await this.body._all()).slice().buffer; }
    async bytes() { return this.body === null ? new Uint8Array(0) : await this.body._all(); }
    async text() { return new g.TextDecoder().decode(await this.bytes()); }
    async json() { return JSON.parse(await this.text()); }
    async blob() { return new Blob([await this.bytes()], { type: this.headers.get("content-type") || "" }); }
    clone() {
      if (this.bodyUsed) throw new TypeError("the body has already been read");
      const r = new Response(null, { status: this.status, statusText: this.statusText, headers: new Headers(this.headers) });
      r.url = this.url;
      if (this.body !== null) {
        // both copies see every chunk
        const a = new Body(), b = new Body(), src = this.body;
        const pump = async () => {
          const rd = src.getReader();
          try { for (;;) { const { done, value } = await rd.read(); if (done) break; a._push(value); b._push(value); } a._end(null); b._end(null); }
          catch (e) { a._end(e); b._end(e); }
        };
        pump();
        this.body = a; r.body = b;
      }
      return r;
    }
    static json(data, init = {}) { const h = new Headers(init.headers); h.set("content-type", "application/json"); return new Response(JSON.stringify(data), { ...init, headers: h }); }
    static error() { const r = new Response(null, { status: 0 }); r.type = "error"; return r; }
  }

  Object.assign(g, { Headers, Blob, FormData, AbortSignal, AbortController, Response });

  let fetchSeq = 1;
  const pending = new Map();      // id → { resolve, reject, url, body, settled }
  g.fetch = (input, init = {}) => new Promise((resolve, reject) => {
    const url = typeof input === "string" ? input : String(input.url ?? input);
    const method = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers);
    let bytes = null;
    const b = init.body;
    if (b != null) {
      if (b instanceof FormData) { const f = b._encode(); bytes = f.bytes; if (!headers.has("content-type")) headers.set("content-type", f.type); }
      else if (b instanceof Blob) { bytes = b._bytes; if (b.type && !headers.has("content-type")) headers.set("content-type", b.type); }
      else if (b instanceof g.URLSearchParams) { bytes = utf8.encode(b.toString()); if (!headers.has("content-type")) headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8"); }
      else { bytes = bytesOf(b); if (typeof b === "string" && !headers.has("content-type")) headers.set("content-type", "text/plain;charset=UTF-8"); }
    }
    const signal = init.signal;
    if (signal && signal.aborted) { reject(signal.reason); return; }
    const id = fetchSeq++;
    const body = new Body();
    const p = { resolve, reject, url, body, settled: false };
    pending.set(id, p);
    body._cancel = () => { pending.delete(id); H.fetchCancel(id); };
    if (signal) signal.addEventListener("abort", () => {
      if (!pending.has(id)) return;
      pending.delete(id);
      H.fetchCancel(id);
      if (!p.settled) { p.settled = true; reject(signal.reason); }
      else body._end(signal.reason);
    });
    const hdrs = {};
    headers.forEach((v, k) => { hdrs[k] = v; });
    try { H.fetchStart(id, method, url, JSON.stringify(hdrs), bytes === null ? "" : toBase64(bytes)); }
    catch (e) { pending.delete(id); reject(e); }
  });
  g.__declareFetchHead = (id, status, headersJSON) => {
    const p = pending.get(id);
    if (!p || p.settled) return;
    p.settled = true;
    let h = {};
    try { h = JSON.parse(headersJSON); } catch { h = {}; }
    const res = new Response(p.body, { status, headers: h });
    res.url = p.url;
    p.resolve(res);
  };
  g.__declareFetchChunk = (id, b64) => {
    const p = pending.get(id);
    if (p) p.body._push(fromBase64(b64));
  };
  g.__declareFetchEnd = (id, error) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    const e = error ? new TypeError("network error: " + error + " (" + p.url + ")") : null;
    if (!p.settled) { p.settled = true; if (e) p.reject(e); else { const r = new Response(p.body, { status: 200 }); r.url = p.url; p.resolve(r); } }
    p.body._end(e);
  };

  // ── WebSocket, over URLSessionWebSocketTask ───────────────────────────────
  //
  // The web's WebSocket: the protocol (the HTTP upgrade handshake, frames,
  // ping/pong, the closing handshake) is URLSession's; this is the browser's
  // shape over it, so the runtime's Socket source runs here unchanged. Text
  // frames arrive as strings, binary ones as an ArrayBuffer (binaryType
  // "arraybuffer"; "blob" gives a Blob).
  let wsSeq = 1;
  const sockets = new Map();
  class WebSocket {
    constructor(url, protocols) {
      this.url = String(url);
      this.readyState = 0;
      this.protocol = "";
      this.extensions = "";
      this.binaryType = "blob";
      this.bufferedAmount = 0;
      this.onopen = this.onmessage = this.onclose = this.onerror = null;
      this._fns = new Map();
      this._closing = null;
      this._id = wsSeq++;
      sockets.set(this._id, this);
      const list = protocols == null ? [] : Array.isArray(protocols) ? protocols.map(String) : [String(protocols)];
      H.wsOpen(this._id, this.url, JSON.stringify(list));
    }
    addEventListener(type, fn) { if (!this._fns.has(type)) this._fns.set(type, new Set()); this._fns.get(type).add(fn); }
    removeEventListener(type, fn) { this._fns.get(type)?.delete(fn); }
    _emit(type, ev) {
      ev.type = type; ev.target = this;
      const h = this["on" + type];
      if (typeof h === "function") { try { h.call(this, ev); } catch (e) { g.console.error("WebSocket on" + type + ": " + (e && e.message || e)); } }
      for (const fn of [...(this._fns.get(type) ?? [])]) { try { fn.call(this, ev); } catch (e) { g.console.error("WebSocket " + type + ": " + (e && e.message || e)); } }
    }
    send(data) {
      if (this.readyState === 0) throw new Error("InvalidStateError: the socket is still connecting");
      if (this.readyState !== 1) return;
      if (typeof data === "string") H.wsSend(this._id, data, false);
      else H.wsSend(this._id, toBase64(data instanceof Blob ? data._bytes : bytesOf(data)), true);
    }
    close(code = 1000, reason = "") {
      if (this.readyState >= 2) return;
      this.readyState = 2;
      this._closing = { code, reason: String(reason) };
      H.wsClose(this._id, code, String(reason));
    }
  }
  WebSocket.CONNECTING = 0; WebSocket.OPEN = 1; WebSocket.CLOSING = 2; WebSocket.CLOSED = 3;
  g.WebSocket = WebSocket;
  g.__declareWsOpen = (id, protocol) => {
    const ws = sockets.get(id);
    if (!ws || ws.readyState !== 0) return;
    ws.readyState = 1; ws.protocol = protocol;
    ws._emit("open", {});
  };
  g.__declareWsMessage = (id, payload, binary) => {
    const ws = sockets.get(id);
    if (!ws || ws.readyState !== 1) return;
    let data = payload;
    if (binary) { const u8 = fromBase64(payload); data = ws.binaryType === "arraybuffer" ? u8.buffer : new Blob([u8]); }
    ws._emit("message", { data, origin: ws.url, lastEventId: "" });
  };
  g.__declareWsClose = (id, code, reason, wasClean) => {
    const ws = sockets.get(id);
    if (!ws) return;
    sockets.delete(id);
    // closed by this page: the close it asked for, as a browser reports it
    const mine = ws._closing;
    ws.readyState = 3;
    if (!wasClean && mine === null) ws._emit("error", {});
    ws._emit("close", mine !== null ? { code: mine.code, reason: mine.reason, wasClean: true } : { code, reason, wasClean });
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

  // ── web fonts (Core Text on the far side; FontRegistry keys them) ────────
  // The runtime's own loadFonts (boot.ts) builds a FontFace per declared face
  // and awaits it before first paint. That code is shared with both web
  // backends and it probes for `FontFace`, so supplying one here is all it
  // takes for declared type to reach this host — and for first paint to wait
  // for real metrics rather than reflowing when the face lands.
  let faceSeq = 1;
  const pendingFaces = new Map();
  // A CSS `src` value: `url("…")`, `local("…")`, or a comma chain of them,
  // tried in order (font.ts builds exactly these).
  const SRC_PART = /(url|local)\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g;
  class DeclareFontFace {
    constructor(family, source, desc) {
      this.family = String(family);
      this.style = (desc && desc.style) || "normal";
      this.weight = String((desc && desc.weight) || "normal");
      this.status = "unloaded";
      this._src = String(source);
    }
    load() {
      const italic = this.style === "italic" || this.style === "oblique";
      const sources = [];
      SRC_PART.lastIndex = 0;
      for (let m = SRC_PART.exec(this._src); m !== null; m = SRC_PART.exec(this._src)) {
        sources.push({ kind: m[1], value: String(m[2] ?? m[3] ?? m[4] ?? "").trim() });
      }
      const tryFrom = (i) => {
        if (i >= sources.length) {
          this.status = "error";
          return Promise.reject(new Error("no usable source in " + this._src));
        }
        const s = sources[i];
        if (s.kind === "local") {
          if (H.registerLocalFont(this.family, s.value, this.weight, italic)) {
            this.status = "loaded";
            return Promise.resolve(this);
          }
          return tryFrom(i + 1);
        }
        // Resolve against the PROGRAM's base, as the image shim does: the host
        // hands the string to URL(string:), which cannot read a relative path.
        let abs = s.value;
        try { abs = new g.URL(s.value, g.__declareBase || "http://127.0.0.1/").href; } catch (e) { /* keep raw */ }
        const handle = faceSeq++;
        return new Promise((resolve) => {
          pendingFaces.set(handle, resolve);
          H.loadFont(handle, abs, this.family, this.weight, italic);
        }).then((ok) => {
          if (!ok) return tryFrom(i + 1);
          this.status = "loaded";
          return this;
        });
      };
      return tryFrom(0);
    }
  }
  g.FontFace = DeclareFontFace;
  g.__declareFontDone = (handle, ok) => {
    const resolve = pendingFaces.get(handle);
    if (!resolve) return;
    pendingFaces.delete(handle);
    resolve(!!ok);
  };

  // ── media elements: the transport over AVFoundation ──────────────────────
  // media.ts drives an HTMLMediaElement it got from document.createElement.
  // This is that element for the native host: same property/callback surface,
  // every verb forwarded to the Swift media engine by handle, every fact
  // arriving back through __declareMediaEvent. A <video>'s FRAMES never cross
  // this bridge — the handle reaches the layer tree via the MEDIA op and the
  // host binds an AVPlayerLayer where the DOM would have placed the element.
  let mediaSeq = 1;
  const mediaEls = new Map();
  class DeclareMediaElement {
    constructor(kind) {
      this.__mediaHandle = mediaSeq++;
      this.__kind = kind;                       // "video" | "audio"
      this.videoWidth = 0; this.videoHeight = 0;
      this.duration = NaN;
      this.paused = true;
      this.playsInline = true; this.preload = "metadata";
      this._muted = false; this._loop = false; this._volume = 1; this._rate = 1;
      this._pos = 0; this._src = "";
      this.onloadedmetadata = null; this.onerror = null;
      this.onplay = null; this.onpause = null; this.onended = null;
      this.onwaiting = null; this.onplaying = null; this.ontimeupdate = null;
      mediaEls.set(this.__mediaHandle, this);
      H.mediaCreate(this.__mediaHandle, kind);
    }
    get src() { return this._src; }
    set src(v) {
      this._src = String(v);
      let abs = this._src;   // resolve like DeclareImage: URL(string:) can't take a relative path
      try { abs = new g.URL(this._src, g.__declareBase || "http://127.0.0.1/").href; } catch (e) { /* keep raw */ }
      H.mediaLoad(this.__mediaHandle, abs);
    }
    get muted() { return this._muted; }
    set muted(on) { this._muted = !!on; H.mediaSet(this.__mediaHandle, "muted", on ? 1 : 0); }
    get loop() { return this._loop; }
    set loop(on) { this._loop = !!on; H.mediaSet(this.__mediaHandle, "loop", on ? 1 : 0); }
    get volume() { return this._volume; }
    set volume(n) { this._volume = +n; H.mediaSet(this.__mediaHandle, "volume", +n); }
    get playbackRate() { return this._rate; }
    set playbackRate(n) { this._rate = +n; H.mediaSet(this.__mediaHandle, "rate", +n); }
    get currentTime() { return this._pos; }
    set currentTime(t) { this._pos = +t; H.mediaSeek(this.__mediaHandle, +t); }
    play() { H.mediaPlay(this.__mediaHandle); return undefined; }
    pause() { H.mediaPause(this.__mediaHandle); }
    addEventListener() {} removeEventListener() {}
  }
  g.__declareMediaEvent = (handle, type, a, b, c) => {
    const m = mediaEls.get(handle);
    if (!m) return;
    try {
      switch (type) {
        case "metadata":
          m.duration = a; m.videoWidth = b || 0; m.videoHeight = c || 0;
          m.onloadedmetadata?.(); break;
        case "time":  m._pos = a; m.ontimeupdate?.(); break;
        case "play":  m.paused = false; m.onplay?.(); break;
        case "pause": m.paused = true; m.onpause?.(); break;
        case "ended": m.paused = true; m._pos = a; m.onended?.(); break;
        case "waiting": m.onwaiting?.(); break;
        case "playing": m.onplaying?.(); break;
        case "error": m.onerror?.(); break;
      }
    } catch (e) { g.console.error("media: " + (e && e.message || e)); }
  };

  // ── in-memory sounds: clip-host.ts's seam over AVAudioEngine ──────────────
  // `Audio [ inMemory = true ]` asks the runtime's clip host to decode a sound once and
  // start voices of it; in the browser that is Web Audio, here it is Clips.swift. Clips,
  // sinks (one per Audio) and voices are handles; facts come back through
  // __declareClipEvent. The native host has no autoplay rule, so a voice always starts.
  let clipSeq = 1;
  const clipWaits = new Map(), voiceEnds = new Map();
  g.__declareClipHost = {
    decode(url) {
      const id = clipSeq++;
      let abs = url;
      try { abs = new g.URL(url, g.__declareBase || "http://127.0.0.1/").href; } catch (e) { /* keep raw */ }
      return new Promise((resolve, reject) => { clipWaits.set(id, { resolve, reject }); H.clipDecode(id, abs); });
    },
    sink() {
      const id = clipSeq++;
      H.clipSink(id);
      return {
        setVolume(volume, muted) { H.clipVolume(id, muted ? 0 : volume); },
        start(clip, offset, loop, rate, onEnded) {
          const v = clipSeq++;
          voiceEnds.set(v, onEnded);
          H.clipStart(v, id, clip, offset, !!loop, rate);
          return {
            stop() { voiceEnds.delete(v); H.clipStop(v); },
            setLoop(on) { H.clipLoop(v, !!on); },
            setRate(r) { H.clipRate(v, r); },
          };
        },
        release() { H.clipRelease(id); },
      };
    },
  };
  g.__declareClipEvent = (id, type, a) => {
    try {
      if (type === "decoded" || type === "error") {
        const w = clipWaits.get(id);
        clipWaits.delete(id);
        if (type === "decoded") w?.resolve({ clip: id, duration: a });
        else w?.reject(new Error("the sound did not decode"));
      } else if (type === "ended") {
        const f = voiceEnds.get(id);
        voiceEnds.delete(id);
        f?.();
      }
    } catch (e) { g.console.error("clip: " + (e && e.message || e)); }
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
  // `button`: 0 primary, 1 middle, 2 secondary (the DOM's numbering)
  g.__declarePointer = (type, x, y, buttons, mods, button = 0) => {
    win.dispatchEvent(ev(type, {
      clientX: x, clientY: y, pageX: x, pageY: y, button, buttons,
      pointerType: "mouse", pointerId: 1, isPrimary: true, relatedTarget: null,
      shiftKey: !!(mods & 1), metaKey: !!(mods & 2), ctrlKey: !!(mods & 4), altKey: !!(mods & 8),
    }));
  };
  // `code` is the physical key, as the host read it. A key the host makes up
  // (the control channel's `key`, a Tab handed back from a field) names only
  // the key, so its code is the one that key has on a US keyboard.
  const codeOf = (key) =>
    /^[a-z]$/i.test(key) ? "Key" + key.toUpperCase()
    : /^[0-9]$/.test(key) ? "Digit" + key
    : key === " " ? "Space"
    : ({ "'": "Quote", "/": "Slash", ",": "Comma", ".": "Period", ";": "Semicolon", "-": "Minus", "=": "Equal",
         "[": "BracketLeft", "]": "BracketRight", "\\": "Backslash", "`": "Backquote",
         Shift: "ShiftLeft", Control: "ControlLeft", Alt: "AltLeft", Meta: "MetaLeft" })[key] ?? key;
  // `id`: the host posted this key to the walk first (a ⌘ chord) and wants to
  // know whether the program took it — a key nothing took goes to its menu.
  g.__declareKey = (type, key, mods, repeat, code, id) => {
    const props = () => ({ key, code: code ?? codeOf(key), repeat: !!repeat,
      shiftKey: !!(mods & 1), metaKey: !!(mods & 2), ctrlKey: !!(mods & 4), altKey: !!(mods & 8) });
    const e = ev(type, props());
    win.dispatchEvent(e);
    doc.dispatchEvent(ev(type, props()));
    if (id && typeof H.keyAnswer === "function") H.keyAnswer(id, !!e.defaultPrevented);
  };
  g.__declareResize = (w, h, scale) => {
    win.innerWidth = w; win.innerHeight = h;
    g.innerWidth = w; g.innerHeight = h;
    win.devicePixelRatio = scale; g.devicePixelRatio = scale;
    win.dispatchEvent(ev("resize", {}));
  };
})(globalThis);
