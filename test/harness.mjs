// Tiny test runner shared by unit.test.mjs and perceptual.test.mjs. No
// framework: just enough structure to name cases, catch failures, and print
// a clean pass/fail summary that sets the process exit code.

let passed = 0;
let failed = 0;

/** Run one named case; failures are caught and reported, not thrown. */
export async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok — ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL — ${name}\n    ${err?.stack ?? err}`);
  }
}

/** Print the summary for this process and set exitCode 1 on any failure. */
export function summarize(label) {
  console.log(`${label}: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}
