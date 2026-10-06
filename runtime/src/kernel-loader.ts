// The kernel from JS — instantiate the WebAssembly (kernel/src/kernel.c via
// kernel/build.mjs, embedded as bytes in kernel-wasm.ts), place its arena in
// linear memory, bind the host callbacks, and expose the C ABI as plain
// functions plus typed-array views over the tables. One instance per program
// host; every host (browser, Mac's JavaScriptCore, node) loads it the same way.
//
// Nothing here knows the runtime: reactive.ts owns the instance and supplies
// the callbacks. See docs/system-design/kernel.md.

export const KERNEL_ERR = Object.freeze({ IMAGE: -1, ARENA: -2, OWNED: -3, CYCLE: -4, AFTER: -5, BOUND: -6, FULL: -7, BAD: -8, ABORT: -9 });
export const KERNEL_KIND = Object.freeze({ EXPR: 0, BODY: 1, DYNAMIC: 2 });
export const KERNEL_FLAG = Object.freeze({ YIELDING: 1, PHASE1: 2, PERCENT: 4 });
/** A layout child word's flag (kernel_layout_add): placed in the run, its slot not written. ADD it to the base. */
export const LAYOUT_NOWRITE = 0x80000000;
export const KERNEL_STATE = Object.freeze({ QUEUED: 1, DEAD: 2, SUSPENDED: 4, REWIRE: 8, UNLANDED: 16 });
/** The track ring's owner mark (declare_kernel.h): `OWNER | rule` closes the
 *  reads before it under `rule`; `OWNER | NOBODY` drops them. */
export const KERNEL_TRACK = Object.freeze({ OWNER: 0x80000000, NOBODY: 0x7fffffff });
export const CELL_KIND = Object.freeze({ F64: 0, REF: 1 });

export interface KernelHost {
  body(rule: number, elem: number, target: number): number;
  afterSteps(): boolean;
  fireChanges(): boolean;
  endChain(): void;
  error(code: number, rule: number): void;
  schedule(): void;
  /** A built-in rule declined its case (an auto-extent over a 3D child). */
  decline(rule: number): void;
}

export interface KernelCaps { extra_elems?: number; extra_cells?: number; extra_rules?: number; dyn_edges?: number; ring?: number; code_words?: number; consts?: number; track_ring?: number }

/** The kernel's ABI, bound to one instance. Ids are the kernel's; -1 = none. */
export interface Kernel {
  /** THE VIEWS ARE NOT readonly: growing the staging buffer can grow (and so
   *  detach) the underlying memory, and the loader then replaces every view in
   *  place. Anyone who CACHES one — reactive.ts does — must re-read it from
   *  `onGrow`, which fires synchronously before the growing call returns. */
  table: Float64Array;
  /** active[0] is the running DYNAMIC rule, or -1: readable with no call. */
  active: Int32Array;
  /** cells that fit before the next growth (updated when the kernel grows) */
  capacity: number;
  /** The cell table's size as the KERNEL holds it — what `capacity` and the
   *  table view must equal after any growth (tooling and conformance). */
  tableSize(): number;
  cells(): number; rules(): number;
  write(cell: number, v: number): number;
  set(cell: number, v: number): number;
  touch(cell: number): void;
  isSet(cell: number): boolean;
  own(cell: number, rule: number): number;
  release(cell: number, rule: number): void;
  owner(cell: number): number;
  run(rule: number): number;
  invalidate(rule: number): void;
  dispose(rule: number): void;
  suspend(rule: number): void;
  resume(rule: number): number;
  track(cell: number): number;
  settle(): number;
  pending(): boolean;
  dirty(): Uint32Array;
  /** Register the runtime's re-read hook (see the note on the views above). */
  onGrow(cb: () => void): void;
  addCell(kind: number, structural: boolean): number;
  /** A contiguous block of n F64 cells (an instance's numeric slots); the
   *  host keeps blocks for reuse and clears them between lives. */
  addCells(n: number): number;
  clearCells(base: number, n: number): void;
  /** THE TRACK RING: `trackRing[trackCount[0]++] = cell` on a tracked read
   *  while a rule is active — no call; the kernel links the reads to the
   *  active rule when the body returns (`flush()` drains it too). */
  trackRing: Uint32Array;
  trackCount: Uint32Array;
  readonly trackCap: number;
  /** A rule's state bits (KERNEL_STATE), read off the kernel's own array — no call. */
  stateOf(rule: number): number;
  /** The kernel's scheduled-settle flag, viewed (see reactive.ts workPending). */
  pendingFlag: Int32Array;
  /** Does any rule subscribe to this cell? (a viewed list head — no call) */
  listened(cell: number): boolean;
  /** THE WRITE RING: `ring[count[0]++] = cell` after storing the value in
   *  `table` — no call. The kernel drains it before every rule run and at the
   *  settle; `flush()` drains it now (the host calls it when the ring is full). */
  ring: Uint32Array;
  ringCount: Uint32Array;
  readonly ringCap: number;
  flush(): void;
  freeCell(cell: number): void;
  state(rule: number): number;
  deps(rule: number): number[];
  abort(): void;
  rewire(rule: number, edges: ArrayLike<number>): number;
  addRule(target: number, kind: number, flags: number, edges: ArrayLike<number>, body?: number): number;
  /** Views and the built-in visibility rule (kernel.md; view.ts). */
  /** Runtime EXPR rules: code words → their offset, a constant → its index,
   *  and the cells rules wrote since the last call (for the push sweep) — a
   *  list the caller owns. */
  addCode(words: ArrayLike<number>): number;
  addConst(v: number): number;
  /** How far the code and constant arenas reach — their high-water marks,
   *  which stay flat while freed blocks are reused (tooling: kernelStats). */
  codeUse(): { code: number; consts: number };
  kdirty(): Uint32Array;
  addExprRule(target: number, flags: number, edges: ArrayLike<number>, codeOffset: number, ncode: number): number;
  viewLayout(layout: Record<string, number>): void;
  viewDprCell(cell: number): void;
  viewAdd(base: number, parent: number): number;
  viewParent(view: number, parent: number): void;
  viewRemove(view: number): void;
  visAdd(view: number, root: number): number;
  visRewire(rule: number): number;
  /** Auto-extent: `words` = [list cell | -1, inset cell | -1, child block base…]. */
  extentAdd(axis: number, target: number, words: ArrayLike<number>): number;
  extentRewire(rule: number, words: ArrayLike<number>): number;
  /** SimpleLayout's flow positions (unaligned, unflexed): `words` = [list cell | -1,
   *  spacing cell | -1, child block base…], a base OR'd with LAYOUT_NOWRITE when
   *  its slot is an author's. Absent where the host binds no such rule (the Mac's
   *  native kernel) — the layout's own pass places those. */
  layoutAdd?(axis: number, words: ArrayLike<number>): number;
}
/** dk_view_layout, field order (declare_kernel.h). */
export const VIEW_LAYOUT_FIELDS = ["x", "y", "width", "height", "visible", "scale", "scaleX", "scaleY", "rotation", "skewX", "skewY", "pivotX", "pivotY",
  "scrollX", "scrollY", "ignoreScroll", "scrollsOn", "rotateX", "rotateY", "translateZ", "visOn", "visScale", "visX", "visY", "visW", "visH", "visMode", "ignoreClip"] as const;

/** An empty image: no compiled elements — everything is added at runtime.
 *  (Phase B's compiler output replaces this with the program's tables.) */
export function emptyImage(): Uint8Array {
  const b = new ArrayBuffer(32);
  const dv = new DataView(b);
  dv.setUint32(0, 0x4c4e524b, true); dv.setUint32(4, 1, true);
  return new Uint8Array(b);
}

/** The edge/word TRANSFER buffer's STARTING size, in 32-bit entries — the
 *  staging area a rule's dependency list crosses through. THE RUNTIME HAS NO
 *  CEILING ON HOW MANY CELLS A RULE MAY READ, so neither does this: the buffer
 *  GROWS to whatever a rule needs (`ensureScratch`), and the kernel holds the
 *  edges in its own arena afterwards.
 *
 *  ⚠ IT WAS A HARD 1024 AND A REAL PROGRAM EXCEEDED IT (2026-09-17): the
 *  desktop's Files browser has a rule reading 1,497 cells of a document model.
 *  The loader threw mid-settle, the window manager's focus never landed, no
 *  window was active, the chrome greyed out and clicks did nothing. Main's core
 *  has no such ceiling, so the ceiling itself was the defect — and raising it to
 *  a bigger arbitrary number would only move the cliff (DT, 2026-09-17: "as high
 *  as that limit is, it may not be high enough").
 *
 *  GROWING IS NOT FREE IN A BROWSER: `wasmMem.alloc` grows the WebAssembly
 *  memory when it must, and growing DETACHES every typed-array view over the old
 *  buffer. So a growth re-takes every view here and tells the runtime to re-read
 *  them (`onGrow`), synchronously, before the call that triggered it returns. */
const SCRATCH_START = 1 << 10;

/** Callbacks the kernel makes that the LOADER answers, not the runtime: set once the kernel is bound. */
interface LoaderHooks { reserve: (nodes: number) => void }
function importsFor(host: KernelHost, hooks: LoaderHooks): WebAssembly.Imports {
  return {
    host: {
      body: (rule: number, elem: number, target: number) => host.body(rule, elem, target),
      after_steps: () => (host.afterSteps() ? 1 : 0),
      fire_changes: () => (host.fireChanges() ? 1 : 0),
      end_chain: () => host.endChain(),
      error: (code: number, rule: number) => host.error(code, rule),
      schedule: () => host.schedule(),
      decline: (rule: number) => host.decline(rule),
      reserve: (nodes: number) => hooks.reserve(nodes),
      sin: Math.sin, cos: Math.cos, tan: Math.tan,
    },
  };
}
const withDefaults = (caps: KernelCaps): Required<KernelCaps> => ({ extra_elems: 0, extra_cells: 0, extra_rules: 0, dyn_edges: 0, ring: 0, code_words: 0, consts: 0, track_ring: 0, ...caps });

export async function instantiateKernel(wasm: Uint8Array, image: Uint8Array, host: KernelHost, caps: KernelCaps = {}): Promise<Kernel> {
  // Synchronous where the engine allows it (JavaScriptCore, Firefox, node);
  // Chrome refuses main-thread compilation past 4 KB, so fall back to async.
  const hooks: LoaderHooks = { reserve: () => {} };
  const imports = importsFor(host, hooks);
  let instance: WebAssembly.Instance;
  try { instance = new WebAssembly.Instance(new WebAssembly.Module(wasm as unknown as BufferSource), imports); }
  catch { instance = (await WebAssembly.instantiate(wasm as unknown as BufferSource, imports)).instance; }
  return bind(instance, image, withDefaults(caps), hooks);
}

/** The synchronous form, for hosts that can (the Mac's JavaScriptCore). */
export function instantiateKernelSync(wasm: Uint8Array, image: Uint8Array, host: KernelHost, caps: KernelCaps = {}): Kernel {
  const hooks: LoaderHooks = { reserve: () => {} };
  return bind(new WebAssembly.Instance(new WebAssembly.Module(wasm as unknown as BufferSource), importsFor(host, hooks)), image, withDefaults(caps), hooks);
}

type Exports = Record<string, (...a: number[]) => number> & { memory: WebAssembly.Memory; __heap_base: WebAssembly.Global };

/** The memory a kernel lives in, as the loader needs it: allocate, and take
 *  typed-array views at addresses. WASM: the module's linear memory (a bump
 *  allocator past __heap_base, grown as needed; views taken AFTER every
 *  allocation, since growth detaches them). Native (the Mac host): the
 *  process heap through `__declareNativeKernel.alloc/view` — zero-copy
 *  views over C memory. */
interface Mem {
  alloc(bytes: number): number;
  u8(at: number, n: number): Uint8Array;
  u32(at: number, n: number): Uint32Array;
  i32(at: number, n: number): Int32Array;
  f64(at: number, n: number): Float64Array;
}
type Calls = Record<string, (...a: number[]) => number>;
/** declare_kernel.h: a capacity is spent */
const DK_ERR_FULL = -7;
/** What an allocating call is about to take from each table (kernel_usage's order). */
interface Need { cells?: number; rules?: number; nodes?: number; elems?: number; code?: number; consts?: number }
const NO_NEED: Need = {};
/** a visibility rule reads 18 slots on each ancestor: room for a deep chain */
const VIS_NEED: Need = { rules: 1, nodes: 18 * 64 };
/** an auto-extent reads 17 slots per child, and keeps its words in the code arena */
const extentNeed = (words: number, rules: number): Need => ({ rules, nodes: 17 * words + 1, code: 2 * words });

function wasmMem(x: Exports): Mem {
  const mem = x.memory;
  let heap = (x.__heap_base.value + 7) & ~7;
  const buf = (): ArrayBuffer => mem.buffer as ArrayBuffer;
  // A wasm32 address is UNSIGNED, but an export hands it to JS as an i32: past
  // 2 GB of memory (a kernel grown many times — the old tables stay behind) the
  // table's address comes back negative. Every view reads its address unsigned.
  return {
    // 8-byte alignment in ARITHMETIC — `& ~7` is a 32-bit signed op, and past
    // 2 GB it wraps the heap negative
    alloc(bytes) { const at = heap; const end = at + bytes; if (end > mem.buffer.byteLength) mem.grow(Math.ceil((end - mem.buffer.byteLength) / 65536)); heap = Math.ceil(end / 8) * 8; return at; },
    u8: (at, n) => new Uint8Array(buf(), at >>> 0, n),
    u32: (at, n) => new Uint32Array(buf(), at >>> 0, n),
    i32: (at, n) => new Int32Array(buf(), at >>> 0, n),
    f64: (at, n) => new Float64Array(buf(), at >>> 0, n),
  };
}

/** The native kernel's object (declare_kernel_jsc.c), when the host installed one.
 *  Its functions take their arguments from `args` and are called with none;
 *  the callbacks it makes read theirs from `io` and write their result to io[3]
 *  (a JSValue converted across the C API costs a lock — see kernel_jsc.c). */
interface NativeKernel {
  alloc(): number;
  view(): ArrayBufferView;
  setHost(...fns: Array<() => void>): void;
  args: Float64Array;
  io: Float64Array;
}
function nativeKernel(): NativeKernel | null {
  const g = globalThis as { __declareNativeKernel?: NativeKernel };
  return g.__declareNativeKernel ?? null;
}
export function hasNativeKernel(): boolean { return nativeKernel() !== null; }
function nativeMem(nk: NativeKernel): Mem {
  const A = nk.args;
  const view = (at: number, kind: number, n: number): ArrayBufferView => { A[0] = at; A[1] = kind; A[2] = n; return nk.view(); };
  return {
    alloc: (bytes) => { A[0] = bytes; return nk.alloc(); },
    u8: (at, n) => view(at, 0, n) as Uint8Array,
    u32: (at, n) => view(at, 1, n) as Uint32Array,
    f64: (at, n) => view(at, 2, n) as Float64Array,
    i32: (at, n) => view(at, 3, n) as Int32Array,
  };
}

/** The ABI as the loader calls it — `x.kernel_run(k, rule)` — over a native
 *  kernel whose functions read their arguments from the `args` block. */
function nativeCalls(nk: NativeKernel): Calls {
  const A = nk.args;
  const calls: Calls = {};
  for (const name of Object.keys(nk)) {
    const f = (nk as unknown as Record<string, unknown>)[name];
    if (typeof f !== "function" || !name.startsWith("kernel_")) continue;
    const fn = (f as () => number).bind(nk);
    calls[name] = (a = 0, b = 0, c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, j = 0) => {
      A[0] = a; A[1] = b; A[2] = c; A[3] = d; A[4] = e; A[5] = g; A[6] = h; A[7] = i; A[8] = j;
      return fn();
    };
  }
  return calls;
}

/** The Mac host's native kernel: the C library in the process, reached
 *  through JavaScriptCore functions and zero-copy views (kernel.md Phase D). */
export function instantiateKernelNative(image: Uint8Array, host: KernelHost, caps: KernelCaps = {}): Kernel {
  const nk = nativeKernel();
  if (nk === null) throw new Error("kernel: no native kernel installed");
  const hooks: LoaderHooks = { reserve: () => {} };
  // each callback reads its arguments before it calls anything that could call back in
  const IO = nk.io;
  nk.setHost(
    () => { IO[3] = host.body(IO[0], IO[1], IO[2]); },
    () => { IO[3] = host.afterSteps() ? 1 : 0; },
    () => { IO[3] = host.fireChanges() ? 1 : 0; },
    () => { host.endChain(); },
    () => { host.error(IO[0], IO[1]); },
    () => { host.schedule(); },
    () => { host.decline(IO[0]); },
    () => { hooks.reserve(IO[0]); },
  );
  (globalThis as { __declareKernelKind?: string }).__declareKernelKind = "native";
  return bindWith(nativeCalls(nk), nativeMem(nk), image, withDefaults(caps), hooks);
}

function bind(instance: WebAssembly.Instance, image: Uint8Array, c: Required<KernelCaps>, hooks: LoaderHooks): Kernel {
  const x = instance.exports as unknown as Exports;
  (globalThis as { __declareKernelKind?: string }).__declareKernelKind = "wasm";
  return bindWith(x as unknown as Calls, wasmMem(x), image, c, hooks);
}

function bindWith(x: Calls, mem: Mem, image: Uint8Array, c: Required<KernelCaps>, hooks: LoaderHooks): Kernel {
  const imgAt = mem.alloc(image.length); mem.u8(imgAt, image.length).set(image);
  const capsAt = mem.alloc(32);
  const writeCaps = (cc: Required<KernelCaps>): void => { mem.u32(capsAt, 8).set([cc.extra_elems, cc.extra_cells, cc.extra_rules, cc.dyn_edges, cc.ring, cc.code_words, cc.consts, cc.track_ring]); };
  writeCaps(c);
  const arenaBytes = x.kernel_arena_size(imgAt, image.length, capsAt);
  if (arenaBytes === 0) throw new Error("kernel: bad image");
  const arenaAt = mem.alloc(arenaBytes);
  const k = x.kernel_load(imgAt, image.length, capsAt, arenaAt, arenaBytes, 0);
  if (k === 0) throw new Error("kernel: load failed");
  // what the image itself holds, per table: a capacity is image + extra
  const usageAt = mem.alloc(48);
  const usage = (): Uint32Array => { x.kernel_usage(k, usageAt); return mem.u32(usageAt, 12); };
  const u0 = usage();
  const base = { cells: u0[0], rules: u0[2], elems: u0[6], code: u0[8], consts: u0[10] };
  let caps = { ...c };
  // the TABLE's size — the image's cells plus the extra the capacities ask for;
  // never the cells in use plus the extra, which equals it only at load
  let capacity = base.cells + c.extra_cells;
  let tableAt = x.kernel_table(k);
  let scratchCap = SCRATCH_START;
  let scratchAt = mem.alloc(4 * scratchCap);
  let dirtyAt = mem.alloc(4 * capacity);
  let kdirtyAt = mem.alloc(4 * capacity);
  const ringCapAt = mem.alloc(4);
  let ringAt = x.kernel_ring(k, ringCapAt);
  const ringCap = mem.u32(ringCapAt, 1)[0];
  let trackAt = x.kernel_track_ring(k, ringCapAt);
  const trackCap = mem.u32(ringCapAt, 1)[0];
  let stateAt = x.kernel_state_ptr(k, ringCapAt);
  const ruleStride = mem.u32(ringCapAt, 1)[0];
  let ruleCap = x.kernel_rule_cap(k);
  // Views are taken after every allocation, and again after the kernel grows (retake).
  let kdirty = mem.u32(kdirtyAt, capacity);
  const table0 = mem.f64(tableAt, capacity);
  const active0 = mem.i32(x.kernel_active_ptr(k), 1);
  const ring0 = mem.u32(ringAt, ringCap);
  const ringCount0 = mem.u32(x.kernel_ring_count(k), 1);
  const trackRing0 = mem.u32(trackAt, trackCap);
  const trackCount0 = mem.u32(x.kernel_track_count(k), 1);
  let ruleState = mem.u8(stateAt, ruleCap * ruleStride);
  const pendingFlag0 = mem.i32(x.kernel_pending_ptr(k), 1);
  let cellDyn = mem.u32(x.kernel_cell_dyn_ptr(k), capacity);
  const staticCells = x.kernel_static_cells(k);
  let scratch = mem.u32(scratchAt, scratchCap);
  let dirtyView = mem.u32(dirtyAt, capacity);
  let onGrow: (() => void) | null = null;

  /** Re-take every view and hand the fresh ones back to whoever cached them.
   *  Called after any allocation that may have grown (and so detached) memory. */
  const retake = (): void => {
    self.capacity = capacity;
    scratch = mem.u32(scratchAt, scratchCap);
    dirtyView = mem.u32(dirtyAt, capacity);
    self.table = mem.f64(tableAt, capacity);
    self.active = mem.i32(x.kernel_active_ptr(k), 1);
    self.ring = mem.u32(ringAt, ringCap);
    self.ringCount = mem.u32(x.kernel_ring_count(k), 1);
    self.trackRing = mem.u32(trackAt, trackCap);
    self.trackCount = mem.u32(x.kernel_track_count(k), 1);
    self.pendingFlag = mem.i32(x.kernel_pending_ptr(k), 1);
    ruleState = mem.u8(stateAt, ruleCap * ruleStride);
    cellDyn = mem.u32(x.kernel_cell_dyn_ptr(k), capacity);
    kdirty = mem.u32(kdirtyAt, capacity);
    onGrow?.();
  };

  /** Make room for `n` entries. Doubling, so a program that reads a lot of
   *  cells pays a handful of allocations over its whole life, not one per rule. */
  const ensureScratch = (n: number): void => {
    if (n <= scratchCap) return;
    let cap = scratchCap;
    while (cap < n) cap *= 2;
    let at: number;
    try { at = mem.alloc(4 * cap); }
    catch (e) {
      // the one honest ceiling: the host would not give us the memory. Say so
      // with the number, rather than leaving a rule half-wired.
      throw new Error(`kernel: could not stage a rule's ${n} dependencies — the host refused ${(4 * cap / 1024) | 0} KB (${String(e)})`);
    }
    scratchCap = cap; scratchAt = at;
    retake();
  };

  /** GROWTH (kernel.c kernel_grow): any table that would be past half full
   *  doubles. Checked after every settle, and when an allocating call reports
   *  DK_ERR_FULL — which may be from inside a settle (a body building rows): the
   *  kernel keeps its address and holds no table address across a host call, so
   *  its tables can move at any time. The old tables are left behind (WebAssembly
   *  memory cannot shrink; on the Mac the first arena also holds the kernel).
   *  Returns whether the kernel grew. */
  const reserve = (need: Need = NO_NEED): boolean => {
    const u = usage();
    // a table doubles until what it holds — plus what the call about to be made needs — fills at most half of it
    const grown = (used: number, cap: number, more = 0): number => { let n = cap; while ((used + more) * 2 > n) n *= 2; return n; };
    const cells = grown(u[0], u[1], need.cells), rules = grown(u[2], u[3], need.rules), nodes = grown(u[4], u[5], need.nodes);
    const elems = grown(u[6], u[7], need.elems), code = grown(u[8], u[9], need.code), consts = grown(u[10], u[11], need.consts);
    if (cells === u[1] && rules === u[3] && nodes === u[5] && elems === u[7] && code === u[9] && consts === u[11]) return false;
    const next = { ...caps, extra_cells: cells - base.cells, extra_rules: rules - base.rules, dyn_edges: nodes,
      extra_elems: elems - base.elems, code_words: code - base.code, consts: consts - base.consts };
    writeCaps(next);
    const bytes = x.kernel_arena_size(imgAt, image.length, capsAt);
    const at = bytes === 0 ? 0 : mem.alloc(bytes);
    const grew = at !== 0 && x.kernel_grow(k, imgAt, image.length, capsAt, at, bytes) !== 0;
    writeCaps(grew ? next : caps);
    if (!grew) { retake(); return false; }   // the allocation may have moved memory under the views
    caps = next;
    capacity = base.cells + caps.extra_cells;
    tableAt = x.kernel_table(k);
    ringAt = x.kernel_ring(k, ringCapAt); trackAt = x.kernel_track_ring(k, ringCapAt);
    stateAt = x.kernel_state_ptr(k, ringCapAt); ruleCap = x.kernel_rule_cap(k);
    dirtyAt = mem.alloc(4 * capacity); kdirtyAt = mem.alloc(4 * capacity);
    retake();
    return true;
  };
  /** An allocating call, and what it needs: on DK_ERR_FULL, grow for that need and try once more. */
  const roomy = (need: Need, call: () => number): number => {
    const r = call();
    return r === DK_ERR_FULL && reserve(need) ? call() : r;
  };
  // the kernel asks, before draining a rule's reads, when they may not fit the edge table
  hooks.reserve = (nodes) => { reserve({ nodes }); };

  const edgesIn = (edges: ArrayLike<number>): number => {
    ensureScratch(edges.length);
    scratch.set(edges);
    return edges.length;
  };
  const self: Kernel = {
    table: table0, active: active0, capacity,
    cells: () => x.kernel_cells(k), rules: () => x.kernel_rules(k),
    tableSize: () => usage()[1],
    codeUse: () => { const u = usage(); return { code: u[8], consts: u[10] }; },
    write: (cell, v) => x.kernel_write(k, cell, v),
    set: (cell, v) => x.kernel_set(k, cell, v),
    touch: (cell) => { x.kernel_touch(k, cell); },
    isSet: (cell) => x.kernel_is_set(k, cell) === 1,
    own: (cell, rule) => x.kernel_own(k, cell, rule),
    release: (cell, rule) => { x.kernel_release(k, cell, rule); },
    owner: (cell) => x.kernel_owner(k, cell),
    run: (rule) => x.kernel_run(k, rule),
    invalidate: (rule) => { x.kernel_invalidate(k, rule); },
    dispose: (rule) => { x.kernel_dispose(k, rule); },
    suspend: (rule) => { x.kernel_suspend(k, rule); },
    resume: (rule) => x.kernel_resume(k, rule),
    track: (cell) => roomy({ nodes: 1 }, () => x.kernel_track(k, cell)),
    settle: () => { const r = x.kernel_settle(k); reserve(); return r; },
    pending: () => x.kernel_pending(k) === 1,
    dirty: () => { const n = x.kernel_dirty(k, dirtyAt, capacity); return dirtyView.subarray(0, Math.min(n, capacity)); },
    /** Re-read the views after a growth — the runtime caches them (reactive.ts bindKernel). */
    onGrow: (cb) => { onGrow = cb; },
    addCell: (kind, structural) => roomy({ cells: 1 }, () => x.kernel_add_cell(k, kind, structural ? 1 : 0)),
    addCells: (n) => roomy({ cells: n }, () => x.kernel_add_cells(k, n, 0)),
    clearCells: (base, n) => { x.kernel_clear_cells(k, base, n); },
    ring: ring0, ringCount: ringCount0, ringCap,
    trackRing: trackRing0, trackCount: trackCount0, trackCap,
    stateOf: (rule) => ruleState[rule * ruleStride],
    pendingFlag: pendingFlag0,
    listened: (cell) => cell < staticCells || cellDyn[cell] !== 0xffffffff,
    flush: () => { x.kernel_flush(k); },
    addCode: (words) => roomy({ code: words.length }, () => { ensureScratch(words.length); scratch.set(words); return x.kernel_add_code(k, scratchAt, words.length); }),
    addConst: (v) => roomy({ consts: 1 }, () => x.kernel_add_const(k, v)),
    // A copy, not a view of the buffer: the push sweep runs pushes that can
    // build views (a State applying), whose own rules drain this list again
    // into the same buffer while the outer sweep is still reading it.
    kdirty: () => { const n = x.kernel_kdirty(k, kdirtyAt, capacity); return kdirty.slice(0, Math.min(n, capacity)); },
    addExprRule: (target, flags, edges, codeOffset, ncode) => roomy({ rules: 1, nodes: edges.length }, () => { const n = edgesIn(edges); return x.kernel_add_rule(k, target, 0, flags, scratchAt, n, codeOffset, ncode, 0); }),
    viewLayout: (layout) => { scratch.set(VIEW_LAYOUT_FIELDS.map((f) => layout[f] ?? 0)); x.kernel_view_layout(k, scratchAt); },
    viewDprCell: (cell) => { x.kernel_view_dpr_cell(k, cell); },
    viewAdd: (at, parent) => roomy({ elems: 1 }, () => x.kernel_view_add(k, at, parent)),
    viewParent: (view, parent) => { x.kernel_view_parent(k, view, parent); },
    viewRemove: (view) => { x.kernel_view_remove(k, view); },
    visAdd: (view, root) => roomy(VIS_NEED, () => x.kernel_vis_add(k, view, root)),
    visRewire: (rule) => x.kernel_vis_rewire(k, rule),
    // the staging pointer is read AFTER edgesIn: a growth moves it, and JS
    // evaluates arguments left to right, so an inline `scratchAt` would be stale
    extentAdd: (axis, target, words) => roomy(extentNeed(words.length, 1), () => { const n = edgesIn(words); return x.kernel_extent_add(k, axis, target, scratchAt, n); }),
    extentRewire: (rule, words) => roomy(extentNeed(words.length, 0), () => { const n = edgesIn(words); return x.kernel_extent_rewire(k, rule, scratchAt, n); }),
    layoutAdd: (axis, words) => roomy(extentNeed(words.length, 1), () => { const n = edgesIn(words); return x.kernel_layout_add(k, axis, scratchAt, n); }),
    freeCell: (cell) => { x.kernel_free_cell(k, cell); },
    state: (rule) => x.kernel_state(k, rule),
    deps: (rule) => { const n = x.kernel_deps(k, rule, scratchAt, scratchCap); return Array.from(scratch.subarray(0, Math.min(n, scratchCap))); },
    abort: () => { x.kernel_abort(k); },
    rewire: (rule, edges) => roomy({ nodes: edges.length }, () => { const n = edgesIn(edges); return x.kernel_rewire(k, rule, scratchAt, n); }),
    addRule: (target, kind, flags, edges, body = 0) => roomy({ rules: 1, nodes: edges.length }, () => { const n = edgesIn(edges); return x.kernel_add_rule(k, target, kind, flags, scratchAt, n, 0, 0, body); }),
  };
  return self;
}

/** Decode the embedded module (kernel-wasm.ts carries it base64: no fetch,
 *  no file, no host plumbing — one artifact on every host). */
export function decodeWasm(b64: string): Uint8Array {
  const T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const n = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((b64.length * 3) / 4 - n);
  let acc = 0, bits = 0, o = 0;
  for (let i = 0; i < b64.length; i++) {
    const ch = b64.charCodeAt(i);
    if (ch === 61) break;
    acc = (acc << 6) | T.indexOf(b64[i]); bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
  }
  return out;
}
