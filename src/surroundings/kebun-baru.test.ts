import { describe, expect, it } from 'vitest'
import site from './sites/kebun-baru-breeze.json'
import { fromLatLng, obstacles, unitPos, view, type Osm, type Site } from './analysis'

const S = site as unknown as Site

describe('Kebun Baru Breeze', () => {
  it('has every unit for sale in both blocks (not the rental flats)', () => {
    expect(S.blocks.map((b) => [b.id, b.storeys, b.units.length])).toEqual([['247A', 30, 9], ['248A', 30, 11]])
    expect(S.blocks[1].units.map((u) => u.no)).not.toContain('225')
    // 241 has no 2nd-storey flat (a void there).
    expect(unitPos(S, { block: '248A', unit: '241', storey: 2 })!.storey).toBe(3)
  })
  it('faces the units the way the brochure shows their windows (blocks are turned about 16° from north)', () => {
    const f = (b: string, u: string) => unitPos(S, { block: b, unit: u, storey: 10 })!.facing
    expect(f('247A', '215')).toBe('north'); expect(f('247A', '213')).toBe('south')
    expect(f('248A', '219')).toBe('west'); expect(f('248A', '231')).toBe('east'); expect(f('248A', '229')).toBe('south')
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
