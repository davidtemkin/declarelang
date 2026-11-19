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
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, basename, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";
import { requestType, REQ, viewerTab, runWrapper, programName, directoryProgram, stubPage, launchTarget, isEntryPage } from "../browser/serve-core.js";
import { preloadsFor } from "../tools/internal/bake-app-stubs.mjs";
import { programDirs } from "../tools/internal/program-dirs.mjs";
import { programPageColor } from "../compiler/dist/compile-node.js";

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
  assert.equal(requestType(params("viewer=sizes")), REQ.SIZES_TAB);  // the tab, not the JSON
  assert.equal(viewerTab(REQ.SIZES_TAB), "sizes");
  assert.equal(requestType(params("viewer=bogus")), REQ.READER);  // unknown value → the Viewer default
  assert.equal(requestType(params("viewer")), REQ.READER);       // bare ?viewer → the Reader          // unknown view → safe default
  assert.equal(requestType(params("build")), REQ.BUILD);             // bare presence keys
  assert.equal(requestType(params("file")), REQ.FILE);
  assert.equal(requestType(params("segments")), REQ.SEGMENTS);
  assert.equal(requestType(params("extract")), REQ.EXTRACT);
  assert.equal(requestType(params("sizes")), REQ.SIZES);
  assert.equal(requestType(params("reader")), REQ.RUN);              // bare ?reader is not a request now
});

// THE LAUNCHER URL — the one link that works COLD, before any service worker
// exists, and therefore the one you hand to a stranger. Its grammar decides what a
// stranger's browser will navigate to, so the refusals matter as much as the
// accepts. Pure, so this costs no browser.

await test("launchTarget reads a bare-path query as the target", () => {
  const t = (href) => launchTarget(href);
  assert.equal(t("https://x.dev/index.html?apps/desktop/").pathname, "/apps/desktop/");
  assert.equal(t("https://x.dev/?apps/desktop/").pathname, "/apps/desktop/");
  assert.equal(t("https://x.dev/index.html?apps/docs/docs.declare").pathname, "/apps/docs/docs.declare");
  // a project-page deploy: everything is relative to the entry page's directory
  assert.equal(t("https://x.dev/declarelang/index.html?apps/desktop/").pathname, "/declarelang/apps/desktop/");
});

await test("launchTarget ignores ordinary flag queries — a page keeps its own params", () => {
  for (const q of ["", "?render=canvas", "?crawler=true", "?viewer=edit", "?clear", "?a=b/c"]) {
    assert.equal(launchTarget("https://x.dev/index.html" + q), null, `${q || "(no query)"} is not a launch target`);
  }
});

await test("launchTarget refuses anything outside the entry page's own directory", () => {
  const bad = [
    "https://x.dev/index.html?https://evil.example/x.declare",   // absolute
    "https://x.dev/index.html?//evil.example/x.declare",         // protocol-relative
    "https://x.dev/declarelang/index.html?../../etc/passwd",     // .. escape, normalized first
    "https://x.dev/declarelang/index.html?../other/app.declare", // sibling deploy
  ];
  for (const href of bad) assert.equal(launchTarget(href), null, href);
});

await test("launchTarget carries the entry page's fragment to a target without one", () => {
  assert.equal(launchTarget("https://x.dev/index.html?apps/docs/docs.declare#guide/06-layout").hash, "#guide/06-layout");
  // the target's own fragment wins
  assert.equal(launchTarget("https://x.dev/index.html?apps/docs/docs.declare%23a#b").hash, "#a");
});

// `?clear` is a HOST-wide verb, so it is honored only at a host-wide address.
await test("isEntryPage accepts entry pages and refuses program URLs", () => {
  for (const p of ["/", "/index.html", "/declarelang/index.html", "/apps/desktop/index.html"])
    assert.ok(isEntryPage(p), p);
  for (const p of ["/apps/desktop/", "/apps/desktop/desktop.declare", "/my-apps/x.declare", "/notindex.html"])
    assert.ok(!isEntryPage(p), p);
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

await test("runWrapper embeds a staticBlock (the server's ?crawler=true bake) inside the host", () => {
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

// PRELOADS: what boot fetches before it can render leaves with the page. The links
// sit in the head before the style, as fetch preloads boot's own fetch() consumes;
// a page with none has no line, so the shell stays identical to the run page's.
await test("stubPage preloads the prewarm artifact, in the head", () => {
  const preloads = preloadsFor("apps/homepage/homepage.declare", "../../");
  assert.equal(preloads.length, 1, "the homepage is prewarmed");
  assert.match(preloads[0], /^\.\.\/\.\.\/bundles\/cache\/[0-9a-f]{16}\.json$/);
  const stub = stubPage({ name: "homepage", bootUrl: "/b.js", serveCoreUrl: "/browser/serve-core.js", iconBase: "/assets/", preloads });
  for (const h of preloads) assert.ok(stub.includes(`<link rel="preload" href="${h}" as="fetch" crossorigin>`), `preload for ${h}`);
  assert.ok(stub.indexOf('rel="preload"') < stub.indexOf("<style>"), "preloads precede the style");
  assert.deepEqual(preloadsFor("apps/sampler/sampler.declare", "../../"), [], "no build → nothing to preload");
});

await test("stubPage computes main at runtime and hands modifiers to the worker", () => {
  const stub = stubPage({ name: "calendar", bootUrl: "/b.js", serveCoreUrl: "/browser/serve-core.js" });
  assert.match(stub, /main: directoryProgram\(location\.pathname\) \?\? location\.pathname/);
  assert.match(stub, /requestType\(q\) !== REQ\.RUN/);                // only a modifier defers
  assert.match(stub, /serviceWorker\.ready\.then\(\(\) => location\.reload\(\)\)/);
  assert.match(stub, /import \{ requestType, REQ, directoryProgram \} from "\/browser\/serve-core\.js"/);
});

// FRESHNESS ORACLE: the committed stubs must be regenerable from the current template.
// Editing stubPage() without rerunning bake-app-stubs.mjs (`npm run derive` does)
// fails here — the committed artifact may not drift from the code that generates it.
await test("every committed app stub matches the current stubPage template", () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const norm = (s) => s.replace(/(declare-boot\.js)\?v=[^"']*/g, "$1?v=");
  let checked = 0, nested = 0;
  for (const abs of programDirs(ROOT)) {
    const f = join(abs, "index.html");
    if (!existsSync(f)) continue;
    const dir = relative(ROOT, abs).split(sep).join("/");     // apps/calendar, apps/games/tempest
    const toRoot = "../".repeat(dir.split("/").length);
    const committed = readFileSync(f, "utf8");
    const expected = stubPage({
      name: basename(dir),
      bootUrl: `${toRoot}bundles/declare-boot.js?v=`,
      serveCoreUrl: `${toRoot}browser/serve-core.js`,
      iconBase: `${toRoot}assets/`,
      preloads: preloadsFor(`${dir}/${basename(dir)}.declare`, toRoot),
      pageColor: programPageColor(readFileSync(join(abs, `${basename(dir)}.declare`), "utf8")),
    });
    // committed = one generator marker line + the template (with a stamped ?v=)
    const body = committed.slice(committed.indexOf("\n") + 1);
    assert.equal(norm(body), norm(expected), `${dir}/index.html is stale — run tools/internal/bake-app-stubs.mjs`);
    checked++;
    if (toRoot.length > 6) nested++;
  }
  assert.ok(checked > 0, "no committed stubs found to check");
  assert.ok(nested > 0, "no stub below apps/<group>/ checked — the depth case is untested");
});

// A page opens on the color its App declares: the stub and the service worker (which
// serves the same shell on every later visit) carry the same colors, from one reading.
await test("the service worker's page colors are the stubs' (an App's literal fill; a rule opens on the browser's own)", () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sw = readFileSync(join(ROOT, "service-worker.js"), "utf8");
  const table = JSON.parse(sw.match(/const PAGE_COLORS = (\{[^\n]*\});/)[1]);
  const expected = {};
  for (const abs of programDirs(ROOT)) {
    const dir = relative(ROOT, abs).split(sep).join("/");
    const color = programPageColor(readFileSync(join(abs, `${basename(dir)}.declare`), "utf8"));
    if (color !== null) expected[`${dir}/${basename(dir)}.declare`] = color;
  }
  assert.deepEqual(table, expected, "service-worker.js PAGE_COLORS is stale — run tools/internal/bake-app-stubs.mjs");
  assert.equal(expected["apps/games/asteroids/asteroids.declare"], "#000000", "a literal named fill (black) reads as its color");
  assert.equal(expected["apps/calendar/calendar.declare"], undefined, "a fill that is a rule has no color before the program runs");
  assert.match(runWrapper({ name: "x", bootUrl: "b.js" }), /background:Canvas\}/, "with no color, the page is the browser's own");
  assert.match(runWrapper({ name: "x", bootUrl: "b.js", pageColor: "#000000" }), /background:#000000\}/);
});

// THE TREE RULE: a program directory is any directory under apps/, at any depth, holding
// its name-matched .declare — inside another program too; a folder without one only groups.
await test("programDirs finds programs at any depth, and nothing else", () => {
  const root = tempDir("program-dirs-");
  const make = (rel) => { mkdirSync(join(root, dirname(rel)), { recursive: true }); writeFileSync(join(root, rel), "App [ ]\n"); };
  make("apps/calendar/calendar.declare");
  make("apps/calendar/data/events.declare");          // an app's own folder: not a program
  make("apps/games/tempest/tempest.declare");         // under a group
  make("apps/games/tempest/sounds/sounds.txt");
  make("apps/desktop/desktop.declare");
  make("apps/desktop/notes/notes.declare");           // a tenant inside its host's folder
  make("apps/v1.2/v1.2.declare");                     // dotted: a file name, never a program dir
  make("apps/dist/dist.declare");                     // build output: not walked
  try {
    const got = programDirs(root).map((d) => relative(root, d).split(sep).join("/"));
    assert.deepEqual(got, ["apps/calendar", "apps/desktop", "apps/desktop/notes", "apps/games/tempest"]);
    assert.equal(directoryProgram("/apps/games/tempest/"), "/apps/games/tempest/tempest.declare");
    assert.equal(directoryProgram("/apps/desktop/notes"), "/apps/desktop/notes/notes.declare");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

summarize("serve-core parity");
