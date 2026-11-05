// Presentify's geometry: pure functions over slide elements.
//
// Everything here takes plain records and returns new ones; nothing is kept
// between calls and nothing is mutated, so the Document dataset can replace a
// slide's element list wholesale and the undo history can hold old lists as
// they were. The element shape is the service's (`El`, declared in
// model.declare); a box is `{ x, y, w, h }` in slide points.

export interface Box { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }
export interface Snapped { dx: number; dy: number; gx: number[]; gy: number[] }

export const SLIDE_W = 1280
export const SLIDE_H = 720

// ── Boxes ──────────────────────────────────────────────────────────────────

export function boxOf(e: El): Box {
    if (e.kind == "group") return unionOf((e.children ?? []).map(boxOf))
    if (e.kind == "line") {
        const x1 = e.x1 ?? 0, y1 = e.y1 ?? 0, x2 = e.x2 ?? 0, y2 = e.y2 ?? 0
        return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
    }
    return { x: e.x ?? 0, y: e.y ?? 0, w: e.width ?? 0, h: e.height ?? 0 }
}

export function unionOf(bs: Box[]): Box {
    if (bs.length == 0) return { x: 0, y: 0, w: 0, h: 0 }
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
    for (const k of bs) { l = Math.min(l, k.x); t = Math.min(t, k.y); r = Math.max(r, k.x + k.w); b = Math.max(b, k.y + k.h) }
    return { x: l, y: t, w: r - l, h: b - t }
}

export function boxOfIds(els: El[], ids: string[]): Box {
    return unionOf(ids.map((id) => findEl(els, id)).filter((e) => e != null).map((e) => boxOf(e as El)))
}

export function boxesTouch(a: Box, b: Box): boolean {
    return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

export function normBox(x1: number, y1: number, x2: number, y2: number): Box {
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
}

// ── The tree ───────────────────────────────────────────────────────────────

// Leaves in paint order, back to front: what a slide draws.
export function flatten(els: El[]): El[] {
    const out: El[] = []
    const walk = (list: El[]) => { for (const e of list) { if (e.kind == "group") walk(e.children ?? []); else out.push(e) } }
    walk(els)
    return out
}

export function findEl(els: El[], id: string): El | null {
    for (const e of els) {
        if (e.id == id) return e
        if (e.kind == "group") { const f = findEl(e.children ?? [], id); if (f != null) return f }
    }
    return null
}

// The ids from the top level down to `id`, inclusive; [] when absent.
export function pathTo(els: El[], id: string): string[] {
    for (const e of els) {
        if (e.id == id) return [e.id]
        if (e.kind == "group") { const p = pathTo(e.children ?? [], id); if (p.length > 0) return [e.id, ...p] }
    }
    return []
}

// The list `id` sits in (the slide's own, or a group's children).
export function siblingsOf(els: El[], id: string): El[] {
    if (els.some((e) => e.id == id)) return els
    for (const e of els) if (e.kind == "group") { const s = siblingsOf(e.children ?? [], id); if (s.length > 0) return s }
    return []
}

export function allIds(els: El[]): string[] {
    const out: string[] = []
    const walk = (list: El[]) => { for (const e of list) { out.push(e.id); if (e.kind == "group") walk(e.children ?? []) } }
    walk(els)
    return out
}

// Replace every element whose id is in `ids` by fn(it), at any depth.
export function mapEls(els: El[], ids: string[], fn: (e: El) => El): El[] {
    return els.map((e) => {
        if (ids.includes(e.id)) return fn(e)
        if (e.kind == "group") return { ...e, children: mapEls(e.children ?? [], ids, fn) }
        return e
    })
}

// Remove the elements, at any depth; a group left with fewer than two
// children dissolves into what is left of it.
export function removeEls(els: El[], ids: string[]): El[] {
    const out: El[] = []
    for (const e of els) {
        if (ids.includes(e.id)) continue
        if (e.kind == "group") {
            const kids = removeEls(e.children ?? [], ids)
            if (kids.length >= 2) out.push({ ...e, children: kids })
            else out.push(...kids)
        } else out.push(e)
    }
    return out
}

// ── Ids ────────────────────────────────────────────────────────────────────

let counter = 0
export function freshId(taken: string[]): string {
    let id = ""
    do { counter = counter + 1; id = "e" + Math.floor(Date.now()).toString(36) + counter.toString(36) } while (taken.includes(id))
    return id
}

// A copy with new ids throughout, none of them in `taken` (which it extends).
export function reId(e: El, taken: string[]): El {
    const id = freshId(taken)
    taken.push(id)
    if (e.kind == "group") return { ...e, id: id, children: (e.children ?? []).map((c) => reId(c, taken)) }
    return { ...e, id: id }
}

// ── Moving and resizing ────────────────────────────────────────────────────

export function translate(e: El, dx: number, dy: number): El {
    if (e.kind == "group") return { ...e, children: (e.children ?? []).map((c) => translate(c, dx, dy)) }
    if (e.kind == "line") return { ...e, x1: (e.x1 ?? 0) + dx, y1: (e.y1 ?? 0) + dy, x2: (e.x2 ?? 0) + dx, y2: (e.y2 ?? 0) + dy }
    return { ...e, x: (e.x ?? 0) + dx, y: (e.y ?? 0) + dy }
}

// Map an element from one box to another, linearly. A corner radius is a
// length, so it stays; a text's size stays and its height follows its words.
export function remap(e: El, from: Box, to: Box): El {
    const sx = from.w == 0 ? 1 : to.w / from.w
    const sy = from.h == 0 ? 1 : to.h / from.h
    const mx = (v: number) => to.x + (v - from.x) * sx
    const my = (v: number) => to.y + (v - from.y) * sy
    if (e.kind == "group") return { ...e, children: (e.children ?? []).map((c) => remap(c, from, to)) }
    if (e.kind == "line") return { ...e, x1: mx(e.x1 ?? 0), y1: my(e.y1 ?? 0), x2: mx(e.x2 ?? 0), y2: my(e.y2 ?? 0) }
    const x = mx(e.x ?? 0), y = my(e.y ?? 0)
    const w = Math.max(1, (e.width ?? 0) * sx)
    if (e.kind == "text") return { ...e, x: x, y: y, width: w }
    return { ...e, x: x, y: y, width: w, height: Math.max(1, (e.height ?? 0) * sy) }
}

// The box a handle drag makes. `handle` names the edges it moves: n, s, e,
// w or a corner (ne, nw, se, sw). With `keep` the width-to-height ratio
// holds; a side handle then grows the other axis about the middle.
export function resizeBox(b: Box, handle: string, dx: number, dy: number, keep: boolean): Box {
    let l = b.x, t = b.y, r = b.x + b.w, bt = b.y + b.h
    const hw = handle.includes("w"), he = handle.includes("e"), hn = handle.includes("n"), hs = handle.includes("s")
    if (hw) l = l + dx
    if (he) r = r + dx
    if (hn) t = t + dy
    if (hs) bt = bt + dy
    let nb = normBox(l, t, r, bt)
    if (!keep || b.w == 0 || b.h == 0) return nb
    const ratio = b.w / b.h
    const corner = (hw || he) && (hn || hs)
    if (corner) {
        const s = Math.max(nb.w / b.w, nb.h / b.h)
        const w = b.w * s, h = b.h * s
        const ax = hw ? b.x + b.w : b.x          // the corner that stays put
        const ay = hn ? b.y + b.h : b.y
        const fx = (hw ? l < ax : r < ax) != hw  // flipped across the anchor?
        const fy = (hn ? t < ay : bt < ay) != hn
        const goLeft = hw != fx, goUp = hn != fy
        return { x: goLeft ? ax - w : ax, y: goUp ? ay - h : ay, w: w, h: h }
    }
    if (hw || he) {
        const h = nb.w / ratio
        return { x: nb.x, y: b.y + b.h / 2 - h / 2, w: nb.w, h: h }
    }
    const w = nb.h * ratio
    return { x: b.x + b.w / 2 - w / 2, y: nb.y, w: w, h: nb.h }
}

// Shift-drawing: the dragged box made square, from the press point.
export function squareFrom(x0: number, y0: number, x1: number, y1: number): Box {
    const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    return normBox(x0, y0, x0 + Math.sign(x1 - x0 || 1) * s, y0 + Math.sign(y1 - y0 || 1) * s)
}

// A line's free end, held to the nearest 45° when `snap`.
export function lineEnd(x0: number, y0: number, x1: number, y1: number, snap: boolean): Pt {
    if (!snap) return { x: x1, y: y1 }
    const dx = x1 - x0, dy = y1 - y0
    const len = Math.hypot(dx, dy)
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    return { x: x0 + Math.cos(a) * len, y: y0 + Math.sin(a) * len }
}

// ── Hit testing ────────────────────────────────────────────────────────────

function segDist(p: Pt, a: Pt, b: Pt): number {
    const vx = b.x - a.x, vy = b.y - a.y
    const len2 = vx * vx + vy * vy
    const t = len2 == 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2))
    return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy))
}

export function hitsLeaf(e: El, p: Pt, tol: number): boolean {
    if (e.kind == "line") {
        const reach = Math.max(tol, (e.stroke?.width ?? 1) / 2 + tol / 2)
        return segDist(p, { x: e.x1 ?? 0, y: e.y1 ?? 0 }, { x: e.x2 ?? 0, y: e.y2 ?? 0 }) <= reach
    }
    const b = boxOf(e)
    if (e.kind == "ellipse") {
        const rx = b.w / 2 + tol / 2, ry = b.h / 2 + tol / 2
        const nx = (p.x - (b.x + b.w / 2)) / Math.max(rx, 0.5), ny = (p.y - (b.y + b.h / 2)) / Math.max(ry, 0.5)
        return nx * nx + ny * ny <= 1
    }
    return p.x >= b.x - tol / 2 && p.x <= b.x + b.w + tol / 2 && p.y >= b.y - tol / 2 && p.y <= b.y + b.h + tol / 2
}

// The front-most leaf under the point, or null.
export function hitLeaf(els: El[], p: Pt, tol: number): El | null {
    const leaves = flatten(els)
    for (let i = leaves.length - 1; i >= 0; i--) if (hitsLeaf(leaves[i], p, tol)) return leaves[i]
    return null
}

// What a press selects: the leaf's ancestor that sits directly inside
// `scope` (a group the person has entered by double-clicking), else its
// top-level ancestor.
export function pickTarget(els: El[], leafId: string, scope: string): string {
    const path = pathTo(els, leafId)
    if (path.length == 0) return ""
    const at = scope == "" ? -1 : path.indexOf(scope)
    return at >= 0 && at + 1 < path.length ? path[at + 1] : path[0]
}

// One level deeper than `current` along the leaf's path (a double-click).
export function pickDeeper(els: El[], leafId: string, current: string): string {
    const path = pathTo(els, leafId)
    const at = path.indexOf(current)
    return at >= 0 && at + 1 < path.length ? path[at + 1] : current
}

// The top-level elements a marquee touches.
export function inMarquee(els: El[], m: Box): string[] {
    return els.filter((e) => e.kind == "group"
        ? flatten([e]).some((c) => leafTouches(c, m))
        : leafTouches(e, m)).map((e) => e.id)
}

function leafTouches(e: El, m: Box): boolean {
    if (e.kind != "line") return boxesTouch(boxOf(e), m)
    // A line touches the box if either end is inside, or it crosses an edge.
    const a = { x: e.x1 ?? 0, y: e.y1 ?? 0 }, b = { x: e.x2 ?? 0, y: e.y2 ?? 0 }
    const inside = (p: Pt) => p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h
    if (inside(a) || inside(b)) return true
    const c = [{ x: m.x, y: m.y }, { x: m.x + m.w, y: m.y }, { x: m.x + m.w, y: m.y + m.h }, { x: m.x, y: m.y + m.h }]
    for (let i = 0; i < 4; i++) if (crosses(a, b, c[i], c[(i + 1) % 4])) return true
    return false
}

function crosses(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
    const d = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4)
    return ((d1 > 0) != (d2 > 0)) && ((d3 > 0) != (d4 > 0))
}

// ── Snapping ───────────────────────────────────────────────────────────────

// The edges and middles a moving box can snap to: the slide's, and every
// element's not being moved.
export function snapTargets(els: El[], moving: string[]): number[][] {
    const xs = [0, SLIDE_W / 2, SLIDE_W], ys = [0, SLIDE_H / 2, SLIDE_H]
    for (const e of els) {
        if (moving.includes(e.id)) continue
        const b = boxOf(e)
        xs.push(b.x, b.x + b.w / 2, b.x + b.w)
        ys.push(b.y, b.y + b.h / 2, b.y + b.h)
    }
    return [xs, ys]
}

function nearest(values: number[], targets: number[], tol: number): number[] {
    let best = tol + 1, delta = 0, at = NaN
    for (const v of values) for (const t of targets) {
        const d = Math.abs(t - v)
        if (d < best) { best = d; delta = t - v; at = t }
    }
    return best <= tol ? [delta, at] : [0, NaN]
}

// Snap a box moved by (dx, dy): its edges and middle to the nearest targets.
export function snapMove(b: Box, dx: number, dy: number, targets: number[][], tol: number): Snapped {
    const x = b.x + dx, y = b.y + dy
    const sx = nearest([x, x + b.w / 2, x + b.w], targets[0], tol)
    const sy = nearest([y, y + b.h / 2, y + b.h], targets[1], tol)
    return { dx: dx + sx[0], dy: dy + sy[0], gx: isNaN(sx[1]) ? [] : [sx[1]], gy: isNaN(sy[1]) ? [] : [sy[1]] }
}

// Snap the edges a handle moves.
export function snapResize(b: Box, handle: string, targets: number[][], tol: number): Snapped {
    const xs: number[] = [], ys: number[] = []
    if (handle.includes("w")) xs.push(b.x)
    if (handle.includes("e")) xs.push(b.x + b.w)
    if (handle.includes("n")) ys.push(b.y)
    if (handle.includes("s")) ys.push(b.y + b.h)
    const sx = nearest(xs, targets[0], tol), sy = nearest(ys, targets[1], tol)
    return { dx: sx[0], dy: sy[0], gx: isNaN(sx[1]) ? [] : [sx[1]], gy: isNaN(sy[1]) ? [] : [sy[1]] }
}

// ── Arranging ──────────────────────────────────────────────────────────────

export function alignEls(els: El[], ids: string[], how: string): El[] {
    const all = boxOfIds(els, ids)
    return mapEls(els, ids, (e) => {
        const b = boxOf(e)
        let dx = 0, dy = 0
        if (how == "left") dx = all.x - b.x
        else if (how == "center") dx = all.x + all.w / 2 - (b.x + b.w / 2)
        else if (how == "right") dx = all.x + all.w - (b.x + b.w)
        else if (how == "top") dy = all.y - b.y
        else if (how == "middle") dy = all.y + all.h / 2 - (b.y + b.h / 2)
        else if (how == "bottom") dy = all.y + all.h - (b.y + b.h)
        return translate(e, dx, dy)
    })
}

// Equal gaps between the things, the outermost two staying where they are.
export function distributeEls(els: El[], ids: string[], across: boolean): El[] {
    const items = ids.map((id) => findEl(els, id)).filter((e) => e != null).map((e) => ({ id: (e as El).id, b: boxOf(e as El) }))
    if (items.length < 3) return els
    items.sort((a, b) => across ? a.b.x - b.b.x : a.b.y - b.b.y)
    const first = items[0].b, last = items[items.length - 1].b
    const span = across ? last.x + last.w - first.x : last.y + last.h - first.y
    const used = items.reduce((n, it) => n + (across ? it.b.w : it.b.h), 0)
    const gap = (span - used) / (items.length - 1)
    const moves: Record<string, number> = {}
    let at = across ? first.x : first.y
    for (const it of items) {
        moves[it.id] = at - (across ? it.b.x : it.b.y)
        at = at + (across ? it.b.w : it.b.h) + gap
    }
    return mapEls(els, ids, (e) => across ? translate(e, moves[e.id] ?? 0, 0) : translate(e, 0, moves[e.id] ?? 0))
}

// Stacking, among siblings: forward / backward one step, front / back.
export function restack(els: El[], ids: string[], how: string): El[] {
    const apply = (list: El[]): El[] => {
        const mine = list.filter((e) => ids.includes(e.id))
        let out = list.map((e) => e.kind == "group" ? { ...e, children: apply(e.children ?? []) } : e)
        if (mine.length == 0) return out
        const picked = out.filter((e) => ids.includes(e.id))
        const rest = out.filter((e) => !ids.includes(e.id))
        if (how == "front") return [...rest, ...picked]
        if (how == "back") return [...picked, ...rest]
        out = [...out]
        if (how == "forward") {
            for (let i = out.length - 2; i >= 0; i--) if (ids.includes(out[i].id) && !ids.includes(out[i + 1].id)) { const t = out[i]; out[i] = out[i + 1]; out[i + 1] = t }
        } else {
            for (let i = 1; i < out.length; i++) if (ids.includes(out[i].id) && !ids.includes(out[i - 1].id)) { const t = out[i]; out[i] = out[i - 1]; out[i - 1] = t }
        }
        return out
    }
    return apply(els)
}

// Group siblings into one group placed where the front-most of them was.
export function groupEls(els: El[], ids: string[], groupId: string): El[] {
    const apply = (list: El[]): El[] => {
        const picked = list.filter((e) => ids.includes(e.id))
        if (picked.length >= 2) {
            const at = list.findIndex((e) => e.id == picked[picked.length - 1].id)
            const out: El[] = []
            list.forEach((e, i) => {
                if (i == at) out.push({ id: groupId, kind: "group", children: picked })
                else if (!ids.includes(e.id)) out.push(e)
            })
            return out
        }
        return list.map((e) => e.kind == "group" ? { ...e, children: apply(e.children ?? []) } : e)
    }
    return apply(els)
}

export function ungroupEls(els: El[], ids: string[]): El[] {
    const out: El[] = []
    for (const e of els) {
        if (e.kind == "group" && ids.includes(e.id)) out.push(...(e.children ?? []))
        else if (e.kind == "group") out.push({ ...e, children: ungroupEls(e.children ?? [], ids) })
        else out.push(e)
    }
    return out
}

// Can these be grouped? They must be two or more, all siblings.
export function areSiblings(els: El[], ids: string[]): boolean {
    if (ids.length < 2) return false
    const sib = siblingsOf(els, ids[0])
    return ids.every((id) => sib.some((e) => e.id == id))
}

// ── Colour ─────────────────────────────────────────────────────────────────

// A "#RRGGBB" or "#RRGGBBAA" colour's two parts: its 0xRRGGBB and its alpha
// byte, which `colorWithAlpha` turns into a view's paint.
export function rgbOf(c: string): number { return parseInt(c.replace("#", "").slice(0, 6), 16) || 0 }
export function alphaOf(c: string): number {
    const h = c.replace("#", "")
    return h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255
}

export function isLight(c: string): boolean {
    const h = c.replace("#", "")
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
    return 0.299 * r + 0.587 * g + 0.114 * b > 150
}

export function normalHex(s: string): string {
    let h = s.trim().replace(/^#/, "").toUpperCase()
    if (/^[0-9A-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("")
    return /^[0-9A-F]{6}([0-9A-F]{2})?$/.test(h) ? "#" + h : ""
}

// ── Words ──────────────────────────────────────────────────────────────────

export function ago(iso: string, now: number): string {
    const t = Date.parse(iso)
    if (isNaN(t)) return ""
    const s = Math.max(0, Math.round((now - t) / 1000))
    if (s < 45) return "Edited just now"
    const m = Math.round(s / 60)
    if (m < 60) return "Edited " + m + (m == 1 ? " minute ago" : " minutes ago")
    const h = Math.round(m / 60)
    if (h < 24) return "Edited " + h + (h == 1 ? " hour ago" : " hours ago")
    const d = new Date(t)
    const days = Math.round(h / 24)
    if (days < 7) return "Edited " + (days == 1 ? "yesterday" : days + " days ago")
    return "Edited " + d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() == new Date(now).getFullYear() ? undefined : "numeric" })
}
