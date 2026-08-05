// Tiny test runner shared by unit.test.mjs and perceptual.test.mjs. No
// framework: just enough structure to name cases, catch failures, and print
// a clean pass/fail summary that sets the process exit code.
//
// TIMING (`DECLARE_TIMING=1`): every case records its wall time, each `ok` line
// carries it, and `summarize` names the slowest few. One edit here instruments
// every suite importing this file, which is why the timing lives at the HARNESS
// and not in a runner: a runner can only see a suite, and a 380-second suite
// tells you nothing about which of its seven cases spent it.
//
// Measured 2026-08-04, which is why this exists: an eleven-suite gate run took
// 7.5 minutes, of which `crawl` alone was 380s — 85% — because two of its cases
// each extract the docs app (~125s apiece). Per-suite numbers found the suite;
// only per-case numbers name the two lines.

let passed = 0;
let failed = 0;
const TIMING = process.env.DECLARE_TIMING === "1";
/** Per-case wall times, in completion order — the data `summarize` ranks. */
const times = [];

/** Run one named case; failures are caught and reported, not thrown. */
export async function test(name, fn) {
  const t0 = TIMING ? Date.now() : 0;
  try {
    await fn();
    passed++;
    if (TIMING) times.push({ name, ms: Date.now() - t0 });
    console.log(`  ok — ${name}${TIMING ? ` (${Date.now() - t0}ms)` : ""}`);
  } catch (err) {
    failed++;
    if (TIMING) times.push({ name, ms: Date.now() - t0 });
    console.error(`  FAIL — ${name}${TIMING ? ` (${Date.now() - t0}ms)` : ""}\n    ${err?.stack ?? err}`);
  }
}

/** Print the summary for this process and set exitCode 1 on any failure. */
export function summarize(label) {
  if (TIMING && times.length > 0) {
    const total = times.reduce((s, t) => s + t.ms, 0);
    // Only cases worth acting on. A flat list of 421 timings is noise; naming the
    // outliers is the point, so anything under a quarter-second stays silent.
    const slow = [...times].sort((a, b) => b.ms - a.ms).filter((t) => t.ms >= 250).slice(0, 5);
    for (const t of slow) console.log(`  ⏱  ${(t.ms / 1000).toFixed(1)}s  ${t.name}`);
    console.log(`${label}: ${(total / 1000).toFixed(1)}s across ${times.length} case(s)`);
  }
  console.log(`${label}: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}
