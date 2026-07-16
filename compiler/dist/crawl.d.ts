import { type Environment } from "./headless.js";
export interface CrawlOptions {
    deps?: unknown;
    links?: unknown;
    env?: Environment;
    /** url → JSON data, highest precedence — a test's canned model, or a snapshot. */
    fixtures?: Record<string, unknown>;
    /** Resolve a RELATIVE url (the app's own material — the build-time data rule) to
     *  its JSON, or null when the file does not exist. Node callers pass a disk reader
     *  over the program's origin dir (compile-node `diskDataResolver`); the browser
     *  passes a same-origin fetch. Absolute urls never reach this — they are the
     *  network, and the network fails the crawl. */
    data?: (url: string) => Promise<unknown> | unknown;
}
/** One crawled location: its canonical KEY (anchor stripped, default canonicalized
 *  — also the section id in the assembled document), a representative LOCATION that
 *  reaches it, and its serialized content. */
export interface CrawlDoc {
    key: string;
    location: string;
    html: string;
}
/** The fragment locations linked from an emitted document — every `href="#…"`
 *  (staticHtml's realization of a location link). Anchors ride along; the caller
 *  canonicalizes. Minimal unescaping (only `&amp;`, the sole char escAttr emits). */
export declare function fragmentHrefs(html: string): string[];
/** The canonical document key for a location (§7 dedup rules 1–2): the anchor is
 *  stripped (`#x@a` ≡ `#x` — an anchor is a viewpoint, not a page), and the declared
 *  default is canonicalized to "" (an empty fragment and the declared initial are the
 *  same page). Everything else is its own key. */
export declare function canonKey(location: string, defaultLoc: string): string;
/** Crawl the reachable locations to closure, one cold boot each (§7). Returns one
 *  CrawlDoc per DISTINCT document: dedup by canonical key (visited set), then by
 *  output hash (rule 3 — different keys, identical bytes → one document, the first
 *  key kept, deterministic since extraction is). A location nothing links to is not
 *  emitted (rule: discoverable = linked). The default is always docs[0]. THROWS when
 *  any boot needed data the crawl could not honestly supply (the loud-failure rule):
 *  the message names each url and the fix. */
export declare function crawlLocations(source: string, opts?: CrawlOptions): Promise<CrawlDoc[]>;
/** The ONE crawled document: the default location's content, then each other
 *  reachable location's content as a `<section id="<location>">` — so the emitted
 *  `href="#<location>"` links resolve intra-document, and a fragment that survives
 *  into a click-through addresses the live app identically. This is what `?extract`
 *  returns and `?seo` bakes when the caller asks for the crawl. */
export declare function crawlDocument(source: string, opts?: CrawlOptions): Promise<string>;
