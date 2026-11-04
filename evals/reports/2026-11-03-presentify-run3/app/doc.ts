// The document format's arithmetic: pure functions over a slide's element
// tree (see task/api/API.md for the format). Nothing here holds state or
// touches the screen; every function takes elements and returns new ones,
// so the model (model.declare) can keep a before and an after for undo.
//
// An element is a rect, ellipse, line or text with its own geometry, or a
// group whose bounds are its children's. Ids are unique within a slide,
// groups included.

export interface Box { x: number; y: number; w: number; h: number }

type Any = any

// ── Colours ─────────────────────────────────────────────────────────────────

/** "#RRGGBB" or "#RRGGBBAA" → 0xRRGGBB. */
export function rgbOf(c: string | null): number {
    if (c == null || c.length < 7) return 0
    return parseInt(c.slice(1, 7), 16)
}

/** The alpha byte of a colour string, 255 when it has none. */
export function alphaOf(c: string | null): number {
    if (c == null) return 0
    return c.length >= 9 ? parseInt(c.slice(7, 9), 16) : 255
}

/** A colour written the way the format wants it, upper-case. */
export function hexOf(rgb: number, alpha: number): string {
    const h = "#" + (rgb & 0xFFFFFF).toString(16).padStart(6, "0").toUpperCase()
    return alpha >= 255 ? h : h + Math.max(0, Math.round(alpha)).toString(16).padStart(2, "0").toUpperCase()
}

/** Parses what a person typed into a hex field: "#abc", "aabbcc", "#aabbcc80". */
export function parseHex(s: string): string | null {
    let t = s.trim().replace(/^#/, "")
    if (/^[0-9a-fA-F]{3}$/.test(t)) t = t.split("").map((ch) => ch + ch).join("")
    if (!/^([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t)) return null
    return "#" + t.toUpperCase()
}

/** How light a colour is, 0 to 1 — to choose ink that reads on it. */
export function lightness(c: string | null): number {
    const v = rgbOf(c)
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// ── Fonts ───────────────────────────────────────────────────────────────────

const STACKS: Record<string, string[]> = {
    "Georgia": ["Georgia", "Times New Roman", "serif"],
    "Helvetica Neue": ["Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
    "Avenir Next": ["Avenir Next", "Avenir", "Helvetica Neue", "sans-serif"],
    "Gill Sans": ["Gill Sans", "Gill Sans MT", "Helvetica Neue", "sans-serif"],
    "Futura": ["Futura", "Century Gothic", "sans-serif"],
    "Palatino": ["Palatino", "Palatino Linotype", "Book Antiqua", "serif"],
    "Times New Roman": ["Times New Roman", "Times", "serif"],
    "American Typewriter": ["American Typewriter", "Courier New", "serif"],
    "Menlo": ["Menlo", "Consolas", "monospace"]
}

/** The fonts a person can pick, in the order the inspector lists them. */
export const FONT_NAMES: string[] = Object.keys(STACKS)

/** A font name from the format, as a list of families tried in order. */
export function fontStack(name: string): string[] {
    return STACKS[name] ?? [name, "Helvetica Neue", "sans-serif"]
}

// ── Ids ─────────────────────────────────────────────────────────────────────

/** A fresh id that no element in `taken` has. */
export function freshId(taken: Set<string>): string {
    for (;;) {
        const id = "e" + Math.random().toString(36).slice(2, 9)
        if (!taken.has(id)) { taken.add(id); return id }
    }
}

/** Every id in a tree, groups included. */
export function allIds(els: Any[]): Set<string> {
    const out = new Set<string>()
    const walk = (list: Any[]) => list.forEach((e) => { out.add(e.id); if (e.kind == "group") walk(e.children) })
    walk(els)
    return out
}

/** A deep copy of an element with every id in it fresh. */
export function withFreshIds(e: Any, taken: Set<string>): Any {
    const c = structuredClone(e)
    const walk = (n: Any) => { n.id = freshId(taken); if (n.kind == "group") n.children.forEach(walk) }
    walk(c)
    return c
}

// ── Finding things ──────────────────────────────────────────────────────────

/** The element with this id, anywhere in the tree. */
export function findEl(els: Any[], id: string): Any | null {
    for (const e of els) {
        if (e.id == id) return e
        if (e.kind == "group") { const f = findEl(e.children, id); if (f != null) return f }
    }
    return null
}

/** The chain of ids from a top-level element down to `id`, or [] if absent. */
export function pathTo(els: Any[], id: string): string[] {
    for (const e of els) {
        if (e.id == id) return [e.id]
        if (e.kind == "group") { const p = pathTo(e.children, id); if (p.length > 0) return [e.id, ...p] }
    }
    return []
}

/** The id of the group directly holding `id`, or "" at the top level. */
export function parentOf(els: Any[], id: string): string {
    const p = pathTo(els, id)
    return p.length >= 2 ? p[p.length - 2] : ""
}

/** The array that holds `id` (the slide's, or a group's children). */
function siblingsOf(els: Any[], id: string): Any[] {
    const pid = parentOf(els, id)
    return pid == "" ? els : findEl(els, pid).children
}

/** Every leaf (non-group) element, back to front. */
export function leaves(els: Any[]): Any[] {
    const out: Any[] = []
    const walk = (list: Any[]) => list.forEach((e) => e.kind == "group" ? walk(e.children) : out.push(e))
    walk(els)
    return out
}

// ── Geometry ────────────────────────────────────────────────────────────────

/** An element's box in slide points. A line's box is its endpoints' span. */
export function boundsOf(e: Any): Box {
    if (e.kind == "group") return unionOf(e.children.map(boundsOf))
    if (e.kind == "line") {
        const x = Math.min(e.x1, e.x2), y = Math.min(e.y1, e.y2)
        return { x: x, y: y, w: Math.abs(e.x2 - e.x1), h: Math.abs(e.y2 - e.y1) }
    }
    return { x: e.x, y: e.y, w: e.width, h: e.height }
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

/** The box around every element named. */
export function boundsOfIds(els: Any[], ids: string[]): Box {
    return unionOf(ids.map((id) => findEl(els, id)).filter((e) => e != null).map(boundsOf))
}

function boxesTouch(a: Box, b: Box): boolean {
    return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

/** Distance from a point to a segment. */
function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1, dy = y2 - y1
    const len = dx * dx + dy * dy
    const t = len == 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len))
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** Does a point (slide points) land on this leaf? `tol` widens thin things. */
function hitsLeaf(e: Any, px: number, py: number, tol: number): boolean {
    if (e.kind == "line") return segDist(px, py, e.x1, e.y1, e.x2, e.y2) <= Math.max(tol, e.stroke.width / 2 + 2)
    const b = boundsOf(e)
    if (e.kind == "ellipse") {
        const rx = b.w / 2 + tol, ry = b.h / 2 + tol
        const nx = (px - (b.x + b.w / 2)) / rx, ny = (py - (b.y + b.h / 2)) / ry
        return nx * nx + ny * ny <= 1
    }
    return px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol
}

/** The topmost thing under a point, as the path of ids from the top level to
 *  the leaf hit — [] when the point is on bare slide. */
export function hitPath(els: Any[], px: number, py: number, tol: number): string[] {
    for (let i = els.length - 1; i >= 0; i--) {
        const e = els[i]
        if (e.kind == "group") {
            const p = hitPath(e.children, px, py, tol)
            if (p.length > 0) return [e.id, ...p]
        } else if (hitsLeaf(e, px, py, tol)) return [e.id]
    }
    return []
}

/** The top-level ids (or, inside `scope`, that group's child ids) whose
 *  bounds the box touches — what a marquee selects. */
export function idsTouching(els: Any[], box: Box, scope: string): string[] {
    const list = scope == "" ? els : (findEl(els, scope)?.children ?? els)
    return list.filter((e: Any) => boxesTouch(boundsOf(e), box)).map((e: Any) => e.id)
}

// ── Changing things ─────────────────────────────────────────────────────────

/** The tree with the element `id` replaced by `fn` of it. */
export function updateEl(els: Any[], id: string, fn: (e: Any) => Any): Any[] {
    return els.map((e) => {
        if (e.id == id) return fn(e)
        if (e.kind == "group") return { ...e, children: updateEl(e.children, id, fn) }
        return e
    })
}

/** The tree with every element named changed by `fn`. */
export function updateEach(els: Any[], ids: string[], fn: (e: Any) => Any): Any[] {
    return ids.reduce((acc, id) => updateEl(acc, id, fn), els)
}

/** The tree without the elements named. A group left with fewer than two
 *  children dissolves into what is left of it. */
export function removeIds(els: Any[], ids: string[]): Any[] {
    const out: Any[] = []
    for (const e of els) {
        if (ids.includes(e.id)) continue
        if (e.kind == "group") {
            const kids = removeIds(e.children, ids)
            if (kids.length >= 2) out.push({ ...e, children: kids })
            else out.push(...kids)
        } else out.push(e)
    }
    return out
}

/** An element moved by dx, dy. */
export function translate(e: Any, dx: number, dy: number): Any {
    if (e.kind == "group") return { ...e, children: e.children.map((c: Any) => translate(c, dx, dy)) }
    if (e.kind == "line") return { ...e, x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy }
    return { ...e, x: e.x + dx, y: e.y + dy }
}

/** An element mapped from one box onto another: its place and size scale
 *  with the box. Corner radii, stroke widths and type sizes are lengths and
 *  stay as they are. */
export function remap(e: Any, from: Box, to: Box): Any {
    const sx = from.w == 0 ? 1 : to.w / from.w
    const sy = from.h == 0 ? 1 : to.h / from.h
    const mx = (v: number) => to.x + (v - from.x) * sx
    const my = (v: number) => to.y + (v - from.y) * sy
    if (e.kind == "group") return { ...e, children: e.children.map((c: Any) => remap(c, from, to)) }
    if (e.kind == "line") return { ...e, x1: round(mx(e.x1)), y1: round(my(e.y1)), x2: round(mx(e.x2)), y2: round(my(e.y2)) }
    const x0 = mx(e.x), x1 = mx(e.x + e.width), y0 = my(e.y), y1 = my(e.y + e.height)
    const out = { ...e, x: round(Math.min(x0, x1)), y: round(Math.min(y0, y1)),
        width: round(Math.max(1, Math.abs(x1 - x0))), height: round(Math.max(1, Math.abs(y1 - y0))) }
    return out
}

/** Positions kept to a hundredth of a point, so the saved file stays tidy. */
export function round(v: number): number { return Math.round(v * 100) / 100 }

/** Every element in a group's subtree keeps proportions? (A group has no
 *  flag of its own; it keeps them when everything in it does.) */
export function keepsProportions(e: Any): boolean {
    if (e.kind == "group") return e.children.every(keepsProportions)
    if (e.kind == "line") return false
    return e.keepProportions == true
}

/** Sets keepProportions on an element, or on everything inside a group. */
export function setKeep(e: Any, on: boolean): Any {
    if (e.kind == "group") return { ...e, children: e.children.map((c: Any) => setKeep(c, on)) }
    if (e.kind == "line") return e
    return { ...e, keepProportions: on }
}

/** Puts the named siblings into one new group, where the topmost of them
 *  stood. Elements under different parents can't be grouped together. */
export function groupIds(els: Any[], ids: string[], gid: string): Any[] {
    if (ids.length < 2) return els
    const pid = parentOf(els, ids[0])
    if (!ids.every((id) => parentOf(els, id) == pid)) return els
    const regroup = (list: Any[]): Any[] => {
        const picked = list.filter((e) => ids.includes(e.id))
        const top = Math.max(...picked.map((e) => list.indexOf(e)))
        const out: Any[] = []
        list.forEach((e, i) => {
            if (i == top) out.push({ id: gid, kind: "group", children: picked })
            else if (!ids.includes(e.id)) out.push(e)
        })
        return out
    }
    return pid == "" ? regroup(els) : updateEl(els, pid, (g) => ({ ...g, children: regroup(g.children) }))
}

/** Each named group replaced by its children, in its place. */
export function ungroupIds(els: Any[], ids: string[]): Any[] {
    const open = (list: Any[]): Any[] => list.flatMap((e) => {
        if (e.kind != "group") return [e]
        const kids = open(e.children)
        return ids.includes(e.id) ? kids : [{ ...e, children: kids }]
    })
    return open(els)
}

/** The children of the named groups, as they will be once ungrouped. */
export function childIdsOf(els: Any[], ids: string[]): string[] {
    return ids.flatMap((id) => {
        const e = findEl(els, id)
        return e != null && e.kind == "group" ? e.children.map((c: Any) => c.id) : [id]
    })
}

/** Aligns the named elements on their joint box: "left", "center", "right",
 *  "top", "middle", "bottom". */
export function alignIds(els: Any[], ids: string[], how: string): Any[] {
    const all = boundsOfIds(els, ids)
    return updateEach(els, ids, (e) => {
        const b = boundsOf(e)
        let dx = 0, dy = 0
        if (how == "left") dx = all.x - b.x
        else if (how == "center") dx = all.x + all.w / 2 - (b.x + b.w / 2)
        else if (how == "right") dx = all.x + all.w - (b.x + b.w)
        else if (how == "top") dy = all.y - b.y
        else if (how == "middle") dy = all.y + all.h / 2 - (b.y + b.h / 2)
        else if (how == "bottom") dy = all.y + all.h - (b.y + b.h)
        return translate(e, round(dx), round(dy))
    })
}

/** Spaces the named elements evenly between the outermost two, "across" or
 *  "down": equal gaps between neighbours. */
export function distributeIds(els: Any[], ids: string[], axis: string): Any[] {
    if (ids.length < 3) return els
    const across = axis == "across"
    const items = ids.map((id) => ({ id: id, b: boundsOf(findEl(els, id)) }))
    items.sort((p, q) => across ? p.b.x - q.b.x : p.b.y - q.b.y)
    const first = items[0].b, last = items[items.length - 1].b
    const span = across ? last.x + last.w - first.x : last.y + last.h - first.y
    const total = items.reduce((n, it) => n + (across ? it.b.w : it.b.h), 0)
    const gap = (span - total) / (items.length - 1)
    let at = across ? first.x : first.y
    let out = els
    items.forEach((it) => {
        const d = at - (across ? it.b.x : it.b.y)
        out = updateEl(out, it.id, (e) => across ? translate(e, round(d), 0) : translate(e, 0, round(d)))
        at = at + (across ? it.b.w : it.b.h) + gap
    })
    return out
}

/** Moves the named elements within their own parent's stacking order:
 *  "forward", "backward", "front", "back". */
export function restack(els: Any[], ids: string[], how: string): Any[] {
    const shuffle = (list: Any[]): Any[] => {
        const mine = list.filter((e) => ids.includes(e.id))
        if (mine.length == 0) return list.map((e) => e.kind == "group" ? { ...e, children: shuffle(e.children) } : e)
        const rest = list.filter((e) => !ids.includes(e.id))
        if (how == "front") return [...rest, ...mine]
        if (how == "back") return [...mine, ...rest]
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
    return shuffle(els)
}

/** Copies of the named elements, offset, with fresh ids, added on top of
 *  their own parent. Returns the new tree and the copies' ids. */
export function duplicateIds(els: Any[], ids: string[], offset: number): { els: Any[]; ids: string[] } {
    const taken = allIds(els)
    const made: string[] = []
    let out = els
    for (const id of ids) {
        const e = findEl(out, id)
        if (e == null) continue
        const copy = translate(withFreshIds(e, taken), offset, offset)
        made.push(copy.id)
        const pid = parentOf(out, id)
        out = pid == "" ? [...out, copy] : updateEl(out, pid, (g) => ({ ...g, children: [...g.children, copy] }))
    }
    return { els: out, ids: made }
}

/** Pasted elements: fresh ids, offset, appended on top of the slide. */
export function pasteInto(els: Any[], clip: Any[], offset: number): { els: Any[]; ids: string[] } {
    const taken = allIds(els)
    const copies = clip.map((e) => translate(withFreshIds(e, taken), offset, offset))
    return { els: [...els, ...copies], ids: copies.map((c) => c.id) }
}

/** The ids, in back-to-front order within their parents (for a stable copy). */
export function inStackOrder(els: Any[], ids: string[]): string[] {
    const order: string[] = []
    const walk = (list: Any[]) => list.forEach((e) => { if (ids.includes(e.id)) order.push(e.id); if (e.kind == "group") walk(e.children) })
    walk(els)
    return order
}

/** Is this id still somewhere in the tree? Filters a selection after a change. */
export function existing(els: Any[], ids: string[]): string[] {
    const have = allIds(els)
    return ids.filter((id) => have.has(id))
}

// ── Snapping ────────────────────────────────────────────────────────────────

export interface Snap { d: number; guides: number[] }

/** Snaps one axis: of the moving box's edges and centre (`mine`), the one
 *  nearest a target within `tol` decides the shift. Returns the shift and
 *  every target line that then lines up, for guides. */
export function snapAxis(mine: number[], targets: number[], tol: number): Snap {
    let best = Infinity
    for (const m of mine) for (const t of targets) { const d = t - m; if (Math.abs(d) < Math.abs(best) && Math.abs(d) <= tol) best = d }
    if (best == Infinity) return { d: 0, guides: [] }
    const guides = targets.filter((t) => mine.some((m) => Math.abs(m + best - t) < 0.5))
    return { d: best, guides: Array.from(new Set(guides)) }
}

/** The lines a moving selection snaps to: the slide's edges and centre, and
 *  the edges and centres of everything not moving. */
export function snapTargets(els: Any[], moving: string[], axis: string): number[] {
    const out = axis == "x" ? [0, 640, 1280] : [0, 360, 720]
    els.filter((e) => !moving.includes(e.id)).forEach((e) => {
        const b = boundsOf(e)
        if (axis == "x") out.push(b.x, b.x + b.w / 2, b.x + b.w)
        else out.push(b.y, b.y + b.h / 2, b.y + b.h)
    })
    return out
}

// ── Time ────────────────────────────────────────────────────────────────────

/** "Edited just now", "Edited 5 minutes ago", "Edited 2 Nov". */
export function editedLabel(iso: string, now: number): string {
    const t = Date.parse(iso)
    if (isNaN(t)) return ""
    const s = Math.max(0, (now - t) / 1000)
    if (s < 60) return "Edited just now"
    if (s < 3600) { const m = Math.floor(s / 60); return "Edited " + m + (m == 1 ? " minute ago" : " minutes ago") }
    if (s < 86400) { const h = Math.floor(s / 3600); return "Edited " + h + (h == 1 ? " hour ago" : " hours ago") }
    if (s < 86400 * 2) return "Edited yesterday"
    const d = new Date(t)
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
    if (d.getFullYear() != new Date(now).getFullYear()) opts.year = "numeric"
    return "Edited " + d.toLocaleDateString("en-GB", opts)
}
