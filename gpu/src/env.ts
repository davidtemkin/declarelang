import { MediaElement, installClipHost } from "./media.js";
// env — the browser-shaped globals a dedicated worker does not have, for the runtime
// running in it under render=gpu.
//
// A worker already has what the runtime does real work with — fetch, timers, URL,
// requestAnimationFrame, performance, FontFace. What it lacks is the page: `window`,
// `document`, `matchMedia`, the DOM class names. The runtime only PROBES those (it adds
// listeners, reads sizes, asks about appearance), so this file gives it a page-shaped
// stand-in whose events come from the main thread (shell.ts → worker.ts → dispatch) —
// the same stand-in the Mac host's mac-env.js gives JavaScriptCore, with Swift's part
// played by the shell. Imported first by worker.ts, so the runtime's module-level code
// finds a furnished world.

/** When this worker started running script (absolute ms, timeOrigin-based): the first
 *  module evaluated is this one. */
export const STARTED = performance.timeOrigin + performance.now();

type Listener = (ev: unknown) => void;

class Target {
  private l = new Map<string, Set<Listener>>();
  addEventListener(type: string, fn: Listener): void {
    let set = this.l.get(type);
    if (set === undefined) { set = new Set(); this.l.set(type, set); }
    set.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void { this.l.get(type)?.delete(fn); }
  dispatchEvent(ev: { type: string; defaultPrevented?: boolean }): boolean {
    const set = this.l.get(ev.type);
    if (set === undefined) return true;
    for (const fn of [...set]) {
      try { fn(ev); } catch (e) { console.error(`${ev.type}:`, e); }
    }
    return ev.defaultPrevented !== true;
  }
}

const g = globalThis as unknown as Record<string, unknown>;

/** The worker's busy time, ms: frame callbacks, timers and messages (the perf rig reads it). */
export const busy = { ms: 0 };
/** Each busy stretch: start (performance.now), ms — the timing rig's view of the thread. */
export const busyLog: [number, number][] = [];
/** When each animation-frame tick reached this worker (performance.now). */
export const rafTicks: number[] = [];
/** How many callbacks each of those ticks ran. */
export const tickCallbacks: number[] = [];
// The stretch ends in a microtask queued after the callback, so it takes in the runtime's
// settle, which the callback's changes queue as a microtask of their own. A callback run from
// inside another (the tick channel releasing held frame callbacks) is part of the outer stretch.
let open = false;
const timed = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A): void => {
  if (open) { fn(...a); return; }
  open = true;
  const t0 = performance.now();
  try { fn(...a); } finally { queueMicrotask(() => { open = false; const d = performance.now() - t0; busy.ms += d; if (busyLog.length < 50000 && d > 0.05) busyLog.push([t0, d]); }); }
};
{
  const raf = (globalThis.requestAnimationFrame as (cb: FrameRequestCallback) => number).bind(globalThis);
  let lastTick = -1;
  g.requestAnimationFrame = (cb: FrameRequestCallback) => raf(timed((t: number) => {
    // one entry per animation-frame tick the worker is given (several callbacks share one)
    if (t !== lastTick) { lastTick = t; if (rafTicks.length < 50000) rafTicks.push(performance.now()); tickCallbacks.push(0); }
    tickCallbacks[tickCallbacks.length - 1]++;
    cb(t);
    afterTickSoon();
  }));
  const st = globalThis.setTimeout.bind(globalThis);
  g.setTimeout = (fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) =>
    typeof fn === "function" ? st(timed(fn), ms, ...rest) : st(fn, ms, ...rest);
}
export { timed };

/** THE FRAME ENDS WHERE THE TICK ENDS. What the runtime changes in an animation-frame
 *  tick has to reach the screen in that tick's frame. MacBackend schedules its flush with
 *  a requestAnimationFrame made while those changes are being made, and when that lands in
 *  the NEXT tick (Safari, measured: every other tick drew, 30 fps) two ticks' changes
 *  share one frame. So after a tick's callbacks have run, one task — queued behind them
 *  through a MessageChannel — runs `afterTick` (worker.ts: flush and draw). */
let afterTick: () => void = () => {};
export function setAfterTick(fn: () => void): void { afterTick = fn; }
const channel = new MessageChannel();
let tickQueued = false;
channel.port1.onmessage = timed(() => { tickQueued = false; releaseHeld(); afterTick(); });
function afterTickSoon(): void {
  if (tickQueued) return;
  tickQueued = true;
  channel.port2.postMessage(0);
}

g.__declareHostName = "browser";

export const win = new Target() as Target & Record<string, unknown>;
export const doc = new Target() as Target & Record<string, unknown>;

win.innerWidth = 1280; win.innerHeight = 800;
win.scrollX = 0; win.scrollY = 0;
win.devicePixelRatio = 1;
win.getSelection = () => null;
win.location = g.location;
win.navigator = g.navigator;
g.window = win;
g.document = doc;
win.document = doc;
g.innerWidth = 1280; g.innerHeight = 800; g.devicePixelRatio = 1;

const styleStub = (): unknown => new Proxy({}, { get: () => "", set: () => true });
doc.body = { style: styleStub(), appendChild() {}, removeChild() {}, contains: () => false };
doc.documentElement = {
  style: styleStub(),
  get clientWidth() { return win.innerWidth; },
  get clientHeight() { return win.innerHeight; },
};
doc.getSelection = () => null;
doc.activeElement = null;
doc.querySelector = () => null;
doc.querySelectorAll = () => [];
doc.getElementById = () => null;
doc.createTextNode = (t: string) => ({ textContent: t });
doc.createElement = (tag: string) => {
  const t = String(tag).toLowerCase();
  if (t === "img") return new DeclareImage();
  // video and audio play on the page; this is their stand-in (media.ts)
  if (t === "video" || t === "audio") return new MediaElement(t, () => imageBase || (self as unknown as { location: { href: string } }).location.href);
  return { style: styleStub(), appendChild() {}, remove() {}, setAttribute() {}, getContext: () => null };
};
doc.fonts = { ready: Promise.resolve(), add() {}, delete() { return true; }, check: () => true, forEach() {}, addEventListener() {} };
let visible = true;
Object.defineProperty(doc, "visibilityState", { get: () => (visible ? "visible" : "hidden") });

// ── images ────────────────────────────────────────────────────────────────────
// The runtime loads a bitmap through an <img> (image.ts: document.createElement("img"),
// `src`, `onload`). Here it is a stand-in with a numeric handle, as on the Mac host: setting
// `src` fetches and decodes the file in this worker, the sink (worker.ts) hands the pixels
// to the engine under the handle, and `onload` reports the natural size. MacBackend's IMAGE
// op names the handle.
/** Each handle's natural size, once decoded. */
export const imageSizes = new Map<number, { w: number; h: number }>();
let imageSink: ((handle: number, bitmap: ImageBitmap) => void) | null = null;
export function setImageSink(fn: (handle: number, bitmap: ImageBitmap) => void): void { imageSink = fn; }
let imageBase = "";
export function setImageBase(base: string): void { imageBase = base; }
let imageSeq = 1;
type Handler = ((ev: unknown) => void) | null;
class DeclareImage {
  readonly __handle = imageSeq++;
  /** The decoded pixels, kept for a drawing that must be rastered (drawing.ts). */
  bitmap: ImageBitmap | null = null;
  width = 0; height = 0; naturalWidth = 0; naturalHeight = 0;
  complete = false;
  onload: Handler = null;
  onerror: Handler = null;
  decoding = "async";
  crossOrigin: string | null = null;
  private srcText = "";
  private listeners = new Map<string, Set<(ev: unknown) => void>>();
  private done: Promise<void> | null = null;
  get src(): string { return this.srcText; }
  set src(v: string) {
    this.srcText = String(v);
    this.complete = false;
    let url = this.srcText;
    try { url = new URL(this.srcText, imageBase || (self as unknown as { location: { href: string } }).location.href).href; } catch { /* as given */ }
    this.done = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.blob(); })
      .then((b) => createImageBitmap(b))
      .then((bmp) => {
        this.width = this.naturalWidth = bmp.width;
        this.height = this.naturalHeight = bmp.height;
        imageSizes.set(this.__handle, { w: bmp.width, h: bmp.height });
        this.bitmap = bmp;
        imageSink?.(this.__handle, bmp);
        this.complete = true;
        this.fire("load");
      }, (e) => { this.complete = true; this.fire("error"); throw e; });
    this.done.catch(() => {});
  }
  decode(): Promise<void> { return this.done ?? Promise.resolve(); }
  addEventListener(t: string, fn: (ev: unknown) => void): void { (this.listeners.get(t) ?? this.listeners.set(t, new Set()).get(t)!).add(fn); }
  removeEventListener(t: string, fn: (ev: unknown) => void): void { this.listeners.get(t)?.delete(fn); }
  private fire(type: "load" | "error"): void {
    const ev = { type, target: this };
    try { (type === "load" ? this.onload : this.onerror)?.(ev); } catch (e) { console.error("image:", e); }
    for (const fn of this.listeners.get(type) ?? []) { try { fn(ev); } catch (e) { console.error("image:", e); } }
  }
}
g.Image = DeclareImage;

// in-memory sounds play on the page's Web Audio (media.ts), installed before the runtime asks
installClipHost(() => imageBase || (self as unknown as { location: { href: string } }).location.href);

/** A program's image as something a 2D context can draw: its decoded bitmap. */
export function imageBitmapOf(src: unknown): ImageBitmap | undefined {
  return src instanceof DeclareImage ? src.bitmap ?? undefined : undefined;
}

// Never callable here: the runtime's DOM-only paths check for these.
g.getComputedStyle = undefined;
// `instanceof Element` appears in shared paths without a guard; nothing is ever one.
class DeclareElement {}
g.Element = DeclareElement;
g.HTMLElement = class extends DeclareElement {};
g.HTMLInputElement = class extends DeclareElement {};
g.HTMLTextAreaElement = class extends DeclareElement {};
g.Node = class {};

// Appearance and pointers, as the page reports them: the primary pointer's
// coarseness, and what the device has at all (any-pointer) — they differ on a
// touch laptop (fine primary, a touchscreen too) and an iPad with a trackpad.
let dark = false;
let coarse = false;
let anyCoarse = false;
let anyFine = true;
const queries = new Set<Target & Record<string, unknown>>();
const matchMedia = (q: string): unknown => {
  const mq = new Target() as Target & Record<string, unknown>;
  mq.media = q;
  Object.defineProperty(mq, "matches", {
    get: () => /prefers-color-scheme\s*:\s*dark/.test(q) ? dark
      : /prefers-color-scheme\s*:\s*light/.test(q) ? !dark
      : /any-pointer\s*:\s*coarse/.test(q) ? anyCoarse
      : /any-pointer\s*:\s*fine/.test(q) ? anyFine
      : /pointer\s*:\s*coarse/.test(q) ? coarse
      : /pointer\s*:\s*fine/.test(q) ? !coarse : false,
  });
  mq.addListener = (fn: Listener) => mq.addEventListener("change", fn);
  mq.removeListener = (fn: Listener) => mq.removeEventListener("change", fn);
  queries.add(mq);
  return mq;
};
g.matchMedia = matchMedia;
win.matchMedia = matchMedia;

function ev(type: string, props: Record<string, unknown>): Record<string, unknown> {
  return Object.assign({ type, defaultPrevented: false, isTrusted: true, target: null,
    preventDefault() { (this as { defaultPrevented: boolean }).defaultPrevented = true; },
    stopPropagation() {} }, props);
}

/** The page's state, as the shell reports it. */
export function setPage(p: { width: number; height: number; dpr: number; dark: boolean; coarse: boolean; anyCoarse?: boolean; anyFine?: boolean }): void {
  const resized = p.width !== win.innerWidth || p.height !== win.innerHeight || p.dpr !== win.devicePixelRatio;
  win.innerWidth = p.width; win.innerHeight = p.height; win.devicePixelRatio = p.dpr;
  g.innerWidth = p.width; g.innerHeight = p.height; g.devicePixelRatio = p.dpr;
  // a page that does not report the any-pointer pair (an older shell) answers as before: the primary one
  const ac = p.anyCoarse ?? p.coarse, af = p.anyFine ?? !p.coarse;
  const appearance = p.dark !== dark || p.coarse !== coarse || ac !== anyCoarse || af !== anyFine;
  dark = p.dark; coarse = p.coarse; anyCoarse = ac; anyFine = af;
  if (resized) win.dispatchEvent(ev("resize", {}));
  if (appearance) for (const mq of queries) mq.dispatchEvent({ type: "change", matches: mq.matches, media: mq.media } as never);
}

export function setVisible(v: boolean): void {
  if (v === visible) return;
  visible = v;
  doc.dispatchEvent({ type: "visibilitychange" });
}

/** A pointer event from the page, in the program's coordinates. Answers whether the
 *  program prevented its default. */
export function pointer(type: string, p: Record<string, unknown>): boolean {
  const e = ev(type, { pageX: p.clientX, pageY: p.clientY, relatedTarget: null, ...p });
  win.dispatchEvent(e as never);
  return e.defaultPrevented === true;
}

/** A touch event from the page (touches in the program's coordinates). */
export function touch(type: string, p: Record<string, unknown>): void {
  win.dispatchEvent(ev(type, p) as never);
}

/** A key event from the page; dispatched on window and document, as the browser does. */
// A key pressed and let go between two frames is held until the next frame has run. On the
// page a frame falls between the two events of any real press; here both can arrive in one
// batch of messages, and a program that reads `Keys.isDown` once a frame would never see the
// press. So the release of a key that went down since the last tick waits for the tick's
// callbacks to have run (or 50 ms, for a program asking for no frames).
const downSinceTick = new Set<string>();
let heldUps: Record<string, unknown>[] = [];
let heldTimer: ReturnType<typeof setTimeout> | null = null;
function releaseHeld(): void {
  downSinceTick.clear();
  if (heldTimer !== null) { clearTimeout(heldTimer); heldTimer = null; }
  const ups = heldUps;
  heldUps = [];
  for (const p of ups) deliverKey("keyup", p);
}
export function key(type: string, p: Record<string, unknown>): boolean {
  const code = String(p.code ?? p.key ?? "");
  if (type === "keydown") downSinceTick.add(code);
  else if (type === "keyup" && downSinceTick.has(code)) {
    heldUps.push(p);
    heldTimer ??= setTimeout(releaseHeld, 50);
    return false;
  }
  return deliverKey(type, p);
}
function deliverKey(type: string, p: Record<string, unknown>): boolean {
  const a = ev(type, p);
  win.dispatchEvent(a as never);
  const b = ev(type, p);
  doc.dispatchEvent(b as never);
  return a.defaultPrevented === true || b.defaultPrevented === true;
}

/** Any other window event (focus, blur). */
export function windowEvent(type: string): void {
  win.dispatchEvent(ev(type, {}) as never);
}
