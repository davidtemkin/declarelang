var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// runtime/dist/kernel-js.js
var F64 = 0;
var REF = 1;
var K_EXPR = 0;
var K_BODY = 1;
var K_DYNAMIC = 2;
var F_YIELDING = 1;
var F_PHASE1 = 2;
var ST_QUEUED = 1;
var ST_DEAD = 2;
var ST_SUSPENDED = 4;
var ST_REWIRE = 8;
var ST_UNLANDED = 16;
var OK = 0;
var ERR_OWNED = -3;
var ERR_CYCLE = -4;
var ERR_AFTER = -5;
var ERR_BOUND = -6;
var ERR_BAD = -8;
var ERR_ABORT = -9;
var CYCLE_LIMIT = 100;
var AFTER_LIMIT = 100;
var NONE = 4294967295;
var OP_END = 0;
var OP_LOAD = 1;
var OP_CONST = 2;
var OP_ADD = 3;
var OP_SUB = 4;
var OP_MUL = 5;
var OP_DIV = 6;
var OP_MOD = 7;
var OP_NEG = 8;
var OP_MIN = 9;
var OP_MAX = 10;
var OP_ABS = 11;
var OP_FLOOR = 12;
var OP_CEIL = 13;
var OP_ROUND = 14;
var OP_SQRT = 15;
var OP_LT = 16;
var OP_LE = 17;
var OP_GT = 18;
var OP_GE = 19;
var OP_EQ = 20;
var OP_NE = 21;
var OP_AND = 22;
var OP_OR = 23;
var OP_NOT = 24;
var OP_SELECT = 25;
var OP_CLAMP = 26;
var truthy = /* @__PURE__ */ __name((x) => x === x && x !== 0, "truthy");
function instantiateKernelJS(host, caps = {}) {
  const ringCap = caps.ring ?? 1 << 14;
  const trackCap = caps.track_ring ?? 1 << 14;
  let capacity = Math.max(1024, caps.extra_cells ?? 1 << 16);
  let table = new Float64Array(capacity);
  let kindOf = new Uint8Array(capacity);
  let ownerOf = new Int32Array(capacity).fill(-1);
  let setFlag = new Uint8Array(capacity);
  let dirtyFlag = new Uint8Array(capacity);
  let kdirtyFlag = new Uint8Array(capacity);
  let cellDyn = new Uint32Array(capacity).fill(NONE);
  let markOf = new Uint32Array(capacity);
  let subs = new Array(capacity).fill(null);
  const ring = new Uint32Array(ringCap), ringCount = new Uint32Array(1);
  const trackRing = new Uint32Array(trackCap), trackCount = new Uint32Array(1);
  const active = new Int32Array(1).fill(-1);
  const pendingFlag = new Int32Array(1);
  const rules = [];
  const consts = [];
  const code = [];
  let ncells = 0;
  const cellFree = [];
  const ruleFree = [];
  let serial = 0, stamp = 0;
  let flushing = false, aborted = false;
  const dirtyList = [], kdirtyList = [];
  const q = [[], []];
  let onGrowCb = null;
  const grow = /* @__PURE__ */ __name((need) => {
    if (need <= capacity)
      return;
    let cap = capacity;
    while (cap < need)
      cap *= 2;
    const t = new Float64Array(cap);
    t.set(table);
    table = t;
    const k2 = new Uint8Array(cap);
    k2.set(kindOf);
    kindOf = k2;
    const o = new Int32Array(cap).fill(-1);
    o.set(ownerOf);
    ownerOf = o;
    const s = new Uint8Array(cap);
    s.set(setFlag);
    setFlag = s;
    const d = new Uint8Array(cap);
    d.set(dirtyFlag);
    dirtyFlag = d;
    const kd = new Uint8Array(cap);
    kd.set(kdirtyFlag);
    kdirtyFlag = kd;
    const cd = new Uint32Array(cap).fill(NONE);
    cd.set(cellDyn);
    cellDyn = cd;
    const m = new Uint32Array(cap);
    m.set(markOf);
    markOf = m;
    subs.length = cap;
    capacity = cap;
    self.table = table;
    onGrowCb?.();
  }, "grow");
  const link = /* @__PURE__ */ __name((rule, cell, discovered) => {
    let set = subs[cell];
    if (set === null) {
      set = /* @__PURE__ */ new Set();
      subs[cell] = set;
    }
    set.add(rule);
    cellDyn[cell] = set.size === 0 ? NONE : 1;
    const r = rules[rule];
    if (discovered)
      r.found.unshift(cell);
    else
      r.fixed.push(cell);
  }, "link");
  const edgesOf = /* @__PURE__ */ __name((r) => r.fixed.length === 0 ? r.found : r.fixed.concat(r.found), "edgesOf");
  const unlinkAll = /* @__PURE__ */ __name((rule) => {
    const r = rules[rule];
    for (const cell of edgesOf(r)) {
      const set = subs[cell];
      if (set !== void 0 && set !== null) {
        set.delete(rule);
        if (set.size === 0)
          cellDyn[cell] = NONE;
      }
    }
    r.fixed.length = 0;
    r.found.length = 0;
  }, "unlinkAll");
  const trackCell = /* @__PURE__ */ __name((cell) => {
    const a = active[0];
    if (a < 0 || cell >= ncells)
      return OK;
    const s = rules[a].serial;
    if (markOf[cell] === s)
      return OK;
    markOf[cell] = s;
    link(a, cell, true);
    return OK;
  }, "trackCell");
  const enqueue = /* @__PURE__ */ __name((rule) => {
    q[rules[rule].phase].push(rule);
    if (!flushing && pendingFlag[0] === 0) {
      pendingFlag[0] = 1;
      host.schedule();
    }
  }, "enqueue");
  const invalidate = /* @__PURE__ */ __name((rule, fromCell) => {
    const r = rules[rule];
    if (fromCell !== NONE && (kindOf[fromCell] & 128) !== 0)
      r.state |= ST_REWIRE;
    if ((r.state & (ST_QUEUED | ST_DEAD | ST_SUSPENDED | ST_UNLANDED)) !== 0)
      return;
    r.state |= ST_QUEUED;
    enqueue(rule);
  }, "invalidate");
  const wake = /* @__PURE__ */ __name((cell) => {
    if (cell >= ncells)
      return;
    const set = subs[cell];
    if (set === null || set === void 0)
      return;
    for (const rule of Array.from(set))
      invalidate(rule, cell);
  }, "wake");
  const markDirty = /* @__PURE__ */ __name((cell) => {
    if (dirtyFlag[cell] === 0) {
      dirtyFlag[cell] = 1;
      dirtyList.push(cell);
    }
  }, "markDirty");
  const drain = /* @__PURE__ */ __name(() => {
    const n = Math.min(ringCount[0], ringCap);
    if (n === 0)
      return;
    ringCount[0] = 0;
    for (let i = 0; i < n; i++) {
      const cell = ring[i];
      if (cell >= ncells)
        continue;
      if ((kindOf[cell] & 127) === F64)
        markDirty(cell);
      wake(cell);
    }
  }, "drain");
  const drainTrack = /* @__PURE__ */ __name(() => {
    const n = Math.min(trackCount[0], trackCap);
    if (n === 0)
      return;
    trackCount[0] = 0;
    if (active[0] < 0)
      return;
    for (let i = 0; i < n; i++)
      trackCell(trackRing[i]);
  }, "drainTrack");
  const setValue = /* @__PURE__ */ __name((cell, v) => {
    if (cell >= ncells)
      return ERR_BAD;
    if ((kindOf[cell] & 127) !== F64) {
      wake(cell);
      return OK;
    }
    if (table[cell] === v)
      return OK;
    table[cell] = v;
    markDirty(cell);
    if (kdirtyFlag[cell] === 0) {
      kdirtyFlag[cell] = 1;
      kdirtyList.push(cell);
    }
    wake(cell);
    return OK;
  }, "setValue");
  const unkdirty = /* @__PURE__ */ __name((cell) => {
    if (kdirtyFlag[cell] === 1 && kdirtyList.length > 0 && kdirtyList[kdirtyList.length - 1] === cell) {
      kdirtyFlag[cell] = 0;
      kdirtyList.pop();
    }
  }, "unkdirty");
  const freeRule = /* @__PURE__ */ __name((rule) => {
    ruleFree.push(rule);
  }, "freeRule");
  const dispose = /* @__PURE__ */ __name((rule) => {
    const r = rules[rule];
    if (r === void 0 || (r.state & ST_DEAD) !== 0)
      return;
    r.state |= ST_DEAD;
    unlinkAll(rule);
    if (r.owns >= 0 && ownerOf[r.owns] === rule)
      ownerOf[r.owns] = -1;
    r.owns = -1;
    if ((r.state & ST_QUEUED) === 0)
      freeRule(rule);
  }, "dispose");
  const evalExpr = /* @__PURE__ */ __name((r) => {
    const st = [];
    let c = r.code0;
    const end = r.code0 + r.ncode;
    while (c < end) {
      const op = code[c++];
      switch (op) {
        case OP_END:
          c = end;
          break;
        case OP_LOAD: {
          const cell = code[c++];
          st.push(cell < ncells ? table[cell] : 0);
          break;
        }
        case OP_CONST: {
          const i = code[c++];
          st.push(i < consts.length ? consts[i] : 0);
          break;
        }
        case OP_ADD: {
          const b = st.pop(), a = st.pop();
          st.push(a + b);
          break;
        }
        case OP_SUB: {
          const b = st.pop(), a = st.pop();
          st.push(a - b);
          break;
        }
        case OP_MUL: {
          const b = st.pop(), a = st.pop();
          st.push(a * b);
          break;
        }
        case OP_DIV: {
          const b = st.pop(), a = st.pop();
          st.push(a / b);
          break;
        }
        case OP_MOD: {
          const b = st.pop(), a = st.pop();
          st.push(a - b * Math.trunc(a / b));
          break;
        }
        case OP_NEG:
          st.push(-st.pop());
          break;
        // min/max keep the C's NaN rule: NaN wins, and -0 vs 0 is not ordered
        case OP_MIN: {
          const b = st.pop(), a = st.pop();
          st.push(a < b ? a : b < a ? b : a !== a ? a : b);
          break;
        }
        case OP_MAX: {
          const b = st.pop(), a = st.pop();
          st.push(a > b ? a : b > a ? b : a !== a ? a : b);
          break;
        }
        case OP_ABS:
          st.push(Math.abs(st.pop()));
          break;
        case OP_FLOOR:
          st.push(Math.floor(st.pop()));
          break;
        case OP_CEIL:
          st.push(Math.ceil(st.pop()));
          break;
        case OP_ROUND:
          st.push(Math.floor(st.pop() + 0.5));
          break;
        // Math.round's rule, spelled out
        case OP_SQRT:
          st.push(Math.sqrt(st.pop()));
          break;
        case OP_LT: {
          const b = st.pop(), a = st.pop();
          st.push(a < b ? 1 : 0);
          break;
        }
        case OP_LE: {
          const b = st.pop(), a = st.pop();
          st.push(a <= b ? 1 : 0);
          break;
        }
        case OP_GT: {
          const b = st.pop(), a = st.pop();
          st.push(a > b ? 1 : 0);
          break;
        }
        case OP_GE: {
          const b = st.pop(), a = st.pop();
          st.push(a >= b ? 1 : 0);
          break;
        }
        case OP_EQ: {
          const b = st.pop(), a = st.pop();
          st.push(a === b ? 1 : 0);
          break;
        }
        case OP_NE: {
          const b = st.pop(), a = st.pop();
          st.push(a !== b ? 1 : 0);
          break;
        }
        case OP_AND: {
          const b = st.pop(), a = st.pop();
          st.push(truthy(a) && truthy(b) ? 1 : 0);
          break;
        }
        case OP_OR: {
          const b = st.pop(), a = st.pop();
          st.push(truthy(a) || truthy(b) ? 1 : 0);
          break;
        }
        case OP_NOT:
          st.push(truthy(st.pop()) ? 0 : 1);
          break;
        case OP_SELECT: {
          const b = st.pop(), a = st.pop(), cnd = st.pop();
          st.push(truthy(cnd) ? a : b);
          break;
        }
        case OP_CLAMP: {
          const hi = st.pop(), lo = st.pop(), x = st.pop();
          st.push(x < lo ? lo : x > hi ? hi : x);
          break;
        }
        default:
          c = end;
          break;
      }
    }
    return st.length > 0 ? st[st.length - 1] : 0;
  }, "evalExpr");
  const apply = /* @__PURE__ */ __name((r, v) => {
    if (r.target < 0)
      return;
    const cell = r.target;
    if ((kindOf[cell] & 127) === REF) {
      if (v !== 0)
        wake(cell);
      return;
    }
    setValue(cell, v);
  }, "apply");
  const run = /* @__PURE__ */ __name((rule) => {
    const r = rules[rule];
    if (r === void 0)
      return ERR_BAD;
    let v = 0;
    drainTrack();
    drain();
    switch (r.kind) {
      case K_EXPR:
        v = evalExpr(r);
        break;
      case K_BODY:
        v = host.body(rule, r.elem, r.target);
        break;
      case K_DYNAMIC: {
        unlinkAll(rule);
        serial++;
        if (serial === 0)
          serial++;
        r.serial = serial;
        const prev = active[0];
        active[0] = rule;
        v = host.body(rule, r.elem, r.target);
        drainTrack();
        active[0] = prev;
        break;
      }
      default:
        return ERR_BAD;
    }
    r.state &= ~(ST_REWIRE | ST_UNLANDED);
    apply(r, v);
    drain();
    return OK;
  }, "run");
  const runQueued = /* @__PURE__ */ __name((rule) => {
    const r = rules[rule];
    if (r === void 0 || (r.state & ST_QUEUED) === 0)
      return OK;
    r.state &= ~ST_QUEUED;
    if ((r.state & ST_DEAD) !== 0) {
      freeRule(rule);
      return OK;
    }
    if ((r.state & ST_SUSPENDED) !== 0)
      return OK;
    if (r.stamp !== stamp) {
      r.stamp = stamp;
      r.runs = 0;
    }
    if (++r.runs > CYCLE_LIMIT)
      return ERR_CYCLE;
    return run(rule);
  }, "runQueued");
  const pull = /* @__PURE__ */ __name((rule, depth) => {
    if (depth > 64)
      return OK;
    const r = rules[rule];
    if (r === void 0)
      return OK;
    for (const cell of edgesOf(r).slice()) {
      const o = ownerOf[cell];
      if (o >= 0 && o !== rule && (rules[o].state & ST_QUEUED) !== 0 && (rules[o].state & (ST_DEAD | ST_SUSPENDED)) === 0) {
        const e = pull(o, depth + 1);
        if (e !== OK)
          return e;
        const e2 = runQueued(o);
        if (e2 !== OK)
          return e2;
      }
    }
    return OK;
  }, "pull");
  const abandon = /* @__PURE__ */ __name(() => {
    for (const phase of q) {
      for (const rule of phase) {
        const r = rules[rule];
        if (r === void 0)
          continue;
        r.state &= ~ST_QUEUED;
        if ((r.state & ST_DEAD) !== 0)
          freeRule(rule);
      }
      phase.length = 0;
    }
  }, "abandon");
  const settle = /* @__PURE__ */ __name(() => {
    if (flushing)
      return 0;
    pendingFlag[0] = 0;
    aborted = false;
    flushing = true;
    drain();
    let runs = 0, err = OK, bad = NONE, passes = 0;
    outer: for (; ; ) {
      stamp++;
      for (; ; ) {
        const phase = q[0].length > 0 ? 0 : q[1].length > 0 ? 1 : -1;
        if (phase < 0)
          break;
        const rule = q[phase].shift();
        runs++;
        err = runQueued(rule);
        if (err !== OK) {
          bad = rule;
          break outer;
        }
        if (aborted) {
          err = ERR_ABORT;
          bad = rule;
          break outer;
        }
      }
      if (aborted) {
        err = ERR_ABORT;
        break outer;
      }
      if (!host.afterSteps()) {
        if (aborted) {
          err = ERR_ABORT;
          break outer;
        }
        const fired = host.fireChanges();
        drain();
        if (!fired && q[0].length === 0 && q[1].length === 0)
          break;
        if (aborted) {
          err = ERR_ABORT;
          break outer;
        }
        if (++passes > AFTER_LIMIT) {
          err = ERR_AFTER;
          break outer;
        }
        continue;
      }
      drain();
      if (++passes > AFTER_LIMIT) {
        err = ERR_AFTER;
        break outer;
      }
    }
    flushing = false;
    aborted = false;
    abandon();
    host.endChain();
    if (err !== OK) {
      host.error(err, bad);
      return err;
    }
    return runs;
  }, "settle");
  const addCellAt = /* @__PURE__ */ __name((kind, structural) => {
    let id;
    const reused = cellFree.pop();
    if (reused !== void 0)
      id = reused;
    else {
      id = ncells++;
      grow(ncells);
    }
    kindOf[id] = kind & 127 | (structural ? 128 : 0);
    ownerOf[id] = -1;
    setFlag[id] = 0;
    dirtyFlag[id] = 0;
    kdirtyFlag[id] = 0;
    cellDyn[id] = NONE;
    markOf[id] = 0;
    subs[id] = null;
    table[id] = 0;
    return id;
  }, "addCellAt");
  const self = {
    table,
    active,
    capacity,
    cells: /* @__PURE__ */ __name(() => ncells, "cells"),
    rules: /* @__PURE__ */ __name(() => rules.length, "rules"),
    write: /* @__PURE__ */ __name((cell, v) => {
      drainTrack();
      if (cell >= ncells)
        return ERR_BAD;
      const owner = ownerOf[cell];
      if (owner >= 0) {
        if ((rules[owner].flags & F_YIELDING) === 0)
          return ERR_OWNED;
        dispose(owner);
        ownerOf[cell] = -1;
      }
      setFlag[cell] = 1;
      const r = setValue(cell, v);
      if (r === OK)
        unkdirty(cell);
      return r;
    }, "write"),
    set: /* @__PURE__ */ __name((cell, v) => {
      drainTrack();
      const r = setValue(cell, v);
      if (r === OK && cell < ncells)
        unkdirty(cell);
      return r;
    }, "set"),
    touch: /* @__PURE__ */ __name((cell) => {
      drainTrack();
      if (cell < ncells)
        wake(cell);
    }, "touch"),
    isSet: /* @__PURE__ */ __name((cell) => cell < ncells && setFlag[cell] === 1, "isSet"),
    own: /* @__PURE__ */ __name((cell, rule) => {
      if (cell >= ncells || rules[rule] === void 0)
        return ERR_BAD;
      const prior = ownerOf[cell];
      if (prior >= 0 && (rules[prior].flags & F_YIELDING) !== 0)
        dispose(prior);
      else if (prior >= 0)
        return ERR_BOUND;
      ownerOf[cell] = rule;
      rules[rule].owns = cell;
      return OK;
    }, "own"),
    release: /* @__PURE__ */ __name((cell, rule) => {
      if (cell < ncells && ownerOf[cell] === rule)
        ownerOf[cell] = -1;
    }, "release"),
    owner: /* @__PURE__ */ __name((cell) => cell < ncells ? ownerOf[cell] : -1, "owner"),
    run: /* @__PURE__ */ __name((rule) => {
      if (rules[rule] === void 0)
        return ERR_BAD;
      drain();
      const e = pull(rule, 0);
      if (e !== OK)
        return e;
      return run(rule);
    }, "run"),
    invalidate: /* @__PURE__ */ __name((rule) => {
      drainTrack();
      if (rules[rule] !== void 0)
        invalidate(rule, NONE);
    }, "invalidate"),
    dispose,
    suspend: /* @__PURE__ */ __name((rule) => {
      const r = rules[rule];
      if (r === void 0)
        return;
      r.state |= ST_SUSPENDED;
      r.state &= ~ST_QUEUED;
      unlinkAll(rule);
      r.state |= ST_REWIRE;
    }, "suspend"),
    resume: /* @__PURE__ */ __name((rule) => {
      const r = rules[rule];
      if (r === void 0)
        return ERR_BAD;
      if ((r.state & ST_SUSPENDED) === 0)
        return OK;
      r.state &= ~ST_SUSPENDED;
      return run(rule);
    }, "resume"),
    track: trackCell,
    settle,
    pending: /* @__PURE__ */ __name(() => pendingFlag[0] === 1, "pending"),
    dirty: /* @__PURE__ */ __name(() => {
      const out = new Uint32Array(dirtyList.length);
      for (let i = 0; i < dirtyList.length; i++) {
        out[i] = dirtyList[i];
        dirtyFlag[dirtyList[i]] = 0;
      }
      dirtyList.length = 0;
      return out;
    }, "dirty"),
    kdirty: /* @__PURE__ */ __name(() => {
      const out = new Uint32Array(kdirtyList.length);
      for (let i = 0; i < kdirtyList.length; i++) {
        out[i] = kdirtyList[i];
        kdirtyFlag[kdirtyList[i]] = 0;
      }
      kdirtyList.length = 0;
      return out;
    }, "kdirty"),
    onGrow: /* @__PURE__ */ __name((cb) => {
      onGrowCb = cb;
    }, "onGrow"),
    addCell: /* @__PURE__ */ __name((kind, structural) => addCellAt(kind, structural), "addCell"),
    addCells: /* @__PURE__ */ __name((n) => {
      if (n === 0)
        return ERR_BAD;
      const base = ncells;
      ncells += n;
      grow(ncells);
      for (let id = base; id < base + n; id++) {
        kindOf[id] = F64;
        ownerOf[id] = -1;
        setFlag[id] = 0;
        dirtyFlag[id] = 0;
        kdirtyFlag[id] = 0;
        cellDyn[id] = NONE;
        markOf[id] = 0;
        subs[id] = null;
        table[id] = 0;
      }
      return base;
    }, "addCells"),
    clearCells: /* @__PURE__ */ __name((base, n) => {
      if (base + n > ncells)
        return;
      for (let cell = base; cell < base + n; cell++) {
        const set = subs[cell];
        if (set !== null && set !== void 0) {
          for (const rule of set) {
            const r = rules[rule];
            if (r !== void 0) {
              r.fixed = r.fixed.filter((c) => c !== cell);
              r.found = r.found.filter((c) => c !== cell);
            }
          }
          set.clear();
        }
        subs[cell] = null;
        cellDyn[cell] = NONE;
        markOf[cell] = 0;
        ownerOf[cell] = -1;
        setFlag[cell] = 0;
        table[cell] = 0;
      }
    }, "clearCells"),
    freeCell: /* @__PURE__ */ __name((cell) => {
      if (cell >= ncells)
        return;
      const set = subs[cell];
      if (set !== null && set !== void 0) {
        for (const rule of set) {
          const r = rules[rule];
          if (r !== void 0) {
            r.fixed = r.fixed.filter((c) => c !== cell);
            r.found = r.found.filter((c) => c !== cell);
          }
        }
        set.clear();
      }
      subs[cell] = null;
      cellDyn[cell] = NONE;
      markOf[cell] = 0;
      dirtyFlag[cell] = 0;
      cellFree.push(cell);
    }, "freeCell"),
    ring,
    ringCount,
    ringCap,
    trackRing,
    trackCount,
    trackCap,
    stateOf: /* @__PURE__ */ __name((rule) => rules[rule]?.state ?? ST_DEAD, "stateOf"),
    state: /* @__PURE__ */ __name((rule) => rules[rule]?.state ?? ST_DEAD, "state"),
    pendingFlag,
    listened: /* @__PURE__ */ __name((cell) => cell < ncells && subs[cell] !== null && subs[cell].size > 0, "listened"),
    flush: /* @__PURE__ */ __name(() => {
      drainTrack();
      drain();
    }, "flush"),
    deps: /* @__PURE__ */ __name((rule) => {
      const r = rules[rule];
      return r === void 0 ? [] : edgesOf(r).slice();
    }, "deps"),
    abort: /* @__PURE__ */ __name(() => {
      aborted = true;
    }, "abort"),
    rewire: /* @__PURE__ */ __name((rule, edges) => {
      const r = rules[rule];
      if (r === void 0 || (r.state & ST_DEAD) !== 0)
        return ERR_BAD;
      unlinkAll(rule);
      serial++;
      r.serial = serial;
      for (let i = 0; i < edges.length; i++) {
        const cell = edges[i];
        if (cell >= ncells)
          return ERR_BAD;
        link(rule, cell, false);
      }
      r.state &= ~ST_REWIRE;
      return OK;
    }, "rewire"),
    addRule: /* @__PURE__ */ __name((target, kind, flags, edges, body = 0) => {
      if (target >= ncells)
        return ERR_BAD;
      const r = {
        target,
        kind,
        flags,
        state: 0,
        phase: (flags & F_PHASE1) !== 0 ? 1 : 0,
        code0: 0,
        ncode: 0,
        body,
        elem: NONE,
        stamp: 0,
        runs: 0,
        serial: 0,
        owns: -1,
        fixed: [],
        found: []
      };
      let id;
      const reused = ruleFree.pop();
      if (reused !== void 0) {
        id = reused;
        rules[id] = r;
      } else {
        id = rules.length;
        rules.push(r);
      }
      for (let i = 0; i < edges.length; i++) {
        const cell = edges[i];
        if (cell >= ncells) {
          r.state |= ST_DEAD;
          return ERR_BAD;
        }
        link(id, cell, false);
      }
      return id;
    }, "addRule"),
    addExprRule: /* @__PURE__ */ __name((target, flags, edges, codeOffset, ncode) => {
      const id = self.addRule(target, K_EXPR, flags, edges, 0);
      if (id >= 0) {
        rules[id].code0 = codeOffset;
        rules[id].ncode = ncode;
      }
      return id;
    }, "addExprRule"),
    addCode: /* @__PURE__ */ __name((words) => {
      const at = code.length;
      for (let i = 0; i < words.length; i++)
        code.push(words[i]);
      return at;
    }, "addCode"),
    addConst: /* @__PURE__ */ __name((v) => {
      consts.push(v);
      return consts.length - 1;
    }, "addConst"),
    // ── the built-in VIEW rules: not implemented here, and DECLINED rather than
    // faked. The runtime tests these results and falls back to deriving
    // visibility and auto-extent in JavaScript, the same path it takes with no
    // kernel at all (view.ts installKernelVis / installKernelExtent).
    viewLayout: /* @__PURE__ */ __name(() => {
    }, "viewLayout"),
    viewDprCell: /* @__PURE__ */ __name(() => {
    }, "viewDprCell"),
    viewAdd: /* @__PURE__ */ __name(() => -1, "viewAdd"),
    viewParent: /* @__PURE__ */ __name(() => {
    }, "viewParent"),
    viewRemove: /* @__PURE__ */ __name(() => {
    }, "viewRemove"),
    visAdd: /* @__PURE__ */ __name(() => -1, "visAdd"),
    visRewire: /* @__PURE__ */ __name(() => ERR_BAD, "visRewire"),
    extentAdd: /* @__PURE__ */ __name(() => -1, "extentAdd"),
    extentRewire: /* @__PURE__ */ __name(() => ERR_BAD, "extentRewire")
  };
  return self;
}
__name(instantiateKernelJS, "instantiateKernelJS");
export {
  instantiateKernelJS
};
