import { describe, expect, it } from 'vitest'
import { CATALOG } from './catalog'
import layouts from './layouts.json'
import { bounds, itemPoly, loadState, mirrorDesign, pip, polyOverlap, rarea, rcent, snapBase, wallCover, wallInfo, type Design } from './model'

const known = (i: { type: string }) => CATALOG[i.type]
const load = (o: unknown) => loadState(o, known)
const brochure = (k: string) => load(structuredClone((layouts as Record<string, { design: unknown }>)[k].design))

describe('loadState', () => {
  it('fills defaults and drops bad entries', () => {
    const d = load({ name: 'x'.repeat(99), H: 9, walls: [{ x1: 0, y1: 0, x2: 0, y2: 0 }, { x1: 0, y1: 0, x2: 3, y2: 0, th: 2 }], items: [{ type: 'sofa', x: 1, y: 1 }, { type: 'nope', x: 0, y: 0 }], rooms: [{ x: 0, y: 0, w: -1, h: 1 }] })
    expect(d.name).toHaveLength(60)
    expect(d.H).toBe(3.2)
    expect(d.walls).toHaveLength(1)
    expect(d.walls[0].th).toBe(0)
    expect(d.items.map((i) => i.type)).toEqual(['sofa'])
    expect(d.items[0].w).toBe(CATALOG.sofa.w)
    expect(d.rooms).toHaveLength(0)
  })
  it('loads every brochure layout intact', () => {
    for (const [k, v] of Object.entries(layouts as unknown as Record<string, { design: Design }>)) {
      const d = brochure(k)
      expect(d.walls.length, k).toBe(v.design.walls.length)
      expect(d.items.length, k).toBe(v.design.items.length)
    }
  })
})

describe('geometry', () => {
  it('measures rooms', () => {
    const L = { x: 0, y: 0, w: 2, h: 2, pts: [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]] as [number, number][] }
    expect(rarea(L)).toBe(3)
    expect(pip(0.5, 1.5, L.pts)).toBe(true)
    expect(pip(1.5, 1.5, L.pts)).toBe(false)
    const c = rcent({ id: 'r', name: 'r', floor: 'oak', ...L })
    expect(c.x).toBeCloseTo(5 / 6)
  })
  it('splits a wall around its openings', () => {
    const w = { id: 'w', x1: 0, y1: 0, x2: 4, y2: 0, fin: 'paint', col: '', str: false, th: 0.2 }
    const wi = wallInfo(w, [{ id: 'o', kind: 'door', axis: 'h', c: 0, p: 2, w: 1, flip: -1, wt: 'std', dt: 'single' }])
    expect(wi.segs).toEqual([[-0.1, 1.5], [2.5, 4.1]])
  })
  it('measures how much of a wall survives', () => {
    const b = { x1: 0, y1: 0, x2: 4, y2: 0, str: false }
    expect(wallCover(b, [{ x1: 0, y1: 0, x2: 1, y2: 0, str: false }, { x1: 3, y1: 0.02, x2: 4, y2: 0.02, str: false }])).toBeCloseTo(0.5)
  })
  it('detects overlapping furniture', () => {
    const a = itemPoly({ x: 0, y: 0, w: 1, d: 1, rot: 0 })
    expect(polyOverlap(a, itemPoly({ x: 0.9, y: 0, w: 1, d: 1, rot: 45 }))).toBe(true)
    expect(polyOverlap(a, itemPoly({ x: 2, y: 0, w: 1, d: 1, rot: 0 }))).toBe(false)
  })
})

describe('mirrorDesign', () => {
  it('flips left to right, and twice is the identity', () => {
    const d = brochure('berlayar-rise/3R')
    d.base = snapBase(d, (t) => !!CATALOG[t]?.wet)
    const before = structuredClone(d), b = bounds(d)
    expect(mirrorDesign(d)).toBe(true)
    expect(bounds(d).x0).toBeCloseTo(b.x0)
    expect(bounds(d).x1).toBeCloseTo(b.x1)
    const sofa = before.items.find((i) => i.type === 'sofa')!, m = d.items.find((i) => i.id === sofa.id)!
    expect(m.x).toBeCloseTo(b.x0 + b.x1 - sofa.x)
    expect(m.rot).toBe((360 - sofa.rot) % 360)
    mirrorDesign(d)
    expect(JSON.parse(JSON.stringify(d))).toEqual(JSON.parse(JSON.stringify(before)))
  })
  it('does nothing on an empty design', () => {
    expect(mirrorDesign(load({}))).toBe(false)
  })
})
