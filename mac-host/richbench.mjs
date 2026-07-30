// Where a native re-wrap actually spends its time, and whether that changes as
// the process ages.
//
//   node richbench.mjs <WindowClassName> [reps]
//
// Repeats the SAME narrow-then-restore drag N times in one process and prints
// the parse / build / layout split each round. Two questions at once:
//   • of the per-frame cost, how much is genuinely LAYOUT (irreducible) versus
//     re-parsing the JSON and rebuilding the attributed string (the JS→Swift
//     boundary, which a width change does not actually require)?
//   • does any of it GROW with process age? The host is long-lived and has no
//     per-probe isolation, so a number read after a long session is not
//     comparable to one read on a fresh launch.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
const IN = "/tmp/declare-ctl.in", OUT = "/tmp/declare-ctl.out";
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

async function ctl(cmd) {
  if (existsSync(OUT)) unlinkSync(OUT);
  writeFileSync(IN, cmd + "\n");
  for (let i = 0; i < 400; i++) { await sleep(0.02); if (existsSync(OUT)) return readFileSync(OUT, "utf8").trim(); }
  throw new Error("no reply from the host");
}

const CLS = process.argv[2] ?? "JotWindow";
const REPS = Number(process.argv[3] ?? 4);
const STEPS = 60, HZ = 30, DX = -Number(process.argv[4] ?? 197);

const box = async () => JSON.parse(await ctl(`eval (function(){var c=window.__declare.find('app.wins').children||[]; for (var i=0;i<c.length;i++){ var w=c[i]; if (w.constructor.name==='${CLS}') return JSON.stringify([Math.round(w.x),Math.round(w.y),Math.round(w.width),Math.round(w.height)]); } return 'null'; })()`));

const b0 = await box();
if (b0 === null) { console.log(`no ${CLS} on screen`); process.exit(1); }
console.log(`\n  ${CLS} at ${b0[0]},${b0[1]} ${b0[2]}x${b0[3]} — ${STEPS} steps @ ${HZ}Hz, ${REPS} rounds\n`);
console.log("  round   richLayout   parse    build     layout   redraw   gap p95   frames missed");
console.log("  " + "─".repeat(78));

const num = (s, re) => { const m = s.match(re); return m ? Number(m[1]) : 0; };
for (let r = 1; r <= REPS; r++) {
  const [x, y, w, h] = await box();
  await ctl("statsreset");
  await ctl(`dragsweep ${x + w + 2} ${y + Math.round(h / 2)} ${DX} ${STEPS} ${HZ}`);
  await sleep(STEPS / HZ + 3);
  const s = await ctl("stats");
  const total = num(s, /richLayout n=\d+ ([\d.]+)ms/);
  const parse = num(s, /parse=([\d.]+)ms/), build = num(s, /build=([\d.]+)ms/), lay = num(s, /layout=([\d.]+)ms/);
  const redraw = num(s, /RichOverlay\.redraw n=\d+ [\d.]+ Mpx ([\d.]+)ms/);
  const p95 = num(s, /gap ms\s+p50=[\d.]+ p95=([\d.]+)/), over = num(s, /budget 8\.33\) over=(\d+)/);
  const n = num(s, /richLayout n=(\d+)/);
  console.log(`  ${String(r).padStart(3)}   ${(total + "ms").padStart(9)} ${(parse.toFixed(0) + "ms").padStart(8)} ${(build.toFixed(0) + "ms").padStart(8)} ${(lay.toFixed(0) + "ms").padStart(9)} ${(redraw + "ms").padStart(8)} ${(p95 + "ms").padStart(9)} ${String(over).padStart(9)}   (n=${n})`);
  // put it back for the next round
  const [x2, y2, w2, h2] = await box();
  await ctl(`dragsweep ${x2 + w2 + 2} ${y2 + Math.round(h2 / 2)} ${-DX} ${STEPS} ${HZ}`);
  await sleep(STEPS / HZ + 2);
}
console.log();
