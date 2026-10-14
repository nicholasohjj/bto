import { describe, expect, it } from 'vitest'
import site from './sites/woodgrove-acres.json'
import { unitPos, type Site } from './analysis'

const S = site as unknown as Site

describe('Woodgrove Acres', () => {
  it('has every unit stack for sale in the four blocks, with the storeys from the unit distribution', () => {
    expect(S.blocks.map((b) => [b.id, b.storeys, b.units.length])).toEqual([['446A', 17, 9], ['446B', 17, 11], ['447A', 19, 9], ['447B', 18, 12]])
    const count = (type: string) => S.blocks.reduce((t, b) => t + b.units.filter((u) => u.type === type).reduce((n, u) => n + (u.to ?? b.storeys) - (u.from ?? 2) + 1, 0), 0)
    // The brochure's table: 31 Type 1 and 126 Type 2 2-room Flexi, 80 3-room, 162 4-room, 257 5-room (656).
    expect(['2R-1', '2R-2', '3R', '4R', '5R'].map(count)).toEqual([31, 126, 80, 162, 257])
    expect(S.buildings.some((b) => /448A.*rental/.test(b.name))).toBe(true)
  })
  it('steps Block 447B down: the stacks on its east side stop at the 15th storey', () => {
    const top = (u: string) => unitPos(S, { block: '447B', unit: u, storey: 99 })!.storey
    expect(top('719')).toBe(18); expect(top('735')).toBe(15)
  })
  it('faces units the way the brochure shows their windows (the blocks are turned about 27° from north)', () => {
    const f = (b: string, u: string) => unitPos(S, { block: b, unit: u, storey: 10 })!.facing
    expect(f('446A', '659')).toBe('north-west'); expect(f('446A', '651')).toBe('south-east')
    expect(f('447B', '735')).toBe('north-east')
  })
  it('lines up with OpenStreetMap', () => {
    // The blocks were fitted to OpenStreetMap's outlines; the pavilion (Block 446) wasn't, and lands where the site plan draws it.
    const pav = S.buildings.find((b) => /^Block 446:/.test(b.name))!.poly!
    const c = [pav.reduce((s, p) => s + p[0], 0) / pav.length, pav.reduce((s, p) => s + p[1], 0) / pav.length]
    expect(Math.hypot(c[0] - 163.9, c[1] - 174.3)).toBeLessThan(4)
  })
})
