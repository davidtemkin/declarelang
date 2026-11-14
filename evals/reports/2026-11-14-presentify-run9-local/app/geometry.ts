// Presentify's geometry: pure functions over the service's slide format
// (task/api/API.md). Elements are plain JSON; nothing here keeps state or
// touches a view. Every function returns new objects and never mutates its
// arguments, so a caller can hand the result straight to a dataset write.

// An element, as far as geometry cares: the program's own Element schema fits
// it, and every function hands back the same type it was given.
type El = { id: string; kind: string; children?: any[] | null; [field: string]: any }
type Box = { x: number; y: number; w: number; h: number }

const SLIDE_W = 1280
const SLIDE_H = 720

// ── colours ───────────────────────────────────────────────────────────────

// "#RRGGBB" or "#RRGGBBAA" to the runtime's colour number; null stays null.
function hexColor(s: string | null | undefined): number | null {
    if (s == null || s.length < 7) return null
    const rgb = parseInt(s.slice(1, 7), 16)
    if (s.length >= 9) return colorWithAlpha(rgb, parseInt(s.slice(7, 9), 16))
    return rgb
}

// Black or white, whichever reads on this colour (for a label on a swatch).
function inkOn(s: string | null): number {
    if (s == null) return 0x1A1722
    const v = parseInt(s.slice(1, 7), 16)
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? 0x1A1722 : 0xFFFFFF
}

// The ink a new line or text box takes on this background: dark or light.
function inkHex(bg: string | null): string { return inkOn(bg) == 0xFFFFFF ? "#FFFFFF" : "#1F2328" }

function normalHex(s: string): string | null {
    const t = s.trim().replace(/^#/, "")
    if (/^[0-9a-fA-F]{6}$/.test(t)) return "#" + t.toUpperCase()
    if (/^[0-9a-fA-F]{3}$/.test(t)) return "#" + t.split("").map((c) => c + c).join("").toUpperCase()
    if (/^[0-9a-fA-F]{8}$/.test(t)) return "#" + t.toUpperCase()
    return null
}

// ── ids ───────────────────────────────────────────────────────────────────

function newId(prefix: string): string {
    return prefix + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 7)
}

// A copy of an element with fresh ids throughout (a duplicate, a paste).
function withNewIds<T extends El>(e: T): T {
    const c: T = { ...e, id: newId("e") }
    if (e.children) c.children = e.children.map(withNewIds)
    return c
}

// ── bounds ────────────────────────────────────────────────────────────────

function boundsOf(e: El): Box {
    if (e.kind == "group") return unionOf((e.children ?? []).map(boundsOf))
    if (e.kind == "line") {
        const x = Math.min(e.x1!, e.x2!), y = Math.min(e.y1!, e.y2!)
        return { x: x, y: y, w: Math.abs(e.x2! - e.x1!), h: Math.abs(e.y2! - e.y1!) }
    }
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

function boundsOfAll(els: El[]): Box | null {
    return els.length == 0 ? null : unionOf(els.map(boundsOf))
}

function touches(a: Box, b: Box): boolean {
    return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

// ── finding ───────────────────────────────────────────────────────────────

function findEl<T extends El>(els: T[], id: string): T | null {
    for (const e of els) {
        if (e.id == id) return e
        if (e.children) { const f = findEl(e.children, id); if (f) return f }
    }
    return null
}

// The group that holds `id` directly, or null when it is at the top.
function parentOf<T extends El>(els: T[], id: string): T | null {
    for (const e of els) {
        if (e.children) {
            if (e.children.some((c) => c.id == id)) return e
            const p = parentOf(e.children, id)
            if (p) return p
        }
    }
    return null
}

// The elements a selection is made of, groups opened down to their leaves.
function leavesOf<T extends El>(els: T[]): T[] {
    const out: T[] = []
    for (const e of els) {
        if (e.kind == "group") out.push(...leavesOf(e.children ?? []))
        else out.push(e)
    }
    return out
}

function allIds(els: El[]): string[] {
    const out: string[] = []
    for (const e of els) { out.push(e.id); if (e.children) out.push(...allIds(e.children)) }
    return out
}

// ── hit testing ───────────────────────────────────────────────────────────

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay
    const len = dx * dx + dy * dy
    const t = len == 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function hits(e: El, px: number, py: number, tol: number): boolean {
    if (e.kind == "group") return (e.children ?? []).some((c) => hits(c, px, py, tol))
    if (e.kind == "line") {
        const w = (e.stroke?.width ?? 2) / 2
        return distToSegment(px, py, e.x1!, e.y1!, e.x2!, e.y2!) <= Math.max(w, tol)
    }
    const b = boundsOf(e)
    if (e.kind == "ellipse") {
        const rx = b.w / 2 + tol, ry = b.h / 2 + tol
        const nx = (px - b.x - b.w / 2) / rx, ny = (py - b.y - b.h / 2) / ry
        return nx * nx + ny * ny <= 1
    }
    return px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol
}

// The topmost element under a point among `els` (front is last), or null.
function hitTop<T extends El>(els: T[], px: number, py: number, tol: number): T | null {
    for (let i = els.length - 1; i >= 0; i--) if (hits(els[i], px, py, tol)) return els[i]
    return null
}

// ── moving and resizing ───────────────────────────────────────────────────

function translated<T extends El>(e: T, dx: number, dy: number): T {
    if (e.kind == "group") return { ...e, children: (e.children ?? []).map((c) => translated(c, dx, dy)) }
    if (e.kind == "line") return { ...e, x1: e.x1! + dx, y1: e.y1! + dy, x2: e.x2! + dx, y2: e.y2! + dy }
    return { ...e, x: (e.x ?? 0) + dx, y: (e.y ?? 0) + dy }
}

function r2(v: number): number { return Math.round(v * 100) / 100 }

// An element mapped from one box to another, as its share of a resize. A
// rectangle keeps its corner radius (a length, not a proportion); a text box
// takes the new width and lets its height follow its lines.
function mapped<T extends El>(e: T, from: Box, to: Box): T {
    const sx = from.w == 0 ? 1 : to.w / from.w, sy = from.h == 0 ? 1 : to.h / from.h
    const mx = (v: number) => r2(to.x + (v - from.x) * sx)
    const my = (v: number) => r2(to.y + (v - from.y) * sy)
    if (e.kind == "group") return { ...e, children: (e.children ?? []).map((c) => mapped(c, from, to)) }
    if (e.kind == "line") return { ...e, x1: mx(e.x1!), y1: my(e.y1!), x2: mx(e.x2!), y2: my(e.y2!) }
    const x = mx(e.x ?? 0), y = my(e.y ?? 0)
    const w = Math.max(1, r2((e.width ?? 0) * sx)), h = Math.max(1, r2((e.height ?? 0) * sy))
    if (e.kind == "text") {
        const kept = e.keepProportions == true
        const size = kept ? Math.max(4, Math.round((e.text!.size * sx) * 10) / 10) : e.text!.size
        return { ...e, x: x, y: y, width: w, height: kept ? h : e.height, text: { ...e.text!, size: size } }
    }
    return { ...e, x: x, y: y, width: w, height: h }
}

// The box a handle drag makes. `handle` is one of nw n ne e se s sw w; `keep`
// holds the original proportions. The opposite edge or corner stays put.
function resizedBox(b: Box, handle: string, dx: number, dy: number, keep: boolean, minSize: number): Box {
    let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h
    if (handle.includes("w")) x0 = Math.min(x1 - minSize, x0 + dx)
    if (handle.includes("e")) x1 = Math.max(x0 + minSize, x1 + dx)
    if (handle.includes("n")) y0 = Math.min(y1 - minSize, y0 + dy)
    if (handle.includes("s")) y1 = Math.max(y0 + minSize, y1 + dy)
    let w = x1 - x0, h = y1 - y0
    if (keep && b.w > 0 && b.h > 0) {
        const ratio = b.w / b.h
        const horiz = handle == "e" || handle == "w", vert = handle == "n" || handle == "s"
        if (horiz) h = w / ratio
        else if (vert) w = h * ratio
        else if (Math.abs(w / b.w) > Math.abs(h / b.h)) h = w / ratio
        else w = h * ratio
        // anchor the side that does not move
        if (handle.includes("w")) x0 = x1 - w; else if (!handle.includes("e")) x0 = b.x + (b.w - w) / 2
        if (handle.includes("n")) y0 = y1 - h; else if (!handle.includes("s")) y0 = b.y + (b.h - h) / 2
    }
    return { x: r2(x0), y: r2(y0), w: r2(w), h: r2(h) }
}

// A box dragged out from a start point, square when `square`.
function dragBox(ax: number, ay: number, bx: number, by: number, square: boolean): Box {
    let w = bx - ax, h = by - ay
    if (square) {
        const s = Math.max(Math.abs(w), Math.abs(h))
        w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s
    }
    return { x: r2(Math.min(ax, ax + w)), y: r2(Math.min(ay, ay + h)), w: r2(Math.abs(w)), h: r2(Math.abs(h)) }
}

// A line's end, held to the nearest 45 degrees with shift.
function lineEnd(ax: number, ay: number, bx: number, by: number, snap: boolean): number[] {
    if (!snap) return [r2(bx), r2(by)]
    const a = Math.atan2(by - ay, bx - ax), d = Math.hypot(bx - ax, by - ay)
    const q = Math.round(a / (Math.PI / 4)) * (Math.PI / 4)
    return [r2(ax + Math.cos(q) * d), r2(ay + Math.sin(q) * d)]
}

// ── replacing within the tree ─────────────────────────────────────────────

// `els` with every element whose id is in `ids` passed through `f`.
function mapIds<T extends El>(els: T[], ids: string[], f: (e: T) => T): T[] {
    return els.map((e) => {
        if (ids.includes(e.id)) return f(e)
        if (e.children) return { ...e, children: mapIds(e.children, ids, f) }
        return e
    })
}

// Leaf-wise: `f` applied to every leaf inside the elements named.
function mapLeaves<T extends El>(els: T[], ids: string[], f: (e: T) => T): T[] {
    const deep = (e: T): T => e.kind == "group" ? { ...e, children: (e.children ?? []).map(deep) } : f(e)
    return mapIds(els, ids, deep)
}

// Each element named in `off` moved by its [dx, dy].
function mapIdsBy<T extends El>(els: T[], off: Record<string, number[]>): T[] {
    return mapIds(els, Object.keys(off), (e) => translated(e, off[e.id][0], off[e.id][1]))
}

function removeIds<T extends El>(els: T[], ids: string[]): T[] {
    const out: T[] = []
    for (const e of els) {
        if (ids.includes(e.id)) continue
        if (e.children) {
            const kids = removeIds(e.children, ids)
            if (kids.length == 0) continue
            if (kids.length == 1) { out.push(kids[0]); continue }       // a group of one is no group
            out.push({ ...e, children: kids })
        } else out.push(e)
    }
    return out
}

// Elements inserted just in front of `afterId`'s siblings, or on top.
function insertAfter<T extends El>(els: T[], afterId: string | null, add: T[]): T[] {
    if (afterId != null) {
        const i = els.findIndex((e) => e.id == afterId)
        if (i >= 0) return [...els.slice(0, i + 1), ...add, ...els.slice(i + 1)]
        const out = els.map((e) => e.children ? { ...e, children: insertAfter(e.children, afterId, add) } : e)
        if (JSON.stringify(out) != JSON.stringify(els)) return out
    }
    return [...els, ...add]
}

// ── grouping ──────────────────────────────────────────────────────────────

// The selected siblings, wrapped in a new group where the frontmost one was.
function grouped<T extends El>(els: T[], ids: string[], groupId: string): T[] {
    const here = els.filter((e) => ids.includes(e.id))
    if (here.length >= 2) {
        const at = Math.max(...here.map((e) => els.indexOf(e)))
        const out: T[] = []
        els.forEach((e, i) => {
            if (i == at) out.push({ id: groupId, kind: "group", children: here } as unknown as T)
            else if (!ids.includes(e.id)) out.push(e)
        })
        return out
    }
    return els.map((e) => e.children ? { ...e, children: grouped(e.children, ids, groupId) } : e)
}

function ungrouped<T extends El>(els: T[], ids: string[]): T[] {
    const out: T[] = []
    for (const e of els) {
        if (ids.includes(e.id) && e.kind == "group") out.push(...(e.children ?? []))
        else if (e.children) out.push({ ...e, children: ungrouped(e.children, ids) })
        else out.push(e)
    }
    return out
}

// ── stacking order ────────────────────────────────────────────────────────

function reordered<T extends El>(els: T[], ids: string[], how: string): T[] {
    const mine = els.filter((e) => ids.includes(e.id))
    if (mine.length == 0) return els.map((e) => e.children ? { ...e, children: reordered(e.children, ids, how) } : e)
    const rest = els.filter((e) => !ids.includes(e.id))
    if (how == "front") return [...rest, ...mine]
    if (how == "back") return [...mine, ...rest]
    const out = [...els]
    if (how == "forward") {
        for (let i = out.length - 2; i >= 0; i--)
            if (ids.includes(out[i].id) && !ids.includes(out[i + 1].id)) { const t = out[i]; out[i] = out[i + 1]; out[i + 1] = t }
    } else {
        for (let i = 1; i < out.length; i++)
            if (ids.includes(out[i].id) && !ids.includes(out[i - 1].id)) { const t = out[i]; out[i] = out[i - 1]; out[i - 1] = t }
    }
    return out
}

// ── aligning and distributing ─────────────────────────────────────────────

// How far each selected element moves: { id: [dx, dy] }.
function alignOffsets(sel: El[], how: string): Record<string, number[]> {
    const all = unionOf(sel.map(boundsOf))
    const out: Record<string, number[]> = {}
    for (const e of sel) {
        const b = boundsOf(e)
        let dx = 0, dy = 0
        if (how == "left") dx = all.x - b.x
        else if (how == "center") dx = all.x + all.w / 2 - (b.x + b.w / 2)
        else if (how == "right") dx = all.x + all.w - (b.x + b.w)
        else if (how == "top") dy = all.y - b.y
        else if (how == "middle") dy = all.y + all.h / 2 - (b.y + b.h / 2)
        else if (how == "bottom") dy = all.y + all.h - (b.y + b.h)
        out[e.id] = [r2(dx), r2(dy)]
    }
    return out
}

// Equal gaps between neighbours, the outermost two staying where they are.
function distributeOffsets(sel: El[], axis: string): Record<string, number[]> {
    const items = sel.map((e) => ({ id: e.id, b: boundsOf(e) }))
    const x = axis == "x"
    items.sort((a, c) => x ? a.b.x - c.b.x : a.b.y - c.b.y)
    const first = items[0].b, last = items[items.length - 1].b
    const span = x ? (last.x + last.w) - first.x : (last.y + last.h) - first.y
    const used = items.reduce((n, it) => n + (x ? it.b.w : it.b.h), 0)
    const gap = (span - used) / (items.length - 1)
    const out: Record<string, number[]> = {}
    let at = x ? first.x : first.y
    for (const it of items) {
        const d = r2(at - (x ? it.b.x : it.b.y))
        out[it.id] = x ? [d, 0] : [0, d]
        at = at + (x ? it.b.w : it.b.h) + gap
    }
    return out
}

// ── snapping ──────────────────────────────────────────────────────────────

// Where a moving box's edges and centre line up with the slide's and with
// the other elements': the nudge that makes the nearest one meet, and the
// guide lines to draw. `tol` is in slide points.
function snapMove(b: Box, others: Box[], tol: number): { dx: number; dy: number; gx: number[]; gy: number[] } {
    const xs = [0, SLIDE_W / 2, SLIDE_W], ys = [0, SLIDE_H / 2, SLIDE_H]
    for (const o of others) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h) }
    const best = (mine: number[], targets: number[]): { d: number; at: number[] } => {
        let d = Infinity
        for (const m of mine) for (const t of targets) if (Math.abs(t - m) < Math.abs(d) && Math.abs(t - m) <= tol) d = t - m
        if (d == Infinity) return { d: 0, at: [] }
        const at: number[] = []
        for (const m of mine) for (const t of targets) if (Math.abs(t - (m + d)) < 0.01 && !at.includes(t)) at.push(t)
        return { d: d, at: at }
    }
    const sx = best([b.x, b.x + b.w / 2, b.x + b.w], xs)
    const sy = best([b.y, b.y + b.h / 2, b.y + b.h], ys)
    return { dx: sx.d, dy: sy.d, gx: sx.at, gy: sy.at }
}

// A single moving edge or point, snapped the same way.
function snapValue(v: number, targets: number[], tol: number): number | null {
    let best: number | null = null
    for (const t of targets) if (Math.abs(t - v) <= tol && (best == null || Math.abs(t - v) < Math.abs(best - v))) best = t
    return best
}

function snapTargetsX(others: Box[]): number[] { return [0, SLIDE_W / 2, SLIDE_W, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])] }
function snapTargetsY(others: Box[]): number[] { return [0, SLIDE_H / 2, SLIDE_H, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])] }

// What the service holds of a slide, as one comparable string.
function slideJson(s: { background: string; elements: unknown[] }): string {
    return JSON.stringify({ background: s.background, elements: s.elements })
}

// The pointer over each handle says which way it resizes.
const handleCursors: Record<string, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
    nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", radius: "pointer", p1: "crosshair", p2: "crosshair" }

const colorTitles: Record<string, string> = { fill: "Fill colour", stroke: "Outline colour", text: "Text colour", background: "Slide background" }

// ── words ─────────────────────────────────────────────────────────────────

// "Edited just now", "Edited 5 minutes ago", "Edited 3 Nov".
function editedAgo(iso: string, nowMs: number): string {
    const t = Date.parse(iso)
    if (isNaN(t)) return ""
    const s = Math.max(0, (nowMs - t) / 1000)
    if (s < 60) return "Edited just now"
    if (s < 3600) { const m = Math.floor(s / 60); return "Edited " + m + (m == 1 ? " minute ago" : " minutes ago") }
    if (s < 86400) { const h = Math.floor(s / 3600); return "Edited " + h + (h == 1 ? " hour ago" : " hours ago") }
    if (s < 86400 * 7) { const d = Math.floor(s / 86400); return d == 1 ? "Edited yesterday" : "Edited " + d + " days ago" }
    return "Edited " + new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(t))
}

// What a selection is, in a word or two, for the inspector's heading.
function kindName(sel: El[]): string {
    if (sel.length == 0) return "Slide"
    if (sel.length > 1) return sel.length + " objects"
    const e = sel[0]
    if (e.kind == "rect") return (e.cornerRadius ?? 0) > 0 ? "Rounded rectangle" : "Rectangle"
    if (e.kind == "ellipse") return e.width == e.height ? "Circle" : "Ellipse"
    if (e.kind == "line") return "Line"
    if (e.kind == "text") return "Text box"
    return "Group of " + (e.children ?? []).length
}

const WEIGHTS: Record<number, string> = { 100: "Thin", 200: "Extra light", 300: "Light", 400: "Regular", 500: "Medium",
    600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" }
function weightName(w: number): string { return WEIGHTS[Math.round(w / 100) * 100] ?? "" + w }

// The one value every element shares, the marker "mixed" when they differ,
// or "" when there are none.
function sameOr(vals: string[], mixed: string): string {
    if (vals.length == 0) return ""
    const a = JSON.stringify(vals[0])
    return vals.every((v) => JSON.stringify(v) == a) ? vals[0] : mixed
}
