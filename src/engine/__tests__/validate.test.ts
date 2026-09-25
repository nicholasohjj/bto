import { describe, expect, it } from 'vitest'
import { runScenario, simulateCore } from '../index'
import { affordablePrice } from '../afford'
import { scenarioProblem } from '../validate'
import { seedScenario } from '../../state/defaults'

describe('dates that are typos', () => {
  it('refuses a five-digit key-collection year quickly instead of simulating 10,000 years', () => {
    const s = seedScenario()
    s.flat.dates.keys = '12022-01'
    const t = performance.now()
    expect(() => runScenario(s)).toThrow(/Key collection date: the year 12022/)
    expect(() => simulateCore(s)).toThrow()
    expect(() => affordablePrice(s)).toThrow()
    expect(performance.now() - t).toBeLessThan(100)
  })

  it('names the field', () => {
    const s = seedScenario()
    s.partners[1].birthYearMonth = '12022-01'
    expect(scenarioProblem(s)).toMatch(/birth month: the year 12022/)
    const c = seedScenario()
    c.financing.loanChanges = [{ id: 'r', kind: 'rate', from: '99999-01', rate: 0.03 }]
    expect(scenarioProblem(c)).toMatch(/A date in this plan: the year 99999/)
  })

  it('refuses key collection far in the future', () => {
    const s = seedScenario()
    s.flat.dates.keys = '2150-01'
    expect(scenarioProblem(s)).toMatch(/more than 30 years away/)
  })

  it('accepts the example plans and ignores names that look like dates', () => {
    const s = seedScenario()
    s.name = '12022-01'
    expect(scenarioProblem(s)).toBeNull()
  })
})
