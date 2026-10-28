import { useRef } from 'react'

const HOLD_MS = 420
const MOVE_TOLERANCE = 10

/**
 * Press-and-hold for touch. Moving the finger — to scroll, most often —
 * cancels it, so holding never competes with reading. A click that ends a
 * hold is swallowed so the element underneath does not also activate.
 */
export function useLongPress(onLongPress: (target: HTMLElement) => void) {
  const timer = useRef<number | undefined>(undefined)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const cancel = () => {
    window.clearTimeout(timer.current)
    origin.current = null
  }

  return {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      fired.current = false
      if (event.pointerType === 'mouse') return
      const target = event.currentTarget
      origin.current = { x: event.clientX, y: event.clientY }
      timer.current = window.setTimeout(() => {
        fired.current = true
        origin.current = null
        navigator.vibrate?.(8)
        onLongPress(target)
      }, HOLD_MS)
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const start = origin.current
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture(event: React.MouseEvent<HTMLElement>) {
      if (fired.current) {
        event.preventDefault()
        event.stopPropagation()
        fired.current = false
      }
    },
    onContextMenu(event: React.MouseEvent<HTMLElement>) {
      // Right-click on a desktop, and the long-press menu on Android, both
      // mean "do something with this message".
      event.preventDefault()
      if (!fired.current) {
        cancel()
        fired.current = true
        onLongPress(event.currentTarget)
      }
    },
  }
}
