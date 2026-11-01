/**
 * The panel beside the slide: the selection's fill, outline, corners, text and layout,
 * and the arrange actions. Its sections never come and go with the selection (only
 * whether they apply), so the panel keeps its shape as the person works.
 *
 * When the selected things disagree, a field says "Mixed" rather than showing one of
 * them; a change applies to every selected thing it can.
 */
import { type ReactNode, useMemo } from 'react';
import { ColorField } from '../components/ColorField';
import {
  AlignBottomIcon, AlignCenterIcon, AlignLeftIcon, AlignMiddleIcon, AlignRightIcon, AlignTopIcon,
  BringForwardIcon, DistributeHIcon, DistributeVIcon, GroupIcon, ItalicIcon, SendBackwardIcon,
  TextCenterIcon, TextLeftIcon, TextRightIcon, UngroupIcon,
} from '../components/icons';
import { IconButton, NumberField, Segmented } from '../components/ui';
import { boundsOf, findElement, leaves, outermost, unionRects } from '../model/elements';
import { FONTS, fontLabel } from '../model/text';
import type { LeafElement, SlideElement, Stroke, TextAlign, TextStyle } from '../model/types';
import * as cmd from './commands';
import { editor, selectCurrentSlide, useEditor } from './store';

type Mixed<T> = T | 'mixed' | null;

/** The one value every item agrees on, 'mixed' if they don't, null if there are none. */
function agree<T>(values: T[]): Mixed<T> {
  if (values.length === 0) return null;
  const first = JSON.stringify(values[0]);
  return values.every((v) => JSON.stringify(v) === first) ? values[0] : 'mixed';
}

const WEIGHTS = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Extra Bold' },
  { value: 900, label: 'Black' },
];

const KIND_NAMES: Record<SlideElement['kind'], string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  text: 'Text',
  group: 'Group',
};

const EMPTY: string[] = [];

export function Inspector() {
  const slide = useEditor(selectCurrentSlide);
  const selection = useEditor((s) => (s.selection.length ? s.selection : EMPTY));

  const selected = useMemo(() => {
    if (!slide) return [];
    return outermost(slide.elements, selection)
      .map((id) => findElement(slide.elements, id))
      .filter((el): el is SlideElement => el !== null);
  }, [slide, selection]);

  if (!slide) return <aside className="inspector" aria-label="Inspector" />;

  if (selected.length === 0) {
    return (
      <aside className="inspector" aria-label="Inspector">
        <header className="inspector-header">
          <span className="panel-title">Slide</span>
        </header>
        <Section title="Background">
          <ColorField
            label="Background"
            value={slide.background}
            onPreview={(c) => cmd.previewEdit(cmd.backgroundChange(c))}
            onCommit={(c) => c && cmd.finishEdit('Background', cmd.backgroundChange(c))}
          />
        </Section>
        <div className="inspector-hint">
          Select something on the slide to change its fill, outline and text. Drag on empty space to select several.
        </div>
      </aside>
    );
  }

  return <SelectionInspector selected={selected} />;
}

function SelectionInspector({ selected }: { selected: SlideElement[] }) {
  const all = selected.flatMap(leaves);
  const shapes = all.filter((l) => l.kind === 'rect' || l.kind === 'ellipse');
  const stroked = all.filter((l) => l.kind !== 'text');
  const rects = all.filter((l) => l.kind === 'rect');
  const texts = all.filter((l) => l.kind === 'text');
  const proportional = all.filter((l) => l.kind !== 'line');

  const title =
    selected.length === 1 ? KIND_NAMES[selected[0].kind] : `${selected.length} items`;

  const style = (label: string, fn: (leaf: LeafElement) => LeafElement) => cmd.finishEdit(label, cmd.leafChange(fn));
  const preview = (fn: (leaf: LeafElement) => LeafElement) => cmd.previewEdit(cmd.leafChange(fn));

  const setFill = (fill: string | null) => (l: LeafElement) => (l.kind === 'rect' || l.kind === 'ellipse' ? { ...l, fill } : l);
  const setStrokeColor = (color: string | null) => (l: LeafElement): LeafElement => {
    if (l.kind === 'text') return l;
    if (color === null) return l.kind === 'line' ? l : { ...l, stroke: null };
    const stroke: Stroke = { color, width: l.stroke?.width ?? 2 };
    return { ...l, stroke } as LeafElement;
  };
  const setStrokeWidth = (width: number) => (l: LeafElement): LeafElement => {
    if (l.kind === 'text') return l;
    if (width === 0 && l.kind !== 'line') return { ...l, stroke: null };
    const stroke: Stroke = { color: l.stroke?.color ?? '#1F2328', width: Math.max(l.kind === 'line' ? 1 : 0, width) };
    return { ...l, stroke } as LeafElement;
  };
  const setText = (change: Partial<TextStyle>) => (l: LeafElement) => (l.kind === 'text' ? { ...l, text: { ...l.text, ...change } } : l);

  const fill = agree(shapes.map((l) => l.fill));
  const strokeColor = agree(stroked.map((l) => l.stroke?.color ?? null));
  const strokeWidth = agree(stroked.map((l) => l.stroke?.width ?? 0));
  const radius = agree(rects.map((l) => l.cornerRadius));
  const text = <K extends keyof TextStyle>(key: K) => agree(texts.map((l) => l.text[key]));
  const keep = agree(proportional.map((l) => l.keepProportions));
  const box = unionRects(selected.map(boundsOf));
  const onlyLines = stroked.length > 0 && stroked.every((l) => l.kind === 'line');

  const font = text('font');
  const fontOptions = FONTS.map((f) => f.name);
  if (typeof font === 'string' && font !== 'mixed' && !fontOptions.includes(font)) fontOptions.push(font);
  const weight = text('weight');
  const align = text('align');
  const italic = text('italic');

  return (
    <aside className="inspector" aria-label="Inspector">
      <header className="inspector-header">
        <span className="panel-title">{title}</span>
        {selected.length === 1 && selected[0].kind === 'group' && <span className="inspector-sub">{leaves(selected[0]).length} things</span>}
      </header>

      <Section title="Fill" disabled={!shapes.length}>
        <ColorField
          label="Fill"
          value={shapes.length ? fill : null}
          allowNone
          disabled={!shapes.length}
          onPreview={(c) => preview(setFill(c))}
          onCommit={(c) => style('Fill', setFill(c))}
        />
      </Section>

      <Section title="Outline" disabled={!stroked.length}>
        <div className="row">
          <ColorField
            label="Outline"
            value={stroked.length ? strokeColor : null}
            allowNone={!onlyLines}
            disabled={!stroked.length}
            onPreview={(c) => preview(setStrokeColor(c))}
            onCommit={(c) => style('Outline', setStrokeColor(c))}
          />
          <NumberField
            label="Width"
            value={stroked.length ? strokeWidth : null}
            min={0}
            max={200}
            suffix="pt"
            disabled={!stroked.length}
            onCommit={(w) => style('Outline Width', setStrokeWidth(w))}
          />
        </div>
      </Section>

      <Section title="Corners" disabled={!rects.length}>
        <div className="row">
          <NumberField
            label="Radius"
            value={rects.length ? radius : null}
            min={0}
            max={2000}
            suffix="pt"
            disabled={!rects.length}
            onCommit={(r) => style('Corner Radius', (l) => (l.kind === 'rect' ? { ...l, cornerRadius: r } : l))}
          />
          <input
            type="range"
            className="slider"
            aria-label="Corner radius"
            title="Corner radius"
            min={0}
            max={rects.length ? Math.round(Math.max(...rects.map((r) => Math.min(r.width, r.height) / 2))) : 1}
            disabled={!rects.length}
            value={typeof radius === 'number' ? radius : 0}
            onChange={(e) => preview((l) => (l.kind === 'rect' ? { ...l, cornerRadius: Number(e.target.value) } : l))}
            onPointerUp={() => editor.commit('Corner Radius')}
            onKeyUp={() => editor.commit('Corner Radius')}
          />
        </div>
      </Section>

      <Section title="Text" disabled={!texts.length}>
        <div className="field-stack">
          <label className="select-field">
            <span className="visually-hidden">Font</span>
            <select
              aria-label="Font"
              title="Font"
              disabled={!texts.length}
              value={typeof font === 'string' && font !== 'mixed' ? font : ''}
              onChange={(e) => style('Font', setText({ font: e.target.value }))}
              style={{ fontFamily: typeof font === 'string' && font !== 'mixed' ? `"${font}"` : undefined }}
            >
              {(font === 'mixed' || !texts.length) && <option value="">{texts.length ? 'Mixed' : '—'}</option>}
              {fontOptions.map((f) => (
                <option key={f} value={f}>
                  {fontLabel(f)}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <label className="select-field">
              <span className="visually-hidden">Weight</span>
              <select
                aria-label="Weight"
                title="Weight"
                disabled={!texts.length}
                value={typeof weight === 'number' ? String(weight) : ''}
                onChange={(e) => style('Weight', setText({ weight: Number(e.target.value) }))}
              >
                {(weight === 'mixed' || !texts.length) && <option value="">{texts.length ? 'Mixed' : '—'}</option>}
                {typeof weight === 'number' && !WEIGHTS.some((w) => w.value === weight) && <option value={weight}>{weight}</option>}
                {WEIGHTS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="Size"
              value={texts.length ? text('size') : null}
              min={4}
              max={800}
              suffix="pt"
              disabled={!texts.length}
              onCommit={(size) => style('Text Size', setText({ size }))}
            />
          </div>
          <div className="row">
            <Segmented<TextAlign>
              label="Alignment"
              value={texts.length ? align : null}
              disabled={!texts.length}
              onChange={(a) => style('Alignment', setText({ align: a }))}
              options={[
                { value: 'left', label: 'Align Left', icon: <TextLeftIcon size={18} /> },
                { value: 'center', label: 'Align Centre', icon: <TextCenterIcon size={18} /> },
                { value: 'right', label: 'Align Right', icon: <TextRightIcon size={18} /> },
              ]}
            />
            <IconButton
              label="Italic"
              pressed={italic === true}
              disabled={!texts.length}
              className="bordered"
              onClick={() => style('Italic', setText({ italic: italic !== true }))}
            >
              <ItalicIcon size={18} />
            </IconButton>
          </div>
          <ColorField
            label="Text Colour"
            value={texts.length ? text('color') : null}
            disabled={!texts.length}
            onPreview={(c) => preview(setText({ color: c }))}
            onCommit={(c) => c && style('Text Colour', setText({ color: c }))}
          />
        </div>
      </Section>

      <Section title="Position and Size">
        <div className="grid-2">
          <NumberField label="X" value={box.x} onCommit={(x) => cmd.setSelectionBounds({ ...box, x }, 'Move')} />
          <NumberField label="Y" value={box.y} onCommit={(y) => cmd.setSelectionBounds({ ...box, y }, 'Move')} />
          <NumberField
            label="W"
            value={box.width}
            min={1}
            onCommit={(width) => cmd.setSelectionBounds(keep === true ? { ...box, width, height: box.height === 0 ? 0 : (width * box.height) / box.width } : { ...box, width })}
          />
          <NumberField
            label="H"
            value={box.height}
            min={1}
            disabled={texts.length === all.length}
            onCommit={(height) => cmd.setSelectionBounds(keep === true ? { ...box, height, width: box.width === 0 ? 0 : (height * box.width) / box.height } : { ...box, height })}
          />
        </div>
        <label className={`checkbox ${proportional.length ? '' : 'is-disabled'}`}>
          <input
            type="checkbox"
            disabled={!proportional.length}
            checked={keep === true}
            ref={(el) => {
              if (el) el.indeterminate = keep === 'mixed';
            }}
            onChange={(e) => style('Keep Proportions', (l) => (l.kind === 'line' ? l : { ...l, keepProportions: e.target.checked }))}
          />
          <span>Keep proportions</span>
        </label>
      </Section>

      <Section title="Arrange">
        <div className="button-row" role="group" aria-label="Align">
          <ArrangeButton label="Align Left Edges" onClick={() => cmd.align('left')}><AlignLeftIcon /></ArrangeButton>
          <ArrangeButton label="Align Centres" onClick={() => cmd.align('center')}><AlignCenterIcon /></ArrangeButton>
          <ArrangeButton label="Align Right Edges" onClick={() => cmd.align('right')}><AlignRightIcon /></ArrangeButton>
          <ArrangeButton label="Align Tops" onClick={() => cmd.align('top')}><AlignTopIcon /></ArrangeButton>
          <ArrangeButton label="Align Middles" onClick={() => cmd.align('middle')}><AlignMiddleIcon /></ArrangeButton>
          <ArrangeButton label="Align Bottoms" onClick={() => cmd.align('bottom')}><AlignBottomIcon /></ArrangeButton>
        </div>
        <div className="button-row">
          <ArrangeButton label="Distribute Horizontally" disabled={selected.length < 3} onClick={() => cmd.distribute('horizontal')}><DistributeHIcon /></ArrangeButton>
          <ArrangeButton label="Distribute Vertically" disabled={selected.length < 3} onClick={() => cmd.distribute('vertical')}><DistributeVIcon /></ArrangeButton>
          <span className="button-row-gap" />
          <ArrangeButton label="Group" shortcut="Mod+G" disabled={!cmd.canGroup()} onClick={cmd.group}><GroupIcon /></ArrangeButton>
          <ArrangeButton label="Ungroup" shortcut="Mod+Shift+G" disabled={!cmd.canUngroup()} onClick={cmd.ungroup}><UngroupIcon /></ArrangeButton>
        </div>
        <div className="button-row">
          <ArrangeButton label="Bring to Front" shortcut="Mod+Shift+]" onClick={() => cmd.changeOrder('front')}><BringForwardIcon strokeWidth={2.2} /></ArrangeButton>
          <ArrangeButton label="Bring Forward" shortcut="Mod+]" onClick={() => cmd.changeOrder('forward')}><BringForwardIcon /></ArrangeButton>
          <ArrangeButton label="Send Backward" shortcut="Mod+[" onClick={() => cmd.changeOrder('backward')}><SendBackwardIcon /></ArrangeButton>
          <ArrangeButton label="Send to Back" shortcut="Mod+Shift+[" onClick={() => cmd.changeOrder('back')}><SendBackwardIcon strokeWidth={2.2} /></ArrangeButton>
        </div>
      </Section>
    </aside>
  );
}

function Section({ title, disabled, children }: { title: string; disabled?: boolean; children: ReactNode }) {
  return (
    <section className={`inspector-section ${disabled ? 'is-disabled' : ''}`} aria-label={title} aria-disabled={disabled || undefined}>
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  );
}

function ArrangeButton({ label, shortcut, disabled, onClick, children }: { label: string; shortcut?: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <IconButton label={label} shortcut={shortcut} disabled={disabled} onClick={onClick} tooltipSide="top" className="bordered">
      {children}
    </IconButton>
  );
}
