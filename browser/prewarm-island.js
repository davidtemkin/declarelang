// browser/prewarm-island.js — an island's program from a build the distro ships.
//
// A page on the distro can mount a program that ships precompiled (the desktop
// opening the calendar in a window, the homepage's demos) with NO compiler and
// NO parse: the manifest says whether a build exists — no request — and the
// artifact's program object instantiates directly. The page boot
// (boot-page.js) takes this as its `prewarm`; two hosts hand it over — the
// distro's resolver (boot-uniform.js) and a site page's own module (a
// production build made for the distro: tools/internal/prewarm.mjs). A
// deployed app has no artifacts and never imports this.
import { loadBuild, relativize } from "./prewarm-cache.js";
import { prewarmedEntry } from "./prewarm-manifest.js";
import { hydrateProgram } from "../runtime/dist/host-api.js";

// Islands always render on the DOM backend (host-client renderChild), so the
// key uses render:dom regardless of the page's own backend.
const ISLAND_PROPS = { render: "dom" };

/** The prewarmed program for the program at `programUrl`, hydrated — a fresh
 *  object per load, so every mount instantiates its own tree — or null when the
 *  distro ships none (the island then compiles). `root` is the distro root. */
export async function prewarmIsland(programUrl, root) {
  const rel = relativize(programUrl, root);
  if (!rel || prewarmedEntry(rel, ISLAND_PROPS) === null) return null;
  const warm = await loadBuild({ root, relMain: rel, kind: "run", props: ISLAND_PROPS, fetchImpl: fetch });
  return warm && warm.programJson ? { program: hydrateProgram(warm.programJson) } : null;
}
