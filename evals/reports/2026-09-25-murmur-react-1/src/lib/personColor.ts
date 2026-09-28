// A small, fixed set of hues that sit on the paper background, so each
// person keeps a colour throughout a group conversation.
const HUES = [18, 205, 145, 280, 40, 330, 180, 95]

export function personHue(id: string): number {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return HUES[Math.abs(hash) % HUES.length]
}
