// ledger.ts — the plain functions Ledger's constraints call: money and dates
// written out for a reader, the date ranges the filter steps through, typed
// dates and amounts read back, and the filter turned into the service's query
// string. Every function here is a function of its arguments; nothing is
// reactive, and nothing reads a clock (today comes from the service).

// ── money ────────────────────────────────────────────────────────────────
// Amounts are whole cents everywhere. They are only ever turned into text
// here, at the edge, and never rounded on the way to a total.

const MINUS = "−"

function groupDigits(n: number): string {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** "$1,204.50", or "−$45.00" for a negative amount. */
export function money(cents: number): string {
    const c = Math.round(cents)
    const a = Math.abs(c)
    const s = "$" + groupDigits(Math.floor(a / 100)) + "." + String(a % 100).padStart(2, "0")
    return c < 0 ? MINUS + s : s
}

/** As `money`, but a positive amount carries its "+" — for changes. */
export function moneySigned(cents: number): string {
    return cents > 0 ? "+" + money(cents) : money(cents)
}

/** The compact form, for chart axes only: "$1.2k", "$850", "−$3k". */
export function moneyCompact(cents: number): string {
    const d = Math.abs(cents) / 100
    const sign = cents < 0 ? MINUS : ""
    if (d >= 1000000) return sign + "$" + trimZero((d / 1000000).toFixed(1)) + "M"
    if (d >= 1000) return sign + "$" + trimZero((d / 1000).toFixed(d >= 10000 ? 0 : 1)) + "k"
    return sign + "$" + Math.round(d)
}

/** Whole dollars, for slider labels and chips: "$20", "$1,000". */
export function dollars(cents: number): string {
    const d = cents / 100
    return "$" + (Number.isInteger(d) ? groupDigits(d) : groupDigits(Math.floor(d)) + "." + String(Math.round(cents) % 100).padStart(2, "0"))
}

function trimZero(s: string): string { return s.replace(/\.0$/, "") }

/** A typed amount read as cents: "42.5", "$1,204.50", "12" → 4250, 120450, 1200; null when it isn't one. */
export function parseMoney(text: string): number | null {
    const t = text.trim().replace(/^\$/, "").replace(/,/g, "")
    if (t == "") return null
    if (!/^\d+(\.\d{0,2})?$/.test(t)) return null
    const [whole, frac = ""] = t.split(".")
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2))
}

/** An amount as it is typed back into a field: "1204.50". */
export function moneyInput(cents: number | null | undefined): string {
    if (cents == null) return ""
    return Math.floor(cents / 100) + "." + String(cents % 100).padStart(2, "0")
}

/** A percentage: "69.0%". */
export function pct(p: number | null | undefined): string {
    return p == null ? "—" : p.toFixed(1) + "%"
}

/** A change, signed with an arrow: "▲ 12%", "▼ 3%", "— 0%". */
export function changeWords(cur: number, prev: number): string {
    if (prev == 0) return cur == 0 ? "no change" : "new"
    const p = ((cur - prev) / Math.abs(prev)) * 100
    const r = Math.round(p)
    if (r == 0) return "▶ 0%"
    return (r > 0 ? "▲ " : "▼ ") + Math.abs(r) + "%"
}

/** A friendly axis step at or above `raw`: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(raw: number): number {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, raw))))
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p
    return 10 * p
}

/** A change said in words: "up 6% from February", "down $40.00 from Oct", "no change from Oct". */
export function changeSentence(cur: number, prev: number, name: string, unit: string): string {
    if (unit == "percent") {
        const d = Math.round((cur - prev) * 10) / 10
        return d == 0 ? "no change from " + name : (d > 0 ? "up " : "down ") + Math.abs(d).toFixed(1) + " points from " + name
    }
    if (prev == 0) return cur == 0 ? "no change from " + name : "none in " + name
    const p = Math.round(((cur - prev) / Math.abs(prev)) * 100)
    return p == 0 ? "about the same as " + name : (p > 0 ? "up " : "down ") + Math.abs(p) + "% from " + name
}

// ── dates ────────────────────────────────────────────────────────────────
// A date is a calendar date, "YYYY-MM-DD". Arithmetic runs on UTC days so the
// viewer's time zone can never move one.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function ymd(iso: string): [number, number, number] {
    const p = iso.split("-").map(Number)
    return [p[0], p[1], p[2]]
}
function toUTC(iso: string): number { const [y, m, d] = ymd(iso); return Date.UTC(y, m - 1, d) }
function fromUTC(t: number): string {
    const d = new Date(t)
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0")
}
export function isoOf(y: number, m: number, d: number): string { return fromUTC(Date.UTC(y, m - 1, d)) }
export function addDays(iso: string, n: number): string { return fromUTC(toUTC(iso) + n * 86400000) }
export function daysBetween(a: string, b: string): number { return Math.round((toUTC(b) - toUTC(a)) / 86400000) }
export function monthStart(iso: string): string { const [y, m] = ymd(iso); return isoOf(y, m, 1) }
export function monthEnd(iso: string): string { const [y, m] = ymd(iso); return isoOf(y, m + 1, 0) }
export function addMonths(iso: string, n: number): string {
    const [y, m, d] = ymd(iso)
    const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate()
    return isoOf(y, m + n, Math.min(d, last))
}
export function monthKey(iso: string): string { return iso.slice(0, 7) }

/** "Nov 7" — or "Nov 7, 2025" when the year isn't the one given. */
export function shortDate(iso: string, thisYear: string = ""): string {
    if (!iso) return ""
    const [y, m, d] = ymd(iso)
    return MONTHS[m - 1] + " " + d + (thisYear != "" && String(y) != thisYear.slice(0, 4) ? ", " + y : "")
}
/** "Fri, Nov 7" */
export function dayHeading(iso: string, today: string): string {
    if (iso == today) return "Today"
    if (iso == addDays(today, -1)) return "Yesterday"
    const [y, m, d] = ymd(iso)
    const wd = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
    return wd + ", " + MONTHS[m - 1] + " " + d + (y != ymd(today)[0] ? ", " + y : "")
}
export function monthName(iso: string): string { return MONTHS[ymd(iso)[1] - 1] }
export function monthLong(iso: string): string { const [y, m] = ymd(iso); return MONTHS_LONG[m - 1] + " " + y }

/** Whether a range is whole calendar months: the 1st to a month's last day. */
function wholeMonths(from: string, to: string): number {
    if (ymd(from)[2] != 1 || to != monthEnd(to)) return 0
    const [y1, m1] = ymd(from), [y2, m2] = ymd(to)
    return (y2 - y1) * 12 + (m2 - m1) + 1
}

/** A range in words: "November 2026", "Oct 1 – Dec 31, 2026", "Nov 1 – 13". */
export function rangeLabel(from: string, to: string): string {
    if (!from && !to) return "All time"
    if (!from) return "Until " + shortDate(to, "x")
    if (!to) return "Since " + shortDate(from, "x")
    const n = wholeMonths(from, to)
    if (n == 1) return monthLong(from)
    if (n == 12 && ymd(from)[1] == 1) return String(ymd(from)[0])
    const [y1, m1, d1] = ymd(from), [y2, m2, d2] = ymd(to)
    if (from == to) return MONTHS[m1 - 1] + " " + d1 + ", " + y1
    if (y1 == y2 && m1 == m2) return MONTHS[m1 - 1] + " " + d1 + " – " + d2 + ", " + y1
    if (y1 == y2) return MONTHS[m1 - 1] + " " + d1 + " – " + MONTHS[m2 - 1] + " " + d2 + ", " + y1
    return MONTHS[m1 - 1] + " " + d1 + ", " + y1 + " – " + MONTHS[m2 - 1] + " " + d2 + ", " + y2
}

/** The short name a comparison is spoken by: "Oct", "Oct 1 – 13", "2025". */
export function compareLabel(from: string, to: string): string {
    if (!from || !to) return "before"
    const n = wholeMonths(from, to)
    if (n == 1) return MONTHS[ymd(from)[1] - 1] + (ymd(from)[0] != ymd(to)[0] ? "" : "")
    if (n == 12 && ymd(from)[1] == 1) return String(ymd(from)[0])
    const [y1, m1, d1] = ymd(from), [, m2, d2] = ymd(to)
    if (m1 == m2) return MONTHS[m1 - 1] + " " + d1 + " – " + d2
    return MONTHS[m1 - 1] + " " + d1 + " – " + MONTHS[m2 - 1] + " " + d2 + (y1 ? "" : "")
}

export type Range = { from: string, to: string }

/** The range a preset names, for a given today. */
export function presetRange(id: string, today: string, first: string): Range {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { from: "", to: "" }
    const [y, m] = ymd(today)
    const q = Math.floor((m - 1) / 3)
    switch (id) {
        case "this-month": return { from: isoOf(y, m, 1), to: monthEnd(today) }
        case "last-month": return { from: isoOf(y, m - 1, 1), to: isoOf(y, m, 0) }
        case "last-30": return { from: addDays(today, -29), to: today }
        case "this-quarter": return { from: isoOf(y, q * 3 + 1, 1), to: isoOf(y, q * 3 + 4, 0) }
        case "last-quarter": return { from: isoOf(y, q * 3 - 2, 1), to: isoOf(y, q * 3 + 1, 0) }
        case "this-year": return { from: isoOf(y, 1, 1), to: isoOf(y, 12, 31) }
        case "last-year": return { from: isoOf(y - 1, 1, 1), to: isoOf(y - 1, 12, 31) }
        case "last-12": return { from: isoOf(y, m - 11, 1), to: monthEnd(today) }
        case "all": return { from: first, to: today }
    }
    return { from: isoOf(y, m, 1), to: monthEnd(today) }
}

/** The range of the same length before (dir −1) or after (+1). Whole months step by months. */
export function stepRange(from: string, to: string, dir: number): Range {
    const n = wholeMonths(from, to)
    if (n > 0) {
        const f = addMonths(from, dir * n)
        return { from: f, to: monthEnd(addMonths(f, n - 1)) }
    }
    const len = daysBetween(from, to) + 1
    return { from: addDays(from, dir * len), to: addDays(to, dir * len) }
}

/**
 * The comparison range: the period before, or the same dates a year earlier.
 * A range that runs past today is compared over the same elapsed stretch —
 * "Nov 1 – 13" against "Oct 1 – 13" — so a month in progress is never set
 * against a whole one.
 */
export function compareRange(from: string, to: string, mode: string, today: string): Range | null {
    if (mode == "none" || !from || !to) return null
    let r: Range
    if (mode == "year") r = { from: addMonths(from, -12), to: addMonths(to, -12) }
    else r = stepRange(from, to, -1)
    if (to > today && from <= today) {
        const elapsed = daysBetween(from, today)
        const end = addDays(r.from, elapsed)
        if (end < r.to) r = { from: r.from, to: end }
    }
    return r
}

/** The granularity a range reads best at. */
export function autoGrain(from: string, to: string): string {
    const n = from && to ? daysBetween(from, to) + 1 : 800
    if (n <= 35) return "day"
    if (n <= 120) return "week"
    if (n <= 800) return "month"
    return "quarter"
}

/** A period's name in a chart: "Mar 2026", "Q1 2026", "Mar 3", "Week of Mar 2". */
export function periodName(period: string, by: string, long: boolean = false): string {
    if (by == "month") { const [y, m] = period.split("-").map(Number); return (long ? MONTHS_LONG[m - 1] : MONTHS[m - 1]) + " " + y }
    if (by == "quarter") return period.replace(/^(\d+)-Q(\d)$/, "Q$2 $1")
    if (by == "week") return (long ? "Week of " : "") + shortDate(period)
    return shortDate(period)
}
/** The shortest label for an axis tick. */
export function periodTick(period: string, by: string): string {
    if (by == "month") { const m = Number(period.split("-")[1]); return MONTHS[m - 1] }
    if (by == "quarter") return period.replace(/^\d+-/, "")
    return String(Number(period.slice(8, 10)))
}

/**
 * A date as typed: "2026-11-03", "today", "yesterday", "3 nov", "nov 3",
 * "11/3", "3/11/2026" (month first), "mon"… Returns "" when it isn't one.
 */
export function parseDate(text: string, today: string): string {
    const t = text.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ")
    if (t == "") return ""
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return validIso(t)
    if (t == "today" || t == "tod") return today
    if (t == "yesterday" || t == "yday" || t == "yest") return addDays(today, -1)
    if (t == "tomorrow") return addDays(today, 1)
    const [ty] = ymd(today)
    const mi = (w: string) => MONTHS.findIndex((m) => w.startsWith(m.toLowerCase()) && w.length >= 3)
    let m = t.match(/^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/)
    if (m && mi(m[2]) >= 0) return pickYear(Number(m[3] ?? 0), mi(m[2]) + 1, Number(m[1]), today, ty)
    m = t.match(/^([a-z]+) (\d{1,2})(?: (\d{4}))?$/)
    if (m && mi(m[1]) >= 0) return pickYear(Number(m[3] ?? 0), mi(m[1]) + 1, Number(m[2]), today, ty)
    m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
    if (m) { const yy = m[3] ? (m[3].length == 2 ? 2000 + Number(m[3]) : Number(m[3])) : 0; return pickYear(yy, Number(m[1]), Number(m[2]), today, ty) }
    const wd = DAYS.findIndex((d) => t.startsWith(d.toLowerCase()) && t.length >= 3)
    if (wd >= 0) {
        // the most recent such weekday, today included
        const [y0, m0, d0] = ymd(today)
        const now = new Date(Date.UTC(y0, m0 - 1, d0)).getUTCDay()
        return addDays(today, -((now - wd + 7) % 7))
    }
    return ""
}
function validIso(t: string): string {
    const [y, m, d] = ymd(t)
    return isoOf(y, m, d) == t ? t : ""
}
// With no year written, a date later than today means last year's.
function pickYear(y: number, m: number, d: number, today: string, ty: number): string {
    if (m < 1 || m > 12 || d < 1 || d > 31) return ""
    if (y > 0) return validIso(isoOf(y, m, 1).slice(0, 8) + String(d).padStart(2, "0"))
    const thisYear = validIso(isoOf(ty, m, 1).slice(0, 8) + String(d).padStart(2, "0"))
    if (thisYear == "") return ""
    return thisYear > today ? validIso(isoOf(ty - 1, m, 1).slice(0, 8) + String(d).padStart(2, "0")) : thisYear
}

// ── the amount slider's scale ────────────────────────────────────────────
// Amounts are skewed, so the slider moves over a ladder of friendly values
// rather than a straight line: fine steps where most amounts are, coarse
// ones where only rent lives. A handle sits on an index into this ladder.

export const AMOUNT_STEPS: number[] = (() => {
    const out: number[] = []
    for (let d = 0; d < 20; d += 1) out.push(d * 100)
    for (let d = 20; d < 100; d += 5) out.push(d * 100)
    for (let d = 100; d < 300; d += 10) out.push(d * 100)
    for (let d = 300; d < 1000; d += 50) out.push(d * 100)
    for (let d = 1000; d <= 5000; d += 250) out.push(d * 100)
    return out
})()
export const AMOUNT_TICKS: number[] = [1000, 5000, 10000, 50000, 100000, 500000]

/** The ladder index nearest an amount at or below it (for a low end) or at or above it (a high end). */
export function stepIndex(cents: number, roundUp: boolean): number {
    const s = AMOUNT_STEPS
    if (roundUp) { const i = s.findIndex((v) => v >= cents); return i < 0 ? s.length - 1 : i }
    let i = 0
    while (i + 1 < s.length && s[i + 1] <= cents) i++
    return i
}

// ── the filter, as the service reads it ──────────────────────────────────

export type FilterParts = {
    from: string, to: string, q: string, min?: number | null, max?: number | null,
    kinds: string[], cats: string[], contacts: string[], products: string[]
}

/** The filter as query parameters. `drop` leaves some out ("dates", "amount", "category"). */
export function filterQuery(f: FilterParts, drop: string[] = []): string {
    const p: string[] = []
    if (!drop.includes("dates")) {
        if (f.from) p.push("from=" + f.from)
        if (f.to) p.push("to=" + f.to)
    }
    if (f.q.trim() != "") p.push("q=" + encodeURIComponent(f.q.trim()))
    if (!drop.includes("amount")) {
        if (f.min != null) p.push("min=" + f.min)
        if (f.max != null) p.push("max=" + f.max)
    }
    if (!drop.includes("kind") && f.kinds.length > 0) p.push("kind=" + f.kinds.join(","))
    if (!drop.includes("category") && f.cats.length > 0) p.push("category=" + f.cats.join(","))
    if (!drop.includes("contact") && f.contacts.length > 0) p.push("contact=" + f.contacts.join(","))
    if (!drop.includes("product") && f.products.length > 0) p.push("product=" + f.products.join(","))
    return p.join("&")
}

/** The query string for one read: the path, the filter, and anything more. */
export function apiUrl(base: string, path: string, query: string, extra: string = ""): string {
    const q = [query, extra].filter((s) => s != "").join("&")
    return base + path + (q == "" ? "" : "?" + q)
}

/** The kinds two sets of kinds both allow; an empty list allows every kind. */
export function bothKinds(have: string[], want: string[]): string[] {
    if (have.length == 0) return want
    return want.filter((k) => have.includes(k))
}

// ── words ────────────────────────────────────────────────────────────────

export function plural(n: number, one: string, many: string = one + "s"): string {
    return groupDigits(n) + " " + (n == 1 ? one : many)
}
export function count(n: number): string { return groupDigits(n) }

/** The search's words, for highlighting: each, lower-cased, numbers left out. */
export function searchWords(q: string): string[] {
    return q.trim().toLowerCase().split(/\s+/).filter((w) => w != "" && !/^\$?[\d,]+(\.\d+)?$/.test(w))
}

/** Text with the matched words wrapped for highlighting, as HTML for an HTMLText. */
export function highlight(text: string, words: string[]): string {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    if (words.length == 0 || text == "") return esc(text)
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    const hay = norm(text)
    const marks = new Array(text.length).fill(false)
    for (const w of words) {
        const n = norm(w)
        let i = hay.indexOf(n)
        while (i >= 0 && n.length > 0) { for (let k = i; k < i + n.length; k++) marks[k] = true; i = hay.indexOf(n, i + n.length) }
    }
    let out = "", on = false
    for (let i = 0; i < text.length; i++) {
        if (marks[i] != on) { out += marks[i] ? "<span class='Hit'>" : "</span>"; on = marks[i] }
        out += esc(text[i])
    }
    return on ? out + "</span>" : out
}

// ── CSV ──────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
/** Cents as a plain number for a spreadsheet: −4500 → "-45.00". */
export function plainAmount(cents: number): string {
    const a = Math.abs(cents)
    return (cents < 0 ? "-" : "") + Math.floor(a / 100) + "." + String(a % 100).padStart(2, "0")
}
export function csvOf(header: string[], rows: unknown[][]): string {
    return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

/** The amount filter in words, as its chip reads: "$20 – $200", "≥ $500", "≤ $100", "Any amount". */
export function amountWordsOf(min: number | null, max: number | null): string {
    if (min == null && max == null) return "Any amount"
    if (max == null) return "≥ " + dollars(min ?? 0)
    if (min == null) return "≤ " + dollars(max)
    return dollars(min) + " – " + dollars(max)
}

/** A change of a percentage, in points: "▲ 2.1 pts". */
export function pointsWords(cur: number, prev: number): string {
    const d = Math.round((cur - prev) * 10) / 10
    if (d == 0) return "▶ 0 pts"
    return (d > 0 ? "▲ " : "▼ ") + Math.abs(d).toFixed(1) + " pts"
}

/** A sale line's total from what is typed: quantity × unit price, in cents. */
export function lineTotal(qty: string, price: string): number {
    const q = Number(qty || "0")
    const p = parseMoney(price) ?? 0
    return Number.isFinite(q) ? Math.round(q) * p : 0
}
