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
export const KERNEL_STATE = Object.freeze({ QUEUED: 1, DEAD: 2, SUSPENDED: 4, REWIRE: 8, UNLANDED: 16 });
export const CELL_KIND = Object.freeze({ F64: 0, REF: 1 });
/** dk_view_layout, field order (declare_kernel.h). */
export const VIEW_LAYOUT_FIELDS = ["x", "y", "width", "height", "visible", "scale", "scaleX", "scaleY", "rotation", "skewX", "skewY", "pivotX", "pivotY",
    "scrollX", "scrollY", "ignoreScroll", "scrollsOn", "rotateX", "rotateY", "translateZ", "visOn", "visScale", "visX", "visY", "visW", "visH", "visMode", "ignoreClip"];
/** An empty image: no compiled elements — everything is added at runtime.
 *  (Phase B's compiler output replaces this with the program's tables.) */
export function emptyImage() {
    const b = new ArrayBuffer(32);
    const dv = new DataView(b);
    dv.setUint32(0, 0x4c4e524b, true);
    dv.setUint32(4, 1, true);
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
function importsFor(host) {
    return {
        host: {
            body: (rule, elem, target) => host.body(rule, elem, target),
            after_steps: () => (host.afterSteps() ? 1 : 0),
            fire_changes: () => (host.fireChanges() ? 1 : 0),
            end_chain: () => host.endChain(),
            error: (code, rule) => host.error(code, rule),
            schedule: () => host.schedule(),
            decline: (rule) => host.decline(rule),
            sin: Math.sin, cos: Math.cos, tan: Math.tan,
        },
    };
}
const withDefaults = (caps) => ({ extra_elems: 0, extra_cells: 0, extra_rules: 0, dyn_edges: 0, ring: 0, code_words: 0, consts: 0, track_ring: 0, ...caps });
export async function instantiateKernel(wasm, image, host, caps = {}) {
    // Synchronous where the engine allows it (JavaScriptCore, Firefox, node);
    // Chrome refuses main-thread compilation past 4 KB, so fall back to async.
    const imports = importsFor(host);
    let instance;
    try {
        instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
    }
    catch {
        instance = (await WebAssembly.instantiate(wasm, imports)).instance;
    }
    return bind(instance, image, withDefaults(caps));
}
/** The synchronous form, for hosts that can (the Mac's JavaScriptCore). */
export function instantiateKernelSync(wasm, image, host, caps = {}) {
    return bind(new WebAssembly.Instance(new WebAssembly.Module(wasm), importsFor(host)), image, withDefaults(caps));
}
function wasmMem(x) {
    const mem = x.memory;
    let heap = (x.__heap_base.value + 7) & ~7;
    const buf = () => mem.buffer;
    return {
        alloc(bytes) { const at = heap; const end = at + bytes; if (end > mem.buffer.byteLength)
            mem.grow(Math.ceil((end - mem.buffer.byteLength) / 65536)); heap = (end + 7) & ~7; return at; },
        u8: (at, n) => new Uint8Array(buf(), at, n),
        u32: (at, n) => new Uint32Array(buf(), at, n),
        i32: (at, n) => new Int32Array(buf(), at, n),
        f64: (at, n) => new Float64Array(buf(), at, n),
    };
}
function nativeKernel() {
    const g = globalThis;
    return g.__declareNativeKernel ?? null;
}
export function hasNativeKernel() { return nativeKernel() !== null; }
function nativeMem(nk) {
    return {
        alloc: (bytes) => nk.alloc(bytes),
        u8: (at, n) => nk.view(at, 0, n),
        u32: (at, n) => nk.view(at, 1, n),
        f64: (at, n) => nk.view(at, 2, n),
        i32: (at, n) => nk.view(at, 3, n),
    };
}
/** The Mac host's native kernel: the C library in the process, reached
 *  through JavaScriptCore functions and zero-copy views (kernel.md Phase D). */
export function instantiateKernelNative(image, host, caps = {}) {
    const nk = nativeKernel();
    if (nk === null)
        throw new Error("kernel: no native kernel installed");
    nk.setHost((rule, elem, target) => host.body(rule, elem, target), () => (host.afterSteps() ? 1 : 0), () => (host.fireChanges() ? 1 : 0), () => { host.endChain(); }, (code, rule) => { host.error(code, rule); }, () => { host.schedule(); }, (rule) => { host.decline(rule); });
    globalThis.__declareKernelKind = "native";
    return bindWith(nk, nativeMem(nk), image, withDefaults(caps));
}
function bind(instance, image, c) {
    const x = instance.exports;
    globalThis.__declareKernelKind = "wasm";
    return bindWith(x, wasmMem(x), image, c);
}
function bindWith(x, mem, image, c) {
    const imgAt = mem.alloc(image.length);
    mem.u8(imgAt, image.length).set(image);
    const capsAt = mem.alloc(32);
    mem.u32(capsAt, 8).set([c.extra_elems, c.extra_cells, c.extra_rules, c.dyn_edges, c.ring, c.code_words, c.consts, c.track_ring]);
    const arenaBytes = x.kernel_arena_size(imgAt, image.length, capsAt);
    if (arenaBytes === 0)
        throw new Error("kernel: bad image");
    const arenaAt = mem.alloc(arenaBytes);
    const k = x.kernel_load(imgAt, image.length, capsAt, arenaAt, arenaBytes, 0);
    if (k === 0)
        throw new Error("kernel: load failed");
    const capacity = x.kernel_cells(k) + c.extra_cells;
    const tableAt = x.kernel_table(k);
    let scratchCap = SCRATCH_START;
    let scratchAt = mem.alloc(4 * scratchCap);
    const dirtyAt = mem.alloc(4 * capacity);
    const kdirtyAt = mem.alloc(4 * capacity);
    const ringCapAt = mem.alloc(4);
    const ringAt = x.kernel_ring(k, ringCapAt);
    const ringCap = mem.u32(ringCapAt, 1)[0];
    const trackAt = x.kernel_track_ring(k, ringCapAt);
    const trackCap = mem.u32(ringCapAt, 1)[0];
    const stateAt = x.kernel_state_ptr(k, ringCapAt);
    const ruleStride = mem.u32(ringCapAt, 1)[0];
    const ruleCap = x.kernel_rule_cap(k);
    // Views are taken once, after every allocation: memory never grows after load.
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
    let onGrow = null;
    /** Re-take every view and hand the fresh ones back to whoever cached them.
     *  Called after any allocation that may have grown (and so detached) memory. */
    const retake = () => {
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
    const ensureScratch = (n) => {
        if (n <= scratchCap)
            return;
        let cap = scratchCap;
        while (cap < n)
            cap *= 2;
        let at;
        try {
            at = mem.alloc(4 * cap);
        }
        catch (e) {
            // the one honest ceiling: the host would not give us the memory. Say so
            // with the number, rather than leaving a rule half-wired.
            throw new Error(`kernel: could not stage a rule's ${n} dependencies — the host refused ${(4 * cap / 1024) | 0} KB (${String(e)})`);
        }
        scratchCap = cap;
        scratchAt = at;
        retake();
    };
    const edgesIn = (edges) => {
        ensureScratch(edges.length);
        scratch.set(edges);
        return edges.length;
    };
    const self = {
        table: table0, active: active0, capacity,
        cells: () => x.kernel_cells(k), rules: () => x.kernel_rules(k),
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
        track: (cell) => x.kernel_track(k, cell),
        settle: () => x.kernel_settle(k),
        pending: () => x.kernel_pending(k) === 1,
        dirty: () => { const n = x.kernel_dirty(k, dirtyAt, capacity); return dirtyView.subarray(0, Math.min(n, capacity)); },
        /** Re-read the views after a growth — the runtime caches them (reactive.ts bindKernel). */
        onGrow: (cb) => { onGrow = cb; },
        addCell: (kind, structural) => x.kernel_add_cell(k, kind, structural ? 1 : 0),
        addCells: (n) => x.kernel_add_cells(k, n, 0),
        clearCells: (base, n) => { x.kernel_clear_cells(k, base, n); },
        ring: ring0, ringCount: ringCount0, ringCap,
        trackRing: trackRing0, trackCount: trackCount0, trackCap,
        stateOf: (rule) => ruleState[rule * ruleStride],
        pendingFlag: pendingFlag0,
        listened: (cell) => cell < staticCells || cellDyn[cell] !== 0xffffffff,
        flush: () => { x.kernel_flush(k); },
        addCode: (words) => { ensureScratch(words.length); scratch.set(words); return x.kernel_add_code(k, scratchAt, words.length); },
        addConst: (v) => x.kernel_add_const(k, v),
        kdirty: () => { const n = x.kernel_kdirty(k, kdirtyAt, capacity); return kdirty.subarray(0, Math.min(n, capacity)); },
        addExprRule: (target, flags, edges, codeOffset, ncode) => x.kernel_add_rule(k, target, 0, flags, scratchAt, edgesIn(edges), codeOffset, ncode, 0),
        viewLayout: (layout) => { scratch.set(VIEW_LAYOUT_FIELDS.map((f) => layout[f] ?? 0)); x.kernel_view_layout(k, scratchAt); },
        viewDprCell: (cell) => { x.kernel_view_dpr_cell(k, cell); },
        viewAdd: (base, parent) => x.kernel_view_add(k, base, parent),
        viewParent: (view, parent) => { x.kernel_view_parent(k, view, parent); },
        viewRemove: (view) => { x.kernel_view_remove(k, view); },
        visAdd: (view, root) => x.kernel_vis_add(k, view, root),
        visRewire: (rule) => x.kernel_vis_rewire(k, rule),
        // the staging pointer is read AFTER edgesIn: a growth moves it, and JS
        // evaluates arguments left to right, so an inline `scratchAt` would be stale
        extentAdd: (axis, target, words) => { const n = edgesIn(words); return x.kernel_extent_add(k, axis, target, scratchAt, n); },
        extentRewire: (rule, words) => { const n = edgesIn(words); return x.kernel_extent_rewire(k, rule, scratchAt, n); },
        freeCell: (cell) => { x.kernel_free_cell(k, cell); },
        state: (rule) => x.kernel_state(k, rule),
        deps: (rule) => { const n = x.kernel_deps(k, rule, scratchAt, scratchCap); return Array.from(scratch.subarray(0, Math.min(n, scratchCap))); },
        abort: () => { x.kernel_abort(k); },
        rewire: (rule, edges) => { const n = edgesIn(edges); return x.kernel_rewire(k, rule, scratchAt, n); },
        addRule: (target, kind, flags, edges, body = 0) => { const n = edgesIn(edges); return x.kernel_add_rule(k, target, kind, flags, scratchAt, n, 0, 0, body); },
    };
    return self;
}
/** Decode the embedded module (kernel-wasm.ts carries it base64: no fetch,
 *  no file, no host plumbing — one artifact on every host). */
export function decodeWasm(b64) {
    const T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const n = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
    const out = new Uint8Array((b64.length * 3) / 4 - n);
    let acc = 0, bits = 0, o = 0;
    for (let i = 0; i < b64.length; i++) {
        const ch = b64.charCodeAt(i);
        if (ch === 61)
            break;
        acc = (acc << 6) | T.indexOf(b64[i]);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[o++] = (acc >> bits) & 255;
        }
    }
    return out;
}
//# sourceMappingURL=kernel-loader.js.map