// crawl — extraction generalized from the t=0 snapshot to t=0 PER REACHABLE
// LOCATION (docs/system-design/location.md §7). The single-page extractor (static-html.ts) settles the
// DEFAULT location and serializes; the crawl follows the fragment links out of that
// settled tree, cold-boots each new location, and serializes it too, to closure.
//
// Enumeration is a CRAWL, not source analysis: staticHtml already wraps every
// location link — an `app.location = <expr>` write (compiler/src/links.ts) and a
// `[x](#frag)` in rendered content alike — in a real `<a href="#…">`. So the reachable
// set is exactly the `href="#…"` values in the emitted HTML, per settled instance,
// data-driven links included (the docs rail's `"guide/" + cid` over replicated tabs).
// The extractor sees what a live crawler pointed at the running site would see.
//
// THE OUTPUT IS ONE DOCUMENT (David's ruling, 2026-07-15): the program URL is the
// sole address, so the crawl does not mint per-location addresses — it appends each
// reachable location's content to the one extracted document as a `<section
// id="<location>">`. The fragment links then resolve INTRA-document (the docs rail
// is a working table of contents in the static form), and because a section's `id`
// IS the live `app.location` string, any fragment that survives into a click-through
// opens the live app at exactly that location. No rewriting, no synonym addresses,
// no second URL space. The known trade: search engines rank one URL for all the
// content — a click lands on the program URL; at worst, at the default location.
//
// Each location is a FRESH cold boot (seed fragment, settle, serialize) with NO LIVE
// NETWORK (§9, and the build-time data rule): a DataSource url resolves from the
// app's own material — a caller-supplied fixture, or the `data` resolver (disk under
// the origin dir in Node; the same deployed file in the browser) — and anything else
// FAILS THE CRAWL LOUDLY: network-fetched data is never indexed, and silence would
// read as "indexed" when it isn't. Deterministic by construction — fixed env vector,
// fixed measurer, same data bytes — so the browser and Node crawls are byte-identical,
// extending the oracle discipline to the whole document.
import { build, settle, App, HeadlessBackend, provideMeasurer, provideTransport } from "../../runtime/dist/index.js";
import { approximateMeasurer, DEFAULT_ENV } from "./headless.js";
import { staticHtml } from "./static-html.js";
/** A url with a scheme (or protocol-relative) — the NETWORK, never crawled. A bare
 *  relative path is the app's own material. */
const isAbsoluteUrl = (url) => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
/** The crawl transport: fixtures, then the own-material resolver for relative urls;
 *  everything else is recorded as a refusal (and rejected, so the DataSource lands
 *  `failed` for THIS boot) — the crawl throws on any refusal once enumeration ends.
 *  Every request is tracked in `pending` until it lands, so the boot can wait for
 *  data to QUIESCENCE rather than a fixed pump — the browser's resolver is a real
 *  same-origin fetch, and serializing before it lands would race (and break the
 *  byte-identical discipline vs Node's synchronous disk read). */
function crawlTransport(opts, refusals, pending) {
    const fixtures = opts.fixtures ?? {};
    const track = (p) => {
        pending.add(p);
        p.catch(() => { }).finally(() => pending.delete(p));
        return p;
    };
    return (url) => {
        // Resolvers hand back the file's MATERIAL — parsed JSON, or the raw string
        // for a text file. Both DataSource formats read from the one response: a
        // `format = "text"` source takes the string; json takes the value.
        const respond = (value) => ({
            ok: true, status: 200,
            json: () => Promise.resolve(value),
            text: () => Promise.resolve(typeof value === "string" ? value : JSON.stringify(value)),
        });
        if (Object.prototype.hasOwnProperty.call(fixtures, url))
            return track(Promise.resolve(respond(fixtures[url])));
        if (isAbsoluteUrl(url)) {
            refusals.set(url, "a network url — network-fetched data is never indexed (docs/system-design/location.md §9)");
            return track(Promise.reject(new Error(`crawl refused network fetch — ${url}`)));
        }
        if (opts.data !== undefined) {
            return track(Promise.resolve(opts.data(url)).then((value) => {
                if (value !== null && value !== undefined)
                    return respond(value);
                refusals.set(url, "not found in the app's own material");
                throw new Error(`crawl: no such data file — ${url}`);
            }));
        }
        refusals.set(url, "no data resolver supplied to the crawl");
        return track(Promise.reject(new Error(`crawl has no data source for ${url}`)));
    };
}
/** Pump microtasks and one macrotask — lets a landed transport response flow
 *  through the DataSource's remaining awaits (`res.json()`, the value write). */
async function drainAsync() {
    for (let i = 0; i < 8; i++)
        await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
}
/** Cold boot the program at `location` under the crawl transport and settle to DATA
 *  quiescence: wait out every in-flight transport request (a landed batch may settle
 *  into code that fetches MORE — loop until none remain), then serialize. The caller
 *  serializes then `app.discard()`s. */
async function bootAt(source, opts, location, refusals) {
    const env = { ...DEFAULT_ENV, ...opts.env };
    if (typeof document === "undefined")
        provideMeasurer(approximateMeasurer());
    const pending = new Set();
    const prev = provideTransport(crawlTransport(opts, refusals, pending));
    try {
        const app = build(source, { deps: opts.deps, links: opts.links });
        app.attach(new HeadlessBackend(), null);
        app.hostWidth = env.hostWidth;
        app.hostHeight = env.hostHeight;
        app.dark = env.dark;
        if (location !== "")
            app.location = location; // "" = the declared default (seed nothing)
        settle();
        await drainAsync();
        while (pending.size > 0) {
            await Promise.allSettled([...pending]);
            settle();
            await drainAsync();
        }
        settle();
        return app;
    }
    finally {
        provideTransport(prev);
    }
}
/** The fragment locations linked from an emitted document — every `href="#…"`
 *  (staticHtml's realization of a location link). Anchors ride along; the caller
 *  canonicalizes. Minimal unescaping (only `&amp;`, the sole char escAttr emits). */
export function fragmentHrefs(html) {
    const out = [];
    for (const m of html.matchAll(/href="#([^"]*)"/g))
        out.push(m[1].replace(/&amp;/g, "&"));
    return out;
}
/** The canonical document key for a location (§7 dedup rules 1–2): the anchor is
 *  stripped (`#x@a` ≡ `#x` — an anchor is a viewpoint, not a page), and the declared
 *  default is canonicalized to "" (an empty fragment and the declared initial are the
 *  same page). Everything else is its own key. */
export function canonKey(location, defaultLoc) {
    const base = location.split("@")[0];
    return base === "" || base === defaultLoc ? "" : base;
}
/** Crawl the reachable locations to closure, one cold boot each (§7). Returns one
 *  CrawlDoc per DISTINCT document: dedup by canonical key (visited set), then by
 *  output hash (rule 3 — different keys, identical bytes → one document, the first
 *  key kept, deterministic since extraction is). A location nothing links to is not
 *  emitted (rule: discoverable = linked). The default is always docs[0]. THROWS when
 *  any boot needed data the crawl could not honestly supply (the loud-failure rule):
 *  the message names each url and the fix. */
export async function crawlLocations(source, opts = {}) {
    return (await crawlAll(source, opts)).docs;
}
/** The crawl plus the app's settled `appName` — the human name the crawled
 *  page's <title> should carry (SEO: the extractor reads the SETTLED value, so
 *  a constraint-derived name is as extractable as a literal). One title per
 *  crawl, matching the one-document ruling (the program URL is the sole
 *  address); "" when the app declares no name — the caller keeps its default. */
async function crawlAll(source, opts = {}) {
    const refusals = new Map();
    // The declared default = a fresh boot's location, so `""`/default canonicalize.
    const probe = await bootAt(source, opts, "", refusals);
    const defaultLoc = probe.location;
    const title = probe.appName;
    probe.discard();
    const byKey = new Map();
    const byHash = new Map(); // output hash → the key that owns it
    const queue = [""]; // start at the default
    while (queue.length > 0) {
        const location = queue.shift();
        const key = canonKey(location, defaultLoc);
        if (byKey.has(key))
            continue;
        const app = await bootAt(source, opts, key === "" ? "" : location, refusals);
        const html = staticHtml(app);
        const links = fragmentHrefs(html);
        app.discard();
        // Rule 3: identical serialized bytes → one document (an output-hash alias).
        const h = hashOf(html);
        const owner = byHash.get(h);
        if (owner !== undefined) {
            byKey.set(key, byKey.get(owner));
            continue;
        }
        byHash.set(h, key);
        byKey.set(key, { key, location: key === "" ? "" : location, html });
        for (const l of links) {
            const k = canonKey(l, defaultLoc);
            if (!byKey.has(k) && !queue.some((q) => canonKey(q, defaultLoc) === k))
                queue.push(l);
        }
    }
    if (refusals.size > 0) {
        const lines = [...refusals].map(([url, why]) => `  ${url} — ${why}`).join("\n");
        throw new Error(`crawl failed — data this app fetches is not part of its build-time material:\n${lines}\n` +
            `Indexable content must be baked at build time (docs/system-design/location.md §9): inline the data ` +
            `(Dataset contents), ship it as a file beside the app (a relative url), or accept that ` +
            `this content is not indexed (drop ?crawler/?extract for this program).`);
    }
    // De-alias: distinct keys that resolved to one doc share its object; return the
    // unique documents (the owners), in first-seen order.
    const seen = new Set();
    const out = [];
    for (const doc of byKey.values())
        if (!seen.has(doc)) {
            seen.add(doc);
            out.push(doc);
        }
    return { docs: out, title };
}
/** A small, stable content hash (FNV-1a) — deterministic across Node and the
 *  browser, so the crawl's output-hash dedup is identical on both. */
function hashOf(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
}
const escId = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
/** The ONE crawled document: the default location's content, then each other
 *  reachable location's content as a `<section id="<location>">` — so the emitted
 *  `href="#<location>"` links resolve intra-document, and a fragment that survives
 *  into a click-through addresses the live app identically. This is what `?extract`
 *  returns and `?crawler` bakes when the caller asks for the crawl. */
export async function crawlDocument(source, opts = {}) {
    return (await crawlExtract(source, opts)).html;
}
/** crawlDocument plus the settled `appName` as `title` — for callers baking a
 *  full page around the extraction (`crawlerDocument`, the run-page `<title>`),
 *  so the crawled page is named by the app, not the filename. "" = no declared
 *  name; the caller falls back to whatever it titled the page before. */
export async function crawlExtract(source, opts = {}) {
    const { docs, title } = await crawlAll(source, opts);
    const parts = [docs[0].html];
    for (const d of docs.slice(1))
        parts.push(`<section id="${escId(d.key)}">\n${d.html}\n</section>`);
    return { html: parts.join("\n"), title };
}
//# sourceMappingURL=crawl.js.map