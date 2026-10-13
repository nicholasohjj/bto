import { describe, expect, it } from 'vitest'
import { mergeRenoStages, splitRenoIntoStages, spreadTotal } from '../../state/reno'
import { seedScenario } from '../../state/defaults'
import { runScenario } from '../index'

const renoTotal = (s: ReturnType<typeof seedScenario>) => s.costs.filter((c) => c.kind === 'reno').reduce((t, c) => t + c.amount, 0)

describe('Renovation stages', () => {
  it('splits into three payments with the same total, and merges back', () => {
    const s = seedScenario()
    s.costs = s.costs.map((c) => (c.kind === 'reno' ? { ...c, amount: 40001 } : c))
    const split = { ...s, costs: splitRenoIntoStages(s.costs) }
    const stages = split.costs.filter((c) => c.kind === 'reno')
    expect(stages).toHaveLength(3)
    expect(renoTotal(split)).toBe(40001)
    expect(stages.map((c) => 'offsetMonths' in c.when && c.when.offsetMonths)).toEqual([0, 1, 2])
    expect(() => runScenario(split)).not.toThrow()
    const merged = { ...split, costs: mergeRenoStages(split.costs) }
    expect(merged.costs.filter((c) => c.kind === 'reno')).toHaveLength(1)
    expect(renoTotal(merged)).toBe(40001)
    expect(merged.costs.length).toBe(s.costs.length)
  })
  it('spreads a new total keeping each share', () => {
    const items = splitRenoIntoStages(seedScenario().costs).filter((c) => c.kind === 'reno')
    items[0].amount = 10000; items[1].amount = 20000; items[2].amount = 10000
    spreadTotal(items, 50000)
    expect(items.map((c) => c.amount)).toEqual([12500, 25000, 12500])
    items.forEach((c) => { c.amount = 0 })
    spreadTotal(items, 9000)
    expect(items.map((c) => c.amount)).toEqual([9000, 0, 0])
  })
})
