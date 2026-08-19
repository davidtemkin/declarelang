// THE PER-APP DATA BASE — asset-base.ts's twin, and a leaf module for the same
// stated reason: boot wiring needs to REGISTER a tenant's data directory
// without pulling data.js (Dataset, DataSource, the fetch machinery) into a
// bundle whose program declares no data at all. The slimming lever only works
// if registration lives where nothing heavy follows. It imports nothing.
//
// data.ts consumes the table at fetch time (appResolve); everything else —
// bootHost, renderAsync, renderProgramAsync — only ever registers.
/** PER-APP data bases, keyed by tree root: one page can run programs from
 *  different directories at once, and each one's relative `url` means "beside
 *  MY file" (language §9's sibling rule, per tenant instead of
 *  last-boot-wins). A base REBASES the url; delegation to the global
 *  transport stays in data.ts — so a headless refuser still refuses and a
 *  test stub still intercepts. */
const appDataBases = new WeakMap();
export function setAppDataBase(root, base) {
    if (base === null)
        appDataBases.delete(root);
    else
        appDataBases.set(root, base);
}
/** Resolve a source's url through its app's base (identity when none). */
export function appResolve(root, url) {
    const base = appDataBases.get(root);
    if (base === undefined)
        return url;
    try {
        return new URL(url, base).href;
    }
    catch {
        return url;
    }
}
//# sourceMappingURL=data-base.js.map