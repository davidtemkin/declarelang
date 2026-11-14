// Ledger's helpers: functions of their arguments, outside the reactive system.
// Money is integer cents everywhere; dates are "YYYY-MM-DD" calendar dates,
// computed in UTC so they never shift with the viewer's time zone.

const MINUS = "−"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"]
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// ── money ────────────────────────────────────────────────────────────────

const usd = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

// "$1,204.50", "−$45.00": always two decimals, a true minus sign.
function money(cents: number): string {
    const sign = cents < 0 ? MINUS : ""
    return sign + "$" + usd.format(Math.abs(cents) / 100)
}

// "+$1,204.50" for a change, where the sign is the point.
function moneyChange(cents: number): string {
    return (cents > 0 ? "+" : "") + money(cents)
}

// Chart axes only: "$1.2k", "$850", "$12k", "$1.5M".
function moneyCompact(cents: number): string {
    const d = Math.abs(cents) / 100
    const sign = cents < 0 ? MINUS : ""
    if (d >= 1000000) return sign + "$" + trimZero((d / 1000000).toFixed(1)) + "M"
    if (d >= 1000) return sign + "$" + trimZero((d / 1000).toFixed(d >= 10000 ? 0 : 1)) + "k"
    return sign + "$" + whole.format(d)
}

function trimZero(s: string): string { return s.endsWith(".0") ? s.slice(0, -2) : s }

// "$20", "$1k", "$1,500": a friendly whole-dollar label for a slider or a chip.
function dollars(cents: number): string {
    const d = cents / 100
    if (d >= 1000 && d % 1000 == 0) return "$" + d / 1000 + "k"
    return "$" + whole.format(d) + (cents % 100 != 0 ? "." + String(cents % 100).padStart(2, "0") : "")
}

function count(n: number): string { return whole.format(n) }

// What a person typed as an amount → cents, or null when it isn't one.
// Takes "12", "12.4", "$1,204.50".
function parseMoney(text: string): number | null {
    const t = text.trim().replace(/[$,\s]/g, "")
    if (t == "" || !/^\d*(\.\d{0,2})?$/.test(t) || t == ".") return null
    const [d, f = ""] = t.split(".")
    return Number(d || "0") * 100 + Number((f + "00").slice(0, 2))
}

// cents → what an amount field shows: "12.40"
function moneyInput(cents: number | null): string {
    if (cents == null) return ""
    return Math.floor(cents / 100) + "." + String(cents % 100).padStart(2, "0")
}

// ── percentages and changes ──────────────────────────────────────────────

// The relative change from `before` to `now`, or null when there's nothing to compare.
function change(now: number, before: number): number | null {
    if (before == 0) return null
    return (now - before) / Math.abs(before)
}

// "▲ 12%", "▼ 3.4%", "—": the arrow carries the direction, the number its size.
function changeText(ch: number | null): string {
    if (ch == null || !isFinite(ch)) return "—"
    const p = Math.abs(ch * 100)
    const n = p >= 10 ? Math.round(p).toString() : p.toFixed(1)
    if (n == "0" || n == "0.0") return "■ 0%"
    return (ch > 0 ? "▲ " : "▼ ") + n + "%"
}

// "+12%", "−3.4%" in a table cell.
function signedPct(ch: number | null): string {
    if (ch == null || !isFinite(ch)) return "—"
    const p = ch * 100
    const n = Math.abs(p) >= 10 ? Math.round(Math.abs(p)).toString() : Math.abs(p).toFixed(1)
    return (p > 0 ? "+" : p < 0 ? MINUS : "") + n + "%"
}

// A change in percentage points, for gross margin: "▲ 2.1 pts"
function pointsText(now: number | null, before: number | null): string {
    if (now == null || before == null) return "—"
    const d = now - before
    if (Math.abs(d) < 0.05) return "■ 0 pts"
    return (d > 0 ? "▲ " : "▼ ") + Math.abs(d).toFixed(1) + " pts"
}

function pct(p: number | null): string { return p == null ? "—" : p.toFixed(1) + "%" }

// ── calendar dates ───────────────────────────────────────────────────────

function pad2(n: number): string { return n < 10 ? "0" + n : "" + n }
function isoOf(y: number, m: number, d: number): string {
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.getUTCFullYear() + "-" + pad2(dt.getUTCMonth() + 1) + "-" + pad2(dt.getUTCDate())
}
function ymd(iso: string): number[] { return (iso ?? "").split("-").map(Number) }
function addDays(iso: string, n: number): string { const p = ymd(iso); return isoOf(p[0], p[1], p[2] + n) }
function addMonths(iso: string, n: number): string {
    const p = ymd(iso)
    const last = ymd(isoOf(p[0], p[1] + n + 1, 0))[2]
    return isoOf(p[0], p[1] + n, Math.min(p[2], last))
}
function monthStart(iso: string): string { const p = ymd(iso); return isoOf(p[0], p[1], 1) }
function monthEnd(iso: string): string { const p = ymd(iso); return isoOf(p[0], p[1] + 1, 0) }
function daysBetween(a: string, b: string): number {
    const p = ymd(a), q = ymd(b)
    return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000)
}
function isMonthStart(iso: string): boolean { return ymd(iso)[2] == 1 }
function isMonthEnd(iso: string): boolean { return monthEnd(iso) == iso }

// "Nov 7, 2026" / "Nov 7" in the current year
function dateLabel(iso: string, today: string): string {
    if (!iso) return ""
    const p = ymd(iso)
    const base = MONTHS[p[1] - 1] + " " + p[2]
    return p[0] == ymd(today)[0] ? base : base + ", " + p[0]
}
function dateLong(iso: string): string {
    if (!iso) return ""
    const p = ymd(iso)
    return WEEKDAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ", " + MONTHS[p[1] - 1] + " " + p[2] + ", " + p[0]
}
// A phone's day heading: "Today", "Yesterday", "Wednesday, Nov 5"
function dayHeading(iso: string, today: string): string {
    if (!iso) return ""
    const n = daysBetween(iso, today)
    if (n == 0) return "Today"
    if (n == 1) return "Yesterday"
    return dateLong(iso)
}
function monthName(iso: string): string { return MONTHS[ymd(iso)[1] - 1] }

// The date range presets, each a from/to pair relative to today.
function presetRange(preset: string, today: string): string[] {
    const p = ymd(today)
    const q = Math.floor((p[1] - 1) / 3)
    switch (preset) {
        case "this-month": return [monthStart(today), monthEnd(today)]
        case "last-month": { const m = addMonths(monthStart(today), -1); return [m, monthEnd(m)] }
        case "last-30": return [addDays(today, -29), today]
        case "this-quarter": return [isoOf(p[0], q * 3 + 1, 1), isoOf(p[0], q * 3 + 4, 0)]
        case "last-quarter": return [isoOf(p[0], q * 3 - 2, 1), isoOf(p[0], q * 3 + 1, 0)]
        case "this-year": return [isoOf(p[0], 1, 1), isoOf(p[0], 12, 31)]
        case "last-year": return [isoOf(p[0] - 1, 1, 1), isoOf(p[0] - 1, 12, 31)]
        case "last-12": return [monthStart(addMonths(today, -11)), monthEnd(today)]
        case "all": return ["", ""]
    }
    return [monthStart(today), monthEnd(today)]
}

// How many whole months a range spans, or 0 when it isn't whole months.
function wholeMonths(from: string, to: string): number {
    if (!isMonthStart(from) || !isMonthEnd(to)) return 0
    const a = ymd(from), b = ymd(to)
    return (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1
}

// The same length of time, `dir` steps earlier or later. Whole months step by
// months (so "November" steps to "October"); anything else steps by days.
function stepRange(from: string, to: string, dir: number): string[] {
    const months = wholeMonths(from, to)
    if (months > 0) {
        const f = addMonths(from, dir * months)
        return [f, monthEnd(addMonths(f, months - 1))]
    }
    const days = daysBetween(from, to) + 1
    return [addDays(from, dir * days), addDays(to, dir * days)]
}

// The comparison period for a range: the one before it, or the same one a year earlier.
function compareRange(from: string, to: string, mode: string): string[] {
    if (mode == "none" || from == "" || to == "") return ["", ""]
    if (mode == "year") return [addMonths(from, -12), isMonthEnd(to) ? monthEnd(addMonths(to, -12)) : addMonths(to, -12)]
    return stepRange(from, to, -1)
}

// How a range reads: "November 2026", "Q4 2026", "2026", "Oct 1 – Nov 13, 2026"
function rangeLabel(from: string, to: string, today: string): string {
    if (from == "" && to == "") return "All time"
    if (from == "" || to == "") return from == "" ? "Until " + dateLabel(to, today) : "From " + dateLabel(from, today)
    const a = ymd(from), b = ymd(to)
    const months = wholeMonths(from, to)
    if (months == 1) return MONTHS_LONG[a[1] - 1] + " " + a[0]
    if (months == 3 && (a[1] - 1) % 3 == 0) return "Q" + ((a[1] - 1) / 3 + 1) + " " + a[0]
    if (months == 12 && a[1] == 1) return "" + a[0]
    if (months > 0) return MONTHS[a[1] - 1] + (a[0] != b[0] ? " " + a[0] : "") + " – " + MONTHS[b[1] - 1] + " " + b[0]
    if (from == to) return dateLabel(from, today)
    return MONTHS[a[1] - 1] + " " + a[2] + (a[0] != b[0] ? ", " + a[0] : "") + " – " + MONTHS[b[1] - 1] + " " + b[2] + ", " + b[0]
}

// "vs Oct", "vs Nov 2025", "vs previous 30 days"
function compareLabel(from: string, to: string, mode: string, today: string): string {
    if (mode == "none") return ""
    const r = compareRange(from, to, mode)
    if (r[0] == "") return ""
    const months = wholeMonths(r[0], r[1])
    if (months == 1) return "vs " + MONTHS[ymd(r[0])[1] - 1] + (mode == "year" ? " " + ymd(r[0])[0] : "")
    return "vs " + rangeLabel(r[0], r[1], today)
}

// Which granularity suits a range: days for up to a month, weeks to a quarter,
// months to two years, quarters beyond.
function grainFor(from: string, to: string): string {
    if (from == "" || to == "") return "month"
    const days = daysBetween(from, to) + 1
    if (days <= 45) return "day"
    if (days <= 120) return "week"
    if (days <= 800) return "month"
    return "quarter"
}

// What a period is called: "Nov 2026", "Nov 7", "Week of Nov 2", "Q4 2026"
function periodLabel(period: string, by: string): string {
    if (by == "month") { const p = period.split("-"); return MONTHS_LONG[Number(p[1]) - 1] + " " + p[0] }
    if (by == "quarter") { const p = period.split("-"); return p[1] + " " + p[0] }
    const p = ymd(period)
    return (by == "week" ? "Week of " : "") + MONTHS[p[1] - 1] + " " + p[2] + ", " + p[0]
}
// The short form under a chart's bar: "Nov", "7", "Nov 2", "Q4"
function periodTick(period: string, by: string): string {
    if (by == "month") return MONTHS[Number(period.split("-")[1]) - 1]
    if (by == "quarter") return period.split("-")[1] + " " + period.slice(2, 4)
    const p = ymd(period)
    return by == "day" ? "" + p[2] : MONTHS[p[1] - 1] + " " + p[2]
}
function periodMonthLong(period: string): string { return MONTHS_LONG[Number(period.split("-")[1]) - 1] }

// What a person types as a date → "YYYY-MM-DD", or "" when it isn't one.
// Takes "today", "yesterday", "3 nov", "nov 3", "11/3", "2026-11-03", "-2" (days ago).
function parseDay(text: string, today: string): string {
    const t = text.trim().toLowerCase()
    if (t == "" ) return ""
    if (t == "today" || t == "t") return today
    if (t == "yesterday" || t == "y") return addDays(today, -1)
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) { const p = ymd(t); const iso = isoOf(p[0], p[1], p[2]); return iso == isoOf(p[0], p[1], p[2]) && ymd(iso)[2] == p[2] ? iso : "" }
    if (/^-\d+$/.test(t)) return addDays(today, Number(t))
    const year = ymd(today)[0]
    const mi = (s: string) => MONTHS.findIndex((m) => s.startsWith(m.toLowerCase()))
    let m = -1, d = 0, y = year
    let r = t.match(/^(\d{1,2})\s*([a-z]+)\.?(?:\s+(\d{4}))?$/)
    if (r) { d = Number(r[1]); m = mi(r[2]); if (r[3]) y = Number(r[3]) }
    if (m < 0) { r = t.match(/^([a-z]+)\.?\s*(\d{1,2})(?:,?\s+(\d{4}))?$/); if (r) { m = mi(r[1]); d = Number(r[2]); if (r[3]) y = Number(r[3]) } }
    if (m < 0) { r = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/); if (r) { m = Number(r[1]) - 1; d = Number(r[2]); if (r[3]) y = Number(r[3]) < 100 ? 2000 + Number(r[3]) : Number(r[3]) } }
    if (m < 0 || m > 11 || d < 1 || d > 31) return ""
    const iso = isoOf(y, m + 1, d)
    if (ymd(iso)[2] != d) return ""
    // "3 nov" typed in early November for last November? A date without a year
    // that would land well in the future means last year.
    if (!r?.[3] && daysBetween(today, iso) > 31) return isoOf(y - 1, m + 1, d)
    return iso
}

// ── the filter, as the service reads it ──────────────────────────────────

// One query string for every read. Empty parts are left out.
function filterQuery(from: string, to: string, q: string, min: number, max: number,
        kinds: string[], cats: string[], contacts: string[]): string {
    const parts: string[] = []
    if (from != "") parts.push("from=" + from)
    if (to != "") parts.push("to=" + to)
    if (q.trim() != "") parts.push("q=" + encodeURIComponent(q.trim()))
    if (min > 0) parts.push("min=" + min)
    if (max >= 0) parts.push("max=" + max)
    if (kinds.length > 0) parts.push("kind=" + kinds.join(","))
    if (cats.length > 0) parts.push("category=" + cats.join(","))
    if (contacts.length > 0) parts.push("contact=" + contacts.join(","))
    return parts.join("&")
}

// The same filter as a `where` object, for a bulk change.
function filterWhere(from: string, to: string, q: string, min: number, max: number,
        kinds: string[], cats: string[], contacts: string[]): object {
    const w: { [k: string]: string } = {}
    if (from != "") w.from = from
    if (to != "") w.to = to
    if (q.trim() != "") w.q = q.trim()
    if (min > 0) w.min = "" + min
    if (max >= 0) w.max = "" + max
    if (kinds.length > 0) w.kind = kinds.join(",")
    if (cats.length > 0) w.category = cats.join(",")
    if (contacts.length > 0) w.contact = contacts.join(",")
    return w
}

// Kinds both the filter and a figure allow: a figure's own kinds, narrowed by
// the filter's when it has any. An empty result means nothing can match.
function bothKinds(filterKinds: string[], figureKinds: string[]): string[] {
    if (figureKinds.length == 0) return filterKinds
    if (filterKinds.length == 0) return figureKinds
    return figureKinds.filter((k) => filterKinds.includes(k))
}

// ── the amount scale ─────────────────────────────────────────────────────
//
// The slider's steps are the service's histogram edges, so each bar of the
// histogram sits exactly between two steps. The last step is "no top".

const AMOUNT_EDGES = [0, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000,
    75000, 100000, 150000, 200000, 300000, 500000]
function amountEdges(): number[] { return AMOUNT_EDGES }
function amountTop(): number { return AMOUNT_EDGES.length }      // the "no maximum" step
function edgeCents(i: number): number { return i >= AMOUNT_EDGES.length ? -1 : AMOUNT_EDGES[Math.max(0, i)] }
// The step nearest a cent amount (for showing a typed amount on the track).
function stepOf(cents: number): number {
    if (cents < 0) return AMOUNT_EDGES.length
    let best = 0
    for (let i = 0; i < AMOUNT_EDGES.length; i++) if (Math.abs(AMOUNT_EDGES[i] - cents) < Math.abs(AMOUNT_EDGES[best] - cents)) best = i
    return best
}
// Where a cent amount sits on the track, 0..1, between its steps.
function amountFrac(cents: number): number {
    const top = AMOUNT_EDGES.length
    if (cents < 0) return 1
    for (let i = 0; i < AMOUNT_EDGES.length - 1; i++) {
        if (cents <= AMOUNT_EDGES[i + 1]) return (i + (cents - AMOUNT_EDGES[i]) / (AMOUNT_EDGES[i + 1] - AMOUNT_EDGES[i])) / top
    }
    return Math.min(1, (AMOUNT_EDGES.length - 1 + (cents - 500000) / 500000) / top)
}
// The amount chip: "$20 – $200", "≥ $500", "≤ $50"
function amountChip(min: number, max: number): string {
    if (max < 0) return "≥ " + dollars(min)
    if (min <= 0) return "≤ " + dollars(max)
    return dollars(min) + " – " + dollars(max)
}

// ── search highlighting ──────────────────────────────────────────────────

function htmlEscape(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
function fold(s: string): string { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() }

// The text with every searched word marked, as HTML for an HTMLText.
function highlight(text: string, q: string): string {
    const words = q.trim().split(/\s+/).filter((w) => w != "" && !/^[$\d.,]+$/.test(w)).map(fold)
    if (words.length == 0) return htmlEscape(text)
    const f = fold(text)
    const marks = new Array(text.length).fill(false)
    for (const w of words) {
        let i = f.indexOf(w)
        while (i >= 0) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = f.indexOf(w, i + 1) }
    }
    let out = "", on = false
    for (let i = 0; i < text.length; i++) {
        if (marks[i] != on) { out += marks[i] ? "<span class='Hit'>" : "</span>"; on = marks[i] }
        out += htmlEscape(text[i])
    }
    return out + (on ? "</span>" : "")
}

// ── export ───────────────────────────────────────────────────────────────

function csvCell(v: string): string { return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }

// One row per transaction: ISO dates, amounts as plain numbers (signed: money
// out is negative), category names spelled out.
function toCsv(rows: any[], catName: (id: string | null) => string, channelName: (id: string | null) => string): string {
    const head = ["id", "date", "kind", "description", "contact", "category", "channel", "amount"]
    const lines = [head.join(",")]
    for (const r of rows) {
        const cat = r.split != null ? "Split: " + r.split.categoryIds.map(catName).join(" / ") : catName(r.categoryId)
        const amt = r.inFilter ?? r.signed
        lines.push([r.id, r.date, r.kind, r.description ?? "", r.contactName ?? "", cat, channelName(r.channel),
            (amt < 0 ? "-" : "") + Math.floor(Math.abs(amt) / 100) + "." + String(Math.abs(amt) % 100).padStart(2, "0")].map((v) => csvCell("" + v)).join(","))
    }
    return lines.join("\n") + "\n"
}

// A round top for a chart's scale: 1, 2, 2.5 or 5 times a power of ten.
function niceTop(v: number): number {
    if (v <= 0) return 1
    const p = Math.pow(10, Math.floor(Math.log10(v)))
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p
    return 10 * p
}

// A round step for a chart's grid: 1, 2, 2.5 or 5 times a power of ten, so
// the axis reads $0, $2.5k, $5k… rather than $0, $2.4k, $4.8k.
function niceStep(span: number, lines: number): number {
    const raw = Math.max(1, span) / Math.max(1, lines)
    const p = Math.pow(10, Math.floor(Math.log10(raw)))
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p
    return 10 * p
}

// What a transaction is called when it has no description of its own:
// "Market sale", "Refund", "Expense — Adobe".
function txnTitle(kind: string, description: string, contact: string | null, channel: string): string {
    if ((description ?? "").trim() != "") return description
    if (kind == "sale") return (channel != "" ? channel + " sale" : "Sale")
    if (kind == "refund") return "Refund"
    return contact != null && contact != "" ? "Payment to " + contact : "Expense"
}
