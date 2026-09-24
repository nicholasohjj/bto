import { describe, expect, it } from 'vitest'
import { runScenario, simulateCore } from '../index'
import { buildSchedule } from '../payments'
import { resolvePolicy } from '../policyOverrides'
import { salaryAt } from '../cpf'
import { newScenario } from '../../state/defaults'
import type { Scenario } from '../types'

function students(dia = true): Scenario {
  const s = newScenario('dia', '2026-01')
  s.flat.price = 400000
  s.flat.dates = { application: '2026-02', booking: '2026-06', afl: '2026-12', keys: '2030-06' }
  s.flat.grants = [{ id: 'ehg', name: 'Enhanced CPF Housing Grant', amount: 60000, splitA: 50, when: { milestone: 'keys' } }]
  s.costs = s.costs.filter((c) => c.kind === 'optionFee')
  s.financing.deferredIncomeAssessment = dia
  for (const p of s.partners) {
    p.birthYearMonth = '2003-01'
    p.cash = 15000
    p.cpfOA = 0
    p.grossMonthly = 4000
    p.annualRaisePct = 0
    p.bonuses = [{ months: 1, paidInMonth: 12 }]
    p.workStartMonth = '2027-07'
    p.preWorkMonthlySavings = 300
  }
  return s
}

describe('work start month', () => {
  it('pays no salary before starting work, starting pay after', () => {
    const p = students().partners[0]
    expect(salaryAt(p, '2026-01', '2027-06')).toBe(0)
    expect(salaryAt(p, '2026-01', '2027-07')).toBe(4000)
  })
  it('adds no CPF or bonus before work starts, pre-work savings only', () => {
    const core = simulateCore(students())
    const dec2026 = core.months.find((m) => m.ym === '2026-12')!
    expect(dec2026.oaContribution.A).toBe(0)
    const m1 = core.months[1]
    expect(m1.combined.cash - core.months[0].combined.cash).toBeCloseTo(600, 6)
    const aug2027 = core.months.find((m) => m.ym === '2027-07')!
    expect(aug2027.oaContribution.A).toBeGreaterThan(0)
  })
})

describe('Deferred Income Assessment', () => {
  it('uses 2.5% at AFL regardless of the staggered toggle', () => {
    const s = students()
    s.financing.staggered = false
    const { obligations } = buildSchedule(s, resolvePolicy())
    expect(obligations.find((o) => o.id === 'dp-afl')!.amount).toBe(400000 * 0.025 - 2000)
    expect(obligations.find((o) => o.id === 'dp-keys')!.amount).toBe(400000 * 0.225)
  })
  it('assesses the loan on income 3 months before keys', () => {
    const r = runScenario(students())
    expect(r.loan.assessedAt).toBe('2030-03')
    expect(r.loan.grossIncomeAtAssessment).toBe(8000)
    expect(r.warnings.some((w) => w.id === 'no-income')).toBe(false)
    expect(r.warnings.some((w) => w.id === 'dia-info')).toBe(true)
  })
  it('without DIA, students have no income at AFL and are flagged', () => {
    const r = runScenario(students(false))
    expect(r.loan.assessedAt).toBe('2026-12')
    expect(r.warnings.find((w) => w.id === 'no-income')!.fixes.join(' ')).toMatch(/Deferred Income Assessment/)
    expect(r.warnings.some((w) => w.id === 'msr')).toBe(false)
  })
  it('flags the age limit when both are over 30 at application', () => {
    const s = students()
    for (const p of s.partners) p.birthYearMonth = '1990-01'
    expect(runScenario(s).warnings.some((w) => w.id === 'dia-age')).toBe(true)
  })
  it('warns if a grant is set to arrive before keys', () => {
    const s = students()
    s.flat.grants[0].when = { milestone: 'afl' }
    expect(runScenario(s).warnings.some((w) => w.id === 'dia-grant-timing')).toBe(true)
  })
  it('is overridable via policy paths', () => {
    const s = students()
    s.policyOverrides = { 'dia.assessmentMonthsBeforeKeys': 6, 'downpayment.hdb.dia.afl.pct': 0.05 }
    const r = runScenario(s)
    expect(r.loan.assessedAt).toBe('2029-12')
    expect(r.events.find((e) => e.itemId === 'dp-afl')!.amount).toBe(18000)
  })
})
