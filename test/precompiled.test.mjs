// Precompiled bodies (declarec, 2026-09-19): a production build ships every
// `{ }` body, method body and script block as a FUNCTION in the bundle, not as
// text the runtime compiles at startup (runtime/src/expr.ts, "PRECOMPILED
// BODIES"). Two promises, pinned here in a real browser:
//
//   1. it RUNS the same — including `super` (methods that reach their base
//      keep "$base" in their token: instantiate looks for it) and provision
//      order (orderProvisions reads the compiler's deps when the text is a
//      token — tracker once installed `textColor` before `theme`);
//   2. it needs NO text-to-code at all — served under a Content-Security-
//      Policy that forbids eval, the app still boots. The one allowance kept
//      is 'wasm-unsafe-eval', the narrow CSP source that lets a page compile
//      WebAssembly (the kernel) without permitting JavaScript eval.
//
// The same policy is shown to BREAK a text build, so the test is not vacuous.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";
import { buildProduction } from "../tools/declarec.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:";
const chrome = [process.env.PUPPETEER_EXECUTABLE_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(existsSync);
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });

/** Build `source` for production and boot it under the CSP; report what the page saw. */
async function bootUnderCsp(source, { name, dir = null, precompile = true }) {
  const out = await buildProduction(source, { name, originDir: dir ?? undefined, precompile });
  assert.ok(out.ok, "build: " + (out.errors ?? []).map((e) => e.message).join("; "));
  const files = new Map(out.files.map((f) => ["/" + f.name, Buffer.from(f.contents)]));
  const srv = http.createServer((req, res) => {
    const p = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
    let body = files.get(p);
    if (!body && dir !== null) { try { body = readFileSync(path.join(dir, decodeURIComponent(p))); } catch { /* none */ } }
    if (!body) { res.writeHead(404); res.end(); return; }
    const type = p.endsWith(".html") ? "text/html" : p.endsWith(".js") ? "application/javascript" : p.endsWith(".json") ? "application/json" : "application/octet-stream";
    res.writeHead(200, { "content-type": type, "content-security-policy": CSP });
    res.end(body);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const pg = await browser.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e)));
  await pg.evaluateOnNewDocument(() => {
    globalThis.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => globalThis.__cspViolations.push(e.violatedDirective + " " + (e.sample || "")));
  });
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  const seen = await pg.evaluate(() => ({ violations: globalThis.__cspViolations, mounted: (document.getElementById("host")?.childElementCount ?? 0) > 0, text: document.getElementById("host")?.innerText ?? "" }));
  await pg.close(); srv.close();
  return { ...seen, errors };
}

console.log("precompiled bodies — a production build runs the same, with no text-to-code");

for (const app of ["calendar", "desktop", "tracker", "sampler"]) {
  const dir = path.join(ROOT, "apps", app);
  const r = await bootUnderCsp(readFileSync(path.join(dir, app + ".declare"), "utf8"), { name: app, dir });
  await test(`${app} boots under a CSP that forbids eval`, () => {
    assert.deepEqual(r.violations, [], "CSP violations: " + r.violations.join(" | "));
    assert.deepEqual(r.errors, [], "page errors: " + r.errors.join(" | "));
    assert.ok(r.mounted, "the app did not mount");
  });
}

// super through three levels, fired at boot (test/super.test.mjs's program):
// the rendered log is "cab" only if every `super.onInit()` reached its base
const SUPER = `
class A extends View [ log: string = "",
    onInit() { log = log + "a" } ]
class B extends A [
    onInit() { super.onInit(); log = log + "b" } ]
class C extends B [
    onInit() { log = log + "c"; super.onInit() } ]
App [ width = 200, height = 60,
    c: C [ ],
    shown: Text [ text = { "log:" + app.c.log } ] ]`;
{
  const r = await bootUnderCsp(SUPER, { name: "supercheck" });
  await test("super reaches its base in a precompiled build (methods keep $base in their token)", () => {
    assert.deepEqual(r.errors, [], "page errors: " + r.errors.join(" | "));
    assert.match(r.text, /log:cab/, "rendered: " + JSON.stringify(r.text));
  });
}

// the control: a TEXT build under the same policy cannot compile its bodies
{
  const dir = path.join(ROOT, "apps", "calendar");
  const r = await bootUnderCsp(readFileSync(path.join(dir, "calendar.declare"), "utf8"), { name: "calendar", dir, precompile: false });
  await test("the same policy breaks a text build (the check is real)", () => {
    assert.ok(r.violations.length > 0 || r.errors.length > 0, "a text build booted under a no-eval CSP — the policy is not being applied");
  });
}

await browser.close();
summarize("precompiled");
