import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './ReactionPicker.css'

const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥']

interface ReactionPickerProps {
  /** The bubble being reacted to. */
  target: HTMLElement
  alignEnd: boolean
  chosen: string[]
  onPick: (emoji: string) => void
  onClose: () => void
}

const GAP = 8
const EDGE = 8

/** The fixed set of marks, floating beside the message they would go on. */
export function ReactionPicker({ target, alignEnd, chosen, onPick, onClose }: ReactionPickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number; below: boolean } | null>(null)

  useLayoutEffect(() => {
    const picker = ref.current
    if (!picker) return
    const bubble = target.getBoundingClientRect()
    const { width, height } = picker.getBoundingClientRect()
    const below = bubble.top - height - GAP < EDGE + 56
    const top = below ? bubble.bottom + GAP : bubble.top - height - GAP
    const preferred = alignEnd ? bubble.right - width : bubble.left
    const left = Math.min(Math.max(EDGE, preferred), window.innerWidth - width - EDGE)
    setPlace({ left, top, below })
  }, [target, alignEnd])

  useEffect(() => {
    ref.current?.querySelector('button')?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    // Close when the reader scrolls, but not when the log moves on its own.
    const onMove = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('resize', onMove)
    window.addEventListener('wheel', onMove, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('wheel', onMove)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="picker"
      role="menu"
      aria-label="React to message"
      data-below={place?.below}
      style={place ? { left: place.left, top: place.top } : { visibility: 'hidden' }}
      onKeyDown={(event) => {
        const buttons = [...(ref.current?.querySelectorAll('button') ?? [])]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        if (step) buttons[(index + step + buttons.length) % buttons.length]?.focus()
      }}
    >
      {REACTIONS.map((emoji, i) => (
        <button
          key={emoji}
          type="button"
          role="menuitemcheckbox"
          className="picker__option"
          aria-checked={chosen.includes(emoji)}
          style={{ animationDelay: `${i * 18}ms` }}
          onClick={() => {
            if (!chosen.includes(emoji)) onPick(emoji)
            onClose()
          }}
        >
          {emoji}
        </button>
      ))}
    </div>,
    document.body,
  )
}
