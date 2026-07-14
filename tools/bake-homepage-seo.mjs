// tools/bake-homepage-seo.mjs — bake the homepage's static content into index.html.
//
// The homepage is the ONE curated page (repo-root index.html) and the SEO
// exception. index.html is a thin shell that renders the homepage app IN THE
// BROWSER, so a crawler / LLM that doesn't run JS sees an empty host. On a dumb
// static host (GitHub Pages) there is no SSR and every requester gets the SAME
// bytes, so the only way the root page carries its content for search + AI is to
// CONTAIN it — a reference to a separate ?extract document would not be inlined.
//
// This injects the homepage's t=0 STATIC EXTRACTION (design/capabilities.md §5 —
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
//   node tools/bake-homepage-seo.mjs

import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile, extractFromCompiled } from "../compiler/dist/compile-node.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOMEPAGE = path.join(ROOT, "examples", "homepage", "homepage.declare");
const INDEX = path.join(ROOT, "index.html");
const BEGIN = "<!--declare-static:begin-->";
const END = "<!--declare-static:end-->";

const src = readFileSync(HOMEPAGE, "utf8");
const compiled = compile(src, { originDir: path.dirname(HOMEPAGE) });
if (compiled.source === null) {
  console.error("bake-homepage-seo: homepage did not compile:\n" + compiled.report);
  process.exit(1);
}
// The extraction fragment (not seoDocument's full page) — it goes INSIDE the host
// element as #declare-static, matching the `seo` flag's bake exactly.
const html = extractFromCompiled(compiled);
const block = html
  ? `${BEGIN}<div id="declare-static">\n${html}\n</div>${END}`
  : `${BEGIN}${END}`;

const idx = readFileSync(INDEX, "utf8");
const i = idx.indexOf(BEGIN);
const j = idx.indexOf(END);
if (i < 0 || j < 0 || j < i) {
  console.error(`bake-homepage-seo: markers ${BEGIN} … ${END} not found in index.html`);
  process.exit(1);
}
const next = idx.slice(0, i) + block + idx.slice(j + END.length);
if (next === idx) { console.log("bake-homepage-seo: unchanged"); process.exit(0); }
writeFileSync(INDEX, next);
console.log(`bake-homepage-seo: baked ${(html?.length ?? 0)} chars of homepage static content into index.html`);
