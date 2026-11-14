// Ledger's helpers: plain functions of their arguments, outside the reactive
// system. Money is integer cents everywhere; dates are "YYYY-MM-DD" calendar
// strings and are never turned into instants that a time zone could shift
// (every Date here is built and read in UTC).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"]
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MINUS = "−"

// ── money ────────────────────────────────────────────────────────────────────

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })

// "$1,204.50", and money out with a true minus sign: "−$45.00"
function money(cents: number): string {
    const s = USD.format(Math.abs(cents) / 100)
    return cents < 0 ? MINUS + s : s
}

// the same, always with its sign: "+$12.00", "−$3.00"
function moneySigned(cents: number): string {
    return (cents > 0 ? "+" : "") + money(cents)
}

// compact, for chart axes only: "$1.2k", "$850", "$12k"
function moneyCompact(cents: number): string {
    const d = Math.abs(cents) / 100
    const sign = cents < 0 ? MINUS : ""
    if (d >= 1000000) return sign + "$" + trimZero((d / 1000000).toFixed(1)) + "M"
    if (d >= 1000) return sign + "$" + trimZero((d / 1000).toFixed(d >= 10000 ? 0 : 1)) + "k"
    return sign + "$" + Math.round(d)
}

function trimZero(s: string): string { return s.endsWith(".0") ? s.slice(0, -2) : s }

// what a person types: "42.50", "$1,204.5", "42" → cents; -1 when it isn't money
function parseMoney(text: string): number {
    const t = text.trim().replace(/[$,\s]/g, "")
    if (!/^\d+(\.\d{0,2})?$/.test(t)) return -1
    const [whole, frac] = t.split(".")
    return Number(whole) * 100 + Number(((frac ?? "") + "00").slice(0, 2))
}

// cents as a field shows them: "42.50"
function centsText(cents: number): string {
    return cents < 0 ? "" : (cents / 100).toFixed(2)
}

// a change, signed, in words a person reads: "12%", one decimal under 10
function pctText(p: number): string {
    const a = Math.abs(p)
    return (a < 10 ? a.toFixed(1).replace(/\.0$/, "") : Math.round(a).toString()) + "%"
}

function count(n: number): string { return n.toLocaleString("en-US") }

// ── dates ────────────────────────────────────────────────────────────────────

function pad(n: number): string { return n < 10 ? "0" + n : "" + n }

function partsOf(iso: string): number[] { return iso.split("-").map(Number) }

// a calendar day from year, month (1–12) and day, normalised (day 0 is the
// last day of the month before)
function isoOf(y: number, m: number, d: number): string {
    const t = new Date(Date.UTC(y, m - 1, d))
    return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate())
}

function addDays(iso: string, n: number): string { const p = partsOf(iso); return isoOf(p[0], p[1], p[2] + n) }

function daysBetween(a: string, b: string): number {
    const p = partsOf(a), q = partsOf(b)
    return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000)
}

function monthStart(iso: string): string { const p = partsOf(iso); return isoOf(p[0], p[1], 1) }
function monthEnd(iso: string): string { const p = partsOf(iso); return isoOf(p[0], p[1] + 1, 0) }
function addMonths(iso: string, n: number): string {
    const p = partsOf(iso)
    const last = partsOf(isoOf(p[0], p[1] + n + 1, 0))[2]
    return isoOf(p[0], p[1] + n, Math.min(p[2], last))
}
function quarterStart(iso: string): string { const p = partsOf(iso); return isoOf(p[0], Math.floor((p[1] - 1) / 3) * 3 + 1, 1) }
function monthKey(iso: string): string { return iso.slice(0, 7) }
function dayOfWeek(iso: string): number { const p = partsOf(iso); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() }

// whether a range is whole months, first day to last
function wholeMonths(from: string, to: string): boolean {
    return from != "" && to != "" && from == monthStart(from) && to == monthEnd(to)
}
function monthsIn(from: string, to: string): number {
    const a = partsOf(from), b = partsOf(to)
    return (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1
}

// the presets of the date filter, as [from, to]; "" is open-ended
function presetRange(preset: string, today: string): string[] {
    if (today == "") return ["", ""]
    const y = partsOf(today)[0]
    switch (preset) {
        case "this-month": return [monthStart(today), monthEnd(today)]
        case "last-month": { const m = addMonths(monthStart(today), -1); return [m, monthEnd(m)] }
        case "last-30": return [addDays(today, -29), today]
        case "this-quarter": { const q = quarterStart(today); return [q, addDays(addMonths(q, 3), -1)] }
        case "last-quarter": { const q = addMonths(quarterStart(today), -3); return [q, addDays(addMonths(q, 3), -1)] }
        case "this-year": return [y + "-01-01", y + "-12-31"]
        case "last-year": return [(y - 1) + "-01-01", (y - 1) + "-12-31"]
        case "last-12": return [monthStart(addMonths(today, -11)), monthEnd(today)]
        default: return ["", ""]
    }
}

const PRESETS = [
    { id: "this-month", label: "This month" }, { id: "last-month", label: "Last month" },
    { id: "last-30", label: "Last 30 days" }, { id: "this-quarter", label: "This quarter" },
    { id: "last-quarter", label: "Last quarter" }, { id: "this-year", label: "This year" },
    { id: "last-year", label: "Last year" }, { id: "last-12", label: "Last 12 months" },
    { id: "all", label: "All time" }
]
function presetLabel(id: string): string { return PRESETS.find((p) => p.id == id)?.label ?? "Custom" }

// the range of the same length before (dir −1) or after (dir 1): whole months
// step by months, anything else by days
function stepRange(from: string, to: string, dir: number): string[] {
    if (from == "" || to == "") return [from, to]
    if (wholeMonths(from, to)) {
        const n = monthsIn(from, to) * dir
        const f = addMonths(from, n)
        return [f, monthEnd(addMonths(monthStart(to), n))]
    }
    const n = (daysBetween(from, to) + 1) * dir
    return [addDays(from, n), addDays(to, n)]
}

// the comparison period: the one before, the same one a year earlier, or none
function comparisonRange(from: string, to: string, mode: string): string[] {
    if (from == "" || to == "" || mode == "none") return ["", ""]
    if (mode == "year") {
        return wholeMonths(from, to) ? [addMonths(from, -12), monthEnd(addMonths(monthStart(to), -12))]
            : [addMonths(from, -12), addMonths(to, -12)]
    }
    return stepRange(from, to, -1)
}

// a range as a person names it: "Nov 2026", "Oct – Dec 2026", "3 – 9 Nov 2026"
function rangeLabel(from: string, to: string): string {
    if (from == "" && to == "") return "All time"
    if (from == "") return "Until " + dayLabel(to)
    if (to == "") return "Since " + dayLabel(from)
    const a = partsOf(from), b = partsOf(to)
    if (wholeMonths(from, to)) {
        if (from.slice(0, 7) == to.slice(0, 7)) return MONTHS[a[1] - 1] + " " + a[0]
        if (a[1] == 1 && b[1] == 12 && a[0] == b[0]) return "" + a[0]
        if (a[0] == b[0]) return MONTHS[a[1] - 1] + " – " + MONTHS[b[1] - 1] + " " + b[0]
        return MONTHS[a[1] - 1] + " " + a[0] + " – " + MONTHS[b[1] - 1] + " " + b[0]
    }
    if (from == to) return dayLabel(from)
    if (a[0] == b[0] && a[1] == b[1]) return a[2] + " – " + b[2] + " " + MONTHS[b[1] - 1] + " " + b[0]
    if (a[0] == b[0]) return a[2] + " " + MONTHS[a[1] - 1] + " – " + b[2] + " " + MONTHS[b[1] - 1] + " " + b[0]
    return dayLabel(from) + " – " + dayLabel(to)
}

// the short name of a comparison period, for "▲ 12% vs Oct"
function shortRange(from: string, to: string): string {
    if (from == "" || to == "") return "before"
    const a = partsOf(from)
    if (wholeMonths(from, to) && monthsIn(from, to) == 1) return MONTHS[a[1] - 1]
    if (wholeMonths(from, to) && monthsIn(from, to) == 12 && a[1] == 1) return "" + a[0]
    return rangeLabel(from, to)
}

function dayLabel(iso: string): string {
    if (iso == "") return ""
    const p = partsOf(iso)
    return p[2] + " " + MONTHS[p[1] - 1] + " " + p[0]
}
function shortDay(iso: string): string {
    if (iso == "") return ""
    const p = partsOf(iso)
    return p[2] + " " + MONTHS[p[1] - 1]
}
function longDay(iso: string, today: string): string {
    if (iso == "") return ""
    if (iso == today) return "Today"
    if (iso == addDays(today, -1)) return "Yesterday"
    const p = partsOf(iso)
    return WEEKDAYS[dayOfWeek(iso)] + " " + p[2] + " " + MONTHS_LONG[p[1] - 1] + (p[0] == partsOf(today)[0] ? "" : " " + p[0])
}

// a chart period's name: "Nov 2026", "Q4 2026", "week of 2 Nov", "13 Nov"
function periodLabel(period: string, by: string): string {
    if (by == "month") { const p = period.split("-").map(Number); return MONTHS[p[1] - 1] + " " + p[0] }
    if (by == "quarter") { const [y, q] = period.split("-"); return q + " " + y }
    if (by == "week") return "Week of " + shortDay(period)
    return shortDay(period)
}
function periodTick(period: string, by: string): string {
    if (by == "month") { const p = period.split("-").map(Number); return MONTHS[p[1] - 1] }
    if (by == "quarter") return period.split("-")[1]
    return shortDay(period)
}

// what a person types for a date: "today", "yesterday", "3 nov", "nov 3",
// "3/11", "2026-11-03" → "YYYY-MM-DD"; "" when it isn't a date. A day with
// no year is the most recent one, so "3 dec" typed in November is last year's.
function parseDay(text: string, today: string): string {
    const t = text.trim().toLowerCase()
    if (today == "") return ""
    if (t == "" || t == "today") return today
    if (t == "yesterday") return addDays(today, -1)
    if (t == "tomorrow") return addDays(today, 1)
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
    if (m) return validDay(Number(m[1]), Number(m[2]), Number(m[3]))
    const ty = partsOf(today)[0]
    const monthOf = (w: string) => MONTHS.findIndex((n) => w.startsWith(n.toLowerCase())) + 1
    m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/.exec(t)
    if (m && monthOf(m[2]) > 0) return recent(Number(m[1]), monthOf(m[2]), m[3], ty, today)
    m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/.exec(t)
    if (m && monthOf(m[1]) > 0) return recent(Number(m[2]), monthOf(m[1]), m[3], ty, today)
    m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(t)
    if (m) return recent(Number(m[2]), Number(m[1]), m[3], ty, today)
    return ""
}
function validDay(y: number, mo: number, d: number): string {
    const iso = isoOf(y, mo, d)
    const p = partsOf(iso)
    return p[1] == mo && p[2] == d ? iso : ""
}
function recent(d: number, mo: number, year: string | undefined, ty: number, today: string): string {
    if (year != null) return validDay(Number(year), mo, d)
    const iso = validDay(ty, mo, d)
    return iso != "" && iso > today ? validDay(ty - 1, mo, d) : iso
}

// ── the filter, as the service's query string ───────────────────────────────

type FilterRec = { from: string, to: string, q: string, min: number, max: number,
    kind: string[], category: string[], contact: string[], product: string[] }

function qsOf(f: FilterRec): string {
    const out: string[] = []
    const put = (k: string, v: string) => { if (v != "") out.push(k + "=" + encodeURIComponent(v)) }
    put("from", f.from)
    put("to", f.to)
    put("q", f.q.trim())
    if (f.min >= 0) put("min", "" + f.min)
    if (f.max >= 0) put("max", "" + f.max)
    put("kind", f.kind.join(","))
    put("category", f.category.join(","))
    put("contact", f.contact.join(","))
    put("product", f.product.join(","))
    return out.join("&")
}

// the filter as the bulk endpoint's `where` object
function whereOf(f: FilterRec, except: string[]): object {
    const w: any = {}
    if (f.from != "") w.from = f.from
    if (f.to != "") w.to = f.to
    if (f.q.trim() != "") w.q = f.q.trim()
    if (f.min >= 0) w.min = "" + f.min
    if (f.max >= 0) w.max = "" + f.max
    if (f.kind.length > 0) w.kind = f.kind
    if (f.category.length > 0) w.category = f.category
    if (f.contact.length > 0) w.contact = f.contact
    if (f.product.length > 0) w.product = f.product
    if (except.length > 0) w.except = except
    return w
}

// ── the amount scale ─────────────────────────────────────────────────────────
//
// Amounts are skewed (most between $5 and $200, a few in the thousands), so
// the slider moves over these friendly steps rather than a straight line.
// The last step means "no top".

const AMOUNT_STEPS = [0, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 10000, 12500,
    15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000, 150000, 200000, 300000, 500000]
const AMOUNT_TICKS = [1000, 5000, 10000, 50000, 100000, 500000]

function amountTop(): number { return AMOUNT_STEPS.length - 1 }

// the step a number of cents sits on (or nearest below/above)
function amountIndex(cents: number, up: boolean): number {
    if (cents < 0) return up ? amountTop() : 0
    let i = 0
    while (i < AMOUNT_STEPS.length - 1 && AMOUNT_STEPS[i + 1] <= cents) i = i + 1
    if (up && AMOUNT_STEPS[i] < cents && i < amountTop()) i = i + 1
    return i
}
function amountAt(i: number): number { return AMOUNT_STEPS[Math.max(0, Math.min(amountTop(), Math.round(i)))] }

// where an amount sits along the slider, 0–1, between the steps
function amountFrac(cents: number): number {
    if (cents <= 0) return 0
    const top = amountTop()
    if (cents >= AMOUNT_STEPS[top]) return 1
    const i = amountIndex(cents, false)
    const a = AMOUNT_STEPS[i], b = AMOUNT_STEPS[i + 1]
    return (i + (cents - a) / (b - a)) / top
}

function amountTickLabel(cents: number): string {
    return cents >= 100000 ? "$" + cents / 100000 + "k" : "$" + cents / 100
}

// the chip for an amount range: "$20 – $200", "≥ $500", "≤ $50"
function amountChip(min: number, max: number): string {
    const d = (c: number) => (c % 100 == 0 ? "$" + count(c / 100) : money(c))
    if (min >= 0 && max >= 0) return d(min) + " – " + d(max)
    if (min >= 0) return "≥ " + d(min)
    return "≤ " + d(max)
}

// ── search highlighting ─────────────────────────────────────────────────────

// the text as HTML with every searched word marked in bold
function markWords(text: string, q: string): string {
    const words = q.trim().split(/\s+/).filter((w) => w != "" && !/^\$?[\d,.]+$/.test(w))
    if (words.length == 0) return escapeHtml(text)
    const re = new RegExp("(" + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi")
    return text.split(re).map((part, i) => (i % 2 == 1 ? "<b>" + escapeHtml(part) + "</b>" : escapeHtml(part))).join("")
}

// ── export ───────────────────────────────────────────────────────────────────

function csvCell(v: string): string {
    return /[",\n]/.test(v) ? "\"" + v.replace(/"/g, "\"\"") + "\"" : v
}

// one row per transaction, ISO dates, amounts as plain numbers (money in
// positive, money out negative)
function csvOf(rows: any[], categoryName: (id: string | null) => string): string {
    const head = ["id", "date", "kind", "description", "contact", "category", "channel", "amount"]
    const lines = rows.map((r) => [
        r.id, r.date, r.kind, r.description ?? "", r.contactName ?? "",
        r.split != null ? r.split.categoryIds.map((c: string) => categoryName(c)).join(" / ") : categoryName(r.categoryId ?? null),
        r.channel ?? "", (r.signed / 100).toFixed(2)
    ].map((v) => csvCell(String(v))).join(","))
    return [head.join(","), ...lines].join("\n") + "\n"
}

// ── charts ───────────────────────────────────────────────────────────────────

// the round number at or above a chart's largest value, for the top of its axis
function niceTop(v: number): number {
    if (v <= 0) return 1
    const p = Math.pow(10, Math.floor(Math.log10(v)))
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p
    return 10 * p
}

// the granularity a range reads best at: days, weeks, months or quarters
function autoGrain(from: string, to: string): string {
    if (from == "" || to == "") return "quarter"
    const days = daysBetween(from, to) + 1
    return days <= 45 ? "day" : days <= 125 ? "week" : days <= 800 ? "month" : "quarter"
}
