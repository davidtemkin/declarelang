// Phase C gate: the crawled document is byte-identical in the browser (real canvas
// measurer, same-origin data fetch) and Node (approximate measurer, disk data read).
// staticHtml serializes CLASS SEMANTICS — not geometry — so neither the measurer nor
// the data channel can move a byte. Exercises BOTH exemplars: homepage (no data) and
// docs (data-driven — the real own-material resolvers on each side).
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { compile, crawlDocument, diskDataResolver } from "../../../compiler/dist/compile-node.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve as presolve } from "node:path";
const ROOT = presolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
let failures = 0;

const b = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
const page = await b.newPage();
await page.goto("http://localhost:8364/", { waitUntil: "domcontentloaded" });

for (const rel of ["examples/homepage/homepage.declare", "examples/docs/docs.declare"]) {
  const dir = ROOT + "/" + rel.split("/").slice(0, -1).join("/");
  const r = compile(readFileSync(ROOT + "/" + rel, "utf8"), { originDir: dir });
  const nodeDoc = await crawlDocument(r.source, { deps: r.deps, links: r.links, data: diskDataResolver(dir) });

  const browserDoc = await page.evaluate(async (src, deps, links, base) => {
    const m = await import("/bundles/declare-compiler.js");
    return m.crawlDocument(src, {
      deps, links,
      data: (url) => fetch(new URL(url, location.origin + "/" + base), { cache: "no-cache" })
        .then((res) => (res.ok ? res.json() : null)).catch(() => null),
    });
  }, r.source, r.deps, r.links, rel);

  const same = nodeDoc === browserDoc;
  if (!same) failures++;
  console.log(`${same ? "ok  " : "FAIL"} — ${rel}: crawled document byte-identical browser↔Node (${(nodeDoc.length / 1024).toFixed(1)} KB)`
    + (same ? "" : `\n       node=${nodeDoc.length}b browser=${browserDoc?.length}b`));
}

await b.close();
console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
