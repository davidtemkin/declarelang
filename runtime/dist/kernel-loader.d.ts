export declare const KERNEL_ERR: Readonly<{
    IMAGE: -1;
    ARENA: -2;
    OWNED: -3;
    CYCLE: -4;
    AFTER: -5;
    BOUND: -6;
    FULL: -7;
    BAD: -8;
    ABORT: -9;
}>;
export declare const KERNEL_KIND: Readonly<{
    EXPR: 0;
    BODY: 1;
    DYNAMIC: 2;
}>;
export declare const KERNEL_FLAG: Readonly<{
    YIELDING: 1;
    PHASE1: 2;
    PERCENT: 4;
}>;
export declare const KERNEL_STATE: Readonly<{
    QUEUED: 1;
    DEAD: 2;
    SUSPENDED: 4;
    REWIRE: 8;
    UNLANDED: 16;
}>;
export declare const CELL_KIND: Readonly<{
    F64: 0;
    REF: 1;
}>;
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
export interface KernelCaps {
    extra_elems?: number;
    extra_cells?: number;
    extra_rules?: number;
    dyn_edges?: number;
    ring?: number;
    code_words?: number;
    consts?: number;
    track_ring?: number;
}
/** The kernel's ABI, bound to one instance. Ids are the kernel's; -1 = none. */
export interface Kernel {
    /** THE VIEWS ARE NOT readonly: growing the staging buffer can grow (and so
     *  detach) the underlying memory, and the loader then replaces every view in
     *  place. Anyone who CACHES one — reactive.ts does — must re-read it from
     *  `onGrow`, which fires synchronously before the growing call returns. */
    table: Float64Array;
    /** active[0] is the running DYNAMIC rule, or -1: readable with no call. */
    active: Int32Array;
    readonly capacity: number;
    cells(): number;
    rules(): number;
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
     *  and the cells rules wrote since the last call (for the push sweep). */
    addCode(words: ArrayLike<number>): number;
    addConst(v: number): number;
    kdirty(): Uint32Array;
    addExprRule(target: number, flags: number, edges: ArrayLike<number>, codeOffset: number, ncode: number): number;
    viewLayout(layout: Record<string, number>): void;
    viewDprCell(cell: number): void;
    viewAdd(base: number, parent: number): number;
    viewParent(view: number, parent: number): void;
    viewRemove(view: number): void;
    visAdd(view: number, root: number): number;
    visRewire(rule: number): number;
    /** Auto-extent: `words` = [list cell | -1, child block base…]. */
    extentAdd(axis: number, target: number, words: ArrayLike<number>): number;
    extentRewire(rule: number, words: ArrayLike<number>): number;
}
/** dk_view_layout, field order (declare_kernel.h). */
export declare const VIEW_LAYOUT_FIELDS: readonly ["x", "y", "width", "height", "visible", "scale", "scaleX", "scaleY", "rotation", "skewX", "skewY", "pivotX", "pivotY", "scrollX", "scrollY", "ignoreScroll", "scrollsOn", "rotateX", "rotateY", "translateZ", "visOn", "visScale", "visX", "visY", "visW", "visH", "visMode", "ignoreClip"];
/** An empty image: no compiled elements — everything is added at runtime.
 *  (Phase B's compiler output replaces this with the program's tables.) */
export declare function emptyImage(): Uint8Array;
export declare function instantiateKernel(wasm: Uint8Array, image: Uint8Array, host: KernelHost, caps?: KernelCaps): Promise<Kernel>;
/** The synchronous form, for hosts that can (the Mac's JavaScriptCore). */
export declare function instantiateKernelSync(wasm: Uint8Array, image: Uint8Array, host: KernelHost, caps?: KernelCaps): Kernel;
export declare function hasNativeKernel(): boolean;
/** The Mac host's native kernel: the C library in the process, reached
 *  through JavaScriptCore functions and zero-copy views (kernel.md Phase D). */
export declare function instantiateKernelNative(image: Uint8Array, host: KernelHost, caps?: KernelCaps): Kernel;
/** Decode the embedded module (kernel-wasm.ts carries it base64: no fetch,
 *  no file, no host plumbing — one artifact on every host). */
export declare function decodeWasm(b64: string): Uint8Array;
