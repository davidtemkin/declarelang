import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { GroupElement, SlideElement, Stroke, TextAlign, TextStyle } from '../../api/types'
import { boundsOf, findElement, leaves, mapIntoFrame, translate, updateLeaves, updateMany } from '../../model/elements'
import { FONT_CHOICES, fontStack } from '../../model/fonts'
import { roundPoint } from '../../model/geometry'
import { cx } from '../../ui/cx'
import { Checkbox, ColorField, NumberField, Segmented, SelectField, Toggle } from '../../ui/fields'
import { agree, MIXED } from '../../ui/mixed'
import * as I from '../../ui/icons'
import { IconButton } from '../../ui/controls'
import { useCommands, type CommandId } from '../commands'
import { currentElements, useEditor, useEditorActions } from '../store'
import styles from './Inspector.module.css'

type Leaf = Exclude<SlideElement, GroupElement>

const KIND_NAMES: Record<SlideElement['kind'], string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  text: 'Text',
  group: 'Group',
}

const WEIGHTS = [
  { value: '100', label: 'Thin' },
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra bold' },
  { value: '900', label: 'Black' },
]

/**
 * The panel beside the slide. Its sections are always the same and always in the same place, so it
 * never changes shape under the pointer; a section that doesn't apply to what is selected is dimmed
 * and says why. Where the selected things differ, it says "Mixed" and a change applies to all.
 */
export function Inspector() {
  const actions = useEditorActions()
  const elements = useEditor(currentElements)
  const selection = useEditor(useShallow((s) => s.selection))
  const background = useEditor((s) => s.doc.slides[s.currentSlide]?.background ?? '#FFFFFF')

  const selected = selection.map((id) => findElement(elements, id)).filter((e): e is SlideElement => !!e)
  const all = leaves(selected)
  const filled = all.filter((l): l is Extract<Leaf, { kind: 'rect' | 'ellipse' }> => l.kind === 'rect' || l.kind === 'ellipse')
  const stroked = all.filter((l): l is Extract<Leaf, { kind: 'rect' | 'ellipse' | 'line' }> => l.kind !== 'text')
  const rects = all.filter((l): l is Extract<Leaf, { kind: 'rect' }> => l.kind === 'rect')
  const texts = all.filter((l): l is Extract<Leaf, { kind: 'text' }> => l.kind === 'text')
  const boxes = all.filter((l): l is Exclude<Leaf, { kind: 'line' }> => l.kind !== 'line')
  const bounds = boundsOf(selected)
  const nothing = selected.length === 0

  const style = (change: (leaf: Leaf) => Leaf, coalesce?: string) => actions.styleSelection(change, coalesce)

  const fill = agree(filled.map((l) => l.fill))
  const strokeColor = agree(stroked.map((l) => l.stroke?.color ?? null))
  const strokeWidth = agree(stroked.map((l) => l.stroke?.width ?? 0))
  const lineOnly = stroked.length > 0 && stroked.every((l) => l.kind === 'line')

  const setStroke = (change: (stroke: Stroke | null, leaf: Leaf) => Stroke | null, coalesce?: string) =>
    style((leaf) => {
      if (leaf.kind === 'text') return leaf
      const next = change(leaf.stroke, leaf)
      // A line always has an outline: "none" on a line leaves it as it was.
      if (leaf.kind === 'line') return next ? { ...leaf, stroke: next } : leaf
      return { ...leaf, stroke: next }
    }, coalesce)

  const textValue = <T,>(pick: (t: TextStyle) => T) => agree(texts.map((t) => pick(t.text)))
  const setText = (patch: Partial<TextStyle>, coalesce?: string) =>
    style((leaf) => (leaf.kind === 'text' ? { ...leaf, text: { ...leaf.text, ...patch } } : leaf), coalesce)

  const keep = agree(boxes.map((b) => b.keepProportions))

  const setGeometry = (field: 'x' | 'y' | 'width' | 'height', value: number) => {
    if (!bounds) return
    actions.updateElements((els) => {
      if (field === 'x' || field === 'y') {
        const dx = field === 'x' ? value - bounds.x : 0
        const dy = field === 'y' ? value - bounds.y : 0
        return updateMany(els, selection, (el) => translate(el, dx, dy))
      }
      const keepRatio = keep === true || keep === MIXED
      let width = field === 'width' ? Math.max(1, value) : bounds.width
      let height = field === 'height' ? Math.max(1, value) : bounds.height
      if (keepRatio && bounds.width > 0 && bounds.height > 0) {
        if (field === 'width') height = roundPoint((width * bounds.height) / bounds.width)
        else width = roundPoint((height * bounds.width) / bounds.height)
      }
      const next = { x: bounds.x, y: bounds.y, width, height }
      return updateMany(els, selection, (el) => mapIntoFrame(el, bounds, next))
    })
  }

  const title = nothing ? 'Slide' : selected.length === 1 ? KIND_NAMES[selected[0].kind] : `${selected.length} things`
  const subtitle = nothing
    ? 'Nothing selected'
    : selected.length === 1 && selected[0].kind === 'group'
      ? `${(selected[0] as GroupElement).children.length} things, grouped`
      : selected.length > 1
        ? 'Changes apply to all of them'
        : 'Selected'

  return (
    <aside className={styles.inspector} aria-label="Inspector">
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <KindIcon kind={nothing ? null : selected.length === 1 ? selected[0].kind : 'many'} />
          <div className={styles.titles}>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
        </div>
      </header>

      <div className={styles.scroll}>
        <Section title="Slide background" emphasis={nothing}>
          <ColorField label="Slide background" value={background} onChange={(c, live) => c && actions.setBackground(c, live ? 'live' : undefined)} />
        </Section>

        <ArrangeSection />

        <Section title="Fill" note={!nothing && filled.length === 0 ? 'Only shapes have a fill' : undefined} disabled={filled.length === 0}>
          <ColorField
            label="Fill"
            value={fill}
            allowNone
            disabled={filled.length === 0}
            onChange={(c, live) => style((l) => (l.kind === 'rect' || l.kind === 'ellipse' ? { ...l, fill: c } : l), live ? 'fill' : undefined)}
          />
        </Section>

        <Section title="Outline" note={!nothing && stroked.length === 0 ? 'Text has no outline' : undefined} disabled={stroked.length === 0}>
          <div className={styles.row}>
            <div className={styles.grow}>
              <ColorField
                label="Outline colour"
                value={strokeColor}
                allowNone={!lineOnly}
                disabled={stroked.length === 0}
                onChange={(c, live) =>
                  setStroke((s, leaf) => (c === null ? null : { color: c, width: s?.width ?? (leaf.kind === 'line' ? 4 : 2) }), live ? 'stroke' : undefined)
                }
              />
            </div>
            <NumberField
              className={styles.narrow}
              label="Outline width"
              glyph={<I.LineIcon size={14} />}
              value={strokeWidth}
              min={0}
              max={200}
              unit="pt"
              disabled={stroked.length === 0}
              onCommit={(w) =>
                setStroke((s, leaf) => {
                  if (w <= 0) return leaf.kind === 'line' ? { color: s?.color ?? '#17151F', width: 0.5 } : null
                  return { color: s?.color ?? '#17151F', width: w }
                })
              }
            />
          </div>
        </Section>

        <Section title="Corners" note={!nothing && rects.length === 0 ? 'Only rectangles have corners' : undefined} disabled={rects.length === 0}>
          <div className={styles.row}>
            <input
              type="range"
              className={styles.slider}
              aria-label="Corner radius slider"
              min={0}
              max={Math.max(1, Math.round(Math.max(0, ...rects.map((r) => Math.min(r.width, r.height) / 2))))}
              value={rects.length ? Math.min(...rects.map((r) => r.cornerRadius)) : 0}
              disabled={rects.length === 0}
              onChange={(e) => {
                const r = Number(e.currentTarget.value)
                style((l) => (l.kind === 'rect' ? { ...l, cornerRadius: r } : l), 'radius')
              }}
            />
            <NumberField
              className={styles.narrow}
              label="Corner radius"
              glyph={<I.CornerIcon size={14} />}
              value={agree(rects.map((r) => r.cornerRadius))}
              min={0}
              max={10000}
              disabled={rects.length === 0}
              onCommit={(r) => style((l) => (l.kind === 'rect' ? { ...l, cornerRadius: r } : l))}
            />
          </div>
        </Section>

        <Section title="Text" note={!nothing && texts.length === 0 ? 'Select a text box to style its words' : undefined} disabled={texts.length === 0}>
          <SelectField
            label="Font"
            value={textValue((t) => t.font)}
            disabled={texts.length === 0}
            options={FONT_CHOICES.map((f) => ({ value: f.name, label: f.name, style: { fontFamily: fontStack(f.name) } }))}
            onChange={(font) => setText({ font })}
          />
          <div className={styles.row}>
            <div className={styles.grow}>
              <SelectField
                label="Weight"
                value={textValue((t) => String(t.weight))}
                disabled={texts.length === 0}
                options={WEIGHTS}
                onChange={(w) => setText({ weight: Number(w) })}
              />
            </div>
            <NumberField
              className={styles.narrow}
              label="Font size"
              glyph="Aa"
              value={textValue((t) => t.size)}
              min={4}
              max={800}
              unit="pt"
              disabled={texts.length === 0}
              onCommit={(size) => setText({ size })}
            />
          </div>
          <div className={styles.row}>
            <div className={styles.grow}>
              <Segmented<TextAlign>
                label="Alignment"
                value={textValue((t) => t.align)}
                disabled={texts.length === 0}
                onChange={(align) => setText({ align })}
                options={[
                  { value: 'left', label: 'Align left', icon: <I.TextAlignLeftIcon size={18} /> },
                  { value: 'center', label: 'Align centre', icon: <I.TextAlignCenterIcon size={18} /> },
                  { value: 'right', label: 'Align right', icon: <I.TextAlignRightIcon size={18} /> },
                ]}
              />
            </div>
            <Toggle label="Italic" pressed={textValue((t) => t.italic)} disabled={texts.length === 0} onChange={(italic) => setText({ italic })}>
              <I.ItalicIcon size={18} />
            </Toggle>
          </div>
          <ColorField
            label="Text colour"
            value={textValue((t) => t.color)}
            disabled={texts.length === 0}
            onChange={(c, live) => c && setText({ color: c }, live ? 'text-color' : undefined)}
          />
        </Section>

        <Section title="Position and size" disabled={nothing}>
          <div className={styles.grid2}>
            <NumberField label="X" glyph="X" value={bounds ? roundPoint(bounds.x) : undefined} disabled={nothing} onCommit={(v) => setGeometry('x', v)} />
            <NumberField label="Y" glyph="Y" value={bounds ? roundPoint(bounds.y) : undefined} disabled={nothing} onCommit={(v) => setGeometry('y', v)} />
            <NumberField label="Width" glyph="W" value={bounds ? roundPoint(bounds.width) : undefined} min={1} disabled={nothing} onCommit={(v) => setGeometry('width', v)} />
            <NumberField label="Height" glyph="H" value={bounds ? roundPoint(bounds.height) : undefined} min={1} disabled={nothing} onCommit={(v) => setGeometry('height', v)} />
          </div>
          <Checkbox
            label="Keep proportions"
            checked={keep}
            disabled={boxes.length === 0}
            onChange={(on) =>
              actions.updateElements((els) =>
                updateMany(els, selection, (el) => updateLeaves(el, (l) => (l.kind === 'line' ? l : { ...l, keepProportions: on }))),
              )
            }
          />
        </Section>

      </div>
    </aside>
  )
}

function ArrangeSection() {
  const c = useCommands()
  const button = (id: CommandId) => (
    <IconButton key={id} label={c[id].label} shortcut={c[id].shortcut} size="sm" disabled={!c[id].enabled} onClick={c[id].run}>
      {c[id].icon}
    </IconButton>
  )
  const anyEnabled = c.alignLeft.enabled
  return (
    <Section title="Arrange" disabled={!anyEnabled && !c.ungroup.enabled}>
      <div className={styles.buttonRow} role="group" aria-label="Align">
        {(['alignLeft', 'alignCenter', 'alignRight', 'alignTop', 'alignMiddle', 'alignBottom'] as const).map(button)}
      </div>
      <div className={styles.buttonRow} role="group" aria-label="Order and distribute">
        {(['bringToFront', 'bringForward', 'sendBackward', 'sendToBack'] as const).map(button)}
        <span className={styles.divider} />
        {(['distributeHorizontal', 'distributeVertical'] as const).map(button)}
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.wideButton} disabled={!c.group.enabled} onClick={c.group.run}>
          <I.GroupIcon size={16} /> Group
        </button>
        <button type="button" className={styles.wideButton} disabled={!c.ungroup.enabled} onClick={c.ungroup.run}>
          <I.UngroupIcon size={16} /> Ungroup
        </button>
      </div>
    </Section>
  )
}

function Section({
  title,
  note,
  disabled,
  emphasis,
  children,
}: {
  title: string
  note?: string
  disabled?: boolean
  emphasis?: boolean
  children: ReactNode
}) {
  return (
    <section className={cx(styles.section, disabled && styles.sectionDisabled, emphasis && styles.sectionEmphasis)} aria-label={title}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {note ? <span className={styles.note}>{note}</span> : null}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  )
}

function KindIcon({ kind }: { kind: SlideElement['kind'] | 'many' | null }) {
  const icon =
    kind === 'rect' ? <I.RectIcon /> :
    kind === 'ellipse' ? <I.EllipseIcon /> :
    kind === 'line' ? <I.LineIcon /> :
    kind === 'text' ? <I.TextIcon /> :
    kind === 'group' || kind === 'many' ? <I.GroupIcon /> :
    <I.SlideIcon />
  return <span className={styles.kindIcon}>{icon}</span>
}
