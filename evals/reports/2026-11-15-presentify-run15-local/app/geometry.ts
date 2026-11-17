// Presentify's geometry: pure functions over a slide's elements, as the
// service stores them (task/api/API.md). Nothing here holds state; every
// function takes elements and hands back new ones, so the Declare side can
// write the result into its dataset in one step.

type Box = { x: number; y: number; w: number; h: number }
type Guide = { id: string; axis: "x" | "y"; at: number }
// An element as the service stores it. The Declare side types it with the
// `Element` schema; here it is read structurally.
type El = any

const SLIDE_W = 1280
const SLIDE_H = 720

// ── reading ─────────────────────────────────────────────────────────────────

function boxOf(e: El): Box {
    if (e.kind == "group") return unionOf((e.children ?? []).map(boxOf)) ?? { x: 0, y: 0, w: 0, h: 0 }
    if (e.kind == "line") {
        const x = Math.min(e.x1, e.x2), y = Math.min(e.y1, e.y2)
        return { x: x, y: y, w: Math.abs(e.x2 - e.x1), h: Math.abs(e.y2 - e.y1) }
    }
    return { x: e.x ?? 0, y: e.y ?? 0, w: e.width ?? 0, h: e.height ?? 0 }
}

function unionOf(boxes: Box[]): Box | null {
    if (boxes.length == 0) return null
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
    for (const k of boxes) {
        l = Math.min(l, k.x); t = Math.min(t, k.y)
        r = Math.max(r, k.x + k.w); b = Math.max(b, k.y + k.h)
    }
    return { x: l, y: t, w: r - l, h: b - t }
}

function findEl(els: El[], id: string): El | null {
    for (const e of els) {
        if (e.id == id) return e
        if (e.kind == "group") {
            const hit = findEl(e.children ?? [], id)
            if (hit) return hit
        }
    }
    return null
}

function pick(els: El[], ids: string[]): El[] {
    return ids.map((id) => findEl(els, id)).filter((e) => e != null) as El[]
}

function boundsOf(els: El[], ids: string[]): Box | null {
    return unionOf(pick(els, ids).map(boxOf))
}

// Every id in use on a slide, groups' children included.
function idsIn(els: El[], into: string[] = []): string[] {
    for (const e of els) {
        into.push(e.id)
        if (e.kind == "group") idsIn(e.children ?? [], into)
    }
    return into
}

// The top-level element that holds `id` (itself, when it is top-level).
function topOf(els: El[], id: string): string {
    for (const e of els) {
        if (e.id == id) return e.id
        if (e.kind == "group" && findEl(e.children ?? [], id)) return e.id
    }
    return id
}

function touches(a: Box, b: Box): boolean {
    return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

// The top-level elements a marquee touches.
function inMarquee(els: El[], m: Box): string[] {
    return els.filter((e) => touches(boxOf(e), m)).map((e) => e.id)
}

// ── rewriting ───────────────────────────────────────────────────────────────

// `fn` applied to each element whose id is in `ids`, at any depth.
function mapEls(els: El[], ids: string[], fn: (e: El) => El): El[] {
    return els.map((e) => {
        if (ids.includes(e.id)) return fn(e)
        if (e.kind == "group") return { ...e, children: mapEls(e.children ?? [], ids, fn) }
        return e
    })
}

// Applied to every leaf (non-group) under the given elements.
function mapLeaves(e: El, fn: (leaf: El) => El): El {
    if (e.kind == "group") return { ...e, children: (e.children ?? []).map((c: El) => mapLeaves(c, fn)) }
    return fn(e)
}

function removeEls(els: El[], ids: string[]): El[] {
    const out: El[] = []
    for (const e of els) {
        if (ids.includes(e.id)) continue
        if (e.kind == "group") {
            const kids = removeEls(e.children ?? [], ids)
            if (kids.length == 0) continue
            if (kids.length == 1) { out.push(kids[0]); continue }   // a group of one is no group
            out.push({ ...e, children: kids })
        } else out.push(e)
    }
    return out
}

function moved(e: El, dx: number, dy: number): El {
    return mapLeaves(e, (l) => l.kind == "line"
        ? { ...l, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy }
        : { ...l, x: l.x + dx, y: l.y + dy })
}

// An element carried from one box to another: positions and sizes scale with
// the box; a corner radius and a text's type size stay as they are.
function refit(e: El, from: Box, to: Box): El {
    const sx = from.w > 0 ? to.w / from.w : 1
    const sy = from.h > 0 ? to.h / from.h : 1
    const mx = (v: number) => to.x + (v - from.x) * sx
    const my = (v: number) => to.y + (v - from.y) * sy
    return mapLeaves(e, (l) => {
        if (l.kind == "line") return { ...l, x1: mx(l.x1), y1: my(l.y1), x2: mx(l.x2), y2: my(l.y2) }
        const out: El = { ...l, x: mx(l.x), y: my(l.y), width: Math.max(1, l.width * sx), height: Math.max(1, l.height * sy) }
        return out
    })
}

// The box a resize handle makes, from the box at the drag's start.
// `mode` names the edges the handle holds: "l", "r", "t", "b", or a corner.
function resizedBox(b: Box, mode: string, dx: number, dy: number, keep: boolean): Box {
    const min = 4
    const sx = mode.includes("r") ? 1 : mode.includes("l") ? -1 : 0
    const sy = mode.includes("b") ? 1 : mode.includes("t") ? -1 : 0
    let w = sx != 0 ? Math.max(min, b.w + sx * dx) : b.w
    let h = sy != 0 ? Math.max(min, b.h + sy * dy) : b.h
    if (keep && b.w > 0 && b.h > 0) {
        const ratio = b.w / b.h
        if (sx != 0 && sy != 0) {
            if (w / b.w > h / b.h) h = w / ratio
            else w = h * ratio
        } else if (sx != 0) h = w / ratio
        else if (sy != 0) w = h * ratio
    }
    const x = sx < 0 ? b.x + b.w - w : sx > 0 ? b.x : b.x + (b.w - w) / 2
    const y = sy < 0 ? b.y + b.h - h : sy > 0 ? b.y : b.y + (b.h - h) / 2
    return { x: x, y: y, w: w, h: h }
}

// A line's end, moved; with shift it keeps to 45° steps from the other end.
function lineEnd(l: El, end: 1 | 2, x: number, y: number, snap: boolean): El {
    const ox = end == 1 ? l.x2 : l.x1, oy = end == 1 ? l.y2 : l.y1
    if (snap) {
        const len = Math.hypot(x - ox, y - oy)
        const a = Math.round(Math.atan2(y - oy, x - ox) / (Math.PI / 4)) * (Math.PI / 4)
        x = ox + Math.cos(a) * len
        y = oy + Math.sin(a) * len
    }
    return end == 1 ? { ...l, x1: x, y1: y } : { ...l, x2: x, y2: y }
}

// ── ids, copies ─────────────────────────────────────────────────────────────

function freshId(used: string[]): string {
    let id = ""
    do { id = "e" + Math.random().toString(36).slice(2, 8) } while (used.includes(id))
    used.push(id)
    return id
}

// A copy with new ids throughout, moved by (dx, dy).
function copied(e: El, used: string[], dx: number, dy: number): El {
    const renamed = (x: El): El => x.kind == "group"
        ? { ...x, id: freshId(used), children: (x.children ?? []).map(renamed) }
        : { ...x, id: freshId(used) }
    return moved(renamed(e), dx, dy)
}

// ── arranging ───────────────────────────────────────────────────────────────

function aligned(els: El[], ids: string[], how: string): El[] {
    const all = boundsOf(els, ids)
    if (!all) return els
    return mapEls(els, ids, (e) => {
        const b = boxOf(e)
        let dx = 0, dy = 0
        if (how == "left") dx = all.x - b.x
        if (how == "center") dx = all.x + all.w / 2 - (b.x + b.w / 2)
        if (how == "right") dx = all.x + all.w - (b.x + b.w)
        if (how == "top") dy = all.y - b.y
        if (how == "middle") dy = all.y + all.h / 2 - (b.y + b.h / 2)
        if (how == "bottom") dy = all.y + all.h - (b.y + b.h)
        return moved(e, dx, dy)
    })
}

// Equal gaps between the things chosen, the outermost two staying put.
function distributed(els: El[], ids: string[], axis: "x" | "y"): El[] {
    const items = pick(els, ids).map((e) => ({ id: e.id, b: boxOf(e) }))
    if (items.length < 3) return els
    const pos = (b: Box) => axis == "x" ? b.x : b.y
    const size = (b: Box) => axis == "x" ? b.w : b.h
    items.sort((a, c) => pos(a.b) - pos(c.b))
    const first = items[0].b, last = items[items.length - 1].b
    const span = pos(last) + size(last) - pos(first)
    const used = items.reduce((n, it) => n + size(it.b), 0)
    const gap = (span - used) / (items.length - 1)
    const target: { [id: string]: number } = {}
    let at = pos(first)
    for (const it of items) { target[it.id] = at; at = at + size(it.b) + gap }
    return mapEls(els, ids, (e) => {
        const d = target[e.id] - pos(boxOf(e))
        return axis == "x" ? moved(e, d, 0) : moved(e, 0, d)
    })
}

// Stacking order, within whichever list (the slide's, or a group's) holds them.
function restacked(els: El[], ids: string[], how: string): El[] {
    const here = els.filter((e) => ids.includes(e.id))
    let out = els.map((e) => e.kind == "group" ? { ...e, children: restacked(e.children ?? [], ids, how) } : e)
    if (here.length == 0) return out
    if (how == "front") return [...out.filter((e) => !ids.includes(e.id)), ...out.filter((e) => ids.includes(e.id))]
    if (how == "back") return [...out.filter((e) => ids.includes(e.id)), ...out.filter((e) => !ids.includes(e.id))]
    out = [...out]
    if (how == "forward") {
        for (let i = out.length - 2; i >= 0; i--) {
            if (ids.includes(out[i].id) && !ids.includes(out[i + 1].id)) { const t = out[i]; out[i] = out[i + 1]; out[i + 1] = t }
        }
    } else if (how == "backward") {
        for (let i = 1; i < out.length; i++) {
            if (ids.includes(out[i].id) && !ids.includes(out[i - 1].id)) { const t = out[i]; out[i] = out[i - 1]; out[i - 1] = t }
        }
    }
    return out
}

// The chosen top-level elements become one group, where the frontmost was.
function grouped(els: El[], ids: string[], id: string): El[] {
    const kids = els.filter((e) => ids.includes(e.id))
    if (kids.length < 2) return els
    let last = -1
    els.forEach((e, i) => { if (ids.includes(e.id)) last = i })
    const out: El[] = []
    els.forEach((e, i) => {
        if (i == last) out.push({ id: id, kind: "group", children: kids })
        else if (!ids.includes(e.id)) out.push(e)
    })
    return out
}

function ungrouped(els: El[], ids: string[]): El[] {
    const out: El[] = []
    for (const e of els) {
        if (e.kind == "group" && ids.includes(e.id)) out.push(...(e.children ?? []))
        else out.push(e)
    }
    return out
}

// ── snapping ────────────────────────────────────────────────────────────────

// A move of `b` by (dx, dy), pulled onto the nearest edge or centre among
// `others` and the slide's own, within `tol`. Hands back the move and the
// guides to draw.
function snapped(b: Box, others: Box[], dx: number, dy: number, tol: number): { dx: number; dy: number; guides: Guide[] } {
    const targets = [{ x: 0, y: 0, w: SLIDE_W, h: SLIDE_H }, ...others]
    const xs = targets.flatMap((t) => [t.x, t.x + t.w / 2, t.x + t.w])
    const ys = targets.flatMap((t) => [t.y, t.y + t.h / 2, t.y + t.h])
    const nb = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }
    const mine = (v: number, s: number) => [v, v + s / 2, v + s]
    let bestX: number | null = null, gx = 0
    for (const m of mine(nb.x, nb.w)) for (const t of xs) {
        const d = t - m
        if (Math.abs(d) <= tol && (bestX == null || Math.abs(d) < Math.abs(bestX))) { bestX = d; gx = t }
    }
    let bestY: number | null = null, gy = 0
    for (const m of mine(nb.y, nb.h)) for (const t of ys) {
        const d = t - m
        if (Math.abs(d) <= tol && (bestY == null || Math.abs(d) < Math.abs(bestY))) { bestY = d; gy = t }
    }
    const guides: Guide[] = []
    if (bestX != null) guides.push({ id: "gx", axis: "x", at: gx })
    if (bestY != null) guides.push({ id: "gy", axis: "y", at: gy })
    return { dx: dx + (bestX ?? 0), dy: dy + (bestY ?? 0), guides: guides }
}

// ── presentation ────────────────────────────────────────────────────────────

// The face a slide's text is set in, with fallbacks that keep its character.
function faceFor(font: string): string[] {
    const serif = ["Georgia", "Iowan Old Style", "Palatino", "Times New Roman"]
    const mono = ["Menlo", "Courier New"]
    if (serif.includes(font)) return [font, "Georgia", "serif"]
    if (mono.includes(font)) return [font, "Menlo", "monospace"]
    return [font, "Helvetica Neue", "Arial", "sans-serif"]
}

// A colour's perceived lightness, 0 (black) to 1 (white).
function lightness(hex: string): number {
    const n = parseInt((hex ?? "#FFFFFF").slice(1, 7), 16)
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function ellipsePath(w: number, h: number): string {
    return `M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`
}

function whenEdited(iso: string, now: number): string {
    const t = Date.parse(iso)
    if (isNaN(t)) return ""
    const s = Math.max(0, (now - t) / 1000)
    if (s < 60) return "Edited just now"
    if (s < 3600) return `Edited ${Math.floor(s / 60)} min ago`
    if (s < 86400) { const h = Math.floor(s / 3600); return `Edited ${h} hour${h == 1 ? "" : "s"} ago` }
    if (s < 86400 * 7) { const d = Math.floor(s / 86400); return d == 1 ? "Edited yesterday" : `Edited ${d} days ago` }
    return "Edited " + new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function hexOk(s: string): string | null {
    const t = s.trim().toUpperCase()
    const v = t.startsWith("#") ? t : "#" + t
    return /^#([0-9A-F]{6}|[0-9A-F]{8})$/.test(v) ? v : null
}

// Every leaf under the given elements: what styling applies to.
function leavesOf(els: El[]): El[] {
    return els.flatMap((e) => e.kind == "group" ? leavesOf(e.children ?? []) : [e])
}

// One value shared by all, "mixed" when they differ, "" when there are none.
function common(values: string[]): string {
    if (values.length == 0) return ""
    return values.every((v) => v == values[0]) ? values[0] : "mixed"
}

// A "#RRGGBB" string as a colour, or null for anything else ("none", "mixed").
type Hex = `#${string}`
function asColor(s: string): Hex | null {
    return s.startsWith("#") ? (s as `#${string}`) : null
}
