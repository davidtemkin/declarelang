// The rich text's DOCUMENT — the block tree as one flow of RichNodes, for a
// renderer whose text engine lays out a whole document (`richBlocks`: the DOM).
// Its own module so a canvas build carries none of it (declarec's
// slim-rich-doc).
import { BODY, C, CODEBG, CODEFAM, CODERULE, CODESIZE, PROSE, HEADINGC, HEADINGW, base, codeBlock, codeChrome, geoEqual, geoFor, listMarker, proseBlock, richRunsOf, sz, tableCells, } from "./rich-text.js";
/** The block tree as ONE document flow, for a backend that lays documents out
 *  (`richBlocks`). The twin of layoutBlocks: the same grouping, so the same
 *  gaps — prose in a group spaced by its heading rules, everything else
 *  `blockGap` apart — and the same geometry, as each node's `box`. The
 *  structural nodes carry the numbers their view builders place by. */
export function docNodes(blocks, bodyColor, ctx) {
    const out = [];
    let entries = 0; // layoutBlocks' stacked entries so far
    const entryGap = () => (entries++ === 0 ? 0 : PROSE.blockGap);
    let prevProse = null; // open prose group, as layoutBlocks'
    let groupGeo = null;
    for (const b of blocks) {
        const g = geoFor(b.t);
        const box = { ml: g.ml, mr: g.mr, maxWidth: g.maxWidth, align: g.align };
        if (b.t === "paragraph" || b.t === "heading") {
            if (prevProse !== null && groupGeo !== null && !geoEqual(groupGeo, g))
                prevProse = null;
            const gap = prevProse === null ? entryGap()
                : b.t === "heading" ? PROSE.headingGap[b.level - 1]
                    : prevProse === "heading" ? PROSE.headingBelow
                        : PROSE.blockGap;
            out.push({ ...proseBlock(b, gap, bodyColor, ctx), box });
            prevProse = b.t;
            groupGeo = g;
            continue;
        }
        prevProse = null;
        const gapBefore = entryGap();
        switch (b.t) {
            case "list": {
                const markerStyle = base(BODY.size, BODY.weight, bodyColor, BODY.tracking);
                out.push({
                    tag: "list", gapBefore, box, loose: b.loose, indent: PROSE.indent, markerBox: PROSE.indent - PROSE.markerGap,
                    itemGap: b.loose ? PROSE.blockGap : PROSE.itemGap,
                    items: b.items.map((it, i) => ({
                        marker: { tag: "p", runs: richRunsOf([{ t: "text", value: listMarker(b, it, i) }], markerStyle, ctx.family), gapBefore: 0, lineHeight: ctx.lead, fontSize: sz(BODY.size), align: "right" },
                        blocks: docNodes(it.blocks, bodyColor, ctx),
                    })),
                });
                break;
            }
            case "blockquote":
                out.push({ tag: "quote", gapBefore, box, indent: PROSE.quoteIndent, ruleWidth: 3, ruleColor: C.quoteRule, blocks: docNodes(b.blocks, C.quoteColor, ctx) });
                break;
            case "rule":
                out.push({ tag: "rule", gapBefore, box, color: C.rule });
                break;
            case "code":
                out.push({ ...codeChrome(), tag: "code", gapBefore, box, block: codeBlock(richRunsOf([{ t: "text", value: b.text }], base(CODESIZE, "normal", C.codeFg), CODEFAM)) });
                break;
            case "pre": {
                const pre = codeBlock(richRunsOf(b.inline, base(CODESIZE, BODY.weight, bodyColor, BODY.tracking), CODEFAM));
                if (CODEBG !== null || CODERULE !== null)
                    out.push({ ...codeChrome(), tag: "code", gapBefore, box, block: pre });
                else
                    out.push({ ...pre, gapBefore, box });
                break;
            }
            case "table":
                out.push({
                    tag: "table", gapBefore, box, gap: PROSE.cellGap, rowGap: PROSE.itemGap, ruleColor: C.rule,
                    header: tableCells(b, b.header, HEADINGW, HEADINGC, ctx),
                    rows: b.rows.map((r) => tableCells(b, r, "normal", bodyColor, ctx)),
                });
                break;
        }
    }
    return out;
}
//# sourceMappingURL=rich-doc.js.map