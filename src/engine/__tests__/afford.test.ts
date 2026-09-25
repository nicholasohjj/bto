import { describe, expect, it } from 'vitest'
import { affordablePrice, checkPrice } from '../afford'
import { resolvePolicy } from '../policyOverrides'
import { newScenario, seedScenario } from '../../state/defaults'
import type { Scenario } from '../types'

function base(overrides: (s: Scenario) => void = () => {}): Scenario {
  const s = newScenario('test', '2026-01')
  s.flat.price = 400000
  s.flat.dates = { application: '2026-02', booking: '2026-06', afl: '2026-12', keys: '2029-12' }
  s.costs = s.costs.filter((c) => ['optionFee', 'bsd'].includes(c.kind))
  for (const p of s.partners) {
    p.annualRaisePct = 0
    p.bonuses = []
    p.cash = 30000
    p.cpfOA = 30000
    p.monthlyCashSavings = 1000
    p.grossMonthly = 5000
  }
  s.policyOverrides = { 'cpf.oaInterestRate': 0 }
  overrides(s)
  return s
}

describe('affordable price', () => {
  it('finds the boundary: max passes, max + step fails', () => {
    const s = base()
    const policy = resolvePolicy(s.policyOverrides)
    const r = affordablePrice(s, {}, policy)
    expect(r.maxPrice).toBeDefined()
    expect(r.aboveMax).toBe(false)
    expect(checkPrice(s, r.maxPrice!, policy).ok).toBe(true)
    const next = checkPrice(s, r.maxPrice! + 1000, policy)
    expect(next.ok).toBe(false)
    expect(next.limit).toBe(r.limitedBy)
  })

  it('is capped by MSR when there is plenty of cash', () => {
    const s = base((d) => { for (const p of d.partners) { p.cash = 1_000_000; p.cpfOA = 300_000 } })
    const r = affordablePrice(s)
    expect(r.limitedBy).toBe('msr')
  })

  it('is capped by cash when income is high but savings are thin', () => {
    const s = base((d) => { for (const p of d.partners) { p.cash = 5000; p.cpfOA = 0; p.monthlyCashSavings = 0; p.grossMonthly = 7000 } })
    const r = affordablePrice(s)
    expect(r.maxPrice).toBeDefined()
    expect(r.limitedBy).toBe('cash')
  })

  it('reports why when even the minimum price fails', () => {
    const s = base((d) => {
      for (const p of d.partners) { p.cash = 0; p.monthlyCashSavings = -2000 }
    })
    const r = affordablePrice(s)
    expect(r.maxPrice).toBeUndefined()
    expect(r.failsAtMin?.limit).toBe('cash')
  })

  it('a shortfall that has nothing to do with the price fails at every price', () => {
    // The main example runs short after keys (renovation), whatever the flat costs.
    const r = affordablePrice(seedScenario())
    expect(r.maxPrice).toBeUndefined()
    expect(r.failsAtMin?.limit).toBe('cash')
    expect(r.failsAtMin?.firstShortYm).toBeDefined()
  })
})
