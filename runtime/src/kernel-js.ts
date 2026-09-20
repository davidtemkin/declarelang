// kernel-js — THE REACTIVE KERNEL IN JAVASCRIPT, a second implementation of the
// same ABI the C kernel implements (kernel-loader.ts `Kernel`).
//
// WHY A SECOND ONE (DT, 2026-09-17): the C kernel is the only implementation of
// its mechanisms, and "whatever the C does" is not a specification — it has had
// weeks of use where the constraint core it replaced has had years. Two
// implementations of one written contract can disagree, and a disagreement is a
// question worth answering; one implementation can only be believed. It also
// pays twice over: a host without WebAssembly still runs, and a defect like the
// staging-buffer ceiling (2026-09-17) is legible in a debugger.
//
// WRITTEN FROM THE CONTRACT, NOT TRANSCRIBED FROM THE C — the semantics below
// are the ones docs/system-design/kernel.md states and the suite already pins:
//
//   • ONE WRITE PATH. A numeric cell gates on `===` (so NaN never gates), then
//     marks dirty and wakes its subscribers. A REF cell carries only the wake.
//   • OWNERSHIP. A rule may own one cell. An author write to an owned cell is
//     refused, unless the owner YIELDS, in which case the owner is disposed and
//     the write lands. Owning a cell whose owner yields does the same.
//   • THE QUEUE has two phases: everything in phase 0 runs before anything in
//     phase 1 (the draw phase). A rule already queued, dead, suspended or never
//     yet run is not queued again.
//   • A RUN drains the host's pending reads and writes on both sides of the
//     body, so a nested run links its reads to itself and a body's writes wake
//     their dependents before the run returns.
//   • DYNAMIC rules re-discover their reads every run: the old edges go, a new
//     serial coalesces repeat reads of one cell, and the reads the host appended
//     while the body ran become this rule's edges.
//   • THE PULL. A host-initiated run first runs any QUEUED rule that owns a cell
//     this rule reads, in dependency order, so a first evaluation sees the values
//     the world is settling to rather than the ones it is leaving.
//   • A SETTLE runs the queue to empty, then drains after-settle steps, then
//     fires change events, and loops until nothing more is queued. A rule that
//     re-runs 100 times in one settle is a cycle; 100 after-settle passes is a
//     storm. Either ends the settle and is reported to the host.
//
// WHAT IT DOES NOT DO: the built-in VIEW rules (visibility, auto-extent) that
// the C kernel computes over its own view table. Those decline here — `visAdd`
// and `extentAdd` return -1 — and the runtime falls back to deriving them in
// JavaScript, which is the same path it takes on a host with no kernel at all
// (view.ts installKernelVis / installKernelExtent both test for that). So a
// program runs correctly on this kernel; a view-heavy one simply runs the
// visibility walk the old way.
import type { Kernel, KernelCaps, KernelHost } from "./kernel-loader.js";

// cell kinds (declare_kernel.h)
const F64 = 0, REF = 1;
// rule kinds
const K_EXPR = 0, K_BODY = 1, K_DYNAMIC = 2;
// rule flags
const F_YIELDING = 1, F_PHASE1 = 2;
// rule states
const ST_QUEUED = 1, ST_DEAD = 2, ST_SUSPENDED = 4, ST_REWIRE = 8, ST_UNLANDED = 16;
// errors
const OK = 0, ERR_OWNED = -3, ERR_CYCLE = -4, ERR_AFTER = -5, ERR_BOUND = -6, ERR_BAD = -8, ERR_ABORT = -9;
const CYCLE_LIMIT = 100, AFTER_LIMIT = 100;
const NONE = 0xffffffff;

// the opcodes, in the header's order
const OP_END = 0, OP_LOAD = 1, OP_CONST = 2, OP_ADD = 3, OP_SUB = 4, OP_MUL = 5, OP_DIV = 6, OP_MOD = 7,
  OP_NEG = 8, OP_MIN = 9, OP_MAX = 10, OP_ABS = 11, OP_FLOOR = 12, OP_CEIL = 13, OP_ROUND = 14, OP_SQRT = 15,
  OP_LT = 16, OP_LE = 17, OP_GT = 18, OP_GE = 19, OP_EQ = 20, OP_NE = 21, OP_AND = 22, OP_OR = 23,
  OP_NOT = 24, OP_SELECT = 25, OP_CLAMP = 26;

/** JS truthiness for a number: 0, -0 and NaN are false. */
const truthy = (x: number): boolean => x === x && x !== 0;

interface JsRule {
  target: number; kind: number; flags: number; state: number; phase: number;
  code0: number; ncode: number; body: number; elem: number;
  stamp: number; runs: number; serial: number; owns: number;
  /** The cells this rule reads, kept the way the C keeps them so the two report
   *  and TRAVERSE them identically: the edges given at creation or rewire, in
   *  order, then the ones discovered while running, NEWEST FIRST (the C prepends
   *  each to a list). The order is not just cosmetic — the pull walks it. */
  fixed: number[];
  found: number[];
}

export function instantiateKernelJS(host: KernelHost, caps: KernelCaps = {}): Kernel {
  const ringCap = caps.ring ?? 1 << 14;
  const trackCap = caps.track_ring ?? 1 << 14;
  let capacity = Math.max(1024, caps.extra_cells ?? 1 << 16);

  let table = new Float64Array(capacity);
  let kindOf = new Uint8Array(capacity);          // low 7 bits kind, 0x80 structural
  let ownerOf = new Int32Array(capacity).fill(-1);
  let setFlag = new Uint8Array(capacity);
  let dirtyFlag = new Uint8Array(capacity);
  let kdirtyFlag = new Uint8Array(capacity);
  let cellDyn = new Uint32Array(capacity).fill(NONE);   // per cell: has any subscriber?
  let markOf = new Uint32Array(capacity);
  /** cell → the rules that read it. A Set, so unlinking is O(1) and a repeat
   *  read cannot double-subscribe (the C coalesces with a per-run serial; this
   *  keeps the serial too, to match the edge ORDER the C reports through deps). */
  let subs: Array<Set<number> | null> = new Array(capacity).fill(null);

  const ring = new Uint32Array(ringCap), ringCount = new Uint32Array(1);
  const trackRing = new Uint32Array(trackCap), trackCount = new Uint32Array(1);
  const active = new Int32Array(1).fill(-1);
  const pendingFlag = new Int32Array(1);

  const rules: JsRule[] = [];
  const consts: number[] = [];
  const code: number[] = [];
  let ncells = 0;
  const cellFree: number[] = [];
  const ruleFree: number[] = [];
  let serial = 0, stamp = 0;
  let flushing = false, aborted = false;
  const dirtyList: number[] = [], kdirtyList: number[] = [];
  const q: number[][] = [[], []];
  let onGrowCb: (() => void) | null = null;

  const grow = (need: number): void => {
    if (need <= capacity) return;
    let cap = capacity;
    while (cap < need) cap *= 2;
    const t = new Float64Array(cap); t.set(table); table = t;
    const k2 = new Uint8Array(cap); k2.set(kindOf); kindOf = k2;
    const o = new Int32Array(cap).fill(-1); o.set(ownerOf); ownerOf = o;
    const s = new Uint8Array(cap); s.set(setFlag); setFlag = s;
    const d = new Uint8Array(cap); d.set(dirtyFlag); dirtyFlag = d;
    const kd = new Uint8Array(cap); kd.set(kdirtyFlag); kdirtyFlag = kd;
    const cd = new Uint32Array(cap).fill(NONE); cd.set(cellDyn); cellDyn = cd;
    const m = new Uint32Array(cap); m.set(markOf); markOf = m;
    subs.length = cap;
    capacity = cap;
    self.table = table;
    onGrowCb?.();
  };

  // ── subscription ──────────────────────────────────────────────────────────
  const link = (rule: number, cell: number, discovered: boolean): void => {
    let set = subs[cell];
    if (set === null) { set = new Set(); subs[cell] = set; }
    set.add(rule);
    cellDyn[cell] = set.size === 0 ? NONE : 1;
    const r = rules[rule];
    if (discovered) r.found.unshift(cell); else r.fixed.push(cell);   // newest first, as the C lists them
  };
  const edgesOf = (r: JsRule): number[] => (r.fixed.length === 0 ? r.found : r.fixed.concat(r.found));
  const unlinkAll = (rule: number): void => {
    const r = rules[rule];
    for (const cell of edgesOf(r)) {
      const set = subs[cell];
      if (set !== undefined && set !== null) { set.delete(rule); if (set.size === 0) cellDyn[cell] = NONE; }
    }
    r.fixed.length = 0; r.found.length = 0;
  };

  const trackCell = (cell: number): number => {
    const a = active[0];
    if (a < 0 || cell >= ncells) return OK;
    const s = rules[a].serial;
    if (markOf[cell] === s) return OK;   // one read per run, however many times the body asks
    markOf[cell] = s;
    link(a, cell, true);
    return OK;
  };

  // ── the scheduler ─────────────────────────────────────────────────────────
  const enqueue = (rule: number): void => {
    q[rules[rule].phase].push(rule);
    if (!flushing && pendingFlag[0] === 0) { pendingFlag[0] = 1; host.schedule(); }
  };
  const invalidate = (rule: number, fromCell: number): void => {
    const r = rules[rule];
    if (fromCell !== NONE && (kindOf[fromCell] & 0x80) !== 0) r.state |= ST_REWIRE;
    if ((r.state & (ST_QUEUED | ST_DEAD | ST_SUSPENDED | ST_UNLANDED)) !== 0) return;
    r.state |= ST_QUEUED;
    enqueue(rule);
  };
  const wake = (cell: number): void => {
    if (cell >= ncells) return;
    const set = subs[cell];
    if (set === null || set === undefined) return;
    // a copy: a woken rule may rewire (and so mutate this set) while we walk it
    for (const rule of Array.from(set)) invalidate(rule, cell);
  };
  const markDirty = (cell: number): void => {
    if (dirtyFlag[cell] === 0) { dirtyFlag[cell] = 1; dirtyList.push(cell); }
  };

  const drain = (): void => {
    const n = Math.min(ringCount[0], ringCap);
    if (n === 0) return;
    ringCount[0] = 0;
    for (let i = 0; i < n; i++) {
      const cell = ring[i];
      if (cell >= ncells) continue;
      if ((kindOf[cell] & 0x7f) === F64) markDirty(cell);
      wake(cell);
    }
  };
  const drainTrack = (): void => {
    const n = Math.min(trackCount[0], trackCap);
    if (n === 0) return;
    trackCount[0] = 0;
    if (active[0] < 0) return;
    for (let i = 0; i < n; i++) trackCell(trackRing[i]);
  };

  // ── the one write path ────────────────────────────────────────────────────
  const setValue = (cell: number, v: number): number => {
    if (cell >= ncells) return ERR_BAD;
    if ((kindOf[cell] & 0x7f) !== F64) { wake(cell); return OK; }
    if (table[cell] === v) return OK;          // === : NaN never gates
    table[cell] = v;
    markDirty(cell);
    if (kdirtyFlag[cell] === 0) { kdirtyFlag[cell] = 1; kdirtyList.push(cell); }
    wake(cell);
    return OK;
  };
  /** A HOST write is not a kernel-written value: if this write is the newest
   *  kernel-dirty entry, take it back off that list (the C does the same). */
  const unkdirty = (cell: number): void => {
    if (kdirtyFlag[cell] === 1 && kdirtyList.length > 0 && kdirtyList[kdirtyList.length - 1] === cell) {
      kdirtyFlag[cell] = 0; kdirtyList.pop();
    }
  };

  // ── rules ─────────────────────────────────────────────────────────────────
  const freeRule = (rule: number): void => { ruleFree.push(rule); };
  const dispose = (rule: number): void => {
    const r = rules[rule];
    if (r === undefined || (r.state & ST_DEAD) !== 0) return;
    r.state |= ST_DEAD;
    unlinkAll(rule);
    if (r.owns >= 0 && ownerOf[r.owns] === rule) ownerOf[r.owns] = -1;
    r.owns = -1;
    if ((r.state & ST_QUEUED) === 0) freeRule(rule);
  };

  const evalExpr = (r: JsRule): number => {
    const st: number[] = [];
    let c = r.code0;
    const end = r.code0 + r.ncode;
    while (c < end) {
      const op = code[c++];
      switch (op) {
        case OP_END: c = end; break;
        case OP_LOAD: { const cell = code[c++]; st.push(cell < ncells ? table[cell] : 0); break; }
        case OP_CONST: { const i = code[c++]; st.push(i < consts.length ? consts[i] : 0); break; }
        case OP_ADD: { const b = st.pop()!, a = st.pop()!; st.push(a + b); break; }
        case OP_SUB: { const b = st.pop()!, a = st.pop()!; st.push(a - b); break; }
        case OP_MUL: { const b = st.pop()!, a = st.pop()!; st.push(a * b); break; }
        case OP_DIV: { const b = st.pop()!, a = st.pop()!; st.push(a / b); break; }
        case OP_MOD: { const b = st.pop()!, a = st.pop()!; st.push(a - b * Math.trunc(a / b)); break; }
        case OP_NEG: st.push(-st.pop()!); break;
        // min/max keep the C's NaN rule: NaN wins, and -0 vs 0 is not ordered
        case OP_MIN: { const b = st.pop()!, a = st.pop()!; st.push(a < b ? a : (b < a ? b : (a !== a ? a : b))); break; }
        case OP_MAX: { const b = st.pop()!, a = st.pop()!; st.push(a > b ? a : (b > a ? b : (a !== a ? a : b))); break; }
        case OP_ABS: st.push(Math.abs(st.pop()!)); break;
        case OP_FLOOR: st.push(Math.floor(st.pop()!)); break;
        case OP_CEIL: st.push(Math.ceil(st.pop()!)); break;
        case OP_ROUND: st.push(Math.floor(st.pop()! + 0.5)); break;   // Math.round's rule, spelled out
        case OP_SQRT: st.push(Math.sqrt(st.pop()!)); break;
        case OP_LT: { const b = st.pop()!, a = st.pop()!; st.push(a < b ? 1 : 0); break; }
        case OP_LE: { const b = st.pop()!, a = st.pop()!; st.push(a <= b ? 1 : 0); break; }
        case OP_GT: { const b = st.pop()!, a = st.pop()!; st.push(a > b ? 1 : 0); break; }
        case OP_GE: { const b = st.pop()!, a = st.pop()!; st.push(a >= b ? 1 : 0); break; }
        case OP_EQ: { const b = st.pop()!, a = st.pop()!; st.push(a === b ? 1 : 0); break; }
        case OP_NE: { const b = st.pop()!, a = st.pop()!; st.push(a !== b ? 1 : 0); break; }
        case OP_AND: { const b = st.pop()!, a = st.pop()!; st.push(truthy(a) && truthy(b) ? 1 : 0); break; }
        case OP_OR: { const b = st.pop()!, a = st.pop()!; st.push(truthy(a) || truthy(b) ? 1 : 0); break; }
        case OP_NOT: st.push(truthy(st.pop()!) ? 0 : 1); break;
        case OP_SELECT: { const b = st.pop()!, a = st.pop()!, cnd = st.pop()!; st.push(truthy(cnd) ? a : b); break; }
        case OP_CLAMP: { const hi = st.pop()!, lo = st.pop()!, x = st.pop()!; st.push(x < lo ? lo : (x > hi ? hi : x)); break; }
        default: c = end; break;
      }
    }
    return st.length > 0 ? st[st.length - 1] : 0;
  };

  const apply = (r: JsRule, v: number): void => {
    if (r.target < 0) return;                    // the host applied it itself
    const cell = r.target;
    if ((kindOf[cell] & 0x7f) === REF) { if (v !== 0) wake(cell); return; }
    setValue(cell, v);
  };

  const run = (rule: number): number => {
    const r = rules[rule];
    if (r === undefined) return ERR_BAD;
    let v = 0;
    drainTrack();   // reads appended by whatever is active now link to IT, before we switch
    drain();        // host writes since the last drain wake their dependents first
    switch (r.kind) {
      case K_EXPR: v = evalExpr(r); break;
      case K_BODY: v = host.body(rule, r.elem, r.target); break;
      case K_DYNAMIC: {
        unlinkAll(rule);
        serial++; if (serial === 0) serial++;    // 0 means "never"
        r.serial = serial;
        const prev = active[0];
        active[0] = rule;
        v = host.body(rule, r.elem, r.target);
        drainTrack();                            // the reads the body appended while it ran
        active[0] = prev;
        break;
      }
      default: return ERR_BAD;                   // VIS/EXTENT decline on this kernel
    }
    r.state &= ~(ST_REWIRE | ST_UNLANDED);
    apply(r, v);
    drain();                                     // …and the body's writes wake theirs
    return OK;
  };

  const runQueued = (rule: number): number => {
    const r = rules[rule];
    if (r === undefined || (r.state & ST_QUEUED) === 0) return OK;   // a stale entry: the pull ran it
    r.state &= ~ST_QUEUED;
    if ((r.state & ST_DEAD) !== 0) { freeRule(rule); return OK; }
    if ((r.state & ST_SUSPENDED) !== 0) return OK;
    if (r.stamp !== stamp) { r.stamp = stamp; r.runs = 0; }
    if (++r.runs > CYCLE_LIMIT) return ERR_CYCLE;
    return run(rule);
  };

  /** Run the queued owners of this rule's inputs first — see the header. */
  const pull = (rule: number, depth: number): number => {
    if (depth > 64) return OK;
    const r = rules[rule];
    if (r === undefined) return OK;
    for (const cell of edgesOf(r).slice()) {
      const o = ownerOf[cell];
      if (o >= 0 && o !== rule && (rules[o].state & ST_QUEUED) !== 0 && (rules[o].state & (ST_DEAD | ST_SUSPENDED)) === 0) {
        const e = pull(o, depth + 1);
        if (e !== OK) return e;
        const e2 = runQueued(o);
        if (e2 !== OK) return e2;
      }
    }
    return OK;
  };

  const abandon = (): void => {
    for (const phase of q) {
      for (const rule of phase) {
        const r = rules[rule];
        if (r === undefined) continue;
        r.state &= ~ST_QUEUED;
        if ((r.state & ST_DEAD) !== 0) freeRule(rule);
      }
      phase.length = 0;
    }
  };

  const settle = (): number => {
    if (flushing) return 0;
    pendingFlag[0] = 0; aborted = false;
    flushing = true;
    drain();
    let runs = 0, err = OK, bad = NONE, passes = 0;
    outer: for (;;) {
      stamp++;
      for (;;) {
        const phase = q[0].length > 0 ? 0 : (q[1].length > 0 ? 1 : -1);
        if (phase < 0) break;
        const rule = q[phase].shift()!;
        runs++;
        err = runQueued(rule);
        if (err !== OK) { bad = rule; break outer; }
        if (aborted) { err = ERR_ABORT; bad = rule; break outer; }
      }
      if (aborted) { err = ERR_ABORT; break outer; }
      if (!host.afterSteps()) {
        if (aborted) { err = ERR_ABORT; break outer; }
        const fired = host.fireChanges();
        drain();
        if (!fired && q[0].length === 0 && q[1].length === 0) break;
        if (aborted) { err = ERR_ABORT; break outer; }
        if (++passes > AFTER_LIMIT) { err = ERR_AFTER; break outer; }
        continue;
      }
      drain();
      if (++passes > AFTER_LIMIT) { err = ERR_AFTER; break outer; }
    }
    flushing = false; aborted = false;
    abandon();
    host.endChain();
    if (err !== OK) { host.error(err, bad); return err; }
    return runs;
  };

  const addCellAt = (kind: number, structural: boolean): number => {
    let id: number;
    const reused = cellFree.pop();
    if (reused !== undefined) id = reused;
    else { id = ncells++; grow(ncells); }
    kindOf[id] = (kind & 0x7f) | (structural ? 0x80 : 0);
    ownerOf[id] = -1; setFlag[id] = 0; dirtyFlag[id] = 0; kdirtyFlag[id] = 0;
    cellDyn[id] = NONE; markOf[id] = 0; subs[id] = null; table[id] = 0;
    return id;
  };

  const self: Kernel = {
    table, active, capacity,
    cells: () => ncells,
    rules: () => rules.length,
    write: (cell, v) => {
      drainTrack();
      if (cell >= ncells) return ERR_BAD;
      const owner = ownerOf[cell];
      if (owner >= 0) {
        if ((rules[owner].flags & F_YIELDING) === 0) return ERR_OWNED;
        dispose(owner);
        ownerOf[cell] = -1;
      }
      setFlag[cell] = 1;
      const r = setValue(cell, v);
      if (r === OK) unkdirty(cell);
      return r;
    },
    set: (cell, v) => { drainTrack(); const r = setValue(cell, v); if (r === OK && cell < ncells) unkdirty(cell); return r; },
    touch: (cell) => { drainTrack(); if (cell < ncells) wake(cell); },
    isSet: (cell) => cell < ncells && setFlag[cell] === 1,
    own: (cell, rule) => {
      if (cell >= ncells || rules[rule] === undefined) return ERR_BAD;
      const prior = ownerOf[cell];
      if (prior >= 0 && (rules[prior].flags & F_YIELDING) !== 0) dispose(prior);
      else if (prior >= 0) return ERR_BOUND;
      ownerOf[cell] = rule;
      rules[rule].owns = cell;
      return OK;
    },
    release: (cell, rule) => { if (cell < ncells && ownerOf[cell] === rule) ownerOf[cell] = -1; },
    owner: (cell) => (cell < ncells ? ownerOf[cell] : -1),
    run: (rule) => {
      if (rules[rule] === undefined) return ERR_BAD;
      drain();
      const e = pull(rule, 0);
      if (e !== OK) return e;
      return run(rule);
    },
    invalidate: (rule) => { drainTrack(); if (rules[rule] !== undefined) invalidate(rule, NONE); },
    dispose,
    suspend: (rule) => {
      const r = rules[rule];
      if (r === undefined) return;
      r.state |= ST_SUSPENDED; r.state &= ~ST_QUEUED;
      unlinkAll(rule);
      r.state |= ST_REWIRE;
    },
    resume: (rule) => {
      const r = rules[rule];
      if (r === undefined) return ERR_BAD;
      if ((r.state & ST_SUSPENDED) === 0) return OK;
      r.state &= ~ST_SUSPENDED;
      return run(rule);
    },
    track: trackCell,
    settle,
    pending: () => pendingFlag[0] === 1,
    dirty: () => {
      const out = new Uint32Array(dirtyList.length);
      for (let i = 0; i < dirtyList.length; i++) { out[i] = dirtyList[i]; dirtyFlag[dirtyList[i]] = 0; }
      dirtyList.length = 0;
      return out;
    },
    kdirty: () => {
      const out = new Uint32Array(kdirtyList.length);
      for (let i = 0; i < kdirtyList.length; i++) { out[i] = kdirtyList[i]; kdirtyFlag[kdirtyList[i]] = 0; }
      kdirtyList.length = 0;
      return out;
    },
    onGrow: (cb) => { onGrowCb = cb; },
    addCell: (kind, structural) => addCellAt(kind, structural),
    addCells: (n) => {
      if (n === 0) return ERR_BAD;
      const base = ncells;
      ncells += n;
      grow(ncells);
      for (let id = base; id < base + n; id++) {
        kindOf[id] = F64; ownerOf[id] = -1; setFlag[id] = 0; dirtyFlag[id] = 0; kdirtyFlag[id] = 0;
        cellDyn[id] = NONE; markOf[id] = 0; subs[id] = null; table[id] = 0;
      }
      return base;
    },
    clearCells: (base, n) => {
      if (base + n > ncells) return;
      for (let cell = base; cell < base + n; cell++) {
        const set = subs[cell];
        if (set !== null && set !== undefined) {
          for (const rule of set) { const r = rules[rule]; if (r !== undefined) { r.fixed = r.fixed.filter((c) => c !== cell); r.found = r.found.filter((c) => c !== cell); } }
          set.clear();
        }
        subs[cell] = null; cellDyn[cell] = NONE; markOf[cell] = 0;
        ownerOf[cell] = -1; setFlag[cell] = 0; table[cell] = 0;
      }
    },
    freeCell: (cell) => {
      if (cell >= ncells) return;
      const set = subs[cell];
      if (set !== null && set !== undefined) {
        for (const rule of set) { const r = rules[rule]; if (r !== undefined) { r.fixed = r.fixed.filter((c) => c !== cell); r.found = r.found.filter((c) => c !== cell); } }
        set.clear();
      }
      subs[cell] = null; cellDyn[cell] = NONE; markOf[cell] = 0; dirtyFlag[cell] = 0;
      cellFree.push(cell);
    },
    ring, ringCount, ringCap,
    trackRing, trackCount, trackCap,
    stateOf: (rule) => (rules[rule]?.state ?? ST_DEAD),
    state: (rule) => (rules[rule]?.state ?? ST_DEAD),
    pendingFlag,
    listened: (cell) => cell < ncells && subs[cell] !== null && (subs[cell] as Set<number>).size > 0,
    flush: () => { drainTrack(); drain(); },
    deps: (rule) => { const r = rules[rule]; return r === undefined ? [] : edgesOf(r).slice(); },
    abort: () => { aborted = true; },
    rewire: (rule, edges) => {
      const r = rules[rule];
      if (r === undefined || (r.state & ST_DEAD) !== 0) return ERR_BAD;
      unlinkAll(rule);
      serial++; r.serial = serial;
      for (let i = 0; i < edges.length; i++) {
        const cell = edges[i];
        if (cell >= ncells) return ERR_BAD;
        link(rule, cell, false);
      }
      r.state &= ~ST_REWIRE;
      return OK;
    },
    addRule: (target, kind, flags, edges, body = 0) => {
      if (target >= ncells) return ERR_BAD;
      const r: JsRule = {
        target, kind, flags, state: 0, phase: (flags & F_PHASE1) !== 0 ? 1 : 0,
        code0: 0, ncode: 0, body, elem: NONE,
        stamp: 0, runs: 0, serial: 0, owns: -1, fixed: [], found: [],
      };
      let id: number;
      const reused = ruleFree.pop();
      if (reused !== undefined) { id = reused; rules[id] = r; } else { id = rules.length; rules.push(r); }
      for (let i = 0; i < edges.length; i++) {
        const cell = edges[i];
        if (cell >= ncells) { r.state |= ST_DEAD; return ERR_BAD; }
        link(id, cell, false);
      }
      return id;
    },
    addExprRule: (target, flags, edges, codeOffset, ncode) => {
      const id = self.addRule(target, K_EXPR, flags, edges, 0);
      if (id >= 0) { rules[id].code0 = codeOffset; rules[id].ncode = ncode; }
      return id;
    },
    addCode: (words) => {
      const at = code.length;
      for (let i = 0; i < words.length; i++) code.push(words[i]);
      return at;
    },
    addConst: (v) => { consts.push(v); return consts.length - 1; },
    // ── the built-in VIEW rules: not implemented here, and DECLINED rather than
    // faked. The runtime tests these results and falls back to deriving
    // visibility and auto-extent in JavaScript, the same path it takes with no
    // kernel at all (view.ts installKernelVis / installKernelExtent).
    viewLayout: () => { /* nothing to tell: there is no view table here */ },
    viewDprCell: () => { /* as above */ },
    viewAdd: () => -1,
    viewParent: () => { /* no view table */ },
    viewRemove: () => { /* no view table */ },
    visAdd: () => -1,
    visRewire: () => ERR_BAD,
    extentAdd: () => -1,
    extentRewire: () => ERR_BAD,
  };
  return self;
}
