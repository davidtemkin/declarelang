import type { Color } from '../api/types'

const HEX = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i

export function isColor(value: string): boolean {
  return HEX.test(value)
}

/** Accepts what a person might type — `abc`, `#abc`, `AABBCC`, `#aabbccdd` — and returns a format colour, or null. */
export function normalizeColor(input: string): Color | null {
  let v = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) return null
  v = v.toUpperCase()
  if (v.length === 8 && v.endsWith('FF')) v = v.slice(0, 6)
  return `#${v}`
}

export function rgba(color: Color): { r: number; g: number; b: number; a: number } {
  const m = HEX.exec(color)
  if (!m) return { r: 0, g: 0, b: 0, a: 1 }
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 }
}

export function withAlpha(color: Color, alpha: number): Color {
  const base = color.slice(0, 7).toUpperCase()
  if (alpha >= 1) return base
  const a = Math.round(Math.max(0, alpha) * 255).toString(16).padStart(2, '0').toUpperCase()
  return `${base}${a}`
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(color: Color): number {
  const { r, g, b } = rgba(color)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export const isDark = (color: Color) => luminance(color) < 0.32

/** A text colour that reads well on `background`. */
export const textColorOn = (background: Color): Color => (isDark(background) ? '#FFFFFF' : '#17151F')

/** The swatches offered in every colour picker: Presentify's own palette, then neutrals. */
export const SWATCHES: Color[] = [
  '#5B3DF5', '#8E7BFF', '#FF6A4D', '#FFB199', '#FFC23D', '#FFE29A', '#20C49A', '#A6EBD6',
  '#2F80ED', '#9CC8FF', '#E8467C', '#0E3B43',
  '#FFFFFF', '#F4F2F7', '#D9D5E2', '#A29DB0', '#5E596B', '#17151F',
]
