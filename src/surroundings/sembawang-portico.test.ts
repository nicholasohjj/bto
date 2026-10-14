import { describe, expect, it } from 'vitest'
import site from './sites/sembawang-portico.json'
import { unitPos, type Site } from './analysis'

const S = site as unknown as Site

describe('Sembawang Portico', () => {
  it('has every unit stack for sale in the three blocks, with the storeys from the unit distribution', () => {
    expect(S.blocks.map((b) => [b.id, b.storeys, b.units.length])).toEqual([['433A', 26, 10], ['433B', 26, 13], ['434A', 26, 12]])
    const count = (type: string) => S.blocks.reduce((t, b) => t + b.units.filter((u) => u.type === type).reduce((n, u) => n + (u.to ?? b.storeys) - (u.from ?? 2) + 1, 0), 0)
    // The brochure's table: 50 Type 1 and 150 Type 2 2-room Flexi, 100 3-room, 300 4-room, 275 5-room (875; units 405 and 407 are rental).
    expect(['2R-1', '2R-2', '3R', '4R', '5R'].map(count)).toEqual([50, 150, 100, 300, 275])
    expect(S.blocks[0].units.some((u) => u.no === '405' || u.no === '407')).toBe(false)
  })
  it('faces units the way the brochure shows their windows', () => {
    const f = (b: string, u: string) => unitPos(S, { block: b, unit: u, storey: 10 })!.facing
    expect(f('433A', '401')).toBe('north'); expect(f('433A', '413')).toBe('south')
    expect(f('433B', '437')).toBe('east'); expect(f('434A', '469')).toBe('south-west')
  })
  it('lines up with OpenStreetMap', () => {
    // The blocks were fitted to OpenStreetMap's outlines; the pavilion (Block 434) wasn't, and lands where the site plan draws it.
    const pav = S.buildings.find((b) => /^Block 434/.test(b.name))!.poly!
    const c = [pav.reduce((s, p) => s + p[0], 0) / pav.length, pav.reduce((s, p) => s + p[1], 0) / pav.length]
    expect(Math.hypot(c[0] - 239.6, c[1] - 163.3)).toBeLessThan(4)
  })
})
