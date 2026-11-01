/**
 * Typing into a text box, in place on the slide. A textarea laid out with exactly the
 * slide's text styles sits where the text is drawn, scaled with the slide, so the words
 * don't move when editing starts or ends.
 */
import { useEffect, useRef } from 'react';
import { mapTopmost } from './commands';
import { snugTextHeight, textCss } from '../model/text';
import type { TextElement } from '../model/types';
import { updateElements } from './doc';
import { editor } from './store';

export function TextEditor({ element, scale, slideId }: { element: TextElement; scale: number; slideId: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = ref.current!;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, []);

  const onChange = (content: string) => {
    editor.previewIncremental((doc) =>
      updateElements(doc, slideId, (els) =>
        mapTopmost(els, new Set([element.id]), (el) =>
          el.kind === 'text' ? snugTextHeight({ ...el, text: { ...el.text, content } }) : el,
        ),
      ),
    );
  };

  return (
    <textarea
      ref={ref}
      className="text-editor"
      aria-label="Text"
      value={element.text.content}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => editor.endEditing()}
      onKeyDown={(e) => {
        // Keys typed here are for the text, not for the editor's shortcuts.
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          editor.endEditing();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        ...textCss(element.text),
        position: 'absolute',
        left: element.x * scale,
        top: element.y * scale,
        width: element.width,
        height: Math.max(element.height, element.text.size * 1.2),
        transform: `scale(${scale})`,
        transformOrigin: '0 0',
        caretColor: element.text.color,
      }}
    />
  );
}
