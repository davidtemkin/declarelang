// test/package.test.mjs — a production package is a self-contained folder.
//
// The `ship [ … ]` block (runtime/src/parser.ts Ship) is what a program says a
// package must carry beyond what its source names. This test builds a program
// that declares all of it — an island by computed name, a file outside its
// folder, the compiler, the Inspector — writes the package to a temp folder,
// serves THAT FOLDER ALONE, and drives it in a real browser: every request the
// page makes must land inside the folder, the island must mount from its
// compiled program, the file must arrive from its copy, an island the build
// never saw must compile on the page from the compiler the package carries,
// and the Inspector must open with no compile at all.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";
import { writeProduction } from "../tools/declarec.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
console.log("package");

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

// ── the program: a folder two levels down, reading a file two levels up ──────
const root = mkdtempSync(path.join(tmpdir(), "declare-package-"));
const srcDir = path.join(root, "apps", "shipper");
mkdirSync(path.join(srcDir, "demos"), { recursive: true });
mkdirSync(path.join(root, "docs"));
writeFileSync(path.join(root, "docs", "model.json"), JSON.stringify({ greeting: "from the docs model" }));
writeFileSync(path.join(srcDir, "demos", "tile.declare"), `App [ width = 120, height = 40, fill = tomato, Text [ x = 8, y = 8, text = "tile mounted" ] ]`);
// an island that lives in a SIBLING folder with its own data, and names itself
// as an island (a cycle the build must terminate on, shipping it once). A
// tenant's relative data resolves in its HOST's space, so it reads its own
// file through the home its host provides — the desktop's convention.
const otherDir = path.join(root, "apps", "other");
mkdirSync(otherDir, { recursive: true });
writeFileSync(path.join(otherDir, "other.json"), JSON.stringify({ word: "other's own data" }));
writeFileSync(path.join(otherDir, "other.declare"), `ship [ islands = ["../../other/other"] ]
App [ width = 160, height = 40, d: DataSource [ url = { hostProvided("base", "") + "other.json" }, auto = true ],
    t: Text [ x = 4, y = 4, text = { app.d.loaded ? app.d.value.word : "waiting" } ] ]`);
writeFileSync(path.join(srcDir, "demos", "late.declare"), `App [ width = 120, height = 40, fill = teal, Text [ x = 8, y = 8, text = "late compiled" ] ]`);
writeFileSync(path.join(srcDir, "shipper.declare"), `ship [
    islands = ["tile", "../../other/other"],
    files = ["../../docs/model.json", "demos/late.declare"],
    compiler = true,
    inspector = true,
]
App [ width = 400, height = 300,
    which: string = "tile",
    late: string = "",
    model: DataSource [ url = "../../docs/model.json", auto = true ],
    greeting: Text [ x = 10, y = 10, text = { app.model.loaded ? app.model.value.greeting : "loading" } ],
    a: AppIsland [ x = 10, y = 40, width = 140, height = 50, program = { app.which } ],
    b: AppIsland [ x = 10, y = 100, width = 140, height = 50, program = { app.late } ],
    o: AppIsland [ x = 200, y = 40, width = 160, height = 50, program = { app.which == "tile" ? "../../other/other" : "" },
        provides = ["base"], base: string = "../other/" ],
]`);

const outDir = path.join(root, "dist");
const out = await writeProduction({ source: readFileSync(path.join(srcDir, "shipper.declare"), "utf8"), name: "shipper", srcDir, outDir });

// ── the host: THAT FOLDER, nothing else ─────────────────────────────────────
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".declare": "text/plain" };
const requests = [];
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  requests.push(p);
  const file = path.join(outDir, p === "/" ? "index.html" : p);
  if (!file.startsWith(outDir) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end("not in the package"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); for (;;) { if (await fn()) return true; if (Date.now() - t0 > ms) return false; await wait(100); } };

await test("the build carried everything the block named", () => {
  assert.ok(out.ok, out.report);
  const names = out.files.map((f) => f.name);
  assert.equal(out.islands.length, 2, "the declared islands, the self-naming one shipped once");
  assert.ok(out.shipped.files.some((f) => f.path === "../other/other.json"), "the sibling island's own data rides along: " + out.shipped.files.map((f) => f.path).join(", "));
  assert.ok(out.shipped.files.length >= 3, "the two declared files, plus the island's");
  const seg = out.shipped.files.find((f) => f.path === "demos/late.declare?segments");
  assert.ok(seg && /\.segments\.json$/.test(seg.file), "a shipped Declare source carries its reader segments, answering ?segments");
  assert.ok(out.shipped.inspector, "the Inspector's program");
  assert.ok(names.includes("bundles/declare-compiler.js") && names.includes("library/autoincludes.json"), "the compiler and the library");
});

await test("served alone, the package boots, mounts its island, and reads its file from inside the folder", async () => {
  await page.goto(B + "/", { waitUntil: "networkidle0", timeout: 60000 });
  assert.ok(await until(() => page.evaluate(() => !!window.__app && window.__app.greeting.text === "from the docs model")), "the DataSource read the shipped copy of a file two levels up: " + errors.join(" | "));
  assert.ok(await until(() => page.evaluate(() => [...document.querySelectorAll('[data-declare-slot="run:tile"]')].some((b) => b.__childApp))), "the declared island mounted from programs/");
  assert.ok(requests.some((p) => /^\/files\/[0-9a-f]+\.json$/.test(p)), "the file came from files/, not from above the folder: " + requests.join(" "));
  assert.ok(requests.some((p) => /^\/programs\/[0-9a-f]+\.json$/.test(p)), "the island came from programs/");
  assert.ok(await until(() => page.evaluate(() => [...document.querySelectorAll('[data-declare-slot="run:../../other/other"]')].some((b) => /other's own data/.test(b.textContent)))),
    "the sibling-folder island read its own data from the package: " + errors.join(" | ") + " — requests: " + requests.join(" "));
});

await test("an island the build never saw compiles on the page — the package carries the compiler", async () => {
  await page.evaluate(() => { window.__app.late = "late"; });
  assert.ok(await until(() => page.evaluate(() => [...document.querySelectorAll('[data-declare-slot="run:late"]')].some((b) => b.__childApp && /late compiled/.test(b.textContent))), 30000),
    "the late island mounted after an in-page compile: " + errors.join(" | "));
  assert.ok(requests.some((p) => p === "/bundles/declare-compiler.js" || p === "/bundles/compile-worker.js"), "the compiler was fetched from the package");
  assert.ok(requests.some((p) => /^\/files\/[0-9a-f]+\.declare$/.test(p)), "its source came from the shipped file");
});

await test("the Inspector opens from its compiled program", async () => {
  await page.goto(B + "/?inspector", { waitUntil: "networkidle0", timeout: 60000 });
  assert.ok(await until(() => page.evaluate(() => !!window.__inspector && !!window.__declare && !window.__declare.stub)), "the Inspector mounted and the bridge is real: " + errors.join(" | "));
  const why = await page.evaluate(() => window.__declare.explain("app.greeting", "text"));
  assert.ok(why && why.constraint && why.constraint.pos && why.constraint.pos.line > 0, "positions were kept: " + JSON.stringify(why?.constraint?.pos));
});

await test("nothing was asked for outside the package", () => {
  const outside = requests.filter((p) => p.includes("/../") || p.startsWith("/docs/") || p.startsWith("/apps/"));
  assert.deepEqual(outside, [], "every request landed in the folder");
  const missing = requests.filter((p) => !existsSync(path.join(outDir, p === "/" ? "index.html" : p)) && p !== "/favicon.ico");
  assert.deepEqual(missing, [], "and every request was answered from it");
});

await browser.close();
server.close();
summarize("package");
