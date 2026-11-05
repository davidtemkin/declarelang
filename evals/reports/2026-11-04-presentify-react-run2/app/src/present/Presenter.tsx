import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../api/types'
import { SlideView } from '../slide/SlideView'
import { useEditor, useEditorActions } from '../editor/store'
import { ChevronLeftIcon, CloseIcon } from '../ui/icons'
import styles from './Presenter.module.css'

/**
 * Presenting: one slide at a time, filling the screen, from the slide being edited. The arrow keys,
 * space and a click move through; Escape ends and leaves the editor on the slide shown last.
 */
export function Presenter() {
  const order = useEditor((s) => s.doc.order)
  const slides = useEditor((s) => s.doc.slides)
  const start = useEditor((s) => s.currentSlide)
  const actions = useEditorActions()
  const [index, setIndex] = useState(() => Math.max(0, order.indexOf(start)))
  const [chrome, setChrome] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const indexRef = useRef(index)
  useEffect(() => {
    indexRef.current = index
  }, [index])
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })

  const end = useCallback(() => {
    const key = order[indexRef.current]
    if (key) actions.goToSlide(key)
    actions.setPresenting(false)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  }, [actions, order])

  const go = useCallback((delta: number) => setIndex((i) => Math.max(0, Math.min(order.length - 1, i + delta))), [order.length])

  useEffect(() => {
    rootRef.current?.focus()
    const onFullscreenChange = () => {
      // Leaving full screen (with Escape, which the browser takes) ends the presentation too.
      if (!document.fullscreenElement) end()
    }
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('resize', onResize)
    }
  }, [end])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const forward = ['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter', 'n']
      const back = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p']
      if (forward.includes(e.key)) go(1)
      else if (back.includes(e.key)) go(-1)
      else if (e.key === 'Home') setIndex(0)
      else if (e.key === 'End') setIndex(order.length - 1)
      else if (e.key === 'Escape') end()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, end, order.length])

  const wake = () => {
    setChrome(true)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setChrome(false), 1800)
  }
  useEffect(() => {
    // The controls show on opening, then step aside until the pointer moves.
    idleTimer.current = setTimeout(() => setChrome(false), 1800)
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [])

  const scale = Math.min(size.width / SLIDE_WIDTH, size.height / SLIDE_HEIGHT)
  const content = slides[order[index]]

  return createPortal(
    <motion.div
      ref={rootRef}
      className={styles.presenter}
      data-chrome={chrome ? '' : undefined}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Presenting slide ${index + 1} of ${order.length}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      onPointerMove={wake}
      onClick={(e) => {
        if ((e.target as Element).closest('button')) return
        go(e.shiftKey ? -1 : 1)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        go(-1)
      }}
    >
      <div className={styles.frame} style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}>
        {content ? <SlideView content={content} /> : null}
      </div>
      <div className={styles.controls}>
        <button type="button" className={styles.control} aria-label="Previous slide" disabled={index === 0} onClick={() => go(-1)}>
          <ChevronLeftIcon size={18} />
        </button>
        <span className={styles.counter} aria-live="polite">
          {index + 1} / {order.length}
        </span>
        <button type="button" className={styles.control} aria-label="Next slide" disabled={index === order.length - 1} onClick={() => go(1)}>
          <ChevronLeftIcon size={18} style={{ transform: 'scaleX(-1)' }} />
        </button>
        <span className={styles.divider} />
        <button type="button" className={styles.control} aria-label="End presentation" onClick={end}>
          <CloseIcon size={18} />
        </button>
      </div>
      <div className={styles.progress} style={{ transform: `scaleX(${(index + 1) / order.length})` }} />
    </motion.div>,
    document.body,
  )
}
