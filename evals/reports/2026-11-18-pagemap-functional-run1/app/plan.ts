// plan.ts — the flatplan itself: what it is, what follows from it, and every change to it.
//
// Pure functions of their arguments, shared by every screen of Pagemap and testable on their
// own (tests/plan.test.ts). Nothing here knows about views, the service or time: a change is a
// function from one flatplan to the next, or a refusal that says why and what to do instead.
// pagemap.declare calls these from its handlers and constraints; service.ts stores the result.

// ── The shape of a flatplan (api/API.md) ─────────────────────────────────────────────────────

export type Kind = "editorial" | "advertising" | "unassigned"
export type CoverKind = "front" | "inside-front" | "inside-back" | "back"

export interface Named { id: string; name: string; color: string }
export interface Region { id: string; kind: Kind; storyId?: string | null; bookingId?: string | null; label: string }
export interface Art { assetId: string; page: number }
export interface Page {
    id: string; sectionId: string; layout: string; turn: number; flip: boolean; cover?: CoverKind | null
    regions: Region[]; art?: Art | null; tags: string[]; notes: string; locked: boolean; restart?: number | null
}
export interface Story {
    id: string; title: string; sectionId: string; kind: "editorial" | "advertising"; pages: number
    editor: string; status: string; notes: string; rightStart: boolean
}
export interface Asset { id: string; name: string; pages: number; size: number; url: string; images?: string | null }
export interface Booking { id: string; ref: string; text: string; size: string; shape: string; want: string[] }
export interface StitchIn { id: string; after: string; front: string; back: string }
export interface Signatures { cover: number[]; body: number[] }
export interface Flatplan {
    id: string; name: string; edition: string; publication: string
    trimW: number; trimH: number; facing: boolean; numbering: "covers" | "plain"; firstFolio: number
    notes: string; archived: boolean
    sections: Named[]; statuses: Named[]; tags: Named[]; stories: Story[]; pages: Page[]; holding: Page[]
    assets: Asset[]; bookings: Booking[]; stitchIns: StitchIn[]; signatures: Signatures
}

export const FIELDS = ["name", "edition", "publication", "trimW", "trimH", "facing", "numbering", "firstFolio",
    "notes", "archived", "signatures"] as const
export const LISTS = ["pages", "holding", "stories", "sections", "statuses", "tags", "assets", "bookings", "stitchIns"] as const

/** A change refused: what, why, and what the person could do instead. */
export interface Refusal { refused: true; what: string; why: string; instead: string }
export type Outcome = Flatplan | Refusal

export function refuse(what: string, why: string, instead = ""): Refusal { return { refused: true, what, why, instead } }
export function isRefusal(o: unknown): o is Refusal { return !!o && (o as Refusal).refused === true }

// ── Ids ──────────────────────────────────────────────────────────────────────────────────────

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
export function newId(prefix: string, n = 8): string {
    let s = prefix
    for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    return s
}
/** A …Key of an id: URI-encoded, with "." written %2E. */
export function idKey(id: string): string { return encodeURIComponent(id).replace(/\./g, "%2E") }
/** An invitation's key: the address trimmed, lower-cased, every "." a ",". */
export function emailKey(email: string): string { return email.trim().toLowerCase().replace(/\./g, ",") }

// ── Fixed vocabularies ───────────────────────────────────────────────────────────────────────

/** The ten colors a section, status or tag may take. */
export const PALETTE = ["#c2f04c", "#54ddbb", "#3fa9f5", "#80a7ff", "#c59aff", "#ff3fa4", "#ff6b8b", "#ff9a2e",
    "#ffd75e", "#98a4a6"]
export const PALETTE_NAMES = ["Lime", "Mint", "Sky", "Periwinkle", "Violet", "Magenta", "Coral", "Orange", "Butter", "Slate"]
/** The seven tints a member may wear. */
export const MEMBER_TINTS = ["#c2f04c", "#80a7ff", "#54ddbb", "#ff9a2e", "#ff3fa4", "#c59aff", "#ffd75e"]

export interface Rect { x: number; y: number; w: number; h: number }
export interface LayoutDef { id: string; name: string; rects: Rect[] }
const T = 1 / 3, Q = 1 / 4
export const LAYOUTS: LayoutDef[] = [
    { id: "full", name: "Full page", rects: [{ x: 0, y: 0, w: 1, h: 1 }] },
    { id: "halves-h", name: "Horizontal halves", rects: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] },
    { id: "halves-v", name: "Vertical halves", rects: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }] },
    { id: "thirds-h", name: "Horizontal thirds", rects: [{ x: 0, y: 0, w: 1, h: T }, { x: 0, y: T, w: 1, h: T }, { x: 0, y: 2 * T, w: 1, h: T }] },
    { id: "thirds-v", name: "Vertical thirds", rects: [{ x: 0, y: 0, w: T, h: 1 }, { x: T, y: 0, w: T, h: 1 }, { x: 2 * T, y: 0, w: T, h: 1 }] },
    { id: "two-thirds-v", name: "Two-thirds + column", rects: [{ x: 0, y: 0, w: 2 * T, h: 1 }, { x: 2 * T, y: 0, w: T, h: 1 }] },
    { id: "two-thirds-h", name: "Two-thirds + strip", rects: [{ x: 0, y: 0, w: 1, h: 2 * T }, { x: 0, y: 2 * T, w: 1, h: T }] },
    { id: "quarters", name: "Four quarters", rects: [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }] },
    { id: "quarter", name: "Quarter + three quarters", rects: [{ x: 0, y: 0, w: Q, h: 1 }, { x: Q, y: 0, w: 3 * Q, h: 1 }] },
    { id: "quarter-strip", name: "Three quarters + strip", rects: [{ x: 0, y: 0, w: 1, h: 3 * Q }, { x: 0, y: 3 * Q, w: 1, h: Q }] },
    { id: "half-quarters", name: "Half + two quarters", rects: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }] },
    { id: "column-quarters", name: "Column + two quarters", rects: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }] },
    { id: "sixths", name: "Six sixths", rects: [0, 1, 2].flatMap((r) => [0, 1].map((c) => ({ x: c * 0.5, y: r * T, w: 0.5, h: T }))) },
    { id: "eighths", name: "Eight eighths", rects: [0, 1, 2, 3].flatMap((r) => [0, 1].map((c) => ({ x: c * 0.5, y: r * Q, w: 0.5, h: Q }))) },
]
export function layoutOf(id: string): LayoutDef { return LAYOUTS.find((l) => l.id == id) ?? LAYOUTS[0] }

/** A layout's regions as they fall on the page: turned a quarter at a time, then flipped. */
export function regionRects(layout: string, turn: number, flip: boolean): Rect[] {
    return layoutOf(layout).rects.map((r0) => {
        let r = { ...r0 }
        for (let i = 0; i < ((turn % 4) + 4) % 4; i++) r = { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w }
        if (flip) r = { x: 1 - r.x - r.w, y: r.y, w: r.w, h: r.h }
        return r
    })
}

/** A region's shape on the printed page. */
export function regionShape(r: Rect, trimW: number, trimH: number): "full" | "square" | "horizontal" | "vertical" {
    if (r.w > 0.999 && r.h > 0.999) return "full"
    const w = r.w * trimW, h = r.h * trimH
    if (Math.max(w, h) / Math.min(w, h) <= 1.2) return "square"
    return w > h ? "horizontal" : "vertical"
}

// ── Reading a flatplan ───────────────────────────────────────────────────────────────────────

export function coversOn(fp: Flatplan): boolean { return fp.numbering == "covers" }
export function isCover(p: Page): boolean { return p.cover != null }
const COVER_FOLIO: Record<CoverKind, string> = { "front": "FC", "inside-front": "IFC", "inside-back": "IBC", "back": "BC" }
const COVER_NAME: Record<CoverKind, string> = { "front": "front cover", "inside-front": "inside front cover",
    "inside-back": "inside back cover", "back": "back cover" }

export function pad2(n: number): string { return n >= 0 && n < 10 ? "0" + n : String(n) }

/** Every page's folio, in book order: FC, IFC, IBC, BC for the covers, otherwise the count. */
export function folios(fp: Flatplan): string[] {
    let n = fp.firstFolio
    return fp.pages.map((p) => {
        if (coversOn(fp) && p.cover) return COVER_FOLIO[p.cover]
        if (p.restart != null) n = p.restart
        const f = pad2(n)
        n = n + 1
        return f
    })
}
/** "page 12", or "front cover": how a page is named in a sentence. */
export function pageName(fp: Flatplan, i: number, fol?: string[]): string {
    const p = fp.pages[i]
    if (!p) return "a page"
    if (coversOn(fp) && p.cover) return COVER_NAME[p.cover]
    return "page " + (fol ?? folios(fp))[i]
}
export function pageIndex(fp: Flatplan, id: string): number { return fp.pages.findIndex((p) => p.id == id) }

/** The interior: the pages inside the covers, as a range of indexes [start, end). */
export function interior(fp: Flatplan): [number, number] {
    const n = fp.pages.length
    if (!coversOn(fp)) return [0, n]
    let s = 0, e = n
    while (s < n && fp.pages[s].cover) s++
    while (e > s && fp.pages[e - 1].cover) e--
    return [s, e]
}

export type Side = "left" | "right" | "single"
export interface Slot { spread: number; side: Side; alone: boolean }
/** Where each page falls: its spread, and whether it is a left- or right-hand page. */
export function slots(fp: Flatplan): Slot[] {
    const out: Slot[] = []
    let spread = -1
    if (!fp.facing) return fp.pages.map((_, i) => ({ spread: i, side: "single", alone: true }))
    const [s, e] = interior(fp)
    fp.pages.forEach((p, i) => {
        if (coversOn(fp) && p.cover) {
            spread++
            out.push({ spread, side: p.cover == "front" || p.cover == "inside-back" ? "right" : "left", alone: true })
            return
        }
        const k = i - s
        if (k == 0) { spread++; out.push({ spread, side: "right", alone: true }); return }
        if (k % 2 == 1) { spread++; out.push({ spread, side: "left", alone: i + 1 >= e }); return }
        out.push({ spread, side: "right", alone: false })
    })
    return out
}
export function isRightHand(fp: Flatplan, i: number, sl?: Slot[]): boolean { return (sl ?? slots(fp))[i]?.side == "right" }

/** The ids of every page of the spread that holds page i. */
export function spreadOf(fp: Flatplan, i: number): string[] {
    const sl = slots(fp)
    return fp.pages.filter((_, j) => sl[j].spread == sl[i].spread).map((p) => p.id)
}

export function storyById(fp: Flatplan, id: string | undefined | null): Story | undefined { return id ? fp.stories.find((s) => s.id == id) : undefined }
export function storiesOn(p: Page): string[] {
    const out: string[] = []
    p.regions.forEach((r) => { if (r.storyId && !out.includes(r.storyId)) out.push(r.storyId) })
    return out
}
/** The indexes of the pages carrying a story, in book order. */
export function pagesOfStory(fp: Flatplan, storyId: string): number[] {
    const out: number[] = []
    fp.pages.forEach((p, i) => { if (p.regions.some((r) => r.storyId == storyId)) out.push(i) })
    return out
}
export function isPlaced(fp: Flatplan, storyId: string): boolean { return fp.pages.some((p) => p.regions.some((r) => r.storyId == storyId)) }
export function unplacedStories(fp: Flatplan): Story[] { return fp.stories.filter((s) => !isPlaced(fp, s.id)) }
/** A region with nothing in it: open, carrying no story, booking or label. */
export function regionEmpty(r: Region): boolean { return r.kind == "unassigned" && !r.storyId && !r.bookingId && (r.label ?? "") == "" }
export function isBlank(p: Page): boolean { return p.regions.every(regionEmpty) }
export function pagesOfBooking(fp: Flatplan, bookingId: string): number[] {
    const out: number[] = []
    fp.pages.forEach((p, i) => { if (p.regions.some((r) => r.bookingId == bookingId)) out.push(i) })
    return out
}
export function unplacedBookings(fp: Flatplan): Booking[] { return fp.bookings.filter((b) => pagesOfBooking(fp, b.id).length == 0) }

/** The pages of a story, written as a reader would: "12–17", or "12–14, 20". */
export function folioRuns(fol: string[], idx: number[]): string {
    const runs: string[] = []
    let i = 0
    while (i < idx.length) {
        let j = i
        while (j + 1 < idx.length && idx[j + 1] == idx[j] + 1) j++
        runs.push(j == i ? fol[idx[i]] : fol[idx[i]] + "–" + fol[idx[j]])
        i = j + 1
    }
    return runs.join(", ")
}

export interface Shares { editorial: number; advertising: number; open: number; pages: number }
/** How the issue divides between editorial, advertising and open, in pages (a half-page ad is half a page). */
export function shares(fp: Flatplan): Shares {
    const out = { editorial: 0, advertising: 0, open: 0, pages: fp.pages.length }
    fp.pages.forEach((p) => {
        const rects = regionRects(p.layout, p.turn, p.flip)
        p.regions.forEach((r, i) => {
            const a = rects[i] ? rects[i].w * rects[i].h : 0
            if (r.kind == "editorial") out.editorial += a
            else if (r.kind == "advertising") out.advertising += a
            else out.open += a
        })
    })
    return out
}
export function pageKindShare(p: Page): Shares {
    return shares({ pages: [p] } as unknown as Flatplan)
}
/** How many pages each status accounts for (the regions carrying its stories). */
export function statusPages(fp: Flatplan): Record<string, number> {
    const out: Record<string, number> = {}
    fp.statuses.forEach((s) => { out[s.id] = 0 })
    const statusOf = new Map(fp.stories.map((s) => [s.id, s.status]))
    fp.pages.forEach((p) => {
        const rects = regionRects(p.layout, p.turn, p.flip)
        p.regions.forEach((r, i) => {
            const st = r.storyId ? statusOf.get(r.storyId) : undefined
            if (st != null && out[st] != null && rects[i]) out[st] += rects[i].w * rects[i].h
        })
    })
    return out
}
export function tagCounts(fp: Flatplan): Record<string, number> {
    const out: Record<string, number> = {}
    fp.tags.forEach((t) => { out[t.id] = fp.pages.filter((p) => p.tags.includes(t.id)).length })
    return out
}
/** Each section's pages: their indexes, and the folio range they span. */
export function sectionRanges(fp: Flatplan, fol?: string[]): { id: string; count: number; first: number; range: string }[] {
    const f = fol ?? folios(fp)
    return fp.sections.map((s) => {
        const idx: number[] = []
        fp.pages.forEach((p, i) => { if (p.sectionId == s.id) idx.push(i) })
        return { id: s.id, count: idx.length, first: idx.length ? idx[0] : -1,
            range: idx.length == 0 ? "no pages" : idx.length == 1 ? f[idx[0]] : f[idx[0]] + "–" + f[idx[idx.length - 1]] }
    })
}
/** The sections that hold the covers, while covers are separate. */
export function coverSections(fp: Flatplan): string[] {
    if (!coversOn(fp)) return []
    return Array.from(new Set(fp.pages.filter((p) => p.cover).map((p) => p.sectionId)))
}
export function firstInteriorSection(fp: Flatplan): string {
    const cs = coverSections(fp)
    return (fp.sections.find((s) => !cs.includes(s.id)) ?? fp.sections[0]).id
}

/** A story's pages, said for the person: "pages 12–17 (6)", with the plan when different. */
export function storyPagesText(fp: Flatplan, storyId: string, fol?: string[]): string {
    const s = storyById(fp, storyId)
    const idx = pagesOfStory(fp, storyId)
    if (idx.length == 0) return "Not placed" + (s ? " · planned " + s.pages + (s.pages == 1 ? " page" : " pages") : "")
    const f = fol ?? folios(fp)
    let t = (idx.length == 1 ? "Page " : "Pages ") + folioRuns(f, idx) + " · " + idx.length + (idx.length == 1 ? " page" : " pages")
    if (s && s.pages != idx.length) t += " (planned " + s.pages + ")"
    return t
}

// ── Search and filters ───────────────────────────────────────────────────────────────────────

export type Filter = "all" | "editorial" | "advertising" | "open"
/** The pages that match: those carrying the kind asked for and the words in a title on them, or the folio. */
export function matches(fp: Flatplan, query: string, filter: Filter, fol?: string[]): boolean[] {
    const f = fol ?? folios(fp)
    const q = query.trim().toLowerCase()
    const want = filter == "open" ? "unassigned" : filter
    const bookingText = new Map(fp.bookings.map((b) => [b.id, b.text]))
    const titleOf = new Map(fp.stories.map((s) => [s.id, s.title]))
    return fp.pages.map((p, i) => {
        if (filter != "all" && !p.regions.some((r) => r.kind == want)) return false
        if (q == "") return true
        const folio = f[i].toLowerCase()
        if (folio == q || folio.replace(/^0+/, "") == q.replace(/^0+/, "")) return true
        return p.regions.some((r) => {
            const words = [r.storyId ? titleOf.get(r.storyId) ?? "" : "", r.bookingId ? bookingText.get(r.bookingId) ?? "" : "", r.label ?? ""]
            return words.some((w) => w.toLowerCase().includes(q))
        })
    })
}

// ── Bookings ─────────────────────────────────────────────────────────────────────────────────

export type Fit = "match" | "partial" | "mismatch" | "none"
export function parseSize(s: string): number | null {
    const t = (s ?? "").trim()
    if (t == "") return null
    const m = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
    if (m) return Number(m[1]) / Number(m[2])
    const n = Number(t)
    return isFinite(n) && n > 0 ? n : null
}
/** The wanted pages that can be checked: folios, digits, or the cover names. */
export function wantedPages(want: string[]): string[] {
    return (want ?? []).map((w) => w.trim().toUpperCase()).filter((w) => /^\d+$/.test(w) || ["FC", "IFC", "IBC", "BC", "COVER", "BACK"].includes(w))
}
function wantIncludes(want: string[], folio: string): boolean {
    const f = folio.toUpperCase()
    return wantedPages(want).some((w) => {
        if (/^\d+$/.test(w)) return /^\d+$/.test(f) && Number(w) == Number(f)
        if (w == "COVER") return f == "FC"
        if (w == "BACK") return f == "BC"
        return w == f
    })
}
/** How well a booking fits a region of a page: match, partial, mismatch, or no constraints at all. */
export function bookingFit(fp: Flatplan, b: Booking, pageIdx: number, regionIdx: number, fol?: string[]): Fit {
    const p = fp.pages[pageIdx]
    const rect = regionRects(p.layout, p.turn, p.flip)[regionIdx]
    if (!rect) return "none"
    const checks: boolean[] = []
    const size = parseSize(b.size)
    if (size != null) checks.push(Math.abs(rect.w * rect.h - size) <= 0.02)
    if ((b.shape ?? "") != "") {
        const sh = regionShape(rect, fp.trimW, fp.trimH)
        checks.push(b.shape == "full" ? sh == "full" : sh == b.shape)
    }
    if (wantedPages(b.want).length > 0) checks.push(wantIncludes(b.want, (fol ?? folios(fp))[pageIdx]))
    if (checks.length == 0) return "none"
    const ok = checks.filter((c) => c).length
    return ok == checks.length ? "match" : ok == 0 ? "mismatch" : "partial"
}

/** One row of a booking list: reference, text, wanted pages (;-separated), size, shape. */
export interface BookingRow { ref: string; text: string; want: string[]; size: string; shape: string }
export function parseBookingList(text: string): BookingRow[] {
    const firstLine = text.split(/\r?\n/)[0] ?? ""
    const sep = firstLine.includes("\t") ? "\t" : ","
    const rows: string[][] = []
    let row: string[] = [], cell = "", q = false
    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (q) {
            if (c == '"') { if (text[i + 1] == '"') { cell += '"'; i++ } else q = false }
            else cell += c
        } else if (c == '"' && cell == "") q = true
        else if (c == sep) { row.push(cell); cell = "" }
        else if (c == "\n" || c == "\r") {
            if (c == "\r" && text[i + 1] == "\n") i++
            row.push(cell); rows.push(row); row = []; cell = ""
        } else cell += c
    }
    if (cell != "" || row.length > 0) { row.push(cell); rows.push(row) }
    return rows.slice(1)
        .filter((r) => r.some((c) => c.trim() != "") && (r[1] ?? "").trim() != "")
        .map((r) => ({ ref: (r[0] ?? "").trim(), text: (r[1] ?? "").trim(),
            want: (r[2] ?? "").split(";").map((w) => w.trim()).filter((w) => w != ""),
            size: (r[3] ?? "").trim(), shape: normalShape(r[4] ?? "") }))
}
function normalShape(s: string): string {
    const t = s.trim().toLowerCase()
    return ["full", "vertical", "horizontal", "square"].includes(t) ? t : ""
}
export const BOOKING_TEMPLATE = "Reference,Text,Wanted pages,Size,Shape\n" +
    "ORD-1041,Acme Cameras — spring campaign,IFC,1,full\n" +
    "ORD-1042,Northwind Coffee,12;13,1/2,horizontal\n" +
    ",House ad — subscribe,,1/4,square\n"

// ── Changing a flatplan ──────────────────────────────────────────────────────────────────────
//
// Each change takes the flatplan as it stands and returns the next one, or a refusal. The
// caller then holds the result to the rules every change keeps (checkRules, below) before it
// is stored, so a change states only what is particular to it.

function clone(fp: Flatplan): Flatplan { return JSON.parse(JSON.stringify(fp)) }
export function blankRegion(): Region { return { id: newId("r"), kind: "unassigned", label: "" } }
export function blankPage(sectionId: string): Page {
    return { id: newId("p"), sectionId, layout: "full", turn: 0, flip: false, regions: [blankRegion()], tags: [], notes: "", locked: false }
}
function plural(n: number, one: string, many?: string): string { return n + " " + (n == 1 ? one : many ?? one + "s") }

/** After any move, a placed story whose pages all sit in one section belongs to that section. */
export function settleStorySections(fp: Flatplan): void {
    fp.stories.forEach((s) => {
        const idx = pagesOfStory(fp, s.id)
        if (idx.length == 0) return
        const secs = new Set(idx.map((i) => fp.pages[i].sectionId))
        if (secs.size == 1) s.sectionId = Array.from(secs)[0]
    })
}

/** Where pages may be put: an index in the page list between which pages may go (0..n). */
export function insertionAllowed(fp: Flatplan, at: number): boolean {
    if (!coversOn(fp)) return true
    const [s, e] = interior(fp)
    return at >= s && at <= e
}
function insertionIndex(fp: Flatplan, targetId: string, where: "before" | "after"): number {
    const i = pageIndex(fp, targetId)
    return i < 0 ? -1 : where == "before" ? i : i + 1
}

/** The pages a unit carries, from one page: the page, its spread, its story's pages (and theirs), its section. */
export type Unit = "page" | "spread" | "story" | "section"
export function unitPages(fp: Flatplan, pageId: string, unit: Unit): string[] {
    const i = pageIndex(fp, pageId)
    if (i < 0) return []
    if (unit == "page") return [pageId]
    if (unit == "spread") return spreadOf(fp, i)
    if (unit == "section") { const sid = fp.pages[i].sectionId; return fp.pages.filter((p) => p.sectionId == sid).map((p) => p.id) }
    const set = new Set<number>([i])
    const seen = new Set<string>()
    let frontier = [i]
    while (frontier.length > 0) {
        const next: number[] = []
        frontier.forEach((k) => storiesOn(fp.pages[k]).forEach((sid) => {
            if (seen.has(sid)) return
            seen.add(sid)
            pagesOfStory(fp, sid).forEach((j) => { if (!set.has(j)) { set.add(j); next.push(j) } })
        }))
        frontier = next
    }
    return Array.from(set).sort((a, b) => a - b).map((k) => fp.pages[k].id)
}
export function inBookOrder(fp: Flatplan, ids: string[]): string[] {
    return ids.slice().sort((a, b) => pageIndex(fp, a) - pageIndex(fp, b)).filter((id) => pageIndex(fp, id) >= 0)
}

export interface MovePlan { ids: string[]; at: number; sectionId: string; landing: number[]; joins: string }
/** What a move would do, before it happens: which pages, where they land, and which section they join. */
export function planMove(fp: Flatplan, ids: string[], targetId: string, where: "before" | "after"): MovePlan | Refusal {
    const order = inBookOrder(fp, ids)
    const what = "Can't move " + (order.length == 1 ? "this page" : "these " + order.length + " pages")
    if (order.length == 0) return refuse(what, "There are no pages to move.")
    if (order.includes(targetId)) return refuse(what, "The place you chose is one of the pages being moved.", "Choose a page outside them.")
    const cover = order.find((id) => isCover(fp.pages[pageIndex(fp, id)]) && coversOn(fp))
    if (cover) return refuse(what, "The covers stay first and last and never move.", "Leave the covers out of the move, or switch separate covers off in Print.")
    const locked = order.filter((id) => fp.pages[pageIndex(fp, id)].locked)
    if (locked.length > 0) return refuse(what, plural(locked.length, "of them is locked", "of them are locked") + ".", "Unlock the page first, from its panel.")
    const at0 = insertionIndex(fp, targetId, where)
    if (at0 < 0) return refuse(what, "That page is no longer in the issue.")
    if (!insertionAllowed(fp, at0)) return refuse(what, "Nothing can go beside or outside the covers.", "Choose a page inside the covers.")
    const target = fp.pages[pageIndex(fp, targetId)]
    const rest = fp.pages.filter((p) => !order.includes(p.id))
    const at = where == "before" ? rest.findIndex((p) => p.id == targetId) : rest.findIndex((p) => p.id == targetId) + 1
    const landing = order.map((_, k) => at + k)
    const sec = fp.sections.find((s) => s.id == target.sectionId)
    const fromSecs = new Set(order.map((id) => fp.pages[pageIndex(fp, id)].sectionId))
    const joins = fromSecs.size == 1 && fromSecs.has(target.sectionId) ? "" : sec?.name ?? ""
    return { ids: order, at, sectionId: target.sectionId, landing, joins }
}
/** Move pages before or after a page; they join the section of the pages they land among. */
export function movePages(fp0: Flatplan, ids: string[], targetId: string, where: "before" | "after", unit: Unit = "page"): Outcome {
    const plan = planMove(fp0, ids, targetId, where)
    if (isRefusal(plan)) return plan
    const fp = clone(fp0)
    const moving = plan.ids.map((id) => fp.pages[pageIndex(fp, id)])
    moving.forEach((p) => { p.sectionId = plan.sectionId })
    const rest = fp.pages.filter((p) => !plan.ids.includes(p.id))
    fp.pages = [...rest.slice(0, plan.at), ...moving, ...rest.slice(plan.at)]
    if (unit == "spread" && fp.facing && moving.length == 2 && !(slots(fp)[plan.at].side == "left"))
        return refuse("Can't move this spread there", "A two-page spread must begin on a left-hand page, and it would begin on a right-hand one.",
            "Place it one page earlier or later.")
    settleStorySections(fp)
    return fp
}
/** Exchange two runs of the same length: each takes the other's place (and section). */
export function exchange(fp0: Flatplan, a: string[], b: string[]): Outcome {
    const what = "Can't exchange these pages"
    const A = inBookOrder(fp0, a), B = inBookOrder(fp0, b)
    if (A.length == 0 || A.length != B.length) return refuse(what, "The two runs must be the same length.", "Choose " + plural(A.length, "page") + " to exchange with.")
    if (A.some((id) => B.includes(id))) return refuse(what, "The two runs overlap.", "Choose pages outside the first run.")
    const all = [...A, ...B].map((id) => fp0.pages[pageIndex(fp0, id)])
    if (coversOn(fp0) && all.some(isCover)) return refuse(what, "The covers never move.", "Leave the covers out.")
    if (all.some((p) => p.locked)) return refuse(what, "A locked page can't move.", "Unlock it first.")
    const fp = clone(fp0)
    const ia = A.map((id) => pageIndex(fp, id)), ib = B.map((id) => pageIndex(fp, id))
    const pa = ia.map((i) => fp.pages[i]), pb = ib.map((i) => fp.pages[i])
    const sa = pa.map((p) => p.sectionId), sb = pb.map((p) => p.sectionId)
    ia.forEach((i, k) => { fp.pages[i] = pb[k]; pb[k].sectionId = sa[k] })
    ib.forEach((i, k) => { fp.pages[i] = pa[k]; pa[k].sectionId = sb[k] })
    settleStorySections(fp)
    return fp
}
/** Move a whole section, with its pages, before or after another. */
export function moveSection(fp0: Flatplan, secId: string, targetSecId: string, where: "before" | "after"): Outcome {
    const sec = fp0.sections.find((s) => s.id == secId)
    const what = "Can't move " + (sec?.name ?? "this section")
    if (!sec) return refuse(what, "That section no longer exists.")
    if (secId == targetSecId) return refuse(what, "A section can't move relative to itself.")
    const cs = coverSections(fp0)
    if (cs.includes(secId)) return refuse(what, "The cover sections stay at the outside while covers are separate.", "Switch separate covers off in Print first.")
    const tIdx = fp0.sections.findIndex((s) => s.id == targetSecId)
    if (tIdx < 0) return refuse(what, "The other section no longer exists.")
    if (cs.length > 0) {
        if (cs.includes(targetSecId) && where == "before" && fp0.pages[0].sectionId == targetSecId) return refuse(what, "Nothing goes before the covers.", "Choose a section inside the covers.")
        if (cs.includes(targetSecId) && where == "after" && fp0.pages[fp0.pages.length - 1].sectionId == targetSecId) return refuse(what, "Nothing goes after the back covers.", "Choose a section inside the covers.")
    }
    const fp = clone(fp0)
    const secs = fp.sections.filter((s) => s.id != secId)
    const t = secs.findIndex((s) => s.id == targetSecId)
    secs.splice(where == "before" ? t : t + 1, 0, fp.sections.find((s) => s.id == secId)!)
    fp.sections = secs
    const mine = fp.pages.filter((p) => p.sectionId == secId)
    if (mine.length > 0) {
        const rest = fp.pages.filter((p) => p.sectionId != secId)
        let at: number
        const tp = rest.map((p, i) => (p.sectionId == targetSecId ? i : -1)).filter((i) => i >= 0)
        if (tp.length > 0) at = where == "before" ? tp[0] : tp[tp.length - 1] + 1
        else {
            // The target has no pages: go where its order says, after the pages of the sections before it.
            const before = new Set(secs.slice(0, secs.findIndex((s) => s.id == secId)).map((s) => s.id))
            at = 0
            rest.forEach((p, i) => { if (before.has(p.sectionId)) at = i + 1 })
        }
        if (!insertionAllowed({ ...fp, pages: rest } as Flatplan, at)) return refuse(what, "Nothing can go beside or outside the covers.")
        fp.pages = [...rest.slice(0, at), ...mine, ...rest.slice(at)]
        const shifted = fp0.pages.filter((p, i) => p.locked && fp.pages[i]?.id != p.id)
        if (shifted.length > 0) return refuse(what, "It would shift a locked page.", "Unlock the locked pages it would shift, then move it.")
    }
    return fp
}
/** Nudge a page, with its unit, one place earlier or later. */
export function nudge(fp: Flatplan, pageId: string, unit: Unit, dir: -1 | 1): Outcome {
    const ids = unit == "section" ? unitPages(fp, pageId, "page") : unitPages(fp, pageId, unit)
    const idx = ids.map((id) => pageIndex(fp, id)).sort((a, b) => a - b)
    const [s, e] = interior(fp)
    const what = "Can't move " + (ids.length == 1 ? "this page" : "these pages") + (dir < 0 ? " earlier" : " later")
    if (dir < 0) {
        const j = idx[0] - 1
        if (j < s) return refuse(what, dir < 0 && coversOn(fp) ? "It is already first inside the covers." : "It is already first.")
        return movePages(fp, ids, fp.pages[j].id, "before", unit)
    }
    const j = idx[idx.length - 1] + 1
    if (j >= e) return refuse(what, coversOn(fp) ? "It is already last inside the covers." : "It is already last.")
    return movePages(fp, ids, fp.pages[j].id, "after", unit)
}
export function setSection(fp0: Flatplan, ids: string[], sectionId: string): Outcome {
    const fp = clone(fp0)
    if (!fp.sections.some((s) => s.id == sectionId)) return refuse("Can't change the section", "That section no longer exists.")
    for (const id of ids) {
        const p = fp.pages[pageIndex(fp, id)]
        if (!p) continue
        if (coversOn(fp) && p.cover) return refuse("Can't change the section", "The covers stay in their cover sections.", "Leave the covers out.")
        p.sectionId = sectionId
    }
    settleStorySections(fp)
    return fp
}
/** Add blank pages after a page, in its section. */
export function addPagesAfter(fp0: Flatplan, pageId: string, n: number): Outcome {
    const what = "Can't add pages here"
    if (!(n >= 1 && Number.isInteger(n))) return refuse(what, "Give a whole number of pages, 1 or more.")
    const i = pageIndex(fp0, pageId)
    if (i < 0) return refuse(what, "That page is no longer in the issue.")
    if (!insertionAllowed(fp0, i + 1)) return refuse(what, "Nothing can go beside or outside the covers.", "Add them after a page inside the covers.")
    const fp = clone(fp0)
    const sid = fp.pages[i].sectionId
    const add = Array.from({ length: n }, () => blankPage(sid))
    fp.pages.splice(i + 1, 0, ...add)
    return fp
}
/** Add two or four blank pages at the end of the interior, in its last section. */
export function addPagesAtEnd(fp0: Flatplan, n: number): Outcome {
    const fp = clone(fp0)
    const [, e] = interior(fp)
    const last = fp.pages[e - 1]
    const sid = last && !(coversOn(fp) && last.cover) ? last.sectionId : firstInteriorSection(fp)
    fp.pages.splice(e, 0, ...Array.from({ length: n }, () => blankPage(sid)))
    return fp
}
export function removeLastTwo(fp0: Flatplan): Outcome {
    const [s, e] = interior(fp0)
    const what = "Can't remove the last two pages"
    if (e - s < 2) return refuse(what, "There aren't two pages inside the covers.")
    const two = fp0.pages.slice(e - 2, e)
    if (!two.every(isBlank)) return refuse(what, "They aren't blank.", "Clear or move what is on them first.")
    if (two.some((p) => p.locked)) return refuse(what, "One of them is locked.", "Unlock it first.")
    const fp = clone(fp0)
    fp.pages.splice(e - 2, 2)
    fp.stitchIns = fp.stitchIns.filter((x) => !two.some((p) => p.id == x.after))
    return fp
}
export function deletePages(fp0: Flatplan, ids: string[]): Outcome {
    const what = ids.length == 1 ? "Can't delete this page" : "Can't delete these pages"
    const ps = ids.map((id) => fp0.pages[pageIndex(fp0, id)]).filter((p) => p)
    if (coversOn(fp0) && ps.some(isCover)) return refuse(what, "A cover can't be deleted while covers are separate.", "Switch separate covers off in Print first.")
    if (ps.some((p) => p.locked)) return refuse(what, "A locked page can't be deleted.", "Unlock it first.")
    const fp = clone(fp0)
    fp.pages = fp.pages.filter((p) => !ids.includes(p.id))
    fp.stitchIns = fp.stitchIns.filter((x) => !ids.includes(x.after))
    if (fp.pages.length < 2) return refuse(what, "An issue always has at least two pages.")
    return fp
}
export function setAside(fp0: Flatplan, ids: string[]): Outcome {
    const what = "Can't set these pages aside"
    const ps = inBookOrder(fp0, ids).map((id) => fp0.pages[pageIndex(fp0, id)])
    if (coversOn(fp0) && ps.some(isCover)) return refuse(what, "The covers can't be set aside while covers are separate.", "Leave the covers out.")
    if (ps.some((p) => p.locked)) return refuse(what, "A locked page can't be set aside.", "Unlock it first.")
    const fp = clone(fp0)
    const moving = fp.pages.filter((p) => ids.includes(p.id))
    fp.pages = fp.pages.filter((p) => !ids.includes(p.id))
    fp.holding = [...fp.holding, ...moving]
    if (fp.pages.length < 2) return refuse(what, "An issue always has at least two pages.")
    return fp
}
/** Put a set-aside page back: after or before a page, or by default at the end of the interior. */
export function putBack(fp0: Flatplan, heldId: string, targetId: string, where: "before" | "after"): Outcome {
    const what = "Can't put this page back there"
    const h = fp0.holding.find((p) => p.id == heldId)
    if (!h) return refuse(what, "That page is no longer set aside.")
    let at: number
    if (targetId == "") at = interior(fp0)[1]
    else {
        at = insertionIndex(fp0, targetId, where)
        if (at < 0) return refuse(what, "That page is no longer in the issue.")
    }
    if (!insertionAllowed(fp0, at)) return refuse(what, "Nothing can go beside or outside the covers.", "Choose a page inside the covers.")
    const fp = clone(fp0)
    const page = fp.holding.find((p) => p.id == heldId)!
    fp.holding = fp.holding.filter((p) => p.id != heldId)
    const near = targetId != "" ? fp.pages[pageIndex(fp, targetId)] : fp.pages[at - 1]
    if (near && !(coversOn(fp) && near.cover)) page.sectionId = near.sectionId
    else if (!fp.sections.some((s) => s.id == page.sectionId)) page.sectionId = firstInteriorSection(fp)
    delete page.cover
    fp.pages.splice(at, 0, page)
    settleStorySections(fp)
    return fp
}
export function deleteHeld(fp0: Flatplan, heldId: string): Outcome {
    const fp = clone(fp0)
    fp.holding = fp.holding.filter((p) => p.id != heldId)
    fp.stitchIns = fp.stitchIns.filter((x) => x.after != heldId)
    return fp
}
/** Copy one page's layout and contents (and artwork) onto other pages. */
export function copyContents(fp0: Flatplan, srcId: string, targetIds: string[]): Outcome {
    const fp = clone(fp0)
    const src = fp.pages[pageIndex(fp, srcId)]
    if (!src) return refuse("Can't copy this page", "It is no longer in the issue.")
    const targets = targetIds.filter((id) => id != srcId)
    if (targets.length == 0) return refuse("Nothing to copy onto", "Choose the pages to copy onto.")
    for (const id of targets) {
        const p = fp.pages[pageIndex(fp, id)]
        if (!p) continue
        if (p.locked) return refuse("Can't copy onto a locked page", "A locked page doesn't change.", "Unlock it first, or leave it out.")
        p.layout = src.layout; p.turn = src.turn; p.flip = src.flip
        p.regions = src.regions.map((r) => ({ ...r, id: newId("r") }))
        if (src.art) p.art = { ...src.art }; else delete p.art
    }
    return fp
}
export function followingPages(fp: Flatplan, pageId: string, n: number): string[] {
    const i = pageIndex(fp, pageId)
    const [, e] = interior(fp)
    return fp.pages.slice(i + 1, Math.min(e, i + 1 + n)).map((p) => p.id)
}
export function setRestart(fp0: Flatplan, pageId: string, n: number | null): Outcome {
    const fp = clone(fp0)
    const p = fp.pages[pageIndex(fp, pageId)]
    if (!p) return refuse("Can't restart the numbering", "That page is no longer in the issue.")
    if (coversOn(fp) && p.cover) return refuse("Can't restart the numbering on a cover", "The covers stand outside the numbering.")
    if (n == null) delete p.restart
    else {
        if (!Number.isInteger(n) || n < 0) return refuse("Can't restart the numbering", "Give a whole number, 0 or more.")
        p.restart = n
    }
    return fp
}

/** Change one page: anything in `patch`, the rules permitting. */
export function updatePage(fp0: Flatplan, pageId: string, patch: Partial<Page>): Outcome {
    const fp = clone(fp0)
    const p = fp.pages[pageIndex(fp, pageId)] ?? fp.holding.find((h) => h.id == pageId)
    if (!p) return refuse("Can't change this page", "It is no longer in the issue.")
    Object.assign(p, JSON.parse(JSON.stringify(patch)))
    if (patch.sectionId) settleStorySections(fp)
    return fp
}
export function updatePages(fp0: Flatplan, ids: string[], f: (p: Page) => void): Outcome {
    const fp = clone(fp0)
    ids.forEach((id) => { const p = fp.pages[pageIndex(fp, id)]; if (p) f(p) })
    return fp
}
/** A new layout (turned and flipped): fewer regions only when the ones it drops are empty. */
export function setLayout(fp0: Flatplan, pageId: string, layout: string, turn: number, flip: boolean): Outcome {
    const fp = clone(fp0)
    const p = fp.pages[pageIndex(fp, pageId)]
    if (!p) return refuse("Can't change the layout", "That page is no longer in the issue.")
    const n = layoutOf(layout).rects.length
    const dropped = p.regions.slice(n)
    if (!dropped.every(regionEmpty))
        return refuse("Can't use that layout", "It has fewer regions, and the ones it would drop aren't empty.",
            "Clear the last " + plural(dropped.length, "region") + " first, or choose a layout with " + p.regions.length + " or more.")
    p.layout = layout; p.turn = ((turn % 4) + 4) % 4; p.flip = flip
    p.regions = [...p.regions.slice(0, n), ...Array.from({ length: Math.max(0, n - p.regions.length) }, blankRegion)]
    return fp
}
export function updateRegion(fp0: Flatplan, pageId: string, regionIdx: number, patch: Partial<Region>, clear: string[] = []): Outcome {
    const fp = clone(fp0)
    const p = fp.pages[pageIndex(fp, pageId)]
    const r = p?.regions[regionIdx]
    if (!r) return refuse("Can't change this region", "It is no longer on the page.")
    Object.assign(r, patch)
    clear.forEach((k) => { delete (r as unknown as Record<string, unknown>)[k] })
    settleStorySections(fp)
    return fp
}
export function clearRegion(fp: Flatplan, pageId: string, regionIdx: number): Outcome {
    return updateRegion(fp, pageId, regionIdx, { kind: "unassigned", label: "" }, ["storyId", "bookingId"])
}

// ── Stories ──────────────────────────────────────────────────────────────────────────────────

export function newStory(fp: Flatplan, f: Partial<Story>): Story {
    return { id: newId("s-"), title: (f.title ?? "").trim(), sectionId: f.sectionId ?? firstInteriorSection(fp),
        kind: f.kind ?? "editorial", pages: f.pages ?? 4, editor: f.kind == "advertising" ? "" : f.editor ?? "",
        status: fp.statuses[0]?.id ?? "", notes: f.notes ?? "", rightStart: f.rightStart ?? false }
}
export function addStory(fp0: Flatplan, s: Story): Outcome {
    if (s.title.trim() == "") return refuse("Can't add the story", "A story needs a title.")
    if (!(s.pages >= 1 && s.pages <= 400)) return refuse("Can't add the story", "Planned pages must be 1 to 400.")
    const fp = clone(fp0)
    fp.stories.push(s)
    return fp
}
/** Add a story straight onto a region of a page. */
export function addStoryOnRegion(fp0: Flatplan, s: Story, pageId: string, regionIdx: number): Outcome {
    const a = addStory(fp0, s)
    if (isRefusal(a)) return a
    return updateRegion(a, pageId, regionIdx, { kind: s.kind, storyId: s.id }, ["bookingId"])
}
/** Add a story at the end of a section, with as many new pages there as it plans, placed on them. */
export function addStoryAtSectionEnd(fp0: Flatplan, s: Story): Outcome {
    const a = addStory(fp0, s)
    if (isRefusal(a)) return a
    const fp = a
    const cs = coverSections(fp)
    if (cs.includes(s.sectionId)) return refuse("Can't add pages to a cover section", "The cover sections hold only the covers while covers are separate.", "Choose another section.")
    let at = -1
    fp.pages.forEach((p, i) => { if (p.sectionId == s.sectionId) at = i + 1 })
    if (at < 0) {
        const order = fp.sections.map((x) => x.id)
        const before = new Set(order.slice(0, order.indexOf(s.sectionId)))
        at = interior(fp)[0]
        fp.pages.forEach((p, i) => { if (before.has(p.sectionId) && !(coversOn(fp) && p.cover)) at = i + 1 })
    }
    if (!insertionAllowed(fp, at)) at = interior(fp)[1]
    const pages = Array.from({ length: s.pages }, () => {
        const p = blankPage(s.sectionId)
        p.regions = [{ id: newId("r"), kind: s.kind, storyId: s.id, label: "" }]
        return p
    })
    fp.pages.splice(at, 0, ...pages)
    return fp
}
/** Every page a story could start on: enough consecutive pages, inside the covers, unlocked and blank. */
export function fitsFor(fp: Flatplan, storyId: string): number[] {
    const s = storyById(fp, storyId)
    if (!s) return []
    const [b, e] = interior(fp)
    const sl = slots(fp)
    const out: number[] = []
    for (let i = b; i + s.pages <= e; i++) {
        if (s.rightStart && fp.facing && sl[i].side != "right") continue
        let ok = true
        for (let k = 0; k < s.pages && ok; k++) { const p = fp.pages[i + k]; ok = !p.locked && isBlank(p) }
        if (ok) out.push(i)
    }
    return out
}
export function placeStory(fp0: Flatplan, storyId: string, startId: string): Outcome {
    const s = storyById(fp0, storyId)
    const what = "Can't place " + (s ? "“" + s.title + "”" : "the story") + " there"
    if (!s) return refuse(what, "That story no longer exists.")
    if (isPlaced(fp0, storyId)) return refuse(what, "It is already placed.")
    const i = pageIndex(fp0, startId)
    const [b, e] = interior(fp0)
    if (i < b || i + s.pages > e) return refuse(what, "It needs " + plural(s.pages, "page") + " in a row inside the covers, and there aren't that many from here.", "Choose an earlier page, or add pages.")
    for (let k = 0; k < s.pages; k++) {
        const p = fp0.pages[i + k]
        if (p.locked) return refuse(what, "A page it needs is locked.", "Unlock it, or choose another place.")
        if (!isBlank(p)) return refuse(what, "Not all of the " + plural(s.pages, "page") + " from here are blank, and placing never overwrites anything.", "Clear them first, or choose a place from the list of places it fits.")
    }
    if (s.rightStart && fp0.facing && slots(fp0)[i].side != "right") return refuse(what, "It must open on a right-hand page, and this is a left-hand one.", "Choose a right-hand page.")
    const fp = clone(fp0)
    for (let k = 0; k < s.pages; k++) {
        const p = fp.pages[i + k]
        p.layout = "full"; p.turn = 0; p.flip = false
        p.regions = [{ id: newId("r"), kind: s.kind, storyId: s.id, label: "" }]
    }
    settleStorySections(fp)
    return fp
}
export function updateStory(fp0: Flatplan, storyId: string, patch: Partial<Story>): Outcome {
    const fp = clone(fp0)
    const s = fp.stories.find((x) => x.id == storyId)
    if (!s) return refuse("Can't change the story", "It no longer exists.")
    if (patch.title != null && patch.title.trim() == "") return refuse("Can't change the title", "A story's title can't be empty.")
    const placed = isPlaced(fp, storyId)
    if (placed && (patch.sectionId != null && patch.sectionId != s.sectionId || patch.pages != null && patch.pages != s.pages || patch.kind != null && patch.kind != s.kind))
        return refuse("Can't change that while it is placed", "A placed story's section, planned pages and kind follow its pages.", "Change its pages instead.")
    if (patch.pages != null && !(patch.pages >= 1 && patch.pages <= 400 && Number.isInteger(patch.pages))) return refuse("Can't change the planned pages", "Planned pages must be a whole number from 1 to 400.")
    Object.assign(s, patch)
    if (s.kind == "advertising") s.editor = ""
    return fp
}
export function deleteStory(fp0: Flatplan, storyId: string): Outcome {
    if (isPlaced(fp0, storyId)) return refuse("Can't delete a placed story", "Some pages carry it.", "Clear it from its pages first.")
    const fp = clone(fp0)
    fp.stories = fp.stories.filter((s) => s.id != storyId)
    return fp
}
export function setStatusOn(fp0: Flatplan, ids: string[], statusId: string): Outcome {
    const fp = clone(fp0)
    const stories = new Set<string>()
    ids.forEach((id) => { const p = fp.pages[pageIndex(fp, id)]; if (p) storiesOn(p).forEach((s) => stories.add(s)) })
    if (stories.size == 0) return refuse("No stories to change", "None of these pages carries a story.")
    fp.stories.forEach((s) => { if (stories.has(s.id)) s.status = statusId })
    return fp
}

// ── Sections, statuses, tags ─────────────────────────────────────────────────────────────────

export function addNamed(fp0: Flatplan, list: "sections" | "statuses" | "tags", name: string, color: string): Outcome {
    if (name.trim() == "") return refuse("Can't add it", "It needs a name.")
    const fp = clone(fp0)
    const prefix = list == "sections" ? "sec-" : list == "statuses" ? "st-" : "t-"
    const item = { id: newId(prefix), name: name.trim(), color }
    if (list == "sections" && coversOn(fp)) {
        // A new section goes inside the covers.
        const back = fp.pages[fp.pages.length - 1]?.sectionId
        const at = fp.sections.findIndex((s) => s.id == back)
        if (at > 0) { fp.sections.splice(at, 0, item); return fp }
    }
    fp[list].push(item)
    return fp
}
export function updateNamed(fp0: Flatplan, list: "sections" | "statuses" | "tags", id: string, patch: Partial<Named>): Outcome {
    if (patch.name != null && patch.name.trim() == "") return refuse("Can't rename it", "A name can't be empty.")
    const fp = clone(fp0)
    const item = fp[list].find((x) => x.id == id)
    if (!item) return refuse("Can't change it", "It no longer exists.")
    Object.assign(item, patch)
    return fp
}
export function removeSection(fp0: Flatplan, id: string): Outcome {
    const sec = fp0.sections.find((s) => s.id == id)
    const what = "Can't remove " + (sec?.name ?? "this section")
    if (!sec) return refuse(what, "It no longer exists.")
    if (fp0.sections.length <= 1) return refuse(what, "An issue always has at least one section.")
    if (coverSections(fp0).includes(id)) return refuse(what, "The cover sections stay while covers are separate.", "Switch separate covers off in Print first.")
    const i = fp0.sections.findIndex((s) => s.id == id)
    const heir = fp0.sections[i > 0 ? i - 1 : 1].id
    if (fp0.pages.some((p) => p.sectionId == id && p.locked)) return refuse(what, "Some of its pages are locked.", "Unlock them first.")
    const fp = clone(fp0)
    fp.sections = fp.sections.filter((s) => s.id != id)
    fp.pages.forEach((p) => { if (p.sectionId == id) p.sectionId = heir })
    fp.holding.forEach((p) => { if (p.sectionId == id) p.sectionId = heir })
    fp.stories.forEach((s) => { if (s.sectionId == id) s.sectionId = heir })
    return fp
}
export function removeStatus(fp0: Flatplan, id: string): Outcome {
    if (fp0.statuses.length <= 1) return refuse("Can't remove the last status", "At least one status stays.")
    const fp = clone(fp0)
    fp.statuses = fp.statuses.filter((s) => s.id != id)
    const heir = fp.statuses[0].id
    fp.stories.forEach((s) => { if (s.status == id) s.status = heir })
    return fp
}
export function removeTag(fp0: Flatplan, id: string): Outcome {
    const fp = clone(fp0)
    fp.tags = fp.tags.filter((t) => t.id != id)
    fp.pages.forEach((p) => { p.tags = p.tags.filter((t) => t != id) })
    fp.holding.forEach((p) => { p.tags = p.tags.filter((t) => t != id) })
    return fp
}
export function setTag(fp0: Flatplan, ids: string[], tagId: string, on: boolean): Outcome {
    return updatePages(fp0, ids, (p) => {
        if (p.locked) return
        p.tags = on ? (p.tags.includes(tagId) ? p.tags : [...p.tags, tagId]) : p.tags.filter((t) => t != tagId)
    })
}

// ── Bookings ─────────────────────────────────────────────────────────────────────────────────

export function addBooking(fp0: Flatplan, b: Omit<Booking, "id">): Outcome {
    if (b.text.trim() == "") return refuse("Can't add the booking", "A booking needs its text.")
    const fp = clone(fp0)
    fp.bookings.push({ id: newId("b-"), ref: b.ref.trim(), text: b.text.trim(), size: b.size.trim(), shape: b.shape, want: b.want })
    return fp
}
export function importBookings(fp0: Flatplan, rows: BookingRow[]): { fp: Outcome; added: number; updated: number } {
    const fp = clone(fp0)
    let added = 0, updated = 0
    for (const r of rows) {
        if (r.ref != "") {
            const b = fp.bookings.find((x) => x.ref == r.ref)
            if (b) { Object.assign(b, { text: r.text, want: r.want, size: r.size, shape: r.shape }); updated++; continue }
        } else if (fp.bookings.some((x) => x.text.trim().toLowerCase() == r.text.toLowerCase())) {
            return { fp: refuse("Can't import the list", "The row “" + r.text + "” has no reference, and a booking with that text already exists.",
                "Give it a reference in the booking system's export, so it can update the booking instead."), added: 0, updated: 0 }
        }
        fp.bookings.push({ id: newId("b-"), ...r })
        added++
    }
    if (added + updated == 0) return { fp: refuse("Nothing to import", "The file has no rows with text after its header row.", "Fill in the template and try again."), added, updated }
    return { fp, added, updated }
}
export function removeBooking(fp0: Flatplan, id: string): Outcome {
    const fp = clone(fp0)
    fp.bookings = fp.bookings.filter((b) => b.id != id)
    const open = (p: Page) => p.regions.forEach((r) => {
        if (r.bookingId == id) { delete r.bookingId; r.kind = "unassigned"; r.label = "" }
    })
    fp.pages.forEach(open); fp.holding.forEach(open)
    return fp
}

// ── Artwork ──────────────────────────────────────────────────────────────────────────────────

/** Attach a PDF and give its pages to pages of the issue: assign[k] is the page id for PDF page k+1, or "". */
export function attachArtwork(fp0: Flatplan, asset: Asset, assign: string[]): Outcome {
    if (!assign.some((a) => a != "")) return refuse("Nothing to save", "Assign at least one page of the PDF to a page of the issue.")
    const fp = clone(fp0)
    if (!fp.assets.some((a) => a.id == asset.id)) fp.assets.push(asset)
    assign.forEach((pid, k) => {
        if (pid == "") return
        const p = fp.pages[pageIndex(fp, pid)]
        if (p) p.art = { assetId: asset.id, page: k + 1 }
    })
    return fp
}
export function removeAsset(fp0: Flatplan, assetId: string): Outcome {
    const fp = clone(fp0)
    fp.assets = fp.assets.filter((a) => a.id != assetId)
    const off = (p: Page) => { if (p.art?.assetId == assetId) delete p.art }
    fp.pages.forEach(off); fp.holding.forEach(off)
    return fp
}
export function detachArt(fp0: Flatplan, ids: string[]): Outcome {
    return updatePages(fp0, ids, (p) => { delete p.art })
}
export function assetUse(fp: Flatplan, assetId: string): number { return fp.pages.filter((p) => p.art?.assetId == assetId).length }
/** A sensible first assignment: consecutive pages from a start, one PDF page each. */
export function consecutive(fp: Flatplan, startId: string, n: number): string[] {
    const i = pageIndex(fp, startId)
    return Array.from({ length: n }, (_, k) => (i >= 0 && fp.pages[i + k] ? fp.pages[i + k].id : ""))
}

// ── The issue's settings ─────────────────────────────────────────────────────────────────────

export function setTrim(fp0: Flatplan, w: number, h: number): Outcome {
    if (!(w > 0 && h > 0 && isFinite(w) && isFinite(h))) return refuse("Can't use that trim", "The width and height must be more than 0 inches.")
    const fp = clone(fp0); fp.trimW = w; fp.trimH = h
    return fp
}
export function setCovers(fp0: Flatplan, on: boolean): Outcome {
    const fp = clone(fp0)
    if (!on) {
        fp.numbering = "plain"
        fp.pages.forEach((p) => { delete p.cover })
        return fp
    }
    if (fp.pages.length < 6) return refuse("Can't make separate covers", "The issue needs at least six pages.", "Add pages first.")
    const n = fp.pages.length
    if ([0, 1, n - 2, n - 1].some((i) => fp.pages[i].locked)) return refuse("Can't make separate covers", "One of the first two or last two pages is locked.", "Unlock it first.")
    let front = fp.sections.find((s) => s.name.toLowerCase() == "covers")
    if (!front) { front = { id: newId("sec-"), name: "Covers", color: PALETTE[0] }; fp.sections.unshift(front) }
    let back = fp.sections.find((s) => s.name.toLowerCase() == "back covers")
    if (!back) { back = { id: newId("sec-"), name: "Back Covers", color: PALETTE[0] }; fp.sections.push(back) }
    fp.sections = [front, ...fp.sections.filter((s) => s.id != front!.id && s.id != back!.id), back]
    fp.numbering = "covers"
    fp.pages.forEach((p) => { delete p.cover })
    const kinds: CoverKind[] = ["front", "inside-front", "inside-back", "back"];
    [0, 1, n - 2, n - 1].forEach((i, k) => { fp.pages[i].cover = kinds[k]; fp.pages[i].sectionId = k < 2 ? front!.id : back!.id; delete fp.pages[i].restart })
    // Any interior page still in a cover section joins the first section inside.
    const inner = fp.sections.find((s) => s.id != front!.id && s.id != back!.id)
    if (inner) fp.pages.forEach((p) => { if (!p.cover && (p.sectionId == front!.id || p.sectionId == back!.id)) p.sectionId = inner.id })
    return fp
}
export function addStitchIn(fp0: Flatplan, afterId: string): Outcome {
    const fp = clone(fp0)
    if (pageIndex(fp, afterId) < 0) return refuse("Can't add a stitch-in", "That page is no longer in the issue.")
    fp.stitchIns.push({ id: newId("x-"), after: afterId, front: "", back: "" })
    return fp
}

// ── The rules every change keeps ─────────────────────────────────────────────────────────────

/** The stories that must open on a right-hand page but open on a left-hand one. */
export function rightStartViolations(fp: Flatplan): string[] {
    if (!fp.facing) return []
    const sl = slots(fp)
    return fp.stories.filter((s) => {
        if (!s.rightStart) return false
        const idx = pagesOfStory(fp, s.id)
        return idx.length > 0 && sl[idx[0]].side != "right"
    }).map((s) => s.id)
}

function sameContent(a: Page, b: Page): boolean {
    const strip = (p: Page) => JSON.stringify({ ...p, locked: false })
    return strip(a) == strip(b)
}

/** Hold a change to the rules (F-RULE-01…04). `what` names the change for the refusal. */
export function checkRules(old: Flatplan, fp: Flatplan, what: string): Refusal | null {
    const no = (why: string, instead = "") => refuse("Can't " + what.charAt(0).toLowerCase() + what.slice(1), why, instead)
    if (fp.pages.length < 2) return no("An issue always has at least two pages.")
    if (fp.sections.length < 1) return no("An issue always has at least one section.")
    const secs = new Set(fp.sections.map((s) => s.id))
    if ([...fp.pages, ...fp.holding].some((p) => !secs.has(p.sectionId))) return no("Every page must belong to a section that exists.")
    if (!(fp.trimW > 0 && fp.trimH > 0)) return no("The trim must be more than 0 inches each way.")
    if ([...fp.pages, ...fp.holding].some((p) => p.regions.length != layoutOf(p.layout).rects.length)) return no("A page must have exactly as many regions as its layout.")
    if (coversOn(fp)) {
        const n = fp.pages.length
        const want: CoverKind[] = ["front", "inside-front", "inside-back", "back"]
        const at = [0, 1, n - 2, n - 1]
        if (n < 4 || at.some((i, k) => fp.pages[i].cover != want[k]) || fp.pages.filter((p) => p.cover).length != 4)
            return no("With separate covers, the four cover pages stay first and last, in order.", "Switch separate covers off in Print first.")
        if (coversOn(old)) {
            for (const p of fp.pages.filter((x) => x.cover)) {
                const o = old.pages.find((x) => x.id == p.id)
                if (o && o.cover && o.sectionId != p.sectionId) return no("The covers stay in their cover sections.")
            }
        }
    }
    for (const o of old.pages.filter((p) => p.locked)) {
        const p = fp.pages.find((x) => x.id == o.id)
        if (!p) return no("A locked page can't be deleted or set aside.", "Unlock it first.")
        if (!sameContent(o, p)) return no("A locked page doesn't change, except to be unlocked.", "Unlock it first, from its panel.")
    }
    const before = new Set(rightStartViolations(old))
    const now = rightStartViolations(fp).filter((id) => !before.has(id))
    if (now.length > 0) {
        const s = storyById(fp, now[0])!
        return no("“" + s.title + "” must open on a right-hand page, and this would open it on a left-hand one.",
            "Move it one page earlier or later, or add a page before it.")
    }
    return null
}

// ── New flatplans ────────────────────────────────────────────────────────────────────────────

export function emptyFlatplan(id: string): Flatplan {
    return { id, name: "", edition: "", publication: "", trimW: 9, trimH: 12, facing: true, numbering: "plain", firstFolio: 1,
        notes: "", archived: false, sections: [], statuses: [], tags: [], stories: [], pages: [], holding: [], assets: [],
        bookings: [], stitchIns: [], signatures: { cover: [], body: [] } }
}
/** A new workspace's first flatplan (F-WS-05). */
export function firstFlatplan(publication: string, editorUid: string): Flatplan {
    const fp = emptyFlatplan(newId("flatplan-"))
    Object.assign(fp, { name: "Issue 01", edition: "First issue", publication, numbering: "covers", signatures: { cover: [4], body: [16, 12] } })
    const sec = (name: string, color: string) => ({ id: newId("sec-"), name, color })
    fp.sections = [sec("Covers", PALETTE[0]), sec("Front of Book", PALETTE[1]), sec("Features", PALETTE[2]), sec("Back of Book", PALETTE[8]), sec("Back Covers", PALETTE[0])]
    fp.statuses = [["Idea", "#98a4a6"], ["Assigned", "#80a7ff"], ["In progress", "#3fa9f5"], ["In review", "#ffd75e"], ["Ready", "#c2f04c"]]
        .map(([n, c]) => ({ id: newId("st-"), name: n, color: c }))
    fp.tags = [{ id: newId("t-"), name: "Awaiting copy", color: PALETTE[7] }, { id: newId("t-"), name: "Signed off", color: PALETTE[0] }]
    const counts = [2, 6, 18, 4, 2]
    counts.forEach((c, k) => { for (let i = 0; i < c; i++) fp.pages.push(blankPage(fp.sections[k].id)) })
    const n = fp.pages.length
    fp.pages[0].cover = "front"; fp.pages[1].cover = "inside-front"; fp.pages[n - 2].cover = "inside-back"; fp.pages[n - 1].cover = "back"
    fp.stories = [{ id: newId("s-"), title: "The cover story", sectionId: fp.sections[2].id, kind: "editorial", pages: 6, editor: editorUid,
        status: fp.statuses[0].id, notes: "", rightStart: false }]
    return fp
}
export type Start = "plan" | "copy" | "empty"
/** A new issue from this one: the same plan, a copy, or empty pages (F-WS-05). */
export function newIssueFrom(src: Flatplan, start: Start, name: string, edition: string, pages: number): Flatplan | Refusal {
    if (name.trim() == "") return refuse("Can't start the issue", "It needs a name.")
    const id = newId("flatplan-")
    if (start == "copy") return { ...clone(src), id, name: name.trim(), edition: edition.trim(), archived: false }
    const fp = emptyFlatplan(id)
    Object.assign(fp, { name: name.trim(), edition: edition.trim(), publication: src.publication, trimW: src.trimW, trimH: src.trimH,
        facing: src.facing, numbering: src.numbering, firstFolio: src.firstFolio, signatures: clone(src).signatures })
    fp.sections = clone(src).sections
    fp.statuses = clone(src).statuses
    fp.tags = clone(src).tags
    if (start == "plan") {
        fp.pages = src.pages.map((p) => {
            const q: Page = { id: newId("p"), sectionId: p.sectionId, layout: p.layout, turn: p.turn, flip: p.flip, tags: [], notes: "", locked: false,
                regions: p.regions.map((r) => ({ id: newId("r"), kind: r.kind, label: "" })) }
            if (p.cover) q.cover = p.cover
            if (p.restart != null) q.restart = p.restart
            return q
        })
        return fp
    }
    if (!(Number.isInteger(pages) && pages >= 4 && pages % 2 == 0)) return refuse("Can't start the issue", "Give an even number of pages, at least 4.")
    const inner = firstInteriorSection(src)
    const cs = coverSections(src)
    if (coversOn(src) && cs.length > 0) {
        const front = src.pages[0].sectionId, back = src.pages[src.pages.length - 1].sectionId
        const ps = Array.from({ length: pages }, (_, i) => blankPage(i < 2 ? front : i >= pages - 2 ? back : inner))
        ps[0].cover = "front"; ps[1].cover = "inside-front"; ps[pages - 2].cover = "inside-back"; ps[pages - 1].cover = "back"
        fp.pages = ps
    } else {
        fp.numbering = "plain"
        fp.pages = Array.from({ length: pages }, () => blankPage(inner))
    }
    return fp
}

// ── Records: how a flatplan is stored (api/API.md, "How a flatplan is stored") ────────────────

/** Every record of a flatplan, keyed by its path under doc/, as the JSON text stored in `v`. */
export function toRecords(fp: Flatplan): Map<string, string> {
    const out = new Map<string, string>()
    FIELDS.forEach((f) => out.set("fields/" + f, JSON.stringify((fp as unknown as Record<string, unknown>)[f] ?? null)))
    LISTS.forEach((l) => {
        const items = (fp[l] as { id: string }[]) ?? []
        out.set("lists/" + l + "/order", JSON.stringify(items.map((x) => x.id)))
        items.forEach((x) => out.set("lists/" + l + "/items/" + idKey(x.id), JSON.stringify(x)))
    })
    return out
}
/** The records a change writes: those whose text differs, a removed entry as "null". */
export function diffRecords(before: Map<string, string>, after: Map<string, string>): Map<string, string> {
    const out = new Map<string, string>()
    after.forEach((v, k) => { if (before.get(k) !== v) out.set(k, v) })
    before.forEach((v, k) => { if (!after.has(k) && v !== "null") out.set(k, "null") })
    return out
}
/** Assemble a flatplan from its stored records: each list in its order, with any item missing from it after. */
export function fromRecords(id: string, raw: { fields?: Record<string, { v: string }>; lists?: Record<string, { order?: { v: string }; items?: Record<string, { v: string }> }> }): Flatplan {
    const fp = emptyFlatplan(id)
    const rec = fp as unknown as Record<string, unknown>
    Object.entries(raw?.fields ?? {}).forEach(([k, r]) => {
        if (k == "id") return
        try { const v = JSON.parse(r.v); if (v !== null) rec[k] = v } catch { /* a record that can't be read is left at its default */ }
    })
    LISTS.forEach((l) => {
        const node = raw?.lists?.[l]
        if (!node) return
        let order: string[] = []
        try { order = JSON.parse(node.order?.v ?? "[]") ?? [] } catch { order = [] }
        const items = new Map<string, unknown>()
        Object.values(node.items ?? {}).forEach((r) => {
            try { const v = JSON.parse(r.v); if (v && typeof v == "object" && (v as { id?: string }).id) items.set((v as { id: string }).id, v) } catch { /* skip */ }
        })
        const out: unknown[] = []
        order.forEach((oid) => { if (items.has(oid)) { out.push(items.get(oid)); items.delete(oid) } })
        items.forEach((v) => out.push(v))
        rec[l] = out
    })
    // Old or partial records: give every page the fields the program relies on.
    ;[...fp.pages, ...fp.holding].forEach((p) => {
        p.tags = p.tags ?? []; p.notes = p.notes ?? ""; p.locked = p.locked ?? false; p.turn = p.turn ?? 0; p.flip = p.flip ?? false
        p.regions = (p.regions ?? []).map((r) => ({ ...r, label: r.label ?? "" }))
    })
    fp.signatures = fp.signatures ?? { cover: [], body: [] }
    return fp
}

// ── Print sections ───────────────────────────────────────────────────────────────────────────

export function printCheck(fp: Flatplan): { total: number; pages: number; held: number; diff: number; advice: string } {
    const total = [...fp.signatures.cover, ...fp.signatures.body].reduce((a, b) => a + b, 0)
    const pages = fp.pages.length, held = fp.holding.length
    const diff = total - pages
    let advice = "The print sections and the issue agree."
    if (diff > 0) advice = "The print sections hold " + plural(diff, "page") + " more than the issue: add " + plural(diff, "page") + ", or take a print section away" + (held > 0 ? " (or put back some of the " + held + " set aside)" : "") + "."
    if (diff < 0) advice = "The issue has " + plural(-diff, "page") + " more than the print sections: add a print section, or remove " + plural(-diff, "page") + "."
    return { total, pages, held, diff, advice }
}

// ── Backups ──────────────────────────────────────────────────────────────────────────────────

export function backupName(fp: Flatplan): string {
    const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    return [slug(fp.publication), slug(fp.name)].filter((s) => s != "").join("-") + ".json"
}
export interface Backup { format: "pagemap-backup"; version: 1; flatplan: Flatplan; comments: unknown[]; files: Record<string, string> }
export function readBackup(text: string): Backup | Refusal {
    let b: Backup
    try { b = JSON.parse(text) } catch { return refuse("Can't restore from this file", "It isn't a Pagemap backup: it isn't JSON.", "Choose a .json file saved with Back up.") }
    if (!b || b.format != "pagemap-backup") return refuse("Can't restore from this file", "It isn't a Pagemap backup.", "Choose a .json file saved with Back up.")
    if (b.version != 1) return refuse("Can't restore from this file", "It was saved by a version of Pagemap this one can't read (version " + b.version + ").")
    if (!b.flatplan || !Array.isArray(b.flatplan.pages)) return refuse("Can't restore from this file", "The backup has no flatplan in it.")
    return b
}
/** Restoring keeps the open flatplan's id and replaces everything else. */
export function restoreFrom(open: Flatplan, b: Backup): Flatplan {
    const fp = { ...emptyFlatplan(open.id), ...clone(b.flatplan), id: open.id }
    return fromRecords(open.id, recordsAsRaw(toRecords(fp)))
}
function recordsAsRaw(recs: Map<string, string>) {
    const raw: { fields: Record<string, { v: string }>; lists: Record<string, { order?: { v: string }; items: Record<string, { v: string }> }> } = { fields: {}, lists: {} }
    recs.forEach((v, k) => {
        const parts = k.split("/")
        if (parts[0] == "fields") raw.fields[parts[1]] = { v }
        else {
            const l = (raw.lists[parts[1]] = raw.lists[parts[1]] ?? { items: {} })
            if (parts[2] == "order") l.order = { v }; else l.items[parts[3]] = { v }
        }
    })
    return raw
}

/** The pages that changed places between two orders: those outside the longest run kept in order. */
export function movedPages(before: string[], after: string[]): string[] {
    const pos = new Map(before.map((id, i) => [id, i]))
    const seq = after.filter((id) => pos.has(id))
    if (seq.length == 0 || before.length == 0) return []
    const vals = seq.map((id) => pos.get(id)!)
    const tails: number[] = [], prev: number[] = new Array(vals.length).fill(-1), at: number[] = []
    vals.forEach((v, i) => {
        let lo = 0, hi = tails.length
        while (lo < hi) { const m = (lo + hi) >> 1; if (vals[tails[m]] < v) lo = m + 1; else hi = m }
        if (lo > 0) prev[i] = tails[lo - 1]
        tails[lo] = i
        at[i] = lo
    })
    const keep = new Set<number>()
    let k = tails.length ? tails[tails.length - 1] : -1
    while (k >= 0) { keep.add(k); k = prev[k] }
    return seq.filter((_, i) => !keep.has(i))
}

/** Set one of the flatplan's own fields: its names, facing, where numbering starts, notes, archived. */
export function setField(fp0: Flatplan, field: "name" | "edition" | "publication" | "facing" | "firstFolio" | "notes" | "archived" | "signatures", v: unknown): Outcome {
    if (field == "name" && String(v).trim() == "") return refuse("Can't rename the issue", "An issue's name can't be empty.")
    if (field == "firstFolio" && !(Number.isInteger(v) && (v as number) >= 0)) return refuse("Can't change where numbering starts", "Give a whole number, 0 or more.")
    const fp = clone(fp0)
    ;(fp as unknown as Record<string, unknown>)[field] = v
    return fp
}
export function updateStitchIn(fp0: Flatplan, id: string, patch: Partial<StitchIn>): Outcome {
    const fp = clone(fp0)
    const x = fp.stitchIns.find((s) => s.id == id)
    if (!x) return refuse("Can't change the stitch-in", "It no longer exists.")
    Object.assign(x, patch)
    return fp
}
export function removeStitchIn(fp0: Flatplan, id: string): Outcome {
    const fp = clone(fp0)
    fp.stitchIns = fp.stitchIns.filter((s) => s.id != id)
    return fp
}
export function setSignatures(fp0: Flatplan, part: "cover" | "body", counts: number[]): Outcome {
    const was = fp0.signatures[part] ?? []
    const added = counts.slice(was.length)
    if (added.some((c) => ![4, 8, 16, 24, 32].includes(c))) return refuse("Can't use that print section", "Print sections are 4, 8, 16, 24 or 32 pages.")
    const fp = clone(fp0)
    fp.signatures = { ...fp.signatures, [part]: counts }
    return fp
}
