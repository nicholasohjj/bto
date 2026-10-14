import { describe, expect, it } from 'vitest'
import site from './sites/lakeview-cascadia.json'
import { fromLatLng, unitPos, type Site } from './analysis'

const S = site as unknown as Site

describe('Lakeview Cascadia', () => {
  it('has every unit stack in the five blocks, with the storeys from the unit distribution', () => {
    expect(S.blocks.map((b) => [b.id, b.storeys, b.units.length])).toEqual([['325A', 35, 8], ['326A', 40, 11], ['326B', 35, 10], ['327A', 18, 10], ['328A', 18, 8]])
    const count = (type: string) => S.blocks.reduce((t, b) => t + b.units.filter((u) => u.type === type).reduce((n, u) => n + (u.to ?? b.storeys) - (u.from ?? 2) + 1, 0), 0)
    // The brochure's table: 118 Type 1 and 358 Type 2 2-room Flexi, 745 4-room (1,221 for sale; the 50 rental flats are left out).
    expect([count('2R-1'), count('2R-2'), count('4R')]).toEqual([118, 358, 745])
  })
  it('steps down: the shorter stacks stop at their own top storey', () => {
    const top = (b: string, u: string) => unitPos(S, { block: b, unit: u, storey: 99 })!.storey
    expect(top('325A', '305')).toBe(24); expect(top('325A', '301')).toBe(35)
    expect(top('326A', '319')).toBe(24); expect(top('326A', '317')).toBe(40)
    // Rental flats take the lower storeys of these stacks.
    expect(unitPos(S, { block: '326A', unit: '331', storey: 2 })!.storey).toBe(19)
    expect(unitPos(S, { block: '327A', unit: '367', storey: 2 })!.storey).toBe(10)
  })
  it('faces units the way the brochure shows their windows (the blocks are turned about 30° from north)', () => {
    const f = (b: string, u: string) => unitPos(S, { block: b, unit: u, storey: 10 })!.facing
    expect(f('325A', '305')).toBe('north-west'); expect(f('325A', '313')).toBe('south-east')
    expect(f('326A', '327')).toBe('north-east'); expect(f('326A', '335')).toBe('south-west')
    expect(f('326A', '331')).toBe('south-east'); expect(f('328A', '385')).toBe('north-east')
  })
  it('lines up with OpenStreetMap', () => {
    // The petrol station's canopy in OpenStreetMap, against the middle of its plot on the site plan.
    const fuel = fromLatLng(S, 1.348857, 103.837812)
    expect(Math.hypot(fuel[0] - 328.0, fuel[1] - 141.0)).toBeLessThan(6)
  })
})
