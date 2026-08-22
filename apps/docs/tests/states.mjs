// The docs app's named visual states.
//
//   bless:   node tools/verify.mjs apps/docs/docs.declare --states apps/docs/tests/states.mjs --bless
//   compare: node tools/verify.mjs apps/docs/docs.declare --states apps/docs/tests/states.mjs
//
// Thin on purpose, for the same reason as the viewer's: what the docs app
// contributes here is a bespoke Guide/Reference tab pair and a private token
// vocabulary. The theme split must not move a pixel of it; step 6 adds the
// tab-switching states when the migration lands in this file.
export default [
  { name: "guide" },
  { name: "guide-narrow", viewport: { width: 560, height: 900 } },
];
