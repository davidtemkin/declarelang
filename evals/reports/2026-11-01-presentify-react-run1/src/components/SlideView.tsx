/**
 * Draws a slide. The editor, the slide list, the presentation list and the presenter all
 * use this one component, so a slide looks exactly the same everywhere.
 */
import { memo } from 'react';
import { textCss } from '../model/text';
import type { SlideElement } from '../model/types';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../model/types';

interface SlideViewProps {
  background: string;
  elements: SlideElement[];
  /** A text box not to draw, because it is being typed into on top. */
  hiddenId?: string | null;
  className?: string;
  /** Text for assistive technology; omit to hide the picture from it. */
  label?: string;
}

export const SlideView = memo(function SlideView({ background, elements, hiddenId, className, label }: SlideViewProps) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ display: 'block', overflow: 'hidden' }}
    >
      <rect width={SLIDE_WIDTH} height={SLIDE_HEIGHT} fill={background} />
      <Elements elements={elements} hiddenId={hiddenId} />
    </svg>
  );
});

const Elements = memo(function Elements({ elements, hiddenId }: { elements: SlideElement[]; hiddenId?: string | null }) {
  return (
    <>
      {elements.map((el) => (
        <ElementView key={el.id} el={el} hiddenId={hiddenId} />
      ))}
    </>
  );
});

const ElementView = memo(function ElementView({ el, hiddenId }: { el: SlideElement; hiddenId?: string | null }) {
  switch (el.kind) {
    case 'group':
      return (
        <g>
          <Elements elements={el.children} hiddenId={hiddenId} />
        </g>
      );
    case 'rect': {
      const r = Math.min(el.cornerRadius, el.width / 2, el.height / 2);
      return (
        <rect
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          rx={r}
          ry={r}
          fill={el.fill ?? 'none'}
          stroke={el.stroke?.color ?? 'none'}
          strokeWidth={el.stroke?.width ?? 0}
        />
      );
    }
    case 'ellipse':
      return (
        <ellipse
          cx={el.x + el.width / 2}
          cy={el.y + el.height / 2}
          rx={el.width / 2}
          ry={el.height / 2}
          fill={el.fill ?? 'none'}
          stroke={el.stroke?.color ?? 'none'}
          strokeWidth={el.stroke?.width ?? 0}
        />
      );
    case 'line':
      return (
        <line
          x1={el.x1}
          y1={el.y1}
          x2={el.x2}
          y2={el.y2}
          stroke={el.stroke.color}
          strokeWidth={el.stroke.width}
          strokeLinecap="round"
        />
      );
    case 'text':
      if (el.id === hiddenId) return null;
      return (
        <foreignObject x={el.x} y={el.y} width={el.width} height={Math.max(el.height, 1)} style={{ overflow: 'visible' }}>
          <div style={{ ...textCss(el.text), width: el.width }}>{el.text.content}</div>
        </foreignObject>
      );
  }
});
