// browser/prewarm-manifest.js — WHICH programs ship precompiled. The curated set
// itself, as data, browser-safe and dependency-free.
//
// This is a DECLARATION, not a build product. It used to live inside
// tools/internal/prewarm.mjs as a private const, which meant only the writer knew
// the set and every reader had to GUESS — computing a key and fetching it to find
// out, so the common answer ("this program is not precompiled") arrived as a 404
// on every load of every app that isn't on the list.
//
// It cannot be generated into this directory either: derive's `bundles` rule
// bundles browser/ into declare-boot.js and runs BEFORE `prewarm`, so a file
// prewarm wrote here would never reach the bundle it is needed in, and would
// leave the tree permanently stale. Declaring it is also simply truer — the set
// is a curatorial choice, and the artifacts derive from it, not the reverse.
//
// THE ONE LIST, three readers:
//   • tools/internal/prewarm.mjs   — writes an artifact for each entry
//   • browser/boot-uniform.js      — asks "is there a build for this program?"
//                                    BEFORE requesting anything (bundled: free)
//   • service-worker.js            — the same question for the `?segments` route
//
// so the writer and the readers cannot disagree about what exists, the way they
// could when only the writer knew. (prewarm-cache.js remains the oracle for HOW a
// key is computed; this is the oracle for WHICH keys exist.)

/** The curated set. Small on purpose — the flagship, high-traffic pages, the ones
 *  whose compiler-free first paint is worth committing an artifact for. Everything
 *  else is ordinary browser-compile; this tier is additive, never required.
 *
 *  `main` is the DEPLOY-RELATIVE path (the same identity prewarmKey takes);
 *  `props` are the compiler properties the artifact was built with. */
export const PREWARMED = [
  { main: "apps/homepage/homepage.declare", props: { render: "dom" } },
  { main: "apps/calendar/calendar.declare", props: { render: "dom" } },
  { main: "apps/docs/docs.declare", props: { render: "dom" } },
  { main: "apps/desktop/desktop.declare", props: { render: "dom" } },
  // the Tracker is the capstone — the program people are pointed at to judge the
  // platform — and the heaviest in the corpus, so it has the most to gain from
  // skipping the compiler on the way to first paint
  { main: "apps/tracker/tracker.declare", props: { render: "dom" } },
  // every View Source / ?viewer= page boots the viewer — high-traffic on the
  // static deploy, so its first paint deserves the compiler-free path too
  { main: "apps/viewer/viewer.declare", props: { render: "dom" } },
  // the homepage's live demo panels (index.html `demos: […]`): prewarmed, the
  // previews mount the moment the page paints — no compiler download on the path
  // at all. Islands always render on the DOM backend, so render:dom is the one key.
  { main: "apps/homepage/demos/components.declare", props: { render: "dom" } },
  { main: "apps/homepage/demos/reactivity.declare", props: { render: "dom" } },
  { main: "apps/homepage/demos/spring.declare", props: { render: "dom" } },
  { main: "apps/homepage/demos/states.declare", props: { render: "dom" } },
  { main: "apps/homepage/demos/derived.declare", props: { render: "dom" } },
];

const BY_MAIN = new Map(PREWARMED.map((p) => [p.main, p]));

/** Is there a committed build for this deploy-relative program? Answered from the
 *  list, with NO request — the whole point. `props` must match the artifact's,
 *  since a canvas-backend page and a dom-backend page are different builds. */
export function prewarmedEntry(relMain, props = {}) {
  const e = BY_MAIN.get(relMain);
  if (e === undefined) return null;
  const want = e.props ?? {};
  const keys = new Set([...Object.keys(want), ...Object.keys(props)]);
  for (const k of keys) if (want[k] !== props[k]) return null;
  return e;
}

/** Does this program ship its viewer artifacts (`?segments`)? Every prewarmed
 *  program does — prewarm.mjs writes both kinds for each entry. */
export function hasSegments(relMain) {
  return BY_MAIN.has(relMain);
}
