// kernel/image — build a kernel image (declare_kernel.h, "the image") from a
// plain description. The compiler will emit through this; the tests build
// small ones by hand. Layout, all little-endian, 8-byte aligned sections:
//
//   header   u32×8: magic, version, nelems, ncells, nrules, nedges, ncode, nconsts
//   cells    u8 kind per cell (+ pad)            DK_F64 | DK_REF | 0x80 = structural
//   elems    u32 base, u32 parent, u32 nslots     per element
//   rules    i32 target, u8 kind, u8 flags, u16 pad, u32 edge0, u32 nedge, u32 code0, u32 ncode, u32 body
//   edges    u32 cell                             (per rule, contiguous)
//   code     u32 words                            (EXPR bytecode; LOAD/CONST carry an operand word)
//   consts   f64
//   init     f64 per cell                         (initial values; REF cells 0)

export const OP = Object.freeze({
  END: 0, LOAD: 1, CONST: 2, ADD: 3, SUB: 4, MUL: 5, DIV: 6, MOD: 7, NEG: 8,
  MIN: 9, MAX: 10, ABS: 11, FLOOR: 12, CEIL: 13, ROUND: 14, SQRT: 15,
  LT: 16, LE: 17, GT: 18, GE: 19, EQ: 20, NE: 21, AND: 22, OR: 23, NOT: 24,
  SELECT: 25, CLAMP: 26,
});
export const KIND = Object.freeze({ EXPR: 0, BODY: 1, DYNAMIC: 2 });
export const FLAG = Object.freeze({ YIELDING: 1, PHASE1: 2, STRUCTURAL: 4 });
export const CELL = Object.freeze({ F64: 0, REF: 1 });

const align8 = (n) => (n + 7) & ~7;

/**
 * @param {{
 *   elems: { nslots: number, parent?: number }[],
 *   cells?: { kind?: number, structural?: boolean, init?: number }[],   // per cell, in elem order; default F64/0
 *   rules: { target: number, kind: number, flags?: number, edges?: number[], code?: number[], body?: number }[],
 *   consts?: number[],
 * }} d
 */
export function buildImage(d) {
  const elems = d.elems.map((e, i) => ({ nslots: e.nslots, parent: e.parent ?? 0xffffffff, base: 0, i }));
  let ncells = 0;
  for (const e of elems) { e.base = ncells; ncells += e.nslots; }
  const cells = Array.from({ length: ncells }, (_, i) => d.cells?.[i] ?? {});
  const rules = d.rules.map((r) => ({ target: r.target ?? -1, kind: r.kind, flags: r.flags ?? 0, edges: r.edges ?? [], code: r.code ?? [], body: r.body ?? 0 }));
  const edges = rules.flatMap((r) => r.edges);
  const code = rules.flatMap((r) => r.code);
  const consts = d.consts ?? [];
  for (const r of rules) for (const c of r.edges) if (c >= ncells) throw new Error(`edge to cell ${c} of ${ncells}`);

  const sizes = [32, align8(ncells), 12 * elems.length, 28 * rules.length, 4 * edges.length, 4 * code.length, 8 * consts.length, 8 * ncells].map(align8);
  const offs = []; let total = 0;
  for (const s of sizes) { offs.push(total); total += s; }
  const buf = new ArrayBuffer(total); const dv = new DataView(buf); const u8 = new Uint8Array(buf);
  const w32 = (o, v) => dv.setUint32(o, v >>> 0, true), wi32 = (o, v) => dv.setInt32(o, v, true), w64 = (o, v) => dv.setFloat64(o, v, true);
  [0x4C4E524B, 1, elems.length, ncells, rules.length, edges.length, code.length, consts.length].forEach((v, i) => w32(i * 4, v));
  cells.forEach((c, i) => { u8[offs[1] + i] = (c.kind ?? 0) | (c.structural ? 0x80 : 0); });
  elems.forEach((e, i) => { const o = offs[2] + 12 * i; w32(o, e.base); w32(o + 4, e.parent); w32(o + 8, e.nslots); });
  let e0 = 0, c0 = 0;
  rules.forEach((r, i) => {
    const o = offs[3] + 28 * i;
    wi32(o, r.target); u8[o + 4] = r.kind; u8[o + 5] = r.flags; dv.setUint16(o + 6, 0, true);
    w32(o + 8, e0); w32(o + 12, r.edges.length); w32(o + 16, c0); w32(o + 20, r.code.length); w32(o + 24, r.body);
    e0 += r.edges.length; c0 += r.code.length;
  });
  edges.forEach((c, i) => w32(offs[4] + 4 * i, c));
  code.forEach((c, i) => w32(offs[5] + 4 * i, c));
  consts.forEach((c, i) => w64(offs[6] + 8 * i, c));
  cells.forEach((c, i) => w64(offs[7] + 8 * i, c.init ?? 0));
  return { bytes: new Uint8Array(buf), ncells, cellOf: (elem, slot) => elems[elem].base + slot };
}

/** A tiny expression assembler: expr(["load", 3], ["const", 2], "mul") → code words. */
export function assemble(consts, ...items) {
  const code = [];
  for (const it of items) {
    if (Array.isArray(it)) {
      const [op, arg] = it;
      if (op === "load") { code.push(OP.LOAD, arg); continue; }
      if (op === "const") { let i = consts.indexOf(arg); if (i < 0) { i = consts.length; consts.push(arg); } code.push(OP.CONST, i); continue; }
      throw new Error("bad item " + op);
    }
    const op = OP[it.toUpperCase()]; if (op === undefined) throw new Error("bad op " + it); code.push(op);
  }
  code.push(OP.END);
  return code;
}
