import { describe, expect, it } from 'vitest'
import { runScenario, simulateCore } from '../index'
import { buildSchedule } from '../payments'
import { resolvePolicy } from '../policyOverrides'
import { projectAccruedInterest } from '../accruedInterest'
import { compareRows } from '../compare'
import { newScenario, seedScenario } from '../../state/defaults'
import type { Scenario } from '../types'

/** A controlled scenario: no interest, no raises, no bonuses, only the flat. */
function base(overrides: (s: Scenario) => void = () => {}): Scenario {
  const s = newScenario('test', '2026-01')
  s.flat.price = 480000
  s.flat.dates = { application: '2026-02', booking: '2026-06', afl: '2026-12', keys: '2029-12' }
  s.costs = s.costs.filter((c) => ['optionFee', 'bsd'].includes(c.kind))
  for (const p of s.partners) {
    p.annualRaisePct = 0
    p.bonuses = []
    p.cash = 50000
    p.cpfOA = 40000
    p.monthlyCashSavings = 1000
    p.grossMonthly = 5000
  }
  s.policyOverrides = { 'cpf.oaInterestRate': 0 }
  overrides(s)
  return s
}

describe('payment schedule', () => {
  it('HDB loan, standard: 10% at AFL (less option fee), rest at keys', () => {
    const s = base()
    const { obligations, loan } = buildSchedule(s, resolvePolicy())
    const afl = obligations.find((o) => o.id === 'dp-afl')!
    const keys = obligations.find((o) => o.id === 'dp-keys')!
    expect(afl.amount).toBe(46000)
    expect(afl.minCash).toBe(0)
    expect(keys.amount).toBe(72000)
    expect(loan.loanAmount).toBe(360000)
  })
  it('bank loan, standard: 20% at AFL with 5% cash minimum', () => {
    const s = base((s) => { s.financing.loanType = 'bank' })
    const { obligations } = buildSchedule(s, resolvePolicy())
    const afl = obligations.find((o) => o.id === 'dp-afl')!
    const keys = obligations.find((o) => o.id === 'dp-keys')!
    expect(afl.amount).toBe(94000)
    expect(afl.minCash).toBe(22000) // 5% of 480k less $2,000 option fee (paid in cash)
    expect(keys.amount).toBe(24000)
    expect(keys.minCash).toBe(0)
  })
  // Figures from hdb.gov.sg "Staggered Downpayment Scheme" (Sep 2026).
  it('HDB loan, staggered: 5% at AFL, 20% at keys', () => {
    const s = base((s) => { s.financing.staggered = true })
    const { obligations } = buildSchedule(s, resolvePolicy())
    expect(obligations.find((o) => o.id === 'dp-afl')!.amount).toBe(22000) // 5% of 480k less $2,000 option fee
    expect(obligations.find((o) => o.id === 'dp-keys')!.amount).toBe(96000)
  })
  it('bank loan, staggered: 10% at AFL (5% cash), 15% at keys', () => {
    const s = base((s) => { s.financing.loanType = 'bank'; s.financing.staggered = true })
    const { obligations } = buildSchedule(s, resolvePolicy())
    expect(obligations.find((o) => o.id === 'dp-afl')!.amount).toBe(46000)
    expect(obligations.find((o) => o.id === 'dp-afl')!.minCash).toBe(22000)
    expect(obligations.find((o) => o.id === 'dp-keys')!.amount).toBe(72000)
    expect(obligations.find((o) => o.id === 'dp-keys')!.minCash).toBe(0)
  })
  it('bank loan at 55% LTV, staggered: 10% cash only at AFL, 35% at keys', () => {
    const s = base((s) => { s.financing.loanType = 'bank'; s.financing.staggered = true; s.financing.tenureYears = 30 })
    const { obligations } = buildSchedule(s, resolvePolicy())
    expect(obligations.find((o) => o.id === 'dp-afl')!.amount).toBe(46000)
    expect(obligations.find((o) => o.id === 'dp-afl')!.minCash).toBe(46000)
    expect(obligations.find((o) => o.id === 'dp-keys')!.amount).toBe(168000)
  })
  it('bank loan at 55% LTV with DIA: 2.5% cash at AFL, 42.5% at keys with 7.5% cash', () => {
    const s = base((s) => { s.financing.loanType = 'bank'; s.financing.deferredIncomeAssessment = true; s.financing.tenureYears = 30 })
    const { obligations } = buildSchedule(s, resolvePolicy())
    expect(obligations.find((o) => o.id === 'dp-afl')!.amount).toBe(10000)
    expect(obligations.find((o) => o.id === 'dp-afl')!.minCash).toBe(10000)
    expect(obligations.find((o) => o.id === 'dp-keys')!.amount).toBe(204000)
    expect(obligations.find((o) => o.id === 'dp-keys')!.minCash).toBe(36000)
  })
  it('grants pay tranches first and any excess reduces the loan', () => {
    const s = base((s) => {
      s.financing.staggered = true
      s.flat.grants = [{ id: 'g', name: 'EHG', amount: 150000, splitA: 50, when: { milestone: 'afl' } }]
    })
    const { obligations, loan } = buildSchedule(s, resolvePolicy())
    expect(obligations.find((o) => o.id === 'dp-afl')!.grantFunded).toBe(22000)
    const keys = obligations.find((o) => o.id === 'dp-keys')!
    expect(keys.grantFunded).toBe(128000) // everything left after AFL; $32,000 more than the tranche reduces the loan
    expect(loan.loanAmount).toBe(360000 - 32000)
  })
  it('lower LTV adds to the keys tranche', () => {
    const s = base((s) => { s.financing.ltv = 0.6 })
    const { obligations, loan } = buildSchedule(s, resolvePolicy())
    expect(obligations.find((o) => o.id === 'dp-keys')!.amount).toBe(480000 * 0.4 - 48000)
    expect(loan.loanAmount).toBe(288000)
  })
})

describe('simulation', () => {
  it('conserves money: balances = start + inflows − payments', () => {
    const s = base()
    const core = simulateCore(s)
    const last = core.months[core.months.length - 1]
    const inflowCash = 2 * 1000 * (core.months.length - 1)
    const inflowOa = core.months.slice(0, -1).reduce((a, m) => a + m.oaContribution.A + m.oaContribution.B, 0)
    const paidCash = core.events.reduce((a, e) => a + e.fromCash, 0)
    const paidCpf = core.events.reduce((a, e) => a + e.fromCpf, 0)
    expect(last.combined.cash).toBeCloseTo(100000 + inflowCash - paidCash, 4)
    expect(last.combined.oa).toBeCloseTo(80000 + inflowOa - paidCpf, 4)
  })
  it('credits CPF contributions one month later', () => {
    const core = simulateCore(base())
    expect(core.months[0].combined.oa).toBe(80000)
    expect(core.months[1].combined.oa).toBeCloseTo(80000 + 2 * 5000 * 0.37 * 0.6217, 6)
  })
  it('pays the option fee in cash and downpayment from CPF at 100% slider', () => {
    const core = simulateCore(base())
    const opt = core.events.find((e) => e.itemId === 'option-fee')!
    expect(opt.fromCash).toBe(2000)
    expect(opt.fromCpf).toBe(0)
    const afl = core.events.find((e) => e.itemId === 'dp-afl')!
    expect(afl.fromCpf).toBe(46000)
    expect(afl.fromCash).toBe(0)
  })
  it('pays CPF-allowed items in cash when slider is 0 (bank loan, no OA rule)', () => {
    const core = simulateCore(base((s) => { s.financing.loanType = 'bank'; s.financing.cpfUsagePct = 0 }))
    const afl = core.events.find((e) => e.itemId === 'dp-afl')!
    expect(afl.fromCpf).toBe(0)
    expect(afl.fromCash).toBe(94000)
  })
  it('HDB loan forces OA above $20k each to be used for downpayment', () => {
    const core = simulateCore(base((s) => { s.financing.cpfUsagePct = 0 }))
    const afl = core.events.find((e) => e.itemId === 'dp-afl')!
    expect(afl.fromCpf).toBeGreaterThan(0)
    expect(core.hdbRuleBumps.length).toBeGreaterThan(0)
  })
  it('falls back to cash when OA is short, and records it', () => {
    const core = simulateCore(base((s) => { for (const p of s.partners) p.cpfOA = 5000; s.financing.loanType = 'bank' }))
    const afl = core.events.find((e) => e.itemId === 'dp-afl')!
    expect(afl.cpfFallbackToCash).toBeGreaterThan(0)
    expect(afl.fromCpf + afl.fromCash).toBeCloseTo(94000, 4)
  })
  it('starts the mortgage the month after keys, from CPF first', () => {
    const core = simulateCore(base())
    const mort = core.events.filter((e) => e.kind === 'mortgage')
    expect(mort[0].ym).toBe('2030-01')
    expect(mort).toHaveLength(12)
    expect(mort[0].amount).toBeCloseTo(1633.2, 0)
    expect(mort[0].fromCpf).toBeCloseTo(mort[0].amount, 4)
  })
  it('stops rent at key collection', () => {
    const core = simulateCore(base((s) => { s.interim = { mode: 'rent', monthlyCost: 1500 } }))
    const rent = core.events.filter((e) => e.kind === 'rent')
    expect(rent[0].ym).toBe('2026-01')
    expect(rent[rent.length - 1].ym).toBe('2029-11')
  })
  it('treats negative amounts as cash inflows', () => {
    const core = simulateCore(base((s) => {
      s.costs.push({ id: 'hb', label: 'Hongbao', kind: 'custom', amount: -10000, when: { date: '2026-03' }, funding: 'cashOnly', payer: 'joint', auto: false })
    }))
    const m = core.months.find((m) => m.ym === '2026-03')!
    const prev = core.months.find((m) => m.ym === '2026-02')!
    expect(m.combined.cash - prev.combined.cash).toBeCloseTo(10000 + 2000, 4)
  })
  it('skips payments dated before the start month', () => {
    const core = simulateCore(base((s) => { s.flat.dates.booking = '2025-10' }))
    expect(core.skipped.map((o) => o.id)).toContain('option-fee')
  })
})

describe('warnings and fixes', () => {
  it('flags a cash shortfall and suggests delaying renovation', () => {
    const s = base((s) => {
      for (const p of s.partners) { p.cash = 5000; p.monthlyCashSavings = 300 }
      s.costs.push({ id: 'reno', label: 'Renovation', kind: 'reno', amount: 60000, when: { milestone: 'keys', offsetMonths: 1 }, funding: 'cashOnly', payer: 'joint', auto: false, delayable: true })
    })
    const r = runScenario(s)
    const cash = r.warnings.find((w) => w.id.startsWith('cash-'))!
    expect(cash.severity).toBe('error')
    expect(cash.fixes.some((f) => f.startsWith('Delay "Renovation" by'))).toBe(true)
    expect(cash.fixes.some((f) => f.startsWith('Save an extra'))).toBe(true)
  })
  it('suggests using more CPF when that fixes it', () => {
    const s = base((s) => {
      s.financing.loanType = 'bank'
      s.financing.cpfUsagePct = 0
      for (const p of s.partners) { p.cash = 20000; p.cpfOA = 60000 }
    })
    const r = runScenario(s)
    const cash = r.warnings.find((w) => w.id.startsWith('cash-'))!
    expect(cash.fixes[0]).toMatch(/more CPF/)
  })
  it('flags an MSR breach with a max loan', () => {
    const r = runScenario(base((s) => { for (const p of s.partners) p.grossMonthly = 2000 }))
    const msr = r.warnings.find((w) => w.id === 'msr')!
    expect(msr).toBeTruthy()
    expect(r.loan.msr).toBeGreaterThan(0.3)
    expect(r.loan.maxLoanUnderMsr).toBeLessThan(r.loan.loanAmount)
  })
  it('warns about resale-only grants', () => {
    const r = runScenario(base((s) => { s.flat.grants = [{ id: 'p', name: 'Proximity Housing Grant', amount: 30000, splitA: 50, when: { milestone: 'keys' } }] }))
    expect(r.warnings.some((w) => w.id === 'resale-grants')).toBe(true)
  })
})

describe('accrued interest', () => {
  it('computes monthly, compounds yearly', () => {
    const pts = projectAccruedInterest(
      {
        withdrawals: [{ ym: '2030-01', partner: 'A', amount: 100000 }],
        keys: '2030-01', simEnd: '2031-01', monthlyMortgageCpf: { A: 0, B: 0 }, loanEnd: '2030-01', rate: 0.025,
      },
      [1, 10],
    )
    expect(pts[0].accrued).toBeCloseTo(2500 + 102500 * 0.025 / 12, 2)
    // ~ 100k × (1.025^10 − 1) plus one month
    expect(pts[1].accrued).toBeGreaterThan(28000)
    expect(pts[1].accrued).toBeLessThan(28700)
    expect(pts[1].refundDue).toBeCloseTo(100000 + pts[1].accrued, 6)
  })
  it('projects future CPF mortgage payments into the principal', () => {
    const r = runScenario(base())
    const [y5, y10] = r.accrued
    expect(y10.principal).toBeGreaterThan(y5.principal)
    expect(y5.principal).toBeGreaterThan(120000)
  })
})

describe('seed scenario', () => {
  it('runs end to end and fills every output', () => {
    const r = runScenario(seedScenario())
    expect(r.months[0].ym).toBe('2026-09')
    expect(r.months[r.months.length - 1].ym).toBe('2031-09')
    expect(r.summary.monthlyMortgage).toBeGreaterThan(0)
    expect(r.accrued).toHaveLength(3)
    expect(compareRows([r, r])[0].values).toEqual([480000, 480000])
  })
})
