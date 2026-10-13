import { describe, expect, it } from 'vitest'
import berlayar from './sites/berlayar-rise.json'
import breeze from './sites/kebun-baru-breeze.json'
import ridge from './sites/kebun-baru-ridge.json'
import { rayPoly, unitPos, type Pt, type Site } from './analysis'
import { unitLayout } from '../state/unit'
import { SURROUNDINGS } from '../state/studio'

const SITES = [berlayar, breeze, ridge] as unknown as Site[]

const onEdge = (poly: Pt[], p: Pt) => Math.min(...poly.map((a, i) => {
  const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])
}))
const inside = (poly: Pt[], p: Pt) => rayPoly(p, [1, 0.0001], poly) < Infinity && poly.reduce((c, a, i) => {
  const b = poly[(i + 1) % poly.length]
  return (a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0] ? !c : c
}, false)

describe.each(SITES.map((s) => [s.name, s] as const))('%s', (_name, S) => {
  it('is offered from the money plan', () => {
    expect(SURROUNDINGS.has(S.id)).toBe(true)
  })
  it('puts each window on its block outline, facing out', () => {
    for (const b of S.blocks) for (const u of b.units) {
      expect(onEdge(b.footprint, u.win), `${b.id} ${u.no}`).toBeLessThan(0.3)
      expect(Math.hypot(...u.n)).toBeCloseTo(1, 2)
      expect(inside(b.footprint, [u.win[0] + u.n[0] * 2, u.win[1] + u.n[1] * 2]), `${b.id} ${u.no} faces out`).toBe(false)
      expect(inside(b.footprint, [u.win[0] - u.n[0] * 2, u.win[1] - u.n[1] * 2]), `${b.id} ${u.no} has the flat behind`).toBe(true)
    }
  })
  it('has a Flat Studio layout for every unit type', () => {
    for (const t of new Set(S.blocks.flatMap((b) => b.units.map((u) => u.type)))) expect(unitLayout({ site: S.id, type: t }), t).toBeTruthy()
  })
  it('keeps each unit between its lowest storey and the top of the block', () => {
    for (const b of S.blocks) for (const u of b.units) {
      expect(unitPos(S, { block: b.id, unit: u.no, storey: 1 })!.storey).toBe(u.from ?? 2)
      expect(unitPos(S, { block: b.id, unit: u.no, storey: 99 })!.storey).toBe(b.storeys)
    }
  })
  it('has the geo anchor and an amenity list', () => {
    expect(S.geo).toBeTruthy()
    expect(S.amenities.length).toBeGreaterThan(2)
  })
})
