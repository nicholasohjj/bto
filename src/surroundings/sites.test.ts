import { describe, expect, it } from 'vitest'
import berlayar from './sites/berlayar-rise.json'
import breeze from './sites/kebun-baru-breeze.json'
import ridge from './sites/kebun-baru-ridge.json'
import lakeview from './sites/lakeview-cascadia.json'
import sembawang from './sites/sembawang-brook.json'
import portico from './sites/sembawang-portico.json'
import woodgrove from './sites/woodgrove-acres.json'
import { blockMasses, rayPoly, unitPos, type Osm, type Pt, type Site } from './analysis'
import { unitLayout } from '../state/unit'
import { SURROUNDINGS } from '../state/studio'

const SITES = [berlayar, breeze, ridge, lakeview, sembawang, portico, woodgrove] as unknown as Site[]

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
  it('puts each window on the outline of a part that reaches its top storey, facing out', () => {
    for (const b of S.blocks) for (const u of b.units) {
      const top = u.to ?? b.storeys, parts = blockMasses(b), own = parts.filter((m) => m.storeys >= top && onEdge(m.poly, u.win) < 0.3)
      expect(own.length, `${b.id} ${u.no}`).toBeGreaterThan(0)
      expect(Math.hypot(...u.n)).toBeCloseTo(1, 2)
      expect(parts.some((m) => inside(m.poly, [u.win[0] + u.n[0] * 2, u.win[1] + u.n[1] * 2])), `${b.id} ${u.no} faces out`).toBe(false)
      expect(own.some((m) => inside(m.poly, [u.win[0] - u.n[0] * 2, u.win[1] - u.n[1] * 2])), `${b.id} ${u.no} has the flat behind`).toBe(true)
    }
  })
  it('gives each block its full height', () => {
    for (const b of S.blocks) expect(Math.max(...blockMasses(b).map((m) => m.storeys)), b.id).toBe(b.storeys)
  })
  it('has a Flat Studio layout for every unit type', () => {
    for (const t of new Set(S.blocks.flatMap((b) => b.units.map((u) => u.type)))) expect(unitLayout({ site: S.id, type: t }), t).toBeTruthy()
  })
  it('keeps each unit between its lowest storey and the top of the block', () => {
    for (const b of S.blocks) for (const u of b.units) {
      expect(unitPos(S, { block: b.id, unit: u.no, storey: 1 })!.storey).toBe(u.from ?? 2)
      expect(unitPos(S, { block: b.id, unit: u.no, storey: 99 })!.storey).toBe(u.to ?? b.storeys)
    }
  })
  it("leaves the estate's own blocks and buildings out of the OpenStreetMap snapshot (the brochure model has them)", async () => {
    const osm = (await import(`./sites/${S.id}.osm.json`)).default as unknown as Osm
    const own = [...S.blocks.flatMap((b) => blockMasses(b).map((m) => m.poly)), ...S.buildings.flatMap((b) => b.poly ? [b.poly] : [])]
    const clash = osm.buildings.filter((b) => {
      const pts: Pt[] = []
      for (let i = 0; i < b.p.length; i += 2) pts.push([b.p[i], b.p[i + 1]])
      return own.some((o) => pts.some((p) => inside(o, p)))
    })
    expect(clash.map((b) => `${b.n ?? 'unnamed'} ${b.h} m`)).toEqual([])
  })
  it('has the geo anchor and an amenity list', () => {
    expect(S.geo).toBeTruthy()
    expect(S.amenities.length).toBeGreaterThan(2)
  })
})
