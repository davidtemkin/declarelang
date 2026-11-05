import { describe, expect, it } from 'vitest'
import type { RectElement, SlideElement } from '../api/types'
import { align, distribute, group, reorder, ungroup } from './arrange'
import { elementBounds, mapIntoFrame } from './elements'

const rect = (id: string, x: number, y: number, width = 100, height = 50, cornerRadius = 0): RectElement => ({
  id, kind: 'rect', x, y, width, height, fill: '#000000', stroke: null, cornerRadius, keepProportions: false,
})

describe('grouping', () => {
  it('groups siblings in place and ungroups them back where they were', () => {
    const els: SlideElement[] = [rect('a', 0, 0), rect('b', 200, 0), rect('c', 400, 0)]
    const grouped = group(els, ['a', 'c'], 'g')
    expect(grouped.map((e) => e.id)).toEqual(['b', 'g'])
    const { elements, parts } = ungroup(grouped, ['g'])
    expect(parts).toEqual(['a', 'c'])
    expect(elements).toEqual([rect('b', 200, 0), rect('a', 0, 0), rect('c', 400, 0)])
  })
})

describe('aligning and distributing', () => {
  it('aligns tops to the topmost', () => {
    const out = align([rect('a', 0, 30), rect('b', 200, 10), rect('c', 400, 50)], ['a', 'b', 'c'], 'top')
    expect(out.map((e) => elementBounds(e).y)).toEqual([10, 10, 10])
  })

  it('leaves equal gaps, with the outermost two fixed', () => {
    const out = distribute([rect('a', 0, 0), rect('b', 130, 0), rect('c', 500, 0)], ['a', 'b', 'c'], 'horizontal')
    expect(out.map((e) => elementBounds(e).x)).toEqual([0, 250, 500])
  })
})

describe('ordering', () => {
  it('brings forward by one and to the front all the way', () => {
    const els = [rect('a', 0, 0), rect('b', 0, 0), rect('c', 0, 0)]
    expect(reorder(els, ['a'], 'forward').map((e) => e.id)).toEqual(['b', 'a', 'c'])
    expect(reorder(els, ['a'], 'front').map((e) => e.id)).toEqual(['b', 'c', 'a'])
    expect(reorder(els, ['c'], 'back').map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('resizing an element', () => {
  it('keeps a corner radius as a length, not a proportion', () => {
    const r = mapIntoFrame(rect('a', 0, 0, 100, 50, 12), { x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 0, width: 300, height: 50 })
    expect(r).toMatchObject({ width: 300, cornerRadius: 12 })
  })
})
