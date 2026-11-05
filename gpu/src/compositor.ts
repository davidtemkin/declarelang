// compositor — the render=gpu worker that draws (the canvas, the engine and the host's tree).
//
// The page (shell.ts) hands this worker the canvas and the input that moves what is drawn:
// pointers (the scrollbar's first), wheels and touches. The runtime runs in a worker of its
// own (worker.ts) and sends its commits here through a port (remote-host.ts), so a scroll —
// a wheel, a touch's drag and momentum, a glide, the scrollbar — moves and is drawn here while
// the runtime is busy; the runtime hears what moved afterwards (scroll facts), as on the Mac.
// What the program must hear goes on to the runtime: a pointer the scrollbar did not take, a
// wheel an `onWheel` view claims.

import init, { Engine, create_gpu } from "../dist/engine.js";
import { GpuHost, setTrace, setCull, setNoClip, setDamage, setDiag, setLayers, setCensus, setNoSharpen } from "./host.js";
import { BUNDLED, setRegistered, setDeclared } from "./fonts.js";
import { provideMeasurer } from "../../runtime/dist/measure.js";
import { MEDIA_KEY } from "./media.js";

type Msg = Record<string, unknown> & { t: string };
const toPage = (m: Msg): void => (self as unknown as Worker).postMessage(m);

/** This worker's busy time, ms: messages and frame callbacks (the timing rig reads it). */
const busy = { ms: 0 };
let open = false;
const timed = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A): void => {
  if (open) { fn(...a); return; }
  open = true;
  const t0 = performance.now();
  try { fn(...a); } finally { queueMicrotask(() => { open = false; busy.ms += performance.now() - t0; }); }
};
{
  const raf = (globalThis.requestAnimationFrame as (cb: FrameRequestCallback) => number).bind(globalThis);
  (globalThis as unknown as Record<string, unknown>).requestAnimationFrame = (cb: FrameRequestCallback) => raf(timed(cb));
}

let host: GpuHost | null = null;
let engine: Engine | null = null;
let port: MessagePort | null = null;
const toRuntime = (m: Msg, transfer: Transferable[] = []): void => port?.postMessage(m, transfer);

/** WebGPU calls by name (`&gpucalls`, a diagnostic): each method of the device, queue,
 *  command encoder and passes is counted as the engine makes it. */
const gpuCalls: Record<string, number> = {};
function countGpuCalls(): void {
  const g = globalThis as unknown as Record<string, { prototype: Record<string, unknown> } | undefined>;
  for (const cls of ["GPUDevice", "GPUQueue", "GPUCommandEncoder", "GPURenderPassEncoder", "GPUComputePassEncoder", "GPUTexture", "GPUBuffer"]) {
    const proto = g[cls]?.prototype;
    if (proto === undefined) continue;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, name);
      if (d === undefined || typeof d.value !== "function" || name === "constructor") continue;
      const f = d.value as (...a: unknown[]) => unknown, key = cls.replace("GPU", "") + "." + name;
      proto[name] = function (this: unknown, ...a: unknown[]) { gpuCalls[key] = (gpuCalls[key] ?? 0) + 1; return f.apply(this, a); };
    }
  }
}

/** With `&gpumem`: WebGPU textures and buffers made, destroyed, and freed by the collector
 *  (wgpu leaves a dropped one to the collector), in MB; `live` is what is held. */
const gpuMem = { made: 0, destroyed: 0, collected: 0, live: 0 };
const gpuMade: Record<string, number> = {};
function countGpuMemory(): void {
  const g = globalThis as unknown as Record<string, { prototype: Record<string, unknown> } | undefined>;
  const sizes = new WeakMap<object, number>();
  const freed = new FinalizationRegistry<{ mb: number; done: { v: boolean } }>((h) => { if (!h.done.v) { gpuMem.collected += h.mb; gpuMem.live -= h.mb; } });
  const dones = new WeakMap<object, { v: boolean }>();
  const track = (o: object, mb: number): void => {
    const done = { v: false };
    sizes.set(o, mb); dones.set(o, done); freed.register(o, { mb, done });
    gpuMem.made += mb; gpuMem.live += mb;
  };
  const dev = g.GPUDevice!.prototype;
  const ct = dev.createTexture as (d: GPUTextureDescriptor) => GPUTexture, cb = dev.createBuffer as (d: GPUBufferDescriptor) => GPUBuffer;
  dev.createTexture = function (this: GPUDevice, d: GPUTextureDescriptor) {
    const t = ct.call(this, d);
    track(t, t.width * t.height * t.depthOrArrayLayers * 4 / 1048576);
    const k = "t:" + (d.label ?? "") + (d.label?.startsWith("declare layer") ? ` ${t.width >> 8 << 8}x${t.height >> 8 << 8}` : ""); gpuMade[k] = (gpuMade[k] ?? 0) + t.width * t.height * t.depthOrArrayLayers * 4 / 1048576;
    return t;
  };
  dev.createBuffer = function (this: GPUDevice, d: GPUBufferDescriptor) {
    const b = cb.call(this, d);
    track(b, d.size / 1048576);
    const k = "b:" + (d.label ?? ""); gpuMade[k] = (gpuMade[k] ?? 0) + d.size / 1048576;
    return b;
  };
  for (const cls of ["GPUTexture", "GPUBuffer"]) {
    const proto = g[cls]!.prototype, f = proto.destroy as () => void;
    proto.destroy = function (this: object) {
      const done = dones.get(this), mb = sizes.get(this) ?? 0;
      if (done !== undefined && !done.v) { done.v = true; gpuMem.destroyed += mb; gpuMem.live -= mb; }
      f.call(this);
    };
  }
}

const summary = (a: number[]) => {
  if (a.length === 0) return null;
  const s = [...a].sort((x, y) => x - y);
  const q = (p: number) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
  return { n: a.length, median: q(0.5), p95: q(0.95), max: +s[s.length - 1].toFixed(2), mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) };
};

/** This worker's part of the timing rig's stats (worker.ts merges it with the runtime's). */
function statsPart(clear: boolean): Msg {
  const e = engine;
  const paint = e === null ? null : (() => {
    const v = e.paint_counts(clear);
    return Object.fromEntries(["glyphs", "atlasDraws", "resets", "vello", "backdrops", "insts", "plans", "sprites", "spriteResets", "pictures", "missReach", "missRecent", "missTurned", "missLarge", "missRoom", "spriteLaid", "keptPlans", "keptRecorded", "keptGroups", "groupsMade"].map((k, i) => [k, v[i]]));
  })();
  const out: Msg = {
    t: "stats-part", host: host?.stats(clear) ?? null, paint, busy: busy.ms, gpuCalls: { ...gpuCalls },
    // each frame's GPU time from timestamps (the span of its own work, no queueing)
    // the engine's textures, MB by holder (lib.rs texture_bytes)
    gpuMem: Object.fromEntries(Object.entries(gpuMem).map(([k, v]) => [k, +v.toFixed(1)])),
    gpuMade: Object.fromEntries(Object.entries(gpuMade).map(([k, v]) => [k, +v.toFixed(1)])),
    tex: e ? ((v: Float64Array) => Object.fromEntries(["frame", "snap", "pool", "tiles", "caches", "layers", "bitmaps", "big", "groups", "quads", "groupCount", "poolHits", "poolMisses", "poolCapped", "poolEvicted"].map((k, i) => [k, +(v[i] ?? 0).toFixed(1)])))(e.texture_bytes()) : null,
    gpuExec: e ? summary(Array.from(e.gpu_times()).filter((_, i) => i % 2 === 1)) : null,
    // with &gpustages: each stage's GPU time over these frames, ms and spans (`gap`: waiting)
    gpuStages: e ? Object.fromEntries(e.gpu_stages().split("\n").filter((l) => l !== "").map((l) => { const [k, ms, n] = l.split("\t"); return [k, [+ms, +n]]; })) : null,
  };
  if (clear) { busy.ms = 0; for (const k in gpuCalls) delete gpuCalls[k]; }
  return out;
}

/** The bundled faces, into the engine (the runtime's worker loads the same into its own). */
async function loadFonts(e: Engine): Promise<void> {
  const base = new URL("../fonts/", import.meta.url);
  await Promise.all((Object.keys(BUNDLED) as (keyof typeof BUNDLED)[]).map(async (cat) => {
    for (const file of BUNDLED[cat]) {
      const bytes = new Uint8Array(await (await fetch(new URL(file, base).href)).arrayBuffer());
      const names = e.add_font(bytes).split("\n").filter(Boolean);
      if (names.length > 0 && !file.includes("Italic")) setRegistered(cat, names[0]);
    }
  }));
}

/** Messages from the page and the runtime, held until the engine is up, then taken in order. */
let ready = false;
const held: [Msg, "page" | "runtime"][] = [];

async function boot(m: Msg): Promise<void> {
  const marks: Record<string, number> = {};
  const mark = (k: string): void => { marks[k] = performance.timeOrigin + performance.now(); };
  const page = m.page as { width: number; height: number; dpr: number };
  const q = new URL(m.href as string).searchParams;
  setTrace(q.has("trace")); setCull(!q.has("nocull")); setNoClip(q.has("noclip")); setDamage(!q.has("nodamage"));
  setDiag(q.has("nofrost"), q.has("imgq") ? Number(q.get("imgq")) : -1);
  setLayers(!q.has("nolayers")); setCensus(q.has("census")); setNoSharpen(q.has("nosharpen"));
  port = m.port as MessagePort;
  port.onmessage = timed((e: MessageEvent<Msg>) => take(e.data, "runtime"));
  // fetched as bytes: a host may serve .wasm under any type (the dev server does)
  await init({ module_or_path: await (await fetch(new URL("./engine_bg.wasm", import.meta.url))).arrayBuffer() });
  const e = new Engine();
  // ordinary content as quads (paint.rs); `&noquads` draws every command with Vello, for an A/B
  e.set_quads(!q.has("noquads"));
  e.set_moving_sprites(!q.has("oldsprites"));
  engine = e;
  mark("engine");
  await loadFonts(e);
  mark("fonts");
  if (q.has("gpucalls")) countGpuCalls();
  if (q.has("gpumem")) countGpuMemory();
  const gpu = await create_gpu(m.canvas as OffscreenCanvas, Math.round(page.width * page.dpr), Math.round(page.height * page.dpr));
  e.attach(gpu);
  e.set_timing(q.has("timing") || q.has("gpustages"));
  if (q.has("gpustages")) e.set_timing_detail(true);
  mark("gpu");
  host = new GpuHost(e, {
    cursor: (c) => toPage({ t: "cursor", c }),
    pageFill: (c) => toPage({ t: "page-fill", c }),
    pageMap: (map) => toPage({ t: "page-map", map }),
    pageScrollTo: (y, ms) => toPage({ t: "page-scroll-to", y, ms }),
    edit: (id, spec, box) => toPage({ t: "edit", id, spec, box }),
    editFocus: (id, on) => toPage({ t: "edit-focus", id, on }),
    editSel: (id, start, end) => toPage({ t: "edit-sel", id, start, end }),
    editApply: (id, from, text) => toPage({ t: "edit-apply", id, from, text }),
    island: (id, slot) => toRuntime({ t: "island", id, slot }),
    appIsland: (id, slot) => toRuntime({ t: "app-island", id, slot }),
    islandBox: (id, box) => toPage({ t: "island-box", id, box }),
  }, page);
  (globalThis as unknown as { __declareGpuHost: GpuHost }).__declareGpuHost = host;
  // unchanged subtrees' walks and plans kept between frames; `&nokeep` makes them every frame, for an A/B
  e.set_keep(!q.has("nokeep"));
  if (q.has("nokeepplans")) e.set_keep_plans(false);
  // what the scroll process moved reaches the program after the frame that showed it
  host.onFacts = (rows) => toRuntime({ t: "facts", rows });
  // a whole-page app scrolls the window: the browser's own scroll and scrollbar (shell.ts);
  // `&nopagescroll` keeps the compositor's own, for an A/B
  if (m.embedded !== true && !q.has("nopagescroll")) e.host_set_page_native(true);
  host.onThree = (ids) => toRuntime({ t: "three", ids });
  // the Texts this worker lays out measure as the runtime measures
  provideMeasurer(host.measurer() as CanvasRenderingContext2D);
  ready = true;
  toRuntime({ t: "up", marks });
  for (const [h, from] of held.splice(0)) take(h, from);
}

/** The last natural size sent to the runtime for each video. */
const mediaSizes = new Map<number, string>();

function take(m: Msg, from: "page" | "runtime"): void {
  if (!ready) { held.push([m, from]); return; }
  const h = host!;
  if (typeof m.ts === "number" && (m.t === "pointer" || m.t === "wheel" || m.t === "touch")) h.input(m.ts);
  switch (m.t) {
    // ── from the runtime ──
    case "commit":
      h.replay(m.calls as [string, unknown[]][]);
      if ((m.proj as number[][]).length > 0) h.project(m.proj as number[][]);
      if (typeof m.input === "number") h.input(m.input);
      h.commit(m.json as string, m.geoms as Float64Array, m.n as number);
      h.paintCommit();
      return;
    case "calls": h.replay(m.calls as [string, unknown[]][]); return;
    case "proj": h.project(m.proj as number[][]); return;
    case "image": {
      // copied on the GPU from the bitmap; its pixels read back only when it cannot be
      const handle = m.handle as number, bmp = m.bitmap as ImageBitmap;
      if (!engine!.add_image_bitmap(handle, bmp)) {
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext("2d")!;
        ctx.drawImage(bmp, 0, 0);
        engine!.add_image(handle, bmp.width, bmp.height, new Uint8Array(ctx.getImageData(0, 0, bmp.width, bmp.height).data.buffer));
      }
      h.imageLanded(handle, bmp.width, bmp.height);
      return;
    }
    // a program's own face: its file into the engine, then its name for the family it declares
    case "font": engine!.add_font(m.bytes as Uint8Array); return;
    case "font-declared": setDeclared(m.family as string, m.name as string); h.fontsChanged(); return;
    case "touch-claim": h.touchClaim(m.claimed === true); return;
    case "touch-claims": h.touchClaims(m.add as number[], m.remove as number[]); return;
    case "page-scroll": h.pageScroll(m.y as number); return;
    case "edit-shown": h.fieldShown(m.id as number, m.on === true); return;
    case "stats": toRuntime(statsPart(m.clear === true)); return;
    case "probe": toPage({ t: "probe", nodes: h.probe(String(m.text)) }); return;
    // ── from the page ──
    case "page": {
      const p = m.page as { width: number; height: number; dpr: number };
      h.resize(p.width, p.height, p.dpr);
      return;
    }
    // the scrollbar sees a pointer first; what it does not take is the program's
    case "pointer": if (!h.barPointer(m.type as string, m.p as never)) toRuntime(m); return;
    case "wheel": {
      // the scroll process takes a wheel over a scroller; a claimant's goes to the program
      const r = h.wheel(m.x as number, m.y as number, m.dx as number, m.dy as number, m.pinch === true, m.notch === true);
      toRuntime({ ...m, claim: r === "claim" });
      return;
    }
    case "touch": h.touchEvent(m.type as string, m.p as never, performance.now()); return;
    case "media-frame": {
      const bmp = m.bitmap as ImageBitmap, key = MEDIA_KEY + (m.id as number);
      engine!.video_frame(key, bmp);
      const size = `${bmp.width}x${bmp.height}`;
      if (mediaSizes.get(key) !== size) { mediaSizes.set(key, size); toRuntime({ t: "media-size", key, w: bmp.width, h: bmp.height }); }
      h.imageLanded(key, bmp.width, bmp.height);
      bmp.close();
      return;
    }
  }
}

// what goes wrong in here is reported to the page, which a harness can read
self.addEventListener("error", (e) => toPage({ t: "error", msg: `${e.message} (${e.filename}:${e.lineno})` }));
self.addEventListener("unhandledrejection", (e) => toPage({ t: "error", msg: "unhandled: " + String((e.reason as Error)?.stack ?? e.reason) }));

self.onmessage = timed((e: MessageEvent<Msg>): void => {
  const m = e.data;
  if (m.t === "init") { boot(m).catch((err) => { console.error(err); toPage({ t: "error", msg: String((err && (err as Error).stack) || err) }); }); return; }
  take(m, "page");
});
