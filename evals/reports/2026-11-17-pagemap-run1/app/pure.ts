// Functions of their arguments: page geometry, ids, folio text, CSV, time words.
// Nothing here knows about the program; the model and the views call these.

// ── The fourteen templates (§2.3) ────────────────────────────────────────────

type Rect = { x: number, y: number, w: number, h: number }

const T3 = 1 / 3
const TEMPLATES: { id: string, name: string, rects: number[][] }[] = [
    { id: "full", name: "Full page", rects: [[0, 0, 1, 1]] },
    { id: "halves-h", name: "Horizontal halves", rects: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
    { id: "halves-v", name: "Vertical halves", rects: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
    { id: "thirds-h", name: "Horizontal thirds", rects: [[0, 0, 1, T3], [0, T3, 1, T3], [0, 2 * T3, 1, T3]] },
    { id: "thirds-v", name: "Vertical thirds", rects: [[0, 0, T3, 1], [T3, 0, T3, 1], [2 * T3, 0, T3, 1]] },
    { id: "two-thirds-v", name: "Two-thirds + column", rects: [[0, 0, 2 * T3, 1], [2 * T3, 0, T3, 1]] },
    { id: "two-thirds-h", name: "Two-thirds + strip", rects: [[0, 0, 1, 2 * T3], [0, 2 * T3, 1, T3]] },
    { id: "quarters", name: "Four quarters", rects: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
    { id: "quarter", name: "Quarter + three quarters", rects: [[0, 0, 0.25, 1], [0.25, 0, 0.75, 1]] },
    { id: "quarter-strip", name: "Three quarters + strip", rects: [[0, 0, 1, 0.75], [0, 0.75, 1, 0.25]] },
    { id: "half-quarters", name: "Half + two quarters", rects: [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
    { id: "column-quarters", name: "Column + two quarters", rects: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
    { id: "sixths", name: "Six sixths", rects: [0, 1, 2].flatMap((r) => [[0, r * T3, 0.5, T3], [0.5, r * T3, 0.5, T3]]) },
    { id: "eighths", name: "Eight eighths", rects: [0, 1, 2, 3].flatMap((r) => [[0, r * 0.25, 0.5, 0.25], [0.5, r * 0.25, 0.5, 0.25]]) },
]

function templateIds(): string[] { return TEMPLATES.map((t) => t.id) }
function templateName(id: string): string { return TEMPLATES.find((t) => t.id == id)?.name ?? id }
function regionCount(id: string): number { return (TEMPLATES.find((t) => t.id == id) ?? TEMPLATES[0]).rects.length }

// A template's rectangles, turned (a quarter clockwise each) and then flipped.
function regionRects(layout: string, turn: number, flip: boolean): Rect[] {
    const t = TEMPLATES.find((x) => x.id == layout) ?? TEMPLATES[0]
    return t.rects.map((r) => {
        let x = r[0], y = r[1], w = r[2], h = r[3]
        for (let i = 0; i < ((turn % 4) + 4) % 4; i++) { const nx = 1 - y - h, ny = x; x = nx; y = ny; const t2 = w; w = h; h = t2 }
        if (flip) x = 1 - x - w
        return { x: x, y: y, w: w, h: h }
    })
}

function regionShare(layout: string, i: number): number {
    const t = TEMPLATES.find((x) => x.id == layout) ?? TEMPLATES[0]
    const r = t.rects[i]
    return r ? r[2] * r[3] : 0
}

// A region's shape: full, square (within 20%), horizontal or vertical, the height scaled
// by the trim's aspect.
function regionShape(r: Rect, trimW: number, trimH: number): string {
    if (r.w * r.h > 0.99) return "full"
    const w = r.w, h = r.h * (trimH / trimW)
    if (Math.abs(w - h) <= 0.2 * Math.max(w, h)) return "square"
    return w > h ? "horizontal" : "vertical"
}

// ── Ids (§2.2) ───────────────────────────────────────────────────────────────

function newId(prefix: string): string {
    const a = "abcdefghijklmnopqrstuvwxyz0123456789"
    let s = ""
    for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)]
    return prefix + s
}

// ── Text ─────────────────────────────────────────────────────────────────────

function pad2(n: number): string { const s = String(n); return s.length < 2 ? "0" + s : s }

function firstName(name: string): string { return (name ?? "").trim().split(/\s+/)[0] ?? "" }

function initialsFrom(name: string): string {
    return (name ?? "").trim().split(/\s+/).filter((w) => w != "").slice(0, 2).map((w) => w[0].toUpperCase()).join("")
}

function numberText(n: number): string {
    if (Math.abs(n - Math.round(n)) < 0.005) return String(Math.round(n))
    return String(Math.round(n * 100) / 100)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// "just now", "5 min ago", "1 hour ago", "3 hours ago", "yesterday", "12 Oct".
function ago(at: number, now: number): string {
    if (!at) return "just now"
    const s = Math.max(0, (now - at) / 1000)
    if (s < 60) return "just now"
    if (s < 3600) return Math.floor(s / 60) + " min ago"
    if (s < 86400) { const h = Math.floor(s / 3600); return h == 1 ? "1 hour ago" : h + " hours ago" }
    const d = new Date(at), n = new Date(now)
    const y = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1)
    if (d.getFullYear() == y.getFullYear() && d.getMonth() == y.getMonth() && d.getDate() == y.getDate()) return "yesterday"
    return d.getDate() + " " + MONTHS[d.getMonth()]
}

function dayText(at: number): string {
    if (!at) return ""
    const d = new Date(at)
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear()
}

function slug(s: string): string { return (s ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }

function validEmail(s: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s ?? "").trim()) }

function fileSize(n: number): string {
    if (n < 1024) return n + " B"
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB"
    return (n / 1024 / 1024).toFixed(1) + " MB"
}

// ── CSV and TSV ──────────────────────────────────────────────────────────────

// Rows of cells: tab-separated when the first line has a tab; quoted cells with "" escapes.
function parseTable(text: string): string[][] {
    const firstLine = text.split(/\r?\n/)[0] ?? ""
    const sep = firstLine.includes("\t") ? "\t" : ","
    const rows: string[][] = []
    let row: string[] = [], cell = "", q = false
    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (q) {
            if (c == '"') { if (text[i + 1] == '"') { cell += '"'; i++ } else q = false }
            else cell += c
        } else if (c == '"') q = true
        else if (c == sep) { row.push(cell); cell = "" }
        else if (c == "\n" || c == "\r") {
            if (c == "\r" && text[i + 1] == "\n") i++
            row.push(cell); rows.push(row); row = []; cell = ""
        } else cell += c
    }
    if (cell != "" || row.length > 0) { row.push(cell); rows.push(row) }
    return rows.filter((r) => r.some((c) => c.trim() != ""))
}

// How tall the map would be at a page width: the same walk MapFlow makes. Items are
// [kind, spread, folded] with kind 0 heading, 1 page, 2 add slot.
function flowHeight(items: number[][], W: number, pw: number, ph: number, labelH: number, gap: number,
    rowGap: number, headH: number, facing: boolean, minSlot: number): number {
    const ch = ph + labelH
    const slot = facing ? 2 * pw + 2 : pw
    let x = 0, y = 0, lineH = 0, spread = -999
    for (const it of items) {
        const k = it[0], s = it[1], folded = it[2] == 1
        if (folded && k != 0) continue
        if (k == 0) { if (x > 0 || lineH > 0) { y += lineH + rowGap; x = 0 } y += headH + 4; lineH = 0; spread = -999; continue }
        if (k == 2) { const aw = Math.max(pw, minSlot); if (x > 0 && x + aw > W) { y += lineH + rowGap; x = 0 } x += aw + gap; lineH = Math.max(lineH, Math.max(ch, minSlot)); spread = -999; continue }
        if (s != spread) { spread = s; if (x > 0 && x + slot > W) { y += lineH + rowGap; x = 0 } x += slot + gap; lineH = Math.max(lineH, ch) }
    }
    return y + lineH
}

// The largest page width at which the whole map fits a height, with Fit's compact
// headings and gaps (as the App sets them).
function fitPageWidth(items: number[][], W: number, H: number, aspect: number, facing: boolean, headH: number, minSlot: number): number {
    let lo = 8, hi = 400
    for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2
        const h = flowHeight(items, W, mid, Math.round(mid * aspect), mid >= 60 ? 18 : 13, Math.max(5, Math.round(mid * 0.2)),
            Math.max(4, Math.round(mid * 0.14)), headH, facing, minSlot)
        if (h <= H) lo = mid; else hi = mid
    }
    return Math.floor(lo)
}
