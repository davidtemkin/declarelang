// Ledger's pure helpers: money, calendar dates, date ranges, filter query
// strings and CSV. Functions of their arguments only — the reactive model
// lives in the .declare files; these are what its constraints call.

// ── Money ──────────────────────────────────────────────────────────────────
// Amounts are integer cents everywhere. Formatting never rounds a total: it
// only splits the integer into dollars and cents.

const MINUS = "−"

function groupDigits(n: number): string {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

// "$1,204.50"; negative amounts take a true minus sign: "−$45.00"
function money(cents: number): string {
    const c = Math.round(cents)
    const a = Math.abs(c)
    const s = "$" + groupDigits(Math.floor(a / 100)) + "." + String(a % 100).padStart(2, "0")
    return c < 0 ? MINUS + s : s
}

// money with an explicit sign either way: "+$12.00", "−$4.00"
function moneySigned(cents: number): string {
    return cents > 0 ? "+" + money(cents) : money(cents)
}

// whole dollars for labels where cents would be noise: "$40", "$1,200"
function moneyWhole(cents: number): string {
    const a = Math.abs(cents)
    const s = "$" + groupDigits(Math.round(a / 100))
    return cents < 0 ? MINUS + s : s
}

// compact, for chart axes only: "$1.2k", "$15k", "$1.5M"
function moneyCompact(cents: number): string {
    const d = Math.abs(cents) / 100
    let s: string
    if (d >= 1e6) s = "$" + trimZero((d / 1e6).toFixed(1)) + "M"
    else if (d >= 1e3) s = "$" + trimZero((d / 1e3).toFixed(d >= 1e4 ? 0 : 1)) + "k"
    else s = "$" + Math.round(d)
    return cents < 0 ? MINUS + s : s
}

function trimZero(s: string): string { return s.replace(/\.0$/, "") }

// "12.40", "$1,204.5", "42" → cents; NaN when it isn't an amount
function parseMoney(text: string): number {
    const t = text.trim().replace(/[$,\s]/g, "")
    if (!/^\d+(\.\d{0,2})?$/.test(t) && !/^\.\d{1,2}$/.test(t)) return NaN
    const [whole, frac] = t.split(".")
    return Number(whole || "0") * 100 + Number((frac ?? "").padEnd(2, "0"))
}

// cents as a plain number for an input or CSV: 1204.5 → "1204.50"
function plainAmount(cents: number): string {
    const a = Math.abs(cents)
    return (cents < 0 ? "-" : "") + Math.floor(a / 100) + "." + String(a % 100).padStart(2, "0")
}

function percent(p: number | null): string {
    return p == null ? "—" : p.toFixed(1) + "%"
}

// a change between two figures as a signed percentage: "+12%", "−3.5%"
function changePct(now: number, before: number): number | null {
    if (before == 0) return null
    return ((now - before) / Math.abs(before)) * 100
}

function signedPct(p: number | null): string {
    if (p == null) return "—"
    const r = Math.abs(p) >= 10 ? Math.round(Math.abs(p)) : Math.round(Math.abs(p) * 10) / 10
    return (p > 0 ? "+" : p < 0 ? MINUS : "") + r + "%"
}

function count(n: number): string { return groupDigits(n) }

// ── Calendar dates ─────────────────────────────────────────────────────────
// A date is "YYYY-MM-DD". Arithmetic goes through UTC, so a date never
// shifts with the viewer's time zone.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"]

function pad2(n: number): string { return n < 10 ? "0" + n : "" + n }
function ymd(y: number, m: number, d: number): string {
    const t = new Date(Date.UTC(y, m - 1, d))
    return t.getUTCFullYear() + "-" + pad2(t.getUTCMonth() + 1) + "-" + pad2(t.getUTCDate())
}
function dparts(iso: string): number[] { return iso.split("-").map(Number) }
function addDays(iso: string, n: number): string { const p = dparts(iso); return ymd(p[0], p[1], p[2] + n) }
function dayDiff(a: string, b: string): number {
    const p = dparts(a), q = dparts(b)
    return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000)
}
function monthStart(iso: string): string { const p = dparts(iso); return ymd(p[0], p[1], 1) }
function monthEnd(iso: string): string { const p = dparts(iso); return ymd(p[0], p[1] + 1, 0) }
function addMonths(iso: string, n: number): string {
    const p = dparts(iso)
    const last = dparts(ymd(p[0], p[1] + n + 1, 0))[2]
    return ymd(p[0], p[1] + n, Math.min(p[2], last))
}
function isMonthStart(iso: string): boolean { return dparts(iso)[2] == 1 }
function isMonthEnd(iso: string): boolean { return monthEnd(iso) == iso }

// "Nov 3, 2026"; "Nov 3" when the year is the given one
function fmtDate(iso: string, thisYear: number = 0): string {
    if (!iso) return ""
    const p = dparts(iso)
    return MONTHS[p[1] - 1] + " " + p[2] + (p[0] == thisYear ? "" : ", " + p[0])
}
function fmtDay(iso: string, today: string): string {
    const n = dayDiff(iso, today)
    if (n == 0) return "Today"
    if (n == 1) return "Yesterday"
    const p = dparts(iso)
    const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()]
    return wd + ", " + fmtDate(iso, dparts(today)[0])
}
function monthName(iso: string): string { return MONTHS_LONG[dparts(iso)[1] - 1] }
function monthShort(iso: string): string { return MONTHS[dparts(iso)[1] - 1] }

// What a person types into a date field: "today", "yesterday", "3 nov",
// "nov 3", "11/3", "2026-11-03", "3". Returns "" when it isn't a date.
function parseDate(text: string, today: string): string {
    const t = text.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ")
    if (t == "") return ""
    if (t == "today" || t == "tod") return today
    if (t == "yesterday" || t == "yday" || t == "yest") return addDays(today, -1)
    if (t == "tomorrow") return addDays(today, 1)
    const ty = dparts(today)[0]
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
    if (m) return valid(+m[1], +m[2], +m[3])
    const mon = (s: string) => MONTHS.findIndex((x) => s.startsWith(x.toLowerCase())) + 1
    m = /^(\d{1,2}) ([a-z]+)\.?(?: (\d{4}))?$/.exec(t)
    if (m && mon(m[2]) > 0) return valid(m[3] ? +m[3] : ty, mon(m[2]), +m[1])
    m = /^([a-z]+)\.? (\d{1,2})(?: (\d{4}))?$/.exec(t)
    if (m && mon(m[1]) > 0) return valid(m[3] ? +m[3] : ty, mon(m[1]), +m[2])
    m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t)
    if (m) return valid(m[3] ? (m[3].length == 2 ? 2000 + +m[3] : +m[3]) : ty, +m[1], +m[2])
    m = /^(\d{1,2})$/.exec(t)
    if (m) return valid(ty, dparts(today)[1], +m[1])
    return ""
}
function valid(y: number, m: number, d: number): string {
    if (m < 1 || m > 12 || d < 1) return ""
    const iso = ymd(y, m, d)
    return dparts(iso)[2] == d ? iso : ""
}

// ── Date ranges ────────────────────────────────────────────────────────────

interface Range { from: string; to: string }

const PRESETS = [
    { id: "this-month", label: "This month" },
    { id: "last-month", label: "Last month" },
    { id: "last-30", label: "Last 30 days" },
    { id: "this-quarter", label: "This quarter" },
    { id: "last-quarter", label: "Last quarter" },
    { id: "this-year", label: "This year" },
    { id: "last-year", label: "Last year" },
    { id: "last-12", label: "Last 12 months" },
    { id: "all", label: "All time" },
]

function quarterStart(iso: string): string { const p = dparts(iso); return ymd(p[0], Math.floor((p[1] - 1) / 3) * 3 + 1, 1) }

function presetRange(id: string, today: string, first: string): Range {
    const y = dparts(today)[0]
    switch (id) {
        case "this-month": return { from: monthStart(today), to: monthEnd(today) }
        case "last-month": { const s = addMonths(monthStart(today), -1); return { from: s, to: monthEnd(s) } }
        case "last-30": return { from: addDays(today, -29), to: today }
        case "this-quarter": { const s = quarterStart(today); return { from: s, to: addDays(addMonths(s, 3), -1) } }
        case "last-quarter": { const s = addMonths(quarterStart(today), -3); return { from: s, to: addDays(addMonths(s, 3), -1) } }
        case "this-year": return { from: ymd(y, 1, 1), to: ymd(y, 12, 31) }
        case "last-year": return { from: ymd(y - 1, 1, 1), to: ymd(y - 1, 12, 31) }
        case "last-12": return { from: addMonths(monthStart(today), -11), to: monthEnd(today) }
        default: return { from: first, to: today }
    }
}

// The range before or after this one, of the same length: whole months step
// by whole months ("Oct" → "Sep"), anything else by its count of days.
function stepRange(from: string, to: string, dir: number): Range {
    if (isMonthStart(from) && isMonthEnd(to)) {
        const months = (dparts(to)[0] - dparts(from)[0]) * 12 + dparts(to)[1] - dparts(from)[1] + 1
        const f = addMonths(from, dir * months)
        return { from: f, to: monthEnd(addMonths(f, months - 1)) }
    }
    const len = dayDiff(from, to) + 1
    return { from: addDays(from, dir * len), to: addDays(to, dir * len) }
}

// The comparison period: the previous one of the same length, or the same
// dates a year before. Null for none.
function compareRange(from: string, to: string, mode: string): Range | null {
    if (mode == "none") return null
    if (mode == "year") return { from: addMonths(from, -12), to: isMonthEnd(to) ? monthEnd(addMonths(to, -12)) : addMonths(to, -12) }
    return stepRange(from, to, -1)
}

// "November 2026", "Q3 2026", "2025", "Oct 1 – Nov 12, 2026"
function rangeLabel(from: string, to: string): string {
    if (!from || !to) return ""
    const f = dparts(from), t = dparts(to)
    if (isMonthStart(from) && isMonthEnd(to)) {
        if (f[0] == t[0] && f[1] == t[1]) return MONTHS_LONG[f[1] - 1] + " " + f[0]
        if (f[0] == t[0] && f[1] == 1 && t[1] == 12) return "" + f[0]
        if (f[0] == t[0] && (f[1] - 1) % 3 == 0 && t[1] == f[1] + 2) return "Q" + ((f[1] + 2) / 3) + " " + f[0]
        if (f[0] == t[0]) return MONTHS[f[1] - 1] + " – " + MONTHS[t[1] - 1] + " " + f[0]
        return MONTHS[f[1] - 1] + " " + f[0] + " – " + MONTHS[t[1] - 1] + " " + t[0]
    }
    if (from == to) return fmtDate(from)
    if (f[0] == t[0]) return MONTHS[f[1] - 1] + " " + f[2] + " – " + MONTHS[t[1] - 1] + " " + t[2] + ", " + t[0]
    return fmtDate(from) + " – " + fmtDate(to)
}

// Short name of a comparison period, for "▲ 12% vs Oct"
function shortRangeLabel(from: string, to: string): string {
    const f = dparts(from), t = dparts(to)
    if (isMonthStart(from) && isMonthEnd(to) && f[0] == t[0] && f[1] == t[1]) return MONTHS[f[1] - 1]
    const l = rangeLabel(from, to)
    return l.length > 18 ? "previous period" : l
}

// A period's label on a chart axis and in its sentence
function periodLabel(period: string, by: string, long: boolean): string {
    if (by == "month") { const p = period.split("-").map(Number); return (long ? MONTHS_LONG : MONTHS)[p[1] - 1] + (long ? " " + p[0] : "") }
    if (by == "quarter") return period.replace(/^(\d{4})-(Q\d)$/, long ? "$2 $1" : "$2 '$1").replace("'20", "'")
    if (by == "week") return (long ? "Week of " : "") + fmtDate(period, long ? 0 : 9999).replace(/, \d{4}$/, "")
    return long ? fmtDate(period) : fmtDate(period, 9999).replace(/, \d{4}$/, "")
}

// The granularity a range reads best at
function naturalBy(from: string, to: string): string {
    const days = dayDiff(from, to) + 1
    if (days <= 45) return "day"
    if (days <= 120) return "week"
    if (days <= 800) return "month"
    return "quarter"
}

// A friendly step for an axis: 1, 2, 2.5 or 5 times a power of ten
function niceStep(range: number, ticks: number): number {
    if (!(range > 0)) return 100
    const raw = range / ticks
    const mag = Math.pow(10, Math.floor(Math.log10(raw)))
    const f = raw / mag
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag
}

// ── The filter, as a query string ──────────────────────────────────────────

interface FilterSpec {
    from: string; to: string; q: string; min: number; max: number
    kinds: string[]; cats: string[]; contacts: string[]; products: string[]; ids: string[]
}

function filterQuery(f: FilterSpec): string {
    const p: string[] = []
    const add = (k: string, v: string) => { if (v !== "") p.push(k + "=" + encodeURIComponent(v)) }
    add("from", f.from)
    add("to", f.to)
    add("q", f.q.trim())
    if (f.min >= 0) add("min", "" + f.min)
    if (f.max >= 0) add("max", "" + f.max)
    add("kind", f.kinds.join(","))
    add("category", f.cats.join(","))
    add("contact", f.contacts.join(","))
    add("product", f.products.join(","))
    add("ids", f.ids.join(","))
    return p.join("&")
}

// ── The amount slider's scale ──────────────────────────────────────────────
// Amounts are skewed, so the slider moves through a list of friendly stops
// rather than a linear range. Position i is AMOUNT_STOPS[i] cents; the last
// position means "no top".

const AMOUNT_STOPS = [0, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 10000, 12500, 15000, 20000,
    25000, 30000, 40000, 50000, 75000, 100000, 150000, 200000, 300000, 500000]

function stopIndex(cents: number, isMax: boolean): number {
    if (cents < 0) return isMax ? AMOUNT_STOPS.length - 1 : 0
    let best = 0
    for (let i = 0; i < AMOUNT_STOPS.length; i++) if (Math.abs(AMOUNT_STOPS[i] - cents) < Math.abs(AMOUNT_STOPS[best] - cents)) best = i
    return best
}

// ── Highlighting ───────────────────────────────────────────────────────────
// Splits text into runs that do and don't match any query word, for the
// search highlight: [{ t, hit }].

function hitRuns(text: string, q: string): { t: string; hit: boolean }[] {
    const words = q.trim().toLowerCase().split(/\s+/).filter((w) => w != "" && !/^\$?[\d,]+(\.\d+)?$/.test(w))
    if (words.length == 0 || text == "") return [{ t: text, hit: false }]
    const low = fold(text)
    const mark = new Array(text.length).fill(false)
    for (const w of words) {
        const fw = fold(w)
        let i = low.indexOf(fw)
        while (i >= 0) { for (let k = i; k < i + fw.length; k++) mark[k] = true; i = low.indexOf(fw, i + 1) }
    }
    const out: { t: string; hit: boolean }[] = []
    for (let i = 0; i < text.length; i++) {
        const last = out[out.length - 1]
        if (last && last.hit == mark[i]) last.t += text[i]
        else out.push({ t: text[i], hit: mark[i] })
    }
    return out
}
function fold(s: string): string { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() }

// escapes text for an HTMLText run
function esc(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

function highlightHTML(text: string, q: string): string {
    return hitRuns(text, q).map((r) => r.hit ? "<span class='Hit'>" + esc(r.t) + "</span>" : esc(r.t)).join("")
}

// ── CSV ────────────────────────────────────────────────────────────────────

function csvCell(v: string): string { return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }

function toCSV(rows: { id: string; date: string; kind: string; description: string; contactName: string | null;
    category: string; channel: string; inFilter: number }[]): string {
    const head = ["id", "date", "kind", "description", "contact", "category", "channel", "amount"]
    const lines = rows.map((r) => [r.id, r.date, r.kind, r.description, r.contactName ?? "", r.category, r.channel,
        plainAmount(r.inFilter)].map((v) => csvCell("" + v)).join(","))
    return [head.join(","), ...lines].join("\n") + "\n"
}

function kindWord(kind: string): string { return kind == "sale" ? "Sale" : kind == "refund" ? "Refund" : kind == "expense" ? "Expense" : "" }
