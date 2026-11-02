import valid from 'card-validator';
import qr from 'qrcode-generator';

export function money(cents: number): string { return '$' + (cents / 100).toFixed(2); }
export function dateLabel(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(',', '');
}
export function timeLabel(iso: string): string {
    if (!iso) return '';
    const [h, m] = iso.slice(11).split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
}
export function digits(s: string): string { return s.replace(/\D/g, ''); }
export function detectBrand(s: string): string { return valid.number(s).card?.niceType ?? ''; }
export function cardFormat(s: string): string {
    const n = digits(s).slice(0, 19);
    const gaps = valid.number(n).card?.gaps ?? [4, 8, 12, 16];
    return Array.from(n).map((c, i) => (gaps.includes(i) ? ' ' : '') + c).join('');
}
export function cardError(s: string): string { return valid.number(s).isValid ? '' : 'Enter a valid card number.'; }
export function expiryError(s: string): string { return valid.expirationDate(s).isValid ? '' : 'Enter a valid future expiry, MM/YY.'; }
export function expiryParts(s: string): { month: number; year: number } {
    const v = valid.expirationDate(s);
    return { month: Number(v.month), year: Number(v.year) < 100 ? 2000 + Number(v.year) : Number(v.year) };
}
export function codeLength(s: string): number { return valid.number(s).card?.code.size ?? 3; }
export function emailError(s: string): string { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()) ? '' : 'Enter an email address like name@example.com.'; }
export function postalError(s: string, country: string): string {
    const patterns: Record<string, RegExp> = {
        US: /^\d{5}(-\d{4})?$/,
        CA: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
        GB: /^(GIR ?0AA|[A-PR-UWYZ](?:\d{1,2}|[A-HK-Y]\d{1,2}|\d[A-HJKPSTUW]|[A-HK-Y]\d[ABEHMNPRVWXY]) ?\d[ABD-HJLNP-UW-Z]{2})$/i,
    };
    return patterns[country]?.test(s.trim()) ? '' : ({US:'Enter a US ZIP code, such as 94103.',CA:'Enter a Canadian postal code, such as K1A 0B1.',GB:'Enter a UK postal code, such as WC1N 1AB.'}[country] ?? 'Choose a country.');
}
export function countryCode(s: string): string {
    return ({'United States':'US','Canada':'CA','United Kingdom':'GB','US':'US','CA':'CA','GB':'GB'} as Record<string,string>)[s] ?? '';
}
export function countryName(s: string): string { return ({US:'United States',CA:'Canada',GB:'United Kingdom'} as Record<string,string>)[s] ?? s; }
export function cardBrand(s: string): string { return ({visa:'Visa',mastercard:'Mastercard',amex:'American Express',discover:'Discover'} as Record<string,string>)[s] ?? s; }
export function expired(month: number, year: number, now: number): boolean {
    const d = new Date(now);
    return year < d.getFullYear() || (year === d.getFullYear() && month < d.getMonth() + 1);
}
export function qrImage(code: string): string {
    if (!code) return '';
    const image = qr(0, 'M'); image.addData(code); image.make();
    return image.createDataURL(6, 24);
}

export function seasonRange(first: string, last: string): string {
    if (!first || !last) return '';
    const a = new Date(first), b = new Date(last);
    const month = new Intl.DateTimeFormat('en-GB', { month: 'short' });
    const start = month.format(a), end = month.format(b);
    if (a.getFullYear() !== b.getFullYear()) return `${start} ${a.getFullYear()}–${end} ${b.getFullYear()}`;
    return `${start === end ? start : start + '–' + end} ${b.getFullYear()}`;
}
