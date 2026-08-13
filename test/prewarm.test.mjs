// Committed pre-warm cache tier (browser/prewarm-cache.js, browser/prewarm-manifest.js,
// tools/internal/prewarm.mjs).
//
// TWO REQUESTS, NOT ONE ALGORITHM (2026-08-12). Loading a build and resolving a
// source are different questions, and the caller knows which it is asking before
// it asks: the MANIFEST says whether a build exists, at no request cost, and
// `loadBuild` then fetches it UNCONDITIONALLY. There is no load-time freshness
// opinion any more — a reader that re-validated on every load spent 1 + N requests
// (measured: 19 requests, 584 KB, for apps/tracker) to be told what derive already
// knew.
//
// So the drift guarantee did not disappear, it MOVED — from every reader on every
// load, to build time — and this file is where it now lives:
//
//   • key derivation is deterministic and separates main / kind / props;
//   • `loadBuild` returns the artifact, rejects a FOREIGN or malformed one on
//     identity, and returns null (never throws) when there is nothing there;
//   • the MANIFEST and the committed artifacts agree, both directions — the
//     property that makes the manifest safe to trust without a request;
//   • FRESHNESS: every committed artifact's stored closure still matches the tree.
//     This is the check the browser used to run on every load; it belongs here and
//     in `npm run test:derived`, with pre-push refusing a stale or uncommitted
//     derive. A failure means: run `npm run derive`.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test, summarize } from "./harness.mjs";
import { prewarmKey, relativize, loadBuild } from "../browser/prewarm-cache.js";
import { PREWARMED, prewarmedEntry, hasSegments } from "../browser/prewarm-manifest.js";
import { fnv1a, isUpToDate } from "../compiler/dist/closure.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_URL = pathToFileURL(ROOT + "/");
const CACHE_DIR = join(ROOT, "bundles", "cache");

/** A fetch shim over the filesystem. `overrides` maps an ABSOLUTE path to a body
 *  string (or null = 404), so a test can pretend a file was edited or removed
 *  without touching the tree. Resolves the file:// URLs loadBuild builds. */
function fsFetch(overrides = {}) {
  return async (url) => {
    const p = fileURLToPath(typeof url === "string" ? url : url.href);
    if (Object.prototype.hasOwnProperty.call(overrides, p)) {
      const v = overrides[p];
      if (v === null) return { ok: false, status: 404 };
      return { ok: true, status: 200, text: async () => v, json: async () => JSON.parse(v) };
    }
    try {
      const body = readFileSync(p, "utf8");
      return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
    } catch {
      return { ok: false, status: 404 };
    }
  };
}

const artFile = (relMain, kind, props) => join(CACHE_DIR, prewarmKey(relMain, kind, props) + ".json");

console.log("prewarm cache tier");

await test("prewarmKey is deterministic and separates main / kind / props", () => {
  assert.equal(prewarmKey("a", "run", { render: "dom" }), prewarmKey("a", "run", { render: "dom" }));
  assert.notEqual(prewarmKey("a", "run", { render: "dom" }), prewarmKey("a", "run", { render: "canvas" }));
  assert.notEqual(prewarmKey("a", "run", {}), prewarmKey("a", "seo", {}));
  assert.notEqual(prewarmKey("a", "run", {}), prewarmKey("b", "run", {}));
});

await test("relativize strips the ROOT prefix to a deploy-relative main path", () => {
  const abs = new URL("apps/homepage/homepage.declare", ROOT_URL).href;
  assert.equal(relativize(abs, ROOT_URL), "apps/homepage/homepage.declare");
  assert.equal(relativize("https://other.example/x.declare", ROOT_URL), "https://other.example/x.declare");
});

await test("nothing there → null, never a throw", async () => {
  const r = await loadBuild({
    root: ROOT_URL, relMain: "apps/does-not-exist/x.declare",
    kind: "run", props: { render: "dom" }, fetchImpl: fsFetch(),
  });
  assert.equal(r, null);
});

await test("loadBuild is UNCONDITIONAL — an edited source does not withhold the build", async () => {
  const relMain = "apps/calendar/calendar.declare";
  const props = { render: "dom" };
  const edited = readFileSync(join(ROOT, relMain), "utf8") + "\n// an edit nobody re-derived\n";
  const warm = await loadBuild({
    root: ROOT_URL, relMain, kind: "run", props,
    fetchImpl: fsFetch({ [join(ROOT, relMain)]: edited }),
  });
  // The OLD tier returned null here, after re-fetching the whole closure to find
  // out. The build is what the deployment shipped; keeping it honest is derive's
  // job and the freshness test below, not this call's.
  assert.ok(warm, "the committed build loads regardless of what the source says now");
  assert.equal(warm.main, relMain);
});

await test("the identity guard rejects a mismatched artifact (fnv1a collision defense)", async () => {
  const relMain = "apps/calendar/calendar.declare";
  const props = { render: "dom" };
  const forged = JSON.stringify({ kind: "run", main: "apps/other/x.declare", props, program: "x", closure: { entries: [], props } });
  const r = await loadBuild({
    root: ROOT_URL, relMain, kind: "run", props,
    fetchImpl: fsFetch({ [artFile(relMain, "run", props)]: forged }),
  });
  assert.equal(r, null, "an artifact naming another program is refused");
});

await test("malformed JSON falls through rather than throwing", async () => {
  const relMain = "apps/calendar/calendar.declare";
  const props = { render: "dom" };
  const r = await loadBuild({
    root: ROOT_URL, relMain, kind: "run", props,
    fetchImpl: fsFetch({ [artFile(relMain, "run", props)]: "{not json" }),
  });
  assert.equal(r, null);
});

// THE MANIFEST AND THE ARTIFACTS AGREE — both directions. This is what makes the
// manifest safe to consult INSTEAD of probing: if it can say "there is a build"
// when there is not, every reader pays a 404 it was told it would not; if an
// artifact exists that the manifest does not name, it is dead weight nothing
// loads (which is exactly how the `crawler` kind survived unread).

await test("every manifest entry has both its committed artifacts", async () => {
  for (const p of PREWARMED) {
    for (const kind of ["run", "segments"]) {
      const f = artFile(p.main, kind, kind === "run" ? p.props : {});
      assert.ok(existsSync(f), `${p.main} is in the manifest but has no ${kind} artifact — run \`npm run derive\``);
    }
  }
});

await test("every committed artifact is named by the manifest", async () => {
  for (const f of readdirSync(CACHE_DIR).filter((n) => n.endsWith(".json"))) {
    const art = JSON.parse(readFileSync(join(CACHE_DIR, f), "utf8"));
    const known = art.kind === "segments" ? hasSegments(art.main) : prewarmedEntry(art.main, art.props ?? {}) !== null;
    assert.ok(known, `${f} (${art.kind} ${art.main}) is committed but no manifest entry names it — nothing will ever load it`);
  }
});

await test("prewarmedEntry discriminates on props — a canvas page is a different build", () => {
  assert.ok(prewarmedEntry("apps/calendar/calendar.declare", { render: "dom" }));
  assert.equal(prewarmedEntry("apps/calendar/calendar.declare", { render: "canvas" }), null);
  assert.equal(prewarmedEntry("apps/nope/nope.declare", { render: "dom" }), null);
});

// FRESHNESS — the check the browser used to run on every load, kept here where it
// costs a test run instead of 1 + N requests per visitor. Every committed
// artifact's stored closure is re-hashed against the tree; a mismatch means a
// source moved without a re-derive, which pre-push also refuses.
if (existsSync(CACHE_DIR)) {
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, "the committed cache is non-empty (run `npm run derive`)");
  const diskProbe = (e) => {
    try { return { hash: fnv1a(readFileSync(join(ROOT, e.id), "utf8")) }; }
    catch { return { missing: true }; }
  };
  for (const f of files) {
    const art = JSON.parse(readFileSync(join(CACHE_DIR, f), "utf8"));
    await test(`committed ${art.kind} artifact for ${art.main} still matches the tree`, () => {
      const closure = art.closure;
      assert.ok(closure && Array.isArray(closure.entries), `${f} has no closure`);
      assert.ok(isUpToDate(closure, closure.props, diskProbe),
        `stale committed artifact ${f} (${art.kind} ${art.main}) — run \`npm run derive\``);
    });
  }
}

summarize("prewarm cache tier");
