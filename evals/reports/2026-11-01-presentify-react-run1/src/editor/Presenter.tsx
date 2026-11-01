/**
 * Presenting: one slide at a time, filling the screen, drawn by the same SlideView as the
 * editor so it looks exactly the same. Escape (or leaving full screen) returns to the
 * editor on the slide the person ended on.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SlideView } from '../components/SlideView';
import { editor, useEditor } from './store';

export function Presenter() {
  const doc = useEditor((s) => s.doc)!;
  const startId = useEditor.getState().currentSlideId;
  const [index, setIndex] = useState(() => Math.max(0, doc.order.indexOf(startId)));
  const [hintVisible, setHintVisible] = useState(true);
  const [cursorHidden, setCursorHidden] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const end = useCallback(() => {
    const id = useEditor.getState().doc?.order[indexRef.current];
    if (id) editor.setCurrentSlide(id);
    editor.setPresenting(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.max(0, Math.min(doc.order.length - 1, i + delta)));
  }, [doc.order.length]);

  useEffect(() => {
    ref.current!.focus();
    // Leaving full screen (the browser takes Escape for this) ends presenting.
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) end();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    const timer = setTimeout(() => setHintVisible(false), 2500);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      clearTimeout(timer);
    };
  }, [end]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
        case 'Enter':
        case 'n':
          go(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
        case 'p':
          go(-1);
          break;
        case 'Home':
          setIndex(0);
          break;
        case 'End':
          setIndex(doc.order.length - 1);
          break;
        case 'Escape':
          end();
          break;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, end, doc.order.length]);

  // The pointer hides when still, and comes back when moved.
  useEffect(() => {
    let timer = setTimeout(() => setCursorHidden(true), 1500);
    const onMove = () => {
      setCursorHidden(false);
      clearTimeout(timer);
      timer = setTimeout(() => setCursorHidden(true), 1500);
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  const slide = doc.slides[doc.order[index]];

  return (
    <div
      ref={ref}
      className={`presenter ${cursorHidden ? 'hide-cursor' : ''}`}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Presenting, slide ${index + 1} of ${doc.order.length}`}
      onClick={(e) => go(e.shiftKey ? -1 : 1)}
      onContextMenu={(e) => {
        e.preventDefault();
        go(-1);
      }}
    >
      {slide && <SlideView background={slide.background} elements={slide.elements} className="presenter-slide" label={`Slide ${index + 1}`} />}
      <div className={`presenter-hint ${hintVisible ? 'is-visible' : ''}`} aria-hidden>
        <span>← → or click to move</span>
        <span>Esc to stop</span>
      </div>
      <div className="visually-hidden" aria-live="polite">
        Slide {index + 1} of {doc.order.length}
      </div>
    </div>
  );
}
