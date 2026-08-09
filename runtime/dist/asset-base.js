// THE ASSET BASE — the data.ts `provideTransport` shape, for the things a
// program loads by URL: bitmaps (image.ts), media (media.ts), and the web
// faces of its `font` declarations (boot.ts).
//
// A leaf module ON PURPOSE. The render glue needs this rule to rebase a face
// src, and pulling it out of image.ts is what keeps the Image class out of a
// bundle that renders no bitmaps (the registry-exclusion rule, slim.test.mjs).
// It imports nothing.
//
//  A relative `source` names a file beside the PROGRAM, exactly as a
//  DataSource's `url` does: `Image [ source = "shots/cal.webp" ]` is the
//  sibling of `DataSource [ url = "stats.json" ]` and has to mean the same
//  place. But an <img src> resolves against the DOCUMENT, and the two only
//  coincide when a program is browsed at its own path. An entry page that
//  boots a program from elsewhere in the tree — index.html at the root running
//  apps/homepage/homepage.declare — resolved every relative bitmap against the
//  wrong directory, silently, while its DataSources were fine.
//
//  So the host states the program's directory once and every load resolves
//  through it. Absolute, protocol-relative, root-relative and data: sources
//  pass through untouched. The default is identity — exactly what a program
//  browsed at its own path already had.
/** The PAGE's base — the one program a plain host boots. */
let assetBase = null;
/** Set the base that relative sources resolve against; returns the previous
 *  one, so a scoped caller can restore it — the provideTransport contract. */
export function provideAssetBase(base) {
    const prev = assetBase;
    assetBase = base;
    return prev;
}
/** PER-APP bases, keyed by tree root. One page can run apps from different
 *  directories at once — an embedded child in an island (a docs preview, the
 *  Viewer's edit pane) has its own program dir, and its relative sources mean
 *  "beside MY file", not beside the host's. The page base above stays the
 *  default; a root registered here overrides it for that app alone. Keyed
 *  rather than scoped around the render because `source` is live: a bitmap
 *  re-pointed an hour after mount must resolve the way the one mounted with it
 *  did. */
const APP_BASES = new WeakMap();
/** State the directory ONE app's relative assets live in (its program's own).
 *  The embedding host calls it before mount — the child never states its own
 *  base, exactly as it never states its own transport. */
export function setAppAssetBase(root, base) {
    if (base === null)
        APP_BASES.delete(root);
    else
        APP_BASES.set(root, base);
}
/** The base in force for `root` — its own if it has one, else the page's. */
export function assetBaseFor(root) {
    return (root != null ? APP_BASES.get(root) : undefined) ?? assetBase;
}
/** Resolve one relative source against a stated base. Absolute,
 *  protocol-relative, root-relative and data: sources pass through untouched. */
export function rebaseAsset(source, base) {
    if (base === null || source === "")
        return source;
    if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.startsWith("//") || source.startsWith("/"))
        return source;
    try {
        return new URL(source, base).href;
    }
    catch {
        return source;
    }
}
/** Resolve a source for the app `root` belongs to. */
export function resolveAsset(source, root) {
    return rebaseAsset(source, assetBaseFor(root));
}
//# sourceMappingURL=asset-base.js.map