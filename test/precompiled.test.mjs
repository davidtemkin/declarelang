// Precompiled bodies (declarec, 2026-09-19): a production build ships every
// `{ }` body, method body and script block as a FUNCTION in the bundle, not as
// text the runtime compiles at startup (runtime/src/expr.ts, "PRECOMPILED
// BODIES"). This pins today's behaviour, in a real browser:
//
//   1. it RUNS the same — `super` through three levels (methods that reach
//      their base keep "$base" in their token: instantiate looks for it);
//   2. it compiles NO text at runtime — `eval` and `Function` are replaced
//      before the page loads with traps that record any call.
//
// A text build trips the same trap, so the check is real. If the compiler ever
// needs to emit code that compiles text at runtime, change this test on purpose.
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";
import { buildProduction } from "../tools/declarec.mjs";

const chrome = [process.env.PUPPETEER_EXECUTABLE_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(existsSync);
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });

// super through three levels, fired at boot: the log is "cab" only if every
// `super.onInit()` reached its base
const SOURCE = `
class A extends View [ log: string = "",
    onInit() { log = log + "a" } ]
class B extends A [
    onInit() { super.onInit(); log = log + "b" } ]
class C extends B [
    onInit() { log = log + "c"; super.onInit() } ]
App [ width = 200, height = 60,
    c: C [ ],
    shown: Text [ text = { "log:" + app.c.log } ] ]`;

/** Build for production, serve it, boot it with eval and Function trapped. */
async function boot(precompile) {
  const out = await buildProduction(SOURCE, { name: "precompiled", precompile });
  assert.ok(out.ok, "build: " + (out.errors ?? []).map((e) => e.message).join("; "));
  const files = new Map(out.files.map((f) => ["/" + f.name, Buffer.from(f.contents)]));
  const srv = http.createServer((req, res) => {
    const p = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
    const body = files.get(p);
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": p.endsWith(".html") ? "text/html" : "application/javascript" });
    res.end(body);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const pg = await browser.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e)));
  await pg.evaluateOnNewDocument(() => {
    globalThis.__textCompiles = [];
    const trap = (what) => function (...args) {
      globalThis.__textCompiles.push(what + ": " + String(args[args.length - 1] ?? "").slice(0, 60));
      throw new EvalError(what + " is trapped in this test");
    };
    globalThis.eval = trap("eval");
    const F = trap("Function");
    F.prototype = Function.prototype;
    globalThis.Function = F;
    Object.defineProperty(Function.prototype, "constructor", { value: F });
  });
  await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" });
  // polled from here: puppeteer's waitForFunction builds its predicate with Function in the page
  for (let i = 0; i < 100; i++) {
    const done = await pg.evaluate(() => (document.getElementById("host")?.innerText ?? "").includes("log:") || globalThis.__textCompiles.length > 0);
    if (done) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const seen = await pg.evaluate(() => ({ compiles: globalThis.__textCompiles, text: document.getElementById("host")?.innerText ?? "" }));
  await pg.close(); srv.close();
  return { ...seen, errors };
}

const pre = await boot(true);
await test("a precompiled build runs the same: super reaches its base", () => {
  assert.deepEqual(pre.errors, [], "page errors: " + pre.errors.join(" | "));
  assert.match(pre.text, /log:cab/, "rendered: " + JSON.stringify(pre.text));
});
await test("a precompiled build compiles no text at runtime", () => {
  assert.deepEqual(pre.compiles, [], "compiled from text: " + pre.compiles.join(" | "));
});

const txt = await boot(false);
await test("a text build trips the same trap (the check is real)", () => {
  assert.ok(txt.compiles.length > 0, "a text build compiled nothing from text — the trap is not being applied");
});

await browser.close();
summarize("precompiled");
