// worker — the program, off the page's thread (render=gpu).
//
// The page (shell.ts) hands this worker the program, already resolved by the ordinary
// boot, and a port to the compositor worker (compositor.ts), which owns the canvas; from
// then on the page relays what the person does. Here the runtime — the same one every
// renderer runs — builds the program and drives MacBackend, the retained-layer backend,
// whose host is in the compositor: its commits go there through the port (remote-host.ts),
// and what the compositor's scroll process moved comes back as facts. Nothing in this worker
// touches the page; what the page must do goes back as a message.

import { win, setPage, setVisible, pointer, touch, key, windowEvent, busy, busyLog, rafTicks, tickCallbacks, timed, setAfterTick, STARTED, setImageSink, setImageBase, imageSizes } from "./env.js";
import {
  buildProgram, mountApp, settle, kernelReady, provideMeasurer, provideTransport, provideAssetBase,
  fontsReady, Focus, Keys, deliverKeys, bridgeFor, setFontHost, observe, inspect,
  islandProvisions, linkIslandTenant, islandNavigation, mountEmbeddedApp, feedPointer, provideHostServices, setAppAssetBase,
} from "../../runtime/dist/index.js";
import { setDeclared } from "./fonts.js";
import { seedAddress, wireAddress, type AddressSeed } from "./address.js";
import { mediaEvent, clipEvent } from "./media.js";
import { mapUrl, assetBaseFor } from "../../runtime/dist/asset-base.js";
import { MacBackend, flushOps, macWheel, macScrollFacts, provideHitPath, islandViewById, macEditInput, macEditFocus, macEditEnter } from "../../runtime/dist/mac-backend.js";
import init, { Engine } from "../dist/engine.js";
import { RemoteHost } from "./remote-host.js";
import { BUNDLED, setRegistered } from "./fonts.js";

type Msg = Record<string, unknown> & { t: string };
const post = (m: Msg, transfer: Transferable[] = []): void => (self as unknown as Worker).postMessage(m, transfer);

let host: RemoteHost | null = null;
let port: MessagePort | null = null;
const toCompositor = (m: Msg, transfer: Transferable[] = []): void => port?.postMessage(m, transfer);
let TRACE = false;
let address: { pop(state: unknown, fragment: string): void; userScrolled(): void; keep(): void } | null = null;

/** The foreign handles of open DOMIslands (island.ts $foreignHandle), by node id: the page's
 *  element gets a stand-in (shell.ts) whose every verb crosses to the real one here. */
interface ForeignHandle {
  provides(): string[];
  watchProvided(name: string, cb: (v: unknown) => void): () => void;
  expose(name: string, v: unknown): void;
  post(topic: string, payload?: unknown): void;
  onPost(cb: (m: { topic: string; payload: unknown }) => void): () => void;
}
const islandHandles = new Map<number, ForeignHandle>();
const islandUndo = new Map<number, (() => void)[]>();
const plain = (v: unknown): unknown => { try { return JSON.parse(JSON.stringify(v ?? null)); } catch { return null; } };
// ── AppIslands: the tenant is a Declare program, mounted by SURFACE COMPOSITION — its root
// surface a child of the island's (boot.ts mountEmbeddedApp, the canvas renderer's and the
// Mac host's own pattern), so the paint and hit walks reach it like any subtree. Its program
// comes from the page (shell.ts compile-island: the island ladder — prewarmed build, else
// compiled), resolved beside the app the island sits in. Then the same bridge as everywhere:
// the boundary linked, the navigation verbs handed over. ──
let islandReq = 1;
const islandWaits = new Map<number, (r: unknown) => void>();
const islandProgram = (url: string): Promise<unknown> => new Promise((resolve) => {
  const req = islandReq++;
  islandWaits.set(req, resolve);
  post({ t: "compile-island", req, url });
});
const reported = new Set<string>();
/** The distro's root (host-client's DISTRO_ROOT): what a navigation resolves against. */
const DISTRO_ROOT = new URL("../../", import.meta.url);
const navServices = {
  navigate: (u: string) => post({ t: "navigate", url: new URL(u, DISTRO_ROOT).href, newWindow: false }),
  openWindow: (u: string) => post({ t: "navigate", url: new URL(u, DISTRO_ROOT).href, newWindow: true }),
};
const resolveNav = (u: string): string => new URL(u, DISTRO_ROOT).href;
type IslandHost = { root?: unknown; post?: unknown; __childApp?: unknown; $surface?: unknown };
async function mountAppIsland(id: number, slot: string, mainDir: URL): Promise<void> {
  const view = islandViewById(id) as IslandHost | undefined;
  if (view === undefined || view.__childApp != null || mountingIslands.has(view)) return;
  const name = slot.slice(4);
  // beside the app the island sits in: the page's own program, or an embedded app's
  let dir = mainDir.href;
  if (view.$root != null && view.$root !== app) { const b = assetBaseFor(view.$root as never); if (b) dir = new URL(".", b).href; }
  const url = new URL(name + ".declare", dir).href;
  mountingIslands.add(view);
  const got = await islandProgram(url) as { program?: unknown; report?: unknown; missing?: boolean } | null;
  mountingIslands.delete(view);
  if (got?.program == null) {
    if (!reported.has(url)) {
      reported.add(url);
      console.error(got?.missing ? `[Declare] island '${name}': no such program (${url})` : `[Declare] island '${name}' did not compile`, got?.report ?? "");
    }
    return;
  }
  if (view.__childApp != null || view.$surface == null) return;          // raced a re-mark / detached
  try {
    const linked = typeof view.post === "function";
    const child = buildProgram(got.program as never, { provides: linked ? islandProvisions(view as never) : undefined }) as unknown as Record<string, unknown>;
    setAppAssetBase(child as never, url);
    if (linked) {
      try { child.__unlink = linkIslandTenant(view as never, child as never); }
      catch (e) { console.error(`[Declare] ${name}: ${(e as Error).message}`); }
    }
    mountEmbeddedApp(child as never, view as never);
    feedPointer(child as never, view as never);      // the pointer, in the island's frame; the tenant lives as long as the page
    provideHostServices(child as never, islandNavigation(view as never, resolveNav, navServices));
    view.__childApp = child;
    settle(); flushOps();
  } catch (e) {
    console.error(`[Declare] island '${name}' failed to mount`, e);
  }
}
const mountingIslands = new WeakSet<object>();

function islandSlot(id: number, slot: string): void {
  for (const u of islandUndo.get(id) ?? []) u();
  islandUndo.delete(id); islandHandles.delete(id);
  if (slot === "") { post({ t: "island", id, slot: "" }); return; }
  const view = islandViewById(id) as { $foreignHandle?: () => ForeignHandle } | undefined;
  const h = view?.$foreignHandle?.();
  if (h === undefined) return;
  islandHandles.set(id, h);
  const names = h.provides();
  post({ t: "island", id, slot, provides: names });
  const undo: (() => void)[] = [];
  for (const name of names) undo.push(h.watchProvided(name, (v) => post({ t: "island-provided", id, name, v: plain(v) })));
  undo.push(h.onPost((msg) => post({ t: "island-msg", id, topic: msg.topic, payload: plain(msg.payload) })));
  islandUndo.set(id, undo);
}

// ── timing (read by gpu/bench.ts through the "stats" message) ─────────────────
/** Per event type: how long each took to reach this worker from the page's handler. */
const arrivals = new Map<string, number[]>();
/** Each input as it arrived: type, the page's timestamp, the arrival (both timeOrigin-based). */
const inputs: { type: string; ts: number; at: number }[] = [];
function arrived(m: Msg): void {
  if (typeof m.ts !== "number") return;
  const now = performance.timeOrigin + performance.now();
  if (inputs.length < 20000 && m.t !== "stats" && m.t !== "page") inputs.push({ type: m.t === "pointer" || m.t === "key" || m.t === "touch" ? String(m.type) : m.t, ts: m.ts, at: now });
  const key = m.t === "pointer" || m.t === "key" || m.t === "touch" ? `${m.t}:${String(m.type)}` : m.t;
  let a = arrivals.get(key);
  if (a === undefined) { a = []; arrivals.set(key, a); }
  if (a.length < 20000) a.push(now - m.ts);
  if (host !== null && m.t !== "stats" && m.t !== "page") host.inputArrived(m.ts);
}
const summary = (a: number[]) => {
  if (a.length === 0) return null;
  const s = [...a].sort((x, y) => x - y);
  const q = (p: number) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
  return { n: a.length, median: q(0.5), p95: q(0.95), max: +s[s.length - 1].toFixed(2), mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) };
};

/** The stats: this worker's (the runtime's time, the inputs' crossings, the frame clock) with
 *  the compositor's (frames, their encode and GPU times, the census, the painter's counts).
 *  `busy` is both workers' together; `busyRuntime` and `busyCompositor` each. */
let statsWait: ((part: Msg) => void) | null = null;
async function stats(clear: boolean): Promise<Msg> {
  const part = await new Promise<Msg>((res) => { statsWait = res; toCompositor({ t: "stats", clear }); });
  const hs = part.host as { frames: number; log: number[]; timing: number[][]; ops: Record<string, number>;
    counts: Record<string, number>; damage: Record<string, number>; census: unknown[] } | null;
  const t = (hs?.timing ?? []).map(([id, start, encode, done, inputToSubmit]) => ({ id, start, encode, done, inputToSubmit }));
  const intervals = t.slice(1).map((r, i) => r.start - t[i].start);
  const compositorBusy = part.busy as number;
  const out: Msg = {
    t: "stats", frames: hs?.frames ?? 0, busy: +(busy.ms + compositorBusy).toFixed(1), log: hs?.log ?? [],
    busyRuntime: +busy.ms.toFixed(1), busyCompositor: +compositorBusy.toFixed(1),
    arrivals: Object.fromEntries([...arrivals].map(([k, v]) => [k, summary(v)])),
    encode: summary(t.map((r) => r.encode)),
    gpu: summary(t.filter((r) => r.done > 0).map((r) => r.done - r.start - r.encode)),
    inputToSubmit: summary(t.filter((r) => r.inputToSubmit >= 0 && r.inputToSubmit < 1000).map((r) => r.inputToSubmit)),
    frameInterval: summary(intervals),
    longGaps: intervals.filter((x) => x > 50).map((x) => +x.toFixed(1)).slice(0, 40),
    // raw, for per-interaction analysis: frames as [start, encode, gpu] (absolute ms), inputs
    frames_raw: t.map((r) => [+(performance.timeOrigin + r.start).toFixed(2), +r.encode.toFixed(2), r.done > 0 ? +(r.done - r.start - r.encode).toFixed(2) : -1]),
    inputs_raw: inputs.map((i) => [i.type, +i.ts.toFixed(2), +i.at.toFixed(2)]),
    busy_raw: busyLog.map(([a, b]) => [+(performance.timeOrigin + a).toFixed(2), +b.toFixed(2)]),
    raf_raw: rafTicks.map((t) => +(performance.timeOrigin + t).toFixed(2)),
    raf_callbacks: [...tickCallbacks],
    ops: hs?.ops ?? {},
    counts: hs?.counts ?? null,
    damage: hs?.damage ?? null,
    census: hs?.census ?? [],
    paint: part.paint, gpuCalls: part.gpuCalls, gpuExec: part.gpuExec, gpuStages: part.gpuStages, tex: part.tex, gpuMem: part.gpuMem, gpuMade: part.gpuMade,
  };
  if (clear) { arrivals.clear(); inputs.length = 0; busyLog.length = 0; rafTicks.length = 0; tickCallbacks.length = 0; busy.ms = 0; }
  return out;
}
let app: { appName?: string; discard?: () => void } | null = null;

/** The same file in this worker's own font set, by the engine's name for it, so a 2D
 *  context here (a drawing rastered whole, drawing.ts) draws the face the engine draws. */
async function workerFace(name: string, bytes: Uint8Array, d: FontFaceDescriptors): Promise<void> {
  try {
    const f = new FontFace(name, bytes.slice().buffer, d);
    (self as unknown as { fonts: FontFaceSet }).fonts.add(f);
    await f.load();
  } catch { /* the engine still has it */ }
}

/** Register the bundled families; answers family → file URL, for the page's fields. */
async function loadFonts(engine: Engine): Promise<[string, string][]> {
  const base = new URL("../fonts/", import.meta.url);
  const faces: [string, string][] = [];
  await Promise.all((Object.keys(BUNDLED) as (keyof typeof BUNDLED)[]).map(async (cat) => {
    for (const file of BUNDLED[cat]) {
      const url = new URL(file, base).href;
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const names = engine.add_font(bytes).split("\n").filter(Boolean);
      if (names.length === 0) continue;
      if (!file.includes("Italic")) setRegistered(cat, names[0]);
      faces.push([names[0], url]);
      await workerFace(names[0], bytes, { style: file.includes("Italic") ? "italic" : "normal", weight: "100 900" });
    }
  }));
  return faces;
}

/** The boot's milestones, absolute ms (timeOrigin-based), for the startup timeline. */
const marks: Record<string, number> = { workerStart: STARTED };
const mark = (k: string): void => { marks[k] = performance.timeOrigin + performance.now(); };

/** The compositor is up (its engine and GPU ready), with its own milestones. */
let compositorUp: (marks: Record<string, number>) => void = () => {};
const compositorReady = new Promise<Record<string, number>>((r) => { compositorUp = r; });

/** Where the program's file is: what an island's program resolves against. */
let mainDirUrl: URL | null = null;
const mainDirOf = (): URL => mainDirUrl ?? new URL(".", self.location.href);

/** The backend the program mounts on (its root is where a finger's claim is looked up). */
let backend: MacBackend | null = null;
/** The canvas renderer's claim (claimAt): whether the views under a finger take it (touch, or a
 *  drag that is not a hold), so it does not scroll. */
function claimAt(x: number, y: number): boolean {
  type S = { parent: S | null; wants?: { wantsTouch?: boolean; wantsDrag?: boolean; wantsHold?: boolean } };
  const root = (backend as unknown as { root?: { hit(x: number, y: number): { key: S } | null } } | null)?.root;
  const t = root?.hit(x, y) ?? null;
  for (let s: S | null = t !== null ? t.key : null; s !== null; s = s.parent) {
    if (s.wants?.wantsTouch === true) return true;
    if (s.wants?.wantsDrag === true && s.wants?.wantsHold !== true) return true;
  }
  return false;
}

/** The views that take a finger (claimAt's rule), followed as their input wants change and
 *  sent to the compositor with each flush: the page needs their boxes to tell, the moment a
 *  finger lands, whether the browser may pan the page under it (compositor.ts page map). */
type Claimant = { id: number; parent: Claimant | null; children?: Claimant[]; wants?: { wantsTouch?: boolean; wantsDrag?: boolean; wantsHold?: boolean } };
const takesFinger = (s: Claimant): boolean => s.wants?.wantsTouch === true || (s.wants?.wantsDrag === true && s.wants?.wantsHold !== true);
const claimants = new Set<number>();
const claimsAdded = new Set<number>(), claimsRemoved = new Set<number>();
function noteClaim(s: Claimant): void {
  const on = takesFinger(s);
  if (on === claimants.has(s.id)) return;
  if (on) { claimants.add(s.id); claimsAdded.add(s.id); claimsRemoved.delete(s.id); }
  else { claimants.delete(s.id); claimsRemoved.add(s.id); claimsAdded.delete(s.id); }
}
function followTouchClaims(): void {
  const root = (backend as unknown as { root?: Claimant } | null)?.root;
  if (root == null) return;
  const proto = Object.getPrototypeOf(root) as { setInput: (this: Claimant, ...a: unknown[]) => void };
  const set = proto.setInput;
  proto.setInput = function (this: Claimant, ...a: unknown[]) { set.apply(this, a); noteClaim(this); };
  const walk = (s: Claimant): void => { noteClaim(s); for (const c of s.children ?? []) walk(c); };
  walk(root);
}
function sendTouchClaims(): void {
  if (claimsAdded.size === 0 && claimsRemoved.size === 0) return;
  toCompositor({ t: "touch-claims", add: [...claimsAdded], remove: [...claimsRemoved] });
  claimsAdded.clear(); claimsRemoved.clear();
}

async function boot(m: Msg): Promise<void> {
  mark("initReceived");
  const page = m.page as { width: number; height: number; dpr: number; dark: boolean; coarse: boolean };
  setPage(page);
  win.location = new URL(m.href as string);
  TRACE = new URL(m.href as string).searchParams.has("trace");
  port = m.port as MessagePort;
  port.onmessage = timed((e: MessageEvent<Msg>) => onMessage(e.data));
  const t0 = performance.now();
  // fetched as bytes: a host may serve .wasm under any type (the dev server does)
  await init({ module_or_path: await (await fetch(new URL("./engine_bg.wasm", import.meta.url))).arrayBuffer() });
  // this worker's engine measures (the compositor's draws): the same fonts, no GPU
  const engine = new Engine();
  mark("engine");
  const faces = await loadFonts(engine);
  mark("fonts");
  post({ t: "fonts", faces });
  const tFonts = performance.now();

  host = new RemoteHost(engine, port);
  (globalThis as unknown as { __declareMacHost: RemoteHost }).__declareMacHost = host;
  // a shape clip's hit test: the path as the 2D context reads it
  const hitCtx = new OffscreenCanvas(1, 1).getContext("2d")!;
  const hitPaths = new Map<string, Path2D>();
  provideHitPath((d, x, y) => {
    let p = hitPaths.get(d);
    if (p === undefined) { p = new Path2D(d); if (hitPaths.size > 256) hitPaths.clear(); hitPaths.set(d, p); }
    return hitCtx.isPointInPath(p, x, y);
  });
  provideMeasurer(host.measurer() as CanvasRenderingContext2D);

  const mainDir = new URL(".", m.main as string);
  mainDirUrl = mainDir;
  // a decoded image goes to the compositor's engine under its handle (a clone: this worker keeps
  // the bitmap for a drawing rastered here), ahead of any drawing that shows it
  setImageBase(mainDir.href);
  setImageSink((handle, bmp) => toCompositor({ t: "image", handle, bitmap: bmp }));
  provideTransport((url: string, init?: RequestInit) => fetch(mapUrl(new URL(url, mainDir).href), init));
  provideAssetBase(mainDir.href);
  // A program's own fonts: each face's file goes to both engines, and the generation's name
  // (font.ts: declare-font-N-G) resolves to the family the file says it is. Adding is
  // registering here, so a face never added is never seen; the engines keep what they loaded.
  setFontHost({
    load: async (family, src, d) => {
      const url = /url\(\s*(["']?)([^"')]+)\1\s*\)/.exec(src)?.[2] ?? src;
      const r = await fetch(mapUrl(new URL(url, mainDir).href));
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      const names = engine.add_font(bytes).split("\n").filter(Boolean);
      if (names.length === 0) throw new Error(`no face in ${url}`);
      toCompositor({ t: "font", bytes: bytes.slice() });
      await workerFace(names[0], bytes, d);
      return { family, name: names[0] };
    },
    add: (h) => { const f = h as { family: string; name: string }; setDeclared(f.family, f.name); toCompositor({ t: "font-declared", family: f.family, name: f.name }); },
    remove: () => {},
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  await kernelReady();
  mark("kernel");

  const built = buildProgram(m.program as never, { provides: (m.provides ?? {}) as Record<string, unknown> }) as unknown as { appName?: string; discard?: () => void };
  app = built;
  mark("built");
  const seed = (m.address ?? { fragment: "", state: null, traversed: false }) as AddressSeed;
  const initial = seedAddress(built as never, seed);
  try { await fontsReady(built as never); } catch { /* faces the engine cannot load fall back */ }
  const stub = {
    closest: () => null, get clientWidth() { return win.innerWidth; }, get clientHeight() { return win.innerHeight; },
    style: {}, appendChild() {}, querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, removeEventListener() {}, isConnected: true, ownerDocument: (globalThis as { document?: unknown }).document,
  };
  // A view that attaches hidden waits with a stand-in until first shown, as under the DOM
  // (deferred-surface.ts): its drawing is not recorded, nor its surface made, while nobody can
  // see it. `&eagerhidden` makes every surface at once, for an A/B.
  const eager = new URL(m.href as string).searchParams.has("eagerhidden");
  backend = eager ? new MacBackend() : new (class extends MacBackend { readonly defersHidden = true; })();
  mountApp(built as never, stub as never, backend);
  followTouchClaims();
  setAfterTick(() => {
    if (TRACE) console.time("gpu:flush");
    flushOps();
    host?.flush();
    sendTouchClaims();
    if (TRACE) console.timeEnd("gpu:flush");
  });
  (globalThis as { __declare?: unknown }).__declare = bridgeFor(built as never);
  Focus.setRoot(built as never);
  Keys.listen(() => app !== null);
  deliverKeys(Keys, Focus);
  settle();
  flushOps();
  if (m.embedded !== true) address = wireAddress(built as never, initial, seed, post);
  provideHostServices(built as never, navServices);
  mark("firstFrameSubmitted");
  const tUp = performance.now();
  // the page hears the program is up once the compositor is too (it draws the first frame)
  const compMarks = await compositorReady;
  for (const [k, v] of Object.entries(compMarks)) marks["compositor:" + k] = v;
  // what page code reads first, before any watch it asks for answers: the app's own values
  let values: unknown = {};
  try { values = JSON.parse(JSON.stringify(inspect(built as never).attrs ?? {})); } catch { /* none */ }
  post({ t: "ready", title: built.appName ?? "", ms: { engine: tFonts - t0, gpu: 0, program: tUp - tFonts }, marks, values });
}

// what goes wrong in here is reported to the page, which a harness can read
self.addEventListener("error", (e) => post({ t: "error", msg: `${e.message} (${e.filename}:${e.lineno})` }));
self.addEventListener("unhandledrejection", (e) => post({ t: "error", msg: "unhandled: " + String((e.reason as Error)?.stack ?? e.reason) }));

function onMessage(m: Msg): void {
  arrived(m);
  switch (m.t) {
    case "init":
      boot(m).catch((err) => { console.error(err); post({ t: "error", msg: String((err && (err as Error).stack) || err) }); });
      return;
    case "page": {
      const p = m.page as { width: number; height: number; dpr: number; dark: boolean; coarse: boolean };
      setPage(p);
      settle(); flushOps();
      return;
    }
    case "visible": setVisible(m.v === true); return;
    // a pointer the compositor's scrollbar did not take
    case "pointer": pointer(m.type as string, m.p as Record<string, unknown>); return;
    case "touch": {
      if (m.type === "touchstart") {
        address?.userScrolled();
        const ts = (m.p as { touches?: { clientX: number; clientY: number }[] }).touches ?? [];
        if (ts.length === 1) toCompositor({ t: "touch-claim", claimed: claimAt(ts[0].clientX, ts[0].clientY) });
      }
      touch(m.type as string, m.p as Record<string, unknown>);
      return;
    }
    // a wheel the compositor saw: an `onWheel` view's stream is the program's
    case "wheel":
      address?.userScrolled();
      if (m.claim === true) macWheel(m.x as number, m.y as number, m.dx as number, m.dy as number, m.pinch === true);
      return;
    case "key": key(m.type as string, m.p as Record<string, unknown>); return;
    case "window": windowEvent(m.type as string); return;
    case "edit-input": macEditInput(m.id as number, m.value as string); settle(); flushOps(); return;
    case "edit-focus": macEditFocus(m.id as number, m.on === true); settle(); flushOps(); return;
    case "edit-enter": macEditEnter(m.id as number); settle(); flushOps(); return;
    case "probe": {
      // app:a.b.c reads a value from the running program; anything else asks the host
      const text = String(m.text);
      if (text.startsWith("app:")) {
        let v: unknown = app;
        for (const k of text.slice(4).split(".")) v = v == null ? v : (v as Record<string, unknown>)[k];
        let out: unknown;
        try { out = JSON.parse(JSON.stringify(v ?? null)); } catch { out = String(v); }
        post({ t: "probe", nodes: [out] });
      } else toCompositor({ t: "probe", text });
      return;
    }
    case "media-ev": mediaEvent(m.id as number, m.type as string, m.a as number, m.b as number, m.c as number); settle(); flushOps(); return;
    case "media-size": imageSizes.set(m.key as number, { w: m.w as number, h: m.h as number }); return;
    case "clip-ev": clipEvent(m.id as number, m.type as string, m.a as number); settle(); flushOps(); return;
    // the page's stand-in for the app (shell.ts): a value it reads, followed; a value it writes
    case "app-watch": {
      const name = String(m.name);
      const read = (): unknown => (app as Record<string, unknown> | null)?.[name];
      const send = (v: unknown): void => post({ t: "app-val", name, v: plain(v) });
      send(read());
      observe(read, send, "gpu:page-watch");
      return;
    }
    case "provide": if (app !== null) { (app as unknown as { provide(n: string, v: unknown): void }).provide(String(m.name), m.v); settle(); flushOps(); } return;
    case "island-program": { const f = islandWaits.get(m.req as number); islandWaits.delete(m.req as number); f?.(m.result); return; }
    case "app-set": if (app !== null) { (app as Record<string, unknown>)[String(m.name)] = m.v; settle(); flushOps(); } return;
    // a DOMIsland's foreign content, on the page, speaking through its handle
    case "island-expose": islandHandles.get(m.id as number)?.expose(String(m.name), m.v); settle(); flushOps(); return;
    case "island-post": islandHandles.get(m.id as number)?.post(String(m.topic), m.payload); settle(); flushOps(); return;
    case "keep": address?.keep(); return;
    case "pop": address?.pop(m.state, m.fragment as string); flushOps(); return;
    case "stats":
      stats(m.clear === true).then(post, (err) => post({ t: "error", msg: "stats: " + String((err as Error)?.stack ?? err) }));
      return;
    // ── from the compositor ──
    case "up": compositorUp(m.marks as Record<string, number>); return;
    case "stats-part": { const f = statsWait; statsWait = null; f?.(m); return; }
    // what the scroll process moved reaches the program after the frame that showed it
    case "facts": macScrollFacts(m.rows); settle(); flushOps(); return;
    case "three": host?.setThree(m.ids as number[]); return;
    // a DOMIsland's slot opened or closed, an AppIsland named its program (after the commit that did)
    case "island": islandSlot(m.id as number, m.slot as string); return;
    case "app-island": void mountAppIsland(m.id as number, m.slot as string, mainDirOf()); return;
  }
}
self.onmessage = timed((e: MessageEvent<Msg>): void => onMessage(e.data));
