// scale — murmur's history at N times its length, for measuring at size.
//
// Each conversation becomes `factor` times as long: its own history, replayed
// further back in time with fresh ids, ahead of the real history, which stays
// untouched at the end (the live schedule, lastSeen and reactions refer to it).
// Every copy's text is its own, so a row can be told from its replays; the one
// exception is each thread's last message, which the benchmarks look for by text.

export function scaleHistory(doc, factor) {
  if (!(factor > 1)) return doc;
  const out = structuredClone(doc);
  let next = 100000;
  for (const t of out.threads) {
    const real = t.messages;
    const t0 = Date.parse(real[0].at), t1 = Date.parse(real.at(-1).at);
    const span = Math.max(t1 - t0, 3600_000);
    const copies = [];
    for (let k = factor - 1; k >= 1; k--) {                  // oldest copy first
      for (const m of real) {
        const c = { ...m, id: `m${next++}`, at: new Date(Date.parse(m.at) - k * (span + 3600_000)).toISOString() };
        if (c.kind === "text") c.text = `${c.text} ·${factor - k}`;
        if (k % 3 !== 0) delete c.reactions;                  // some older messages keep their reactions
        copies.push(c);
      }
    }
    t.messages = [...copies, ...real];
    const seen = new Map();
    t.messages.forEach((m, i) => {
      if (m.kind !== "text" || i === t.messages.length - 1) return;
      const n = (seen.get(m.text) ?? 0) + 1;
      seen.set(m.text, n);
      if (n > 1) m.text = `${m.text} #${n}`;
    });
  }
  return out;
}
