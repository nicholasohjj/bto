import { describe, expect, it } from 'vitest'
import site from './sites/kebun-baru-ridge.json'
import { fromLatLng, unitPos, type Site } from './analysis'

const S = site as unknown as Site

describe('Kebun Baru Ridge', () => {
  it('has every unit stack in the three blocks, with the storeys from the unit distribution', () => {
    expect(S.blocks.map((b) => [b.id, b.storeys, b.units.length])).toEqual([['183A', 21, 6], ['184A', 21, 11], ['184B', 20, 9]])
    const flats = S.blocks.reduce((t, b) => t + b.units.reduce((n, u) => n + b.storeys - (u.from ?? 2) + 1, 0), 0)
    expect(flats).toBe(485)   // the brochure's total
  })
  it('faces units the way the brochure shows their windows (the blocks are turned about 30° and 15° from north)', () => {
    const f = (b: string, u: string) => unitPos(S, { block: b, unit: u, storey: 10 })!.facing
    expect(f('183A', '108')).toBe('north-west'); expect(f('183A', '104')).toBe('south-east')
    expect(f('184A', '112')).toBe('north'); expect(f('184A', '118')).toBe('south')
    expect(f('184A', '132')).toBe('north-east'); expect(f('184A', '126')).toBe('south-west')
  })
  it('lines up with OpenStreetMap', () => {
    // The precinct pavilion (Block 184) as drawn on the site plan, against OpenStreetMap's outline of it.
    const pav = S.buildings.find((b) => /184/.test(b.name))!.poly!
    const c = [pav.reduce((s, p) => s + p[0], 0) / pav.length, pav.reduce((s, p) => s + p[1], 0) / pav.length]
    expect(Math.hypot(c[0] - 104.8, c[1] - 107.5)).toBeLessThan(5)
    const centre = fromLatLng(S, 1.376549, 103.83558)
    expect(Math.hypot(centre[0] - 112.2, centre[1] - 74.5)).toBeLessThan(1)
  })
})
