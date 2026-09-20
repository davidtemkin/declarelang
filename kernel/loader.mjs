// kernel/loader — the kernel from JS: instantiate the WASM once, place the
// arena in its linear memory, bind the five host callbacks, and hand back the
// ABI as plain functions plus a Float64Array over the slot table. The same
// shape the browser runtime and the tests use.
//
//   const k = await loadKernel(wasmBytes, image, { body, afterSteps, fireChanges, endChain, error }, caps);
//   k.table[k.cell(elem, slot)]      // read a slot: no call
//   k.write(cell, v); k.settle();    // the ABI, one JS function per export

export const ERR = Object.freeze({ IMAGE: -1, ARENA: -2, OWNED: -3, CYCLE: -4, AFTER: -5, BOUND: -6, FULL: -7, BAD: -8 });

export async function loadKernel(wasmBytes, image, host, caps = {}) {
  const c = { extra_elems: 0, extra_cells: 0, extra_rules: 0, dyn_edges: 0, ...caps };
  let x = null;                                  // exports, once instantiated
  const imports = {
    host: {
      body: (rule, elem, target) => +host.body(rule, elem, target),
      after_steps: () => (host.afterSteps?.() ? 1 : 0),
      fire_changes: () => (host.fireChanges?.() ? 1 : 0),
      end_chain: () => host.endChain?.(),
      error: (code, rule) => host.error?.(code, rule),
      schedule: () => host.schedule?.(),

      decline: () => {},
      sin: Math.sin, cos: Math.cos, tan: Math.tan,
    },
  };
  const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
  x = instance.exports;
  const mem = x.memory;
  const bytes = image.bytes ?? image;
  // the image goes at the heap base, the caps struct after it, the arena after that
  let heap = (x.__heap_base.value + 7) & ~7;
  const need = (extra) => { const end = heap + extra; if (end > mem.buffer.byteLength) mem.grow(Math.ceil((end - mem.buffer.byteLength) / 65536)); };
  const imgAt = heap; need(bytes.length); new Uint8Array(mem.buffer).set(bytes, imgAt); heap += (bytes.length + 7) & ~7;
  const capsAt = heap; need(32); new Uint32Array(mem.buffer, capsAt, 8).set([c.extra_elems, c.extra_cells, c.extra_rules, c.dyn_edges, c.ring ?? 0, c.code_words ?? 0, c.consts ?? 0, c.track_ring ?? 0]); heap += 32;
  const arenaBytes = x.kernel_arena_size(imgAt, bytes.length, capsAt);
  if (arenaBytes === 0) throw new Error("kernel: bad image");
  const arenaAt = heap; need(arenaBytes); heap += arenaBytes;
  const k = x.kernel_load(imgAt, bytes.length, capsAt, arenaAt, arenaBytes, 0);
  if (k === 0) throw new Error("kernel: load failed");
  const ncells = x.kernel_cells(k) + c.extra_cells;   /* the table spans the capacity: runtime cells land in it */
  const tableAt = x.kernel_table(k);
  // scratch for edge lists handed to kernel_add_rule
  const scratchAt = heap; need(4 * 256); heap += 4 * 256;
  let table = new Float64Array(mem.buffer, tableAt, ncells);
  const active = new Int32Array(mem.buffer, x.kernel_active_ptr(k), 1);
  const dirtyAt = heap; need(4 * ncells); heap += 4 * ncells;
  const api = {
    get table() { if (table.buffer !== mem.buffer) table = new Float64Array(mem.buffer, tableAt, ncells); return table; },
    active,                      // active[0] === -1 unless a DYNAMIC rule is running
    ncells, nrules: () => x.kernel_rules(k), nelems: x.kernel_elems(k),
    cell: (elem, slot) => x.kernel_cell(k, elem, slot),
    write: (cell, v) => x.kernel_write(k, cell, v),
    set: (cell, v) => x.kernel_set(k, cell, v),
    touch: (cell) => x.kernel_touch(k, cell),
    isSet: (cell) => x.kernel_is_set(k, cell) === 1,
    own: (cell, rule) => x.kernel_own(k, cell, rule),
    release: (cell, rule) => x.kernel_release(k, cell, rule),
    owner: (cell) => x.kernel_owner(k, cell),
    run: (rule) => x.kernel_run(k, rule),
    invalidate: (rule) => x.kernel_invalidate(k, rule),
    dispose: (rule) => x.kernel_dispose(k, rule),
    suspend: (rule) => x.kernel_suspend(k, rule),
    resume: (rule) => x.kernel_resume(k, rule),
    track: (cell) => x.kernel_track(k, cell),
    settle: () => x.kernel_settle(k),
    pending: () => x.kernel_pending(k) === 1,
    dirty() { const n = x.kernel_dirty(k, dirtyAt, ncells); return Array.from(new Uint32Array(mem.buffer, dirtyAt, Math.min(n, ncells))); },
    addCell: (kind = 1, structural = false) => x.kernel_add_cell(k, kind, structural ? 1 : 0),
    freeCell: (cell) => x.kernel_free_cell(k, cell),
    state: (rule) => x.kernel_state(k, rule),
    abort: () => x.kernel_abort(k),
    rewire(rule, edges) {
      if (edges.length > 256) throw new Error("kernel: too many edges for one rule");
      new Uint32Array(mem.buffer, scratchAt, edges.length).set(edges);
      return x.kernel_rewire(k, rule, scratchAt, edges.length);
    },
    addRule(target, kind, flags, edges = [], body = 0) {
      if (edges.length > 256) throw new Error("kernel: too many edges for one runtime rule");
      new Uint32Array(mem.buffer, scratchAt, edges.length).set(edges);
      return x.kernel_add_rule(k, target, kind, flags, scratchAt, edges.length, 0, 0, body);
    },
    memory: mem, arenaBytes, wasmBytes: bytes.length,
  };
  return api;
}
