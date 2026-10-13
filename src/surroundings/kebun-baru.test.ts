import { describe, expect, it } from 'vitest'
import site from './sites/kebun-baru-breeze.json'
import { fromLatLng, obstacles, rayPoly, unitPos, view, type Osm, type Pt, type Site } from './analysis'
import { unitLayout } from '../state/unit'

const S = site as unknown as Site

const onEdge = (poly: Pt[], p: Pt) => Math.min(...poly.map((a, i) => {
  const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])
}))
const inside = (poly: Pt[], p: Pt) => rayPoly(p, [1, 0.0001], poly) < Infinity && poly.reduce((c, a, i) => {
  const b = poly[(i + 1) % poly.length]
  return (a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0] ? !c : c
}, false)

describe('Kebun Baru Breeze', () => {
  it('has every unit for sale in both blocks (not the rental flats)', () => {
    expect(S.blocks.map((b) => [b.id, b.storeys, b.units.length])).toEqual([['247A', 30, 9], ['248A', 30, 11]])
    expect(S.blocks[1].units.map((u) => u.no)).not.toContain('225')
  })
  it('puts each window on its block outline, facing out', () => {
    for (const b of S.blocks) for (const u of b.units) {
      expect(onEdge(b.footprint, u.win), `${b.id} ${u.no}`).toBeLessThan(0.05)
      expect(Math.hypot(...u.n)).toBeCloseTo(1, 2)
      expect(inside(b.footprint, [u.win[0] + u.n[0] * 2, u.win[1] + u.n[1] * 2]), `${b.id} ${u.no} faces out`).toBe(false)
      expect(inside(b.footprint, [u.win[0] - u.n[0] * 2, u.win[1] - u.n[1] * 2]), `${b.id} ${u.no} has the flat behind`).toBe(true)
    }
  })
  it('faces the units the way the brochure shows their windows (blocks are turned about 16° from north)', () => {
    const f = (b: string, u: string) => unitPos(S, { block: b, unit: u, storey: 10 })!.facing
    expect(f('247A', '215')).toBe('north'); expect(f('247A', '213')).toBe('south')
    expect(f('248A', '219')).toBe('west'); expect(f('248A', '231')).toBe('east'); expect(f('248A', '229')).toBe('south')
  })
  it('has a Flat Studio layout for every unit type', () => {
    for (const t of new Set(S.blocks.flatMap((b) => b.units.map((u) => u.type)))) expect(unitLayout({ site: S.id, type: t }), t).toBeTruthy()
  })
  it('lines up with OpenStreetMap', () => {
    // The precinct pavilion (Block 248) as drawn on the brochure's site plan, against OpenStreetMap's outline of it.
    const pav = S.buildings.find((b) => /248/.test(b.name))!.poly!
    const c = [pav.reduce((s, p) => s + p[0], 0) / pav.length, pav.reduce((s, p) => s + p[1], 0) / pav.length]
    expect(Math.hypot(c[0] - 51.7, c[1] - 121.7)).toBeLessThan(5)
    // The site anchor: the estate's centre is where OpenStreetMap has Kebun Baru Breeze.
    const centre = fromLatLng(S, 1.368224, 103.832336)
    expect(Math.hypot(centre[0] - 113.7, centre[1] - 106)).toBeLessThan(1)
  })
  it('sees more from a high floor than a low one', async () => {
    const osm = (await import('./sites/kebun-baru-breeze.osm.json')).default as unknown as Osm
    const obs = obstacles(S, 0, osm)
    const lo = view(unitPos(S, { block: '247A', unit: '213', storey: 2 })!, obs), hi = view(unitPos(S, { block: '247A', unit: '213', storey: 30 })!, obs)
    expect(hi.farPct).toBeGreaterThan(lo.farPct)
  })
})
