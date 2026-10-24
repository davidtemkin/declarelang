// The Venue's pure helpers: functions of their arguments, outside the reactive
// system. Money and dates as the brief writes them, the card rules a shop form
// needs, the hall's geometry, and the matrix of a ticket's QR code.

import qrcode from "qrcode-generator"

export type Point = { x: number, y: number }

/** each field's verdict: "" when it is fine, else what to say */
export type FieldProblems = Record<string, string>

// ── money and dates ─────────────────────────────────────────────────────────

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

/** 24000 → "$240.00" */
export function money(cents: number): string { return USD.format(cents / 100) }

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"]

// The service's times are the hall's local wall-clock time ("2026-11-13T19:30"),
// so they are read as parts and never through a time zone.
function parts(iso: string): { y: number, m: number, d: number, h: number, min: number } {
    const [date, time] = iso.split("T")
    const [y, m, d] = date.split("-").map(Number)
    const [h, min] = (time ?? "00:00").split(":").map(Number)
    return { y, m, d, h, min }
}

/** "2026-11-13T19:30" → "Fri 13 Nov" */
export function dayLabel(iso: string): string {
    const p = parts(iso)
    const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
    return `${DAYS[dow]} ${p.d} ${MONTHS[p.m - 1]}`
}

/** "2026-11-13T19:30" → "Fri" */
export function weekday(iso: string): string {
    const p = parts(iso)
    return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]
}

/** "2026-11-13T19:30" → 13 */
export function dayOfMonth(iso: string): number { return parts(iso).d }

/** "2026-11-13T19:30" → "Nov" */
export function monthShort(iso: string): string { return MONTHS[parts(iso).m - 1] }

/** "2026-11-13T19:30" → "November" */
export function monthName(iso: string): string { return MONTH_NAMES[parts(iso).m - 1] }

/** "2026-11-13T19:30" → "7:30pm"; on the hour, "2pm" */
export function timeLabel(iso: string): string {
    const p = parts(iso)
    const h12 = p.h % 12 == 0 ? 12 : p.h % 12
    const mm = p.min == 0 ? "" : ":" + String(p.min).padStart(2, "0")
    return `${h12}${mm}${p.h < 12 ? "am" : "pm"}`
}

/** a performance before 5pm is a matinee */
export function isMatinee(iso: string): boolean { return parts(iso).h < 17 }

// ── cards ───────────────────────────────────────────────────────────────────

export type Brand = "visa" | "mastercard" | "amex" | "discover" | ""

/** the kind of card, from its first digits */
export function brandOf(digits: string): Brand {
    if (/^4/.test(digits)) return "visa"
    if (/^3[47]/.test(digits)) return "amex"
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return "mastercard"
    if (/^(6011|65|64[4-9]|622)/.test(digits)) return "discover"
    return ""
}

export function brandName(b: string): string {
    return b == "visa" ? "Visa" : b == "mastercard" ? "Mastercard" : b == "amex" ? "American Express"
        : b == "discover" ? "Discover" : ""
}

/** the lengths a card of this kind can have */
function lengthsOf(b: Brand): number[] {
    return b == "amex" ? [15] : b == "visa" ? [13, 16, 19] : b == "discover" ? [16, 19] : [16]
}

/** the longest number this kind of card can have */
export function maxDigits(digits: string): number {
    const b = brandOf(digits)
    return b == "" ? 19 : Math.max(...lengthsOf(b))
}

/** security-code length: four for American Express, three for the rest */
export function cvcLength(b: string): number { return b == "amex" ? 4 : 3 }

/** grouped as printed: 4-6-5 on American Express, fours on the rest */
export function groupCard(digits: string): string {
    if (brandOf(digits) == "amex")
        return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter((s) => s != "").join(" ")
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ")
}

/** where the caret belongs in a grouped number with `n` digits before it */
export function caretAfterDigits(grouped: string, n: number): number {
    if (n <= 0) return 0
    let seen = 0
    for (let i = 0; i < grouped.length; i++) {
        if (/\d/.test(grouped[i])) seen++
        if (seen == n) return i + 1
    }
    return grouped.length
}

function luhn(digits: string): boolean {
    let sum = 0
    for (let i = 0; i < digits.length; i++) {
        let d = Number(digits[digits.length - 1 - i])
        if (i % 2 == 1) { d *= 2; if (d > 9) d -= 9 }
        sum += d
    }
    return sum % 10 == 0
}

export function cardNumberProblem(digits: string): string {
    if (digits == "") return "Enter the card number."
    const b = brandOf(digits)
    if (b == "") return "That isn't a card number we recognise."
    const lengths = lengthsOf(b)
    if (digits.length < Math.min(...lengths)) return "The card number is too short."
    if (!lengths.includes(digits.length) || !luhn(digits)) return "That card number isn't right. Check it against your card."
    return ""
}

/** "04 / 28" as typed — digits only, with the slash put in for the person */
export function formatExpiry(typed: string, deleting: boolean): string {
    let d = typed.replace(/\D/g, "").slice(0, 4)
    if (d.length == 1 && Number(d) > 1) d = "0" + d          // "4" can only be April
    if (d.length < 2) return d
    if (d.length == 2) return deleting ? d : d + " / "
    return d.slice(0, 2) + " / " + d.slice(2)
}

export function parseExpiry(text: string): { month: number, year: number } | null {
    const d = text.replace(/\D/g, "")
    if (d.length != 4) return null
    return { month: Number(d.slice(0, 2)), year: 2000 + Number(d.slice(2)) }
}

/** expired once the month it names is over */
export function isExpired(month: number, year: number, nowYear: number, nowMonth: number): boolean {
    return year < nowYear || (year == nowYear && month < nowMonth)
}

export function expiryProblem(text: string, nowYear: number, nowMonth: number): string {
    if (text.trim() == "") return "Enter the expiry date."
    const e = parseExpiry(text)
    if (e == null) return "Enter the expiry as MM / YY."
    if (e.month < 1 || e.month > 12) return "Enter a month from 01 to 12."
    if (isExpired(e.month, e.year, nowYear, nowMonth)) return "That card has expired."
    return ""
}

export function cvcProblem(cvc: string, brand: string): string {
    const n = cvcLength(brand)
    if (cvc == "") return "Enter the security code."
    if (!new RegExp(`^\\d{${n}}$`).test(cvc))
        return brand == "amex" ? "The security code is the 4 digits on the front of the card."
            : `The security code is ${n} digits, on the back of the card.`
    return ""
}

/** "04/28" */
export function expiryShort(month: number, year: number): string {
    return String(month).padStart(2, "0") + "/" + String(year % 100).padStart(2, "0")
}

// ── addresses ───────────────────────────────────────────────────────────────

export const COUNTRIES = [
    { id: "US", label: "United States", place: "the United States", postal: "ZIP code", example: "94103" },
    { id: "CA", label: "Canada", place: "Canada", postal: "postal code", example: "K1A 0B1" },
    { id: "GB", label: "United Kingdom", place: "the United Kingdom", postal: "postcode", example: "SW1A 1AA" }
]

export function countryName(id: string): string { return COUNTRIES.find((c) => c.id == id)?.label ?? "" }

export function postalExample(id: string): string { return COUNTRIES.find((c) => c.id == id)?.example ?? "" }

const POSTAL: Record<string, RegExp> = {
    US: /^\d{5}(-\d{4})?$/,
    CA: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
    GB: /^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|[A-HK-Y][0-9]([0-9ABEHMNPRV-Y])?|[0-9][A-HJKPS-UW]) ?[0-9][ABD-HJLNP-UW-Z]{2})$/i
}

export function postalProblem(code: string, country: string): string {
    const c = COUNTRIES.find((x) => x.id == country)
    if (c == null) return "Choose a country."
    if (code.trim() == "") return `Enter the ${c.postal}.`
    if (!POSTAL[country].test(code.trim())) return `That isn't a ${c.postal} in ${c.place} — one looks like ${c.example}.`
    return ""
}

/** the one country whose format a postal code fits, or "" when it fits none or several */
export function countryOfPostal(code: string): string {
    const fits = COUNTRIES.filter((c) => POSTAL[c.id].test(code.trim())).map((c) => c.id)
    return fits.length == 1 ? fits[0] : ""
}

/** as the post office writes it: upper case, with the space a Canadian or UK code takes */
export function tidyPostal(code: string, country: string): string {
    const t = code.trim().toUpperCase().replace(/\s+/g, "")
    if ((country == "CA" || country == "GB") && t.length > 3) return t.slice(0, -3) + " " + t.slice(-3)
    return code.trim()
}

export function emailProblem(email: string): string {
    if (email.trim() == "") return "Enter your email address."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter an email address like name@example.com."
    return ""
}

// ── the hall ────────────────────────────────────────────────────────────────
//
// The hall is laid out in seat units: one unit is the distance between two
// seats along a row, and between two rows. Every row is an arc about one
// point above the stage, so the rows wrap the stage and the seats face it.
// Sections sit one behind another, a gap apart.

export const HALL = {
    r0: 15,        // the front row's radius
    gap: 1.6,      // the walkway between two sections, front to back
    stageFront: 12.6,
    stageBack: 9.4,
    stageHalf: 6.2, // half the stage's width
    margin: 1.4
}

export function ringRadius(section: number, ring: number): number { return HALL.r0 + ring + section * HALL.gap }

/** the angle of seat `i` (0-based) in a row of `n` at radius `r` */
export function seatAngle(i: number, n: number, r: number): number { return (i - (n - 1) / 2) / r }

/** where a seat sits, in units about the arcs' centre */
export function seatPoint(i: number, n: number, r: number): { x: number, y: number } {
    const a = seatAngle(i, n, r)
    return { x: r * Math.sin(a), y: r * Math.cos(a) }
}

// ── tickets ─────────────────────────────────────────────────────────────────

/** the dark modules of a ticket's QR code, row by row */
export function qrModules(text: string): boolean[][] {
    const q = qrcode(0, "M")
    q.addData(text)
    q.make()
    const n = q.getModuleCount()
    const rows: boolean[][] = []
    for (let r = 0; r < n; r++) {
        const row: boolean[] = []
        for (let c = 0; c < n; c++) row.push(q.isDark(r, c))
        rows.push(row)
    }
    return rows
}
