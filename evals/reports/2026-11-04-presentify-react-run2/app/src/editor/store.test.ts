import { describe, expect, it } from 'vitest'
import type { RectElement } from '../api/types'
import { translate } from '../model/elements'
import { withElements } from './doc'
import { createEditorStore, currentElements } from './store'

const rect = (id: string, x = 0): RectElement => ({
  id, kind: 'rect', x, y: 0, width: 100, height: 50, fill: '#000000', stroke: null, cornerRadius: 0, keepProportions: false,
})

function setup() {
  return createEditorStore({
    deckId: 'd',
    title: 'Deck',
    doc: { order: ['s1'], slides: { s1: { background: '#FFFFFF', elements: [rect('a')] } } },
  })
}

describe('undo', () => {
  it('records a drag of many movements as one step, and puts the selection back', () => {
    const store = setup()
    const { actions } = store.getState()
    actions.select(['a'])
    actions.begin()
    for (let dx = 1; dx <= 20; dx++) {
      actions.preview((doc, s) => withElements(doc, s.currentSlide, () => [translate(rect('a'), dx, 0)]))
    }
    actions.commit()
    expect(store.getState().past).toHaveLength(1)
    actions.clearSelection()
    actions.undo()
    expect(currentElements(store.getState())[0]).toMatchObject({ x: 0 })
    expect(store.getState().selection).toEqual(['a'])
    actions.redo()
    expect(currentElements(store.getState())[0]).toMatchObject({ x: 20 })
  })

  it('makes no step for a press that moved nothing', () => {
    const store = setup()
    const { actions } = store.getState()
    actions.begin()
    actions.commit()
    expect(store.getState().past).toHaveLength(0)
  })

  it('treats a run of like inspector changes as one step', () => {
    const store = setup()
    const { actions } = store.getState()
    actions.select(['a'])
    for (const fill of ['#111111', '#222222', '#333333']) {
      actions.styleSelection((l) => (l.kind === 'rect' ? { ...l, fill } : l), 'fill')
    }
    expect(store.getState().past).toHaveLength(1)
  })

  it('undoes adding and deleting slides', () => {
    const store = setup()
    const { actions } = store.getState()
    actions.addSlide()
    expect(store.getState().doc.order).toHaveLength(2)
    actions.deleteSlide(store.getState().doc.order[0])
    expect(store.getState().doc.order).toHaveLength(1)
    actions.undo()
    actions.undo()
    expect(store.getState().doc.order).toEqual(['s1'])
  })

  it('never deletes the last slide', () => {
    const store = setup()
    store.getState().actions.deleteSlide('s1')
    expect(store.getState().doc.order).toEqual(['s1'])
  })
})

describe('copy and paste', () => {
  it('pastes a copy slightly offset, selected, with fresh ids', () => {
    const store = setup()
    const { actions } = store.getState()
    actions.select(['a'])
    actions.copy()
    actions.paste()
    const els = currentElements(store.getState())
    expect(els).toHaveLength(2)
    expect(els[1].id).not.toBe('a')
    expect(els[1]).toMatchObject({ x: 16, y: 16 })
    expect(store.getState().selection).toEqual([els[1].id])
  })
})
