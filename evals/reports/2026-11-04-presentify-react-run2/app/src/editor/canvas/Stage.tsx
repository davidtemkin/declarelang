import { useCallback, useRef } from 'react'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type TextElement } from '../../api/types'
import { SlideView } from '../../slide/SlideView'
import { ContextMenuArea, type MenuEntry } from '../../ui/Menu'
import { isDark } from '../../model/colors'
import { menuItem, useCommands, type CommandId, type Commands } from '../commands'
import { useEditor, useEditorStore } from '../store'
import { EmptySlideHint } from './EmptySlideHint'
import { SelectionOverlay } from './SelectionOverlay'
import { TextEditor } from './TextEditor'
import { useGestures } from './useGestures'
import { useStageLayout } from './useStageLayout'
import styles from './Stage.module.css'

const TOOL_CURSORS = { select: 'default', rect: 'crosshair', ellipse: 'crosshair', line: 'crosshair', text: 'text' } as const

/** The slide being edited, shown large, and everything a pointer does to it. */
export function Stage() {
  const store = useEditorStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const layout = useStageLayout(containerRef)
  const { feedback, handlers } = useGestures(store, layout, containerRef)
  const content = useEditor((s) => s.doc.slides[s.currentSlide])
  const currentSlide = useEditor((s) => s.currentSlide)
  const tool = useEditor((s) => s.tool)
  const editingTextId = useEditor((s) => s.editingTextId)
  const commands = useCommands()

  const renderEditor = useCallback((el: TextElement) => <TextEditor key={el.id} el={el} />, [])

  const cursor =
    feedback.activeGesture === 'move'
      ? 'grabbing'
      : feedback.hoverId && tool === 'select'
        ? 'move'
        : TOOL_CURSORS[tool]

  const ready = layout.width > 0

  return (
    <ContextMenuArea entries={contextEntries(commands)}>
      <div ref={containerRef} className={styles.stage} style={{ cursor }} {...handlers} data-tool={tool}>
        {ready && content ? (
          <>
            <div
              key={currentSlide}
              className={styles.slideFrame}
              role="group"
              aria-label="Slide"
              style={{
                left: layout.originX,
                top: layout.originY,
                width: SLIDE_WIDTH * layout.scale,
                height: SLIDE_HEIGHT * layout.scale,
              }}
            >
              <SlideView content={content} lineHitWidth={14 / layout.scale} editingTextId={editingTextId} renderEditor={renderEditor} />
            </div>
            <SelectionOverlay layout={layout} feedback={feedback} />
            {content.elements.length === 0 && tool === 'select' ? <EmptySlideHint layout={layout} dark={isDark(content.background)} /> : null}
          </>
        ) : null}
      </div>
    </ContextMenuArea>
  )
}

function contextEntries(c: Commands): MenuEntry[] {
  const item = (id: CommandId) => menuItem(c[id])
  const sep: MenuEntry = { kind: 'separator' }
  return [
    item('cut'),
    item('copy'),
    item('paste'),
    item('duplicate'),
    item('delete'),
    sep,
    item('group'),
    item('ungroup'),
    sep,
    item('bringToFront'),
    item('bringForward'),
    item('sendBackward'),
    item('sendToBack'),
    sep,
    item('selectAll'),
  ]
}
