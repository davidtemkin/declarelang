// The reactive core — what a `{ }` constraint *is* at runtime: a standing
// computation whose dependencies are exactly what it read last time it ran,
// and a scheduler that re-runs invalidated computations once per update, in
// batch, before the backends' rAF paint. Percent lengths, Text auto-sizing,
// and draw re-recording all ride this one mechanism. There is no polling
// anywhere: an idle graph is inert data.
//
// SINCE THE KERNEL (docs/system-design/kernel.md): the graph, the queues and
// the settle live in kernel/src/kernel.c, one C source compiled to
// WebAssembly and loaded by every host the same way (kernel-loader.ts). This
// module is the JS face of it: a Cell is a kernel cell id, a Constraint is a
// kernel rule id, and the semantics — batching, FIFO with re-queue, the two
// phases, the equality gate, one owner per slot, the cycle guard, the close —
// are the kernel's, pinned by kernel/test against the previous JS core.
//
// What stays here: the bodies (compute/apply are JS closures the kernel calls
// back into), afterSettle's step list, observe(), and the error prose. The
// tracking path (a constraint discovering its reads) is a DYNAMIC kernel rule:
// while it runs, `active` is its id and every Cell.track() links an edge; the
// prewired path (compiler-extracted read sets) is a BODY rule with edges fixed
// at wire time, exactly as before.
//
// The kernel loads asynchronously once per host (`kernelReady()`); every
// program entry awaits it before instantiating. Cells and constraints made
// before that (a module-level Cell) allocate their ids lazily.
import { phasesOn, phased, registerPhaseHooks, wrapMethods } from "./phase-timer.js";
import { DeclareError } from "./errors.js";
import { endChangeChain, fireChanges } from "./change-event.js";
import { instantiateKernel, instantiateKernelSync, instantiateKernelNative, hasNativeKernel, decodeWasm, emptyImage, KERNEL_ERR, KERNEL_KIND, KERNEL_FLAG, KERNEL_STATE, CELL_KIND, } from "./kernel-loader.js";
import { KERNEL_WASM_B64 } from "./kernel-wasm.js";
import { traceKernel, traceTarget } from "./kernel-trace.js";
// ── the kernel instance ─────────────────────────────────────────────────────
let K = null;
let loading = null;
/** The slot table, as a LIVE binding: attributes.ts reads numeric slots
 *  straight off it (`table[cell]`), no call in between. Empty until load. */
export let table = new Float64Array(0);
/** The kernel's active-rule word (−1 = no DYNAMIC rule running) and the
 *  probe collector, exported so a getter's tracking check is two reads and
 *  no call: `S.collecting !== null || ACTIVE[0] >= 0`. */
export let ACTIVE = new Int32Array([-1]);
export const S = { collecting: null };
/** The write ring (kernel-loader.ts): `touchCell` appends a changed cell. */
let ring = new Uint32Array(0);
let trackRing = new Uint32Array(0);
// build-flags.d.ts: the guard names the defined identifier so a shipping bundle folds it out
const NO_RING = typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && globalThis.__declareNoTrackRing === true;
/** A/B switch (profiling): settle even when a write wakes nobody (the old behavior). */
const SETTLE_EMPTY = typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && globalThis.__declareSettleEmpty === true;
let trackCount = new Uint32Array(1);
let trackCap = 0;
let ringCount = new Uint32Array(1);
let ringCap = 0;
/** A cell changed (the host stored the value itself): queue its wake. The
 *  kernel drains the ring before it runs anything; outside a settle we arm
 *  the microtask ourselves, exactly as a kernel write would have. */
export function touchCell(cell) {
    // NOBODY LISTENS, nothing to wake: outside a settle, a write to a cell no
    // rule subscribes to schedules nothing (it was an empty settle — ~400 of
    // 750 in a weather-city window). A rule that subscribes later reads the
    // stored value when it runs. Inside a settle the ring is drained anyway.
    if (!inSettle && !SETTLE_EMPTY && !K.listened(cell))
        return;
    if (ringCount[0] >= ringCap)
        K.flush();
    ring[ringCount[0]++] = cell;
    if (!inSettle)
        schedule();
}
/** Capacities for the runtime-allocated tables (an empty image: every cell
 *  and rule is added at runtime until the compiler emits them). Sized for the
 *  largest program in the corpus several times over; a spent capacity is a
 *  loud error, not a silent stall. */
/* 1M cells (a Text view takes ~30 numeric slots; the homepage with its data
 * landed holds ~4K Texts = 120K cells), 128K rules, 1M dynamic edges. Reserved,
 * not touched: the kernel initializes cells and edges as it hands them out. */
const DEFAULT_CAPS = { extra_elems: 1 << 18, extra_cells: 1 << 22, extra_rules: 1 << 18, dyn_edges: 1 << 21, ring: 1 << 16, code_words: 1 << 20, consts: 1 << 16, track_ring: 1 << 14 };
/** Every live Constraint by kernel rule id — the body callback's lookup. */
const RULES = [];
/** An exception raised inside a body or a step during a settle: the kernel is
 *  told to abort, the settle unwinds cleanly on its side, and this is thrown
 *  from settle() (or run()) on ours. */
let pendingError = null;
let scheduled = false;
let inSettle = false;
/** Is a settle running now (a rule body, a step, a change handler)? */
export function isSettling() { return inSettle; }
/** Is there work the table does not yet reflect — a settle scheduled, writes
 *  or reads in the rings, or a settle mid-flight? Answered without a call
 *  (the kernel's flag and counts are views): a declared default's untracked
 *  read evaluates live while this holds (attributes.ts declStale). */
export function workPending() {
    return inSettle || ringCount[0] > 0 || trackCount[0] > 0 || (K !== null && K.pendingFlag[0] !== 0);
}
let stepsRan = false;
const HOST = {
    body(rule) {
        const c = RULES[rule];
        if (c === null || c === undefined)
            return 0;
        try {
            c.runBody();
        }
        catch (e) {
            // A body threw. NESTED (entered through a JS run() — a replicator
            // constructing a row inside its own apply): hand the error to that JS
            // caller, which may contain it; rethrow() throws it as run() returns.
            // SETTLE-DRIVEN (no JS between the kernel's loop and this body): abort
            // the settle, and settle() throws it once the kernel has unwound.
            if (pendingError === null)
                pendingError = e;
            if (outer.length === 0)
                K.abort();
        }
        return 0;
    },
    afterSteps() {
        // THE CLOSE opens with the kernel's writes reaching their Surfaces: a JS
        // write pushed at write time, so a step or a change handler below sees
        // surfaces current; the kernel's own writes (EXPR bodies, the visibility
        // rule) get the same standing here, before anything of theirs runs.
        if (pushHook !== null) {
            const d = K.kdirty();
            if (d.length > 0)
                pushHook(d);
        }
        if (after.length === 0)
            return false;
        stepsRan = true;
        const batch = after.splice(0);
        try {
            for (const step of batch)
                step();
        }
        catch (e) {
            if (pendingError === null)
                pendingError = e;
            K.abort();
        }
        return true;
    },
    fireChanges() {
        try {
            return fireChanges();
        }
        catch (e) {
            if (pendingError === null)
                pendingError = e;
            K.abort();
            return false;
        }
    },
    endChain() { endChangeChain(); },
    decline(rule) { RULES[rule]?.onDecline?.(); },
    error(code, rule) {
        if (pendingError !== null)
            return;
        if (code === KERNEL_ERR.CYCLE) {
            const label = RULES[rule]?.label ?? `rule ${rule}`;
            pendingError = new DeclareError(`constraint cycle: ${label} re-evaluated ${CYCLE_LIMIT} times in one update — it (transitively) depends on its own output`);
        }
        else if (code === KERNEL_ERR.AFTER) {
            pendingError = new DeclareError(stepsRan
                ? `afterSettle: steps re-armed ${AFTER_LIMIT} times in one settle — a step (transitively) registers itself again`
                : `onChange: handlers re-armed ${AFTER_LIMIT} settles in one chain`);
        }
        else if (code !== KERNEL_ERR.ABORT) {
            pendingError = new DeclareError(`kernel: settle failed (${code})`);
        }
    },
    schedule() { schedule(); },
};
/** After any call into the kernel that ran a body: an exception the body
 *  raised propagates NOW, through whatever JS is on the stack — exactly as it
 *  would have without the kernel in between. Inside a settle it stays recorded
 *  so the kernel's abort lands and settle() throws the same error once. */
function rethrow() {
    if (pendingError === null)
        return;
    const e = pendingError;
    pendingError = null; // ownership passes to whoever catches; an uncaught one reaches the outer body's catch and is recorded again there
    throw e;
}
function schedule() {
    if (scheduled)
        return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; settle(); });
}
/** Load the kernel (once). Every program entry awaits this before it
 *  instantiates anything; a second call answers at once. */
/** THE KERNEL'S BYTES — inline (every shipping build), or a file alongside
 *  this module (a build that defines __DECLARE_INLINE_KERNEL__ false and names
 *  the file — build-flags.d.ts).
 *
 *  INLINE IS THE RULING (2026-09-18). The bytes ride in the bundle as base64:
 *  +3 KB gzipped over a sidecar, decoded in 1–2 ms (measured on an iPad), and
 *  no request between the bundle and first paint. The sidecar form saved those
 *  bytes and cost a round trip on the boot path — +50–150 ms per app on a real
 *  iPad over Wi-Fi, with Safari re-requesting the file despite the page's
 *  preload. It stays as a build option, not a default.
 *
 *  Either way the bytes are checked (magic, and the exact length for a file)
 *  before the engine sees them, so a host that rewrites text assets fails with
 *  a legible error rather than inside WebAssembly.compile. */
function kernelBytes() {
    if (typeof __DECLARE_INLINE_KERNEL__ === "undefined" || __DECLARE_INLINE_KERNEL__)
        return Promise.resolve(decodeWasm(KERNEL_WASM_B64));
    const file = typeof __DECLARE_KERNEL_FILE__ === "undefined" ? "declare-kernel.wasm.txt" : __DECLARE_KERNEL_FILE__;
    // The base: this module's own URL, so the file is found wherever the bundle
    // was deployed — a subdirectory, a CDN, an island's origin. Re-bundled by
    // someone else's tooling, `import.meta.url` can be missing; the document's
    // base answers then, and a bare name (resolved against the page) last.
    const base = (typeof import.meta === "undefined" ? "" : import.meta.url) || (typeof document === "undefined" ? "" : document.baseURI);
    // A page with no usable origin — about:blank, a data: URL, a bundle evaluated
    // by setContent — cannot resolve OR fetch a sibling at all, so say what to do
    // instead of failing inside fetch with a URL parse error.
    let href = "";
    if (base !== "") {
        try {
            href = new URL(file, base).href;
        }
        catch {
            href = "";
        }
    }
    if (href === "" || /^(about|data|blob):/.test(href)) {
        return Promise.reject(new DeclareError(`the kernel rides alongside the bundle as ${file}, and this page has no origin to fetch it from (${base === "" ? "no base URL" : base}) — build with inlineKernel to compile the kernel into the bundle instead`));
    }
    // A PLAIN fetch, matching the HTML's `crossorigin="anonymous"` preload, so the
    // preloaded response is REUSED. Measured (profile/preloadprobe.mjs, per
    // combination, counting what the server actually sent): crossorigin + plain
    // fetch = 1 request; crossorigin + `credentials: "omit"` = 2; no crossorigin
    // attribute at all = 2, with or without that option.
    return fetch(href).then((r) => {
        if (!r.ok)
            throw new DeclareError(`the kernel did not load: ${href} answered ${r.status} (it rides alongside the bundle — a deploy that copies only the .js files will miss it)`);
        return r.arrayBuffer();
    }).then((buf) => {
        const bytes = new Uint8Array(buf);
        // THE SIZE THE BUILD SHIPPED. Serving the module as text is safe in the
        // browser — measured: Chrome compiles these bytes under text/plain, that
        // plus a charset, application/json, octet-stream, text/html and
        // application/wasm alike, because the bytes are compiled, never streamed by
        // content type — but an intermediary that treats text as text is not. A
        // normalizer that appends one newline, or a lossy UTF-8 transcode, both
        // leave the magic number INTACT and still break the module (17489 → 17490
        // and → 18787 bytes), so the length is what actually detects them.
        const want = typeof __DECLARE_KERNEL_BYTES__ === "undefined" ? 0 : __DECLARE_KERNEL_BYTES__;
        if (want > 0 && bytes.length !== want) {
            throw new DeclareError(`the kernel at ${href} arrived as ${bytes.length} bytes, not the ${want} it was built as — something between the file and here rewrote it (a host or proxy that "fixes" text assets: a trailing newline, a BOM, a re-encoding). Serve it verbatim, or build with inlineKernel.`);
        }
        // "\0asm": the module's own magic. Served as text so that every static host
        // COMPRESSES it (GitHub Pages compresses text/plain, text/html, markdown and
        // JSON, but not application/wasm, and cannot serve a pre-compressed file), a
        // host that rewrites what it thinks is text would corrupt it — so say so
        // here rather than fail inside the engine. Base64 is accepted too, which is
        // what a host that mangles binary can be given instead.
        if (bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d)
            return bytes;
        const text = new TextDecoder().decode(bytes).trim();
        if (/^[A-Za-z0-9+/=\s]+$/.test(text) && text.length > 64)
            return decodeWasm(text.replace(/\s+/g, ""));
        throw new DeclareError(`the kernel at ${href} is not a WebAssembly module (${bytes.length} bytes, starting ${Array.from(bytes.subarray(0, 4)).join(",")}) — a proxy or host that rewrites text assets will have altered it`);
    });
}
/** The bytes for the SYNCHRONOUS path. A build that ships them in a sibling
 *  module has nothing to hand back here — nothing may block on a fetch — so the
 *  caller is told to await `kernelReady()`, which is what boot does before it
 *  instantiates anything. In an inline build (tsc, the Mac bundle, offline) this
 *  is the compiled-in constant, and the reference is what keeps that module in
 *  such a bundle and out of a web one. */
function inlineKernelBytes() {
    // the condition folds to a literal in a bundled build, so the branch NOT taken
    // is dropped — and with it either the base64 constant or this error
    if (typeof __DECLARE_INLINE_KERNEL__ === "undefined" || __DECLARE_INLINE_KERNEL__)
        return decodeWasm(KERNEL_WASM_B64);
    throw new DeclareError("the kernel is not loaded yet — await kernelReady() before instantiating a program (this build fetches the kernel alongside the bundle)");
}
/** THE JAVASCRIPT KERNEL, chosen by `DECLARE_KERNEL=js` (node) or
 *  `globalThis.__declareKernelJS = true` (a page). The second implementation of
 *  the ABI, kept honest by running the SAME suite (kernel-js.ts explains why it
 *  exists). Off unless asked for: the C kernel is the fast path. */
function wantsJsKernel() {
    // A PRODUCTION BUILD CARRIES NONE OF THIS (DT, 2026-09-17: "we do not want any
    // excess bytes in a production build. period."): declarec defines
    // `__DECLARE_JS_KERNEL__` false, which folds this to `false` and takes the
    // switch, the loader and the error with it. Every other build — the dev
    // server's bundle, the platform tree, the tests — keeps it, because that is
    // where debugging happens.
    if (typeof __DECLARE_JS_KERNEL__ !== "undefined" && !__DECLARE_JS_KERNEL__)
        return false;
    const g = globalThis;
    if (g.__declareKernelJS === true)
        return true;
    return g.process?.env?.DECLARE_KERNEL === "js";
}
/** THE JAVASCRIPT KERNEL IS AVAILABLE EVERYWHERE, INCLUDING A BROWSER — that is
 *  the point of it (DT, 2026-09-17: "I am talking about things like breakpoints,
 *  trace, profile, chrome dev tools"). Stepping through a WebAssembly kernel
 *  shows you stack frames and a memory blob; stepping through this one shows
 *  `run`, `settle`, `invalidate` and a rule's edges as ordinary values, and the
 *  profiler attributes time to named functions.
 *
 *  It costs nothing when unused because it is FETCHED ON DEMAND: a bundler puts
 *  it in its own chunk beside the bundle, and nothing loads that chunk unless a
 *  page asks (`globalThis.__declareKernelJS = true`, then reload). In node the
 *  module is already on disk, so the same import resolves immediately. */
let jsKernelModule = null;
export async function loadJsKernel() {
    if (typeof __DECLARE_JS_KERNEL__ !== "undefined" && !__DECLARE_JS_KERNEL__)
        return;
    if (jsKernelModule === null)
        jsKernelModule = await import("./kernel-js.js");
}
/** RECORD THE CROSSINGS when asked (DECLARE_KERNEL_TRACE, or
 *  `globalThis.__declareKernelTrace`). Off otherwise, and dropped from shipping
 *  bundles with the JS kernel — it is a debugging instrument, not cargo. The
 *  recording is readable at `globalThis.__declareTrace`, and a node run writes
 *  it to the named file at exit. See kernel-trace.ts for what a trace is FOR:
 *  a repro outside a running program — never a definition of correct. */
let TRACE = null;
function armTrace(k) {
    const target = traceTarget();
    if (target === null)
        return k;
    const t = traceKernel(k, HOST);
    TRACE = t.trace;
    globalThis.__declareTrace = t.trace;
    const g = globalThis;
    if (target !== "memory" && g.process?.on) {
        g.process.on("exit", () => {
            try {
                // written at exit so a crash still leaves the steps that led to it
                const fs = globalThis.require?.("node:fs");
                fs?.writeFileSync(target, JSON.stringify(TRACE));
            }
            catch { /* a trace that cannot be written is not worth failing a run over */ }
        });
    }
    return t.kernel;
}
export function kernelReady(caps) {
    if (K !== null)
        return Promise.resolve();
    if ((typeof __DECLARE_JS_KERNEL__ === "undefined" || __DECLARE_JS_KERNEL__) && wantsJsKernel())
        return loadJsKernel().then(() => { kernelReadySync(caps); });
    if (loading === null) {
        // Boot-stage marks (dev/profiling builds only): how long the bytes took to
        // arrive and how long WebAssembly compile + instantiate took — the two
        // parts of the render stage a JS-only runtime never had.
        const perf = typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && typeof performance !== "undefined" && typeof performance.mark === "function";
        const mark = (n) => { if (perf)
            performance.mark(`declare:${n}:start`); };
        const done = (n) => { if (perf) {
            try {
                performance.measure(`declare:${n}`, `declare:${n}:start`);
            }
            catch { /* no mark */ }
        } };
        mark("kernel-bytes");
        loading = kernelBytes()
            .then((bytes) => { done("kernel-bytes"); mark("kernel-instantiate"); return instantiateKernel(bytes, emptyImage(), HOST, { ...DEFAULT_CAPS, ...caps }); })
            .then((k) => {
            done("kernel-instantiate");
            // THE SYNC PATH MAY HAVE WON. The eager load below starts this promise at
            // module evaluation; a host that then instantiates synchronously
            // (kernelReadySync — JavaScriptCore, node, a test page) has already
            // installed a kernel and registered a program's rules in it. Replacing it
            // here would swap the live kernel for an empty one mid-program (the
            // perceptual suite caught exactly that, 2026-09-18). The first kernel
            // installed is THE kernel; a late async instance is simply dropped.
            if (K !== null)
                return K;
            K = (typeof __DECLARE_JS_KERNEL__ === "undefined" || __DECLARE_JS_KERNEL__) ? armTrace(k) : k;
            bindKernel(K);
            return K;
        });
    }
    return loading.then(() => undefined);
}
// THE KERNEL STARTS LOADING WHEN THE BUNDLE EVALUATES, not when boot first asks.
// boot awaits kernelReady() at the top of the render stage; if the fetch and the
// WebAssembly compile begin only then, both sit on the path to first paint.
// Measured on a real iPad (2026-09-18): 1–2 ms of base64 decode and 6–10 ms of
// WebAssembly compile + instantiate, inside a ~100 ms boot. Kicked here they
// overlap whatever the page does before boot (a compile stage, a cache read)
// and the render stage sees a resolved promise. Browsers only: node and the Mac
// host take the sync/native paths, and a page that wants the JS kernel (a dev
// switch) must not compile the WASM at all.
if (typeof document !== "undefined" && typeof WebAssembly !== "undefined"
    && !(typeof __DECLARE_NATIVE_KERNEL__ !== "undefined" && __DECLARE_NATIVE_KERNEL__)
    && !((typeof __DECLARE_JS_KERNEL__ === "undefined" || __DECLARE_JS_KERNEL__) && wantsJsKernel())) {
    kernelReady().catch(() => { });
}
/** The synchronous form, where the engine allows it (JavaScriptCore, node). */
export function kernelReadySync(caps) {
    if (K !== null)
        return;
    // NATIVE_KERNEL is false in web builds, so the native binding folds out here
    // and `instantiateKernelNative` leaves the bundle with it.
    if ((typeof __DECLARE_JS_KERNEL__ === "undefined" || __DECLARE_JS_KERNEL__) && wantsJsKernel()) {
        if (jsKernelModule === null) {
            throw new DeclareError("the JavaScript kernel was asked for but is not loaded yet — await kernelReady() (a page: set globalThis.__declareKernelJS before boot and reload)");
        }
        K = armTrace(jsKernelModule.instantiateKernelJS(HOST, { ...DEFAULT_CAPS, ...caps }));
        globalThis.__declareKernelKind = "js";
        bindKernel(K);
        return;
    }
    let k0 = (typeof __DECLARE_NATIVE_KERNEL__ === "undefined" || __DECLARE_NATIVE_KERNEL__) && hasNativeKernel()
        ? instantiateKernelNative(emptyImage(), HOST, { ...DEFAULT_CAPS, ...caps }) // the Mac host's C kernel (kernel.md Phase D)
        : instantiateKernelSync(inlineKernelBytes(), emptyImage(), HOST, { ...DEFAULT_CAPS, ...caps });
    // the recorder is an instrument, not cargo: named at the site so a production
    // build folds it away and kernel-trace.js leaves the bundle with it
    if (typeof __DECLARE_JS_KERNEL__ === "undefined" || __DECLARE_JS_KERNEL__)
        k0 = armTrace(k0);
    K = k0;
    bindKernel(K);
}
let phaseHooked = false;
function bindKernel(k) {
    if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && !phaseHooked) {
        phaseHooked = true;
        let undo = null;
        registerPhaseHooks(() => {
            if (K !== null)
                undo = wrapMethods(K, {
                    "kernel: register": ["addRule", "addExprRule", "addCode", "addConst", "addCell", "addCells", "rewire", "extentAdd", "extentRewire", "visAdd", "viewAdd", "viewParent", "own", "release", "freeCell"],
                    "kernel: settle": ["settle", "run", "flush"],
                    "kernel: writes": ["write", "set", "touch", "invalidate"],
                });
        }, () => { undo?.(); undo = null; });
    }
    table = k.table;
    ACTIVE = k.active;
    ring = k.ring;
    ringCount = k.ringCount;
    ringCap = k.ringCap;
    trackRing = k.trackRing;
    trackCount = k.trackCount;
    trackCap = k.trackCap;
    // THE VIEWS CAN BE REPLACED UNDER US. A rule with more dependencies than the
    // staging buffer holds makes the loader grow it, which in a browser can grow
    // the WebAssembly memory and detach every view over the old buffer. The loader
    // re-takes them and calls this back, synchronously, before the growing call
    // returns — so the next line of whatever was running reads live memory again.
    // (A stale view is not silent: a detached typed array throws on access.)
    k.onGrow(() => bindKernel(k));
}
export function kernelLoaded() { return K !== null; }
/** Tooling: the kernel's occupancy — cells and rules allocated (high-water,
 *  since freed ids are reused) and the live constraints by label. What a
 *  leak looks like: a count that climbs across a churn (a location flip, a
 *  filter change) and never comes back. */
export function kernelStats(top = 12) {
    const by = new Map();
    let live = 0;
    for (const c of RULES) {
        if (c === null || c === undefined)
            continue;
        live++;
        const key = c.label.replace(/ \(.*$/, "").replace(/#\d+/g, "");
        by.set(key, (by.get(key) ?? 0) + 1);
    }
    return {
        cells: K === null ? 0 : K.cells(), rules: K === null ? 0 : K.rules(), live,
        byLabel: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, top),
    };
}
/** The kernel, for the modules that hold cells directly (attributes.ts's
 *  slot table access in the next phase). */
export function kernel() { return need(); }
function need() {
    if (K === null) {
        // First use without an explicit load: instantiate synchronously where the
        // engine allows it (node, JavaScriptCore, Safari, Firefox). Chrome refuses
        // main-thread compilation of a module this size, which is why the browser
        // boot awaits kernelReady() first — this path is never reached there.
        try {
            kernelReadySync();
        }
        catch (e) {
            throw new DeclareError(`the kernel is not loaded — await kernelReady() before instantiating a program (${String(e)})`);
        }
    }
    return K;
}
/** While a wire() probe runs, every Cell.track lands in S.collecting instead
 *  of the kernel: the probe collects the read set, and the rule is created
 *  with it. */
/** The tracker in force when each nested run() was entered (the JS core's
 *  `prev`), so a body's apply can land under it. Settle-driven runs are not
 *  nested: their outer is -1. */
const outer = [];
/** Is a computation currently recording reads? Callers (attributes.ts) check
 *  this before materializing a Cell, so unobserved slots never allocate one. */
export function isTracking() {
    return S.collecting !== null || ACTIVE[0] >= 0;
}
/** Cell.track for a raw kernel cell — a numeric slot living in the kernel's
 *  table (attributes.ts) has no Cell object; the table cell IS its node. */
/** Land the track ring's entries under the rule that is active NOW (before
 *  the active rule changes hands — untracked(), the apply switch). */
function drainTrack() {
    if (trackCount[0] > 0)
        K.flush();
}
export function trackCell(cell) {
    if (S.collecting !== null)
        S.collecting.add(cell);
    else if (ACTIVE[0] >= 0) {
        if (NO_RING) {
            K.track(cell);
            return;
        } // the A/B switch (profiling)
        // the track ring: no call per read; the kernel links the run's reads to
        // the active rule when the body returns (or at the next kernel entry)
        if (trackCount[0] >= trackCap)
            K.flush();
        trackRing[trackCount[0]++] = cell;
    }
}
/** One observable slot's dependency node. The value itself lives wherever it
 *  lives (a view field); a Cell exists only once something tracked a read of
 *  the slot — pay-per-use by construction — and its kernel id only once it is
 *  tracked or changed. */
export class Cell {
    /** @internal the kernel cell, or -1 until first use. */
    id = -1;
    /** @internal The cell belongs to an instance's numeric BLOCK (attributes.ts
     *  escape): the block's clear retires it; free() must not return it alone. */
    owned = false;
    /** A STRUCTURAL cell (a Node's child-list — node.ts): waking through one
     *  means the dependency SHAPE may have changed, so a statically-wired
     *  subscriber re-probes its edges on the next run instead of trusting the
     *  fixed set (extentOf over children that did not exist at wire time). */
    structural = false;
    /** The kernel cell id (allocated on first need) — for a native rule's edge. */
    cellId() { return this.ensure(); }
    ensure() {
        if (this.id < 0) {
            const id = need().addCell(CELL_KIND.REF, this.structural);
            if (id < 0)
                throw new DeclareError("kernel: out of cells — the program exceeds the runtime's cell capacity");
            this.id = id;
        }
        return this.id;
    }
    /** Record that the running computation read this slot (no-op untracked). */
    track() {
        if (S.collecting !== null) {
            S.collecting.add(this.ensure());
            return;
        }
        if (ACTIVE[0] >= 0)
            trackCell(this.ensure()); // the track ring, like a table cell
    }
    /** The write half: invalidate every subscriber. Subscribers only get
     *  queued here — re-evaluation is the scheduler's, in batch. */
    changed() {
        if (this.id >= 0)
            touchCell(this.id);
    }
    /** Return the kernel cell (a retiring view's slots — node.ts teardown). A
     *  freed cell drops its subscribers; the Cell may be tracked again later
     *  and takes a fresh id. */
    free() {
        if (this.id >= 0) {
            if (!this.owned)
                K.freeCell(this.id);
            this.id = -1;
        }
    }
}
/** A guard, not a tuning constant: a constraint that re-runs this many times
 *  in one settle can only be reading its own (transitive) output. */
const CYCLE_LIMIT = 100;
/** The outer-loop guard — AFTER_LIMIT passes means a step (transitively)
 *  re-registers itself every pass, the afterSettle spelling of a cycle. */
const AFTER_LIMIT = 100;
/** A standing computation: `compute` runs with read-tracking on, `apply`
 *  lands the result with tracking off (its writes *invalidate* dependents;
 *  they must never register as dependencies). On the tracking path the
 *  dependencies are rebuilt from scratch every run, so they are precise even
 *  under conditional reads — a branch not taken this run is not a dependency
 *  this run. */
export class Constraint {
    label;
    compute;
    apply;
    phase;
    yielding;
    /** @internal the kernel rule, or -1 until first run/wire. */
    id = -1;
    dead = false;
    suspended = false;
    /** The body's SOURCE TEXT and position, when this constraint came from a
     *  `{ }` in a program (bind.ts sets them). The Inspector's "why" answer is
     *  this string; null for constraints the runtime builds itself (extent
     *  derives, percent/align bindings) and for live-bound ones typed at
     *  runtime, which are marked separately by `isStatic` being false. */
    source = null;
    /** @internal Is this the view's AUTO-EXTENT — the rule that measures its
     *  children? The native form reads them through the kernel's slot blocks, not
     *  through JS cells, so `readsAny` cannot see the edge: a layout asking for
     *  the cycle-safe band (layout.ts viewExtent) tests this instead. */
    isAutoExtent = false;
    /** Where the author wrote it — `file` present only for an INCLUDED file, so
     *  a diagnostic in a multi-file program names the file it belongs to. */
    sourcePos = null;
    /** Installed at RUNTIME by the Inspector's evaluate strip rather than compiled
     *  from source — so the UI can say "temporary" honestly instead of implying it
     *  has the same standing as a compiled constraint. */
    live = false;
    /** When this constraint is a LAYOUT's claim on a child's geometry slot, the
     *  layout's own phrase for itself (`app.col's SimpleLayout`) — set by
     *  layout.ts. Message-only: the one-owner guard and the setter read it so a
     *  conflict names the LAYOUT and the resolution, not a bare constraint. */
    arrangedBy = null;
    constructor(
    /** For error messages: "View.width", "Text.draw", … */
    label, compute, apply, phase = 0, 
    /** A yielding constraint is runtime-supplied (auto-size): a direct write
     *  to its slot quietly replaces it. A non-yielding one is author-declared
     *  (`{ }`, a percent): a direct write is an error (see attributes.ts). */
    yielding = false) {
        this.label = label;
        this.compute = compute;
        this.apply = apply;
        this.phase = phase;
        this.yielding = yielding;
    }
    /** Static-edge mode (docs/system-design/constraints.md §5): the compiler extracted this
     *  constraint's dependency set, so its edges are wired ONCE — thereafter run()
     *  recomputes and applies with no per-run unlink/re-track. */
    wired = false;
    /** A DECLARED slot's `{ }` default, standing as a yielding rule (bind.ts
     *  bindDeclDefault): a RUNTIME write (setBound — a tenant push, an
     *  animator, a natural size) displaces it too, as it displaced the live
     *  fallback this replaces (attributes.ts: storage wins). */
    declDefault = false;
    /** A percent binding (attributes.ts markPercent): the kernel's auto-extent
     *  skips the child slot it owns, as view.ts extentOf does. Set before wire. */
    percent = false;
    /** A kernel-native built-in declined its case: the host takes over. */
    onDecline = null;
    /** The numeric cell this constraint OWNS (attributes.ts own()), registered
     *  with the kernel so its pull can run this rule for a reader's first value. */
    ownsCell = -1;
    ownCell(cell) { this.ownsCell = cell; if (this.id >= 0)
        K.own(cell, this.id); }
    releaseCell() { if (this.ownsCell >= 0 && this.id >= 0)
        K.release(this.ownsCell, this.id); this.ownsCell = -1; }
    /** Is a recompute of this rule queued (its inputs moved; the table lags)?
     *  Pending ring writes are flushed first so the answer reflects them. */
    isQueued() {
        if (this.id < 0 || K === null)
            return false;
        if (ringCount[0] > 0 || trackCount[0] > 0)
            K.flush(); // pending writes may queue it
        return (K.stateOf(this.id) & KERNEL_STATE.QUEUED) !== 0;
    }
    /** KERNEL-NATIVE: the rule is evaluated entirely by the kernel (an EXPR
     *  body, bind.ts); this object is its handle for ownership, labels and
     *  disposal. The kernel never calls back into it. */
    native = false;
    /** @internal Adopt a rule the kernel created (EXPR): edges and code are
     *  already in place; landing is `run()`. */
    adoptRule(id) {
        this.id = id;
        this.native = true;
        this.wired = true;
        if (this.ownsCell >= 0)
            K.own(this.ownsCell, id);
        RULES[id] = this;
    }
    /** @internal Is this a kernel-evaluated rule? */
    get isNative() { return this.native; }
    /** @internal Whether this constraint runs on the static path (test/observe). */
    get isStatic() { return this.wired; }
    /** The compiler's extracted read-paths, retained verbatim for tooling —
     *  `explain()` (inspect.ts) answers "why does this slot have this value"
     *  by LOOKUP because these ride along (verify-and-evals.md §2.2). Null on
     *  the tracking path. */
    wiredPaths = null;
    /** The wired probe, retained for structural RE-WIRING (see runBody). */
    probe = null;
    /** @internal The cells this constraint currently depends on (kernel cell
     *  ids) — tooling and tests; a rule that never ran has none. */
    get deps() {
        return this.id >= 0 ? K.deps(this.id) : [];
    }
    /** @internal Does this constraint read any of `cells`? Dependency edges are
     *  rebuilt from scratch every run, so the answer is about the LAST run's
     *  reads — which is exactly what the cycle question needs ("would consuming
     *  this constraint's output close a loop back through those slots?"). The
     *  kernel holds the edges as cell ids, so the set is mapped through the ids
     *  the cells were allocated (a cell with no id was never read by anyone). */
    readsAny(cells) {
        if (cells.size === 0 || this.id < 0)
            return false;
        const ids = new Set();
        for (const c of cells)
            if (c.id >= 0)
                ids.add(c.id);
        if (ids.size === 0)
            return false;
        for (const d of K.deps(this.id))
            if (ids.has(d))
                return true;
        return false;
    }
    flags() {
        return (this.yielding ? KERNEL_FLAG.YIELDING : 0) | (this.phase === 1 ? KERNEL_FLAG.PHASE1 : 0) | (this.percent ? KERNEL_FLAG.PERCENT : 0);
    }
    /** The rule, created on first use: DYNAMIC (edges rediscovered per run)
     *  unless wire() made it a BODY with fixed edges. */
    ensure() {
        if (this.id < 0) {
            if (this.dead)
                throw new DeclareError(`${this.label}: a disposed constraint cannot run`);
            const id = need().addRule(-1, KERNEL_KIND.DYNAMIC, this.flags(), []);
            if (id < 0)
                throw new DeclareError("kernel: out of rules — the program exceeds the runtime's rule capacity");
            this.id = id;
            RULES[id] = this;
            if (this.ownsCell >= 0)
                K.own(this.ownsCell, id);
        }
        return this.id;
    }
    /** Collect the cells `probe` reads, without the kernel: the read set of a
     *  wired rule, taken once here and again on a structural re-probe. */
    collect(probe) {
        const prev = S.collecting;
        const set = new Set();
        S.collecting = set;
        try {
            probe();
        }
        finally {
            S.collecting = prev;
        }
        return [...set];
    }
    /** Wire the supplied edges once, then land the initial value. `probe` reads the
     *  compiler's extracted read-paths under collection — the same Cell.track path
     *  a full run would use, but over just the (branch-union) dependency set — so
     *  the edges are exact and permanent. The value itself is computed with
     *  tracking OFF (edges already fixed). This is the link-time prewiring. */
    wire(probe, paths) {
        if (this.id >= 0)
            throw new DeclareError(`${this.label}: wire() after the constraint already ran`);
        this.probe = probe;
        const edges = this.collect(probe);
        const id = need().addRule(-1, KERNEL_KIND.BODY, this.flags(), edges);
        if (id < 0)
            throw new DeclareError("kernel: out of rules — the program exceeds the runtime's rule capacity");
        this.id = id;
        RULES[id] = this;
        this.wired = true;
        if (this.ownsCell >= 0)
            K.own(this.ownsCell, id);
        if (paths !== undefined)
            this.wiredPaths = paths;
        this.run();
    }
    /** @internal The kernel's callback: evaluate and land. On the static path a
     *  structural wake (a child list changed under a read) re-probes the edges
     *  first — same read-paths, current cells. */
    runBody() {
        if (this.wired) {
            if (this.probe !== null && (K.stateOf(this.id) & KERNEL_STATE.REWIRE) !== 0)
                K.rewire(this.id, this.collect(this.probe));
            (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && phasesOn ? phased("rule apply", () => this.apply((typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && phasesOn ? phased("rule bodies", () => this.compute()) : this.compute()))) : this.apply((typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && phasesOn ? phased("rule bodies", () => this.compute()) : this.compute())));
            return;
        }
        // compute under this rule (the kernel made it active); apply under the
        // OUTER tracker — the JS core restored `active = prev` before apply, so a
        // body's writes (and whatever its apply reads) never become its own reads
        const v = (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && phasesOn ? phased("rule bodies", () => this.compute()) : this.compute());
        const mine = K.active[0];
        // the track ring attributes to whoever is active when it drains: land the
        // compute's reads under this rule before the switch, the apply's under the outer
        drainTrack();
        K.active[0] = outer.length > 0 ? outer[outer.length - 1] : -1;
        try {
            (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && phasesOn ? phased("rule apply", () => this.apply(v)) : this.apply(v));
        }
        finally {
            drainTrack();
            K.active[0] = mine;
        }
    }
    /** Evaluate now. A tracking run REPLACES the active tracker for its
     *  duration (the JS core set `active = this`): a wire() probe that
     *  transitively runs one — the visibility feed arming on a first tracked
     *  read — must not collect the inner body's reads as its own. A wired run
     *  leaves the outer tracker in place, as before. */
    run() {
        if (this.dead || this.suspended)
            return;
        const id = this.ensure();
        const k = need();
        outer.push(k.active[0]);
        if (this.wired) {
            try {
                k.run(id);
            }
            finally {
                outer.pop();
            }
        }
        else {
            const prev = S.collecting;
            S.collecting = null;
            try {
                k.run(id);
            }
            finally {
                S.collecting = prev;
                outer.pop();
            }
        }
        rethrow();
    }
    /** Queue for the next settle. Coalesces: already-queued, disposed, or
     *  suspended constraints are a no-op, so N invalidations cost one run. */
    invalidate() {
        if (this.id >= 0)
            K.invalidate(this.id);
    }
    /** Permanently retire (a yielding owner displaced by a direct write). */
    dispose() {
        this.dead = true;
        if (this.id >= 0) {
            K.dispose(this.id);
            RULES[this.id] = null;
            this.id = -1;
        }
    }
    /** Displace this constraint without killing it: drop its dependency edges
     *  and refuse to wake, so an animator may drive its slot every tick while
     *  the constraint sits inert (animation.md §2 rule 2). It keeps owning the
     *  slot (the ownership diagnostic still protects it from author writes) but
     *  writes nothing until resumed. Idempotent. */
    suspend() {
        this.suspended = true;
        if (this.id >= 0)
            K.suspend(this.id);
    }
    /** Resume from suspension and re-evaluate against current state now — the
     *  displaced driver taking its slot back on the animator's completion
     *  (animation.md §2 rule 4: resumed, not reinstated with a stale output). */
    resume() {
        if (!this.suspended)
            return;
        this.suspended = false;
        if (this.id >= 0) {
            outer.push(K.active[0]);
            try {
                K.resume(this.id);
            }
            finally {
                outer.pop();
            }
            rethrow();
        }
        else
            this.run();
    }
}
// ── The scheduler ───────────────────────────────────────────────────────────
//
// Writes batch (language §7): a write updates its value immediately, but
// dependents recompute once, at the settle — which runs as a microtask, so a
// whole synchronous turn of writes coalesces and settles *before* the
// browser's next render step (microtasks drain ahead of rAF). The kernel
// queues; `schedule()` (its callback) arms the microtask.
/** Evaluate `fn` with NO tracker listening — neither the dynamic collector
 *  nor the kernel's active rule sees its reads (a declared default refreshed
 *  at displacement, attributes.ts own(): a read made on the newcomer's behalf
 *  must not become an edge of whatever rule happens to be running). */
export function untracked(fn) {
    const c = S.collecting, a = ACTIVE[0];
    drainTrack(); // reads so far belong to the rule that is active now
    S.collecting = null;
    ACTIVE[0] = -1;
    try {
        return fn();
    }
    finally {
        drainTrack();
        S.collecting = c;
        ACTIVE[0] = a;
    } // reads made untracked drain to nobody
}
/** Steps registered by `afterSettle`, drained at the close of the settle. */
const after = [];
/** Run `step` exactly once, at the close of the current settle — constraints
 *  quiescent, replication reconciled, layout placed, sizes derived, nothing
 *  painted yet (language §7: the settle is a microtask, ahead of the
 *  backends' paint). The far side of the landing: a handler's writes take
 *  effect at the settle, so a step registered inside a handler reads the
 *  world *after* that handler's change. Writes made in a step fold into the
 *  same settle (the drain loops back to quiescence), so a correction lands
 *  in the same frame as the change it corrects. Registered outside any
 *  pending settle, the step gets a settle of its own. */
export function afterSettle(step) {
    after.push(step);
    if (!inSettle)
        schedule();
}
/** Re-evaluate everything invalidated, to quiescence: all value constraints
 *  (phase 0), then draw re-records (phase 1) — looping back if a draw body
 *  wrote reactive state. Then drain the afterSettle steps and deliver change
 *  events, looping back to quiescence again if either wrote. Runs
 *  automatically as a microtask after any write; exported so tests (and
 *  tooling) can force a deterministic settle. Throws DeclareError on a
 *  constraint cycle. */
let settleCount = 0;
export function settle() {
    if (K === null || inSettle)
        return;
    // DIAGNOSTIC: `globalThis.__declareSettleTrace = true` prints who keeps
    // calling settle when a storm runs — the stack of every 5000th call.
    if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && globalThis.__declareSettleTrace === true && ++settleCount % 5000 === 0) {
        console.error(`[settle storm] ${settleCount} settles\n` + (new Error().stack ?? "").split("\n").slice(2, 14).join("\n"));
    }
    inSettle = true;
    stepsRan = false;
    let r;
    try {
        r = K.settle();
    }
    finally {
        inSettle = false;
    }
    if (r < 0 || pendingError !== null) {
        const e = pendingError ?? new DeclareError(`kernel: settle failed (${r})`);
        pendingError = null;
        after.length = 0;
        throw e;
    }
    // and whatever the close's last pass wrote
    if (r > 0 && pushHook !== null) {
        const d = K.kdirty();
        if (d.length > 0)
            pushHook(d);
    }
}
let pushHook = null;
/** attributes.ts installs the push sweep (it knows cell → view, slot). */
export function setPushHook(fn) { pushHook = fn; }
// ── observe — the notification half of the app↔host contract ────────────────
//
// A standing watcher over reactive state for JS callers — hosts, shims, a page
// embedding a Declare app. `read` runs under tracking; whenever a settle
// changes what it returns, `onChange` runs ONCE, at the close of that settle
// (constraints quiescent, layout placed, nothing painted — the afterSettle
// vantage). This replaces the hosts' polling loops: the question "did the app
// write X?" is answered at the write, not re-asked per frame. Equal results
// (Object.is; arrays one level shallow, so `() => [app.location, app.waypoint]`
// reads as the pair it means) coalesce to silence.
//
// Not language surface — a `{ }` body needs no subscription because the whole
// language is the subscription. This is for the JS on the far side of an App.
export function observe(read, onChange, label = "observe") {
    let last;
    let first = true;
    let armed = false;
    const c = new Constraint(label, read, (v) => {
        if (first) {
            first = false;
            last = v;
            return;
        }
        if (sameResult(last, v))
            return;
        last = v;
        if (armed)
            return; // one call per settle, with the settle-final value
        armed = true;
        afterSettle(() => { armed = false; onChange(last); });
    });
    c.run();
    return () => c.dispose();
}
/** observe's result equality: Object.is, plus one level of array shallow-compare. */
function sameResult(a, b) {
    if (Object.is(a, b))
        return true;
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
        for (let i = 0; i < a.length; i++)
            if (!Object.is(a[i], b[i]))
                return false;
        return true;
    }
    return false;
}
//# sourceMappingURL=reactive.js.map