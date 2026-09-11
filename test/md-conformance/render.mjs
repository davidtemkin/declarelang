// render — the RENDERED half of Markdown conformance. Renders the corpus two
// ways in headless Chrome — Declare's own `Markdown` component (its DOM backend)
// and markdown-it (what VS Code's preview uses) — screenshots both, and extracts
// an ordered word→style map from each rendered DOM. The maps are compared at the
// word level (bold / italic / mono / strike / link), which is robust to the two
// engines' different word wrapping. The PNGs land in ./out for the eye.

import { writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import MarkdownIt from "markdown-it";
import { buildProduction } from "../../tools/declarec.mjs";
import { DOC } from "./corpus.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
export const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  process.env.CHROME].find((p) => p && existsSync(p));

const md = MarkdownIt("commonmark").enable(["strikethrough", "table"]);

// The reference page: markdown-it HTML under CSS chosen to resemble Declare's
// prose defaults (sans body, mono code with a tint, blue links) — for the eye;
// the assertion compares extracted styles, not pixels.
const REF_CSS = `
  body { margin: 0; }
  .md { width: 620px; padding: 20px; font: 16px/1.6 -apple-system, system-ui, sans-serif; color: #1b2733; background: #fff; }
  .md h1 { font-size: 30px; } .md h2 { font-size: 24px; } .md h3 { font-size: 20px; }
  .md h1,.md h2,.md h3,.md h4,.md h5,.md h6 { font-weight: 700; line-height: 1.25; margin: 1em 0 .4em; }
  .md code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: .9em; background: #eef1f5; padding: 1px 4px; border-radius: 3px; }
  .md pre { background: #f4f6fa; padding: 10px 12px; border-radius: 6px; overflow: auto; }
  .md pre code { background: none; padding: 0; }
  .md a { color: #2e6fe0; text-decoration: none; }
  .md del, .md s { text-decoration: line-through; }
  .md blockquote { border-left: 3px solid #dbe1e9; margin: .6em 0; padding: 0 12px; color: #4a5a68; }
  .md table { border-collapse: collapse; } .md th,.md td { border: 1px solid #dbe1e9; padding: 4px 10px; }
  .md th { font-weight: 700; }
  .md hr { border: none; border-top: 1px solid #dbe1e9; margin: 1.2em 0; }`;

// Extraction, run INSIDE the page. Walks every TEXT NODE in document order (so
// plain text sitting beside a <strong>/<em> in a heading or paragraph is not
// missed), styling each word by its parent element's computed CSS + ancestry.
const EXTRACT = (containerSel) => {
  const root = document.querySelector(containerSel);
  const words = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = node.textContent || "";
    if (raw.trim() === "") continue;
    const el = node.parentElement;
    const cs = getComputedStyle(el);
    const fam = cs.fontFamily.toLowerCase();
    const style = {
      b: parseInt(cs.fontWeight, 10) >= 600,
      i: cs.fontStyle === "italic",
      m: /mono|consolas|menlo|courier/.test(fam),
      s: cs.textDecorationLine.includes("line-through"),
      link: el.closest("a") !== null,
    };
    for (const w of raw.trim().split(/\s+/)) if (w !== "") words.push({ w, ...style });
  }
  return words;
};

async function shot(page, file) {
  // Size the viewport to the rendered content, then full-page shot (Declare's
  // content is absolutely positioned, so its host wrapper has no box of its own).
  const h = await page.evaluate(() => {
    let max = 0;
    for (const e of document.querySelectorAll("body *")) { const r = e.getBoundingClientRect(); max = Math.max(max, r.bottom); }
    return Math.ceil(max) + 24;
  });
  await page.setViewport({ width: 700, height: Math.max(200, h), deviceScaleFactor: 2 });
  const png = await page.screenshot({ fullPage: true });
  writeFileSync(join(OUT, file), png);
  return png.length;
}

/** Render both, screenshot both, return the two word→style arrays. */
export async function renderBoth() {
  const b = await buildProduction(`App [ width=660, theme = SanFrancisco, fill = #ffffff,
    Markdown [ x=20, y=20, width=620, text = ${JSON.stringify(DOC)} ] ]`, { render: "dom" });
  if (!b.ok) throw new Error("declare build failed: " + (b.errors || []).map((e) => e.message).join("; "));
  const appJs = b.files.find((f) => f.name.startsWith("app.")).contents;

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"], defaultViewport: { width: 700, height: 1400, deviceScaleFactor: 2 } });
  try {
    // Declare
    const dp = await browser.newPage();
    const derrs = []; dp.on("pageerror", (e) => derrs.push(e.message));
    await dp.setContent(`<!doctype html><meta charset=utf-8><body style="margin:0"><div id=host></div><script type=module>${appJs}</script>`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));
    const declareWords = await dp.evaluate(EXTRACT, "#host");
    const declareImgs = await dp.evaluate(() => document.querySelectorAll("#host img").length);
    await shot(dp, "declare.png");

    // Reference
    const rp = await browser.newPage();
    await rp.setContent(`<!doctype html><meta charset=utf-8><style>${REF_CSS}</style><div class=md>${md.render(DOC)}</div>`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 200));
    const refWords = await rp.evaluate(EXTRACT, ".md");
    const refImgs = await rp.evaluate(() => document.querySelectorAll(".md img").length);
    await shot(rp, "reference.png");

    // Canvas backend: the SAME document, drawn by the manual flow. Inline images
    // are real bitmaps here too (a persistent Image view per occurrence), so we
    // confirm the corpus's two coloured images (a blue square, a red dot) both
    // paint — the parity that would regress if the manual flow dropped to alt text.
    const cb = await buildProduction(`App [ width=660, theme = SanFrancisco, fill = #ffffff,
      Markdown [ x=20, y=20, width=620, text = ${JSON.stringify(DOC)} ] ]`, { render: "canvas" });
    const canvasJs = cb.files.find((f) => f.name.startsWith("app.")).contents;
    const cp = await browser.newPage();
    const cerrs = []; cp.on("pageerror", (e) => cerrs.push(e.message));
    await cp.setViewport({ width: 700, height: 1400, deviceScaleFactor: 1 });
    await cp.setContent(`<!doctype html><meta charset=utf-8><body style="margin:0"><div id=host></div><script type=module>${canvasJs}</script>`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));
    const canvasImgColors = await cp.evaluate(() => {
      const cv = document.querySelector("canvas");
      if (!cv) return { blue: 0, red: 0 };
      const W = cv.width, H = cv.height, d = cv.getContext("2d").getImageData(0, 0, W, H).data;
      let blue = 0, red = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (b > 180 && r < 120 && g > 70 && g < 160) blue++;
        else if (r > 180 && g < 110 && b < 110) red++;
      }
      return { blue, red };
    });
    await cp.close();

    return { declareWords, refWords, derrs, declareImgs, refImgs, canvasImgColors, cerrs };
  } finally { await browser.close(); }
}

// A word carries a non-default inline style — the emphasis-critical set. Plain
// words include structural markers (list numbers, table text) that the two
// engines emit differently; the STRUCTURAL gate (md-conformance.test.mjs) covers
// structure, so the rendered check compares the STYLED-word sequence, which is
// where a render bug (bold not drawn bold, a literal `*`, a link not colored)
// shows up and where the two engines' words align by construction.
const styled = (w) => w.b || w.i || w.m || w.s || w.link;
const sig = (w) => `${w.b ? "b" : ""}${w.i ? "i" : ""}${w.m ? "m" : ""}${w.s ? "s" : ""}${w.link ? "L" : ""}`;

/** Compare the two renderers' styled-word sequences; return the mismatches. */
export function diffWords(declareWords, refWords) {
  const a = declareWords.filter(styled), r = refWords.filter(styled);
  const mism = [];
  const n = Math.max(a.length, r.length);
  for (let i = 0; i < n && mism.length < 12; i++) {
    if (a[i] === undefined || r[i] === undefined) { mism.push({ i, kind: "length", declare: a[i]?.w, ref: r[i]?.w }); break; }
    if (a[i].w !== r[i].w) { mism.push({ i, kind: "word", declare: a[i].w, ref: r[i].w }); continue; }
    if (sig(a[i]) !== sig(r[i])) mism.push({ i, word: a[i].w, declareStyle: sig(a[i]), refStyle: sig(r[i]) });
  }
  return mism;
}

// Standalone: generate artifacts + print a short report.
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!CHROME) { console.log("no Chrome found"); process.exit(2); }
  const { declareWords, refWords, derrs, declareImgs, refImgs, canvasImgColors, cerrs } = await renderBoth();
  const mism = diffWords(declareWords, refWords);
  const canvasImgsOk = canvasImgColors.blue > 20 && canvasImgColors.red > 20;
  console.log(`declare words: ${declareWords.length}, ref words: ${refWords.length}, DOM page errors: ${derrs.length}`);
  console.log(`inline images (DOM): declare ${declareImgs}, ref ${refImgs} ${declareImgs === refImgs ? "✓" : "✗ MISMATCH"}`);
  console.log(`inline images (canvas): blue ${canvasImgColors.blue}px, red ${canvasImgColors.red}px ${canvasImgsOk ? "✓ both bitmaps drawn" : "✗ MISSING"}, canvas page errors: ${cerrs.length}`);
  console.log(`wrote out/declare.png and out/reference.png`);
  if (mism.length === 0 && declareImgs === refImgs && derrs.length === 0 && canvasImgsOk && cerrs.length === 0) console.log("WORD-STYLE MATCH ✓  ·  CANVAS IMAGE PARITY ✓");
  else { console.log(`${mism.length} style mismatch(es):`); for (const m of mism.slice(0, 12)) console.log("  ", JSON.stringify(m)); }
}
