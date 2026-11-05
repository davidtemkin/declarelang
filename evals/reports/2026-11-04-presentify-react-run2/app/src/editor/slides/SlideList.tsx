import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { SlideView } from '../../slide/SlideView'
import { IconButton } from '../../ui/controls'
import { cx } from '../../ui/cx'
import { DropdownMenu, ContextMenuArea, type MenuEntry } from '../../ui/Menu'
import { DuplicateIcon, MoreIcon, PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, WarningIcon } from '../../ui/icons'
import { isMod } from '../../ui/shortcuts'
import { useEditor, useEditorActions } from '../store'
import styles from './SlideList.module.css'

/**
 * The slides, in order, down the left side: live pictures that update as a slide is edited. They
 * reorder by dragging (the others glide aside) or from each slide's menu, and the arrow keys move
 * between them.
 */
export function SlideList() {
  const order = useEditor((s) => s.doc.order)
  const currentSlide = useEditor((s) => s.currentSlide)
  const actions = useEditorActions()
  const [dragging, setDragging] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Keep the current slide in view when it changes from elsewhere (undo, a new slide, the keyboard).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-slide-key="${CSS.escape(currentSlide)}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentSlide])

  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    if (e.over && e.active.id !== e.over.id) actions.moveSlide(String(e.active.id), order.indexOf(String(e.over.id)))
  }

  const focusSlide = (key: string) => {
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-slide-key="${CSS.escape(key)}"]`)?.focus())
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = order.indexOf(currentSlide)
    let next: number | null = null
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = index + 1
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = order.length - 1
    if (next !== null) {
      e.preventDefault()
      e.stopPropagation()
      const target = order[Math.max(0, Math.min(order.length - 1, next))]
      if (e.altKey || (isMod(e) && e.shiftKey)) {
        // ⌥↑/⌥↓ moves the slide itself.
        actions.moveSlide(currentSlide, order.indexOf(target))
        focusSlide(currentSlide)
      } else {
        actions.goToSlide(target)
        focusSlide(target)
      }
      return
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && !isMod(e)) {
      e.preventDefault()
      e.stopPropagation()
      const nextKey = order[index + 1] ?? order[index - 1]
      actions.deleteSlide(currentSlide)
      if (nextKey) focusSlide(nextKey)
    }
  }

  return (
    <aside className={styles.sidebar} aria-label="Slide list">
      <div className={styles.header}>
        <span className={styles.heading}>
          Slides <span className={styles.count}>{order.length}</span>
        </span>
        <IconButton label="New slide" shortcut="mod+enter" size="sm" onClick={() => actions.addSlide()}>
          <PlusIcon size={18} />
        </IconButton>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div ref={listRef} className={styles.list} role="listbox" aria-label="Slides" aria-orientation="vertical" onKeyDown={onKeyDown}>
            {order.map((key, index) => (
              <SlideThumb key={key} slideKey={key} index={index} current={key === currentSlide} count={order.length} hidden={dragging === key} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
          {dragging ? <ThumbPicture slideKey={dragging} lifted /> : null}
        </DragOverlay>
      </DndContext>
      <button type="button" className={styles.addButton} onClick={() => actions.addSlide()}>
        <PlusIcon size={16} /> New slide
      </button>
    </aside>
  )
}

const ThumbPicture = memo(function ThumbPicture({ slideKey, lifted }: { slideKey: string; lifted?: boolean }) {
  const content = useEditor((s) => s.doc.slides[slideKey])
  if (!content) return null
  return (
    <div className={cx(styles.picture, lifted && styles.lifted)}>
      <SlideView content={content} />
    </div>
  )
})

function SlideThumb({ slideKey, index, current, count, hidden }: { slideKey: string; index: number; current: boolean; count: number; hidden: boolean }) {
  const actions = useEditorActions()
  const conflicted = useEditor((s) => !!s.conflicts[slideKey])
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slideKey })
  const label = `Slide ${index + 1}`

  const entries: MenuEntry[] = [
    { label: 'Duplicate slide', icon: <DuplicateIcon />, shortcut: 'mod+shift+d', onSelect: () => actions.duplicateSlide(slideKey) },
    { label: 'Move up', icon: <ArrowUpIcon />, disabled: index === 0, onSelect: () => actions.moveSlide(slideKey, index - 1) },
    { label: 'Move down', icon: <ArrowDownIcon />, disabled: index === count - 1, onSelect: () => actions.moveSlide(slideKey, index + 1) },
    { kind: 'separator' },
    {
      label: count > 1 ? 'Delete slide' : 'Delete slide (a presentation keeps at least one)',
      icon: <TrashIcon />,
      danger: true,
      disabled: count <= 1,
      onSelect: () => actions.deleteSlide(slideKey),
    },
  ]

  // dnd-kit's keyboard sorting would fight the list's own arrow keys, so only its pointer listeners are used.
  const { onPointerDown } = listeners ?? {}

  return (
    <ContextMenuArea entries={entries} onOpen={() => actions.goToSlide(slideKey)}>
      <div
        {...attributes}
        ref={setNodeRef}
        className={cx(styles.item, current && styles.current, (hidden || isDragging) && styles.placeholder)}
        style={{ transform: DndCSS.Translate.toString(transform), transition }}
        data-slide-key={slideKey}
        role="option"
        aria-selected={current}
        aria-label={label}
        aria-roledescription={undefined}
        tabIndex={current ? 0 : -1}
        onPointerDown={(e) => {
          onPointerDown?.(e)
          if (e.button === 0) actions.goToSlide(slideKey)
        }}
      >
        <span className={styles.number} aria-hidden="true">
          {index + 1}
        </span>
        <div className={styles.thumbWrap}>
          <ThumbPicture slideKey={slideKey} />
          {conflicted ? (
            <span className={styles.badge} title="Changed in another window">
              <WarningIcon size={12} />
            </span>
          ) : null}
          <div className={styles.more} onPointerDown={(e) => e.stopPropagation()}>
            <DropdownMenu
              align="start"
              entries={entries}
              trigger={
                <IconButton label={`${label} options`} size="sm" className={styles.moreButton} tabIndex={-1}>
                  <MoreIcon size={16} />
                </IconButton>
              }
            />
          </div>
        </div>
      </div>
    </ContextMenuArea>
  )
}
