// Registry slimming + the `use [ … ]` keep-list. A production build ships only
// the component classes an app can instantiate — the static tree references
// (tags, class bases), any `{ }`-body `new X()`, and the explicit `use` list —
// dropping the rest (the rich-text engine, etc.). These tests prove: the `use`
// directive parses/validates, the used-set is computed correctly, the slim
// manifest can't drift from the real tables, and a slimmed bundle still renders.
import assert from "node:assert";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { parseProgram } from "../runtime/dist/parser.js";
import { check } from "../runtime/dist/check.js";
import {
  REGISTRY_MANIFEST, REGISTRY_NAMES,
  TAGS, LAYOUTS, LAYOUT_BASES, DATA, ANIMATORS, ANIMATOR_GROUPS, STATES,
} from "../runtime/dist/registry.js";
import { compileProgram, usedComponentNames } from "../compiler/dist/declarec.js";
import { buildProduction } from "../tools/declarec.mjs";
import { parseFlags, parseArgvFlags, DEFAULT_FLAGS } from "../compiler/dist/flags.js";

let pass = 0, fail = 0;
function test(name, fn) {
  try { const r = fn(); if (r instanceof Promise) return r.then(() => { pass++; console.log("  ok —", name); }, (e) => { fail++; console.log("  FAIL —", name, "\n     ", e.message); }); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
const used = (src) => { const b = compileProgram(src, { stripPos: false }); assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; ")); return new Set(b.usedComponents); };

// ── the `use` directive ──────────────────────────────────────────────────────
test("use [ … ] parses into program.uses", () => {
  assert.deepEqual(parseProgram(`use [ Markdown, HTMLText ]\nApp [ width = 10 ]`).uses, ["Markdown", "HTMLText"]);
});
test("use of a built-in / declared class passes check", () => {
  assert.equal(check(parseProgram(`use [ Markdown ]\nApp [ width = 10 ]`)).length, 0);
  assert.equal(check(parseProgram(`class Card extends View [ ]\nuse [ Card ]\nApp [ width = 10 ]`)).length, 0);
});
test("use of an unknown name is a checker error", () => {
  const errs = check(parseProgram(`use [ Nope ]\nApp [ width = 10 ]`));
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /unknown component 'Nope'/);
});
test("use of an abstract base (RichText/Layout) is rejected", () => {
  assert.equal(check(parseProgram(`use [ RichText ]\nApp [ width = 10 ]`)).length, 1);
  assert.equal(check(parseProgram(`use [ Layout ]\nApp [ width = 10 ]`)).length, 1);
});
test("a non-identifier use entry is a parse error", () => {
  assert.throws(() => parseProgram(`use [ "x" ]\nApp [ width = 10 ]`), /a use entry is a component name/);
});

// ── the used-set ─────────────────────────────────────────────────────────────
test("used-set: a static tag is detected", () => assert.ok(used(`App [ Markdown [ text = "x" ] ]`).has("Markdown")));
test("used-set: a class base is detected", () => assert.ok(used(`class C extends HTMLText [ ]\nApp [ C [ html = "<p>x</p>" ] ]`).has("HTMLText")));
test("used-set: the root's own tag (App) is always present", () => assert.ok(used(`App [ Text [ text = "x" ] ]`).has("App")));
test("used-set: a component-valued member (layout/data/animator) is detected", () => {
  const u = used(`App [ layout: SimpleLayout [ axis = y ], ds: DataSource [ url = "x" ], Text [ text = "x" ] ]`);
  assert.ok(u.has("SimpleLayout") && u.has("DataSource"));
});
test("used-set: a no-prose app does NOT include rich text", () => {
  const u = used(`App [ Text [ text = "x" ] ]`);
  assert.ok(!u.has("Markdown") && !u.has("HTMLText"));
});
test("used-set: use[] adds a name with no static reference", () => assert.ok(used(`use [ Markdown ]\nApp [ Text [ text = "x" ] ]`).has("Markdown")));

// ── the slim manifest can't drift from the real tables ───────────────────────
test("REGISTRY_MANIFEST matches the runtime tables exactly (no drift)", () => {
  const tables = { TAGS, LAYOUTS, LAYOUT_BASES, DATA, ANIMATORS, ANIMATOR_GROUPS, STATES };
  for (const [name, table] of Object.entries(tables)) {
    const manifestNames = new Set(REGISTRY_MANIFEST.filter((e) => e.table === name).map((e) => e.name));
    const tableNames = new Set(Object.keys(table));
    assert.deepEqual([...manifestNames].sort(), [...tableNames].sort(), `table ${name} drifted from the manifest`);
  }
  // Every manifest name is a known registry name and vice versa.
  assert.deepEqual([...new Set(REGISTRY_MANIFEST.map((e) => e.name))].sort(), [...new Set(REGISTRY_NAMES)].sort());
});

// ── compile flags: one canonical model, three surfaces ───────────────────────
const P = (obj) => ({ has: (k) => k in obj, get: (k) => (k in obj ? String(obj[k]) : null) });
test("URL flags: defaults when absent", () => {
  const f = parseFlags(P({}), DEFAULT_FLAGS);
  assert.equal(f.render, "dom"); assert.equal(f.slim, true); assert.equal(f.stripPos, true);
});
test("URL flags: ?render=canvas and ?slim=0 and ?prod", () => {
  const f = parseFlags(P({ render: "canvas", slim: "0", prod: "" }), DEFAULT_FLAGS);
  assert.equal(f.render, "canvas"); assert.equal(f.slim, false); assert.equal(f.prod, true);
});
test("URL flags: ?stripPos=0 (and its all-lowercase form) turns stripPos off", () => {
  assert.equal(parseFlags(P({ stripPos: "0" }), DEFAULT_FLAGS).stripPos, false);
  assert.equal(parseFlags(P({ strippos: "0" }), DEFAULT_FLAGS).stripPos, false);
});
test("URL flags: a malformed boolean falls back to the base", () => {
  assert.equal(parseFlags(P({ slim: "maybe" }), DEFAULT_FLAGS).slim, true);
});
test("argv flags: --no-slim --canvas, input left in rest", () => {
  const { flags, rest } = parseArgvFlags(["--no-slim", "--canvas", "app.declare"], { ...DEFAULT_FLAGS, prod: true });
  assert.equal(flags.slim, false); assert.equal(flags.render, "canvas"); assert.equal(flags.prod, true);
  assert.deepEqual(rest, ["app.declare"]);
});
test("argv flags: --full is an alias for --no-slim; --no-strip-pos clears stripPos", () => {
  const { flags } = parseArgvFlags(["--full", "--no-strip-pos"], DEFAULT_FLAGS);
  assert.equal(flags.slim, false); assert.equal(flags.stripPos, false);
});

// ── a slimmed bundle renders ─────────────────────────────────────────────────
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((p) => existsSync(p));
async function renders(src) {
  const b = await buildProduction(src, {});
  assert.ok(b.ok, "build failed: " + (b.errors || []).map((e) => e.message).join("; "));
  const appJs = b.files.find((f) => f.name.startsWith("app.")).contents;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.setContent(`<!doctype html><div id=host></div><script type=module>${appJs}</script>`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 350));
    const n = await page.evaluate(() => document.getElementById("host")?.querySelectorAll("*").length ?? -1);
    assert.equal(errs.length, 0, "page errors: " + errs.slice(0, 2).join(" | "));
    assert.ok(n > 1, "host has no rendered content");
    return { used: b.usedComponents, gz: b.sizes.appGzip };
  } finally { await browser.close(); }
}

if (!CHROME) {
  console.log("  (skipping render tests — no Chrome found)");
} else {
  await test("slimmed no-prose bundle renders (rich text dropped)", async () => {
    const r = await renders(`App [ width = 200, layout: SimpleLayout [ axis = y ], Text [ text = "a" ], Text [ text = "b" ] ]`);
    assert.ok(!r.used.includes("Markdown"));
  });
  await test("slimmed prose bundle renders (Markdown kept)", async () => {
    const r = await renders(`App [ width = 200, Markdown [ width = 180, text = "# Hi" ] ]`);
    assert.ok(r.used.includes("Markdown"));
  });
  await test("slimming saves > 5KB gzip vs the full runtime on a no-prose app", async () => {
    const src = `App [ width = 200, Text [ text = "a" ] ]`;
    const full = await buildProduction(src, { slim: false });
    const lean = await buildProduction(src, {});
    const saved = (full.sizes.appGzip - lean.sizes.appGzip) / 1024;
    assert.ok(saved > 5, `only saved ${saved.toFixed(1)}KB`);
  });
}

console.log(`\nslim: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
