// Ledger's pure helpers: functions of their arguments, outside the reactive
// system. Money is integer cents; dates are "YYYY-MM-DD" calendar strings,
// handled as UTC days so they never shift with the viewer's time zone.

// ── Money ────────────────────────────────────────────────────────────────

const MINUS = "−"
const USD = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const COUNT = new Intl.NumberFormat("en-US")

/** "$1,204.50" — always two decimals, a true minus sign when negative. */
function money(cents: number): string {
    const v = Math.abs(cents) / 100
    return (cents < 0 ? MINUS : "") + "$" + USD.format(v)
}

/** Whole dollars, for slider labels and chips: "$20", "$1,250". */
function dollars(cents: number): string {
    const v = cents / 100
    return (v < 0 ? MINUS : "") + "$" + (Number.isInteger(v) ? WHOLE.format(Math.abs(v)) : USD.format(Math.abs(v)))
}

/** Compact, for chart axes only: "$1.2k", "$15k", "$0". */
function compactMoney(cents: number): string {
    const v = Math.abs(cents) / 100
    const sign = cents < 0 ? MINUS : ""
    if (v >= 1000000) return sign + "$" + trimZero((v / 1000000).toFixed(1)) + "M"
    if (v >= 1000) return sign + "$" + trimZero((v / 1000).toFixed(v >= 10000 ? 0 : 1)) + "k"
    return sign + "$" + WHOLE.format(v)
}
function trimZero(s: string): string { return s.endsWith(".0") ? s.slice(0, -2) : s }

function count(n: number): string { return COUNT.format(n) }

/** "12%", signed when it is a change: "+12%", "−4%". */
function pct(p: number, signed: boolean): string {
    const r = Math.abs(p) >= 10 ? Math.round(p) : Math.round(p * 10) / 10
    const s = (Math.abs(r)).toString() + "%"
    if (!signed) return (r < 0 ? MINUS : "") + s
    return (r > 0 ? "+" : r < 0 ? MINUS : "") + s
}

/** Parses typed money ("42.50", "$1,204.5", "12") to cents, or null. */
function parseMoney(t: string): number | null {
    const s = t.replace(/[$,\s]/g, "")
    if (s == "") return null
    if (!/^\d*(\.\d{0,2})?$/.test(s) || s == ".") return null
    return Math.round(parseFloat(s) * 100)
}

/** Cents as a plain editable string: 4250 → "42.50". */
function moneyInput(cents: number | null): string {
    if (cents == null) return ""
    return (cents / 100).toFixed(2)
}

// ── Dates ────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function pad2(n: number): string { return n < 10 ? "0" + n : "" + n }
function ymd(iso: string): number[] { return iso.split("-").map(Number) }
function dayNum(iso: string): number { const p = ymd(iso); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000) }
function fromDayNum(n: number): string {
    const d = new Date(n * 86400000)
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate())
}
function iso(y: number, m: number, d: number): string {
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.getUTCFullYear() + "-" + pad2(dt.getUTCMonth() + 1) + "-" + pad2(dt.getUTCDate())
}
function addDays(d: string, n: number): string { return fromDayNum(dayNum(d) + n) }
function daysBetween(a: string, b: string): number { return dayNum(b) - dayNum(a) }
function monthStart(d: string): string { const p = ymd(d); return iso(p[0], p[1], 1) }
function monthEnd(d: string): string { const p = ymd(d); return iso(p[0], p[1] + 1, 0) }
/** The same day n months away, held to the month's end ("Mar 31" − 1 month = "Feb 28"). */
function addMonths(d: string, n: number): string {
    const p = ymd(d)
    const last = ymd(iso(p[0], p[1] + n + 1, 0))[2]
    return iso(p[0], p[1] + n, Math.min(p[2], last))
}
function weekday(d: string): string { return WEEKDAYS[new Date(dayNum(d) * 86400000).getUTCDay()] }

/** "Nov 7, 2026" */
function longDate(d: string): string { const p = ymd(d); return MONTHS[p[1] - 1] + " " + p[2] + ", " + p[0] }
/** "Nov 7" — the year only when it isn't this year's. */
function shortDate(d: string, today: string): string {
    const p = ymd(d)
    return MONTHS[p[1] - 1] + " " + p[2] + (p[0] != ymd(today)[0] ? ", " + p[0] : "")
}
/** A phone list's day heading: "Today", "Yesterday", "Friday, Nov 6". */
function dayHeading(d: string, today: string): string {
    const n = daysBetween(d, today)
    if (n == 0) return "Today"
    if (n == 1) return "Yesterday"
    return weekday(d) + ", " + shortDate(d, today)
}
function monthName(m: number): string { return MONTHS[m - 1] }
function monthLong(m: number): string { return MONTHS_LONG[m - 1] }

/**
 * Typed dates: "today", "yesterday", "3 nov", "nov 3", "11/3", "2026-11-03",
 * "mon" (the last Monday). A date without a year is the most recent one not
 * after today. Returns "" when it can't be read.
 */
function parseDate(t: string, today: string): string {
    const s = t.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ")
    if (s == "") return ""
    if (s == "today" || s == "t") return today
    if (s == "yesterday" || s == "y") return addDays(today, -1)
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) { const p = s.split("-").map(Number); return validDay(p[0], p[1], p[2]) }
    const wd = WEEKDAYS.findIndex((w) => s.length >= 3 && w.toLowerCase().startsWith(s))
    if (wd >= 0) {
        const back = (new Date(dayNum(today) * 86400000).getUTCDay() - wd + 7) % 7
        return addDays(today, -back)
    }
    const ty = ymd(today)[0]
    const monthOf = (w: string) => MONTHS.findIndex((m) => w.length >= 3 && m.toLowerCase().startsWith(w.slice(0, 3)) && MONTHS_LONG[MONTHS.indexOf(m)].toLowerCase().startsWith(w)) + 1
    let m = 0, d = 0, y = 0
    let mm = s.match(/^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/)
    if (mm) { d = +mm[1]; m = monthOf(mm[2]); y = mm[3] ? +mm[3] : 0 }
    mm = mm ? mm : s.match(/^([a-z]+) (\d{1,2})(?: (\d{4}))?$/)
    if (mm && m == 0) { m = monthOf(mm[1]); d = +mm[2]; y = mm[3] ? +mm[3] : 0 }
    const sl = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
    if (sl) { m = +sl[1]; d = +sl[2]; y = sl[3] ? (+sl[3] < 100 ? 2000 + +sl[3] : +sl[3]) : 0 }
    if (m < 1 || d < 1) return ""
    if (y == 0) {
        y = ty
        const cand = validDay(y, m, d)
        if (cand != "" && cand > today) y = ty - 1
    }
    return validDay(y, m, d)
}
function validDay(y: number, m: number, d: number): string {
    if (m < 1 || m > 12 || d < 1 || d > 31) return ""
    const r = iso(y, m, d)
    return ymd(r)[1] == m ? r : ""
}

// ── Date ranges ──────────────────────────────────────────────────────────

type Range = { from: string; to: string }


function quarterStart(d: string): string { const p = ymd(d); return iso(p[0], Math.floor((p[1] - 1) / 3) * 3 + 1, 1) }

/** The calendar range a preset names, given today and the first day of the books. */
function presetRange(id: string, today: string, first: string): Range {
    const p = ymd(today)
    switch (id) {
        case "this-month": return { from: monthStart(today), to: monthEnd(today) }
        case "last-month": { const s = addMonths(monthStart(today), -1); return { from: s, to: monthEnd(s) } }
        case "last-30": return { from: addDays(today, -29), to: today }
        case "this-quarter": { const s = quarterStart(today); return { from: s, to: addDays(addMonths(s, 3), -1) } }
        case "last-quarter": { const s = addMonths(quarterStart(today), -3); return { from: s, to: addDays(addMonths(s, 3), -1) } }
        case "this-year": return { from: iso(p[0], 1, 1), to: iso(p[0], 12, 31) }
        case "last-year": return { from: iso(p[0] - 1, 1, 1), to: iso(p[0] - 1, 12, 31) }
        case "last-12": return { from: addMonths(monthStart(today), -11), to: monthEnd(today) }
        default: return { from: first, to: today }
    }
}

/** Whole calendar months? (Nov 1 – Nov 30, Oct 1 – Dec 31…) — then it steps by months. */
function wholeMonths(r: Range): number {
    if (r.from != monthStart(r.from) || r.to != monthEnd(r.to)) return 0
    const a = ymd(r.from), b = ymd(r.to)
    return (b[0] - a[0]) * 12 + b[1] - a[1] + 1
}

/** The previous (dir −1) or next (+1) range of the same length. */
function stepRange(r: Range, dir: number): Range {
    const months = wholeMonths(r)
    if (months > 0) {
        const from = addMonths(r.from, dir * months)
        return { from: from, to: monthEnd(addMonths(from, months - 1)) }
    }
    const len = daysBetween(r.from, r.to) + 1
    return { from: addDays(r.from, dir * len), to: addDays(r.to, dir * len) }
}

/** What a range is called: "November 2026", "Q4 2026", "2026", "Oct 3 – Nov 1, 2026". */
function rangeLabel(r: Range, today: string): string {
    const a = ymd(r.from), b = ymd(r.to)
    const months = wholeMonths(r)
    if (months == 1) return monthLong(a[1]) + " " + a[0]
    if (months == 3 && (a[1] - 1) % 3 == 0) return "Q" + ((a[1] - 1) / 3 + 1) + " " + a[0]
    if (months == 12 && a[1] == 1) return "" + a[0]
    if (months > 0) return monthName(a[1]) + (a[0] != b[0] ? " " + a[0] : "") + " – " + monthName(b[1]) + " " + b[0]
    if (a[0] == b[0]) return monthName(a[1]) + " " + a[2] + " – " + monthName(b[1]) + " " + b[2] + ", " + b[0]
    return longDate(r.from) + " – " + longDate(r.to)
}

/** A short name for a comparison range: "Oct", "Nov 2025", "Q3", "2025", or the dates. */
function rangeShort(r: Range, today: string): string {
    const a = ymd(r.from), b = ymd(r.to)
    const months = wholeMonths(r)
    const sameYear = a[0] == ymd(today)[0]
    if (months == 1 || (a[0] == b[0] && a[1] == b[1] && a[2] == 1)) return monthName(a[1]) + (sameYear ? "" : " " + a[0])
    if (months == 3 && (a[1] - 1) % 3 == 0) return "Q" + ((a[1] - 1) / 3 + 1) + (sameYear ? "" : " " + a[0])
    if ((months == 12 && a[1] == 1) || (a[1] == 1 && a[2] == 1 && a[0] == b[0])) return "" + a[0]
    return shortDate(r.from, today) + " – " + shortDate(r.to, today)
}

/**
 * The part of a range that has happened: a range running past today is
 * compared only up to today, so a month in progress is held against the
 * same days of the month before rather than the whole of it.
 */
function elapsed(r: Range, today: string): Range {
    return { from: r.from, to: r.to > today && r.from <= today ? today : r.to }
}

/** The comparison range: the period before, or the same dates a year earlier. */
function compareRange(r: Range, mode: string, today: string): Range | null {
    if (mode == "none") return null
    const e = elapsed(r, today)
    if (mode == "year") return { from: addMonths(e.from, -12), to: addMonths(e.to, -12) }
    const months = wholeMonths(r)
    if (months > 0) {
        const from = addMonths(r.from, -months)
        return { from: from, to: e.to == r.to ? addDays(r.from, -1) : addMonths(e.to, -months) }
    }
    const len = daysBetween(e.from, e.to) + 1
    return { from: addDays(e.from, -len), to: addDays(e.from, -1) }
}

/** The granularity a range reads best at. */
function granularityFor(r: Range): string {
    const n = daysBetween(r.from, r.to) + 1
    if (n <= 35) return "day"
    if (n <= 130) return "week"
    if (n <= 800) return "month"
    return "quarter"
}

/** "March 2026", "Week of Mar 2", "Mar 2", "Q1 2026" — a period's name. */
function periodName(period: string, by: string, today: string): string {
    if (by == "month") { const p = period.split("-").map(Number); return monthLong(p[1]) + " " + p[0] }
    if (by == "quarter") return period.replace("-", " ").replace(/^(\d+) (Q\d)$/, "$2 $1")
    if (by == "week") return "Week of " + shortDate(period, today)
    return weekday(period) + ", " + shortDate(period, today)
}
/** The short axis label: "Mar", "Q1", "3", "Mar 2". */
function periodTick(period: string, by: string): string {
    if (by == "month") { const p = period.split("-").map(Number); return p[1] == 1 ? "Jan " + String(p[0]).slice(2) : monthName(p[1]) }
    if (by == "quarter") return period.slice(5) + " " + period.slice(2, 4)
    const p = ymd(period)
    return by == "day" ? "" + p[2] : monthName(p[1]) + " " + p[2]
}

// ── The filter as a query string ────────────────────────────────────────

type FilterParts = {
    from: string; to: string; q: string; min: number | null; max: number | null;
    kinds: string[]; cats: string[]; contacts: string[]; products: string[]
}

/** The service's query string for a filter; `dates = false` leaves the range out. */
function filterQuery(f: FilterParts, dates: boolean): string {
    const p: string[] = []
    if (dates && f.from != "") p.push("from=" + f.from)
    if (dates && f.to != "") p.push("to=" + f.to)
    if (f.q.trim() != "") p.push("q=" + encodeURIComponent(f.q.trim()))
    if (f.min != null) p.push("min=" + f.min)
    if (f.max != null) p.push("max=" + f.max)
    if (f.kinds.length > 0) p.push("kind=" + f.kinds.join(","))
    if (f.cats.length > 0) p.push("category=" + f.cats.join(","))
    if (f.contacts.length > 0) p.push("contact=" + f.contacts.join(","))
    if (f.products.length > 0) p.push("product=" + f.products.join(","))
    return p.join("&")
}

/** The kinds two filters both allow: the figure's own kinds narrowed by the filter's. */
function bothKinds(own: string[], filtered: string[]): string[] {
    return filtered.length == 0 ? own : own.filter((k) => filtered.includes(k))
}

// ── The amount scale ─────────────────────────────────────────────────────
//
// The service buckets amounts at fixed edges that grow with the amount; the
// slider gives each bucket the same width, so $5–$10 has as much room as
// $500–$750. The handles snap to friendly dollar values inside them.

const EDGES = [0, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000, 150000, 200000, 300000, 500000]
const SNAPS = (() => {
    const out: number[] = []
    const add = (from: number, to: number, step: number) => { for (let v = from; v < to; v += step) out.push(v) }
    add(0, 1000, 100)            // $0–$10 by $1
    add(1000, 3000, 200)         // $10–$30 by $2
    add(3000, 10000, 500)        // $30–$100 by $5
    add(10000, 30000, 1000)      // $100–$300 by $10
    add(30000, 100000, 2500)     // $300–$1k by $25
    add(100000, 300000, 10000)   // $1k–$3k by $100
    add(300000, 500000, 25000)   // $3k–$5k by $250
    out.push(500000)
    return out
})()
const SCALE_TOP = EDGES.length            // the open-ended last bucket ends the track

/** Where an amount sits on the track, 0…1 (the last bucket runs to the end). */
function amountPos(cents: number): number {
    if (cents >= 500000) return (EDGES.length - 1) / SCALE_TOP
    let i = 0
    while (i < EDGES.length - 1 && cents >= EDGES[i + 1]) i = i + 1
    const lo = EDGES[i], hi = EDGES[i + 1]
    return (i + (cents - lo) / (hi - lo)) / SCALE_TOP
}
/** The snap value nearest a track position; the very end is "no limit" (null). */
function amountAt(pos: number): number | null {
    if (pos >= 1 - 0.25 / SCALE_TOP) return null
    let best = SNAPS[0], dist = 2
    for (const v of SNAPS) { const d = Math.abs(amountPos(v) - pos); if (d < dist) { dist = d; best = v } }
    return best
}
/** The next snap value up or down from an amount (null = the open top). */
function amountStep(cents: number | null, dir: number): number | null {
    if (cents == null) return dir > 0 ? null : SNAPS[SNAPS.length - 1]
    if (dir > 0) { const n = SNAPS.find((v) => v > cents); return n == null ? null : n }
    const below = SNAPS.filter((v) => v < cents)
    return below.length == 0 ? 0 : below[below.length - 1]
}
function amountTicks(): number[] { return [1000, 5000, 10000, 50000, 100000, 500000] }
function amountEdges(): number[] { return EDGES }

// ── Search highlighting ──────────────────────────────────────────────────

function escapeText(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;")
}
/** The text as HTML with every word of the query wrapped in the Hit style. */
function highlight(text: string, q: string): string {
    const words = q.trim().split(/\s+/).filter((w) => w != "" && !/^\$?[\d,]+(\.\d*)?$/.test(w))
    if (words.length == 0) return escapeText(text)
    const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    const hay = fold(text)
    const marks = new Array(text.length).fill(false)
    for (const w of words) {
        const n = fold(w)
        let i = hay.indexOf(n)
        while (i >= 0 && n.length > 0) { for (let k = i; k < i + n.length; k++) marks[k] = true; i = hay.indexOf(n, i + n.length) }
    }
    let out = "", on = false
    for (let i = 0; i < text.length; i++) {
        if (marks[i] && !on) { out += "<span class='Hit'>"; on = true }
        if (!marks[i] && on) { out += "</span>"; on = false }
        out += escapeText(text[i])
    }
    return out + (on ? "</span>" : "")
}

// ── CSV ──────────────────────────────────────────────────────────────────

type CsvRow = { id: string; date: string; kind: string; description: string; contact: string; category: string; channel: string; amount: number }

function csvCell(v: string): string { return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }

/** One row per transaction, ISO dates, amounts as plain signed numbers. */
function toCsv(rows: CsvRow[]): string {
    const head = ["id", "date", "kind", "description", "contact", "category", "channel", "amount"]
    const lines = [head.join(",")]
    for (const r of rows) {
        lines.push([r.id, r.date, r.kind, r.description, r.contact, r.category, r.channel, (r.amount / 100).toFixed(2)].map(csvCell).join(","))
    }
    return lines.join("\n") + "\n"
}

/** A filter as the bulk endpoint's `where` object: only what is set. */
function filterWhere(f: FilterParts): Record<string, string> {
    const w: Record<string, string> = {}
    const q = filterQuery(f, true)
    for (const pair of q.split("&")) {
        if (pair == "") continue
        const i = pair.indexOf("=")
        w[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1))
    }
    return w
}

// ── Chart scales ─────────────────────────────────────────────────────────

function niceStep(span: number): number {
    const raw = span / 4
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)))
    const f = raw / mag
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag
}
/** The axis from zero (or the lowest negative) to a round top. */
function niceExtent(values: number[]): number[] {
    const lo = Math.min(0, ...values), hi = Math.max(0, ...values)
    if (lo == hi) return [0, 1]
    const step = niceStep(hi - lo)
    return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step]
}
function niceTicks(lo: number, hi: number): number[] {
    const step = niceStep(hi - lo)
    const out: number[] = []
    for (let v = lo; v <= hi + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000)
    return out
}

/** "up 6%", "down 4 pts", "unchanged", "new" — a change in words. */
function changeWords(now: number, then: number, points: boolean): string {
    if (points) {
        const d = Math.round((now - then) * 10) / 10
        return d == 0 ? "unchanged" : (d > 0 ? "up " : "down ") + Math.abs(d) + " pts"
    }
    if (then == 0) return now == 0 ? "unchanged" : "new"
    const p = (now - then) / Math.abs(then) * 100
    if (Math.abs(p) < 0.05) return "unchanged"
    return (p > 0 ? "up " : "down ") + pct(Math.abs(p), false)
}
