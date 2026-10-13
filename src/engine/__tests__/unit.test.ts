import { describe, expect, it } from 'vitest'
import { parseChosenUnit, studioUnitUrl, surroundingsUnitUrl, unitFlatType, unitLabel, unitLayout } from '../../state/unit'
import { BROCHURE_LAYOUTS } from '../../state/studio'
import berlayar from '../../surroundings/sites/berlayar-rise.json'

const u = { site: 'berlayar-rise', block: '200B', unit: '129', storey: 7, type: '2R-2', facing: 'north', at: 1 }

describe('the unit picked in Surroundings', () => {
  it('reads it back and rejects bad values', () => {
    expect(parseChosenUnit(JSON.stringify(u))).toEqual(u)
    expect(parseChosenUnit(null)).toBeNull()
    expect(parseChosenUnit('nope')).toBeNull()
    expect(parseChosenUnit(JSON.stringify({ ...u, storey: 0 }))).toBeNull()
    expect(parseChosenUnit(JSON.stringify({ ...u, block: '' }))).toBeNull()
    expect(parseChosenUnit(JSON.stringify({ ...u, facing: 3 }))?.facing).toBe('')
  })
  it('labels it and maps it to the money plan and Flat Studio', () => {
    expect(unitLabel(u)).toBe('Block 200B #07-129')
    expect(unitFlatType(u)).toBe('2R')
    expect(unitFlatType({ type: '4R' })).toBe('4R')
    expect(unitLayout(u)?.key).toBe('berlayar-rise/2R-2')
    const q = new URLSearchParams(studioUnitUrl(u)!.split('?')[1])
    expect(q.get('layout')).toBe('berlayar-rise/2R-2')
    expect(q.get('flat')).toBe('3')
    expect(new URLSearchParams(studioUnitUrl({ ...u, type: '4R' })!.split('?')[1]).get('flat')).toBe('4')
    expect(studioUnitUrl({ site: 'elsewhere', type: '3R' })).toBeNull()
    expect(surroundingsUnitUrl(u)).toBe('/surroundings/?site=berlayar-rise&block=200B&unit=129&storey=7')
  })
  it('has a Flat Studio layout for every unit type on the Berlayar Rise site plan', () => {
    const types = new Set(berlayar.blocks.flatMap((b) => b.units.map((x) => x.type)))
    for (const t of types) expect(unitLayout({ site: 'berlayar-rise', type: t }), t).toBeTruthy()
    expect(BROCHURE_LAYOUTS['berlayar-rise'].length).toBeGreaterThanOrEqual(types.size)
  })
})
