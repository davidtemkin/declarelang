// Presentify — the geometry of the things on a slide.
//
// Plain functions of their arguments: an element tree in, a new element tree
// (or a number, or a box) out. Nothing here holds state or reaches the
// program; the Doc dataset (model.declare) calls these and writes what they
// return. Every element is in the service's format (task/api/API.md), and
// every function returns elements still in that format — no field is added
// that the service would refuse.

export type ShOutline = { color: string, width: number }
export type ShText = { content: string, font: string, size: number, weight: number,
    italic: boolean, color: string, align: string }
export type Sh = {
    id: string, kind: string,
    x?: number | null, y?: number | null, width?: number | null, height?: number | null,
    x1?: number | null, y1?: number | null, x2?: number | null, y2?: number | null,
    fill?: string | null, stroke?: ShOutline | null, cornerRadius?: number | null,
    keepProportions?: boolean | null, text?: ShText | null, children?: Sh[] | null
}
export type ShBox = { x: number, y: number, w: number, h: number }

export const SLIDE_W = 1280
export const SLIDE_H = 720

// ── identity ───────────────────────────────────────────────────────────────

let idSeq = 0
export function freshId(): string {
    idSeq = idSeq + 1
    return "p" + Date.now().toString(36) + idSeq.toString(36) + Math.floor(Math.random() * 1296).toString(36)
}

/** A deep copy with every id (groups' children included) new. */
export function withNewIds(e: Sh): Sh {
    const c: Sh = { ...e, id: freshId() }
    if (e.children) c.children = e.children.map(withNewIds)
    return c
}

// ── walking the tree ───────────────────────────────────────────────────────

export function find(els: Sh[], id: string): Sh | null {
    for (const e of els) {
        if (e.id == id) return e
        if (e.children) { const f = find(e.children, id); if (f) return f }
    }
    return null
}

/** The ids from the top level down to `id`: [top, …, id], or [] if absent. */
export function pathTo(els: Sh[], id: string): string[] {
    for (const e of els) {
        if (e.id == id) return [e.id]
        if (e.children) { const p = pathTo(e.children, id); if (p.length) return [e.id, ...p] }
    }
    return []
}

/** The group that holds `id`, or null when it is at the top level. */
export function parentOf(els: Sh[], id: string): Sh | null {
    const p = pathTo(els, id)
    return p.length > 1 ? find(els, p[p.length - 2]) : null
}

/** Every element, groups included, depth first. */
export function all(els: Sh[]): Sh[] {
    const out: Sh[] = []
    for (const e of els) { out.push(e); if (e.children) out.push(...all(e.children)) }
    return out
}

/** The drawn things — no groups — back to front. */
export function leaves(els: Sh[]): Sh[] {
    const out: Sh[] = []
    for (const e of els) { if (e.children) out.push(...leaves(e.children)); else out.push(e) }
    return out
}

/** `fn` applied to each element whose id is in `ids`, wherever it sits. */
export function mapIds(els: Sh[], ids: string[], fn: (e: Sh) => Sh): Sh[] {
    return els.map((e) => {
        if (ids.includes(e.id)) return fn(e)
        if (e.children) return { ...e, children: mapIds(e.children, ids, fn) }
        return e
    })
}

/** `fn` applied to every drawn thing under (or at) the elements in `ids`. */
export function mapLeavesOf(els: Sh[], ids: string[], fn: (e: Sh) => Sh): Sh[] {
    return mapIds(els, ids, (e) => mapAllLeaves(e, fn))
}
function mapAllLeaves(e: Sh, fn: (e: Sh) => Sh): Sh {
    return e.children ? { ...e, children: e.children.map((c) => mapAllLeaves(c, fn)) } : fn(e)
}

/** The tree without the elements in `ids`; a group left with fewer than two is dissolved. */
export function removeIds(els: Sh[], ids: string[]): Sh[] {
    const out: Sh[] = []
    for (const e of els) {
        if (ids.includes(e.id)) continue
        if (e.children) {
            const kids = removeIds(e.children, ids)
            if (kids.length >= 2) out.push({ ...e, children: kids })
            else out.push(...kids)
        } else out.push(e)
    }
    return out
}

/** Drop ids that sit inside another selected element (selecting a group covers its parts). */
export function outermost(els: Sh[], ids: string[]): string[] {
    return ids.filter((id) => !pathTo(els, id).slice(0, -1).some((a) => ids.includes(a)))
}

// ── boxes ─────────────────────────────────────────────────────────────────

export function extent(e: Sh): ShBox {
    if (e.kind == "group") return union((e.children ?? []).map(extent))
    if (e.kind == "line") {
        const x = Math.min(e.x1 ?? 0, e.x2 ?? 0), y = Math.min(e.y1 ?? 0, e.y2 ?? 0)
        return { x, y, w: Math.abs((e.x2 ?? 0) - (e.x1 ?? 0)), h: Math.abs((e.y2 ?? 0) - (e.y1 ?? 0)) }
    }
    return { x: e.x ?? 0, y: e.y ?? 0, w: e.width ?? 0, h: e.height ?? 0 }
}

export function union(bs: ShBox[]): ShBox {
    if (bs.length == 0) return { x: 0, y: 0, w: 0, h: 0 }
    const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y))
    const x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h))
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function boundsOf(els: Sh[], ids: string[]): ShBox {
    return union(ids.map((id) => find(els, id)).filter((e): e is Sh => e != null).map(extent))
}

export function touches(a: ShBox, b: ShBox): boolean {
    return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

// ── changing geometry ─────────────────────────────────────────────────────

const r2 = (v: number): number => Math.round(v * 100) / 100

export function translate(e: Sh, dx: number, dy: number): Sh {
    if (e.kind == "group") return { ...e, children: (e.children ?? []).map((c) => translate(c, dx, dy)) }
    if (e.kind == "line") return { ...e, x1: r2((e.x1 ?? 0) + dx), y1: r2((e.y1 ?? 0) + dy), x2: r2((e.x2 ?? 0) + dx), y2: r2((e.y2 ?? 0) + dy) }
    return { ...e, x: r2((e.x ?? 0) + dx), y: r2((e.y ?? 0) + dy) }
}

/**
 * Maps an element from one box to another: what a resize does to each thing
 * it holds. Positions and sizes scale; a corner radius does not (it is a
 * length, not a proportion), and neither does a stroke or a font. A text
 * box takes its new width and keeps its own height, which its text decides.
 */
export function remap(e: Sh, from: ShBox, to: ShBox): Sh {
    const sx = from.w == 0 ? 1 : to.w / from.w, sy = from.h == 0 ? 1 : to.h / from.h
    const mx = (v: number): number => r2(to.x + (v - from.x) * sx)
    const my = (v: number): number => r2(to.y + (v - from.y) * sy)
    if (e.kind == "group") return { ...e, children: (e.children ?? []).map((c) => remap(c, from, to)) }
    if (e.kind == "line") return { ...e, x1: mx(e.x1 ?? 0), y1: my(e.y1 ?? 0), x2: mx(e.x2 ?? 0), y2: my(e.y2 ?? 0) }
    const x = mx(e.x ?? 0), w = Math.max(1, r2((e.width ?? 0) * sx))
    if (e.kind == "text") return { ...e, x, y: my(e.y ?? 0), width: w }
    return { ...e, x, y: my(e.y ?? 0), width: w, height: Math.max(1, r2((e.height ?? 0) * sy)) }
}

/**
 * The box a resize handle makes. `handle` names the edges it moves
 * ("l", "r", "t", "b" and the corners "lt", "rb", …); `lock` keeps the
 * starting box's proportions.
 */
export function resizeBox(b: ShBox, handle: string, dx: number, dy: number, lock: boolean, min: number): ShBox {
    const L = handle.includes("l"), R = handle.includes("r"), T = handle.includes("t"), B = handle.includes("b")
    let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h
    if (L) x0 = Math.min(x1 - min, x0 + dx)
    if (R) x1 = Math.max(x0 + min, x1 + dx)
    if (T) y0 = Math.min(y1 - min, y0 + dy)
    if (B) y1 = Math.max(y0 + min, y1 + dy)
    let w = x1 - x0, h = y1 - y0
    if (lock && b.w > 0 && b.h > 0) {
        const ratio = b.w / b.h
        const horiz = L || R, vert = T || B
        if (horiz && vert) { if (w / b.w > h / b.h) h = w / ratio; else w = h * ratio }
        else if (horiz) h = w / ratio
        else w = h * ratio
        // anchor the edge opposite the handle; an edge handle grows about its middle
        x0 = L ? x1 - w : (horiz ? x0 : b.x + (b.w - w) / 2)
        y0 = T ? y1 - h : (vert ? y0 : b.y + (b.h - h) / 2)
    }
    return { x: r2(x0), y: r2(y0), w: r2(w), h: r2(h) }
}

// ── hit testing ───────────────────────────────────────────────────────────

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy
    const t = len == 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len))
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function hitsLeaf(e: Sh, px: number, py: number, slop: number): boolean {
    if (e.kind == "line") return distToSegment(px, py, e.x1 ?? 0, e.y1 ?? 0, e.x2 ?? 0, e.y2 ?? 0) <= Math.max(slop, (e.stroke?.width ?? 1) / 2 + slop / 2)
    const b = extent(e)
    if (e.kind == "ellipse") {
        const rx = b.w / 2 + slop / 2, ry = b.h / 2 + slop / 2
        const nx = (px - (b.x + b.w / 2)) / rx, ny = (py - (b.y + b.h / 2)) / ry
        return nx * nx + ny * ny <= 1
    }
    return px >= b.x - slop / 2 && px <= b.x + b.w + slop / 2 && py >= b.y - slop / 2 && py <= b.y + b.h + slop / 2
}

/** The path [top, …, leaf] of the frontmost thing under a point, or []. */
export function hitPath(els: Sh[], px: number, py: number, slop: number): string[] {
    for (let i = els.length - 1; i >= 0; i--) {
        const e = els[i]
        if (e.children) { const p = hitPath(e.children, px, py, slop); if (p.length) return [e.id, ...p] }
        else if (hitsLeaf(e, px, py, slop)) return [e.id]
    }
    return []
}

// ── structure: grouping and stacking ──────────────────────────────────────

/** The array (top level or a group's children) that holds `id`, as a path of group ids. */
function siblingsOf(els: Sh[], id: string): Sh[] {
    const p = parentOf(els, id)
    return p ? (p.children ?? []) : els
}

function replaceChildren(els: Sh[], groupId: string | null, kids: Sh[]): Sh[] {
    if (groupId == null) return kids
    return mapIds(els, [groupId], (g) => ({ ...g, children: kids }))
}

/** Groups `ids` (siblings in one array) into a new group placed where the frontmost was. */
export function groupEls(els: Sh[], ids: string[], newId: string): Sh[] {
    if (ids.length < 2) return els
    const holder = parentOf(els, ids[0])
    const sibs = siblingsOf(els, ids[0])
    if (!ids.every((id) => sibs.some((s) => s.id == id))) return els
    const members = sibs.filter((s) => ids.includes(s.id))
    const at = Math.max(...ids.map((id) => sibs.findIndex((s) => s.id == id)))
    const kids: Sh[] = []
    sibs.forEach((s, i) => {
        if (i == at) kids.push({ id: newId, kind: "group", children: members })
        else if (!ids.includes(s.id)) kids.push(s)
    })
    return replaceChildren(els, holder ? holder.id : null, kids)
}

/** Replaces each group in `ids` by its children, in place. */
export function ungroupEls(els: Sh[], ids: string[]): Sh[] {
    const flat = (list: Sh[]): Sh[] => list.flatMap((e) =>
        ids.includes(e.id) && e.children ? e.children : [e.children ? { ...e, children: flat(e.children) } : e])
    return flat(els)
}

/** Moves the elements in `ids` within their own arrays: "forward" | "backward" | "front" | "back". */
export function restackEls(els: Sh[], ids: string[], how: string): Sh[] {
    const apply = (list: Sh[]): Sh[] => {
        let arr = list.map((e) => e.children ? { ...e, children: apply(e.children) } : e)
        const mine = arr.filter((e) => ids.includes(e.id))
        if (mine.length == 0) return arr
        if (how == "front") return [...arr.filter((e) => !ids.includes(e.id)), ...mine]
        if (how == "back") return [...mine, ...arr.filter((e) => !ids.includes(e.id))]
        arr = [...arr]
        if (how == "forward") {
            for (let i = arr.length - 2; i >= 0; i--)
                if (ids.includes(arr[i].id) && !ids.includes(arr[i + 1].id)) { const t = arr[i]; arr[i] = arr[i + 1]; arr[i + 1] = t }
        } else {
            for (let i = 1; i < arr.length; i++)
                if (ids.includes(arr[i].id) && !ids.includes(arr[i - 1].id)) { const t = arr[i]; arr[i] = arr[i - 1]; arr[i - 1] = t }
        }
        return arr
    }
    return apply(els)
}

// ── aligning and distributing ─────────────────────────────────────────────

export function alignEls(els: Sh[], ids: string[], how: string): Sh[] {
    const all = boundsOf(els, ids)
    let out = els
    for (const id of ids) {
        const e = find(out, id)
        if (!e) continue
        const b = extent(e)
        let dx = 0, dy = 0
        if (how == "left") dx = all.x - b.x
        else if (how == "center") dx = all.x + all.w / 2 - (b.x + b.w / 2)
        else if (how == "right") dx = all.x + all.w - (b.x + b.w)
        else if (how == "top") dy = all.y - b.y
        else if (how == "middle") dy = all.y + all.h / 2 - (b.y + b.h / 2)
        else if (how == "bottom") dy = all.y + all.h - (b.y + b.h)
        out = mapIds(out, [id], (x) => translate(x, dx, dy))
    }
    return out
}

/** Equal gaps between three or more, across ("x") or down ("y"); the outer two stay. */
export function distributeEls(els: Sh[], ids: string[], axis: string): Sh[] {
    if (ids.length < 3) return els
    const items = ids.map((id) => ({ id, b: extent(find(els, id) as Sh) }))
    const pos = (b: ShBox): number => axis == "x" ? b.x : b.y
    const size = (b: ShBox): number => axis == "x" ? b.w : b.h
    items.sort((a, b) => pos(a.b) - pos(b.b))
    const first = items[0].b, last = items[items.length - 1].b
    const span = pos(last) + size(last) - pos(first)
    const gap = (span - items.reduce((n, i) => n + size(i.b), 0)) / (items.length - 1)
    let at = pos(first)
    let out = els
    for (const it of items) {
        const d = at - pos(it.b)
        out = mapIds(out, [it.id], (x) => axis == "x" ? translate(x, d, 0) : translate(x, 0, d))
        at = at + size(it.b) + gap
    }
    return out
}

// ── snapping ──────────────────────────────────────────────────────────────

export type ShGuide = { axis: string, at: number, from: number, to: number }
export type Snap = { dx: number, dy: number, guides: ShGuide[] }

/**
 * Where a moving box should settle: within `reach` of an edge or centre of
 * the slide or of another element, it snaps there. Returns the correction and
 * the guides to draw while it holds.
 */
export function snapBox(b: ShBox, others: ShBox[], reach: number, edgesX: string, edgesY: string): Snap {
    const tx: Array<{ at: number, b: ShBox | null }> = [{ at: 0, b: null }, { at: SLIDE_W / 2, b: null }, { at: SLIDE_W, b: null }]
    const ty: Array<{ at: number, b: ShBox | null }> = [{ at: 0, b: null }, { at: SLIDE_H / 2, b: null }, { at: SLIDE_H, b: null }]
    for (const o of others) {
        tx.push({ at: o.x, b: o }, { at: o.x + o.w / 2, b: o }, { at: o.x + o.w, b: o })
        ty.push({ at: o.y, b: o }, { at: o.y + o.h / 2, b: o }, { at: o.y + o.h, b: o })
    }
    const mineX: number[] = [], mineY: number[] = []
    if (edgesX.includes("l")) mineX.push(b.x)
    if (edgesX.includes("c")) mineX.push(b.x + b.w / 2)
    if (edgesX.includes("r")) mineX.push(b.x + b.w)
    if (edgesY.includes("t")) mineY.push(b.y)
    if (edgesY.includes("c")) mineY.push(b.y + b.h / 2)
    if (edgesY.includes("b")) mineY.push(b.y + b.h)
    const best = (mine: number[], ts: Array<{ at: number, b: ShBox | null }>): { d: number, at: number } | null => {
        let pick: { d: number, at: number } | null = null
        for (const m of mine) for (const t of ts) {
            const d = t.at - m
            if (Math.abs(d) <= reach && (pick == null || Math.abs(d) < Math.abs(pick.d))) pick = { d, at: t.at }
        }
        return pick
    }
    const sx = best(mineX, tx), sy = best(mineY, ty)
    const dx = sx ? sx.d : 0, dy = sy ? sy.d : 0
    const nb = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }
    const guides: ShGuide[] = []
    if (sx) {
        const hits = tx.filter((t) => Math.abs(t.at - sx.at) < 0.01)
        const ys = [nb.y, nb.y + nb.h, ...hits.flatMap((t) => t.b ? [t.b.y, t.b.y + t.b.h] : [0, SLIDE_H])]
        guides.push({ axis: "x", at: sx.at, from: Math.min(...ys), to: Math.max(...ys) })
    }
    if (sy) {
        const hits = ty.filter((t) => Math.abs(t.at - sy.at) < 0.01)
        const xs = [nb.x, nb.x + nb.w, ...hits.flatMap((t) => t.b ? [t.b.x, t.b.x + t.b.w] : [0, SLIDE_W])]
        guides.push({ axis: "y", at: sy.at, from: Math.min(...xs), to: Math.max(...xs) })
    }
    return { dx, dy, guides }
}

// ── colour ────────────────────────────────────────────────────────────────

/** "#RRGGBB" or "#RRGGBBAA" → [rgb as a number, alpha 0–255]. */
export function parseHex(hex: string): [number, number] {
    const h = hex.replace("#", "")
    const rgb = parseInt(h.slice(0, 6), 16)
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255
    return [isNaN(rgb) ? 0 : rgb, isNaN(a) ? 255 : a]
}

/** Accepts what a person types — "f80", "#FF8800", "ff8800cc" — or null when it isn't a colour. */
export function normalizeHex(s: string): string | null {
    let h = s.trim().replace(/^#/, "").toUpperCase()
    if (/^[0-9A-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("")
    if (/^[0-9A-F]{6}$/.test(h) || /^[0-9A-F]{8}$/.test(h)) return "#" + (h.endsWith("FF") && h.length == 8 ? h.slice(0, 6) : h)
    return null
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
    const [rgb] = parseHex(hex)
    const ch = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255].map((v) => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

// ── time ──────────────────────────────────────────────────────────────────

/** "Just now", "12 minutes ago", "Yesterday", "3 Nov" — from an ISO time and now (ms). */
export function since(iso: string, now: number): string {
    const t = Date.parse(iso)
    if (isNaN(t)) return ""
    const s = Math.max(0, (now - t) / 1000)
    if (s < 60) return "Just now"
    if (s < 3600) { const m = Math.floor(s / 60); return m + (m == 1 ? " minute ago" : " minutes ago") }
    if (s < 86400) { const h = Math.floor(s / 3600); return h + (h == 1 ? " hour ago" : " hours ago") }
    if (s < 172800) return "Yesterday"
    const d = new Date(t)
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return d.getDate() + " " + months[d.getMonth()] + (d.getFullYear() == new Date(now).getFullYear() ? "" : " " + d.getFullYear())
}
