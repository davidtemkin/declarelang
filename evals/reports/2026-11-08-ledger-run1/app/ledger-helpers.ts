// ledger-helpers.ts — plain functions of their arguments, loaded by ledger.declare with
// `script [ "ledger-helpers.ts" ]`: money and percentages written for a reader, calendar
// arithmetic on "YYYY-MM-DD" strings, the date-range presets, what a person types into a
// money or a date field, and the amount slider's scale. Nothing here is reactive: a
// constraint that calls one of these depends only on the arguments it passes.
//
// Dates are calendar dates. Every calculation goes through Date.UTC and reads back with
// getUTC…, so no answer ever shifts with the viewer's time zone.

// ── money ──────────────────────────────────────────────────────────────────

const MINUS = "−"     // a true minus sign, never a hyphen

const USD = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// "$1,204.50" — whole cents in, always two decimals; money out reads "−$45.00"
export function money(cents: number): string {
    const sign = cents < 0 ? MINUS : ""
    return sign + "$" + USD.format(Math.abs(cents) / 100)
}

// with a sign either way, for a change: "+$120.00", "−$45.00"
export function signedMoney(cents: number): string {
    return (cents > 0 ? "+" : "") + money(cents)
}

// as a plain number for a CSV cell: "-45.00", "1204.50"
export function plainMoney(cents: number): string {
    const sign = cents < 0 ? "-" : ""
    const abs = Math.abs(cents)
    return sign + Math.floor(abs / 100) + "." + String(abs % 100).padStart(2, "0")
}

// compact, for chart axes only: "$1.2k", "$950", "$12k"
export function compactMoney(cents: number): string {
    const d = Math.abs(cents) / 100
    const sign = cents < 0 ? MINUS : ""
    if (d >= 1000000) return sign + "$" + trimZero((d / 1000000).toFixed(1)) + "M"
    if (d >= 1000) return sign + "$" + trimZero((d / 1000).toFixed(d >= 10000 ? 0 : 1)) + "k"
    return sign + "$" + Math.round(d)
}

function trimZero(s: string): string { return s.endsWith(".0") ? s.slice(0, -2) : s }

// a friendly slider label: "$10", "$50", "$1k", "$2.5k"
export function roundMoneyLabel(cents: number): string {
    const d = cents / 100
    if (d >= 1000) return "$" + trimZero((d / 1000).toFixed(1)) + "k"
    return "$" + Math.round(d)
}

// What a person types as money: "42.5", "$1,204.50", "1204" → whole cents, or NaN.
export function parseMoney(text: string): number {
    const t = text.trim().replace(/[$,\s]/g, "").replace(MINUS, "-")
    if (!/^-?(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(t)) return NaN
    const neg = t.startsWith("-")
    const [whole, frac = ""] = (neg ? t.slice(1) : t).split(".")
    const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2))
    return neg ? -cents : cents
}

// a money field's text for a value: "12.40", or "" for none
export function moneyInput(cents: number | null): string {
    if (cents == null || isNaN(cents)) return ""
    return USD.format(cents / 100).replace(/,/g, "")
}

// ── percentages ────────────────────────────────────────────────────────────

// a share or a margin: "69%", "67.6%"
export function pct(p: number | null): string {
    if (p == null || !isFinite(p)) return "—"
    return (Math.abs(p) >= 10 ? Math.round(p) : Math.round(p * 10) / 10) + "%"
}

// a change, always signed: "+12%", "−3.4%"
export function signedPct(p: number): string {
    if (!isFinite(p)) return "—"
    const r = Math.abs(p) >= 10 ? Math.round(Math.abs(p)) : Math.round(Math.abs(p) * 10) / 10
    if (r == 0) return "0%"
    return (p > 0 ? "+" : MINUS) + r + "%"
}

// the change from b to a as a percentage of |b|, or NaN when b is zero
export function changePct(a: number, b: number): number {
    if (b == 0) return NaN
    return (a - b) / Math.abs(b) * 100
}

// ── calendar dates ─────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"]
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function pad2(n: number): string { return n < 10 ? "0" + n : "" + n }

function isoParts(iso: string): number[] { return iso.split("-").map(Number) }

function utc(iso: string): Date { const p = isoParts(iso); return new Date(Date.UTC(p[0], p[1] - 1, p[2])) }

function fromUtc(d: Date): string {
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate())
}

export function isoDate(y: number, m: number, d: number): string { return fromUtc(new Date(Date.UTC(y, m - 1, d))) }

export function addDays(iso: string, n: number): string {
    const d = utc(iso)
    d.setUTCDate(d.getUTCDate() + n)
    return fromUtc(d)
}

function daysInMonth(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate() }

// the same day n months on, held to the month's last day (31 Mar − 1 month = 28/29 Feb)
export function addMonths(iso: string, n: number): string {
    const p = isoParts(iso)
    const total = p[0] * 12 + (p[1] - 1) + n
    const y = Math.floor(total / 12), m = total % 12 + 1
    return isoDate(y, m, Math.min(p[2], daysInMonth(y, m)))
}

export function daysBetween(a: string, b: string): number {
    return Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000)
}

export function monthStart(iso: string): string { const p = isoParts(iso); return isoDate(p[0], p[1], 1) }
export function monthEnd(iso: string): string { const p = isoParts(iso); return isoDate(p[0], p[1], daysInMonth(p[0], p[1])) }
function isMonthEnd(iso: string): boolean { return iso == monthEnd(iso) }

export function monthKey(iso: string): string { return iso.slice(0, 7) }

// "7 Nov 2026"; "7 Nov" when the year is the one given
export function shortDate(iso: string, thisYear: string = ""): string {
    if (iso == "") return ""
    const p = isoParts(iso)
    return p[2] + " " + MONTHS[p[1] - 1] + (String(p[0]) == thisYear ? "" : " " + p[0])
}

// "Sat 7 Nov 2026"
export function longDate(iso: string): string {
    if (iso == "") return ""
    const p = isoParts(iso)
    return DAYS[utc(iso).getUTCDay()] + " " + p[2] + " " + MONTHS[p[1] - 1] + " " + p[0]
}

// a day heading on a phone: "Today", "Yesterday", "Thu 5 Nov"
export function dayHeading(iso: string, today: string): string {
    const n = daysBetween(iso, today)
    if (n == 0) return "Today"
    if (n == 1) return "Yesterday"
    const p = isoParts(iso)
    return DAYS[utc(iso).getUTCDay()] + " " + p[2] + " " + MONTHS[p[1] - 1] + (iso.slice(0, 4) == today.slice(0, 4) ? "" : " " + p[0])
}

export function monthName(iso: string): string { return MONTHS[isoParts(iso)[1] - 1] }
export function monthLong(iso: string): string { return MONTHS_LONG[isoParts(iso)[1] - 1] }

// A range for a reader: "November 2026", "Q3 2026", "2025", "1 Mar – 12 Apr 2026"
export function rangeLabel(from: string, to: string): string {
    if (from == "" && to == "") return "All time"
    if (from == "") return "Up to " + shortDate(to)
    if (to == "") return "From " + shortDate(from)
    const a = isoParts(from), b = isoParts(to)
    if (a[2] == 1 && isMonthEnd(to)) {
        if (a[0] == b[0] && a[1] == b[1]) return MONTHS_LONG[a[1] - 1] + " " + a[0]
        if (a[0] == b[0] && a[1] == 1 && b[1] == 12) return "" + a[0]
        if (a[0] == b[0] && (a[1] - 1) % 3 == 0 && b[1] == a[1] + 2) return "Q" + ((a[1] + 2) / 3) + " " + a[0]
        if (a[0] == b[0]) return MONTHS[a[1] - 1] + " – " + MONTHS[b[1] - 1] + " " + a[0]
        return MONTHS[a[1] - 1] + " " + a[0] + " – " + MONTHS[b[1] - 1] + " " + b[0]
    }
    if (from == to) return shortDate(from)
    if (a[0] == b[0]) return shortDate(from, String(a[0])) + " – " + shortDate(to)
    return shortDate(from) + " – " + shortDate(to)
}

// A period's name, by the aggregate's `period` key: "2026-11" → "Nov 2026", "2026-Q4",
// a week's Monday "2026-11-02" → "Week of 2 Nov", a day → "7 Nov"
export function periodLabel(period: string, by: string, long: boolean = false): string {
    if (by == "quarter") return period.replace("-", " ")
    if (by == "month") return (long ? monthLong(period + "-01") : monthName(period + "-01")) + " " + period.slice(0, 4)
    if (by == "week") return (long ? "Week of " : "") + shortDate(period, period.slice(0, 4))
    return long ? longDate(period) : shortDate(period, period.slice(0, 4))
}

// A short axis tick for a period: "Nov", "Q4", "2 Nov", "7"
export function periodTick(period: string, by: string): string {
    if (by == "quarter") return period.slice(5)
    if (by == "month") return monthName(period + "-01")
    if (by == "week") return shortDate(period, period.slice(0, 4))
    return String(isoParts(period)[2])
}

// ── the date-range presets ─────────────────────────────────────────────────

export const PRESETS = [
    ["this-month", "This month"], ["last-month", "Last month"], ["last-30", "Last 30 days"],
    ["this-quarter", "This quarter"], ["last-quarter", "Last quarter"], ["this-year", "This year"],
    ["last-year", "Last year"], ["last-12", "Last 12 months"], ["all", "All time"],
]

export function presetLabel(id: string): string {
    const p = PRESETS.find((x) => x[0] == id)
    return p == null ? "" : p[1]
}

// [from, to] for a preset, given today; "all" is ["", ""]
export function presetRange(id: string, today: string): string[] {
    const p = isoParts(today)
    const q0 = Math.floor((p[1] - 1) / 3) * 3 + 1          // first month of this quarter
    switch (id) {
        case "this-month": return [monthStart(today), monthEnd(today)]
        case "last-month": { const m = addMonths(monthStart(today), -1); return [m, monthEnd(m)] }
        case "last-30": return [addDays(today, -29), today]
        case "this-quarter": return [isoDate(p[0], q0, 1), monthEnd(isoDate(p[0], q0 + 2, 1))]
        case "last-quarter": { const s = addMonths(isoDate(p[0], q0, 1), -3); return [s, monthEnd(addMonths(s, 2))] }
        case "this-year": return [isoDate(p[0], 1, 1), isoDate(p[0], 12, 31)]
        case "last-year": return [isoDate(p[0] - 1, 1, 1), isoDate(p[0] - 1, 12, 31)]
        case "last-12": return [addMonths(monthStart(today), -11), monthEnd(today)]
        default: return ["", ""]
    }
}

// The range of the same length before (dir −1) or after (+1). A range of whole months
// steps by its months, so "November" steps to "October"; any other range by its days.
export function stepRange(from: string, to: string, dir: number): string[] {
    if (from == "" || to == "") return [from, to]
    const a = isoParts(from), b = isoParts(to)
    if (a[2] == 1 && isMonthEnd(to)) {
        const months = (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1
        const s = addMonths(from, dir * months)
        return [s, monthEnd(addMonths(s, months - 1))]
    }
    const n = daysBetween(from, to) + 1
    return [addDays(from, dir * n), addDays(to, dir * n)]
}

// The comparison period for a range. A range still running (it ends after today) is
// compared over the part that has happened: this month so far against the same days of
// last month, never a week against a whole month. mode: "previous" | "year" | "none".
export function compareRange(from: string, to: string, mode: string, today: string): string[] {
    if (mode == "none" || from == "" || to == "") return ["", ""]
    const end = to > today ? today : to
    if (end < from) return ["", ""]
    if (mode == "year") return [addMonths(from, -12), addMonths(end, -12)]
    const a = isoParts(from)
    if (a[2] == 1 && isMonthEnd(to)) {
        const b = isoParts(to)
        const months = (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1
        const s = addMonths(from, -months)
        const e = end == to ? monthEnd(addMonths(s, months - 1)) : addMonths(end, -months)
        return [s, e]
    }
    const n = daysBetween(from, to) + 1
    return [addDays(from, -n), addDays(end, -n)]
}

// The name a comparison goes by in a headline, from the range compared and the range it is
// compared with: "vs Oct", "vs Q3", "vs 2025", "vs Nov 2025", "vs previous 30 days"
export function compareName(from: string, to: string, cmpFrom: string, mode: string): string {
    if (from == "" || to == "" || cmpFrom == "") return ""
    const a = isoParts(from), b = isoParts(to), c = isoParts(cmpFrom)
    if (a[2] == 1 && isMonthEnd(to)) {
        const months = (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1
        const year = mode == "year" || c[0] != a[0] ? " " + c[0] : ""
        if (months == 1) return "vs " + MONTHS[c[1] - 1] + (mode == "year" ? " " + c[0] : "")
        if (months == 3 && (a[1] - 1) % 3 == 0) return "vs Q" + ((c[1] + 2) / 3) + year
        if (months == 12 && a[1] == 1) return "vs " + c[0]
    }
    if (mode == "year") return "vs same days last year"
    return "vs previous " + (daysBetween(from, to) + 1) + " days"
}

// The granularity a chart starts at for a range
export function defaultGrain(from: string, to: string): string {
    const n = daysBetween(from, to) + 1
    if (n <= 35) return "day"
    if (n <= 120) return "week"
    if (n <= 800) return "month"
    return "quarter"
}

// ── what a person types as a date ──────────────────────────────────────────
//
// "today", "yesterday", "tomorrow", "3 nov", "nov 3", "3/11", "2026-11-03", "3 nov 2025".
// A day and month with no year means the most recent such day that is not in the future.
// Returns "" when it cannot be read.

export function parseDateInput(text: string, today: string): string {
    const t = text.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ")
    if (t == "") return ""
    if (t == "today" || t == "t") return today
    if (t == "yesterday" || t == "y") return addDays(today, -1)
    if (t == "tomorrow") return addDays(today, 1)
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) {
        const p = t.split("-").map(Number)
        return valid(p[0], p[1], p[2]) ? isoDate(p[0], p[1], p[2]) : ""
    }
    const month = (w: string) => MONTHS.findIndex((m) => w.startsWith(m.toLowerCase())) + 1
    let d = 0, m = 0, y = 0
    let mm = /^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/.exec(t)
    if (mm != null) { d = Number(mm[1]); m = month(mm[2]); y = mm[3] ? Number(mm[3]) : 0 }
    mm = mm ?? /^([a-z]+) (\d{1,2})(?: (\d{4}))?$/.exec(t)
    if (m == 0 && mm != null) { m = month(mm[1]); d = Number(mm[2]); y = mm[3] ? Number(mm[3]) : 0 }
    const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t)     // day/month, as the brief's "3 nov" reads
    if (slash != null) { d = Number(slash[1]); m = Number(slash[2]); y = slash[3] ? Number(slash[3]) : 0; if (y > 0 && y < 100) y = 2000 + y }
    if (m < 1 || d < 1) return ""
    const ty = isoParts(today)[0]
    if (y == 0) {
        y = ty
        if (valid(y, m, d) && isoDate(y, m, d) > today) y = ty - 1
    }
    return valid(y, m, d) ? isoDate(y, m, d) : ""
}

function valid(y: number, m: number, d: number): boolean {
    return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

// ── the amount slider's scale ──────────────────────────────────────────────
//
// Amounts are skewed: most between $5 and $200, a few rent payments in the thousands. The
// slider is laid out on the service's own histogram edges, each bucket an equal share of
// the track, so the crowded low end gets room and the long tail does not. Between edges it
// is linear. The last stop is "no top".

export const AMOUNT_EDGES = [0, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000,
    50000, 75000, 100000, 150000, 200000, 300000, 500000]

// friendly labels under the track, at these values
export const AMOUNT_TICKS = [0, 1000, 5000, 10000, 50000, 100000, 500000]

// a fraction of the track (0…1) → cents
export function amountAt(frac: number): number {
    const n = AMOUNT_EDGES.length - 1
    const f = Math.max(0, Math.min(1, frac)) * n
    const i = Math.min(n - 1, Math.floor(f))
    return AMOUNT_EDGES[i] + (AMOUNT_EDGES[i + 1] - AMOUNT_EDGES[i]) * (f - i)
}

// cents → a fraction of the track
export function amountFrac(cents: number): number {
    const n = AMOUNT_EDGES.length - 1
    if (cents <= 0) return 0
    if (cents >= AMOUNT_EDGES[n]) return 1
    let i = 0
    while (AMOUNT_EDGES[i + 1] <= cents) i++
    return (i + (cents - AMOUNT_EDGES[i]) / (AMOUNT_EDGES[i + 1] - AMOUNT_EDGES[i])) / n
}

// a handle's sensible step at an amount: $1 under $20, $5 under $100, $10 under $500,
// $50 under $2,000, then $100
export function amountStep(cents: number): number {
    if (cents < 2000) return 100
    if (cents < 10000) return 500
    if (cents < 50000) return 1000
    if (cents < 200000) return 5000
    return 10000
}

export function snapAmount(cents: number): number {
    const s = amountStep(cents)
    return Math.round(cents / s) * s
}

// ── chart points ───────────────────────────────────────────────────────────

// A chart point's value and count for one of its series: "a", "b", "line", "run", "cmp"
export function pointValue(p: any, id: string): number {
    return id == "a" ? p.a : id == "b" ? p.b : id == "line" ? p.line : id == "run" ? p.run : p.cmp
}
export function pointCount(p: any, id: string): number {
    return id == "a" ? p.ca : id == "b" ? p.cb : id == "line" ? p.cl : id == "run" ? p.cr : p.cc
}

// ── chart scales ───────────────────────────────────────────────────────────

// An axis that starts at zero and ends at a round value: [lo, hi, step]. lo is 0 unless a
// value is negative (a loss), then a round value below it.
export function niceScale(min: number, max: number): number[] {
    const lo0 = Math.min(0, min), hi0 = Math.max(0, max)
    const span = hi0 - lo0 || 1
    const raw = span / 4
    const mag = Math.pow(10, Math.floor(Math.log10(raw)))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
    const lo = Math.floor(lo0 / step) * step
    const hi = Math.max(step, Math.ceil(hi0 / step) * step)
    return [lo, hi, step]
}

// ── search ─────────────────────────────────────────────────────────────────

// The words of a search, lower-cased; the ones a person sees highlighted
export function searchWords(q: string): string[] {
    return q.trim().toLowerCase().split(/\s+/).filter((w) => w != "")
}

function escapeHtmlText(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// text as HTML with every occurrence of a search word wrapped in <span class='Hit'>
export function highlightHtml(text: string, words: string[]): string {
    if (words.length == 0 || text == "") return escapeHtmlText(text)
    const lower = text.toLowerCase()
    const marks = new Array(text.length).fill(false)
    for (const w of words) {
        if (/^\$?[\d,.]+$/.test(w)) continue                     // a number matches amounts, not text
        let i = lower.indexOf(w)
        while (i >= 0 && w.length > 0) {
            for (let k = i; k < i + w.length; k++) marks[k] = true
            i = lower.indexOf(w, i + w.length)
        }
    }
    let out = "", open = false
    for (let k = 0; k < text.length; k++) {
        if (marks[k] && !open) { out += "<span class='Hit'>"; open = true }
        if (!marks[k] && open) { out += "</span>"; open = false }
        out += escapeHtmlText(text[k])
    }
    return open ? out + "</span>" : out
}

// ── CSV ────────────────────────────────────────────────────────────────────

export function csvCell(v: string): string {
    return /[",\n]/.test(v) ? "\"" + v.replace(/"/g, "\"\"") + "\"" : v
}
