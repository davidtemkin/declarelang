// timing — where a verify or a look spends its time, by stage, when DECLARE_TIMING=1.
// Off, every call is a pass-through. On, each span is summed by its label and the
// table is printed to stderr as the process exits: the agent's check is one command,
// and this says which of its parts (the server, Chrome, compiling, booting the page,
// each kind of drive step, a screenshot) took its time.

import { appendFileSync } from "node:fs";

// DECLARE_TIMING_FILE: the same, appended as one JSON line per process to that file
// and not printed — so an eval can time an agent's checks without the agent seeing it
const FILE = process.env.DECLARE_TIMING_FILE ?? "";
const ON = process.env.DECLARE_TIMING === "1" || FILE !== "";
const T0 = performance.now();
const spans = new Map();

const add = (label, ms) => {
  const s = spans.get(label) ?? { n: 0, ms: 0 };
  s.n++; s.ms += ms;
  spans.set(label, s);
};

export const timing = {
  on: ON,
  add,
  /** Run `fn`, counting its time under `label`. */
  async time(label, fn) {
    if (!ON) return fn();
    const s = performance.now();
    try { return await fn(); } finally { add(label, performance.now() - s); }
  },
  /** Every function member of `obj`, each counted under `prefix.name`. */
  wrap(prefix, obj) {
    if (!ON) return obj;
    for (const [k, f] of Object.entries(obj)) {
      if (typeof f === "function") obj[k] = (...a) => timing.time(`${prefix}.${k}`, () => f.apply(obj, a));
    }
    return obj;
  },
};

// a generated look script, run inside verify, reaches the same table
if (ON) globalThis.__declareTiming = timing;

if (ON) process.on("exit", () => {
  const total = performance.now() - T0;
  const rows = [...spans].sort((a, b) => b[1].ms - a[1].ms);
  if (FILE !== "") {
    try {
      appendFileSync(FILE, JSON.stringify({ at: new Date().toISOString(), argv: process.argv.slice(1).join(" "), ms: Math.round(total),
        spans: Object.fromEntries(rows.map(([l, x]) => [l, { n: x.n, ms: Math.round(x.ms) }])) }) + "\n");
    } catch { /* timing is a courtesy, never the run's failure */ }
    return;
  }
  const out = [`timing: ${(total / 1000).toFixed(2)} s in all`];
  for (const [label, s] of rows) out.push(`  ${(s.ms / 1000).toFixed(2).padStart(7)} s  ${String(s.n).padStart(4)}×  ${label}`);
  process.stderr.write(out.join("\n") + "\n");
});
