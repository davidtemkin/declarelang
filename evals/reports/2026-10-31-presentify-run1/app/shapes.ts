// Presentify — the geometry of the things on a slide.
//
// Plain functions of their arguments, outside the reactive system: hit
// testing, bounds, moving and resizing, grouping, aligning, ordering, colour
// conversion. Every function takes element records (the `Item` schema, the
// service's own format) and returns NEW records and arrays — nothing here
// mutates what it was given, which is what lets an undo snapshot share the
// arrays it holds with the live document.

export interface Box { x: number; y: number; w: number; h: number }

export const SLIDE_W = 1280
export const SLIDE_H = 720

// ── ids ─────────────────────────────────────────────────────────────────────

let seq = 0
export function newId(prefix: string): string {
    seq = seq + 1
    return prefix + Date.now().toString(36) + seq.toString(36) + Math.floor(Math.random() * 1296).toString(36)
}

// Every id in a slide is unique, groups included; a copy gets fresh ones.
export function freshIds(items: Item[]): Item[] {
    return items.map((it) => {
        const c: Item = { ...it, id: newId("e") }
        if (it.kind == "group") c.children = freshIds(kids(it))
        return c
    })
}

export function kids(it: Item): Item[] { return (it.children ?? []) as Item[] }

// ── bounds ──────────────────────────────────────────────────────────────────

export function boxOf(it: Item): Box {
    if (it.kind == "line") {
        const x1 = it.x1 ?? 0, y1 = it.y1 ?? 0, x2 = it.x2 ?? 0, y2 = it.y2 ?? 0
        return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
    }
    if (it.kind == "group") return unionOf(kids(it).map(boxOf))
    return { x: it.x ?? 0, y: it.y ?? 0, w: it.width ?? 0, h: it.height ?? 0 }
}

export function unionOf(boxes: Box[]): Box {
    if (boxes.length == 0) return { x: 0, y: 0, w: 0, h: 0 }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const b of boxes) {
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y)
        x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function boundsOf(items: Item[]): Box { return unionOf(items.map(boxOf)) }

export function intersects(a: Box, b: Box): boolean {
    return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

// ── finding things ──────────────────────────────────────────────────────────

// The item with this id anywhere in the tree, or null.
export function find(items: Item[], id: string): Item | null {
    for (const it of items) {
        if (it.id == id) return it
        if (it.kind == "group") { const f = find(kids(it), id); if (f != null) return f }
    }
    return null
}

// The group that directly holds `id`, or null when it is at the top.
export function parentOf(items: Item[], id: string): Item | null {
    for (const it of items) {
        if (it.kind != "group") continue
        if (kids(it).some((k) => k.id == id)) return it
        const p = parentOf(kids(it), id)
        if (p != null) return p
    }
    return null
}

// The siblings `id` sits among: the top level, or its group's children.
export function siblingsOf(items: Item[], id: string): Item[] {
    const p = parentOf(items, id)
    return p == null ? items : kids(p)
}

export function pick(items: Item[], ids: string[]): Item[] {
    return ids.map((id) => find(items, id)).filter((it): it is Item => it != null)
}

// Does a point (slide points) land on this item? `slop` is the reach, in
// points, a thin thing is given so a pointer can find it.
export function hits(it: Item, px: number, py: number, slop: number): boolean {
    if (it.kind == "group") return kids(it).some((k) => hits(k, px, py, slop))
    if (it.kind == "line") {
        const x1 = it.x1 ?? 0, y1 = it.y1 ?? 0, x2 = it.x2 ?? 0, y2 = it.y2 ?? 0
        const dx = x2 - x1, dy = y2 - y1
        const len2 = dx * dx + dy * dy
        const t = len2 == 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
        const cx = x1 + t * dx, cy = y1 + t * dy
        const reach = Math.max(slop, (it.stroke?.width ?? 1) / 2 + 2)
        return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= reach * reach
    }
    const b = boxOf(it)
    if (it.kind == "ellipse") {
        const rx = b.w / 2 + slop / 2, ry = b.h / 2 + slop / 2
        if (rx <= 0 || ry <= 0) return false
        const nx = (px - b.x - b.w / 2) / rx, ny = (py - b.y - b.h / 2) / ry
        return nx * nx + ny * ny <= 1
    }
    return px >= b.x - slop / 2 && px <= b.x + b.w + slop / 2 && py >= b.y - slop / 2 && py <= b.y + b.h + slop / 2
}

// The topmost item among `items` under the point (they are back to front).
export function topAt(items: Item[], px: number, py: number, slop: number): Item | null {
    for (let i = items.length - 1; i >= 0; i--) if (hits(items[i], px, py, slop)) return items[i]
    return null
}

// ── writing the tree ────────────────────────────────────────────────────────

// A copy of the tree with every item `fn` answers for replaced.
export function mapTree(items: Item[], fn: (it: Item) => Item | null): Item[] {
    return items.map((it) => {
        const r = fn(it)
        if (r != null) return r
        if (it.kind == "group") return { ...it, children: mapTree(kids(it), fn) }
        return it
    })
}

export function replaceById(items: Item[], changed: Item[]): Item[] {
    const by = new Map(changed.map((c) => [c.id, c] as [string, Item]))
    return mapTree(items, (it) => by.get(it.id) ?? null)
}

// Remove these ids wherever they are; a group left with fewer than two
// children dissolves into what remains.
export function removeIds(items: Item[], ids: string[]): Item[] {
    const out: Item[] = []
    for (const it of items) {
        if (ids.includes(it.id)) continue
        if (it.kind == "group") {
            const rest = removeIds(kids(it), ids)
            if (rest.length >= 2) out.push({ ...it, children: rest })
            else out.push(...rest)
        } else out.push(it)
    }
    return out
}

// ── moving and resizing ─────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100

export function moved(it: Item, dx: number, dy: number): Item {
    if (it.kind == "group") return { ...it, children: kids(it).map((k) => moved(k, dx, dy)) }
    if (it.kind == "line") return { ...it, x1: r2((it.x1 ?? 0) + dx), y1: r2((it.y1 ?? 0) + dy), x2: r2((it.x2 ?? 0) + dx), y2: r2((it.y2 ?? 0) + dy) }
    return { ...it, x: r2((it.x ?? 0) + dx), y: r2((it.y ?? 0) + dy) }
}

// Map an item from box `a` to box `b`: positions and sizes scale, a corner
// radius (a length) and a text's type size do not.
export function refit(it: Item, a: Box, b: Box): Item {
    const sx = a.w == 0 ? 1 : b.w / a.w, sy = a.h == 0 ? 1 : b.h / a.h
    const mx = (x: number) => r2(b.x + (x - a.x) * sx)
    const my = (y: number) => r2(b.y + (y - a.y) * sy)
    if (it.kind == "group") return { ...it, children: kids(it).map((k) => refit(k, a, b)) }
    if (it.kind == "line") return { ...it, x1: mx(it.x1 ?? 0), y1: my(it.y1 ?? 0), x2: mx(it.x2 ?? 0), y2: my(it.y2 ?? 0) }
    const x = mx(it.x ?? 0), y = my(it.y ?? 0)
    const right = mx((it.x ?? 0) + (it.width ?? 0)), bottom = my((it.y ?? 0) + (it.height ?? 0))
    return { ...it, x: x, y: y, width: r2(Math.max(1, right - x)), height: r2(Math.max(1, bottom - y)) }
}

// The box a resize handle makes. `mode` names the grabbed sides ("l", "rt",
// "b" …), `start` is the box at the press, (dx, dy) the pointer's travel in
// points. With `lock` the box keeps start's proportions: a corner follows the
// larger pull, a side grows the other axis about its centre.
export function resizeBox(start: Box, mode: string, dx: number, dy: number, lock: boolean): Box {
    const L = mode.includes("l"), R = mode.includes("r"), T = mode.includes("t"), B = mode.includes("b")
    let x0 = start.x, y0 = start.y, x1 = start.x + start.w, y1 = start.y + start.h
    if (L) x0 = Math.min(x0 + dx, x1 - 1)
    if (R) x1 = Math.max(x1 + dx, x0 + 1)
    if (T) y0 = Math.min(y0 + dy, y1 - 1)
    if (B) y1 = Math.max(y1 + dy, y0 + 1)
    let w = x1 - x0, h = y1 - y0
    if (lock && start.w > 0 && start.h > 0) {
        const ratio = start.w / start.h
        const horiz = L || R, vert = T || B
        if (horiz && vert) {
            if (w / start.w >= h / start.h) h = w / ratio
            else w = h * ratio
        } else if (horiz) h = w / ratio
        else w = h * ratio
        x0 = L ? x1 - w : horiz ? x0 : start.x + (start.w - w) / 2
        y0 = T ? y1 - h : vert ? y0 : start.y + (start.h - h) / 2
    }
    return { x: x0, y: y0, w: Math.max(1, w), h: Math.max(1, h) }
}

// ── snapping ────────────────────────────────────────────────────────────────

export interface Snap { dx: number; dy: number; gx: number[]; gy: number[] }

// The lines a moving box may snap to: the slide's edges and centre, and every
// other item's edges and centre.
export function snapLines(others: Item[]): { xs: number[]; ys: number[] } {
    const xs = [0, SLIDE_W / 2, SLIDE_W], ys = [0, SLIDE_H / 2, SLIDE_H]
    for (const o of others) {
        const b = boxOf(o)
        xs.push(b.x, b.x + b.w / 2, b.x + b.w)
        ys.push(b.y, b.y + b.h / 2, b.y + b.h)
    }
    return { xs: xs, ys: ys }
}

// How far to nudge `b` so one of its edges or its centre sits on a line,
// within `reach` points, and the guides that then show. `which` limits the
// candidates to the edges being dragged ("lrcx tbcy" letters; "" = all).
export function snapBox(b: Box, xs: number[], ys: number[], reach: number, which: string): Snap {
    const all = which == ""
    const cx: number[] = [], cy: number[] = []
    if (all || which.includes("l")) cx.push(b.x)
    if (all) cx.push(b.x + b.w / 2)
    if (all || which.includes("r")) cx.push(b.x + b.w)
    if (all || which.includes("t")) cy.push(b.y)
    if (all) cy.push(b.y + b.h / 2)
    if (all || which.includes("b")) cy.push(b.y + b.h)
    const best = (cands: number[], lines: number[]) => {
        let d = Infinity
        for (const c of cands) for (const l of lines) if (Math.abs(l - c) < Math.abs(d)) d = l - c
        return Math.abs(d) <= reach ? d : 0
    }
    const dx = cx.length == 0 ? 0 : best(cx, xs)
    const dy = cy.length == 0 ? 0 : best(cy, ys)
    const near = (cands: number[], lines: number[], off: number) =>
        lines.filter((l) => cands.some((c) => Math.abs(c + off - l) < 0.5)).filter((l, i, a) => a.indexOf(l) == i)
    return { dx: dx, dy: dy, gx: cx.length == 0 ? [] : near(cx, xs, dx), gy: cy.length == 0 ? [] : near(cy, ys, dy) }
}

// ── arranging ───────────────────────────────────────────────────────────────

// Align these items by an edge or centre of the box they span together.
export function aligned(items: Item[], how: string): Item[] {
    const all = boundsOf(items)
    return items.map((it) => {
        const b = boxOf(it)
        let dx = 0, dy = 0
        if (how == "left") dx = all.x - b.x
        else if (how == "center") dx = all.x + all.w / 2 - (b.x + b.w / 2)
        else if (how == "right") dx = all.x + all.w - (b.x + b.w)
        else if (how == "top") dy = all.y - b.y
        else if (how == "middle") dy = all.y + all.h / 2 - (b.y + b.h / 2)
        else if (how == "bottom") dy = all.y + all.h - (b.y + b.h)
        return dx == 0 && dy == 0 ? it : moved(it, dx, dy)
    })
}

// Space three or more items evenly across (x) or down (y): the outer two stay,
// the gaps between neighbours become equal.
export function distributed(items: Item[], axis: string): Item[] {
    const pos = (b: Box) => axis == "x" ? b.x : b.y
    const len = (b: Box) => axis == "x" ? b.w : b.h
    const order = items.map((it) => ({ it: it, b: boxOf(it) })).sort((p, q) => pos(p.b) - pos(q.b))
    const first = order[0].b, last = order[order.length - 1].b
    const span = pos(last) + len(last) - pos(first)
    const total = order.reduce((n, p) => n + len(p.b), 0)
    const gap = (span - total) / (order.length - 1)
    let at = pos(first)
    const out = new Map<string, Item>()
    for (const p of order) {
        const d = at - pos(p.b)
        out.set(p.it.id, Math.abs(d) < 0.01 ? p.it : axis == "x" ? moved(p.it, d, 0) : moved(p.it, 0, d))
        at = at + len(p.b) + gap
    }
    return items.map((it) => out.get(it.id)!)
}

// Restack the selected among their siblings: "forward" and "backward" one
// step past the next overlapping-or-not neighbour, "front" and "back" all the way.
export function restacked(list: Item[], ids: string[], how: string): Item[] {
    const sel = list.filter((it) => ids.includes(it.id))
    if (sel.length == 0) return list
    if (how == "front") return [...list.filter((it) => !ids.includes(it.id)), ...sel]
    if (how == "back") return [...sel, ...list.filter((it) => !ids.includes(it.id))]
    const out = list.slice()
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

// Apply `fn` to the list `id` lives in (top level or its group's children).
export function withSiblings(items: Item[], id: string, fn: (list: Item[]) => Item[]): Item[] {
    const p = parentOf(items, id)
    if (p == null) return fn(items)
    return mapTree(items, (it) => it.id == p.id ? { ...it, children: fn(kids(it)) } : null)
}

// Group the selected top-level items in place of the topmost of them.
export function grouped(items: Item[], ids: string[], gid: string): Item[] {
    const sel = items.filter((it) => ids.includes(it.id))
    if (sel.length < 2) return items
    const at = Math.max(...sel.map((it) => items.indexOf(it)))
    const out: Item[] = []
    items.forEach((it, i) => {
        if (i == at) out.push({ id: gid, kind: "group", children: sel })
        else if (!ids.includes(it.id)) out.push(it)
    })
    return out
}

// Put each selected group's children back where the group stood.
export function ungrouped(items: Item[], ids: string[]): Item[] {
    const out: Item[] = []
    for (const it of items) {
        if (it.kind == "group" && ids.includes(it.id)) out.push(...kids(it))
        else out.push(it)
    }
    return out
}

// ── style across a selection ────────────────────────────────────────────────

// Each leaf a style applies to: a group stands for its parts.
export function leaves(items: Item[]): Item[] {
    const out: Item[] = []
    for (const it of items) {
        if (it.kind == "group") out.push(...leaves(kids(it)))
        else out.push(it)
    }
    return out
}

// The one value every item shares, or `undefined` when they differ ("mixed").
export function common<T>(vals: T[]): T | undefined {
    if (vals.length == 0) return undefined
    const k = JSON.stringify(vals[0])
    return vals.every((v) => JSON.stringify(v) == k) ? vals[0] : undefined
}

// ── colour ──────────────────────────────────────────────────────────────────

// "#RRGGBB" or "#RRGGBBAA", split for `colorWithAlpha` (see `hue` in
// presentify-model.declare): the 0xRRGGBB part and the alpha byte.
export function rgbOf(hex: string): number {
    const n = parseInt(hex.replace("#", "").slice(0, 6), 16)
    return isNaN(n) ? 0 : n
}
export function alphaOf(hex: string): number {
    const h = hex.replace("#", "")
    if (h.length < 8) return 255
    const a = parseInt(h.slice(6, 8), 16)
    return isNaN(a) ? 255 : a
}

// What a person typed into a colour field, tidied to "#RRGGBB(AA)", or "" if
// it is not a colour.
export function tidyHex(s: string): string {
    let h = s.trim().replace(/^#/, "").toUpperCase()
    if (/^[0-9A-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("")
    return /^[0-9A-F]{6}([0-9A-F]{2})?$/.test(h) ? "#" + h : ""
}

// Is this colour light enough that dark ink reads on it?
export function isLight(hex: string | null | undefined): boolean {
    if (hex == null || hex == "") return true
    const n = parseInt(hex.replace("#", "").slice(0, 6), 16)
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    return 0.299 * r + 0.587 * g + 0.114 * b > 150
}

// ── words ───────────────────────────────────────────────────────────────────

export function edited(iso: string, nowMs: number): string {
    const t = Date.parse(iso)
    if (isNaN(t)) return ""
    const s = Math.max(0, Math.round((nowMs - t) / 1000))
    if (s < 45) return "Edited just now"
    const m = Math.round(s / 60)
    if (m < 60) return "Edited " + m + (m == 1 ? " minute ago" : " minutes ago")
    const h = Math.round(m / 60)
    if (h < 24) return "Edited " + h + (h == 1 ? " hour ago" : " hours ago")
    const d = new Date(t)
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const sameYear = d.getFullYear() == new Date(nowMs).getFullYear()
    return "Edited " + months[d.getMonth()] + " " + d.getDate() + (sameYear ? "" : ", " + d.getFullYear())
}

export function kindName(it: Item): string {
    if (it.kind == "rect") return "Rectangle"
    if (it.kind == "ellipse") return "Ellipse"
    if (it.kind == "line") return "Line"
    if (it.kind == "text") return "Text"
    return "Group"
}
