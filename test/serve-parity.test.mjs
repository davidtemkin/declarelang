// Serve-core parity (browser/serve-core.js) — the host-agnostic serving oracle.
//
// The dev server (server/index.mjs) and the static-host service worker
// (service-worker.js) are now thin ADAPTERS over serve-core: both classify a
// `.declare` request with requestType() and build the RUN page with runWrapper().
// These tests are the oracle — they lock the classifier's mapping and prove the run
// shell is structurally IDENTICAL across hosts, differing ONLY in the documented host
// parameters (the boot-URL form and the favicon base). If a host ever grew its own
// run-page branch, the normalized-equality assertion below would catch it.

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { requestType, REQ, runWrapper, programName, directoryProgram, stubPage } from "../browser/serve-core.js";

const params = (q) => new URLSearchParams(q);

console.log("serve-core parity");

await test("requestType maps the query to a request (the classifier both hosts share)", () => {
  assert.equal(requestType(params("")), REQ.RUN);                     // default

  // the DIRECTORY-PROGRAM rule: candidate derivation only (existence is the caller's probe)
  assert.equal(directoryProgram("/apps/calendar/"), "/apps/calendar/calendar.declare");
  assert.equal(directoryProgram("/apps/calendar"), "/apps/calendar/calendar.declare");   // no-slash form (hosts 301 to the slash)
  assert.equal(directoryProgram("/apps/docs.declare"), null);   // a dotted segment is file-like, never a program dir
  assert.equal(directoryProgram("/"), null);                    // the root names nothing
  assert.equal(directoryProgram("/x/foo.bar/"), null);
  assert.equal(requestType(params("render=canvas")), REQ.RUN);       // a modifier, not a request
  assert.equal(requestType(params("viewer=reader")), REQ.READER);      // ?viewer= = the Viewer’s tabs
  assert.equal(requestType(params("viewer=source")), REQ.SOURCE);      // the viewer's Source tab
  assert.equal(requestType(params("viewer=edit")), REQ.EDIT);
  assert.equal(requestType(params("viewer=bogus")), REQ.READER);  // unknown value → the Viewer default
  assert.equal(requestType(params("viewer")), REQ.READER);       // bare ?viewer → the Reader          // unknown view → safe default
  assert.equal(requestType(params("build")), REQ.BUILD);             // bare presence keys
  assert.equal(requestType(params("file")), REQ.FILE);
  assert.equal(requestType(params("segments")), REQ.SEGMENTS);
  assert.equal(requestType(params("extract")), REQ.EXTRACT);
  assert.equal(requestType(params("reader")), REQ.RUN);              // bare ?reader is not a request now
});

await test("programName strips the directory and extension", () => {
  assert.equal(programName("/apps/calendar/calendar.declare"), "calendar");
  assert.equal(programName("homepage.declare"), "homepage");
});

await test("runWrapper produces a valid RUN shell that boots the given bundle", () => {
  const html = runWrapper({ name: "calendar", bootUrl: "/bundles/declare-boot.js" });
  assert.match(html, /<div id="host"><\/div>/);                      // empty host (no staticBlock)
  assert.match(html, /import boot from "\/bundles\/declare-boot\.js"/);
  assert.match(html, /boot\(\{ main: null \?\? location\.pathname/);           // main = the program's own URL
  assert.match(html, /<title>calendar · Declare<\/title>/);
});

await test("runWrapper embeds a staticBlock (the server's ?crawler bake) inside the host", () => {
  const html = runWrapper({ name: "x", bootUrl: "/b.js", staticBlock: '<div id="declare-static">Y</div>' });
  assert.match(html, /<div id="host"><div id="declare-static">Y<\/div><\/div>/);
});

// A baked crawler block must not FLASH for a human, yet must not read as cloaking to a
// crawler. The fix: remove it in a SYNCHRONOUS pre-paint script — never CSS-hide it.
await test("a staticBlock is cleared by a synchronous pre-paint script, before the module boot", () => {
  const html = runWrapper({ name: "x", bootUrl: "/b.js", staticBlock: '<div id="declare-static">Y</div>' });
  // A classic (non-module) script — runs during parse, before first paint — that REMOVES
  // the node. No display:none / visibility:hidden / opacity:0 anywhere (the hidden-text
  // signatures a crawler flags), so the content is present for non-JS crawlers and simply
  // swapped for the app for everyone who runs JS.
  assert.match(html, /<script>document\.getElementById\("declare-static"\)\?\.remove\(\)<\/script>/);
  const clearAt = html.indexOf('getElementById("declare-static")');
  const moduleAt = html.indexOf('<script type="module">');
  assert.ok(clearAt > -1 && clearAt < moduleAt, "the remover precedes the async module boot");
  assert.doesNotMatch(html, /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0/i);
});

await test("no staticBlock → no clear script (nothing baked, nothing to remove)", () => {
  const html = runWrapper({ name: "x", bootUrl: "/b.js" });
  assert.doesNotMatch(html, /declare-static/);
});

await test("runWrapper escapes the title — no injection via the program name", () => {
  const html = runWrapper({ name: "<script>x</script>", bootUrl: "/b.js" });
  assert.doesNotMatch(html, /<title><script>/);
  assert.match(html, /&lt;script&gt;/);
});

// THE ORACLE — the server adapter and the SW adapter differ ONLY in host params.
await test("both hosts' run shells are identical modulo host parameters", () => {
  const serverPage = runWrapper({ name: "calendar", bootUrl: "/bundles/declare-boot.js", iconBase: "/assets/" });
  const swPage = runWrapper({
    name: "calendar",
    bootUrl: "https://h.example/declarelang/bundles/declare-boot.js?v=abc123",
    iconBase: "https://h.example/declarelang/assets/",
  });
  // Normalize the two DOCUMENTED host differences — the boot-URL form and the icon
  // base — then the pages must be byte-identical. A host-specific structural branch
  // (a stray meta tag, a different host div) would survive normalization and fail.
  const norm = (s) => s
    .replace(/import boot from "[^"]*"/, 'import boot from "BOOT"')
    .replace(/href="[^"]*(favicon\.[a-z]+)"/g, 'href="ICON/$1"');
  assert.equal(norm(serverPage), norm(swPage));
});

// THE COLD STUB (apps/<name>/index.html — bake-app-stubs.mjs): same shell as the run
// page, differing ONLY in the script block. Its two cold-only behaviors are locked
// here: runtime main via the shared directory rule, and the modifier→reload handoff.
await test("stubPage shares the run shell exactly, modulo the script block", () => {
  const run = runWrapper({ name: "calendar", bootUrl: "/b.js", iconBase: "/assets/" });
  const stub = stubPage({ name: "calendar", bootUrl: "/b.js", serveCoreUrl: "/browser/serve-core.js", iconBase: "/assets/" });
  const shellOf = (s) => s.slice(0, s.indexOf('<script type="module">'));
  assert.equal(shellOf(stub), shellOf(run));                          // identical head + host element
});

await test("stubPage computes main at runtime and hands modifiers to the worker", () => {
  const stub = stubPage({ name: "calendar", bootUrl: "/b.js", serveCoreUrl: "/browser/serve-core.js" });
  assert.match(stub, /main: directoryProgram\(location\.pathname\) \?\? location\.pathname/);
  assert.match(stub, /requestType\(q\) !== REQ\.RUN/);                // only a modifier defers
  assert.match(stub, /serviceWorker\.ready\.then\(\(\) => location\.reload\(\)\)/);
  assert.match(stub, /import \{ requestType, REQ, directoryProgram \} from "\/browser\/serve-core\.js"/);
});

// FRESHNESS ORACLE: the committed stubs must be regenerable from the current template.
// Editing stubPage() without rerunning bake-app-stubs.mjs (the pre-commit hook does)
// fails here — the committed artifact may not drift from the code that generates it.
await test("every committed app stub matches the current stubPage template", () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const norm = (s) => s.replace(/(declare-boot\.js)\?v=[^"']*/g, "$1?v=");
  let checked = 0;
  for (const dir of ["calendar", "desktop", "docs", "homepage", "viewer", "inspector"]) {
    const f = join(ROOT, "apps", dir, "index.html");
    if (!existsSync(f)) continue;
    const committed = readFileSync(f, "utf8");
    const expected = stubPage({
      name: basename(dir),
      bootUrl: "../../bundles/declare-boot.js?v=",
      serveCoreUrl: "../../browser/serve-core.js",
      iconBase: "../../assets/",
    });
    // committed = one generator marker line + the template (with a stamped ?v=)
    const body = committed.slice(committed.indexOf("\n") + 1);
    assert.equal(norm(body), norm(expected), `${dir}/index.html is stale — run tools/internal/bake-app-stubs.mjs`);
    checked++;
  }
  assert.ok(checked > 0, "no committed stubs found to check");
});

summarize("serve-core parity");
