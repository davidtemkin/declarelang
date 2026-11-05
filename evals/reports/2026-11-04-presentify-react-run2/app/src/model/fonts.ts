/**
 * The typefaces offered for text on slides. The stored name is what the format keeps; `stack` is how
 * the browser draws it. Inter, Fraunces, Space Grotesk, Bricolage Grotesque and JetBrains Mono ship
 * with Presentify, so they look the same on every machine; the others are common system faces.
 */
export interface FontChoice {
  name: string
  stack: string
}

export const FONT_CHOICES: FontChoice[] = [
  { name: 'Inter', stack: '"Inter Variable", "Inter", system-ui, sans-serif' },
  { name: 'Bricolage Grotesque', stack: '"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif' },
  { name: 'Space Grotesk', stack: '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif' },
  { name: 'Fraunces', stack: '"Fraunces Variable", "Fraunces", Georgia, serif' },
  { name: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { name: 'Helvetica Neue', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { name: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { name: 'JetBrains Mono', stack: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace' },
]

export const DEFAULT_FONT = 'Inter'

export function fontStack(name: string): string {
  const known = FONT_CHOICES.find((f) => f.name === name)
  if (known) return known.stack
  // A face this build doesn't know (written by another tool) is still asked for by name.
  return `"${name.replace(/"/g, '')}", system-ui, sans-serif`
}
