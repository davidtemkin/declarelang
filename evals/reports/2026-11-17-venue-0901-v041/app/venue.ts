// The Venue — plain TypeScript the program calls into: money and date
// formatting, the card and address rules the checkout form applies, the hall's
// geometry, and the barcode a ticket carries. Nothing here is reactive; every
// function is a pure answer to the values it is passed.

export const API = "http://127.0.0.1:8350"

// ── Formatting ────────────────────────────────────────────────────────────

/** Cents → "$1,240.00". */
export function money(cents: number): string {
    const neg = cents < 0
    const whole = Math.floor(Math.abs(cents) / 100)
    const frac = String(Math.abs(cents) % 100).padStart(2, "0")
    const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    return (neg ? "−$" : "$") + grouped + "." + frac
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"]

/** The hall's local time, as printed: "2026-11-13T19:30" is read as written,
 *  never shifted through the viewer's time zone. */
function parts(iso: string): { y: number; mo: number; d: number; h: number; mi: number; dow: number } {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso ?? "")
    if (m === null) return { y: 0, mo: 0, d: 0, h: 0, mi: 0, dow: 0 }
    const y = +m[1], mo = +m[2] - 1, d = +m[3]
    return { y, mo, d, h: +m[4], mi: +m[5], dow: new Date(Date.UTC(y, mo, d)).getUTCDay() }
}

/** "Fri 13 Nov" */
export function dateLabel(iso: string): string {
    const p = parts(iso)
    return `${DAYS[p.dow]} ${p.d} ${MONTHS[p.mo]}`
}

/** "Friday 13 November" — for a screen reader, which reads abbreviations badly. */
export function longDate(iso: string): string {
    const p = parts(iso)
    return `${LONG_DAYS[p.dow]} ${p.d} ${LONG_MONTHS[p.mo]}`
}

export function weekday(iso: string): string { return DAYS[parts(iso).dow] }
export function dayOfMonth(iso: string): string { return String(parts(iso).d) }
export function monthShort(iso: string): string { return MONTHS[parts(iso).mo] }

/** "7:30pm", "2:00pm" */
export function timeLabel(iso: string): string {
    const p = parts(iso)
    const h12 = p.h % 12 === 0 ? 12 : p.h % 12
    return `${h12}:${String(p.mi).padStart(2, "0")}${p.h < 12 ? "am" : "pm"}`
}

export function plural(n: number, one: string, many: string): string { return n === 1 ? one : many }

/** The running summary, exactly: "3 seats · $240.00". */
export function seatSummary(n: number, cents: number): string {
    return `${n} ${plural(n, "seat", "seats")} · ${money(cents)}`
}

/** How full a performance is, in words a glance can take. */
export function availability(left: number, total: number): string {
    if (left <= 0) return "Sold out"
    if (left / total <= 0.15) return `Nearly sold out · ${left} left`
    if (left / total <= 0.4) return `Selling fast · ${left} left`
    return `${left} seats left`
}

export function scarce(left: number, total: number): boolean { return left > 0 && left / total <= 0.15 }

// ── Cards ─────────────────────────────────────────────────────────────────

export function digits(s: string): string { return (s ?? "").replace(/\D/g, "") }

/** The card's kind, from its first digits (IIN ranges). "" while unknown. */
export function brandOf(num: string): string {
    const d = digits(num)
    if (/^4/.test(d)) return "visa"
    if (/^3[47]/.test(d)) return "amex"
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return "mastercard"
    if (/^(6011|65|64[4-9]|622)/.test(d)) return "discover"
    return ""
}

export function brandName(brand: string): string {
    switch (brand) {
        case "visa": return "Visa"
        case "mastercard": return "Mastercard"
        case "amex": return "American Express"
        case "discover": return "Discover"
        default: return ""
    }
}

function maxLen(brand: string): number { return brand === "amex" ? 15 : brand === "visa" || brand === "discover" ? 19 : 16 }

/** Group the number the way it is printed: 4-6-5 for Amex, fours otherwise. */
export function formatCardNumber(raw: string): string {
    const brand = brandOf(raw)
    const d = digits(raw).slice(0, maxLen(brand === "" ? "visa" : brand))
    if (brand === "amex") return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter((g) => g !== "").join(" ")
    return (d.match(/.{1,4}/g) ?? []).join(" ")
}

function luhn(d: string): boolean {
    let sum = 0
    for (let i = 0; i < d.length; i++) {
        let n = +d[d.length - 1 - i]
        if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9 }
        sum += n
    }
    return sum % 10 === 0
}

function lengthOk(d: string, brand: string): boolean {
    switch (brand) {
        case "amex": return d.length === 15
        case "visa": return d.length === 13 || d.length === 16 || d.length === 19
        case "mastercard": return d.length === 16
        case "discover": return d.length >= 16 && d.length <= 19
        default: return d.length >= 12 && d.length <= 19
    }
}

export function cvcLength(brand: string): number { return brand === "amex" ? 4 : 3 }

export function cardNumberError(raw: string): string {
    const d = digits(raw)
    if (d === "") return "Enter the card number."
    const brand = brandOf(d)
    if (!lengthOk(d, brand)) {
        if (brand !== "" && d.length < maxLen(brand)) return "This card number is too short."
        return "That isn't a card number — check the digits."
    }
    if (!luhn(d)) return "That isn't a card number — check the digits."
    return ""
}

/** "1228" → "12 / 28" while typing; a leading 2–9 is a one-digit month. */
export function formatExpiry(raw: string, previous: string): string {
    // an autofilled or pasted "4/2028", "04/28", "04-2028" arrives whole
    const whole = /^\s*(\d{1,2})\s*[\/\-.]\s*(\d{2}|\d{4})\s*$/.exec(raw ?? "")
    if (whole !== null && raw.length - previous.length > 1) {
        return whole[1].padStart(2, "0") + " / " + whole[2].slice(-2)
    }
    let d = digits(raw)
    // deleting the separator deletes the month digit before it
    if (raw.length < previous.length && previous.endsWith(" / ") && !raw.endsWith(" / ")) d = d.slice(0, -1)
    if (d.length === 1 && +d > 1) d = "0" + d
    d = d.slice(0, 4)
    if (d.length <= 1) return d
    if (d.length === 2) return raw.length > previous.length ? d + " / " : d
    return d.slice(0, 2) + " / " + d.slice(2)
}

export function expiryParts(s: string): { month: number; year: number } {
    const d = digits(s)
    return { month: +d.slice(0, 2), year: 2000 + +d.slice(2, 4) }
}

export function expiryError(s: string, nowYear: number, nowMonth: number): string {
    const d = digits(s)
    if (d === "") return "Enter the expiry date."
    if (d.length < 4) return "Enter the expiry as MM / YY."
    const { month, year } = expiryParts(s)
    if (month < 1 || month > 12) return "There is no month " + d.slice(0, 2) + "."
    if (year < nowYear || (year === nowYear && month < nowMonth)) return "This card has expired."
    return ""
}

export function cvcError(s: string, brand: string): string {
    const d = digits(s)
    const n = cvcLength(brand)
    if (d === "") return "Enter the security code."
    if (d.length !== n || d !== s.trim()) return `The security code is ${n} digits${brand === "amex" ? " on the front of the card" : " on the back of the card"}.`
    return ""
}

export function cardExpired(expMonth: number, expYear: number, nowYear: number, nowMonth: number): boolean {
    return expYear < nowYear || (expYear === nowYear && expMonth < nowMonth)
}

export function expiryLabel(expMonth: number, expYear: number): string {
    return String(expMonth).padStart(2, "0") + "/" + String(expYear % 100).padStart(2, "0")
}

// ── Addresses ─────────────────────────────────────────────────────────────

export const COUNTRIES = [
    { id: "US", label: "United States" },
    { id: "CA", label: "Canada" },
    { id: "GB", label: "United Kingdom" },
]

export function defaultCountry(): string {
    const lang = typeof navigator !== "undefined" ? navigator.language ?? "" : ""
    if (/-GB$/i.test(lang)) return "GB"
    if (/-CA$/i.test(lang)) return "CA"
    return "US"
}

export function postalExample(country: string): string {
    return country === "US" ? "e.g. 94103" : country === "GB" ? "e.g. SW1A 2AA" : "e.g. M5V 3L9"
}

export function postalLabel(country: string): string {
    return country === "US" ? "ZIP code" : country === "GB" ? "Postcode" : "Postal code"
}

const POSTAL: Record<string, RegExp> = {
    US: /^\d{5}(-\d{4})?$/,
    CA: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
    GB: /^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|[A-HK-Y][0-9]{1,2}|[0-9][A-HJKPS-UW]|[A-HK-Y][0-9][ABEHMNPRV-Y]) ?[0-9][ABD-HJLNP-UW-Z]{2})$/i,
}

export function postalOk(country: string, s: string): boolean {
    const re = POSTAL[country]
    return re !== undefined && re.test((s ?? "").trim())
}

/** Which single other country a postcode unambiguously belongs to ("" when none) —
 *  so an autofilled address can bring its country along. */
export function postalCountry(s: string): string {
    const hits = Object.keys(POSTAL).filter((c) => postalOk(c, s))
    return hits.length === 1 ? hits[0] : ""
}

export function postalError(country: string, s: string): string {
    const v = (s ?? "").trim()
    if (v === "") return "Enter the postal code."
    if (postalOk(country, v)) return ""
    if (country === "US") return "A US postal (ZIP) code is 5 digits, like 94103."
    if (country === "CA") return "A Canadian postal code looks like M5V 3L9."
    return "A UK postcode looks like SW1A 2AA."
}

/** The service's form of a postcode: upper case, single inner space. */
export function normalizePostal(country: string, s: string): string {
    const v = (s ?? "").trim().toUpperCase().replace(/\s+/g, "")
    if (country === "US") return v
    return v.length > 3 ? v.slice(0, -3) + " " + v.slice(-3) : v
}

export function emailError(s: string): string {
    const v = (s ?? "").trim()
    if (v === "") return "Enter your email address."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "That doesn't look like an email address."
    return ""
}

export function requiredError(s: string, what: string): string {
    return (s ?? "").trim() === "" ? `Enter ${what}.` : ""
}

// ── The hall ──────────────────────────────────────────────────────────────

/** Section tones: the dearer the section, the deeper the tone — so where the
 *  good seats are reads without a word. (Hex, as the program's colors.) */
const TONES = [0x8A6A3B, 0xA88A5A, 0xC1A77C, 0xD6C3A0]

interface HallSeat {
    id: string; label: string; section: string; row: string; num: number
    sec: number; x: number; y: number; price: number; fee: number; sold: boolean
}

interface HallSection {
    name: string; sec: number; price: number; fee: number; tone: number
    y: number; r0: number; r1: number; spread: number; free: number; total: number
}

interface HallModel {
    seats: HallSeat[]
    sections: HallSection[]
    width: number; height: number; cx: number; fy: number
}

/** Lay the house out the way the house is: rows as arcs around a focus behind
 *  the stage, sections stacked front to back with a gap between levels. Units
 *  are seat pitches; the program multiplies by its seat size. Seats are listed
 *  left to right as seen FROM THE STAGE, and the plan is drawn from the
 *  audience's side (stage at the top), so seat 1 sits at the right. */
export function buildHall(data: any): HallModel {
    const sections = (data?.sections ?? []) as any[]
    const ROW = 1.2, GAP = 2.6, R0 = 30
    const seats: HallSeat[] = []
    const out: HallSection[] = []
    let rad = R0
    let minX = 0, maxX = 0, minY = Infinity, maxY = 0
    sections.forEach((s, si) => {
        if (si > 0) rad += GAP
        const r0 = rad
        let free = 0, total = 0, spread = 0
        ;(s.rows ?? []).forEach((r: any, ri: number) => {
            const n = r.seats.length
            const step = 1.05 / rad
            spread = Math.max(spread, ((n - 1) / 2) * step)
            r.seats.forEach((seat: any, i: number) => {
                // index 0 = stage-left = audience right = plan right
                const theta = ((n - 1) / 2 - i) * step
                const x = rad * Math.sin(theta)
                const y = rad * Math.cos(theta)
                minX = Math.min(minX, x); maxX = Math.max(maxX, x)
                minY = Math.min(minY, y); maxY = Math.max(maxY, y)
                const sold = seat.status !== "available"
                total++; if (!sold) free++
                seats.push({
                    id: seat.id, section: s.name, row: r.name, num: seat.number,
                    label: `${s.name}, row ${r.name}, seat ${seat.number}`,
                    sec: si, x, y, price: s.priceCents, fee: s.feeCents, sold,
                })
            })
            if (ri < s.rows.length - 1) rad += ROW
        })
        out.push({ name: s.name, sec: si, price: s.priceCents, fee: s.feeCents, tone: TONES[si] ?? TONES[3],
            y: r0 - 1.45, r0, r1: rad, spread, free, total })
    })
    if (seats.length === 0) return { seats, sections: out, width: 1, height: 1, cx: 0, fy: 0 }
    // normalize: x from the left margin, y from the top of the stage
    const pad = 1.2, stageDepth = 4.4
    const yTop = minY - stageDepth
    const ox = -minX + pad
    for (const s of seats) { s.x += ox; s.y -= yTop }
    for (const s of out) s.y -= yTop
    return { seats, sections: out, width: maxX - minX + 2 * pad, height: maxY - yTop + pad, cx: ox, fy: -yTop }
}

export function toneOf(sec: number): number { return TONES[sec] ?? TONES[3] }

/** Keyboard travel through the plan: left/right along the row (as seen on
 *  screen), up/down to the nearest seat in the neighbouring row. */
export function seatToward(model: HallModel | null, id: string, dir: string): string {
    if (model === null || model.seats.length === 0) return id
    const seats = model.seats
    const cur = seats.find((s) => s.id === id) ?? seats[0]
    if (cur.id !== id) return cur.id
    const sameRow = seats.filter((s) => s.sec === cur.sec && s.row === cur.row).sort((a, b) => a.x - b.x)
    const i = sameRow.findIndex((s) => s.id === cur.id)
    if (dir === "left") return sameRow[Math.max(0, i - 1)].id
    if (dir === "right") return sameRow[Math.min(sameRow.length - 1, i + 1)].id
    if (dir === "home") return sameRow[0].id
    if (dir === "end") return sameRow[sameRow.length - 1].id
    // the neighbouring row: the nearest row line in the given direction
    const rows = new Map<string, HallSeat[]>()
    for (const s of seats) {
        const k = s.sec + "/" + s.row
        if (!rows.has(k)) rows.set(k, [])
        rows.get(k)!.push(s)
    }
    const order = [...rows.keys()]
    const at = order.indexOf(cur.sec + "/" + cur.row)
    const next = order[dir === "up" ? at - 1 : at + 1]
    if (next === undefined) return cur.id
    let best = rows.get(next)![0]
    for (const s of rows.get(next)!) if (Math.abs(s.x - cur.x) < Math.abs(best.x - cur.x)) best = s
    return best.id
}

// ── Barcodes (Code 128, set B) ────────────────────────────────────────────

const C128 = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232",
]
const C128_STOP = "2331112"

/** The module widths of a Code 128-B symbol, bars and spaces alternating,
 *  starting with a bar. A scanner at the door reads `text` back. */
export function code128(text: string): number[] {
    const codes = [104]
    for (const ch of text ?? "") {
        const v = ch.charCodeAt(0) - 32
        codes.push(v >= 0 && v < 95 ? v : 0)
    }
    let sum = 104
    for (let i = 1; i < codes.length; i++) sum += codes[i] * i
    codes.push(sum % 103)
    const widths: number[] = []
    for (const c of codes) for (const w of C128[c]) widths.push(+w)
    for (const w of C128_STOP) widths.push(+w)
    return widths
}
