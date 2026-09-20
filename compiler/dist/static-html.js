// seo — the static extraction surface (docs/system-design/capabilities.md §5): a program's
// text content as semantic HTML, for search crawlers and AI chatbots that read
// the page before (or without) running it. NOT accessibility, NOT a language
// feature: no new syntax, nothing DOM-shaped in Declare source.
//
// Two phases with an ink-line between them: compile() is static; then the
// program EXECUTES to its t=0 snapshot (headless.ts) and the settled tree is
// serialized here. Serialization is CLASS SEMANTICS, never heuristics — a
// Markdown's block tree says what its text means, a Text is a paragraph, an
// Image is an image, a TextInput is draft UI state (emitted as nothing), an
// invisible subtree is skipped. No font-size-looks-like-a-heading inference,
// ever. The `navigate` link model (capabilities.md §6, links.ts) joins here:
// the compile-time link relation, riding compile() like deps, stamps each
// navigable instance `_navLink`, and the walk wraps its subtree in <a href>.
//
// Browser-safe (runtime graph + compile.ts only) and exported by BOTH
// compile-node and compile-browser — the browser compiler does everything the
// Node one can, as architecture and as principle.
import { Image, Text, TextInput, View } from "../../runtime/dist/index.js";
import { Markdown, HTMLText } from "../../runtime/dist/markdown.js";
import { parse as parseMd } from "../../runtime/dist/md.js";
import { parseHtml } from "../../runtime/dist/html.js";
import { compileExpr } from "../../runtime/dist/expr.js";
import { cssWeight } from "../../runtime/dist/measure.js";
import { compile } from "./compile.js";
import { settleHeadless } from "./headless.js";
// ── HTML text, escaped once, here ───────────────────────────────────────────
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
// ── the block tree as HTML — one serializer for Markdown AND HTMLText, since
// both parse to the same Block model (md.ts / html.ts) ──────────────────────
function inlineHtml(runs) {
    let out = "";
    for (const r of runs) {
        switch (r.t) {
            case "text":
                out += esc(r.value);
                break;
            case "strong":
                out += `<strong>${inlineHtml(r.inline)}</strong>`;
                break;
            case "em":
                out += `<em>${inlineHtml(r.inline)}</em>`;
                break;
            case "strike":
                out += `<s>${inlineHtml(r.inline)}</s>`;
                break;
            case "code":
                out += `<code>${esc(r.value)}</code>`;
                break;
            case "link":
                out += `<a href="${escAttr(r.href)}">${inlineHtml(r.inline)}</a>`;
                break;
            case "br":
                out += "<br>";
                break;
            case "styled":
                out += `<span>${inlineHtml(r.inline)}</span>`;
                break; // named style — content only
        }
    }
    return out;
}
function itemHtml(item) {
    const task = item.task === null ? "" : `<input type="checkbox"${item.task ? " checked" : ""} disabled> `;
    // A single-paragraph item renders tight (inline directly in the <li>) —
    // the reading every Markdown renderer gives a simple list.
    const body = item.blocks.length === 1 && item.blocks[0].t === "paragraph"
        ? inlineHtml(item.blocks[0].inline)
        : blocksHtml(item.blocks);
    return `<li>${task}${body}</li>`;
}
/** The shared Block tree (md.ts) as semantic HTML. Exported for tests and for
 *  any tool that already holds parsed blocks. */
export function blocksHtml(blocks) {
    const out = [];
    for (const b of blocks) {
        switch (b.t) {
            case "heading":
                out.push(`<h${Math.min(b.level, 6)}>${inlineHtml(b.inline)}</h${Math.min(b.level, 6)}>`);
                break;
            case "paragraph":
                out.push(`<p>${inlineHtml(b.inline)}</p>`);
                break;
            case "code":
                out.push(`<pre><code${b.lang !== "" ? ` class="language-${escAttr(b.lang)}"` : ""}>${esc(b.text)}</code></pre>`);
                break;
            case "pre":
                out.push(`<pre>${inlineHtml(b.inline)}</pre>`);
                break;
            case "blockquote":
                out.push(`<blockquote>${blocksHtml(b.blocks)}</blockquote>`);
                break;
            case "list":
                out.push(b.ordered
                    ? `<ol${b.start !== 1 ? ` start="${b.start}"` : ""}>${b.items.map(itemHtml).join("")}</ol>`
                    : `<ul>${b.items.map(itemHtml).join("")}</ul>`);
                break;
            case "table": {
                const th = b.header.map((c, i) => `<th${b.align[i] ? ` align="${b.align[i]}"` : ""}>${inlineHtml(c)}</th>`).join("");
                const rows = b.rows
                    .map((r) => `<tr>${r.map((c, i) => `<td${b.align[i] ? ` align="${b.align[i]}"` : ""}>${inlineHtml(c)}</td>`).join("")}</tr>`)
                    .join("");
                out.push(`<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`);
                break;
            }
            case "rule":
                out.push("<hr>");
                break;
        }
    }
    return out.join("\n");
}
// ── the settled tree, walked — class semantics only ─────────────────────────
/** Serialize a settled tree's content as HTML. The walk is document order
 *  (child order is paint order); `visible = false` subtrees are skipped; the
 *  content classes emit what their text MEANS; every other view is transparent
 *  structure (its children walk, it emits no wrapper). */
export function staticHtml(root, tenants) {
    const out = [];
    walk(root, out, classifyHeadings(root), tenants);
    return out.join("\n");
}
/** Heading inference from the SETTLED typography (2026-07-14 ruling, revising §5).
 *  A `Text` has no declared heading level — the source styles it large and bold,
 *  it doesn't say `# `. So to give a crawler real document structure in the
 *  static HTML, infer the level from the rendered type: a `Text` set
 *  LARGER than the body copy AND at a heading weight (semibold+) is a heading,
 *  its LEVEL by the rank of its size among the page's heading sizes (largest =
 *  h1). This is a proxy, not a contract — deliberately not controllable from
 *  Declare source — so it stays inside the extractor, off the language surface.
 *
 *  The BODY size is the size carrying the most text (length-weighted mode): body
 *  copy dominates, so it anchors the comparison robustly — and a Markdown's or
 *  HTMLText's words count toward it, because on a page whose prose is a rich-text
 *  flow they ARE the body copy. Two typographic signals decide a candidate,
 *  no more — bigger and bolder; a large-but-light LEAD paragraph stays a `<p>`.
 *
 *  Still a proxy, and still imperfect: a display SENTENCE set large and bold
 *  reads as a heading, because nothing in the settled tree separates it from a
 *  section title. What the proxy no longer does is call a bare figure or a glyph
 *  a heading (isHeadingNode), or hand out a second h1 to a headline split across
 *  two views. Those were not imperfect readings of prose — they put non-prose
 *  into the outline, and because the size census shares this predicate, each one
 *  also pushed every real heading below it down a level.
 *
 *  Markdown/HTMLText carry their OWN `#` headings, untouched. Byte-identical on
 *  every host: size and weight are SET attributes, never measured geometry. */
function classifyHeadings(root) {
    const charsBySize = new Map();
    const headingSizeSet = new Set();
    const scan = (v) => {
        if (v.visible === false)
            return;
        // PROSE COUNTS TOWARD THE BODY SIZE (R1). A rich-text flow carries its own
        // `#` headings and is not a heading candidate — but its words are still the
        // document's body copy, and the census is what decides which size "body"
        // means. Skipping it entirely made a page whose prose is a Markdown or an
        // HTMLText report a body size drawn from nav and footer chrome, so a 15px
        // wordmark became the largest thing in the document and took the h1. Count
        // the flow's text at the flow's own size, then stop: its children are not
        // Text views to rank.
        if (v instanceof Markdown || v instanceof HTMLText) {
            const words = v instanceof Markdown ? v.text : plainTextOfHtml(v.html);
            if (words !== "")
                charsBySize.set(v.fontSize, (charsBySize.get(v.fontSize) ?? 0) + words.length);
            return;
        }
        if (v instanceof TextInput || v instanceof Image)
            return;
        if (v instanceof Text) {
            if (v.text !== "") {
                charsBySize.set(v.fontSize, (charsBySize.get(v.fontSize) ?? 0) + v.text.length);
                if (isHeadingNode(v))
                    headingSizeSet.add(v.fontSize);
            }
            return;
        }
        for (const c of v.children)
            if (c instanceof View)
                scan(c);
    };
    scan(root);
    // Body copy dominates the character count — its size anchors the comparison.
    let bodySize = 0, mostChars = -1;
    for (const [size, chars] of charsBySize)
        if (chars > mostChars) {
            mostChars = chars;
            bodySize = size;
        }
    const headingSizes = [...headingSizeSet].filter((s) => s > bodySize).sort((a, b) => b - a);
    const levelOf = new Map();
    headingSizes.forEach((size, i) => levelOf.set(size, Math.min(6, i + 1)));
    // ONE h1 PER DOCUMENT (R4). Levels are keyed by SIZE, so a headline split
    // across two views to carry two treatments — the common case, a line with a
    // gradient over a line without — resolved to two h1s. The walk is strict
    // document order and asks exactly once per Text, so demoting every level-1
    // after the first is deterministic and host-independent. A demotion, never a
    // suppression: the text stays a heading and no level is skipped.
    let usedH1 = false;
    return (t) => {
        if (!isHeadingNode(t))
            return null;
        const level = levelOf.get(t.fontSize) ?? null;
        if (level !== 1)
            return level;
        if (usedH1)
            return 2;
        usedH1 = true;
        return 1;
    };
}
/** A heading carries a heading WEIGHT (semibold+) and SAYS SOMETHING: at least
 *  one letter (R2), and not a bare figure with an optional unit (R3).
 *
 *  The weight-and-size proxy stands — the level still comes from the rendered
 *  type, and nothing here is controllable from Declare source. What these two
 *  gates remove is the class of node that was never prose at all: a sequence
 *  badge's "1", a stat's "494" or "112 KB", a decorative "→". They belong in
 *  `isHeadingNode` rather than at the emit site because the census reads the
 *  same predicate — a suppressed node that still joined the size ranking would
 *  push every real heading below it down a level, which is how a section title
 *  ended up an h5. A display figure IS still typographically a heading; it is
 *  excluded because a document outline made of numbers tells a reader nothing.
 *
 *  Known and accepted: a heading that is genuinely just a year ("2026") or a
 *  section mark ("§5") reads as a paragraph. So does a display sentence set
 *  large and bold, which remains indistinguishable from a section title in the
 *  settled tree — the proxy is still a proxy. */
const isHeadingNode = (t) => weightNum(t) >= 600 && HAS_LETTER.test(t.text) && !BARE_FIGURE.test(t.text.trim());
/** The words an HTMLText shows, for the body-size census ONLY — tags dropped,
 *  entities left as written. It feeds a length, never the output, so an exact
 *  decode would change no decision; what matters is that it is deterministic on
 *  every host, which a regex over a SET attribute is. */
function plainTextOfHtml(html) {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
/** Any letter in any script — CJK, Cyrillic and Greek count, so this is not a
 *  Latin-only gate. */
const HAS_LETTER = /\p{L}/u;
/** A number, optionally with a short unit: "494", "0", "112 KB", "99%", "3.2x",
 *  "1,000,000". Anchored at both ends and the unit capped at three letters, so
 *  a heading carrying real words never matches. */
const BARE_FIGURE = /^[\p{Nd}][\p{Nd}.,\s]*(?:[%×x]|\p{L}{1,3})?$/u;
const weightNum = (t) => parseInt(cssWeight(t.fontWeight), 10) || 400;
/** The navigable target of an instance, or null. The compiler's link relation
 *  (§6) stamped `_navLink`: a literal href, or a read-path evaluated against the
 *  settled instance at t=0. An empty value → null (the value carries the
 *  conditionality — `navigate(this.link)` with `link = ""` links nothing). */
function navHref(v) {
    // The LIVE `link` attribute wins (location.md §0.3): an authored link — a
    // literal, or a constraint's SETTLED value (the data tier: `link = { :to }`
    // over nav records) — is the ground truth; `_navLink` (the literal stamp +
    // the old handler inference) covers the un-migrated corpus.
    const live = v.link;
    if (typeof live === "string" && live !== "")
        return live;
    const link = v._navLink;
    if (link === undefined)
        return null;
    if ("href" in link)
        return link.href || null;
    const c = compileExpr(link.read);
    if (!("fn" in c))
        return null;
    let val;
    try {
        val = c.fn.call(v, v.parent, v);
    }
    catch {
        return null; // a null-value projection at t=0 — no anchor, as if empty
    }
    return typeof val === "string" && val !== "" ? val : null;
}
function walk(v, out, headingOf, tenants) {
    if (v.visible === false)
        return;
    // an island whose tenant program the crawl extracted (crawl.ts tenantsOf):
    // the tenant's content stands where the island stands
    const tenant = tenants?.get(v);
    if (tenant !== undefined) {
        if (tenant !== "")
            out.push(tenant);
        return;
    }
    const href = navHref(v);
    if (href === null) {
        emit(v, out, headingOf, tenants);
        return;
    }
    // A navigable subtree: wrap its content in a real <a href>. Skip an empty
    // one — an anchor with no text is noise in the static extraction.
    const inner = [];
    emit(v, inner, headingOf, tenants);
    if (inner.length === 0)
        return;
    out.push(`<a href="${escAttr(href)}">${inner.join("\n")}</a>`);
}
/** The class-semantics emission for one node (its content, or its children
 *  walked) — separated from `walk` so the anchor wrapping composes over it. */
function emit(v, out, headingOf, tenants) {
    if (v instanceof Markdown) {
        if (v.text !== "")
            out.push(blocksHtml(parseMd(v.text)));
        return;
    }
    if (v instanceof HTMLText) {
        if (v.html !== "")
            out.push(blocksHtml(parseHtml(v.html, v.unsupported)));
        return;
    }
    if (v instanceof TextInput)
        return; // draft UI state, not content
    if (v instanceof Text) {
        if (v.text !== "") {
            const lvl = headingOf(v); // inferred from the settled type (large + bold)
            out.push(lvl !== null ? `<h${lvl}>${esc(v.text)}</h${lvl}>` : `<p>${esc(v.text)}</p>`);
        }
        return;
    }
    if (v instanceof Image) {
        if (v.source !== "")
            out.push(`<img src="${escAttr(v.source)}">`);
        return;
    }
    for (const c of v.children)
        if (c instanceof View)
            walk(c, out, headingOf, tenants);
}
/** Extract from a compile() result: execute the compiled source to its t=0
 *  snapshot and serialize. Needs only { source, deps } — the projection that
 *  survives the worker boundary — so it composes with EVERY compile path
 *  (in-process, worker, cached). Returns null when the compile failed. */
export function extractFromCompiled(compiled, env) {
    if (compiled.source === null)
        return null;
    const app = settleHeadless(compiled.source, { deps: compiled.deps, links: compiled.links, env });
    try {
        return staticHtml(app);
    }
    finally {
        app.discard();
    }
}
/** The one-call form: compile a source through THE compiler API (typecheck
 *  and all), then extract. The dual-form rule holds — structured diagnostics
 *  plus the rendered report ride the result. */
export async function extractStatic(source, opts = {}) {
    const compiled = await compile(source, opts);
    return { html: extractFromCompiled(compiled, opts.env), diagnostics: compiled.diagnostics, report: compiled.report };
}
/** The fragment as a complete crawler-facing document (`?extract`, and the
 *  committed-page artifact). One shape on every host. */
export function crawlerDocument(html, title) {
    // A well-formed document for a crawler — `<html lang>`/`<head>`/`<body>` and an
    // `<article>` around the content, so the content region is unambiguous and the
    // page validates. The content itself is the class-semantics HTML, headings
    // included: from Markdown `#`, or inferred from the settled typography for a
    // `Text` styled as a heading (capabilities.md §5). This is a static artifact —
    // crawlers want exactly this (static structure + static links, no JS to run).
    return `<!doctype html>
<!-- generated by Declare static extraction (docs/system-design/capabilities.md §5) — the program's content at its t=0 snapshot -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
</head>
<body>
<article>
${html}
</article>
</body>
</html>
`;
}
//# sourceMappingURL=static-html.js.map