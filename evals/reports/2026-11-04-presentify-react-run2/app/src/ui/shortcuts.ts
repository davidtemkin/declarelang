export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** Writes a shortcut such as `mod+shift+z` the way this platform does: ⇧⌘Z on a Mac, Ctrl+Shift+Z elsewhere. */
export function shortcutLabel(shortcut: string): string {
  const parts = shortcut.split('+')
  const key = parts.pop()!
  const names: Record<string, string> = IS_MAC
    ? { mod: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃' }
    : { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl' }
  const keyNames: Record<string, string> = {
    backspace: IS_MAC ? '⌫' : 'Backspace',
    delete: IS_MAC ? '⌫' : 'Delete',
    enter: IS_MAC ? '↩' : 'Enter',
    escape: 'Esc',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    space: 'Space',
  }
  const order = ['ctrl', 'alt', 'shift', 'mod']
  const mods = order.filter((m) => parts.includes(m)).map((m) => names[m])
  const keyLabel = keyNames[key] ?? key.toUpperCase()
  return IS_MAC ? [...mods, keyLabel].join('') : [...mods, keyLabel].join('+')
}

/** Whether the platform's command key (⌘ on a Mac, Ctrl elsewhere) is held. */
export const isMod = (e: { metaKey: boolean; ctrlKey: boolean }) => (IS_MAC ? e.metaKey : e.ctrlKey)
