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
  "test/error-codes.test.mjs",
  "test/release.test.mjs",         // a release is a projection of the tree: the check, the scaffold, the projection
  "test/databinding.test.mjs",
  "test/dataset-merge.test.mjs",
  "test/change-event.test.mjs",
  "test/cursor-reach.test.mjs",
  "test/provided-text-style.test.mjs",
  "test/hit-3d.test.mjs",
  "test/super.test.mjs",
  "test/subclass-roots.test.mjs",  // a class extends ANY built-in: Spring, DataSource, AnimatorGroup, Keys, State, …
  "test/override-runtime.test.mjs", // a method replaces a built-in's RUNTIME method; super reaches the runtime's; the method table is pinned
  "test/materialization.test.mjs",
  "test/dataschema.test.mjs",
  "test/datasource-failure.test.mjs",
  "test/table.test.mjs",
  "test/components.test.mjs",
  "test/tracker.test.mjs",
  "test/streams.test.mjs",
  "test/runtime-errors.test.mjs",
  "test/dep-extract.test.mjs",
  "test/dep-projection.test.mjs",
  "test/script-block.test.mjs",
  "test/script-module.test.mjs",
  "test/static-constraint.test.mjs",
  "test/highlight.test.mjs",
  "test/inspect.test.mjs",
  "test/format.test.mjs",
  "test/md.test.mjs",
  "test/themes.test.mjs",
  "test/html.test.mjs",
  "test/richtext.test.mjs",
  "test/inline-views.test.mjs",    // a program class as a tag in rich text: one real view, placed in the line (DOM + canvas)
  "test/text.test.mjs",            // the silent text regressions only: headless, one stub measurer, ~1s
  "test/md-conformance.test.mjs",  // Declare's Markdown reader vs markdown-it (VS Code's) over the CommonMark+GFM surface
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
  "test/scroll-loop.test.mjs",     // the runtime scroll provider on canvas: wheel batching, glides, touch physics, arbitration
  "test/history.test.mjs",
  "test/embed.test.mjs",
  "test/dep-typed.test.mjs",
  "test/vis-camera.test.mjs",
  "test/reader-flow.test.mjs",
  "test/raster-memo.test.mjs",
  "test/canvas-filter.test.mjs",   // the Safari filter fallback, pinned from Chrome via the forced-fallback lever
  "test/draw-bounds.test.mjs",     // text bounds, per-op extents, replayArea, byte-identical culling
  "test/island.test.mjs",
  "test/island-browser.test.mjs",
  "test/two-way.test.mjs",         // the apps/two-way showcase: the whole embedder surface on one page
  "test/verify-apps.test.mjs",
  "test/eval-references.test.mjs",
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
