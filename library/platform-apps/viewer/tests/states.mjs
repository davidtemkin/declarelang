// THE DOCUMENT MUST BE THERE BEFORE THE SHOT. The viewer fetches its OWN source
// (`?segments` / `?file`) and the harness compiles that on demand, so the first
// request is slow and every later one is cached. With only a timeout to lean on,
// a cold run captured the empty app — 360×220, its size with no document — and a
// warm run captured the real one, which made the baseline depend on how recently
// the suite had run rather than on the program.
//
// So each state WAITS FOR THE DOCUMENT. The app fills its host once it has one,
// which is the honest signal here and the one thing the capture actually needs.
const documentShown = async ({ page }) => {
  await page.waitForFunction(() => (window.__declare?.inspect()?.width ?? 0) > 400,
    { timeout: 30000, polling: 100 });
};

// The viewer's named visual states.
//
//   bless:   node tools/verify.mjs library/platform-apps/viewer/viewer.declare --states library/platform-apps/viewer/tests/states.mjs --bless
//   compare: node tools/verify.mjs library/platform-apps/viewer/viewer.declare --states library/platform-apps/viewer/tests/states.mjs
//
// Thin on purpose. The viewer's stake in this work is its BESPOKE chrome — the
// ModeSeg mode switch and its own theme switch, both of which restate house
// concepts under private token names. The theme split is a rename, so it must
// show a zero-pixel diff in whatever state exists; these two suffice for that.
// Richer states (mode switching, the theme door) arrive with step 6, when the
// migration is in this file anyway and the paths are already in hand.
export default [
  { name: "reader", route: documentShown },
  { name: "reader-narrow", viewport: { width: 560, height: 900 }, route: documentShown },

  // THE DARK READING SHEET. The viewer carried a second palette (GitHub's) over
  // the house one, so the same markdown read #0D1117 here and #18212C in the
  // desktop's reader window — one document, two houses. It now paints the house
  // `surface`, which is the token a window paints; this state is what holds the
  // two mounts together, and nothing else in the suite looks at viewer dark.
  { name: "reader-dark", scheme: "dark", route: documentShown },
];

// `frames: true` captures a state as a sequence of settled viewport frames
// instead of one tall image — for a document that runs past a screen, which is
// what makes a prose regression locatable (the failure names the frame). The
// sample document here fits one viewport, so it stays off; turn it on for a
// state that opens a long one.
