import cardValidator from 'card-validator'
import type { CardBrand, Country } from '../api'

/** card-validator's names for the cards the box office takes. */
const checkNumber = cardValidator.number

const ACCEPTED: Record<string, CardBrand> = {
  visa: 'visa',
  mastercard: 'mastercard',
  'american-express': 'amex',
  discover: 'discover',
}

export const ACCEPTED_SENTENCE = 'We take Visa, Mastercard, American Express and Discover.'

export type CardInfo = {
  /** Our brand, once the first digits are enough to say. */
  brand: CardBrand | null
  /** The first digits belong to a card we don't take. */
  unaccepted: boolean
  gaps: number[]
  maxLength: number
  cvcLength: 3 | 4
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function cardInfo(value: string): CardInfo {
  const digits = digitsOnly(value)
  const { card } = checkNumber(digits)
  const brand = card ? (ACCEPTED[card.type] ?? null) : null
  return {
    brand,
    unaccepted: Boolean(card && !brand),
    gaps: card?.gaps ?? [4, 8, 12],
    maxLength: card ? Math.max(...card.lengths) : 19,
    cvcLength: brand === 'amex' ? 4 : 3,
  }
}

/** Groups digits as printed on the card: "4242 4242 4242 4242", "3782 822463 10005". */
export function formatCardNumber(value: string): string {
  const info = cardInfo(value)
  const digits = digitsOnly(value).slice(0, info.maxLength)
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    if (info.gaps.includes(i)) out += ' '
    out += digits[i]
  }
  return out
}

export function validateCardNumber(value: string): string | true {
  const digits = digitsOnly(value)
  if (!digits) return 'Enter the card number.'
  const info = cardInfo(digits)
  if (info.unaccepted) return ACCEPTED_SENTENCE
  const result = checkNumber(digits)
  if (result.isValid) return true
  if (result.isPotentiallyValid)
    return 'That card number is too short — check you have every digit.'
  return 'That isn’t a card number — check the digits.'
}

export function validateCvc(value: string, cardNumber: string): string | true {
  const size = cardInfo(cardNumber).cvcLength
  return validateCvcLength(value, size)
}

export function validateCvcLength(value: string, size: number): string | true {
  if (!value) return 'Enter the security code.'
  if (!new RegExp(`^\\d{${size}}$`).test(value)) return `The security code is ${size} digits.`
  return true
}

/** Formats as "MM / YY". A lone first digit above 1 can only be a month: "4" → "04 / ". */
export function formatExpiry(value: string, deleting = false): string {
  // Autofill may give "04/2028" or "4/28".
  const full = value.match(/^\s*(\d{1,2})\s*[/\-.]\s*(\d{2}|\d{4})\s*$/)
  if (full) {
    const [, m, y] = full
    return `${m.padStart(2, '0')} / ${y.slice(-2)}`
  }
  let digits = digitsOnly(value)
  if (/^[2-9]$/.test(digits[0] ?? '')) digits = `0${digits}`
  digits = digits.slice(0, 4)
  if (digits.length < 2) return digits
  if (digits.length === 2) return deleting ? digits : `${digits} / `
  return `${digits.slice(0, 2)} / ${digits.slice(2)}`
}

export function parseExpiry(value: string): { month: number; year: number } | null {
  const digits = digitsOnly(value)
  if (digits.length !== 4) return null
  return { month: Number(digits.slice(0, 2)), year: 2000 + Number(digits.slice(2)) }
}

export function isExpired(month: number, year: number, now = new Date()): boolean {
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth() + 1
  return year < thisYear || (year === thisYear && month < thisMonth)
}

export function validateExpiry(value: string): string | true {
  if (!digitsOnly(value)) return 'Enter the expiry date.'
  const parsed = parseExpiry(value)
  if (!parsed) return 'Enter the expiry as month and year, like 04 / 28.'
  if (parsed.month < 1 || parsed.month > 12)
    return `There’s no month ${String(parsed.month).padStart(2, '0')} — use 01 to 12.`
  if (isExpired(parsed.month, parsed.year)) return 'That card has expired.'
  return true
}

const POSTAL: Record<Country, { pattern: RegExp; message: string }> = {
  US: { pattern: /^\d{5}(-\d{4})?$/, message: 'Enter a 5-digit ZIP code, like 94103.' },
  CA: {
    pattern: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
    message: 'Enter a Canadian postal code, like K1A 0B1.',
  },
  GB: {
    pattern: /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/i,
    message: 'Enter a UK postcode, like EC1A 1BB.',
  },
}

export function validatePostalCode(value: string, country: Country): string | true {
  const v = value.trim()
  if (!v) return 'Enter the postal code.'
  return POSTAL[country].pattern.test(v) ? true : POSTAL[country].message
}

/** "sw1a1aa" → "SW1A 1AA"; ZIP codes are left as typed. */
export function normalisePostalCode(value: string, country: Country): string {
  const v = value.trim().toUpperCase().replace(/\s+/g, '')
  if (country === 'US') return v
  return `${v.slice(0, -3)} ${v.slice(-3)}`
}
