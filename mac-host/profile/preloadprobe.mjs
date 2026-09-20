// preloadprobe — which <link rel=preload as=fetch> / fetch() combination is
// actually REUSED, and does a browser care what content-type the bytes arrive
// under? Counts what the SERVER sent (a reused preload never reaches it) and
// whether WebAssembly.instantiate accepted the bytes.
//
//   node mac-host/profile/preloadprobe.mjs
import http from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const WASM = readFileSync(path.join(ROOT, "kernel/build/kernel.wasm"));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// (preload attribute, fetch init) — every pairing worth trying
const COMBOS = [
  ["no crossorigin", "", ""],
  ["no crossorigin + credentials omit", "", `, { credentials: "omit" }`],
  ["crossorigin=anonymous", ` crossorigin="anonymous"`, ""],
  ["crossorigin=anonymous + credentials omit", ` crossorigin="anonymous"`, `, { credentials: "omit" }`],
];
// content types a static host might pick for a file named *.wasm.txt — plus the
// ones a misconfigured or clever host might choose instead
const TYPES = ["text/plain", "text/plain; charset=utf-8", "application/json", "application/octet-stream", "text/html", "application/wasm"];

const hits = new Map();
const state = { type: "text/plain" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const key = u.pathname;
  hits.set(key, (hits.get(key) ?? 0) + 1);
  if (key === "/kernel.wasm.txt") {
    res.writeHead(200, { "content-type": state.type, "cache-control": "no-store" });
    res.end(WASM);
    return;
  }
  const combo = COMBOS[Number(u.searchParams.get("combo") ?? 0)];
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><title>probe</title>
<link rel="preload" href="/kernel.wasm.txt?c=${u.searchParams.get("combo") ?? 0}" as="fetch"${combo[1]}>
<div id="out">working</div>
<script type="module">
  const t0 = performance.now();
  try {
    const r = await fetch("/kernel.wasm.txt?c=${u.searchParams.get("combo") ?? 0}"${combo[2]});
    const bytes = new Uint8Array(await r.arrayBuffer());
    const magic = bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
    const m = await WebAssembly.compile(bytes);
    globalThis.__probe = { ok: true, magic, bytes: bytes.length, exports: WebAssembly.Module.exports(m).length, ms: performance.now() - t0, type: r.headers.get("content-type") };
  } catch (e) { globalThis.__probe = { ok: false, error: String(e).slice(0, 120) }; }
  document.getElementById("out").textContent = "done";
</script>`);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
async function run(url) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction("globalThis.__probe != null", { timeout: 15000 }).catch(() => {});
  const out = await page.evaluate("globalThis.__probe ?? { ok: false, error: 'no result' }");
  await page.close();
  return out;
}

console.log("PRELOAD REUSE — how many times the server had to send the file (1 = the preload was reused)\n");
for (let i = 0; i < COMBOS.length; i++) {
  hits.clear();
  const out = await run(`${B}/?combo=${i}`);
  const sent = hits.get("/kernel.wasm.txt") ?? 0;
  console.log(`  ${COMBOS[i][0].padEnd(42)} server sent ×${sent}   compiled=${out.ok}`);
}

console.log("\nCONTENT TYPE — does the browser care what the bytes arrive as?\n");
for (const t of TYPES) {
  state.type = t;
  hits.clear();
  const out = await run(`${B}/?combo=2`);
  console.log(`  ${t.padEnd(30)} compiled=${String(out.ok).padEnd(5)} magic=${out.magic ?? "-"} exports=${out.exports ?? "-"}${out.error ? "  " + out.error : ""}`);
}

// and the case the magic check exists for: a host that "helpfully" rewrites text
state.type = "text/plain";
const TRANSFORMS = [
  ["appends a newline (text normalizer)", (b) => Buffer.concat([b, Buffer.from("\n")])],
  ["prepends a UTF-8 BOM", (b) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), b])],
  ["transcodes as UTF-8 text (lossy)", (b) => Buffer.from(b.toString("utf8"), "utf8")],
];
console.log("\nA HOST THAT REWRITES TEXT — what the runtime would see\n");
for (const [label, fn] of TRANSFORMS) {
  const mangled = fn(WASM);
  const same = mangled.length === WASM.length && mangled.equals(WASM);
  const magic = mangled[0] === 0 && mangled[1] === 0x61 && mangled[2] === 0x73 && mangled[3] === 0x6d;
  let compiles = false;
  try { await WebAssembly.compile(mangled); compiles = true; } catch { /* expected */ }
  console.log(`  ${label.padEnd(38)} bytes ${WASM.length} → ${mangled.length}  identical=${same}  magic=${magic}  compiles=${compiles}`);
}

await browser.close();
server.close();
