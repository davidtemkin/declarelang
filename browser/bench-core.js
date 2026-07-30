// bench-core — one benchmark body, three engines.
//
// The native host runs the runtime in JavaScriptCore; the web client runs it in
// V8 (Chrome) or JSC (Safari). Everything above the Surface protocol is the
// SAME code, so the honest question is not "is native faster" but "where does
// the time actually go, and does the engine keep up". This file is evaluated
// verbatim in each host and returns a plain object of milliseconds — no DOM, no
// platform calls, so a difference is the engine and nothing else.
//
// The shapes matter more than the totals. Declare's hot path is not a numeric
// kernel: it is property reads/writes over a graph of small objects and short
// closure calls (a settle). `props` and `closures` model that; `numeric` and
// `strings` are there to expose whether a JIT is running at all — an
// interpreter loses far more on tight arithmetic than on property traffic, so
// the RATIO between them is the tell.

(function () {
  "use strict";
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const time = (fn) => { const t = now(); const v = fn(); const d = now() - t; return { ms: +d.toFixed(2), v }; };

  // ── 1. numeric kernel — the classic JIT showcase ──────────────────────────
  function numeric() {
    let a = 0;
    for (let i = 0; i < 8e6; i++) a = (a + Math.imul(i, 2654435761)) | 0;
    return a;
  }

  // ── 2. property traffic — what a settle actually does ─────────────────────
  function props() {
    const N = 200, ITER = 4000;
    const objs = [];
    for (let i = 0; i < N; i++) objs.push({ x: i, y: 0, w: 10, h: 10, dirty: false, name: "v" + i });
    let acc = 0;
    for (let k = 0; k < ITER; k++) {
      for (let i = 0; i < N; i++) {
        const o = objs[i];
        o.y = o.x + k;
        o.dirty = (o.y & 7) === 0;
        acc += o.y + o.w;
      }
    }
    return acc;
  }

  // ── 3. closure calls — constraint bodies are short closures ───────────────
  function closures() {
    const fns = [];
    for (let i = 0; i < 200; i++) { const c = i; fns.push((a, b) => a + b * c); }
    let acc = 0;
    for (let k = 0; k < 20000; k++) for (let i = 0; i < 200; i++) acc = (acc + fns[i](k, i)) | 0;
    return acc;
  }

  // ── 4. megamorphic dispatch — the reactive graph is not monomorphic ───────
  function megamorphic() {
    const shapes = [];
    for (let i = 0; i < 8; i++) {
      const o = { kind: i };
      for (let j = 0; j <= i; j++) o["f" + j] = j;
      o.get = function () { return this.kind + (this.f0 || 0); };
      shapes.push(o);
    }
    let acc = 0;
    for (let k = 0; k < 400000; k++) acc += shapes[k & 7].get();
    return acc;
  }

  // ── 5. string + JSON — the op buffer's own cost ───────────────────────────
  function jsonBuffer() {
    const ops = [];
    for (let i = 0; i < 20000; i++) ops.push([5, i, i * 1.5, i * 2.5, 100, 40]);
    const s = JSON.stringify(ops);
    const back = JSON.parse(s);
    return s.length + back.length;
  }

  // ── 6. allocation churn — surfaces and boxes are created constantly ───────
  function alloc() {
    let last = null, n = 0;
    for (let i = 0; i < 600000; i++) { last = { x: i, y: i, w: 1, h: 1, next: last && null }; n += last.x & 1; }
    return n;
  }

  const out = {};
  // warm each once (a JIT needs to see the code before it is fast; an
  // interpreter is unaffected — which is itself part of the signal)
  numeric(); props(); closures(); megamorphic(); jsonBuffer(); alloc();
  out.numeric = time(numeric).ms;
  out.props = time(props).ms;
  out.closures = time(closures).ms;
  out.megamorphic = time(megamorphic).ms;
  out.json = time(jsonBuffer).ms;
  out.alloc = time(alloc).ms;
  out.total = +Object.values(out).reduce((a, b) => a + b, 0).toFixed(2);
  return out;
})();
