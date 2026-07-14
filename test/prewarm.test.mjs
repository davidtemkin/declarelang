// Committed pre-warm cache tier (browser/prewarm-cache.js + tools/prewarm.mjs).
//
// The tier's whole promise is NO DRIFT: a committed precompiled artifact is used
// only when its stored dependency closure still validates against the deployed
// SOURCE, so it can never render a program that disagrees with a fresh compile.
// These tests pin that promise. loadPrewarm takes an injectable fetch, so the
// validation runs entirely in Node against a filesystem-backed shim — the same
// code path the browser runs, minus the network.
//
//   • key derivation is deterministic and separates main / kind / props;
//   • a FRESH artifact validates; a tampered/edited source reads STALE (→ null,
//     the caller falls through to compile); a missing artifact / identity
//     mismatch / a missing-then-present dependency all fall through;
//   • INTEGRATION: every artifact actually committed under bundles/cache/ still
//     validates against the current tree — a stale committed file fails loudly
//     (run `node tools/prewarm.mjs`), which is the drift guard itself.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test, summarize } from "./harness.mjs";
import { prewarmKey, relativize, loadPrewarm } from "../browser/prewarm-cache.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_URL = pathToFileURL(ROOT + "/");
const CACHE_DIR = join(ROOT, "bundles", "cache");

/** A fetch shim over the filesystem. `overrides` maps an ABSOLUTE path to a body
 *  string (or null = 404), so a test can pretend a file was edited or removed
 *  without touching the tree. Resolves the file:// URLs loadPrewarm builds. */
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
  const abs = new URL("examples/homepage/homepage.declare", ROOT_URL).href;
  assert.equal(relativize(abs, ROOT_URL), "examples/homepage/homepage.declare");
  assert.equal(relativize("https://other.example/x.declare", ROOT_URL), "https://other.example/x.declare");
});

await test("a missing artifact falls through (null)", async () => {
  const r = await loadPrewarm({
    root: ROOT_URL, relMain: "examples/does-not-exist/x.declare",
    kind: "run", props: { render: "dom" }, fetchImpl: fsFetch(),
  });
  assert.equal(r, null);
});

await test("a fresh artifact validates; an edited source reads stale", async () => {
  const relMain = "examples/calendar/calendar.declare";
  const props = { render: "dom" };
  assert.ok(existsSync(artFile(relMain, "run", props)), "calendar run artifact is committed");

  const fresh = await loadPrewarm({ root: ROOT_URL, relMain, kind: "run", props, fetchImpl: fsFetch() });
  assert.ok(fresh, "committed calendar run artifact validates against the tree");
  assert.equal(fresh.kind, "run");
  assert.ok(fresh.program.length > 0);

  // Pretend the deployed source was edited but NOT re-prewarmed → hash mismatch.
  const edited = readFileSync(join(ROOT, relMain), "utf8") + "\n// a later edit\n";
  const stale = await loadPrewarm({
    root: ROOT_URL, relMain, kind: "run", props,
    fetchImpl: fsFetch({ [join(ROOT, relMain)]: edited }),
  });
  assert.equal(stale, null, "an un-regenerated edit falls through to compile");
});

await test("a deleted dependency busts the artifact", async () => {
  const relMain = "examples/calendar/calendar.declare";
  const props = { render: "dom" };
  const gone = await loadPrewarm({
    root: ROOT_URL, relMain, kind: "run", props,
    fetchImpl: fsFetch({ [join(ROOT, relMain)]: null }),
  });
  assert.equal(gone, null);
});

await test("the identity guard rejects a mismatched artifact (fnv1a collision defense)", async () => {
  const relMain = "examples/homepage/homepage.declare";
  const props = { render: "dom" };
  const forged = JSON.stringify({ kind: "run", main: "examples/other/x.declare", props, program: "x", closure: { entries: [], props } });
  const r = await loadPrewarm({
    root: ROOT_URL, relMain, kind: "run", props,
    fetchImpl: fsFetch({ [artFile(relMain, "run", props)]: forged }),
  });
  assert.equal(r, null);
});

await test("a stored-missing dependency: absent → fresh, present → stale", async () => {
  const relMain = "examples/synthetic/x.declare";
  const props = { render: "dom" };
  const dep = join(ROOT, relMain);
  const artifact = JSON.stringify({
    kind: "run", main: relMain, props, program: "P", deps: {}, source: "S",
    closure: { entries: [{ id: relMain, kind: "file", v: { missing: true } }], props },
  });
  const absent = await loadPrewarm({
    root: ROOT_URL, relMain, kind: "run", props,
    fetchImpl: fsFetch({ [artFile(relMain, "run", props)]: artifact, [dep]: null }),
  });
  assert.ok(absent, "a recorded-missing dep that is still absent validates");
  const created = await loadPrewarm({
    root: ROOT_URL, relMain, kind: "run", props,
    fetchImpl: fsFetch({ [artFile(relMain, "run", props)]: artifact, [dep]: "now it exists" }),
  });
  assert.equal(created, null, "a recorded-missing dep that now exists busts the artifact");
});

// INTEGRATION — every committed artifact must validate against the current tree.
// A failure here means a flagship source changed without re-running prewarm: the
// committed program is stale. That's caught (not shipped) — the guarantee working.
if (existsSync(CACHE_DIR)) {
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, "the committed cache is non-empty (run `node tools/prewarm.mjs`)");
  for (const f of files) {
    const art = JSON.parse(readFileSync(join(CACHE_DIR, f), "utf8"));
    await test(`committed ${art.kind} artifact for ${art.main} validates against the tree`, async () => {
      const warm = await loadPrewarm({ root: ROOT_URL, relMain: art.main, kind: art.kind, props: art.props, fetchImpl: fsFetch() });
      assert.ok(warm, `stale committed artifact ${f} — run \`node tools/prewarm.mjs\``);
      assert.equal(warm.main, art.main);
      assert.equal(warm.kind, art.kind);
    });
  }
}

summarize("prewarm cache tier");
