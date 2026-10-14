import { describe, expect, it } from 'vitest'
import site from './sites/sembawang-brook.json'
import { fromLatLng, unitPos, type Site } from './analysis'

const S = site as unknown as Site

describe('Sembawang Brook', () => {
  it('has every unit stack for sale in the four blocks, with the storeys from the unit distribution', () => {
    expect(S.blocks.map((b) => [b.id, b.storeys, b.units.length])).toEqual([['437A', 30, 10], ['437B', 30, 9], ['439A', 30, 10], ['440A', 30, 11]])
    const count = (type: string) => S.blocks.reduce((t, b) => t + b.units.filter((u) => u.type === type).reduce((n, u) => n + (u.to ?? b.storeys) - (u.from ?? 2) + 1, 0), 0)
    // The brochure's table: 58 Type 1 and 203 Type 2 2-room Flexi, 87 3-room, 464 4-room, 319 5-room, 29 3Gen (1,160).
    expect(['2R-1', '2R-2', '3R', '4R', '5R', '3Gen'].map(count)).toEqual([58, 203, 87, 464, 319, 29])
    // Block 438A is all rental flats: a building in the model, not a block to pick from.
    expect(S.buildings.some((b) => /438A.*rental/.test(b.name))).toBe(true)
  })
  it('faces units the way the brochure shows their windows (the blocks are turned about 26° from north)', () => {
    const f = (b: string, u: string) => unitPos(S, { block: b, unit: u, storey: 10 })!.facing
    expect(f('437A', '104')).toBe('north-west'); expect(f('437A', '116')).toBe('south-east')
    expect(f('437B', '136')).toBe('south-east'); expect(f('440A', '178')).toBe('north-east')
  })
  it('lines up with OpenStreetMap', () => {
    // OpenStreetMap's outline of rental Block 438A (not fitted), against the middle of it on the site plan.
    const r = S.buildings.find((b) => /^Block 438A/.test(b.name))!.poly!
    const c = [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]
    expect(Math.hypot(c[0] - 205.3, c[1] - 91.3)).toBeLessThan(3)
    const centre = fromLatLng(S, S.geo.lat0, S.geo.lon0)
    expect(Math.hypot(centre[0] - S.geo.cx, centre[1] - S.geo.cy)).toBeLessThan(0.01)
  })
})
