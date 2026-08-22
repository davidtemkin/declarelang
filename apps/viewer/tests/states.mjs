// The viewer's named visual states.
//
//   bless:   node tools/verify.mjs apps/viewer/viewer.declare --states apps/viewer/tests/states.mjs --bless
//   compare: node tools/verify.mjs apps/viewer/viewer.declare --states apps/viewer/tests/states.mjs
//
// Thin on purpose. The viewer's stake in this work is its BESPOKE chrome — the
// ModeSeg mode switch and its own theme switch, both of which restate house
// concepts under private token names. The theme split is a rename, so it must
// show a zero-pixel diff in whatever state exists; these two suffice for that.
// Richer states (mode switching, the theme door) arrive with step 6, when the
// migration is in this file anyway and the paths are already in hand.
export default [
  { name: "reader" },
  { name: "reader-narrow", viewport: { width: 560, height: 900 } },

  // THE DARK READING SHEET. The viewer carried a second palette (GitHub's) over
  // the house one, so the same markdown read #0D1117 here and #18212C in the
  // desktop's reader window — one document, two houses. It now paints the house
  // `surface`, which is the token a window paints; this state is what holds the
  // two mounts together, and nothing else in the suite looks at viewer dark.
  { name: "reader-dark", scheme: "dark" },
];
