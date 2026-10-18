import { describe, expect, it } from 'vitest'
import berlayar from './sites/berlayar-rise.json'
import type { Site } from './analysis'
import { queueBands, siteUnits, unitKey, type QueueUnit } from './queue'

const S = berlayar as unknown as Site

describe('queue number', () => {
  it('counts every unit of a flat type, storey by storey', () => {
    const units = siteUnits(S, '4R')
    const stacks = S.blocks.flatMap((b) => b.units.filter((u) => u.type === '4R').map((u) => (u.to ?? b.storeys) - (u.from ?? 2) + 1))
    expect(units.length).toBe(stacks.reduce((a, b) => a + b, 0))
    // 2-room Flexi types 1 and 2 are one flat type.
    expect(siteUnits(S, '2R').length).toBeGreaterThan(0)
  })

  it('books higher floors first and west-facing ones later', () => {
    const units: QueueUnit[] = [
      { block: 'A', unit: '1', storey: 20, facing: 'north', score: 20 },
      { block: 'A', unit: '2', storey: 20, facing: 'west', score: 14 },
      { block: 'A', unit: '1', storey: 10, facing: 'north', score: 10 },
      { block: 'A', unit: '1', storey: 2, facing: 'north', score: 2 },
    ]
    const r = queueBands(units, 3, 1)
    expect(r.taken).toBe(2)
    expect(units.map((x) => r.band.get(unitKey(x)))).toEqual(['gone', 'gone', 'left', 'left'])
    // Three ahead: the third and fourth are near the line, so they might go.
    const r3 = queueBands(units, 4, 1)
    expect(units.map((x) => r3.band.get(unitKey(x)))).toEqual(['gone', 'gone', 'maybe', 'maybe'])
    expect(queueBands(units, 1, 1).band.get(unitKey(units[0]))).toBe('left')
    expect(queueBands(units, 99, 1).taken).toBe(4)
  })

  it('counts fewer units taken when some ahead don’t book', () => {
    const units = siteUnits(S, '4R')
    expect(queueBands(units, 101, 0.5).taken).toBe(50)
  })
})
