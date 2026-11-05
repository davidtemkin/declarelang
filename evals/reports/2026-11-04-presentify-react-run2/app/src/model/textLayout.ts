import type { CSSProperties } from 'react'
import type { TextStyle } from '../api/types'
import { fontStack } from './fonts'

export const LINE_HEIGHT = 1.2

/**
 * How a text block is laid out, in slide points. The slide renderer, the in-place editor and the
 * measurer all use this one definition so that what is measured is exactly what is drawn.
 */
export function textBlockStyle(style: TextStyle): CSSProperties {
  return {
    fontFamily: fontStack(style.font),
    fontSize: style.size,
    fontWeight: style.weight,
    fontStyle: style.italic ? 'italic' : 'normal',
    color: style.color,
    textAlign: style.align,
    lineHeight: LINE_HEIGHT,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    wordBreak: 'normal',
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
  }
}

let measurer: HTMLDivElement | null = null

function getMeasurer(): HTMLDivElement {
  if (measurer && measurer.isConnected) return measurer
  measurer = document.createElement('div')
  measurer.setAttribute('aria-hidden', 'true')
  Object.assign(measurer.style, {
    position: 'absolute',
    left: '-100000px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    contain: 'layout style',
  })
  document.body.appendChild(measurer)
  return measurer
}

/** The height a block of text needs at the given width: at least one line, even when empty. */
export function measureTextHeight(style: TextStyle, width: number): number {
  const minimum = Math.ceil(style.size * LINE_HEIGHT)
  if (typeof document === 'undefined') return minimum
  const el = getMeasurer()
  const css = textBlockStyle(style)
  Object.assign(el.style, {
    fontFamily: css.fontFamily,
    fontSize: `${style.size}px`,
    fontWeight: String(style.weight),
    fontStyle: css.fontStyle,
    lineHeight: String(LINE_HEIGHT),
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    width: `${Math.max(1, width)}px`,
  })
  // A trailing newline needs a character after it to take up a line, as it does while typing.
  el.textContent = style.content.endsWith('\n') ? `${style.content}​` : style.content || '​'
  return Math.max(minimum, Math.ceil(el.getBoundingClientRect().height))
}
