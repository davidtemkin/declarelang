// print.ts — the plan as a printable page: every spread, each page drawn from its layout, with
// its folio, section and what it carries; then the issue's notes. A function of the flatplan.

import { type Flatplan, regionRects, slots, storyById, shares, coversOn } from "./plan.ts"

function esc(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") }

export function planHtml(fp: Flatplan, fol: string[]): string {
    const sl = slots(fp)
    const w = 70, h = Math.round(w * fp.trimH / Math.max(0.1, fp.trimW))
    const secs = new Map(fp.sections.map((s) => [s.id, s]))
    const page = (i: number) => {
        const p = fp.pages[i]
        const rects = regionRects(p.layout, p.turn, p.flip)
        const regions = p.regions.map((r, k) => {
            const q = rects[k]
            if (!q) return ""
            const words = r.storyId ? storyById(fp, r.storyId)?.title ?? "" : r.bookingId ? fp.bookings.find((b) => b.id == r.bookingId)?.text ?? "" : r.label || (r.kind == "unassigned" ? "Open" : "")
            const fill = r.kind == "editorial" ? "#E7ECF7" : r.kind == "advertising" ? "#FBE3BC" : "#FFFFFF"
            return `<div class="r" style="left:${q.x * 100}%;top:${q.y * 100}%;width:${q.w * 100}%;height:${q.h * 100}%;background:${fill}">${esc(words)}</div>`
        }).join("")
        const sec = secs.get(p.sectionId)
        return `<div class="p" style="width:${w}px"><div class="bar" style="background:${sec?.color ?? "#999"}"></div>` +
            `<div class="sheet" style="height:${h}px">${regions}</div><div class="f">${esc(fol[i])}${p.locked ? " · locked" : ""}</div></div>`
    }
    const spreads: number[][] = []
    sl.forEach((s, i) => { if (!spreads[s.spread]) spreads[s.spread] = []; spreads[s.spread].push(i) })
    const body = spreads.filter((x) => x).map((idx) => `<div class="s">${idx.map(page).join("")}</div>`).join("")
    const sh = shares(fp)
    const legend = fp.sections.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fp.publication + " " + fp.name)}</title><style>
body{font:11px -apple-system,system-ui,sans-serif;color:#1e1d1a;margin:24px}h1{font-size:20px;margin:0}
.meta{color:#615e56;margin:4px 0 12px}.legend span{margin-right:12px}.legend i{display:inline-block;width:10px;height:10px;margin-right:4px;vertical-align:-1px}
.grid{display:flex;flex-wrap:wrap;gap:14px 18px;margin-top:12px}.s{display:flex}.p{position:relative}.bar{height:4px}
.sheet{position:relative;border:1px solid #c9c5ba;background:#fff;overflow:hidden}.r{position:absolute;box-sizing:border-box;border:1px solid #fff;font-size:7px;padding:2px;overflow:hidden}
.f{font-weight:bold;font-size:9px;margin-top:2px}.notes{margin-top:18px;white-space:pre-wrap;max-width:640px}
@media print{body{margin:10mm}.s{break-inside:avoid}}</style></head><body>
<h1>${esc(fp.publication)} — ${esc(fp.name)}</h1><div class="meta">${esc(fp.edition)} · ${fp.pages.length} pages · ${fp.trimW} × ${fp.trimH} in · ${coversOn(fp) ? "separate covers" : "self-cover"} ·
editorial ${sh.editorial.toFixed(1)} · advertising ${sh.advertising.toFixed(1)} · open ${sh.open.toFixed(1)} pages</div>
<div class="legend">${legend}</div><div class="grid">${body}</div>${fp.notes ? `<div class="notes"><b>Notes</b><br>${esc(fp.notes)}</div>` : ""}</body></html>`
}
