import { memo, type ReactNode } from 'react'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type SlideContent, type SlideElement, type TextElement } from '../api/types'
import { textBlockStyle } from '../model/textLayout'

interface SlideViewProps {
  content: SlideContent
  /** Adds invisible, wider targets to thin lines so a pointer can find them; in slide points. */
  lineHitWidth?: number
  /** Draws this text box with `renderEditor` instead of as text, for editing in place. */
  editingTextId?: string | null
  renderEditor?: (el: TextElement) => ReactNode
  className?: string
}

/**
 * Draws one slide at whatever size its container gives it. Everything that shows a slide — the
 * canvas, the slide list, the presentation list and the presenter — draws it with this, so a slide
 * looks the same everywhere.
 */
export const SlideView = memo(function SlideView({ content, lineHitWidth, editingTextId, renderEditor, className }: SlideViewProps) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      style={{ display: 'block', overflow: 'hidden' }}
      aria-hidden="true"
      focusable="false"
    >
      <rect width={SLIDE_WIDTH} height={SLIDE_HEIGHT} fill={content.background} />
      {content.elements.map((el) => (
        <ElementView key={el.id} el={el} lineHitWidth={lineHitWidth} editingTextId={editingTextId} renderEditor={renderEditor} />
      ))}
    </svg>
  )
})

interface ElementViewProps {
  el: SlideElement
  lineHitWidth?: number
  editingTextId?: string | null
  renderEditor?: (el: TextElement) => ReactNode
}

const ElementView = memo(function ElementView({ el, lineHitWidth, editingTextId, renderEditor }: ElementViewProps) {
  switch (el.kind) {
    case 'rect': {
      const r = Math.min(el.cornerRadius, el.width / 2, el.height / 2)
      return (
        <rect
          data-element-id={el.id}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          rx={r}
          ry={r}
          fill={el.fill ?? 'none'}
          stroke={el.stroke?.color ?? 'none'}
          strokeWidth={el.stroke?.width ?? 0}
          pointerEvents={lineHitWidth ? 'all' : undefined}
        />
      )
    }
    case 'ellipse':
      return (
        <ellipse
          data-element-id={el.id}
          cx={el.x + el.width / 2}
          cy={el.y + el.height / 2}
          rx={el.width / 2}
          ry={el.height / 2}
          fill={el.fill ?? 'none'}
          stroke={el.stroke?.color ?? 'none'}
          strokeWidth={el.stroke?.width ?? 0}
          pointerEvents={lineHitWidth ? 'all' : undefined}
        />
      )
    case 'line':
      return (
        <g data-element-id={el.id}>
          <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.stroke.color} strokeWidth={el.stroke.width} strokeLinecap="round" />
          {lineHitWidth ? (
            <line
              x1={el.x1}
              y1={el.y1}
              x2={el.x2}
              y2={el.y2}
              stroke="transparent"
              strokeWidth={Math.max(el.stroke.width, lineHitWidth)}
              strokeLinecap="round"
              pointerEvents="stroke"
            />
          ) : null}
        </g>
      )
    case 'text':
      return (
        <foreignObject data-element-id={el.id} x={el.x} y={el.y} width={el.width} height={el.height} style={{ overflow: 'visible' }}>
          {editingTextId === el.id && renderEditor ? (
            renderEditor(el)
          ) : (
            <div style={{ ...textBlockStyle(el.text), width: el.width, userSelect: 'none' }}>{el.text.content || '​'}</div>
          )}
        </foreignObject>
      )
    case 'group':
      return (
        <g data-element-id={el.id}>
          {el.children.map((child) => (
            <ElementView key={child.id} el={child} lineHitWidth={lineHitWidth} editingTextId={editingTextId} renderEditor={renderEditor} />
          ))}
        </g>
      )
  }
})
