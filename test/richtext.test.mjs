// Rich-text rendering — proves list items, table cells and blockquote lines each
// render as ONE contiguous flowing region (a native <p>), not the old word-per-view
// scatter, and that the Canvas fallback still renders. The parser has its own tests
// (md.test.mjs); this is about how the Markdown COMPONENT lays the blocks out.
import assert from "node:assert";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { buildProduction } from "../tools/declarec.mjs";
import { inlineAppPage } from "./harness.mjs";

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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.setContent(inlineAppPage(b), { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    const probe = await page.evaluate(() => {
      const texts = (sel) => Array.from(document.querySelectorAll(sel)).map((e) => e.textContent);
      // Every text block: a paragraph, a tight list item's text (`<li>` holds
      // it as a plain block beside its aria-hidden marker), a table cell.
      const ps = texts("p, li > div:not([aria-hidden]), td, th");
      return {
        errCount: 0,
        nodes: document.querySelectorAll("#host *").length,
        paras: ps,
        canvases: document.querySelectorAll("canvas").length,
        // The text-align of the cell holding a specific right-column value.
        scoreAlign: (() => { const p = Array.from(document.querySelectorAll("p, td")).find((e) => e.textContent === "88"); return p ? getComputedStyle(p).textAlign : null; })(),
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
  await test("a list item is ONE contiguous block, not word-per-view", () => {
    // The whole item text lives in a single flowing block — never a positioned
    // Text per word.
    assert.ok(dom.probe.paras.some((t) => t === "alpha beta gamma"), "list item text not contiguous: " + JSON.stringify(dom.probe.paras));
    assert.ok(dom.probe.paras.some((t) => t === "delta epsilon zeta"));
  });
  await test("a table cell is one contiguous cell", () => {
    assert.ok(dom.probe.paras.some((t) => t === "Linus"), "cell text not a single <p>");
    assert.ok(dom.probe.paras.some((t) => t === "88"));
  });
  await test("a right-aligned column carries text-align:right", () => {
    // The Score column is `--:` (right). Its "88" cell flows right-aligned.
    assert.equal(dom.probe.scoreAlign, "right", "right column cell not right-aligned");
  });
  await test("a blockquote line is a contiguous <p>", () => {
    assert.ok(dom.probe.paras.some((t) => t === "quoted words flow together here"));
  });

  // A <pre> with colored spans is one preformatted, monospace element with
  // whitespace preserved and per-token color — the syntax-highlight primitive.
  const preDoc = `App [ width = 480, selectable = true,
    HTMLText [ x = 10, y = 10, width = 460,
      textStyles = { { kw: { textColor: 0xC678DD }, ty: { textColor: 0xE5C07B } } },
      html = "<pre><span class='kw'>class</span> <span class='ty'>Board</span> [\\n    n = 42,\\n]</pre>" ] ]`;
  const pre = await (async () => {
    const b = await buildProduction(preDoc, {});
    assert.ok(b.ok, "pre build failed: " + (b.errors || []).map((e) => e.message).join("; "));
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(e.message));
      await page.setContent(inlineAppPage(b), { waitUntil: "networkidle0" });
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
  await test("a <pre> keeps its per-token accent colors", () => {
    assert.ok(pre.probe.colors >= 2, "expected ≥2 span colors, got " + pre.probe.colors);
  });

  // The four prevailing typography tokens' FIRST integration coverage
  // (compositing.md Part III — the coverage sweep found them absolute
  // zeros): a container provides headingColor/headingWeight/codeColor/
  // codeFamily, and the rendered prose beneath must wear all four.
  const tokensDoc = `App [ width = 480, selectable = true,
    box: View [ x = 0, y = 0, width = 480, height = 400,
      headingColor = #AA2233, headingWeight = black,
      codeColor = #2266AA, codeFamily = "Courier New",
      Markdown [ x = 20, y = 20, width = 440, text = """
# Styled Title

Body with \`inline code\` here.
""" ],
      ],
    ]`;
  const tok = await (async () => {
    const b = await buildProduction(tokensDoc, {});
    assert.ok(b.ok, "tokens build failed: " + (b.errors || []).map((e) => e.message).join("; "));
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(e.message));
      await page.setContent(inlineAppPage(b), { waitUntil: "networkidle0" });
      await new Promise((r) => setTimeout(r, 350));
      return { errs, probe: await page.evaluate(() => {
        const leaf = (needle) => Array.from(document.querySelectorAll("#host *"))
          .filter((e) => e.childElementCount === 0 && e.textContent.trim() === needle).pop();
        const h = leaf("Styled Title");
        const c = leaf("inline code");
        if (!h || !c) return { found: false };
        const hs = getComputedStyle(h), cs = getComputedStyle(c);
        return { found: true, hColor: hs.color, hWeight: hs.fontWeight,
          cColor: cs.color, cFamily: cs.fontFamily };
      }) };
    } finally { await browser.close(); }
  })();
  await test("the prevailing typography tokens render: headingColor + headingWeight", () => {
    assert.equal(tok.errs.length, 0, tok.errs.slice(0, 2).join(" | "));
    assert.ok(tok.probe.found, "heading/code leaves not found");
    assert.equal(tok.probe.hColor, "rgb(170, 34, 51)", "headingColor not worn: " + tok.probe.hColor);
    assert.equal(tok.probe.hWeight, "900", "headingWeight=black not worn: " + tok.probe.hWeight);
  });
  await test("the prevailing typography tokens render: codeColor + codeFamily", () => {
    assert.equal(tok.probe.cColor, "rgb(34, 102, 170)", "codeColor not worn: " + tok.probe.cColor);
    assert.ok(/Courier New/i.test(tok.probe.cFamily), "codeFamily not worn: " + tok.probe.cFamily);
  });

  // The palette comes from the theme and textColor: with nothing said the ink is
  // the theme's `text`, links its `accent`; a textColor (set or provided) is the
  // ink, and links keep the accent.
  const palDoc = `App [ width = 480,
    box: View [ x = 0, y = 0, width = 480, height = 400, theme = SanFranciscoDark,
      a: HTMLText [ x = 20, y = 20, width = 440, html = "<h2>Themed</h2><p>see <a href='#x'>alink</a></p>" ],
      b: View [ x = 0, y = 200, width = 480, height = 200, textColor = #AA2233,
        HTMLText [ x = 20, y = 0, width = 440, html = "<p>inked <a href='#y'>blink</a></p>" ],
        ],
      ],
    ]`;
  const pal = await (async () => {
    const b = await buildProduction(palDoc, {});
    assert.ok(b.ok, "palette build failed: " + (b.errors || []).map((e) => e.message).join("; "));
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(e.message));
      await page.setContent(inlineAppPage(b), { waitUntil: "networkidle0" });
      await new Promise((r) => setTimeout(r, 350));
      return { errs, probe: await page.evaluate(() => {
        const leaf = (needle) => Array.from(document.querySelectorAll("#host *"))
          .filter((e) => e.childElementCount === 0 && e.textContent.trim() === needle).pop();
        const color = (needle) => { const e = leaf(needle); return e ? getComputedStyle(e).color : null; };
        return { heading: color("Themed"), alink: color("alink"), inked: color("inked"), blink: color("blink") };
      }) };
    } finally { await browser.close(); }
  })();
  await test("rich text inks from the theme's text and links from its accent", () => {
    assert.equal(pal.errs.length, 0, pal.errs.slice(0, 2).join(" | "));
    assert.equal(pal.probe.heading, "rgb(231, 238, 242)", "heading not the theme's text: " + pal.probe.heading);
    assert.equal(pal.probe.alink, "rgb(76, 141, 255)", "link not the theme's accent: " + pal.probe.alink);
  });
  await test("a provided textColor is the rich text's ink; links keep the accent", () => {
    assert.equal(pal.probe.inked, "rgb(170, 34, 51)", "body not the provided textColor: " + pal.probe.inked);
    assert.equal(pal.probe.blink, "rgb(76, 141, 255)", "link lost the accent: " + pal.probe.blink);
  });

  const canvas = await render("canvas");
  await test("Canvas fallback renders the same doc without error", () => {
    assert.equal(canvas.errs.length, 0, canvas.errs.slice(0, 2).join(" | "));
    assert.ok(canvas.probe.canvases > 0, "no canvas mounted");
  });

  // VARIABLE INLINE SIZE + BASELINE (the multi-style arc): a `textStyles` entry
  // makes one span 40px over 16px body — the line box GROWS to fit it and the big
  // run sits ON the shared baseline (not top-aligned). Large-margin, non-fragile:
  // colour the big run blue and the body black (both words descenderless so their
  // ink-bottom IS the baseline), read the canvas pixels, and assert (a) the blue
  // run is much taller than the body — the size varied — and (b) the two ink
  // BOTTOMS coincide — one baseline. Under a top-aligning layout the big run's
  // bottom would sit ~24px BELOW the body's; baseline alignment brings them level.
  const varDoc = `App [ width = 520, selectable = true,
    box: View [ x = 0, y = 0, width = 520, height = 160,
      HTMLText [ x = 20, y = 20, width = 480,
        textStyles = { { lead: { fontSize: 40, textColor: 0x0000FF } } },
        html = "Base <span class='lead'>HEADLINE</span> tail" ],
      ], ]`;
  const vb = await (async () => {
    const b = await buildProduction(varDoc, { render: "canvas" });
    assert.ok(b.ok, "var build failed: " + (b.errors || []).map((e) => e.message).join("; "));
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      // The probe reads near-black body ink: the default theme's `text`. The
      // scheme is pinned so nothing the machine's appearance decides reaches it.
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
      const errs = []; page.on("pageerror", (e) => errs.push(e.message));
      await page.setContent(inlineAppPage(b), { waitUntil: "networkidle0" });
      await new Promise((r) => setTimeout(r, 450));
      return { errs, probe: await page.evaluate(() => {
        const cv = document.querySelector("canvas"); if (!cv) return { ok: false };
        const cx = cv.getContext("2d"); const { width: W, height: H } = cv;
        const d = cx.getImageData(0, 0, W, H).data;
        let blkT = -1, blkB = -1, bluT = -1, bluB = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
          if (a < 40) continue;
          if (b > 160 && r < 90 && g < 90) { if (bluT < 0) bluT = y; bluB = y; }
          else if (r < 90 && g < 90 && b < 90) { if (blkT < 0) blkT = y; blkB = y; }
        }
        return { ok: true, blkT, blkB, bluT, bluB };
      }) };
    } finally { await browser.close(); }
  })();
  await test("a textStyles fontSize grows the line and stays on the baseline (canvas)", () => {
    assert.equal(vb.errs.length, 0, vb.errs.slice(0, 2).join(" | "));
    assert.ok(vb.probe.ok, "no canvas");
    assert.ok(vb.probe.blkT >= 0 && vb.probe.bluT >= 0, "did not find body(black) + lead(blue) ink: " + JSON.stringify(vb.probe));
    const bodyH = vb.probe.blkB - vb.probe.blkT, leadH = vb.probe.bluB - vb.probe.bluT;
    assert.ok(leadH > bodyH + 8, `the 40px run is not taller than the body — size did not vary: bodyH=${bodyH} leadH=${leadH}`);
    assert.ok(Math.abs(vb.probe.bluB - vb.probe.blkB) <= 2,
      `body and lead are not on one baseline: blackBottom=${vb.probe.blkB} blueBottom=${vb.probe.bluB}`);
  });
}

console.log(`\nrichtext: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
