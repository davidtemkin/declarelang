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
import { test, summarize } from "./harness.mjs";
import { requestType, REQ, runWrapper, programName } from "../browser/serve-core.js";

const params = (q) => new URLSearchParams(q);

console.log("serve-core parity");

await test("requestType maps the query to a request (the classifier both hosts share)", () => {
  assert.equal(requestType(params("")), REQ.RUN);                     // default
  assert.equal(requestType(params("render=canvas")), REQ.RUN);       // a modifier, not a request
  assert.equal(requestType(params("view=reader")), REQ.READER);      // ?view= = the viewer's tabs
  assert.equal(requestType(params("view=source")), REQ.SOURCE);      // the viewer's Source tab
  assert.equal(requestType(params("view=edit")), REQ.EDIT);
  assert.equal(requestType(params("view=bogus")), REQ.RUN);          // unknown view → safe default
  assert.equal(requestType(params("build")), REQ.BUILD);             // bare presence keys
  assert.equal(requestType(params("file")), REQ.FILE);
  assert.equal(requestType(params("segments")), REQ.SEGMENTS);
  assert.equal(requestType(params("extract")), REQ.EXTRACT);
  assert.equal(requestType(params("reader")), REQ.RUN);              // bare ?reader is not a request now
});

await test("programName strips the directory and extension", () => {
  assert.equal(programName("/examples/calendar/calendar.declare"), "calendar");
  assert.equal(programName("homepage.declare"), "homepage");
});

await test("runWrapper produces a valid RUN shell that boots the given bundle", () => {
  const html = runWrapper({ name: "calendar", bootUrl: "/bundles/declare-boot.js" });
  assert.match(html, /<div id="host"><\/div>/);                      // empty host (no staticBlock)
  assert.match(html, /import boot from "\/bundles\/declare-boot\.js"/);
  assert.match(html, /boot\(\{ main: location\.pathname/);           // main = the program's own URL
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

summarize("serve-core parity");
