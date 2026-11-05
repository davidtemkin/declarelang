import { describe, expect, it } from 'vitest'
import { resizeBox } from './resize'

const box = { x: 100, y: 100, width: 200, height: 100 }

describe('resizeBox', () => {
  it('moves only the dragged corner, keeping the opposite one in place', () => {
    expect(resizeBox('se', box, { x: 400, y: 260 }, false)).toEqual({ x: 100, y: 100, width: 300, height: 160 })
    expect(resizeBox('nw', box, { x: 50, y: 80 }, false)).toEqual({ x: 50, y: 80, width: 250, height: 120 })
  })

  it('keeps the ratio from a corner, following the direction that moved further', () => {
    const r = resizeBox('se', box, { x: 500, y: 120 }, true)
    expect(r.width / r.height).toBeCloseTo(2)
    expect(r.width).toBe(400)
  })

  it('keeps the ratio from a side by growing the other dimension about its centre', () => {
    const r = resizeBox('e', box, { x: 500, y: 0 }, true)
    expect(r).toEqual({ x: 100, y: 50, width: 400, height: 200 })
  })

  it('never turns a box inside out', () => {
    const r = resizeBox('e', box, { x: 0, y: 0 }, false)
    expect(r.width).toBe(1)
    expect(r.x).toBe(100)
  })
})
