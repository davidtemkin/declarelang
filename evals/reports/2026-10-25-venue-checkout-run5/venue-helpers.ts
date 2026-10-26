// Pure helpers for the Venue: formatting, card rules, and the Code 128 barcode.
// Functions of their arguments only — the program's state lives in the tree.

// ── Money, dates, times ─────────────────────────────────────────────────────

export function money(cents: number): string {
    const neg = cents < 0
    const c = Math.abs(Math.round(cents))
    const dollars = Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    return (neg ? "−$" : "$") + dollars + "." + String(c % 100).padStart(2, "0")
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const LONG_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function parts(stamp: string): number[] {
    // "2026-11-13T19:30" — the hall's local time, as printed on a ticket
    const [d, t] = stamp.split("T")
    const [y, m, day] = d.split("-").map(Number)
    const [h, min] = (t ?? "0:0").split(":").map(Number)
    return [y, m, day, h, min]
}

/** "Fri 13 Nov" */
export function dayLabel(stamp: string): string {
    if (!stamp) return ""
    const [y, m, d] = parts(stamp)
    return WEEKDAYS[new Date(y, m - 1, d).getDay()] + " " + d + " " + MONTHS[m - 1]
}

/** "Friday" */
export function weekdayLong(stamp: string): string {
    if (!stamp) return ""
    const [y, m, d] = parts(stamp)
    return LONG_WEEKDAYS[new Date(y, m - 1, d).getDay()]
}

/** "Nov" */
export function monthLabel(stamp: string): string {
    return stamp ? MONTHS[parts(stamp)[1] - 1] : ""
}

/** "13" */
export function dayNumber(stamp: string): string {
    return stamp ? String(parts(stamp)[2]) : ""
}

/** "7:30pm" */
export function timeLabel(stamp: string): string {
    if (!stamp) return ""
    const [, , , h, min] = parts(stamp)
    const h12 = h % 12 == 0 ? 12 : h % 12
    return h12 + ":" + String(min).padStart(2, "0") + (h < 12 ? "am" : "pm")
}

export function isMatinee(stamp: string): boolean {
    return stamp ? parts(stamp)[3] < 17 : false
}

// ── Seats ───────────────────────────────────────────────────────────────────

/** "ORCH-C-14" → ["ORCH", "C", "14"] */
export function seatParts(id: string): string[] {
    const i = id.lastIndexOf("-")
    const j = id.lastIndexOf("-", i - 1)
    return [id.slice(0, j), id.slice(j + 1, i), id.slice(i + 1)]
}

export function seatCount(n: number): string {
    return n + (n == 1 ? " seat" : " seats")
}

// ── Cards ───────────────────────────────────────────────────────────────────

export type Brand = "visa" | "mastercard" | "amex" | "discover" | ""

export function digitsOf(s: string): string {
    return s.replace(/\D/g, "")
}

/** The kind of card, from its first digits. */
export function brandOf(number: string): Brand {
    const n = digitsOf(number)
    if (/^4/.test(n)) return "visa"
    if (/^3[47]/.test(n)) return "amex"
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return "mastercard"
    if (/^(6011|65|64[4-9])/.test(n)) return "discover"
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

export function cardLength(brand: string): number[] {
    if (brand == "amex") return [15]
    if (brand == "visa") return [13, 16, 19]
    if (brand == "") return [12, 13, 14, 15, 16, 17, 18, 19]
    return [16]
}

export function cvcLength(brand: string): number {
    return brand == "amex" ? 4 : 3
}

/** The number grouped as it is printed on the card: 4-6-5 for Amex, fours otherwise. */
export function groupCard(number: string): string {
    const brand = brandOf(number)
    const n = digitsOf(number).slice(0, brand == "amex" ? 15 : 19)
    const groups = brand == "amex" ? [4, 6, 5] : [4, 4, 4, 4, 3]
    const out: string[] = []
    let i = 0
    for (const g of groups) {
        if (i >= n.length) break
        out.push(n.slice(i, i + g))
        i += g
    }
    return out.join(" ")
}

/** Where the caret belongs in the grouped text, given how many digits precede it. */
export function caretAfterDigits(grouped: string, digits: number): number {
    if (digits <= 0) return 0
    let seen = 0
    for (let i = 0; i < grouped.length; i++) {
        if (/\d/.test(grouped[i])) seen++
        if (seen == digits) return i + 1
    }
    return grouped.length
}

export function digitsBefore(text: string, caret: number): number {
    return digitsOf(text.slice(0, caret)).length
}

export function luhn(number: string): boolean {
    const n = digitsOf(number)
    let sum = 0
    for (let i = 0; i < n.length; i++) {
        let d = Number(n[n.length - 1 - i])
        if (i % 2 == 1) { d *= 2; if (d > 9) d -= 9 }
        sum += d
    }
    return n.length > 0 && sum % 10 == 0
}

export function cardNumberProblem(number: string): string {
    const n = digitsOf(number)
    if (n == "") return "Enter the card number."
    const brand = brandOf(n)
    if (!cardLength(brand).includes(n.length)) {
        return n.length < Math.min(...cardLength(brand))
            ? "This card number is too short."
            : "This card number is too long."
    }
    if (!luhn(n)) return "This card number isn't valid. Check it against the card."
    return ""
}

/** "0428", "04/28", "4/2028" → [month, fullYear], or null. */
export function parseExpiry(text: string): number[] | null {
    const t = text.trim()
    const m = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(t) ?? /^(\d{2})(\d{2})$/.exec(t)
    if (!m) return null
    const month = Number(m[1])
    let year = Number(m[2])
    if (year < 100) year += 2000
    return [month, year]
}

/** Typing "04" offers "04 / "; a lone first digit above 1 is a month: "5" → "05 / ". */
export function formatExpiry(text: string, previous: string): string {
    const deleting = text.length < previous.length
    // autofill hands over "04/2028" or "4/28": keep the month, and the year's last two digits
    const filled = /^\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})\s*$/.exec(text)
    if (filled && !deleting && text.length - previous.length > 1) {
        return filled[1].padStart(2, "0") + " / " + filled[2].slice(-2)
    }
    let d = digitsOf(text).slice(0, 4)
    if (d.length == 1 && Number(d) > 1) d = "0" + d
    if (d.length < 2) return d
    if (d.length == 2) return deleting ? d : d + " / "
    return d.slice(0, 2) + " / " + d.slice(2)
}

export function expiryProblem(text: string, nowYear: number, nowMonth: number): string {
    if (text.trim() == "") return "Enter the expiry date."
    const p = parseExpiry(text.replace(/\s/g, ""))
    if (p == null) return "Enter the expiry as MM / YY."
    const [month, year] = p
    if (month < 1 || month > 12) return "That month doesn't exist. Use 01 to 12."
    if (year < nowYear || (year == nowYear && month < nowMonth)) return "This card has expired."
    if (year > nowYear + 20) return "Check the expiry year."
    return ""
}

export function cvcProblem(text: string, brand: string): string {
    const n = cvcLength(brand)
    const where = brand == "amex" ? " on the front of the card" : " on the back of the card"
    if (text.trim() == "") return "Enter the security code."
    if (!/^\d+$/.test(text.trim())) return "The security code is digits only."
    if (text.trim().length != n) return "The security code is " + n + " digits" + where + "."
    return ""
}

export function isExpired(month: number, year: number, nowYear: number, nowMonth: number): boolean {
    return year < nowYear || (year == nowYear && month < nowMonth)
}

export function twoDigits(n: number): string {
    return String(n).padStart(2, "0")
}

// ── Addresses ───────────────────────────────────────────────────────────────

export function countryName(code: string): string {
    return code == "US" ? "United States" : code == "CA" ? "Canada" : code == "GB" ? "United Kingdom" : ""
}

export function postalLabel(code: string): string {
    return code == "US" ? "ZIP code" : "Postal code"
}

export function postalProblem(text: string, country: string): string {
    const t = text.trim().toUpperCase()
    if (t == "") return "Enter the " + (country == "US" ? "ZIP code." : "postal code.")
    if (country == "US" && !/^\d{5}(-\d{4})?$/.test(t)) return "A ZIP code is 5 digits, like 94103."
    if (country == "CA" && !/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/.test(t))
        return "A Canadian postal code looks like M5V 3L9."
    if (country == "GB" && !/^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|[A-HK-Y][0-9]{1,2}|[0-9][A-HJKS-UW]|[A-HK-Y][0-9][ABEHMNPRV-Y]) ?[0-9][ABD-HJLNP-UW-Z]{2})$/.test(t))
        return "A UK postcode looks like SW1A 2AA."
    return ""
}

export function emailProblem(text: string): string {
    const t = text.trim()
    if (t == "") return "Enter an email address for your tickets."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return "Enter an email address like name@example.com."
    return ""
}

// ── Code 128 (set B) ────────────────────────────────────────────────────────
// Each symbol is six alternating bar/space widths in modules; the stop is seven.

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
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
]

/** The bar and space widths, in modules, of `text` as Code 128 B, quiet zones excluded. */
export function code128(text: string): number[] {
    const codes = [104]
    for (const ch of text) {
        const v = ch.charCodeAt(0) - 32
        if (v >= 0 && v < 95) codes.push(v)
    }
    let sum = codes[0]
    for (let i = 1; i < codes.length; i++) sum += codes[i] * i
    codes.push(sum % 103, 106)
    const widths: number[] = []
    for (const c of codes) for (const w of C128[c]) widths.push(Number(w))
    return widths
}

export function code128Modules(text: string): number {
    return code128(text).reduce((a, b) => a + b, 0)
}

export function brandShort(brand: string): string {
    return ({ visa: "VISA", mastercard: "MC", amex: "AMEX", discover: "DISC" } as Record<string, string>)[brand] ?? "CARD"
}

export function postalExample(country: string): string {
    return ({ US: "94103", CA: "M5V 3L9", GB: "SW1A 2AA" } as Record<string, string>)[country] ?? ""
}
