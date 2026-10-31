import cardValidator from "card-validator";
import type { CardBrand, Country, SavedCard } from "../api/types";

export const BRAND_NAMES: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
};

export const digitsOf = (value: string) => value.replace(/\D/g, "");

export type CardKind = { name: string; gaps: number[]; lengths: number[]; codeSize: number; codeName: string };

/** What kind of card the digits so far belong to, once that is certain. */
export function cardKind(number: string): CardKind | null {
  const { card } = cardValidator.number(digitsOf(number));
  if (!card) return null;
  return {
    name: card.niceType,
    gaps: card.gaps,
    lengths: card.lengths,
    codeSize: card.code.size,
    codeName: card.code.name,
  };
}

/** The number grouped as it is printed on the card: `4242 4242 4242 4242`, `3782 822463 10005`. */
export function formatCardNumber(value: string) {
  const kind = cardKind(value);
  const maxLength = kind ? Math.max(...kind.lengths) : 19;
  const gaps = kind?.gaps ?? [4, 8, 12, 16];
  const digits = digitsOf(value).slice(0, maxLength);
  let out = "";
  [...digits].forEach((digit, i) => {
    if (gaps.includes(i)) out += " ";
    out += digit;
  });
  return out;
}

/** `04 / 28` — the separator appears once the year begins. */
export function formatExpiry(value: string) {
  let digits = digitsOf(value);
  // Autofill and paste can bring a four-digit year: "04/2028".
  if (digits.length === 6 && digits.startsWith("20", 2)) digits = digits.slice(0, 2) + digits.slice(4);
  if (/^[2-9]/.test(digits)) digits = `0${digits}`;
  digits = digits.slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
}

export function parseExpiry(value: string) {
  const digits = digitsOf(value);
  return { month: Number(digits.slice(0, 2)), year: 2000 + Number(digits.slice(2, 4)) };
}

function expired(month: number, year: number, today = new Date()) {
  const thisYear = today.getFullYear();
  return year < thisYear || (year === thisYear && month < today.getMonth() + 1);
}

export const savedCardExpired = (card: SavedCard) => expired(card.expMonth, card.expYear);

export const formatCardExpiry = (month: number, year: number) =>
  `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;

// Each check answers with what to do, or `true` when the value is fine.

export function checkCardNumber(value: string) {
  const digits = digitsOf(value);
  const result = cardValidator.number(digits);
  if (result.isValid) return true;
  if (result.isPotentiallyValid) return "This card number is too short. Check it against your card.";
  return "That can't be a card number. Check it against your card.";
}

export function checkExpiry(value: string) {
  const digits = digitsOf(value);
  if (digits.length < 4) return "Enter the expiry as it's printed on the card: month, then year.";
  const { month, year } = parseExpiry(value);
  if (month < 1 || month > 12) return `There's no month ${digits.slice(0, 2)}. Enter a month from 01 to 12.`;
  if (expired(month, year)) return "This card has expired. Use a card with an expiry date in the future.";
  return true;
}

export function checkSecurityCode(value: string, codeSize: number) {
  const digits = digitsOf(value);
  if (digits.length !== codeSize || digits.length !== value.trim().length)
    return `Enter the ${codeSize}-digit security code from your card.`;
  return true;
}

export const COUNTRIES: { code: Country; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
];

const POSTAL: Record<Country, { pattern: RegExp; example: string; numeric: boolean; name: string }> = {
  US: { pattern: /^\d{5}(-\d{4})?$/, example: "94103", numeric: true, name: "a US ZIP code" },
  CA: {
    pattern: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$/,
    example: "K1A 0B1",
    numeric: false,
    name: "a Canadian postal code",
  },
  GB: { pattern: /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/, example: "SW1A 2AA", numeric: false, name: "a UK postcode" },
};

export const postalIsNumeric = (country: Country) => POSTAL[country].numeric;

/** Tidies a postal code into the form the country writes it: `k1a0b1` → `K1A 0B1`. */
export function normalizePostalCode(value: string, country: Country) {
  if (country === "US") return value.trim();
  const compact = value.toUpperCase().replace(/\s+/g, "");
  return compact.length > 3 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact;
}

export function checkPostalCode(value: string, country: Country) {
  const { pattern, example, name } = POSTAL[country];
  if (pattern.test(normalizePostalCode(value, country))) return true;
  return `That doesn't look like ${name}. It should look like ${example}.`;
}

export function checkEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) || "Enter an email address like name@example.com.";
}
