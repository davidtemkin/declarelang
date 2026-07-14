// Rich-text rendering — proves list items, table cells and blockquote lines each
// render as ONE contiguous flowing region (a native <p>), not the old word-per-view
// scatter, and that the Canvas fallback still renders. The parser has its own tests
// (md.test.mjs); this is about how the Markdown COMPONENT lays the blocks out.
import assert from "node:assert";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { buildProduction } from "../tools/declarec.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { pass++; console.log("  ok —", name); },
    (e) => { fail++; console.log("  FAIL —", name, "\n     ", e.message); });
}

const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((p) => existsSync(p));

// A document exercising every text-bearing block: a paragraph, a list, a GFM table
// (with an aligned column), and a blockquote.
const DOC = `App [ width = 480, selectable = true,
    Markdown [ x = 20, y = 20, width = 440, text = """
An intro paragraph of several words.

- alpha beta gamma
- delta epsilon zeta

| Name | Score |
| :-- | --: |
| Ada | 99 |
| Linus | 88 |

> quoted words flow together here
""" ],
    ]`;

async function render(mode) {
  const b = await buildProduction(DOC, { render: mode });
  assert.ok(b.ok, "build failed: " + (b.errors || []).map((e) => e.message).join("; "));
  const appJs = b.files.find((f) => f.name.startsWith("app.")).contents;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.setContent(`<!doctype html><div id=host></div><script type=module>${appJs}</script>`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    const probe = await page.evaluate(() => {
      const texts = (sel) => Array.from(document.querySelectorAll(sel)).map((e) => e.textContent);
      const ps = texts("p");
      return {
        errCount: 0,
        nodes: document.querySelectorAll("#host *").length,
        paras: ps,
        canvases: document.querySelectorAll("canvas").length,
        // The text-align of the <p> holding a specific right-column cell value.
        scoreAlign: (() => { const p = Array.from(document.querySelectorAll("p")).find((e) => e.textContent === "88"); return p ? getComputedStyle(p).textAlign : null; })(),
      };
    });
    return { errs, probe };
  } finally { await browser.close(); }
}

if (!CHROME) {
  console.log("  (skipping rich-text render tests — no Chrome found)");
} else {
  const dom = await render("dom");
  await test("DOM: no page errors, content rendered", () => {
    assert.equal(dom.errs.length, 0, dom.errs.slice(0, 2).join(" | "));
    assert.ok(dom.probe.nodes > 5, "host has little content");
  });
  await test("a list item is ONE contiguous <p>, not word-per-view", () => {
    // The whole item text lives in a single flowing paragraph. In the old layout
    // no single element held it — each word was its own positioned Text.
    assert.ok(dom.probe.paras.some((t) => t === "alpha beta gamma"), "list item text not contiguous: " + JSON.stringify(dom.probe.paras));
    assert.ok(dom.probe.paras.some((t) => t === "delta epsilon zeta"));
  });
  await test("a table cell is a contiguous <p>", () => {
    assert.ok(dom.probe.paras.some((t) => t === "Linus"), "cell text not a single <p>");
    assert.ok(dom.probe.paras.some((t) => t === "88"));
  });
  await test("a right-aligned column carries text-align:right", () => {
    // The Score column is `--:` (right). Its "88" cell flows as a right-aligned <p>.
    assert.equal(dom.probe.scoreAlign, "right", "right column cell not right-aligned");
  });
  await test("a blockquote line is a contiguous <p>", () => {
    assert.ok(dom.probe.paras.some((t) => t === "quoted words flow together here"));
  });

  // A <pre> with colored spans is one preformatted, monospace element with
  // whitespace preserved and per-token colour — the syntax-highlight primitive.
  const preDoc = `App [ width = 480, selectable = true,
    HTMLText [ x = 10, y = 10, width = 460,
      accents = { { kw: 0xC678DD, ty: 0xE5C07B } },
      html = "<pre><span class='kw'>class</span> <span class='ty'>Board</span> [\\n    n = 42,\\n]</pre>" ] ]`;
  const pre = await (async () => {
    const b = await buildProduction(preDoc, {});
    assert.ok(b.ok, "pre build failed: " + (b.errors || []).map((e) => e.message).join("; "));
    const appJs = b.files.find((f) => f.name.startsWith("app.")).contents;
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(e.message));
      await page.setContent(`<!doctype html><div id=host></div><script type=module>${appJs}</script>`, { waitUntil: "networkidle0" });
      await new Promise((r) => setTimeout(r, 350));
      return { errs, probe: await page.evaluate(() => {
        const el = document.querySelector("pre");
        if (!el) return { pre: false };
        const spans = Array.from(el.querySelectorAll("span"));
        return { pre: true, ws: getComputedStyle(el).whiteSpace,
          mono: /mono|Menlo|SFMono|Courier/i.test(getComputedStyle(spans[0] || el).fontFamily),
          indent: /\n    /.test(el.textContent), colors: new Set(spans.map((s) => getComputedStyle(s).color)).size };
      }) };
    } finally { await browser.close(); }
  })();
  await test("a <pre> renders as one monospace element, whitespace preserved", () => {
    assert.equal(pre.errs.length, 0, pre.errs.slice(0, 2).join(" | "));
    assert.ok(pre.probe.pre, "no <pre> element");
    assert.ok(pre.probe.ws.startsWith("pre"), "not preformatted: " + pre.probe.ws);
    assert.ok(pre.probe.mono, "not monospace");
    assert.ok(pre.probe.indent, "indentation not preserved");
  });
  await test("a <pre> keeps its per-token accent colours", () => {
    assert.ok(pre.probe.colors >= 2, "expected ≥2 span colours, got " + pre.probe.colors);
  });

  const canvas = await render("canvas");
  await test("Canvas fallback renders the same doc without error", () => {
    assert.equal(canvas.errs.length, 0, canvas.errs.slice(0, 2).join(" | "));
    assert.ok(canvas.probe.canvases > 0, "no canvas mounted");
  });
}

console.log(`\nrichtext: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
