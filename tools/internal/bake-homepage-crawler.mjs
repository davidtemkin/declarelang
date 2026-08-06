// tools/internal/bake-homepage-crawler.mjs — bake the homepage's static content into index.html.
//
// The homepage is the ONE curated page (repo-root index.html) and the SEO
// exception. index.html is a thin shell that renders the homepage app IN THE
// BROWSER, so a crawler / LLM that doesn't run JS sees an empty host. On a dumb
// static host (GitHub Pages) there is no SSR and every requester gets the SAME
// bytes, so the only way the root page carries its content for search + AI is to
// CONTAIN it — a reference to a separate ?extract document would not be inlined.
//
// This injects the homepage's t=0 STATIC EXTRACTION (docs/system-design/capabilities.md §5 —
// the same class-semantics HTML the ?extract document uses) between two markers
// in index.html's host element, as #declare-static. host-client.js REMOVES that
// block the moment the live app mounts (browser/host-client.js), so a real user
// never sees it — the same seamless swap the `seo` flag uses on run pages.
//
// Idempotent (rewrites index.html only when the baked bytes change) and drift-safe
// like every other committed artifact: it rides the commit hook BEFORE
// stamp-version, so index.html's bytes — and thus the BUILD_ID — always reflect the
// current homepage source. A stale bake would only ever affect the crawler
// snapshot, never the live user (who gets the real app, which replaces it).
//
//   node tools/internal/bake-homepage-crawler.mjs

import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile, crawlExtract, diskDataResolver } from "../../compiler/dist/compile-node.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HOMEPAGE = path.join(ROOT, "apps", "homepage", "homepage.declare");
const INDEX = path.join(ROOT, "index.html");
const BEGIN = "<!--declare-static:begin-->";
const END = "<!--declare-static:end-->";
// The head fields that RESTATE the page's own title. They were hand-copied, so
// changing the hero left them behind — and because the runtime overwrites
// document.title at boot, the drift was invisible to a visitor and visible only
// to crawlers and LLMs, the readers this page exists for. They are derived now.
// Everything outside these markers (og:image, og:url, dimensions, the card type,
// the descriptions) is an AUTHORED fact with nothing to derive it from, and the
// descriptions no longer embed the headline, so they cannot rot either.
const HBEGIN = "<!--declare-head:begin-->";
const HEND = "<!--declare-head:end-->";
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const src = readFileSync(HOMEPAGE, "utf8");
const compiled = compile(src, { originDir: path.dirname(HOMEPAGE) });
if (compiled.source === null) {
  console.error("bake-homepage-crawler: homepage did not compile:\n" + compiled.report);
  process.exit(1);
}
// The extraction fragment (not crawlerDocument's full page) — it goes INSIDE the host
// element as #declare-static, matching the `seo` flag's bake exactly. The CRAWLED
// document (docs/system-design/location.md §7): the default page plus each reachable location's
// content as a `<section id>` — so the Why article, invisible at t=0, is IN the
// baked page and its `#why` link resolves right here in the static form.
// crawlExtract, not crawlDocument: it returns the settled `appName` alongside
// the fragment, which is the single source the <title> and the social cards are
// stamped from. One boot, both answers.
const ex = await crawlExtract(compiled.source, {
  deps: compiled.deps, links: compiled.links, registry: compiled.linkRegistry, warm: true,
  data: diskDataResolver(path.dirname(HOMEPAGE)),
});
const html = ex === null ? null : ex.html;
const title = (ex && ex.title) || "Declare";
// The block ships hidden INLINE (`display:none` on the div itself): a
// following <script> hider proved too late — Safari paints mid-parse on a
// slow device, flashing the crawl text before any script runs (measured
// 2026-07-29). Crawlers read text nodes regardless of style; the <noscript>
// unhide keeps the block as the JS-off human fallback; host-client still
// REMOVES the node at boot.
// REBASE the extraction's relative asset URLs. The program says
// `source = "shots/calendar.webp"`, meaning "beside the program" — and at run
// time it is, because the boot hands the runtime the program's directory
// (browser/boot-uniform.js, provideAssetBase). The baked document has no such
// seam: it lands in index.html at the DEPLOY ROOT, where the same relative
// path resolves a directory too high and 404s. So the crawler's copy is
// rewritten to the entry page's own base — which is what "what a visitor sees
// and what a crawler sees can never drift" costs here. Absolute, protocol-
// relative, root-relative, data: and #fragment URLs are already unambiguous
// and pass through untouched.
const REL_BASE = path.relative(ROOT, path.dirname(HOMEPAGE)).split(path.sep).join("/") + "/";
// `src`/`poster` ONLY — never `href`. The two are relative to DIFFERENT bases:
// a media source is resolved against the program's directory (the runtime's
// asset base), while a navigation target like "apps/calendar/calendar.declare"
// is authored against the DEPLOY ROOT, which is exactly where this document
// lands. Rewriting hrefs too turns every in-app link into
// apps/homepage/apps/calendar/… — checked, and it did.
const rebase = (h) => h.replace(/\b(src|poster)="([^"]*)"/g, (m, attr, url) =>
  /^([a-z][a-z0-9+.-]*:|\/\/|\/|#|data:)/i.test(url) ? m : `${attr}="${REL_BASE}${url}"`);

const NOSCRIPT = "<noscript><style>#declare-static{display:block !important}</style></noscript>";
const block = html
  ? `${BEGIN}${NOSCRIPT}<div id="declare-static" style="display:none">\n${rebase(html)}\n</div>${END}`
  : `${BEGIN}${END}`;

const idx = readFileSync(INDEX, "utf8");
const i = idx.indexOf(BEGIN);
const j = idx.indexOf(END);
if (i < 0 || j < 0 || j < i) {
  console.error(`bake-homepage-crawler: markers ${BEGIN} … ${END} not found in index.html`);
  process.exit(1);
}
let next = idx.slice(0, i) + block + idx.slice(j + END.length);

// …and the derived head block, from the same settled title.
const hi = next.indexOf(HBEGIN);
const hj = next.indexOf(HEND);
if (hi < 0 || hj < 0 || hj < hi) {
  console.error(`bake-homepage-crawler: markers ${HBEGIN} … ${HEND} not found in index.html`);
  process.exit(1);
}
const head = HBEGIN
  + `<title>${esc(title)}</title>`
  + `<meta property="og:title" content="${esc(title)}">`
  + `<meta name="twitter:title" content="${esc(title)}">`
  + HEND;
next = next.slice(0, hi) + head + next.slice(hj + HEND.length);
if (next === idx) { console.log("bake-homepage-crawler: unchanged"); process.exit(0); }
writeFileSync(INDEX, next);
console.log(`bake-homepage-crawler: baked ${(html?.length ?? 0)} chars + title "${title}" into index.html`);
