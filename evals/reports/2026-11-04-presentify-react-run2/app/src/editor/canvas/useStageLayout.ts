import { useLayoutEffect, useState, type RefObject } from 'react'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../../api/types'

export interface StageLayout {
  width: number
  height: number
  /** Screen pixels per slide point. */
  scale: number
  /** Where the slide's top-left corner sits in the stage, in pixels. */
  originX: number
  originY: number
}

const PADDING = 56

/** Fits a 1280 × 720 slide into the stage with room around it, keeping its shape at every window size. */
export function useStageLayout(ref: RefObject<HTMLElement | null>): StageLayout {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  const scale = Math.max(0.05, Math.min((size.width - PADDING * 2) / SLIDE_WIDTH, (size.height - PADDING * 2) / SLIDE_HEIGHT))
  // Whole pixels keep the slide's edges crisp.
  const originX = Math.round((size.width - SLIDE_WIDTH * scale) / 2)
  const originY = Math.round((size.height - SLIDE_HEIGHT * scale) / 2)
  return { ...size, scale, originX, originY }
}
