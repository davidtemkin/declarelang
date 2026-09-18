// The docs app's named visual states.
//
//   bless:   node tools/verify.mjs apps/docs/docs.declare --states apps/docs/tests/states.mjs --bless
//   compare: node tools/verify.mjs apps/docs/docs.declare --states apps/docs/tests/states.mjs
//
// Thin on purpose, for the same reason as the viewer's: what the docs app
// contributes here is a bespoke Guide/Reference tab pair and a private token
// vocabulary. The theme split must not move a pixel of it; step 6 adds the
// tab-switching states when the migration lands in this file.
// A state whose document runs past one screen should add `frames: true`, which
// captures it as a sequence of settled viewport frames rather than one very tall
// image — bounded to look at, and a failure names the screen. Neither guide state
// needs it today: both fit a viewport, so it would emit one frame and rename the
// baseline for nothing.
export default [
  { name: "guide" },
  { name: "guide-narrow", viewport: { width: 560, height: 900 } },
];
