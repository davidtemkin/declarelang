// Phase C — extraction-as-crawl (docs/system-design/location.md §7). The single-page extractor
// generalizes to t=0 PER REACHABLE LOCATION: follow the fragment links out of each
// settled tree, cold-boot each location under the build-time-data rule, serialize to
// closure — into ONE document at the program URL (each location a `<section id>`,
// so the fragment links resolve intra-document). These pin the crawl on the two
// exemplars (homepage, docs) plus synthetic cases for the dedup rules, the loud
// data-failure rule, and determinism (the browser↔Node byte-identical oracle).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test, summarize } from "./harness.mjs";
import { compile, crawlLocations, crawlDocument, canonKey, diskDataResolver } from "../compiler/dist/compile-node.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const compileAt = (rel) => compile(read(rel), { originDir: path.join(ROOT, path.dirname(rel)) });

await test("crawl: homepage emits the #why and #language documents, linked from the front page", async () => {
  const r = compileAt("apps/homepage/homepage.declare");
  const docs = await crawlLocations(r.source, { deps: r.deps, links: r.links,
    data: diskDataResolver(path.join(ROOT, "apps/homepage")) });
  const keys = docs.map((d) => d.key).sort();
  assert.deepEqual(keys, ["", "faq", "getstarted", "language", "why"], "the default page, the FAQ, the get-started guide, the language doc, and the why article");
  const front = docs.find((d) => d.key === "");
  assert.ok(front.html.includes('href="#why"'), "the front page LINKS to #why (discoverable = linked)");
  assert.ok(front.html.includes('href="#language"'), "the front page LINKS to #language");
  const why = docs.find((d) => d.key === "why");
  assert.ok(why.html.includes("studies"), "the why document carries the essay content that is hidden at t=0 on /");
  const lang = docs.find((d) => d.key === "language");
  assert.ok(lang.html.includes("the whole language, in one file"), "the language document carries the rendered core doc");
});

await test("crawl: docs emits a document per chapter AND per reference class (data-driven, over its material)", async () => {
  // The docs app's material is the spine model PLUS a per-chapter content file
  // (chapters/<id>.json) fetched eagerly per instance — the disk resolver serves
  // them all, exactly as the deployed same-origin fetches do.
  const r = compileAt("apps/docs/docs.declare");
  const docs = await crawlLocations(r.source, { deps: r.deps, links: r.links,
    data: diskDataResolver(path.join(ROOT, "apps/docs")) });
  const guide = docs.filter((d) => d.key.startsWith("guide/")).map((d) => d.key);
  const ref = docs.filter((d) => d.key.startsWith("reference/")).map((d) => d.key);
  // guide/00-shape is the DEFAULT (canonicalized to ""), so it is the "" doc — every
  // OTHER chapter has its own key. The whole guide + reference is reached from the rails.
  assert.ok(guide.includes("guide/20-tree"), "a mid chapter is reached from the rail");
  assert.ok(guide.includes("guide/42-calendar"), "the last chapter is reached too");
  assert.ok(guide.length >= 15, `most chapters emitted (got ${guide.length})`);
  assert.ok(ref.includes("reference/View") && ref.includes("reference/Text"), "reference classes are reached");
  const tree = docs.find((d) => d.key === "guide/20-tree");
  assert.ok(tree.html.includes("keeps most Declare code flat"),
    "the chapter PROSE is in its section — the per-chapter content file arrived through the crawl's resolver");
  assert.ok(ref.length >= 15, `most reference classes emitted (got ${ref.length})`);
  const shape = docs.find((d) => d.key === "");
  assert.ok(shape.html.includes('href="#guide/20-tree"'), "the default page links the other chapters (the rail is the sitemap)");
});

await test("crawl: canonical key strips the anchor and canonicalizes the declared default (dedup rules 1–2)", () => {
  assert.equal(canonKey("guide/20-tree@components-are-classes", "guide/00-shape"), "guide/20-tree", "anchor stripped");
  assert.equal(canonKey("guide/00-shape", "guide/00-shape"), "", "the declared default → the empty key");
  assert.equal(canonKey("", "guide/00-shape"), "", "an empty fragment → the empty key (same page as the default)");
  assert.equal(canonKey("why", "home"), "why", "a non-default location keeps its own key");
});

await test("crawl: output-hash aliasing collapses distinct locations with identical bytes (dedup rule 3)", async () => {
  // Two pills to DISTINCT locations "x"/"y", but the app renders the same content at
  // each (it does not branch on them) — so both serialize to the default's bytes and
  // fold into ONE document. The visited-set + hash dedup keep the crawl finite.
  const src = `App [ width = 400, height = 300, location = "home",
    title: Text [ text = "One page", fontSize = 40, fontWeight = bold ],
    pillA: View [ width = 20, height = 20, onClick() { app.location = "x" } ],
    pillB: View [ width = 20, height = 20, onClick() { app.location = "y" } ],
  ]`;
  const r = compile(src, {});
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  const docs = await crawlLocations(r.source, { deps: r.deps, links: r.links });
  // "x" and "y" produce identical bytes to the default → one unique document.
  assert.equal(docs.length, 1, `x/y alias to the default page (got ${docs.length})`);
});

await test("crawl: ONE document — sections by location id, fragment links resolve intra-document (the ruling)", async () => {
  const r = compileAt("apps/homepage/homepage.declare");
  const doc = await crawlDocument(r.source, { deps: r.deps, links: r.links, data: diskDataResolver(path.join(ROOT, "apps/homepage")) });
  assert.ok(doc.includes('<section id="why">'), "the why article is a section whose id IS its live location");
  assert.ok(doc.includes('href="#why"'), "the fragment link is NOT rewritten — it resolves to the section right here");
  assert.ok(doc.indexOf('href="#why"') < doc.indexOf('<section id="why">'), "default content first, then the reached sections");
  assert.ok(doc.includes("studies"), "content invisible at t=0 is in the one document");
});

await test("crawl: a network DataSource fails LOUDLY — never a silently partial document (the build-time data rule)", async () => {
  const src = `App [ width = 400, height = 300, location = "home",
    live: DataSource [ url = "https://api.example.com/live.json" ],
    onInit() { this.live.fetch() },
    t: Text [ text = "page", fontSize = 40, fontWeight = bold ],
  ]`;
  const r = compile(src, {});
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  await assert.rejects(
    () => crawlDocument(r.source, { deps: r.deps, links: r.links }),
    (e) => e.message.includes("https://api.example.com/live.json") && /never indexed/.test(e.message) && /inline the data|ship it as a file/i.test(e.message),
    "the error names the url and the fix"
  );
  // A relative url that is NOT in the app's material is equally loud.
  const src2 = src.replace("https://api.example.com/live.json", "missing.json");
  const r2 = compile(src2, {});
  await assert.rejects(
    () => crawlDocument(r2.source, { deps: r2.deps, links: r2.links, data: () => null }),
    (e) => e.message.includes("missing.json"),
    "a missing own-material file is named too"
  );
});

await test("crawl: deterministic — byte-identical across runs (the browser↔Node oracle discipline)", async () => {
  const r = compileAt("apps/docs/docs.declare");
  const opts = { deps: r.deps, links: r.links, data: diskDataResolver(path.join(ROOT, "apps/docs")) };
  const a = await crawlLocations(r.source, opts);
  const b = await crawlLocations(r.source, opts);
  const key = (docs) => JSON.stringify(docs.map((d) => [d.key, d.html]));
  assert.equal(key(a), key(b), "the same source + fixtures crawl to the same document set, byte for byte");
});

summarize("crawl");
