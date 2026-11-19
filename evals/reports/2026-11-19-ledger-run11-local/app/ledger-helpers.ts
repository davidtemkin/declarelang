// Ledger's helpers: plain functions of their arguments — money, calendar dates,
// the filter written as a query string, the amount slider's scale, CSV.
// Nothing here holds state; the program's state is in ledger.declare.

// ── money ────────────────────────────────────────────────────────────────────
// Amounts are whole cents everywhere. Formatting never goes through a float
// division that could round: the dollars and the cents are split as integers.

const MINUS = "−"

function groupThousands(n: number): string {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** "$1,204.50", "−$45.00" — always two decimals, a true minus sign. */
function money(cents: number): string {
    const c = Math.round(cents ?? 0)
    const a = Math.abs(c)
    const s = "$" + groupThousands(Math.floor(a / 100)) + "." + String(a % 100).padStart(2, "0")
    return c < 0 ? MINUS + s : s
}

/** "+$1,204.50" / "−$45.00": a change, signed either way. */
function signedMoney(cents: number): string {
    return cents > 0 ? "+" + money(cents) : money(cents)
}

/** Compact, for chart axes only: "$1.2k", "$850", "−$3k". */
function compactMoney(cents: number): string {
    const d = Math.abs(cents) / 100
    const sign = cents < 0 ? MINUS : ""
    if (d >= 1000000) return sign + "$" + trimZero((d / 1000000).toFixed(1)) + "M"
    if (d >= 1000) return sign + "$" + trimZero((d / 1000).toFixed(d >= 10000 ? 0 : 1)) + "k"
    return sign + "$" + Math.round(d)
}

function trimZero(s: string): string { return s.endsWith(".0") ? s.slice(0, -2) : s }

/** Whole dollars for slider labels: "$10", "$1k", "$2.5k". */
function friendlyDollars(cents: number): string {
    const d = cents / 100
    if (d >= 1000) return "$" + trimZero((d / 1000).toFixed(1)) + "k"
    return "$" + d
}

/** Reads what a person typed as money: "42.5", "$1,204.50", "12" → cents, or null. */
function parseMoney(text: string): number | null {
    const t = (text ?? "").replace(/[$,\s]/g, "")
    if (!/^\d+(\.\d{0,2})?$/.test(t)) return null
    const [whole, frac = ""] = t.split(".")
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2))
}

/** Money as a field shows it for editing: "1204.50". */
function moneyField(cents: number | null): string {
    if (cents == null) return ""
    return Math.floor(cents / 100) + "." + String(cents % 100).padStart(2, "0")
}

/** A percentage change, signed: "+12%", "−4%"; "" when there is no base. */
function pctChange(now: number, before: number): string {
    if (before == 0 || before == null) return ""
    const p = Math.round(((now - before) / Math.abs(before)) * 100)
    return (p > 0 ? "+" : p < 0 ? MINUS : "") + Math.abs(p) + "%"
}

function pct(n: number | null): string {
    if (n == null) return "—"
    return n.toFixed(1) + "%"
}

// ── calendar dates ───────────────────────────────────────────────────────────
// A date is "YYYY-MM-DD" and stays one: arithmetic goes through UTC so the
// viewer's time zone can never move a day.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function ymd(iso: string): number[] { return (iso ?? "").split("-").map(Number) }
function isoOf(y: number, m: number, d: number): string {
    const t = new Date(Date.UTC(y, m - 1, d))
    return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0")
}
function addDays(iso: string, n: number): string { const p = ymd(iso); return isoOf(p[0], p[1], p[2] + n) }
function addMonths(iso: string, n: number): string { const p = ymd(iso); return isoOf(p[0], p[1] + n, 1) }
function daysBetween(a: string, b: string): number {
    const p = ymd(a), q = ymd(b)
    return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000)
}
function monthStart(iso: string): string { const p = ymd(iso); return isoOf(p[0], p[1], 1) }
function monthEnd(iso: string): string { const p = ymd(iso); return isoOf(p[0], p[1] + 1, 0) }
function daysInMonth(iso: string): number { return ymd(monthEnd(iso))[2] }
function quarterStart(iso: string): string { const p = ymd(iso); return isoOf(p[0], Math.floor((p[1] - 1) / 3) * 3 + 1, 1) }

/** "18 Nov 2026" */
function longDate(iso: string): string {
    if (!iso) return ""
    const p = ymd(iso)
    return p[2] + " " + MONTHS[p[1] - 1] + " " + p[0]
}
/** "18 Nov" this year, "18 Nov 2025" otherwise. */
function shortDate(iso: string, today: string): string {
    if (!iso) return ""
    const p = ymd(iso)
    return p[2] + " " + MONTHS[p[1] - 1] + (p[0] == ymd(today)[0] ? "" : " " + p[0])
}
/** A day heading on the phone's list: "Today", "Yesterday", "Mon 16 Nov". */
function dayHeading(iso: string, today: string): string {
    const n = daysBetween(iso, today)
    if (n == 0) return "Today"
    if (n == 1) return "Yesterday"
    const p = ymd(iso)
    const wd = WEEKDAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()]
    return wd + " " + shortDate(iso, today)
}
function monthName(iso: string): string { return MONTHS[ymd(iso)[1] - 1] }
function monthYear(iso: string): string { const p = ymd(iso); return MONTHS_LONG[p[1] - 1] + " " + p[0] }

/** What a person types for a date: "today", "yesterday", "3 nov", "nov 3", "3/11", ISO. */
function parseDate(text: string, today: string): string | null {
    const t = (text ?? "").trim().toLowerCase()
    if (t == "" ) return null
    if (t == "today") return today
    if (t == "yesterday") return addDays(today, -1)
    if (t == "tomorrow") return addDays(today, 1)
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
        const p = ymd(t)
        return isoOf(p[0], p[1], p[2]) == t ? t : null
    }
    const y0 = ymd(today)[0]
    const mi = (w: string) => MONTHS.findIndex((m) => w.startsWith(m.toLowerCase()))
    let m = /^(\d{1,2})\s*([a-z]+)\.?\s*(\d{4})?$/.exec(t)
    if (m && mi(m[2]) >= 0) return checked(m[3] ? Number(m[3]) : y0, mi(m[2]) + 1, Number(m[1]))
    m = /^([a-z]+)\.?\s*(\d{1,2})(?:,?\s*(\d{4}))?$/.exec(t)
    if (m && mi(m[1]) >= 0) return checked(m[3] ? Number(m[3]) : y0, mi(m[1]) + 1, Number(m[2]))
    m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(t)
    if (m) return checked(m[3] ? Number(m[3]) : y0, Number(m[2]), Number(m[1]))
    return null
}
function checked(y: number, m: number, d: number): string | null {
    const iso = isoOf(y, m, d)
    const p = ymd(iso)
    return p[1] == m && p[2] == d ? iso : null
}

// ── date ranges ──────────────────────────────────────────────────────────────

type Range = { from: string, to: string }

const PRESETS = [
    { id: "this-month", label: "This month" }, { id: "last-month", label: "Last month" },
    { id: "last-30", label: "Last 30 days" }, { id: "this-quarter", label: "This quarter" },
    { id: "last-quarter", label: "Last quarter" }, { id: "this-year", label: "This year" },
    { id: "last-year", label: "Last year" }, { id: "last-12", label: "Last 12 months" },
    { id: "all", label: "All time" },
]

function presetRange(id: string, today: string): Range {
    const y = ymd(today)[0]
    switch (id) {
        case "last-month": return { from: addMonths(today, -1), to: monthEnd(addMonths(today, -1)) }
        case "last-30": return { from: addDays(today, -29), to: today }
        case "this-quarter": { const q = quarterStart(today); return { from: q, to: monthEnd(addMonths(q, 2)) } }
        case "last-quarter": { const q = addMonths(quarterStart(today), -3); return { from: q, to: monthEnd(addMonths(q, 2)) } }
        case "this-year": return { from: y + "-01-01", to: y + "-12-31" }
        case "last-year": return { from: (y - 1) + "-01-01", to: (y - 1) + "-12-31" }
        case "last-12": return { from: addMonths(today, -11), to: monthEnd(today) }
        case "all": return { from: "", to: "" }
        default: return { from: monthStart(today), to: monthEnd(today) }
    }
}

function presetList(): { id: string, label: string }[] { return PRESETS }

function presetLabel(id: string): string { return PRESETS.find((p) => p.id == id)?.label ?? "" }

/** A range in words: "Nov 2026", "Jan – Dec 2026", "3 Oct – 18 Nov 2026". */
function rangeLabel(from: string, to: string, today: string): string {
    if (from == "" && to == "") return "All time"
    if (from == "") return "Until " + longDate(to)
    if (to == "") return "Since " + longDate(from)
    const a = ymd(from), b = ymd(to)
    if (from == monthStart(from) && to == monthEnd(from)) return MONTHS[a[1] - 1] + " " + a[0]
    if (from == monthStart(from) && to == monthEnd(to)) {
        return a[0] == b[0] ? MONTHS[a[1] - 1] + " – " + MONTHS[b[1] - 1] + " " + b[0]
            : MONTHS[a[1] - 1] + " " + a[0] + " – " + MONTHS[b[1] - 1] + " " + b[0]
    }
    return (a[0] == b[0] ? a[2] + " " + MONTHS[a[1] - 1] : longDate(from)) + " – " + longDate(to)
}

/** Whole months from..to (both month-aligned)? Then steps go by months. */
function monthSpan(from: string, to: string): number {
    if (from == "" || to == "" || from != monthStart(from) || to != monthEnd(to)) return 0
    const a = ymd(from), b = ymd(to)
    return (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1
}

/** The range of the same length before (dir −1) or after (+1). */
function shiftRange(from: string, to: string, dir: number): Range {
    if (from == "" || to == "") return { from, to }
    const months = monthSpan(from, to)
    if (months > 0) {
        const f = addMonths(from, dir * months)
        return { from: f, to: monthEnd(addMonths(f, months - 1)) }
    }
    const n = daysBetween(from, to) + 1
    return { from: addDays(from, dir * n), to: addDays(to, dir * n) }
}

/** The comparison period for a range: the one before it, or the same one a year earlier. */
function compareRange(from: string, to: string, mode: string): Range | null {
    if (mode == "none" || from == "" || to == "") return null
    if (mode == "year") {
        const a = ymd(from), b = ymd(to)
        const t = to == monthEnd(to) ? monthEnd(isoOf(b[0] - 1, b[1], 1)) : isoOf(b[0] - 1, b[1], b[2])
        return { from: isoOf(a[0] - 1, a[1], a[2]), to: t }
    }
    return shiftRange(from, to, -1)
}

/** The comparison for a range still in progress is cut to the same days, so a
 *  month so far is never set against a whole month. */
function compareRangeSoFar(from: string, to: string, mode: string, today: string): Range | null {
    const r = compareRange(from, to, mode)
    if (r == null) return null
    if (to > today && from <= today) return { from: r.from, to: addDays(r.from, daysBetween(from, today)) }
    return r
}

/** "Oct", "1–18 Oct", "Nov 2025", "previous period" — how a change names what it is against. */
function compareLabel(from: string, to: string, mode: string, today: string): string {
    const r = compareRange(from, to, mode)
    if (r == null) return ""
    if (to > today && from <= today && monthSpan(r.from, r.to) == 1) {
        const c = compareRangeSoFar(from, to, mode, today)!
        const a = ymd(c.from), b = ymd(c.to)
        return a[2] + "–" + b[2] + " " + MONTHS[a[1] - 1] + (a[0] == ymd(today)[0] ? "" : " " + a[0])
    }
    if (to > today && from <= today) {
        const c = compareRangeSoFar(from, to, mode, today)!
        return rangeLabel(c.from, c.to, today)
    }
    if (monthSpan(r.from, r.to) == 1) return ymd(r.from)[0] == ymd(today)[0] ? MONTHS[ymd(r.from)[1] - 1] : MONTHS[ymd(r.from)[1] - 1] + " " + ymd(r.from)[0]
    if (mode == "year") return "last year"
    return "previous period"
}

/** The granularity that suits a range. */
function suitedBy(from: string, to: string, today: string): string {
    const n = daysBetween(from == "" ? "2024-11-01" : from, to == "" ? today : to)
    if (n <= 31) return "day"
    if (n <= 120) return "week"
    if (n <= 800) return "month"
    return "quarter"
}

/** A period's name in a sentence: "March 2026", "week of 2 Nov", "Q4 2026", "3 Nov". */
function periodName(period: string, by: string): string {
    if (by == "month") return monthYear(period + "-01")
    if (by == "quarter") return period.replace("-", " ").split(" ").reverse().join(" ")
    if (by == "week") return "week of " + longDate(period)
    return longDate(period)
}
/** A period's short axis label. */
function periodTick(period: string, by: string): string {
    if (by == "month") return MONTHS[ymd(period + "-01")[1] - 1]
    if (by == "quarter") return period.slice(5) + " " + period.slice(2, 4)
    const p = ymd(period)
    return p[2] + " " + MONTHS[p[1] - 1]
}

// ── the filter, as the service reads it ──────────────────────────────────────

type FilterRec = { from: string, to: string, q: string, min?: number | null, max?: number | null,
    kinds: string[], cats: string[], contacts: string[], products: string[] }

function filterParams(f: FilterRec, withDates: boolean, withAmount: boolean): URLSearchParams {
    const p = new URLSearchParams()
    if (withDates && f.from) p.set("from", f.from)
    if (withDates && f.to) p.set("to", f.to)
    if ((f.q ?? "").trim() != "") p.set("q", f.q.trim())
    if (withAmount && f.min != null) p.set("min", String(f.min))
    if (withAmount && f.max != null) p.set("max", String(f.max))
    if (f.kinds.length > 0) p.set("kind", f.kinds.join(","))
    if (f.cats.length > 0) p.set("category", f.cats.join(","))
    if (f.contacts.length > 0) p.set("contact", f.contacts.join(","))
    if ((f.products ?? []).length > 0) p.set("product", f.products.join(","))
    return p
}

/** The query string for a filter, with any extra parameters laid over it. */
function query(f: FilterRec, extra: object): string {
    const p = filterParams(f, true, true)
    for (const [k, v] of Object.entries(extra ?? {})) {
        if (v == null || v === "") p.delete(k)
        else p.set(k, String(v))
    }
    return p.toString()
}

/** The filter with no amount: what the amount histogram is drawn over. */
function queryNoAmount(f: FilterRec): string { return filterParams(f, true, false).toString() }

/** The filter as a bulk change's `where` object. */
function whereOf(f: FilterRec, except: string[]): object {
    const w: any = {}
    for (const [k, v] of filterParams(f, true, true).entries()) w[k] = v
    if (except.length > 0) w.except = except
    return w
}

/** Kinds both the filter and a figure allow ("If the filter already has kind, use the kinds both allow"). */
function kindsBoth(filterKinds: string[], figure: string[]): string[] {
    if (filterKinds.length == 0) return figure
    const both = figure.filter((k) => filterKinds.includes(k))
    return both.length > 0 ? both : ["none-of-these"]
}

// ── the amount slider's scale ────────────────────────────────────────────────
// Most amounts are $5–$200 with a few rents in the thousands, so the slider
// moves along steps at friendly values rather than a straight line of cents.

const AMOUNT_STEPS = [0, 200, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 10000,
    12500, 15000, 20000, 25000, 30000, 40000, 50000, 60000, 75000, 100000, 150000, 200000, 300000, 500000]
const AMOUNT_TICKS = [1000, 5000, 10000, 50000, 100000, 500000]

function amountStepCount(): number { return AMOUNT_STEPS.length - 1 }
function amountAt(step: number): number { return AMOUNT_STEPS[Math.max(0, Math.min(AMOUNT_STEPS.length - 1, Math.round(step)))] }
/** Where an amount in cents sits on the slider's step scale (fractional between steps). */
function stepOf(cents: number): number {
    if (cents <= 0) return 0
    for (let i = 1; i < AMOUNT_STEPS.length; i++) {
        if (cents <= AMOUNT_STEPS[i]) return i - 1 + (cents - AMOUNT_STEPS[i - 1]) / (AMOUNT_STEPS[i] - AMOUNT_STEPS[i - 1])
    }
    return AMOUNT_STEPS.length - 1
}
function amountTicks(): number[] { return AMOUNT_TICKS }

/** The amount filter's chip: "$20 – $200", "≥ $500", "≤ $50". */
function amountChip(min: number | null, max: number | null): string {
    if (min != null && max != null) return money(min).replace(".00", "") + " – " + money(max).replace(".00", "")
    if (min != null) return "≥ " + money(min).replace(".00", "")
    if (max != null) return "≤ " + money(max).replace(".00", "")
    return ""
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function csvCell(v: any): string {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
/** Cents as a plain number: -45.00 */
function plainAmount(cents: number): string {
    const a = Math.abs(cents)
    return (cents < 0 ? "-" : "") + Math.floor(a / 100) + "." + String(a % 100).padStart(2, "0")
}
function toCsv(header: string[], rows: any[][]): string {
    return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n"
}

/** Every word of the search, for highlighting. */
function searchWords(q: string): string[] {
    return (q ?? "").trim().split(/\s+/).filter((w) => w != "" && !/^\$?[\d,]+(\.\d+)?$/.test(w))
}
/** Text with each search word wrapped for highlighting, escaped for HTMLText. */
function highlight(text: string, q: string): string {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const words = searchWords(q)
    if (words.length == 0) return esc(text ?? "")
    const re = new RegExp("(" + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi")
    return (text ?? "").split(re).map((part, i) => i % 2 == 1 ? "<span class='Hit'>" + esc(part) + "</span>" : esc(part)).join("")
}

/** A round step for an axis: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(raw: number): number {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))))
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p
    return 10 * p
}

function kindWord(kind: string): string { return kind == "sale" ? "Sale" : kind == "refund" ? "Refund" : "Expense" }
