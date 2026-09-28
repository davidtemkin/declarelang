// kernel-js — THE REACTIVE KERNEL IN JAVASCRIPT, a second implementation of the
// same ABI the C kernel implements (kernel-loader.ts `Kernel`).
//
// WHY A SECOND ONE (DT, 2026-09-17): the C kernel is the only implementation of
// its mechanisms, and "whatever the C does" is not a specification — it has had
// weeks of use where the constraint core it replaced has had years. Two
// implementations of one written contract can disagree, and a disagreement is a
// question worth answering; one implementation can only be believed. It also
// pays three times over: a production build can carry it instead of the
// WebAssembly one (`declarec --kernel=js`: a smaller download, the same results),
// a host without WebAssembly still runs, and a defect is legible in a debugger.
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
// THE SAME LAYOUT AS THE C: rules are columns of typed arrays (kernel.c's Rule
// records), and every read is a pool node on its cell's list (subscription
// order) and its rule's list (newest first) — kernel.c's Node. No per-rule or
// per-cell objects, and nothing in a table is written until it is used, so the
// capacity reserved up front costs no memory.
//
// THE BUILT-IN VIEW RULES are here too: the view table, the visibility rule and
// the auto-extent rule, with kernel.c's arithmetic (Math.* where the C has
// dk_tan/dk_cos/dk_sin). test/kernel-conformance.test.mjs drives both kernels
// through random view trees and compares every output.
import type { Kernel, KernelCaps, KernelHost } from "./kernel-loader.js";

// cell kinds (declare_kernel.h)
const F64 = 0, REF = 1;
// rule kinds
const K_EXPR = 0, K_BODY = 1, K_DYNAMIC = 2, K_VIS = 3, K_EXTENT = 4;
// rule flags
const F_YIELDING = 1, F_PHASE1 = 2, F_PERCENT = 4;
// rule states
const ST_QUEUED = 1, ST_DEAD = 2, ST_SUSPENDED = 4, ST_REWIRE = 8, ST_UNLANDED = 16;
// errors
/** the track ring's owner mark (declare_kernel.h DK_TRACK_OWNER / DK_TRACK_NOBODY) */
const TRACK_OWNER = 0x80000000, TRACK_NOBODY = 0x7fffffff;
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

export function instantiateKernelJS(host: KernelHost, caps: KernelCaps = {}): Kernel {
  const ringCap = caps.ring ?? 1 << 14;
  const trackCap = caps.track_ring ?? 1 << 14;
  // THE OPENING CAPACITIES are the ones every kernel opens at (reactive.ts
  // DEFAULT_CAPS). Typed arrays are allocated, not written, so the reserve costs
  // no memory until it is used; every table doubles on demand (grow, growRules,
  // allocEdge), so none of them is a ceiling.
  let capacity = Math.max(1024, caps.extra_cells ?? 1 << 16);

  let table = new Float64Array(capacity);
  let kindOf = new Uint8Array(capacity);          // low 7 bits kind, 0x80 structural
  // OWNER + 1, so 0 means none and a fresh table needs no fill: memory that is
  // reserved but never written stays out of the page's footprint
  let ownerOf = new Int32Array(capacity);
  let setFlag = new Uint8Array(capacity);
  let dirtyFlag = new Uint8Array(capacity);
  let kdirtyFlag = new Uint8Array(capacity);
  let markOf = new Uint32Array(capacity);
  /** cell → the rules that read it: a doubly linked list of pool edges per cell
   *  (head/tail are edge + 1, 0 = none), in subscription order. Each rule keeps
   *  the edge ids beside its cells, so unlinking is O(1) with no per-cell object.
   *  A repeat link is a second edge; invalidate is idempotent, so a wake is the same. */
  let cellHead = new Uint32Array(capacity), cellTail = new Uint32Array(capacity);
  let edgeCap = Math.max(1024, caps.dyn_edges ?? 1 << 14);
  /** A NODE is one read — kernel.c's `Node {rule, cell, next_cell, prev_cell, next_rule}`:
   *  on its cell's subscriber list (doubly linked, subscription order) and on its
   *  rule's read list (singly linked, NEWEST FIRST). Links are node + 1, 0 = none. */
  let eRule = new Int32Array(edgeCap), eCell = new Uint32Array(edgeCap), eNext = new Uint32Array(edgeCap), ePrev = new Uint32Array(edgeCap), eNextRule = new Uint32Array(edgeCap);
  let edgeCount = 0, edgeFree = 0;   // edgeFree = edge + 1 of the first free edge (0 = none), linked through eNext

  const ownerGet = (cell: number): number => ownerOf[cell] - 1;
  const ownerSet = (cell: number, rule: number): void => { ownerOf[cell] = rule + 1; };
  const ring = new Uint32Array(ringCap), ringCount = new Uint32Array(1);
  const trackRing = new Uint32Array(trackCap), trackCount = new Uint32Array(1);
  const active = new Int32Array(1).fill(-1);
  const pendingFlag = new Int32Array(1);

  // ── THE RULES, as columns (kernel.c's Rule records, one typed array per field) ──
  let ruleCap = Math.max(1024, caps.extra_rules ?? 1024), nrules = 0;
  let rTarget = new Int32Array(ruleCap), rElem = new Uint32Array(ruleCap), rOwns = new Int32Array(ruleCap);
  let rKind = new Uint8Array(ruleCap), rFlags = new Uint8Array(ruleCap), rState = new Uint8Array(ruleCap), rPhase = new Uint8Array(ruleCap);
  let rCode0 = new Uint32Array(ruleCap), rNcode = new Uint32Array(ruleCap), rBody = new Uint32Array(ruleCap);
  let rStamp = new Uint32Array(ruleCap), rRuns = new Uint32Array(ruleCap), rSerial = new Uint32Array(ruleCap);
  let rDynHead = new Uint32Array(ruleCap);   // node + 1 of the newest read (0 = none)
  const growRules = (): void => {
    const cap = ruleCap * 2;
    const g = <T extends Int32Array | Uint32Array | Uint8Array>(a: T): T => { const b = new (a.constructor as new (n: number) => T)(cap); b.set(a); return b; };
    rTarget = g(rTarget); rElem = g(rElem); rOwns = g(rOwns); rKind = g(rKind); rFlags = g(rFlags); rState = g(rState); rPhase = g(rPhase);
    rCode0 = g(rCode0); rNcode = g(rNcode); rBody = g(rBody); rStamp = g(rStamp); rRuns = g(rRuns); rSerial = g(rSerial); rDynHead = g(rDynHead);
    ruleCap = cap;
  };
  const known = (rule: number): boolean => rule >= 0 && rule < nrules;
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
    const o = new Int32Array(cap); o.set(ownerOf); ownerOf = o;
    const s = new Uint8Array(cap); s.set(setFlag); setFlag = s;
    const d = new Uint8Array(cap); d.set(dirtyFlag); dirtyFlag = d;
    const kd = new Uint8Array(cap); kd.set(kdirtyFlag); kdirtyFlag = kd;
    const ch = new Uint32Array(cap); ch.set(cellHead); cellHead = ch;
    const ct = new Uint32Array(cap); ct.set(cellTail); cellTail = ct;
    const m = new Uint32Array(cap); m.set(markOf); markOf = m;
    capacity = cap;
    self.table = table; self.capacity = cap;
    onGrowCb?.();
  };

  // ── subscription ──────────────────────────────────────────────────────────
  const allocEdge = (): number => {
    if (edgeFree !== 0) { const e = edgeFree - 1; edgeFree = eNextRule[e]; return e; }
    if (edgeCount === edgeCap) {
      const cap = edgeCap * 2;
      const r = new Int32Array(cap); r.set(eRule); eRule = r;
      const c = new Uint32Array(cap); c.set(eCell); eCell = c;
      const n = new Uint32Array(cap); n.set(eNext); eNext = n;
      const pv = new Uint32Array(cap); pv.set(ePrev); ePrev = pv;
      const nr = new Uint32Array(cap); nr.set(eNextRule); eNextRule = nr;
      edgeCap = cap;
    }
    return edgeCount++;
  };
  /** take a node out of its cell's list: O(1), both directions linked (kernel.c unlink_cell) */
  const unlinkCell = (e: number): void => {
    const cell = eCell[e], nx = eNext[e], pv = ePrev[e];
    if (pv !== 0) eNext[pv - 1] = nx; else cellHead[cell] = nx;
    if (nx !== 0) ePrev[nx - 1] = pv; else cellTail[cell] = pv;
  };
  const freeNode = (e: number): void => { eRule[e] = -1; eNextRule[e] = edgeFree; eNext[e] = 0; ePrev[e] = 0; edgeFree = e + 1; };
  /** kernel.c link: append to the cell's subscribers, PREPEND to the rule's reads */
  const link = (rule: number, cell: number): void => {
    const e = allocEdge();
    eRule[e] = rule; eCell[e] = cell; eNext[e] = 0;
    const tail = cellTail[cell];
    ePrev[e] = tail;
    if (tail !== 0) eNext[tail - 1] = e + 1; else cellHead[cell] = e + 1;
    cellTail[cell] = e + 1;
    eNextRule[e] = rDynHead[rule]; rDynHead[rule] = e + 1;
  };
  /** kernel.c free_cell's walk: every node on the cell leaves its rule's list and is freed */
  const detachCell = (cell: number): void => {
    for (let h = cellHead[cell]; h !== 0;) {
      const e = h - 1; h = eNext[e];
      const rule = eRule[e];
      if (known(rule)) {
        if (rDynHead[rule] === e + 1) rDynHead[rule] = eNextRule[e];
        else for (let p = rDynHead[rule]; p !== 0; p = eNextRule[p - 1]) if (eNextRule[p - 1] === e + 1) { eNextRule[p - 1] = eNextRule[e]; break; }
      }
      freeNode(e);
    }
    cellHead[cell] = 0; cellTail[cell] = 0;
  };
  /** a rule's reads, newest first (kernel_deps) */
  const readsOf = (rule: number): number[] => {
    const out: number[] = [];
    for (let h = rDynHead[rule]; h !== 0; h = eNextRule[h - 1]) out.push(eCell[h - 1]);
    return out;
  };
  const unlinkAll = (rule: number): void => {
    for (let h = rDynHead[rule]; h !== 0;) { const e = h - 1; h = eNextRule[e]; unlinkCell(e); freeNode(e); }
    rDynHead[rule] = 0;
  };

  const trackCell = (cell: number): number => (active[0] < 0 ? OK : trackFor(active[0], cell));
  const trackFor = (a: number, cell: number): number => {
    if (!known(a) || cell >= ncells) return OK;
    const s = rSerial[a];
    if (markOf[cell] === s) return OK;   // one read per run, however many times the body asks
    markOf[cell] = s;
    link(a, cell);
    return OK;
  };

  // ── the scheduler ─────────────────────────────────────────────────────────
  const enqueue = (rule: number): void => {
    q[rPhase[rule]].push(rule);
    if (!flushing && pendingFlag[0] === 0) { pendingFlag[0] = 1; host.schedule(); }
  };
  const invalidate = (rule: number, fromCell: number): void => {
    if (fromCell !== NONE && (kindOf[fromCell] & 0x80) !== 0) rState[rule] |= ST_REWIRE;
    if ((rState[rule] & (ST_QUEUED | ST_DEAD | ST_SUSPENDED | ST_UNLANDED)) !== 0) return;
    rState[rule] |= ST_QUEUED;
    enqueue(rule);
  };
  const wake = (cell: number): void => {
    if (cell >= ncells) return;
    // next is read before invalidate, which only queues (it never relinks)
    for (let h = cellHead[cell]; h !== 0;) { const e = h - 1; h = eNext[e]; invalidate(eRule[e], cell); }
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
  // the reads before an owner mark go to the rule it names; after the last mark, to the active rule
  const drainTrack = (): void => {
    const n = Math.min(trackCount[0], trackCap);
    if (n === 0) return;
    trackCount[0] = 0;
    let from = 0;
    for (let i = 0; i <= n; i++) {
      let owner: number;
      if (i === n) owner = active[0];
      else if ((trackRing[i] & TRACK_OWNER) !== 0) owner = trackRing[i] & TRACK_NOBODY;
      else continue;
      if (owner >= 0) for (let j = from; j < i; j++) trackFor(owner, trackRing[j]);
      from = i + 1;
    }
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
    if (!known(rule) || (rState[rule] & ST_DEAD) !== 0) return;
    rState[rule] |= ST_DEAD;
    unlinkAll(rule);
    const owns = rOwns[rule];
    if (owns >= 0 && ownerGet(owns) === rule) ownerSet(owns, -1);
    rOwns[rule] = -1;
    if ((rState[rule] & ST_QUEUED) === 0) freeRule(rule);
  };

  const evalExpr = (rule: number): number => {
    const st: number[] = [];
    let c = rCode0[rule];
    const end = rCode0[rule] + rNcode[rule];
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

  const apply = (rule: number, v: number): void => {
    const cell = rTarget[rule];
    if (cell < 0) return;                        // the host applied it itself
    if ((kindOf[cell] & 0x7f) === REF) { if (v !== 0) wake(cell); return; }
    setValue(cell, v);
  };

  const run = (rule: number): number => {
    if (!known(rule)) return ERR_BAD;
    let v = 0;
    drainTrack();   // reads appended by whatever is active now link to IT, before we switch
    drain();        // host writes since the last drain wake their dependents first
    switch (rKind[rule]) {
      case K_EXPR: v = evalExpr(rule); break;
      case K_BODY: v = host.body(rule, rElem[rule], rTarget[rule]); break;
      case K_DYNAMIC: {
        unlinkAll(rule);
        serial++; if (serial === 0) serial++;    // 0 means "never"
        rSerial[rule] = serial;
        const prev = active[0];
        active[0] = rule;
        v = host.body(rule, rElem[rule], rTarget[rule]);
        drainTrack();                            // the reads the body appended while it ran
        active[0] = prev;
        break;
      }
      case K_VIS: v = visRun(rule); break;
      case K_EXTENT: v = extentRun(rule); break;
      default: return ERR_BAD;
    }
    rState[rule] &= ~(ST_REWIRE | ST_UNLANDED);
    apply(rule, v);
    drain();                                     // …and the body's writes wake theirs
    return OK;
  };

  const runQueued = (rule: number): number => {
    if (!known(rule) || (rState[rule] & ST_QUEUED) === 0) return OK;   // a stale entry: the pull ran it
    rState[rule] &= ~ST_QUEUED;
    if ((rState[rule] & ST_DEAD) !== 0) { freeRule(rule); return OK; }
    if ((rState[rule] & ST_SUSPENDED) !== 0) return OK;
    if (rStamp[rule] !== stamp) { rStamp[rule] = stamp; rRuns[rule] = 0; }
    if (++rRuns[rule] > CYCLE_LIMIT) return ERR_CYCLE;
    return run(rule);
  };

  /** Run the queued owners of this rule's inputs first — see the header. */
  const pull = (rule: number, depth: number): number => {
    if (depth > 64) return OK;
    if (!known(rule)) return OK;
    for (const cell of readsOf(rule)) {
      const o = ownerGet(cell);
      if (o >= 0 && o !== rule && (rState[o] & ST_QUEUED) !== 0 && (rState[o] & (ST_DEAD | ST_SUSPENDED)) === 0) {
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
        if (!known(rule)) continue;
        rState[rule] &= ~ST_QUEUED;
        if ((rState[rule] & ST_DEAD) !== 0) freeRule(rule);
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
    ownerOf[id] = 0; setFlag[id] = 0; dirtyFlag[id] = 0; kdirtyFlag[id] = 0;
    markOf[id] = 0; cellHead[id] = 0; cellTail[id] = 0; table[id] = 0;
    return id;
  };

  // ── the view table and the two built-in view rules ───────────────────────
  // The same arithmetic as kernel.c's vis_run / extent_run (and so as view.ts's
  // readVisibility and the JavaScript auto-extent): the affine walk up the
  // parent chain, the scroll offsets, the intersection with the root's frame;
  // and the maximum over the children's footprints. Math.* where the C has its
  // own dk_tan/dk_cos/dk_sin, which is what the JavaScript fallbacks use.
  let vl: Record<string, number> | null = null;
  let dprCell = NONE;
  const elemBase: number[] = [], elemParent: number[] = [];
  let viewFree = NONE;
  const VS = (view: number, field: string): number => table[elemBase[view] + (vl as Record<string, number>)[field]];
  const VB = (base: number, field: string): number => table[base + (vl as Record<string, number>)[field]];
  const setField = (base: number, field: string, v: number): void => { setValue(base + (vl as Record<string, number>)[field], v); };
  const DEG = Math.PI / 180;
  /** localAffine by block base; null when identity */
  const ownAffine = (base: number): number[] | null => {
    const sc = VB(base, "scale"), sx = VB(base, "scaleX"), sy = VB(base, "scaleY"), rot = VB(base, "rotation"), kx = VB(base, "skewX"), ky = VB(base, "skewY");
    if (sc === 1 && sx === 1 && sy === 1 && rot === 0 && kx === 0 && ky === 0) return null;
    const px = VB(base, "pivotX"), py = VB(base, "pivotY");
    const SX = sc * sx, SY = sc * sy;
    const tkx = Math.tan(kx * DEG), tky = Math.tan(ky * DEG);
    const r = rot * DEG, cr = Math.cos(r), sr = Math.sin(r);
    const a0 = SX, b0 = tky * SX, c0 = tkx * SY, d0 = SY;
    const a = cr * a0 - sr * b0, b = sr * a0 + cr * b0;
    const c = cr * c0 - sr * d0, d = sr * c0 + cr * d0;
    return [a, b, c, d, px - (a * px + c * py), py - (b * px + d * py)];
  };
  const compose = (m1: number[], m2: number[]): number[] => [
    m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
  const liveView = (v: number): boolean => v !== NONE && v < elemBase.length && elemBase[v] !== NONE;

  const visRun = (rule: number): number => {
    const selfView = rBody[rule], root = rElem[rule];
    if (vl === null || !liveView(selfView)) return 0;
    const b = elemBase[selfView];
    const dpr = dprCell !== NONE && dprCell < ncells ? table[dprCell] : 1;
    for (let n = selfView; n !== NONE; n = elemParent[n]) {
      if (VS(n, "rotateX") !== 0 || VS(n, "rotateY") !== 0 || VS(n, "translateZ") !== 0) { setField(b, "visMode", 0); return 0; }
    }
    let m = [1, 0, 0, 1, 0, 0];
    for (let n = selfView; n !== NONE;) {
      const p = elemParent[n];
      const own = ownAffine(elemBase[n]);
      if (own !== null) m = compose(own, m);
      m = compose([1, 0, 0, 1, VS(n, "x"), VS(n, "y")], m);
      if (p === NONE) break;
      if (VS(p, "scrollsOn") !== 0 && VS(n, "ignoreScroll") === 0) m = compose([1, 0, 0, 1, -VS(p, "scrollX"), -VS(p, "scrollY")], m);
      n = p;
    }
    const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    let on = true;
    for (let n = selfView; n !== NONE; n = elemParent[n]) if (VS(n, "visible") === 0) { on = false; break; }
    if (on) {
      const w = VS(selfView, "width"), h = VS(selfView, "height");
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const pxs = [0, w, 0, w], pys = [0, 0, h, h];
      for (let i = 0; i < 4; i++) {
        const fx = m[0] * pxs[i] + m[2] * pys[i] + m[4], fy = m[1] * pxs[i] + m[3] * pys[i] + m[5];
        if (fx < minX) minX = fx; if (fx > maxX) maxX = fx;
        if (fy < minY) minY = fy; if (fy > maxY) maxY = fy;
      }
      const bx = minX, by = minY, bw = maxX - minX, bh = maxY - minY;
      const rw = root < elemBase.length && elemBase[root] !== NONE ? VS(root, "width") : 0;
      const rh = root < elemBase.length && elemBase[root] !== NONE ? VS(root, "height") : 0;
      const ix = bx > 0 ? bx : 0, iy = by > 0 ? by : 0;
      const iw = (bx + bw < rw ? bx + bw : rw) - ix, ih = (by + bh < rh ? by + bh : rh) - iy;
      if (iw <= 0 || ih <= 0) on = false;
      else {
        const kk = scale === 0 ? 1 : scale;
        setField(b, "visX", (ix - bx) / kk); setField(b, "visY", (iy - by) / kk);
        setField(b, "visW", iw / kk); setField(b, "visH", ih / kk);
      }
    }
    if (!on) { setField(b, "visX", 0); setField(b, "visY", 0); setField(b, "visW", 0); setField(b, "visH", 0); }
    setField(b, "visOn", on ? 1 : 0);
    setField(b, "visScale", scale * dpr);
    setField(b, "visMode", 1);
    return 0;
  };
  const VIS_FIELDS = ["x", "y", "visible", "scale", "scaleX", "scaleY", "rotation", "skewX", "skewY",
    "pivotX", "pivotY", "scrollX", "scrollY", "ignoreScroll", "scrollsOn", "rotateX", "rotateY", "translateZ"];
  const linkChecked = (rule: number, cell: number): number => { if (cell >= ncells) return ERR_BAD; link(rule, cell); return OK; };
  const visLinkChain = (rule: number, selfView: number, root: number): number => {
    const L = vl as Record<string, number>;
    for (let n = selfView; n !== NONE; n = elemParent[n]) {
      if (elemBase[n] === NONE) break;
      for (const f of VIS_FIELDS) { const e = linkChecked(rule, elemBase[n] + L[f]); if (e !== OK) return e; }
    }
    let e = linkChecked(rule, elemBase[selfView] + L.width); if (e !== OK) return e;
    e = linkChecked(rule, elemBase[selfView] + L.height); if (e !== OK) return e;
    if (root < elemBase.length && elemBase[root] !== NONE) {
      e = linkChecked(rule, elemBase[root] + L.width); if (e !== OK) return e;
      e = linkChecked(rule, elemBase[root] + L.height); if (e !== OK) return e;
    }
    if (dprCell !== NONE) { e = linkChecked(rule, dprCell); if (e !== OK) return e; }
    return OK;
  };

  const EXTENT_FIELDS = ["x", "y", "width", "height", "visible", "ignoreClip", "scale", "scaleX", "scaleY",
    "rotation", "skewX", "skewY", "pivotX", "pivotY", "rotateX", "rotateY", "translateZ"];
  const extentStore = (rule: number, words: ArrayLike<number>): void => {
    const n = words.length;
    if (n > rNcode[rule]) {
      const cap = n * 2 > 8 ? n * 2 : 8;
      rCode0[rule] = code.length; rNcode[rule] = cap;
      for (let i = 0; i < cap; i++) code.push(0);
    }
    for (let i = 0; i < n; i++) code[rCode0[rule] + i] = words[i];
    rBody[rule] = n;
  };
  const extentLink = (rule: number): number => {
    const w0 = rCode0[rule], n = rBody[rule];
    if (n === 0) return OK;
    if (code[w0] !== NONE && code[w0] < ncells) link(rule, code[w0]);
    const L = vl as Record<string, number>;
    for (let i = 1; i < n; i++) for (const f of EXTENT_FIELDS) { const e = linkChecked(rule, code[w0 + i] + L[f]); if (e !== OK) return e; }
    return OK;
  };
  const percentOwned = (cell: number): boolean => {
    const o = cell < ncells ? ownerGet(cell) : -1;
    return o >= 0 && known(o) && (rFlags[o] & F_PERCENT) !== 0;
  };
  const extentRun = (rule: number): number => {
    const w0 = rCode0[rule], n = rBody[rule];
    const axis = rElem[rule];
    const L = vl as Record<string, number>;
    let max = 0;
    for (let i = 1; i < n; i++) {
      const base = code[w0 + i];
      if (VB(base, "visible") === 0 || VB(base, "ignoreClip") !== 0) continue;
      if (percentOwned(base + (axis === 0 ? L.x : L.y)) || percentOwned(base + (axis === 0 ? L.width : L.height))) continue;
      if (VB(base, "rotateX") !== 0 || VB(base, "rotateY") !== 0 || VB(base, "translateZ") !== 0) {
        host.decline(rule);                        // out of the plane: the host's footprint3D
        return rTarget[rule] >= 0 ? table[rTarget[rule]] : 0;
      }
      const wd = VB(base, "width"), ht = VB(base, "height");
      let lead = 0, ext = axis === 0 ? wd : ht;
      const m = ownAffine(base);
      if (m !== null) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const pxs = [0, wd, 0, wd], pys = [0, 0, ht, ht];
        for (let c = 0; c < 4; c++) {
          const fx = m[0] * pxs[c] + m[2] * pys[c] + m[4], fy = m[1] * pxs[c] + m[3] * pys[c] + m[5];
          if (fx < minX) minX = fx; if (fx > maxX) maxX = fx;
          if (fy < minY) minY = fy; if (fy > maxY) maxY = fy;
        }
        lead = axis === 0 ? minX : minY; ext = axis === 0 ? maxX - minX : maxY - minY;
      }
      const e = (axis === 0 ? VB(base, "x") : VB(base, "y")) + lead + ext;
      if (e > max) max = e;
    }
    return max;
  };

  const self: Kernel = {
    table, active, capacity,
    cells: () => ncells,
    tableSize: () => capacity,
    rules: () => nrules,
    write: (cell, v) => {
      drainTrack();
      if (cell >= ncells) return ERR_BAD;
      const owner = ownerGet(cell);
      if (owner >= 0) {
        if ((rFlags[owner] & F_YIELDING) === 0) return ERR_OWNED;
        dispose(owner);
        ownerSet(cell, -1);
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
      if (cell >= ncells || !known(rule)) return ERR_BAD;
      const prior = ownerGet(cell);
      if (prior >= 0 && (rFlags[prior] & F_YIELDING) !== 0) dispose(prior);
      else if (prior >= 0) return ERR_BOUND;
      ownerSet(cell, rule);
      rOwns[rule] = cell;
      return OK;
    },
    release: (cell, rule) => { if (cell < ncells && ownerGet(cell) === rule) ownerSet(cell, -1); },
    owner: (cell) => (cell < ncells ? ownerGet(cell) : -1),
    run: (rule) => {
      if (!known(rule)) return ERR_BAD;
      drain();
      const e = pull(rule, 0);
      if (e !== OK) return e;
      return run(rule);
    },
    invalidate: (rule) => { drainTrack(); if (known(rule)) invalidate(rule, NONE); },
    dispose,
    suspend: (rule) => {
      if (!known(rule)) return;
      rState[rule] |= ST_SUSPENDED; rState[rule] &= ~ST_QUEUED;
      // only a DYNAMIC rule's edges go (it re-tracks on every run); a static
      // rule keeps the compile's, which nothing would re-link (kernel.c)
      if (rKind[rule] === K_DYNAMIC) { unlinkAll(rule); rState[rule] |= ST_REWIRE; }
    },
    resume: (rule) => {
      if (!known(rule)) return ERR_BAD;
      if ((rState[rule] & ST_SUSPENDED) === 0) return OK;
      rState[rule] &= ~ST_SUSPENDED;
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
        kindOf[id] = F64; ownerOf[id] = 0; setFlag[id] = 0; dirtyFlag[id] = 0; kdirtyFlag[id] = 0;
        markOf[id] = 0; cellHead[id] = 0; cellTail[id] = 0; table[id] = 0;
      }
      return base;
    },
    clearCells: (base, n) => {
      if (base + n > ncells) return;
      for (let cell = base; cell < base + n; cell++) {
        detachCell(cell);
        markOf[cell] = 0; ownerOf[cell] = 0; setFlag[cell] = 0; table[cell] = 0;
      }
    },
    freeCell: (cell) => {
      if (cell >= ncells) return;
      detachCell(cell);
      markOf[cell] = 0; dirtyFlag[cell] = 0;
      cellFree.push(cell);
    },
    ring, ringCount, ringCap,
    trackRing, trackCount, trackCap,
    stateOf: (rule) => (known(rule) ? rState[rule] : ST_DEAD),
    state: (rule) => (known(rule) ? rState[rule] : ST_DEAD),
    pendingFlag,
    listened: (cell) => cell < ncells && cellHead[cell] !== 0,
    flush: () => { drainTrack(); drain(); },
    deps: (rule) => (known(rule) ? readsOf(rule) : []),
    abort: () => { aborted = true; },
    rewire: (rule, edges) => {
      if (!known(rule) || (rState[rule] & ST_DEAD) !== 0) return ERR_BAD;
      unlinkAll(rule);
      serial++; rSerial[rule] = serial;
      for (let i = 0; i < edges.length; i++) {
        const cell = edges[i];
        if (cell >= ncells) return ERR_BAD;
        link(rule, cell);
      }
      rState[rule] &= ~ST_REWIRE;
      return OK;
    },
    addRule: (target, kind, flags, edges, body = 0) => {
      if (target >= ncells) return ERR_BAD;
      let id: number;
      const reused = ruleFree.pop();
      if (reused !== undefined) id = reused;
      else { if (nrules === ruleCap) growRules(); id = nrules++; }
      rTarget[id] = target; rKind[id] = kind; rFlags[id] = flags; rState[id] = 0; rPhase[id] = (flags & F_PHASE1) !== 0 ? 1 : 0;
      rCode0[id] = 0; rNcode[id] = 0; rBody[id] = body; rElem[id] = NONE;
      rStamp[id] = 0; rRuns[id] = 0; rSerial[id] = 0; rOwns[id] = -1; rDynHead[id] = 0;
      for (let i = 0; i < edges.length; i++) {
        const cell = edges[i];
        if (cell >= ncells) { rState[id] |= ST_DEAD; return ERR_BAD; }
        link(id, cell);
      }
      return id;
    },
    addExprRule: (target, flags, edges, codeOffset, ncode) => {
      const id = self.addRule(target, K_EXPR, flags, edges, 0);
      if (id >= 0) { rCode0[id] = codeOffset; rNcode[id] = ncode; }
      return id;
    },
    addCode: (words) => {
      const at = code.length;
      for (let i = 0; i < words.length; i++) code.push(words[i]);
      return at;
    },
    addConst: (v) => { consts.push(v); return consts.length - 1; },
    // ── the built-in VIEW rules: the view table, visibility, auto-extent ────
    viewLayout: (layout) => { vl = { ...layout }; },
    viewDprCell: (cell) => { dprCell = cell; },
    viewAdd: (base, parent) => {
      let id: number;
      if (viewFree !== NONE) { id = viewFree; viewFree = elemParent[id]; }
      else { id = elemBase.length; elemBase.push(NONE); elemParent.push(NONE); }
      elemBase[id] = base; elemParent[id] = parent < 0 ? NONE : parent;
      return id;
    },
    viewParent: (view, parent) => { if (view < elemBase.length) elemParent[view] = parent < 0 ? NONE : parent; },
    viewRemove: (view) => {
      if (view >= elemBase.length) return;
      elemBase[view] = NONE; elemParent[view] = viewFree; viewFree = view;   // the parent slot doubles as the free link
    },
    visAdd: (view, root) => {
      if (vl === null || view >= elemBase.length) return ERR_BAD;
      const id = self.addRule(-1, K_VIS, 0, [], view);
      if (id < 0) return id;
      rElem[id] = root;
      const e = visLinkChain(id, view, root);
      if (e !== OK) { dispose(id); return e; }
      return id;
    },
    visRewire: (rule) => {
      if (!known(rule) || rKind[rule] !== K_VIS) return ERR_BAD;
      unlinkAll(rule);
      return visLinkChain(rule, rBody[rule], rElem[rule]);
    },
    extentAdd: (axis, target, words) => {
      if (vl === null || target >= ncells || words.length === 0) return ERR_BAD;
      const id = self.addRule(target, K_EXTENT, F_YIELDING, [], 0);
      if (id < 0) return id;
      rElem[id] = axis; extentStore(id, words);
      const e = extentLink(id);
      if (e !== OK) { dispose(id); return e; }
      return id;
    },
    extentRewire: (rule, words) => {
      if (!known(rule) || rKind[rule] !== K_EXTENT || words.length === 0) return ERR_BAD;
      unlinkAll(rule);
      extentStore(rule, words);
      return extentLink(rule);
    },
  };
  return self;
}
