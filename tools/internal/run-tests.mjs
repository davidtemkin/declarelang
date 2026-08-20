// run-tests.mjs — run the test files IN SEQUENCE, run ALL of them, and report
// every failure at the end. This replaced a package.json `&&` chain, which
// stopped at the first failing file: a formatting failure in the middle of the
// list silently skipped the seventeen suites after it, and "the suite passed"
// could mean "the suite ran until it didn't". A test run's job is to deliver
// the WHOLE verdict, once.
//
//   node tools/internal/run-tests.mjs             # the full suite (list below)
//   node tools/internal/run-tests.mjs test/a.test.mjs test/b.test.mjs
//
// Sequential on purpose: the files bind ports, launch browsers, and share a
// build — they are written as sole tenants of the machine.

import { spawnSync } from "node:child_process";

const SUITE = [
  "test/unit.test.mjs",
  "test/seam.test.mjs",
  "test/perceptual.test.mjs",
  "test/scaffold.test.mjs",
  "test/declarec.test.mjs",
  "test/diagnostics-hints.test.mjs",
  "test/databinding.test.mjs",
  "test/materialization.test.mjs",
  "test/dataschema.test.mjs",
  "test/datasource-failure.test.mjs",
  "test/table.test.mjs",
  "test/components.test.mjs",
  "test/tracker.test.mjs",
  "test/streams.test.mjs",
  "test/dep-extract.test.mjs",
  "test/dep-projection.test.mjs",
  "test/script-block.test.mjs",
  "test/static-constraint.test.mjs",
  "test/highlight.test.mjs",
  "test/inspect.test.mjs",
  "test/format.test.mjs",
  "test/md.test.mjs",
  "test/themes.test.mjs",
  "test/html.test.mjs",
  "test/richtext.test.mjs",
  "test/slim.test.mjs",
  "test/crawl.test.mjs",
  "test/serve-parity.test.mjs",
  "test/serve.test.mjs",
  "test/toolchain-realm.test.mjs",
  "test/hydrate.test.mjs",
  "test/prod-parity.test.mjs",
  "test/serve-browser.test.mjs",
  "test/static-host.test.mjs",
  "test/streams-browser.test.mjs",
  "test/network-browser.test.mjs",
  "test/desktop-input.test.mjs",
  "test/transform-layout.test.mjs",
  "test/safearea.test.mjs",
  "test/gesture.test.mjs",
  "test/history.test.mjs",
  "test/embed.test.mjs",
  "test/dep-typed.test.mjs",
  "test/vis-camera.test.mjs",
  "test/reader-flow.test.mjs",
  "test/island.test.mjs",
  "test/island-browser.test.mjs",
  "test/verify-apps.test.mjs",
];

const files = process.argv.slice(2).length ? process.argv.slice(2) : SUITE;
const failed = [];
const t0 = Date.now();
for (const f of files) {
  const r = spawnSync(process.execPath, [f], { stdio: "inherit" });
  if (r.status !== 0) failed.push({ f, code: r.status ?? `signal ${r.signal}` });
}
const mins = ((Date.now() - t0) / 60000).toFixed(1);
if (failed.length === 0) {
  console.log(`\nrun-tests: all ${files.length} file(s) passed (${mins} min)`);
} else {
  console.error(`\nrun-tests: ${failed.length} of ${files.length} file(s) FAILED (${mins} min):`);
  for (const { f, code } of failed) console.error(`   ${f}  (exit ${code})`);
  process.exit(1);
}
