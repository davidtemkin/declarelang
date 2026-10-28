import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface Anchor {
  /** `data-key` of the row at the top of the view. */
  key: string
  /** Its distance from the top of the view, in pixels. */
  offset: number
}

interface Options {
  scrollerRef: RefObject<HTMLElement | null>
  contentRef: RefObject<HTMLElement | null>
  /** Where to begin: a remembered anchor, or the bottom. */
  initial: Anchor | 'bottom'
  /** While inactive, the view holds still rather than following new messages. */
  active: boolean
  onMove?: (anchor: Anchor) => void
}

const BOTTOM_SLOP = 8

/**
 * Keeps the words someone is reading where they are while the log changes
 * around them — messages arriving, photos loading, reactions growing a
 * bubble — and keeps the newest message in view when they are at the end.
 *
 * Browsers' own scroll anchoring does not cover every engine this app runs
 * in, and none of them know about "pinned to the end", so it is done here:
 * the row at the top of the view is recorded as someone scrolls, and put back
 * after anything changes size.
 */
export function useReadingPosition({ scrollerRef, contentRef, initial, active, onMove }: Options) {
  const pinned = useRef(initial === 'bottom')
  const anchor = useRef<Anchor | null>(initial === 'bottom' ? null : initial)
  const activeRef = useRef(active)
  const onMoveRef = useRef(onMove)
  const [atEnd, setAtEnd] = useState(initial === 'bottom')
  const [farFromEnd, setFarFromEnd] = useState(false)

  useLayoutEffect(() => {
    activeRef.current = active
    onMoveRef.current = onMove
  })

  const rows = useCallback(
    () => Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[data-key]') ?? []),
    [contentRef],
  )

  /** Read where the reader is from the DOM. */
  const measure = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const top = scroller.getBoundingClientRect().top
    const all = rows()
    // First row whose bottom edge is below the top of the view.
    let lo = 0
    let hi = all.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (all[mid].getBoundingClientRect().bottom > top) hi = mid
      else lo = mid + 1
    }
    const row = all[lo]
    if (row?.dataset.key) {
      anchor.current = { key: row.dataset.key, offset: row.getBoundingClientRect().top - top }
      onMoveRef.current?.(anchor.current)
    }
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    const end = distance <= BOTTOM_SLOP
    pinned.current = end && activeRef.current
    setAtEnd(end)
    setFarFromEnd(distance > scroller.clientHeight)
  }, [scrollerRef, rows])

  /** Put the reader back where they were. */
  const restore = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    if (pinned.current && activeRef.current) {
      const bottom = scroller.scrollHeight - scroller.clientHeight
      if (Math.abs(scroller.scrollTop - bottom) > 0.5) scroller.scrollTop = bottom
      return
    }
    const saved = anchor.current
    if (!saved) return
    const row = contentRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(saved.key)}"]`)
    if (!row) return
    const delta = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - saved.offset
    if (Math.abs(delta) >= 1) scroller.scrollTop += delta
  }, [scrollerRef, contentRef])

  // Every commit may have changed the log.
  useLayoutEffect(() => {
    restore()
  })

  // So may anything that loads or grows between commits.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    if (!scroller || !content) return
    const observer = new ResizeObserver(() => restore())
    observer.observe(scroller)
    observer.observe(content)
    return () => observer.disconnect()
  }, [scrollerRef, contentRef, restore])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    measure()
    scroller.addEventListener('scroll', measure, { passive: true })
    return () => scroller.removeEventListener('scroll', measure)
  }, [scrollerRef, measure])

  // Coming back to the conversation: whether it is now at its end depends on
  // what arrived while it was away.
  useEffect(() => {
    if (active) measure()
  }, [active, measure])

  const toEnd = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const scroller = scrollerRef.current
      if (!scroller) return
      if (behavior === 'auto') pinned.current = true
      scroller.scrollTo({ top: scroller.scrollHeight, behavior })
    },
    [scrollerRef],
  )

  const pin = useCallback(() => {
    pinned.current = true
  }, [])

  return { atEnd, farFromEnd, toEnd, pin }
}
