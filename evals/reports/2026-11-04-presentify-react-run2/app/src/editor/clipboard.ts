import type { SlideElement } from '../api/types'

/**
 * Presentify's clipboard. It is kept in localStorage so that what is copied in one presentation —
 * or one window — can be pasted into another, and it is also put on the system clipboard as text
 * so a paste in another Presentify tab finds it there.
 */
const STORAGE_KEY = 'presentify.clipboard'
const MARKER = 'presentify/elements@1'

interface ClipboardPayload {
  marker: typeof MARKER
  /** Changes on every copy, so repeated pastes of one copy can step further away each time. */
  copyId: string
  elements: SlideElement[]
}

let pasteCount = 0
let lastCopyId: string | null = null

export function writeClipboard(elements: SlideElement[]): string {
  const payload: ClipboardPayload = { marker: MARKER, copyId: Math.random().toString(36).slice(2), elements }
  const text = JSON.stringify(payload)
  try {
    localStorage.setItem(STORAGE_KEY, text)
  } catch {
    // Storage can be full or switched off; the in-page copy below still works.
  }
  memory = payload
  return text
}

let memory: ClipboardPayload | null = null

export function parseClipboardText(text: string): ClipboardPayload | null {
  try {
    const parsed = JSON.parse(text) as ClipboardPayload
    return parsed && parsed.marker === MARKER && Array.isArray(parsed.elements) ? parsed : null
  } catch {
    return null
  }
}

export function readClipboard(): ClipboardPayload | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return parseClipboardText(stored)
  } catch {
    // Fall back to the copy kept in this page.
  }
  return memory
}

/** How many times this copy has been pasted, counting this paste: each paste lands one step further off. */
export function nextPasteStep(payload: ClipboardPayload): number {
  if (payload.copyId !== lastCopyId) {
    lastCopyId = payload.copyId
    pasteCount = 0
  }
  pasteCount += 1
  return pasteCount
}

export function hasClipboardContent(): boolean {
  return readClipboard() !== null
}
