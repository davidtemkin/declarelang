// Presentify's geometry: pure functions over slide elements, in slide points.
//
// Nothing here holds state or touches a view. Every function takes element
// records (the service's format, see task/api/API.md) and returns new ones;
// an element passed in is never changed, which is what lets the undo history
// keep old slides by reference.

// `Box`, `Elem` and the rest are the schemas in slide.declare.

const SLIDE_W = 1280
const SLIDE_H = 720

function newId(): string {
    return "p" + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7)
}

// ── Boxes ───────────────────────────────────────────────────────────────────

function boundsOf(e: Elem): Box {
    if (e.kind == "line") {
        const x = Math.min(e.x1 ?? 0, e.x2 ?? 0), y = Math.min(e.y1 ?? 0, e.y2 ?? 0)
        return { x: x, y: y, w: Math.abs((e.x2 ?? 0) - (e.x1 ?? 0)), h: Math.abs((e.y2 ?? 0) - (e.y1 ?? 0)) }
    }
    if (e.kind == "group") return unionOf((e.children ?? []).map(boundsOf))
    return { x: e.x ?? 0, y: e.y ?? 0, w: e.width ?? 0, h: e.height ?? 0 }
}

function unionOf(boxes: Box[]): Box {
    if (boxes.length == 0) return { x: 0, y: 0, w: 0, h: 0 }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const b of boxes) {
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y)
        x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function touches(a: Box, b: Box): boolean {
    return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

function boxFromPoints(ax: number, ay: number, bx: number, by: number): Box {
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) }
}

// ── Finding and replacing in the element tree ───────────────────────────────

function findElem(list: Elem[], id: string): Elem | null {
    for (const e of list) {
        if (e.id == id) return e
        if (e.kind == "group") { const f = findElem(e.children ?? [], id); if (f != null) return f }
    }
    return null
}

// The ids from the top of the slide down to `id`: ["g1", "e3"] for e3 inside g1.
function pathTo(list: Elem[], id: string): string[] {
    for (const e of list) {
        if (e.id == id) return [e.id]
        if (e.kind == "group") {
            const p = pathTo(e.children ?? [], id)
            if (p.length > 0) return [e.id, ...p]
        }
    }
    return []
}

// The list that holds `id`, and its place there.
function siblingsOf(list: Elem[], id: string): Elem[] | null {
    for (const e of list) if (e.id == id) return list
    for (const e of list) if (e.kind == "group") { const s = siblingsOf(e.children ?? [], id); if (s != null) return s }
    return null
}

function mapElems(list: Elem[], fn: (e: Elem) => Elem | null): Elem[] {
    const out: Elem[] = []
    for (const e of list) {
        const r = fn(e)
        if (r == null) continue
        if (r === e && e.kind == "group") {
            const kids = mapElems(e.children ?? [], fn)
            out.push(kids.length == (e.children ?? []).length && kids.every((k, i) => k === (e.children ?? [])[i]) ? e : { ...e, children: kids })
        } else out.push(r)
    }
    return out
}

function replaceElems(list: Elem[], byId: Record<string, Elem>): Elem[] {
    return mapElems(list, (e) => byId[e.id] ?? e)
}

// Removes the ids, and dissolves a group left with fewer than two children.
function removeElems(list: Elem[], ids: string[]): Elem[] {
    const out: Elem[] = []
    for (const e of list) {
        if (ids.includes(e.id)) continue
        if (e.kind == "group") {
            const kids = removeElems(e.children ?? [], ids)
            if (kids.length == 0) continue
            if (kids.length == 1) { out.push(kids[0]); continue }
            out.push(kids.length == (e.children ?? []).length && kids.every((k, i) => k === (e.children ?? [])[i]) ? e : { ...e, children: kids })
        } else out.push(e)
    }
    return out
}

function allIds(list: Elem[]): string[] {
    const out: string[] = []
    for (const e of list) { out.push(e.id); if (e.kind == "group") out.push(...allIds(e.children ?? [])) }
    return out
}

// A copy with fresh ids throughout (a duplicate, a paste).
function withNewIds(e: Elem): Elem {
    if (e.kind == "group") return { ...e, id: newId(), children: (e.children ?? []).map(withNewIds) }
    return { ...e, id: newId() }
}

// ── Moving and resizing ─────────────────────────────────────────────────────

function round2(v: number): number { return Math.round(v * 100) / 100 }

function translate(e: Elem, dx: number, dy: number): Elem {
    if (e.kind == "line") return { ...e, x1: round2((e.x1 ?? 0) + dx), y1: round2((e.y1 ?? 0) + dy), x2: round2((e.x2 ?? 0) + dx), y2: round2((e.y2 ?? 0) + dy) }
    if (e.kind == "group") return { ...e, children: (e.children ?? []).map((c) => translate(c, dx, dy)) }
    return { ...e, x: round2((e.x ?? 0) + dx), y: round2((e.y ?? 0) + dy) }
}

// Maps an element from box `a` onto box `b`. A rectangle keeps its corner
// radius and a text box its type size: they are lengths, not proportions.
function remap(e: Elem, a: Box, b: Box): Elem {
    const sx = a.w == 0 ? 1 : b.w / a.w, sy = a.h == 0 ? 1 : b.h / a.h
    const mx = (v: number) => round2(b.x + (v - a.x) * sx)
    const my = (v: number) => round2(b.y + (v - a.y) * sy)
    if (e.kind == "line") return { ...e, x1: mx(e.x1 ?? 0), y1: my(e.y1 ?? 0), x2: mx(e.x2 ?? 0), y2: my(e.y2 ?? 0) }
    if (e.kind == "group") return { ...e, children: (e.children ?? []).map((c) => remap(c, a, b)) }
    const x = mx(e.x ?? 0), y = my(e.y ?? 0)
    return { ...e, x: x, y: y, width: Math.max(1, round2(mx((e.x ?? 0) + (e.width ?? 0)) - x)), height: Math.max(1, round2(my((e.y ?? 0) + (e.height ?? 0)) - y)) }
}

// The box a handle drag makes. `handle` is any of "l", "r", "t", "b" and the
// corners "lt", "rt", "lb", "rb"; `keep` holds the start box's proportions.
function resizeBox(b0: Box, handle: string, dx: number, dy: number, keep: boolean): Box {
    const sx = handle.includes("r") ? 1 : handle.includes("l") ? -1 : 0
    const sy = handle.includes("b") ? 1 : handle.includes("t") ? -1 : 0
    let w = Math.max(1, b0.w + sx * dx), h = Math.max(1, b0.h + sy * dy)
    if (keep && b0.w > 0 && b0.h > 0) {
        const ratio = b0.w / b0.h
        if (sx != 0 && sy != 0) {
            if (w / b0.w > h / b0.h) h = w / ratio
            else w = h * ratio
        } else if (sx != 0) h = w / ratio
        else w = h * ratio
    }
    // The opposite side stays put; a side handle keeps the other axis centred.
    const x = sx > 0 ? b0.x : sx < 0 ? b0.x + b0.w - w : b0.x + (b0.w - w) / 2
    const y = sy > 0 ? b0.y : sy < 0 ? b0.y + b0.h - h : b0.y + (b0.h - h) / 2
    return { x: round2(x), y: round2(y), w: round2(w), h: round2(h) }
}

// Shift while drawing a line: the nearest 45°.
function snapAngle(x0: number, y0: number, x1: number, y1: number): number[] {
    const dx = x1 - x0, dy = y1 - y0
    const len = Math.hypot(dx, dy)
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    return [round2(x0 + Math.cos(a) * len), round2(y0 + Math.sin(a) * len)]
}

// ── Snapping ────────────────────────────────────────────────────────────────
//
// The edges and centres of the other things on the slide, and the slide's
// own, are the lines a moving box snaps to. A snap returns the shift to apply
// and the guide lines to show.

interface Snap { dx: number; dy: number; gx: number[]; gy: number[] }

function snapLines(others: Box[]): { xs: number[]; ys: number[] } {
    const xs = [0, SLIDE_W / 2, SLIDE_W], ys = [0, SLIDE_H / 2, SLIDE_H]
    for (const o of others) {
        xs.push(o.x, o.x + o.w / 2, o.x + o.w)
        ys.push(o.y, o.y + o.h / 2, o.y + o.h)
    }
    return { xs: xs, ys: ys }
}

function nearest(values: number[], targets: number[], within: number): { d: number; at: number[] } {
    let best = within + 1, d = 0
    for (const v of values) for (const t of targets) {
        const diff = t - v
        if (Math.abs(diff) < best - 0.001) { best = Math.abs(diff); d = diff }
    }
    if (best > within) return { d: 0, at: [] }
    const at: number[] = []
    for (const v of values) for (const t of targets) if (Math.abs(t - (v + d)) < 0.5 && !at.includes(t)) at.push(t)
    return { d: d, at: at }
}

// A moving box: its left, centre and right (top, middle, bottom) may each snap.
function snapMove(b: Box, others: Box[], within: number): Snap {
    const L = snapLines(others)
    const sx = nearest([b.x, b.x + b.w / 2, b.x + b.w], L.xs, within)
    const sy = nearest([b.y, b.y + b.h / 2, b.y + b.h], L.ys, within)
    return { dx: sx.d, dy: sy.d, gx: sx.at, gy: sy.at }
}

// A single moving point (a dragged corner, a line's end).
function snapPoint(x: number, y: number, others: Box[], within: number): Snap {
    const L = snapLines(others)
    const sx = nearest([x], L.xs, within)
    const sy = nearest([y], L.ys, within)
    return { dx: sx.d, dy: sy.d, gx: sx.at, gy: sy.at }
}

// ── Aligning and distributing ───────────────────────────────────────────────

// The shift that aligns box `b` within `all` (the selection's bounds).
function alignShift(b: Box, all: Box, how: string): number[] {
    switch (how) {
        case "left": return [all.x - b.x, 0]
        case "center": return [all.x + all.w / 2 - (b.x + b.w / 2), 0]
        case "right": return [all.x + all.w - (b.x + b.w), 0]
        case "top": return [0, all.y - b.y]
        case "middle": return [0, all.y + all.h / 2 - (b.y + b.h / 2)]
        case "bottom": return [0, all.y + all.h - (b.y + b.h)]
    }
    return [0, 0]
}

// Equal gaps between boxes, the outermost two staying put. Returns one shift
// per box, in the order given.
function distributeShifts(boxes: Box[], across: boolean): number[][] {
    const n = boxes.length
    const order = boxes.map((b, i) => i).sort((i, j) => across ? boxes[i].x - boxes[j].x : boxes[i].y - boxes[j].y)
    const first = boxes[order[0]], last = boxes[order[n - 1]]
    const span = across ? last.x + last.w - first.x : last.y + last.h - first.y
    const total = boxes.reduce((s, b) => s + (across ? b.w : b.h), 0)
    const gap = (span - total) / (n - 1)
    const out: number[][] = boxes.map(() => [0, 0])
    let at = across ? first.x : first.y
    for (const i of order) {
        const b = boxes[i]
        const d = at - (across ? b.x : b.y)
        out[i] = across ? [d, 0] : [0, d]
        at = at + (across ? b.w : b.h) + gap
    }
    return out
}

// ── Stacking order within one list ──────────────────────────────────────────

function reorder(list: Elem[], ids: string[], how: string): Elem[] {
    const picked = list.filter((e) => ids.includes(e.id))
    const rest = list.filter((e) => !ids.includes(e.id))
    if (picked.length == 0) return list
    if (how == "front") return [...rest, ...picked]
    if (how == "back") return [...picked, ...rest]
    const out = [...list]
    if (how == "forward") {
        for (let i = out.length - 2; i >= 0; i--) {
            if (ids.includes(out[i].id) && !ids.includes(out[i + 1].id)) { const t = out[i]; out[i] = out[i + 1]; out[i + 1] = t }
        }
    } else {
        for (let i = 1; i < out.length; i++) {
            if (ids.includes(out[i].id) && !ids.includes(out[i - 1].id)) { const t = out[i]; out[i] = out[i - 1]; out[i - 1] = t }
        }
    }
    return out
}

// ── Colours ─────────────────────────────────────────────────────────────────

// "#RRGGBB" or "#RRGGBBAA" from what a person typed, or "" when it isn't one.
function normalizeHex(s: string): string {
    let t = s.trim().replace(/^#/, "").toUpperCase()
    if (/^[0-9A-F]{3}$/.test(t)) t = t.split("").map((c) => c + c).join("")
    return /^[0-9A-F]{6}([0-9A-F]{2})?$/.test(t) ? "#" + t : ""
}

// How light a colour looks, 0 to 1: what decides a contrasting ink.
function luminance(hex: string): number {
    const h = normalizeHex(hex)
    if (h == "") return 1
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

// ── Time, as a person reads it ──────────────────────────────────────────────

function editedLabel(iso: string, now: number): string {
    const t = Date.parse(iso)
    if (isNaN(t)) return ""
    const s = Math.max(0, (now - t) / 1000)
    if (s < 60) return "Edited just now"
    if (s < 3600) return "Edited " + Math.floor(s / 60) + " min ago"
    if (s < 86400) return "Edited " + Math.floor(s / 3600) + " h ago"
    const d = new Date(t)
    const sameYear = d.getFullYear() == new Date(now).getFullYear()
    return "Edited " + d.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })
}
