// Is the memo's KEY the cost? A marketmap drag does ~463k memo lookups, each
// building `font \0 width \0 text` and hashing the whole thing. Compare that
// against a two-level map (font+letterSpacing → text → value), which hashes two
// shorter strings and concatenates nothing.
const SEP = String.fromCharCode(0);
const fonts = [];
for (let i = 8; i < 40; i += 0.5) fonts.push(`500 ${i}px "Inter Variable", Inter, system-ui, sans-serif`);
const texts = [];
for (let i = 0; i < 700; i++) texts.push(["AAPL", "MSFT", "Alphabet Inc", "NVIDIA", "Berkshire Hathaway B"][i % 5] + " " + (i % 97));
const N = 463529;   // the count the driver recorded for one 2.5 s drag
const flat = new Map(), nest = new Map();
for (const f of fonts) {
  const m = new Map();
  for (const t of texts) { flat.set(f + SEP + 0 + SEP + t, t.length); m.set(t, t.length); }
  nest.set(f + SEP + 0, m);
}
const bench = (name, fn) => {
  let acc = 0;
  const t = performance.now();
  for (let i = 0; i < N; i++) acc += fn(i);
  const ms = performance.now() - t;
  console.log(`${name.padEnd(26)} ${ms.toFixed(1)} ms   (${(ms * 1e6 / N).toFixed(0)} ns/lookup)  acc=${acc}`);
  return ms;
};
const nf = fonts.length, nt = texts.length;
bench("flat key (today)", (i) => flat.get(fonts[i % nf] + SEP + 0 + SEP + texts[i % nt]) ?? 0);
bench("two-level map", (i) => nest.get(fonts[i % nf] + SEP + 0)?.get(texts[i % nt]) ?? 0);
const heads = new Map();
for (const f of fonts) heads.set(f, nest.get(f + SEP + 0));
bench("two-level, font key only", (i) => heads.get(fonts[i % nf])?.get(texts[i % nt]) ?? 0);
