import { useLayoutEffect, useRef } from 'react'
import type { TextElement } from '../../api/types'
import { textBlockStyle } from '../../model/textLayout'
import { useEditorActions } from '../store'
import styles from './Stage.module.css'

/**
 * Edits a text box's words in place, on the slide, drawn exactly as the box is. The text it holds
 * is set once when it opens; after that the browser owns it and every keystroke is reported, so
 * React never rewrites it under the caret.
 */
export function TextEditor({ el }: { el: TextElement }) {
  const ref = useRef<HTMLDivElement>(null)
  const actions = useEditorActions()

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.textContent = el.text.content
    node.focus({ preventScroll: true })
    const range = document.createRange()
    range.selectNodeContents(node)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    // Only on opening: see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={ref}
      data-text-editor=""
      className={styles.textEditor}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Text"
      spellCheck
      style={{ ...textBlockStyle(el.text), width: el.width }}
      onInput={(e) => actions.setTextContent(e.currentTarget.textContent ?? '')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          actions.endTextEditing()
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  )
}
