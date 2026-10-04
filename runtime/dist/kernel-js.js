// cell kinds (declare_kernel.h)
const F64 = 0, REF = 1;
// rule kinds
const K_EXPR = 0, K_BODY = 1, K_DYNAMIC = 2, K_VIS = 3, K_EXTENT = 4, K_LAYOUT = 5;
const LAYOUT_NOWRITE = 0x80000000;
// rule flags
const F_YIELDING = 1, F_PHASE1 = 2, F_PERCENT = 4;
// rule states
const ST_QUEUED = 1, ST_DEAD = 2, ST_SUSPENDED = 4, ST_REWIRE = 8, ST_UNLANDED = 16, ST_RUNNING = 32;
// errors
/** the track ring's owner mark (declare_kernel.h DK_TRACK_OWNER / DK_TRACK_NOBODY) */
const TRACK_OWNER = 0x80000000, TRACK_NOBODY = 0x7fffffff;
const OK = 0, ERR_OWNED = -3, ERR_CYCLE = -4, ERR_AFTER = -5, ERR_BOUND = -6, ERR_BAD = -8, ERR_ABORT = -9;
const CYCLE_LIMIT = 100, AFTER_LIMIT = 100;
const NONE = 0xffffffff;
// the opcodes, in the header's order
const OP_END = 0, OP_LOAD = 1, OP_CONST = 2, OP_ADD = 3, OP_SUB = 4, OP_MUL = 5, OP_DIV = 6, OP_MOD = 7, OP_NEG = 8, OP_MIN = 9, OP_MAX = 10, OP_ABS = 11, OP_FLOOR = 12, OP_CEIL = 13, OP_ROUND = 14, OP_SQRT = 15, OP_LT = 16, OP_LE = 17, OP_GT = 18, OP_GE = 19, OP_EQ = 20, OP_NE = 21, OP_AND = 22, OP_OR = 23, OP_NOT = 24, OP_SELECT = 25, OP_CLAMP = 26;
/** JS truthiness for a number: 0, -0 and NaN are false. */
const truthy = (x) => x === x && x !== 0;
export function instantiateKernelJS(host, caps = {}) {
    const ringCap = caps.ring ?? 1 << 14;
    const trackCap = caps.track_ring ?? 1 << 14;
    // THE OPENING CAPACITIES are the ones every kernel opens at (reactive.ts
    // DEFAULT_CAPS). Typed arrays are allocated, not written, so the reserve costs
    // no memory until it is used; every table doubles on demand (grow, growRules,
    // allocEdge), so none of them is a ceiling.
    let capacity = Math.max(1024, caps.extra_cells ?? 1 << 16);
    let table = new Float64Array(capacity);
    let kindOf = new Uint8Array(capacity); // low 7 bits kind, 0x80 structural
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
    let eRule = new Int32Array(edgeCap), eCell = new Uint32Array(edgeCap), eNext = new Uint32Array(edgeCap), ePrev = new Uint32Array(edgeCap), eNextRule = new Uint32Array(edgeCap), ePrevRule = new Uint32Array(edgeCap);
    let edgeCount = 0, edgeFree = 0; // edgeFree = edge + 1 of the first free edge (0 = none), linked through eNext
    const ownerGet = (cell) => ownerOf[cell] - 1;
    const ownerSet = (cell, rule) => { ownerOf[cell] = rule + 1; };
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
    let rDynHead = new Uint32Array(ruleCap); // node + 1 of the newest read (0 = none)
    const growRules = () => {
        const cap = ruleCap * 2;
        const g = (a) => { const b = new a.constructor(cap); b.set(a); return b; };
        rTarget = g(rTarget);
        rElem = g(rElem);
        rOwns = g(rOwns);
        rKind = g(rKind);
        rFlags = g(rFlags);
        rState = g(rState);
        rPhase = g(rPhase);
        rCode0 = g(rCode0);
        rNcode = g(rNcode);
        rBody = g(rBody);
        rStamp = g(rStamp);
        rRuns = g(rRuns);
        rSerial = g(rSerial);
        rDynHead = g(rDynHead);
        ruleCap = cap;
    };
    const known = (rule) => rule >= 0 && rule < nrules;
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
    const grow = (need) => {
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
        const o = new Int32Array(cap);
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
        const ch = new Uint32Array(cap);
        ch.set(cellHead);
        cellHead = ch;
        const ct = new Uint32Array(cap);
        ct.set(cellTail);
        cellTail = ct;
        const m = new Uint32Array(cap);
        m.set(markOf);
        markOf = m;
        capacity = cap;
        self.table = table;
        self.capacity = cap;
        onGrowCb?.();
    };
    // ── subscription ──────────────────────────────────────────────────────────
    const allocEdge = () => {
        if (edgeFree !== 0) {
            const e = edgeFree - 1;
            edgeFree = eNextRule[e];
            return e;
        }
        if (edgeCount === edgeCap) {
            const cap = edgeCap * 2;
            const r = new Int32Array(cap);
            r.set(eRule);
            eRule = r;
            const c = new Uint32Array(cap);
            c.set(eCell);
            eCell = c;
            const n = new Uint32Array(cap);
            n.set(eNext);
            eNext = n;
            const pv = new Uint32Array(cap);
            pv.set(ePrev);
            ePrev = pv;
            const nr = new Uint32Array(cap);
            nr.set(eNextRule);
            eNextRule = nr;
            const pr = new Uint32Array(cap);
            pr.set(ePrevRule);
            ePrevRule = pr;
            edgeCap = cap;
        }
        return edgeCount++;
    };
    /** take a node out of its cell's list: O(1), both directions linked (kernel.c unlink_cell) */
    const unlinkCell = (e) => {
        const cell = eCell[e], nx = eNext[e], pv = ePrev[e];
        if (pv !== 0)
            eNext[pv - 1] = nx;
        else
            cellHead[cell] = nx;
        if (nx !== 0)
            ePrev[nx - 1] = pv;
        else
            cellTail[cell] = pv;
    };
    const freeNode = (e) => { eRule[e] = -1; eNextRule[e] = edgeFree; ePrevRule[e] = 0; eNext[e] = 0; ePrev[e] = 0; edgeFree = e + 1; };
    /** kernel.c link: append to the cell's subscribers, PREPEND to the rule's reads */
    const link = (rule, cell) => {
        if ((rState[rule] & ST_DEAD) !== 0)
            return; // a dead rule takes no edges (kernel.c link)
        const e = allocEdge();
        eRule[e] = rule;
        eCell[e] = cell;
        eNext[e] = 0;
        const tail = cellTail[cell];
        ePrev[e] = tail;
        if (tail !== 0)
            eNext[tail - 1] = e + 1;
        else
            cellHead[cell] = e + 1;
        cellTail[cell] = e + 1;
        ePrevRule[e] = 0;
        eNextRule[e] = rDynHead[rule];
        if (eNextRule[e] !== 0)
            ePrevRule[eNextRule[e] - 1] = e + 1;
        rDynHead[rule] = e + 1;
    };
    /** take a node out of its rule's list: O(1), both directions linked (kernel.c unlink_rule) */
    const unlinkRule = (e) => {
        const rule = eRule[e], nx = eNextRule[e], pv = ePrevRule[e];
        if (pv !== 0)
            eNextRule[pv - 1] = nx;
        else
            rDynHead[rule] = nx;
        if (nx !== 0)
            ePrevRule[nx - 1] = pv;
    };
    /** kernel.c free_cell's walk: every node on the cell leaves its rule's list and is freed */
    const detachCell = (cell) => {
        for (let h = cellHead[cell]; h !== 0;) {
            const e = h - 1;
            h = eNext[e];
            const rule = eRule[e];
            if (known(rule))
                unlinkRule(e);
            freeNode(e);
        }
        cellHead[cell] = 0;
        cellTail[cell] = 0;
    };
    /** a rule's reads, newest first (kernel_deps) */
    const readsOf = (rule) => {
        const out = [];
        for (let h = rDynHead[rule]; h !== 0; h = eNextRule[h - 1])
            out.push(eCell[h - 1]);
        return out;
    };
    const unlinkAll = (rule) => {
        for (let h = rDynHead[rule]; h !== 0;) {
            const e = h - 1;
            h = eNextRule[e];
            unlinkCell(e);
            freeNode(e);
        }
        rDynHead[rule] = 0;
    };
    const trackCell = (cell) => (active[0] < 0 ? OK : trackFor(active[0], cell));
    const trackFor = (a, cell) => {
        if (!known(a) || cell >= ncells || (rState[a] & ST_DEAD) !== 0)
            return OK;
        const s = rSerial[a];
        if (markOf[cell] === s)
            return OK; // one read per run, however many times the body asks
        markOf[cell] = s;
        link(a, cell);
        return OK;
    };
    // ── the scheduler ─────────────────────────────────────────────────────────
    const enqueue = (rule) => {
        q[rPhase[rule]].push(rule);
        if (!flushing && pendingFlag[0] === 0) {
            pendingFlag[0] = 1;
            host.schedule();
        }
    };
    const invalidate = (rule, fromCell) => {
        if (fromCell !== NONE && (kindOf[fromCell] & 0x80) !== 0)
            rState[rule] |= ST_REWIRE;
        if ((rState[rule] & (ST_QUEUED | ST_DEAD | ST_SUSPENDED | ST_UNLANDED)) !== 0)
            return;
        rState[rule] |= ST_QUEUED;
        enqueue(rule);
    };
    const wake = (cell) => {
        if (cell >= ncells)
            return;
        // next is read before invalidate, which only queues (it never relinks)
        for (let h = cellHead[cell]; h !== 0;) {
            const e = h - 1;
            h = eNext[e];
            invalidate(eRule[e], cell);
        }
    };
    const markDirty = (cell) => {
        if (dirtyFlag[cell] === 0) {
            dirtyFlag[cell] = 1;
            dirtyList.push(cell);
        }
    };
    const drain = () => {
        const n = Math.min(ringCount[0], ringCap);
        if (n === 0)
            return;
        ringCount[0] = 0;
        for (let i = 0; i < n; i++) {
            const cell = ring[i];
            if (cell >= ncells)
                continue;
            if ((kindOf[cell] & 0x7f) === F64)
                markDirty(cell);
            wake(cell);
        }
    };
    // the reads before an owner mark go to the rule it names; after the last mark, to the active rule
    const drainTrack = () => {
        const n = Math.min(trackCount[0], trackCap);
        if (n === 0)
            return;
        trackCount[0] = 0;
        let from = 0;
        for (let i = 0; i <= n; i++) {
            let owner;
            if (i === n)
                owner = active[0];
            else if ((trackRing[i] & TRACK_OWNER) !== 0)
                owner = trackRing[i] & TRACK_NOBODY;
            else
                continue;
            if (owner >= 0)
                for (let j = from; j < i; j++)
                    trackFor(owner, trackRing[j]);
            from = i + 1;
        }
    };
    // ── the one write path ────────────────────────────────────────────────────
    const setValue = (cell, v) => {
        if (cell >= ncells)
            return ERR_BAD;
        if ((kindOf[cell] & 0x7f) !== F64) {
            wake(cell);
            return OK;
        }
        if (table[cell] === v)
            return OK; // === : NaN never gates
        table[cell] = v;
        markDirty(cell);
        if (kdirtyFlag[cell] === 0) {
            kdirtyFlag[cell] = 1;
            kdirtyList.push(cell);
        }
        wake(cell);
        return OK;
    };
    /** A HOST write is not a kernel-written value: if this write is the newest
     *  kernel-dirty entry, take it back off that list (the C does the same). */
    const unkdirty = (cell) => {
        if (kdirtyFlag[cell] === 1 && kdirtyList.length > 0 && kdirtyList[kdirtyList.length - 1] === cell) {
            kdirtyFlag[cell] = 0;
            kdirtyList.pop();
        }
    };
    // ── rules ─────────────────────────────────────────────────────────────────
    // One id on the free list once: a second free would hand it out twice. The
    // C kernel cannot see this happen; the twin says where it would have.
    const rFreed = new Set();
    const freeRule = (rule) => {
        if (rFreed.has(rule)) {
            if ((typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) || globalThis.__declareKernelChecks === true)
                console.error(`kernel(js): rule ${rule} freed twice\n${new Error().stack ?? ""}`);
            return;
        }
        rFreed.add(rule);
        ruleFree.push(rule);
    };
    const dispose = (rule) => {
        if (!known(rule) || (rState[rule] & ST_DEAD) !== 0)
            return;
        rState[rule] |= ST_DEAD;
        unlinkAll(rule);
        const owns = rOwns[rule];
        if (owns >= 0 && ownerGet(owns) === rule)
            ownerSet(owns, -1);
        rOwns[rule] = -1;
        // else freed when its queue entry drains, or when its own run ends
        if ((rState[rule] & (ST_QUEUED | ST_RUNNING)) === 0)
            freeRule(rule);
    };
    const evalExpr = (rule) => {
        const st = [];
        let c = rCode0[rule];
        const end = rCode0[rule] + rNcode[rule];
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
                    st.push(a < b ? a : (b < a ? b : (a !== a ? a : b)));
                    break;
                }
                case OP_MAX: {
                    const b = st.pop(), a = st.pop();
                    st.push(a > b ? a : (b > a ? b : (a !== a ? a : b)));
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
                    break; // Math.round's rule, spelled out
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
                    st.push(x < lo ? lo : (x > hi ? hi : x));
                    break;
                }
                default:
                    c = end;
                    break;
            }
        }
        return st.length > 0 ? st[st.length - 1] : 0;
    };
    const apply = (rule, v) => {
        const cell = rTarget[rule];
        if (cell < 0)
            return; // the host applied it itself
        if ((kindOf[cell] & 0x7f) === REF) {
            if (v !== 0)
                wake(cell);
            return;
        }
        setValue(cell, v);
    };
    const run = (rule) => {
        if (!known(rule))
            return ERR_BAD;
        let v = 0;
        drainTrack(); // reads appended by whatever is active now link to IT, before we switch
        drain(); // host writes since the last drain wake their dependents first
        const wasRunning = (rState[rule] & ST_RUNNING) !== 0;
        rState[rule] |= ST_RUNNING;
        switch (rKind[rule]) {
            case K_EXPR:
                v = evalExpr(rule);
                break;
            case K_BODY:
                v = host.body(rule, rElem[rule], rTarget[rule]);
                break;
            case K_DYNAMIC: {
                unlinkAll(rule);
                serial++;
                if (serial === 0)
                    serial++; // 0 means "never"
                rSerial[rule] = serial;
                const prev = active[0];
                active[0] = rule;
                v = host.body(rule, rElem[rule], rTarget[rule]);
                drainTrack(); // the reads the body appended while it ran
                active[0] = prev;
                break;
            }
            case K_VIS:
                v = visRun(rule);
                break;
            case K_EXTENT:
                v = extentRun(rule);
                break;
            case K_LAYOUT:
                v = layoutRun(rule);
                break;
            default:
                rState[rule] &= ~ST_RUNNING;
                return ERR_BAD;
        }
        if (!wasRunning)
            rState[rule] &= ~ST_RUNNING;
        if ((rState[rule] & ST_DEAD) !== 0) {
            // disposed by its own body: nothing lands; freed now nothing runs in it
            if (!wasRunning && (rState[rule] & ST_QUEUED) === 0)
                freeRule(rule);
            return OK;
        }
        rState[rule] &= ~(ST_REWIRE | ST_UNLANDED);
        apply(rule, v);
        drain(); // …and the body's writes wake theirs
        return OK;
    };
    const runQueued = (rule) => {
        if (!known(rule) || (rState[rule] & ST_QUEUED) === 0)
            return OK; // a stale entry: the pull ran it
        rState[rule] &= ~ST_QUEUED;
        if ((rState[rule] & ST_DEAD) !== 0) {
            freeRule(rule);
            return OK;
        }
        if ((rState[rule] & ST_SUSPENDED) !== 0)
            return OK;
        if (rStamp[rule] !== stamp) {
            rStamp[rule] = stamp;
            rRuns[rule] = 0;
        }
        if (++rRuns[rule] > CYCLE_LIMIT)
            return ERR_CYCLE;
        return run(rule);
    };
    /** Run the queued owners of this rule's inputs first — see the header. */
    const pull = (rule, depth) => {
        if (depth > 64)
            return OK;
        if (!known(rule))
            return OK;
        for (const cell of readsOf(rule)) {
            const o = ownerGet(cell);
            if (o >= 0 && o !== rule && (rState[o] & ST_QUEUED) !== 0 && (rState[o] & (ST_DEAD | ST_SUSPENDED)) === 0) {
                const e = pull(o, depth + 1);
                if (e !== OK)
                    return e;
                const e2 = runQueued(o);
                if (e2 !== OK)
                    return e2;
            }
        }
        return OK;
    };
    const abandon = () => {
        for (const phase of q) {
            for (const rule of phase) {
                if (!known(rule) || (rState[rule] & ST_QUEUED) === 0)
                    continue; // a stale entry (kernel.c abandon)
                rState[rule] &= ~ST_QUEUED;
                if ((rState[rule] & ST_DEAD) !== 0)
                    freeRule(rule);
            }
            phase.length = 0;
        }
    };
    const settle = () => {
        if (flushing)
            return 0;
        pendingFlag[0] = 0;
        aborted = false;
        flushing = true;
        drain();
        let runs = 0, err = OK, bad = NONE, passes = 0;
        outer: for (;;) {
            stamp++;
            for (;;) {
                const phase = q[0].length > 0 ? 0 : (q[1].length > 0 ? 1 : -1);
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
    };
    const addCellAt = (kind, structural) => {
        let id;
        const reused = cellFree.pop();
        if (reused !== undefined)
            id = reused;
        else {
            id = ncells++;
            grow(ncells);
        }
        kindOf[id] = (kind & 0x7f) | (structural ? 0x80 : 0);
        ownerOf[id] = 0;
        setFlag[id] = 0;
        dirtyFlag[id] = 0;
        kdirtyFlag[id] = 0;
        markOf[id] = 0;
        cellHead[id] = 0;
        cellTail[id] = 0;
        table[id] = 0;
        return id;
    };
    // ── the view table and the two built-in view rules ───────────────────────
    // The same arithmetic as kernel.c's vis_run / extent_run (and so as view.ts's
    // readVisibility and the JavaScript auto-extent): the affine walk up the
    // parent chain, the scroll offsets, the intersection with the root's frame;
    // and the maximum over the children's footprints. Math.* where the C has its
    // own dk_tan/dk_cos/dk_sin, which is what the JavaScript fallbacks use.
    let vl = null;
    let dprCell = NONE;
    const elemBase = [], elemParent = [];
    let viewFree = NONE;
    const VS = (view, field) => table[elemBase[view] + vl[field]];
    const VB = (base, field) => table[base + vl[field]];
    /** kernel.c block_ok: a child word names a block the cell table holds whole */
    let vlSpan = 0;
    const blockOk = (base) => base >= 0 && base < ncells && ncells - base >= vlSpan;
    const setField = (base, field, v) => { setValue(base + vl[field], v); };
    const DEG = Math.PI / 180;
    /** localAffine by block base; null when identity */
    const ownAffine = (base) => {
        const sc = VB(base, "scale"), sx = VB(base, "scaleX"), sy = VB(base, "scaleY"), rot = VB(base, "rotation"), kx = VB(base, "skewX"), ky = VB(base, "skewY");
        if (sc === 1 && sx === 1 && sy === 1 && rot === 0 && kx === 0 && ky === 0)
            return null;
        const px = VB(base, "pivotX"), py = VB(base, "pivotY");
        const SX = sc * sx, SY = sc * sy;
        const tkx = Math.tan(kx * DEG), tky = Math.tan(ky * DEG);
        const r = rot * DEG, cr = Math.cos(r), sr = Math.sin(r);
        const a0 = SX, b0 = tky * SX, c0 = tkx * SY, d0 = SY;
        const a = cr * a0 - sr * b0, b = sr * a0 + cr * b0;
        const c = cr * c0 - sr * d0, d = sr * c0 + cr * d0;
        return [a, b, c, d, px - (a * px + c * py), py - (b * px + d * py)];
    };
    const compose = (m1, m2) => [
        m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
    const liveView = (v) => v !== NONE && v < elemBase.length && elemBase[v] !== NONE;
    const visRun = (rule) => {
        const selfView = rBody[rule], root = rElem[rule];
        if (vl === null || !liveView(selfView))
            return 0;
        const b = elemBase[selfView];
        const dpr = dprCell !== NONE && dprCell < ncells ? table[dprCell] : 1;
        for (let n = selfView; n !== NONE; n = elemParent[n]) {
            if (VS(n, "rotateX") !== 0 || VS(n, "rotateY") !== 0 || VS(n, "translateZ") !== 0) {
                setField(b, "visMode", 0);
                return 0;
            }
        }
        let m = [1, 0, 0, 1, 0, 0];
        for (let n = selfView; n !== NONE;) {
            const p = elemParent[n];
            const own = ownAffine(elemBase[n]);
            if (own !== null)
                m = compose(own, m);
            m = compose([1, 0, 0, 1, VS(n, "x"), VS(n, "y")], m);
            if (p === NONE)
                break;
            if (VS(p, "scrollsOn") !== 0 && VS(n, "ignoreScroll") === 0)
                m = compose([1, 0, 0, 1, -VS(p, "scrollX"), -VS(p, "scrollY")], m);
            n = p;
        }
        const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
        let on = true;
        for (let n = selfView; n !== NONE; n = elemParent[n])
            if (VS(n, "visible") === 0) {
                on = false;
                break;
            }
        if (on) {
            const w = VS(selfView, "width"), h = VS(selfView, "height");
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const pxs = [0, w, 0, w], pys = [0, 0, h, h];
            for (let i = 0; i < 4; i++) {
                const fx = m[0] * pxs[i] + m[2] * pys[i] + m[4], fy = m[1] * pxs[i] + m[3] * pys[i] + m[5];
                if (fx < minX)
                    minX = fx;
                if (fx > maxX)
                    maxX = fx;
                if (fy < minY)
                    minY = fy;
                if (fy > maxY)
                    maxY = fy;
            }
            const bx = minX, by = minY, bw = maxX - minX, bh = maxY - minY;
            const rw = root < elemBase.length && elemBase[root] !== NONE ? VS(root, "width") : 0;
            const rh = root < elemBase.length && elemBase[root] !== NONE ? VS(root, "height") : 0;
            const ix = bx > 0 ? bx : 0, iy = by > 0 ? by : 0;
            const iw = (bx + bw < rw ? bx + bw : rw) - ix, ih = (by + bh < rh ? by + bh : rh) - iy;
            if (iw <= 0 || ih <= 0)
                on = false;
            else {
                const kk = scale === 0 ? 1 : scale;
                setField(b, "visX", (ix - bx) / kk);
                setField(b, "visY", (iy - by) / kk);
                setField(b, "visW", iw / kk);
                setField(b, "visH", ih / kk);
            }
        }
        if (!on) {
            setField(b, "visX", 0);
            setField(b, "visY", 0);
            setField(b, "visW", 0);
            setField(b, "visH", 0);
        }
        setField(b, "visOn", on ? 1 : 0);
        setField(b, "visScale", scale * dpr);
        setField(b, "visMode", 1);
        return 0;
    };
    const VIS_FIELDS = ["x", "y", "visible", "scale", "scaleX", "scaleY", "rotation", "skewX", "skewY",
        "pivotX", "pivotY", "scrollX", "scrollY", "ignoreScroll", "scrollsOn", "rotateX", "rotateY", "translateZ"];
    const linkChecked = (rule, cell) => { if (cell >= ncells)
        return ERR_BAD; link(rule, cell); return OK; };
    const visLinkChain = (rule, selfView, root) => {
        const L = vl;
        for (let n = selfView; n !== NONE; n = elemParent[n]) {
            if (elemBase[n] === NONE)
                break;
            for (const f of VIS_FIELDS) {
                const e = linkChecked(rule, elemBase[n] + L[f]);
                if (e !== OK)
                    return e;
            }
        }
        let e = linkChecked(rule, elemBase[selfView] + L.width);
        if (e !== OK)
            return e;
        e = linkChecked(rule, elemBase[selfView] + L.height);
        if (e !== OK)
            return e;
        if (root < elemBase.length && elemBase[root] !== NONE) {
            e = linkChecked(rule, elemBase[root] + L.width);
            if (e !== OK)
                return e;
            e = linkChecked(rule, elemBase[root] + L.height);
            if (e !== OK)
                return e;
        }
        if (dprCell !== NONE) {
            e = linkChecked(rule, dprCell);
            if (e !== OK)
                return e;
        }
        return OK;
    };
    const EXTENT_FIELDS = ["x", "y", "width", "height", "visible", "ignoreClip", "scale", "scaleX", "scaleY",
        "rotation", "skewX", "skewY", "pivotX", "pivotY", "rotateX", "rotateY", "translateZ"];
    const extentStore = (rule, words) => {
        const n = words.length;
        if (n > rNcode[rule]) {
            const cap = n * 2 > 8 ? n * 2 : 8;
            rCode0[rule] = code.length;
            rNcode[rule] = cap;
            for (let i = 0; i < cap; i++)
                code.push(0);
        }
        for (let i = 0; i < n; i++)
            code[rCode0[rule] + i] = words[i];
        rBody[rule] = n;
    };
    const extentLink = (rule) => {
        const w0 = rCode0[rule], n = rBody[rule];
        if (n === 0)
            return OK;
        if (code[w0] !== NONE && code[w0] < ncells)
            link(rule, code[w0]);
        if (n > 1 && code[w0 + 1] !== NONE && code[w0 + 1] < ncells)
            link(rule, code[w0 + 1]);
        const L = vl;
        for (let i = 2; i < n; i++) {
            if (!blockOk(code[w0 + i]))
                continue;
            for (const f of EXTENT_FIELDS) {
                const e = linkChecked(rule, code[w0 + i] + L[f]);
                if (e !== OK)
                    return e;
            }
        }
        return OK;
    };
    const percentOwned = (cell) => {
        const o = cell < ncells ? ownerGet(cell) : -1;
        return o >= 0 && known(o) && (rFlags[o] & F_PERCENT) !== 0;
    };
    const extentRun = (rule) => {
        const w0 = rCode0[rule], n = rBody[rule];
        const axis = rElem[rule];
        const L = vl;
        let max = 0;
        for (let i = 2; i < n; i++) {
            const base = code[w0 + i];
            if (!blockOk(base))
                continue;
            if (VB(base, "visible") === 0 || VB(base, "ignoreClip") !== 0)
                continue;
            if (percentOwned(base + (axis === 0 ? L.x : L.y)) || percentOwned(base + (axis === 0 ? L.width : L.height)))
                continue;
            if (VB(base, "rotateX") !== 0 || VB(base, "rotateY") !== 0 || VB(base, "translateZ") !== 0) {
                host.decline(rule); // out of the plane: the host's footprint3D
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
                    if (fx < minX)
                        minX = fx;
                    if (fx > maxX)
                        maxX = fx;
                    if (fy < minY)
                        minY = fy;
                    if (fy > maxY)
                        maxY = fy;
                }
                lead = axis === 0 ? minX : minY;
                ext = axis === 0 ? maxX - minX : maxY - minY;
            }
            const e = (axis === 0 ? VB(base, "x") : VB(base, "y")) + lead + ext;
            if (e > max)
                max = e;
        }
        // the container's own padding on this axis (kernel.c extent_run)
        if (n > 1 && code[w0 + 1] !== NONE && code[w0 + 1] < ncells)
            max += table[code[w0 + 1]];
        return max;
    };
    // the stack layout (kernel.c layout_link / layout_run): a child's footprint
    // fields are its edges, never its position, which the rule writes
    const LAYOUT_FIELDS = ["width", "height", "visible", "scale", "scaleX", "scaleY",
        "rotation", "skewX", "skewY", "pivotX", "pivotY", "rotateX", "rotateY", "translateZ"];
    const layoutLink = (rule) => {
        const w0 = rCode0[rule], n = rBody[rule];
        if (code[w0] !== NONE && code[w0] < ncells)
            link(rule, code[w0]);
        if (n > 1 && code[w0 + 1] !== NONE && code[w0 + 1] < ncells)
            link(rule, code[w0 + 1]);
        const L = vl;
        for (let i = 2; i < n; i++) {
            const base = code[w0 + i] >= LAYOUT_NOWRITE ? code[w0 + i] - LAYOUT_NOWRITE : code[w0 + i];
            if (!blockOk(base))
                continue;
            for (const f of LAYOUT_FIELDS) {
                const e = linkChecked(rule, base + L[f]);
                if (e !== OK)
                    return e;
            }
        }
        return OK;
    };
    const layoutRun = (rule) => {
        const w0 = rCode0[rule], n = rBody[rule];
        const axis = rElem[rule];
        const L = vl;
        const spacing = n > 1 && code[w0 + 1] !== NONE && code[w0 + 1] < ncells ? table[code[w0 + 1]] : 0;
        let pos = 0;
        for (let i = 2; i < n; i++) {
            const word = code[w0 + i];
            const write = word < LAYOUT_NOWRITE, base = write ? word : word - LAYOUT_NOWRITE;
            if (!blockOk(base))
                continue;
            if (VB(base, "rotateX") !== 0 || VB(base, "rotateY") !== 0 || VB(base, "translateZ") !== 0) {
                host.decline(rule); // out of the plane: the host's footprint3D
                return 0;
            }
            const wd = VB(base, "width"), ht = VB(base, "height");
            let lead = 0, ext = axis === 0 ? wd : ht;
            const m = ownAffine(base);
            if (m !== null) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                const pxs = [0, wd, 0, wd], pys = [0, 0, ht, ht];
                for (let c = 0; c < 4; c++) {
                    const fx = m[0] * pxs[c] + m[2] * pys[c] + m[4], fy = m[1] * pxs[c] + m[3] * pys[c] + m[5];
                    if (fx < minX)
                        minX = fx;
                    if (fx > maxX)
                        maxX = fx;
                    if (fy < minY)
                        minY = fy;
                    if (fy > maxY)
                        maxY = fy;
                }
                lead = axis === 0 ? minX : minY;
                ext = axis === 0 ? maxX - minX : maxY - minY;
            }
            if (write)
                setValue(base + (axis === 0 ? L.x : L.y), pos - lead);
            if (VB(base, "visible") !== 0)
                pos += ext + spacing;
        }
        return 0;
    };
    const self = {
        table, active, capacity,
        cells: () => ncells,
        tableSize: () => capacity,
        rules: () => nrules,
        write: (cell, v) => {
            drainTrack();
            if (cell >= ncells)
                return ERR_BAD;
            const owner = ownerGet(cell);
            if (owner >= 0) {
                if ((rFlags[owner] & F_YIELDING) === 0)
                    return ERR_OWNED;
                dispose(owner);
                ownerSet(cell, -1);
            }
            setFlag[cell] = 1;
            const r = setValue(cell, v);
            if (r === OK)
                unkdirty(cell);
            return r;
        },
        set: (cell, v) => { drainTrack(); const r = setValue(cell, v); if (r === OK && cell < ncells)
            unkdirty(cell); return r; },
        touch: (cell) => { drainTrack(); if (cell < ncells)
            wake(cell); },
        isSet: (cell) => cell < ncells && setFlag[cell] === 1,
        own: (cell, rule) => {
            if (cell >= ncells || !known(rule))
                return ERR_BAD;
            const prior = ownerGet(cell);
            if (prior >= 0 && (rFlags[prior] & F_YIELDING) !== 0)
                dispose(prior);
            else if (prior >= 0)
                return ERR_BOUND;
            ownerSet(cell, rule);
            rOwns[rule] = cell;
            return OK;
        },
        release: (cell, rule) => { if (cell < ncells && ownerGet(cell) === rule)
            ownerSet(cell, -1); },
        owner: (cell) => (cell < ncells ? ownerGet(cell) : -1),
        run: (rule) => {
            if (!known(rule))
                return ERR_BAD;
            if ((rState[rule] & ST_DEAD) !== 0)
                return OK; // disposed: nothing to run (kernel.c kernel_run)
            drain();
            const e = pull(rule, 0);
            if (e !== OK)
                return e;
            return run(rule);
        },
        invalidate: (rule) => { drainTrack(); if (known(rule))
            invalidate(rule, NONE); },
        dispose,
        suspend: (rule) => {
            if (!known(rule))
                return;
            rState[rule] |= ST_SUSPENDED;
            rState[rule] &= ~ST_QUEUED;
            // only a DYNAMIC rule's edges go (it re-tracks on every run); a static
            // rule keeps the compile's, which nothing would re-link (kernel.c)
            if (rKind[rule] === K_DYNAMIC) {
                unlinkAll(rule);
                rState[rule] |= ST_REWIRE;
            }
        },
        resume: (rule) => {
            if (!known(rule))
                return ERR_BAD;
            if ((rState[rule] & ST_SUSPENDED) === 0)
                return OK;
            rState[rule] &= ~ST_SUSPENDED;
            return run(rule);
        },
        track: trackCell,
        settle,
        pending: () => pendingFlag[0] === 1,
        dirty: () => {
            const out = new Uint32Array(dirtyList.length);
            for (let i = 0; i < dirtyList.length; i++) {
                out[i] = dirtyList[i];
                dirtyFlag[dirtyList[i]] = 0;
            }
            dirtyList.length = 0;
            return out;
        },
        kdirty: () => {
            const out = new Uint32Array(kdirtyList.length);
            for (let i = 0; i < kdirtyList.length; i++) {
                out[i] = kdirtyList[i];
                kdirtyFlag[kdirtyList[i]] = 0;
            }
            kdirtyList.length = 0;
            return out;
        },
        onGrow: (cb) => { onGrowCb = cb; },
        addCell: (kind, structural) => addCellAt(kind, structural),
        addCells: (n) => {
            if (n === 0)
                return ERR_BAD;
            const base = ncells;
            ncells += n;
            grow(ncells);
            for (let id = base; id < base + n; id++) {
                kindOf[id] = F64;
                ownerOf[id] = 0;
                setFlag[id] = 0;
                dirtyFlag[id] = 0;
                kdirtyFlag[id] = 0;
                markOf[id] = 0;
                cellHead[id] = 0;
                cellTail[id] = 0;
                table[id] = 0;
            }
            return base;
        },
        clearCells: (base, n) => {
            if (base + n > ncells)
                return;
            for (let cell = base; cell < base + n; cell++) {
                detachCell(cell);
                markOf[cell] = 0;
                ownerOf[cell] = 0;
                setFlag[cell] = 0;
                table[cell] = 0;
            }
        },
        freeCell: (cell) => {
            if (cell >= ncells)
                return;
            detachCell(cell);
            markOf[cell] = 0;
            dirtyFlag[cell] = 0;
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
            if (!known(rule) || (rState[rule] & ST_DEAD) !== 0)
                return ERR_BAD;
            unlinkAll(rule);
            serial++;
            rSerial[rule] = serial;
            for (let i = 0; i < edges.length; i++) {
                const cell = edges[i];
                if (cell >= ncells)
                    return ERR_BAD;
                link(rule, cell);
            }
            rState[rule] &= ~ST_REWIRE;
            return OK;
        },
        addRule: (target, kind, flags, edges, body = 0) => {
            if (target >= ncells)
                return ERR_BAD;
            let id;
            const reused = ruleFree.pop();
            if (reused !== undefined) {
                id = reused;
                rFreed.delete(id);
            }
            else {
                if (nrules === ruleCap)
                    growRules();
                id = nrules++;
            }
            rTarget[id] = target;
            rKind[id] = kind;
            rFlags[id] = flags;
            rState[id] = 0;
            rPhase[id] = (flags & F_PHASE1) !== 0 ? 1 : 0;
            rCode0[id] = 0;
            rNcode[id] = 0;
            rBody[id] = body;
            rElem[id] = NONE;
            rStamp[id] = 0;
            rRuns[id] = 0;
            rSerial[id] = 0;
            rOwns[id] = -1;
            rDynHead[id] = 0;
            for (let i = 0; i < edges.length; i++) {
                const cell = edges[i];
                if (cell >= ncells) {
                    rState[id] |= ST_DEAD;
                    return ERR_BAD;
                }
                link(id, cell);
            }
            return id;
        },
        addExprRule: (target, flags, edges, codeOffset, ncode) => {
            const id = self.addRule(target, K_EXPR, flags, edges, 0);
            if (id >= 0) {
                rCode0[id] = codeOffset;
                rNcode[id] = ncode;
            }
            return id;
        },
        addCode: (words) => {
            const at = code.length;
            for (let i = 0; i < words.length; i++)
                code.push(words[i]);
            return at;
        },
        addConst: (v) => { consts.push(v); return consts.length - 1; },
        // ── the built-in VIEW rules: the view table, visibility, auto-extent ────
        viewLayout: (layout) => { vl = { ...layout }; vlSpan = Math.max(0, ...Object.values(layout).map((f) => f + 1)); },
        viewDprCell: (cell) => { dprCell = cell; },
        viewAdd: (base, parent) => {
            let id;
            if (viewFree !== NONE) {
                id = viewFree;
                viewFree = elemParent[id];
            }
            else {
                id = elemBase.length;
                elemBase.push(NONE);
                elemParent.push(NONE);
            }
            elemBase[id] = base;
            elemParent[id] = parent < 0 ? NONE : parent;
            return id;
        },
        viewParent: (view, parent) => { if (view < elemBase.length)
            elemParent[view] = parent < 0 ? NONE : parent; },
        viewRemove: (view) => {
            if (view >= elemBase.length)
                return;
            elemBase[view] = NONE;
            elemParent[view] = viewFree;
            viewFree = view; // the parent slot doubles as the free link
        },
        visAdd: (view, root) => {
            if (vl === null || view >= elemBase.length)
                return ERR_BAD;
            const id = self.addRule(-1, K_VIS, 0, [], view);
            if (id < 0)
                return id;
            rElem[id] = root;
            const e = visLinkChain(id, view, root);
            if (e !== OK) {
                dispose(id);
                return e;
            }
            return id;
        },
        visRewire: (rule) => {
            if (!known(rule) || rKind[rule] !== K_VIS)
                return ERR_BAD;
            unlinkAll(rule);
            return visLinkChain(rule, rBody[rule], rElem[rule]);
        },
        extentAdd: (axis, target, words) => {
            if (vl === null || target >= ncells || words.length < 2)
                return ERR_BAD;
            const id = self.addRule(target, K_EXTENT, F_YIELDING, [], 0);
            if (id < 0)
                return id;
            rElem[id] = axis;
            extentStore(id, words);
            const e = extentLink(id);
            if (e !== OK) {
                dispose(id);
                return e;
            }
            return id;
        },
        extentRewire: (rule, words) => {
            if (!known(rule) || rKind[rule] !== K_EXTENT || (rState[rule] & ST_DEAD) !== 0 || words.length < 2)
                return ERR_BAD;
            unlinkAll(rule);
            extentStore(rule, words);
            return extentLink(rule);
        },
        layoutAdd: (axis, words) => {
            if (vl === null || words.length < 2 || axis > 1)
                return ERR_BAD;
            const id = self.addRule(-1, K_LAYOUT, 0, [], 0);
            if (id < 0)
                return id;
            rElem[id] = axis;
            extentStore(id, Array.from(words, (w) => w >>> 0));
            const e = layoutLink(id);
            if (e !== OK) {
                dispose(id);
                return e;
            }
            return id;
        },
    };
    return self;
}
//# sourceMappingURL=kernel-js.js.map