// html — a purpose-built reader for a SMALL, whitelisted subset of HTML, parsed
// at RUNTIME into the SAME Block[]/Inline[] tree the Markdown reader (md.ts)
// produces, so the one flow engine renders both. It exists because rich text is
// often authored or LOADED as HTML; parsing it here (not by handing a string to
// the DOM) keeps the render substrate-neutral AND makes the behaviour on
// unsupported/hostile content explicit and defined:
//
//   • `strip`  (default) — an unknown tag is UNWRAPPED (dropped, its text kept);
//                          <script>/<style> are dropped whole (content too);
//                          unknown attributes are ignored (only <a href> is read).
//   • `error`            — the first unsupported tag throws, naming it.
//
// This is a whitelist, not a general HTML engine — the SUPPORTED_TAGS set below
// is the single source of truth, and everything outside it is handled by policy.
// A near-leaf: it imports only md.ts's tree types + entity decoder.
import { decodeEntities } from "./md.js";
// ── the whitelist ──────────────────────────────────────────────────────────
// Inline tags carry a run style; block tags open a block. Aliases collapse to
// one meaning (b→strong, i→em, s/strike/del→strike). This IS the supported set.
const INLINE = new Set(["b", "strong", "i", "em", "code", "s", "strike", "del", "a", "span", "br"]);
const BLOCK = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "pre", "hr", "div"]);
const VOID = new Set(["br", "hr"]); // no close tag, no children
const RAWTEXT = new Set(["script", "style"]); // content is never text — dropped whole
/** Every tag the reader honours — the runtime tag check reports against this. */
export const SUPPORTED_TAGS = [...new Set([...BLOCK, ...INLINE])].sort();
const known = (tag) => INLINE.has(tag) || BLOCK.has(tag);
function unsupported(tag) {
    return new Error(`HTMLText: unsupported tag <${tag}> — supported: ${SUPPORTED_TAGS.join(", ")}`);
}
/** Tokenize + build a whitelisted element tree. Malformed input degrades to
 *  defined output: a stray `<`, an unclosed tag, or a mismatched close never
 *  throws under `strip` — only a genuinely unsupported tag does under `error`. */
function buildTree(src, policy) {
    const root = { tag: "", attrs: {}, kids: [] };
    // stack frames mirror open tags; el=null marks an UNWRAPPED unknown tag whose
    // children flow into the nearest real ancestor.
    const stack = [];
    const target = () => { for (let k = stack.length - 1; k >= 0; k--)
        if (stack[k].el)
            return stack[k].el; return root; };
    const inPre = () => stack.some((f) => f.tag === "pre");
    const pushText = (raw) => {
        if (raw === "")
            return;
        // Non-pre HTML collapses runs of whitespace; pre preserves them verbatim.
        const text = inPre() ? decodeEntities(raw) : decodeEntities(raw).replace(/\s+/g, " ");
        if (text !== "")
            target().kids.push({ text });
    };
    let i = 0;
    const n = src.length;
    while (i < n) {
        const lt = src.indexOf("<", i);
        if (lt === -1) {
            pushText(src.slice(i));
            break;
        }
        if (lt > i)
            pushText(src.slice(i, lt));
        if (src.startsWith("<!--", lt)) {
            const e = src.indexOf("-->", lt + 4);
            i = e === -1 ? n : e + 3;
            continue;
        }
        if (src[lt + 1] === "!" || src[lt + 1] === "?") {
            const gt = src.indexOf(">", lt);
            i = gt === -1 ? n : gt + 1;
            continue;
        }
        const gt = src.indexOf(">", lt);
        if (gt === -1) {
            pushText(src.slice(lt));
            break;
        } // a bare '<' → literal text
        const raw = src.slice(lt + 1, gt);
        if (raw[0] === "/") { // close tag
            const tag = raw.slice(1).trim().toLowerCase();
            for (let k = stack.length - 1; k >= 0; k--)
                if (stack[k].tag === tag) {
                    stack.length = k;
                    break;
                }
            i = gt + 1;
            continue;
        }
        const selfClose = raw.endsWith("/");
        const { tag, attrs } = parseTag(selfClose ? raw.slice(0, -1) : raw);
        if (tag === "") {
            pushText(src.slice(lt, gt + 1));
            i = gt + 1;
            continue;
        } // not a tag → literal
        if (RAWTEXT.has(tag)) { // <script>/<style>: drop tag + content
            if (policy === "error")
                throw unsupported(tag);
            const close = src.toLowerCase().indexOf(`</${tag}>`, gt + 1);
            i = close === -1 ? n : close + tag.length + 3;
            continue;
        }
        if (!known(tag)) { // unsupported
            if (policy === "error")
                throw unsupported(tag);
            if (!selfClose)
                stack.push({ tag, el: null }); // strip = unwrap (keep children)
            i = gt + 1;
            continue;
        }
        const el = { tag, attrs, kids: [] }; // supported
        target().kids.push(el);
        if (!selfClose && !VOID.has(tag))
            stack.push({ tag, el });
        i = gt + 1;
    }
    return root;
}
/** Read a tag's name + attributes. Only `<a href>` is ever consumed downstream;
 *  the rest are parsed (so they don't corrupt the scan) and ignored. */
function parseTag(inner) {
    const m = inner.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)/);
    if (!m)
        return { tag: "", attrs: {} };
    const tag = m[1].toLowerCase();
    const attrs = {};
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let mm;
    const rest = inner.slice(m[0].length);
    while ((mm = re.exec(rest)) !== null)
        attrs[mm[1].toLowerCase()] = decodeEntities(mm[2] ?? mm[3] ?? mm[4] ?? "");
    return { tag, attrs };
}
// ── tree → blocks ────────────────────────────────────────────────────────────
/** Concatenated text of an element subtree (for `<code>`/`<pre>`). */
function textOf(el) {
    let s = "";
    for (const k of el.kids)
        s += "text" in k ? k.text : textOf(k);
    return s;
}
function inlineOf(kids) {
    const out = [];
    for (const k of kids) {
        if ("text" in k) {
            out.push({ t: "text", value: k.text });
            continue;
        }
        switch (k.tag) {
            case "b":
            case "strong":
                out.push({ t: "strong", inline: inlineOf(k.kids) });
                break;
            case "i":
            case "em":
                out.push({ t: "em", inline: inlineOf(k.kids) });
                break;
            case "s":
            case "strike":
            case "del":
                out.push({ t: "strike", inline: inlineOf(k.kids) });
                break;
            case "code":
                out.push({ t: "code", value: textOf(k) });
                break;
            case "a":
                out.push({ t: "link", href: k.attrs.href ?? "", inline: inlineOf(k.kids) });
                break;
            case "br":
                out.push({ t: "br" });
                break;
            // A classed span carries a NAMED accent (resolved to a themed fill by the
            // flow engine against the component's `accents`); an unknown/absent class
            // just unwraps. This is the one styling hook — reference-only, no CSS.
            case "span":
                k.attrs.class ? out.push({ t: "fill", name: k.attrs.class.trim(), inline: inlineOf(k.kids) }) : out.push(...inlineOf(k.kids));
                break;
            default: for (const b of blocksOf([k]))
                if (b.t === "paragraph" || b.t === "heading")
                    out.push(...b.inline);
        }
    }
    return out;
}
function blockOf(el) {
    const tag = el.tag;
    if (tag === "p")
        return [{ t: "paragraph", inline: inlineOf(el.kids) }];
    if (/^h[1-6]$/.test(tag))
        return [{ t: "heading", level: +tag[1], inline: inlineOf(el.kids) }];
    if (tag === "hr")
        return [{ t: "rule" }];
    if (tag === "blockquote")
        return [{ t: "blockquote", blocks: blocksOf(el.kids) }];
    if (tag === "pre")
        return [{ t: "code", lang: "", text: textOf(el).replace(/^\n/, "").replace(/\s+$/, "") }];
    if (tag === "div")
        return blocksOf(el.kids); // transparent container
    if (tag === "ul" || tag === "ol") {
        const ordered = tag === "ol";
        const start = ordered ? parseInt(el.attrs.start ?? "1", 10) || 1 : 1;
        const items = [];
        for (const c of el.kids)
            if (!("text" in c) && c.tag === "li")
                items.push({ task: null, blocks: blocksOf(c.kids) });
        return [{ t: "list", ordered, start, items }];
    }
    return [];
}
/** Group a node list into blocks: block-level children open their own block;
 *  runs of inline children + text between them fold into an implicit paragraph
 *  (whitespace-only runs between blocks are dropped, as HTML renders them). */
function blocksOf(kids) {
    const out = [];
    let buf = [];
    const flush = () => {
        if (buf.length === 0)
            return;
        const inl = inlineOf(buf);
        buf = [];
        if (inl.length === 0)
            return;
        if (inl.length === 1 && inl[0].t === "text" && inl[0].value.trim() === "")
            return; // inter-block whitespace
        out.push({ t: "paragraph", inline: inl });
    };
    for (const k of kids) {
        if ("text" in k)
            buf.push(k);
        else if (BLOCK.has(k.tag)) {
            flush();
            out.push(...blockOf(k));
        }
        else
            buf.push(k); // inline element
    }
    flush();
    return out;
}
/** Parse a whitelisted-HTML string into the block tree. `policy` decides what an
 *  unsupported tag does (strip = unwrap / error = throw). */
export function parseHtml(src, policy = "strip") {
    return blocksOf(buildTree(src, policy).kids);
}
//# sourceMappingURL=html.js.map