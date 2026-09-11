// md-conformance — the Declare Markdown reader vs a KNOWN-GOOD renderer.
//
// VS Code's Markdown preview is markdown-it (pure JS); we hold Declare's own
// reader (runtime/src/md.ts) against it over a broad corpus — every emphasis
// edge case CommonMark specifies (the `***x***`, adjacent-run, rule-of-three and
// `_`-intraword cases that a naive matcher gets wrong), plus headings, lists,
// code, links, blockquotes, tables, strike and breaks. Both parse trees are
// projected to ONE canonical string and compared, so a divergence is exact and
// legible. A companion --gallery run renders the same corpus in headless Chrome
// (markdown-it HTML beside Declare's own Markdown component) into PNGs for the
// eye; this file is the automated gate.
//
// Documented, intentional Declare deviations (NOT conformance failures) are
// declared in DEVIATIONS below and skipped with a reason.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import MarkdownIt from "markdown-it";
import { parse, parseInline } from "../runtime/dist/md.js";

const md = MarkdownIt("commonmark").enable(["strikethrough", "table"]);

// ── canonical projection ─────────────────────────────────────────────────────
// A compact, unambiguous s-expression of the structure both trees share. Inline:
// text is quoted; em/strong/strike/code/link/br are tagged. Block: heading level,
// paragraph, list (ordered + start), item, quote, code (lang), rule, table.

// Merge adjacent text nodes — Declare leaves an unpaired delimiter as its own
// text node (`foo`,`_`,`bar`), which renders contiguously; markdown-it emits one
// text. Text-node BOUNDARIES are not a rendered distinction, so both sides merge
// before comparison.
function mergeText(ns) {
  const out = [];
  for (const n of ns) {
    if (n.t === "text" && out.length && out[out.length - 1].t === "text") out[out.length - 1] = { t: "text", value: out[out.length - 1].value + n.value };
    else out.push(n);
  }
  return out;
}

function inlineDeclare(ns) {
  return mergeText(ns).map((n) => {
    switch (n.t) {
      case "text": return n.value === "" ? "" : q(n.value);
      case "code": return `code(${q(n.value)})`;
      case "em": return `em[${inlineDeclare(n.inline)}]`;
      case "strong": return `strong[${inlineDeclare(n.inline)}]`;
      case "strike": return `strike[${inlineDeclare(n.inline)}]`;
      case "link": return `link(${q(n.href)}${n.title ? "," + q(n.title) : ""})[${inlineDeclare(n.inline)}]`;
      case "image": return `img(${q(n.src)},${q(n.alt)}${n.title ? "," + q(n.title) : ""})`;
      case "br": return "br";
      case "styled": return `styled[${inlineDeclare(n.inline)}]`;
      default: return n.t;
    }
  }).join("");
}

function blockDeclare(bs) {
  return bs.map((b) => {
    switch (b.t) {
      case "heading": return `h${b.level}{${inlineDeclare(b.inline)}}`;
      case "paragraph": return `p{${inlineDeclare(b.inline)}}`;
      case "code": return `pre(${q(b.lang)}){${q(b.text)}}`;
      case "pre": return `pre{${inlineDeclare(b.inline)}}`;
      case "blockquote": return `quote{${blockDeclare(b.blocks)}}`;
      case "list": return `${b.ordered ? `ol(${b.start})` : "ul"}{${b.items.map((it) => `li{${blockDeclare(it.blocks)}}`).join("")}}`;
      case "table": return `table{${b.header.map((c) => `th{${inlineDeclare(c)}}`).join("")}|${b.rows.map((r) => r.map((c) => `td{${inlineDeclare(c)}}`).join("")).join("//")}}`;
      case "rule": return "hr";
      default: return b.t;
    }
  }).join("");
}

const q = (s) => JSON.stringify(s);

// markdown-it token stream → Declare-shaped Inline[] / Block[], so both sides
// go through the SAME serializers (and the same text-merge normalization).

function refInline(children) {
  const rootArr = [];
  const stack = [rootArr];
  const top = () => stack[stack.length - 1];
  for (const t of children ?? []) {
    switch (t.type) {
      case "text": if (t.content !== "") top().push({ t: "text", value: t.content }); break;
      case "code_inline": top().push({ t: "code", value: t.content }); break;
      case "softbreak": top().push({ t: "text", value: " " }); break; // Declare renders a soft break as a space
      case "hardbreak": top().push({ t: "br" }); break;
      case "em_open": { const n = { t: "em", inline: [] }; top().push(n); stack.push(n.inline); break; }
      case "strong_open": { const n = { t: "strong", inline: [] }; top().push(n); stack.push(n.inline); break; }
      case "s_open": { const n = { t: "strike", inline: [] }; top().push(n); stack.push(n.inline); break; }
      case "link_open": { const title = (t.attrs?.find((a) => a[0] === "title") ?? [])[1]; const n = { t: "link", href: (t.attrs?.find((a) => a[0] === "href") ?? [])[1] ?? "", ...(title ? { title } : {}), inline: [] }; top().push(n); stack.push(n.inline); break; }
      case "image": { const title = (t.attrs?.find((a) => a[0] === "title") ?? [])[1]; top().push({ t: "image", src: (t.attrs?.find((a) => a[0] === "src") ?? [])[1] ?? "", alt: t.content, ...(title ? { title } : {}) }); break; }
      case "em_close": case "strong_close": case "s_close": case "link_close": stack.pop(); break;
      default: break; // html_inline — outside Declare's subset (see GAPS)
    }
  }
  return rootArr;
}

function refBlocks(src) {
  const toks = md.parse(src, {});
  let i = 0;
  const walk = (close) => {
    const blocks = [];
    while (i < toks.length && toks[i].type !== close) {
      const t = toks[i];
      switch (t.type) {
        case "heading_open": { const level = +t.tag.slice(1); i++; const inline = refInline(toks[i].children); i += 2; blocks.push({ t: "heading", level, inline }); break; }
        case "paragraph_open": { i++; const inline = refInline(toks[i].children); i += 2; blocks.push({ t: "paragraph", inline }); break; }
        case "fence": case "code_block": blocks.push({ t: "code", lang: (t.info || "").trim(), text: t.content.replace(/\n$/, "") }); i++; break;
        case "hr": blocks.push({ t: "rule" }); i++; break;
        case "blockquote_open": { i++; const inner = walk("blockquote_close"); i++; blocks.push({ t: "blockquote", blocks: inner }); break; }
        case "bullet_list_open": case "ordered_list_open": {
          const ordered = t.type === "ordered_list_open";
          const start = ordered ? +(t.attrs?.find((a) => a[0] === "start")?.[1] ?? 1) : 1;
          const closeT = ordered ? "ordered_list_close" : "bullet_list_close";
          i++; const items = [];
          while (i < toks.length && toks[i].type !== closeT) {
            i++; // list_item_open
            items.push({ task: null, blocks: walk("list_item_close") });
            i++; // list_item_close
          }
          i++; // list close
          blocks.push({ t: "list", ordered, start, items });
          break;
        }
        case "table_open": { i++; blocks.push(walkTable()); break; }
        default: i++; break; // html_block etc. — outside the subset (see GAPS)
      }
    }
    return blocks;
  };
  const walkTable = () => {
    const header = [], rows = [];
    while (i < toks.length && toks[i].type !== "table_close") {
      const t = toks[i];
      if (t.type === "th_open") { i++; header.push(refInline(toks[i].children)); i += 2; }
      else if (t.type === "td_open") { i++; (rows[rows.length - 1]).push(refInline(toks[i].children)); i += 2; }
      else { if (t.type === "tr_open" && toks[i - 1]?.type !== "thead_open" && header.length) rows.push([]); i++; }
    }
    i++; // table_close
    return { t: "table", align: header.map(() => null), header, rows: rows.filter((r) => r.length) };
  };
  return walk(null);
}

// ── the corpus ───────────────────────────────────────────────────────────────
// name → markdown source. Emphasis first (where a naive matcher fails), then the
// rest of Declare's supported surface.

const INLINE = {
  "plain": "just some text",
  "em star": "an *italic* word",
  "em underscore": "an _italic_ word",
  "strong star": "a **bold** word",
  "strong underscore": "a __bold__ word",
  "bold-italic ***": "a ***bolditalic*** word",
  "the declare.md item": "***this file*** *— the **language**: every rule the compiler enforces;*",
  "em wrapping strong": "*a **b** c*",
  "strong wrapping em": "**a *b* c**",
  "adjacent runs": "*a* *b* *c*",
  "intraword star": "a*b*c",
  "intraword underscore stays literal": "foo_bar_baz",
  "star intraword bold": "a**b**c",
  "nested same": "*a *b* c*",
  "trailing strong then em": "*a **b***",
  "leading strong then em": "***a** b*",
  "rule of three": "*foo**bar**baz*",
  "code span": "text `a + b` more",
  "code with stars": "`**not bold**`",
  "strike": "a ~~struck~~ word",
  "link": "see [the docs](https://example.com/x) now",
  "link with emphasis": "see [**bold** link](http://x)",
  "autolink": "visit <https://example.com>",
  "link with title": '[text](http://x "the title")',
  "link url with paren": "[wiki](https://en.wikipedia.org/wiki/Foo_(bar))",
  "image": "![alt text](pic.png)",
  "image with title": '![logo](/logo.png "Our logo")',
  "image inside link": "[![alt](i.png)](http://x)",
  "escaped star": "not \\*italic\\* here",
  "entity": "A &amp; B &mdash; C",
  "mixed": "**A** and *B* and `C` and ~~D~~ and [E](http://e)",
};

const BLOCK = {
  "h1": "# Title here",
  "h3 with emphasis": "### A **bold** heading",
  "paragraph": "one line\nsoft-wrapped to the next",
  "hr": "text\n\n---\n\nmore",
  "fence": "```js\nconst x = 1;\n```",
  "fence with lang": "```python\nprint('hi')\n```",
  "ordered list": "1. first\n2. second\n3. third",
  "bullet list": "- a\n- b\n- c",
  "ordered start": "3. three\n4. four",
  "the declare.md intro list": "1. ***this file*** *— the language*\n2. ***the map*** *— the rest*\n3. ***the compiler*** *— every error*",
  "heading then para": "# H\n\nbody **text** here",
  "two paragraphs": "first para\n\nsecond para",
  "setext h1": "Title here\n=========\n\nbody",
  "setext h2": "Subtitle here\n---\n\nbody",
  "reference link full": "see [the text][id] now\n\n[id]: https://example.com/x \"A Title\"",
  "reference link collapsed": "see [id][] now\n\n[id]: https://example.com/y",
  "reference link shortcut": "see [id] now\n\n[id]: https://example.com/z",
  "reference image": "![the logo][l]\n\n[l]: /logo.png \"Logo\"",
  "loose list": "- a\n\n- b\n\n- c",
  "tight then loose": "- x\n- y\n\nafter",
};

// ── inline conformance ───────────────────────────────────────────────────────

for (const [name, src] of Object.entries(INLINE)) {
  await test(`inline: ${name}`, () => {
    const ours = inlineDeclare(parseInline(src));
    const ref = inlineDeclare(refInline(md.parseInline(src, {})[0].children));
    assert.equal(ours, ref, `\n  source: ${JSON.stringify(src)}\n  declare: ${ours}\n  ref:     ${ref}`);
  });
}

// ── block conformance ────────────────────────────────────────────────────────

for (const [name, src] of Object.entries(BLOCK)) {
  await test(`block: ${name}`, () => {
    const ours = blockDeclare(parse(src));
    const ref = blockDeclare(refBlocks(src));
    assert.equal(ours, ref, `\n  source: ${JSON.stringify(src)}\n  declare: ${ours}\n  ref:     ${ref}`);
  });
}

summarize("md-conformance");
