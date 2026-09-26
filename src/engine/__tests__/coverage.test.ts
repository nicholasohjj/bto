import { describe, expect, it } from 'vitest'
import { DEFAULT_POLICY as P } from '../../config/policy'
import { runScenario, simulateCore } from '../index'
import { buildSchedule, maxLtvFor } from '../payments'
import { resolvePolicy } from '../policyOverrides'
import { ordinaryWageCpf, prYear, ratesFor, salaryAt } from '../cpf'
import { jobLossImpact, withJobLoss } from '../whatIf'
import { leaseFactor, typicalDates } from '../saleType'
import { monthsBetween } from '../dates'
import { assessEligibility, tierAmount } from '../eligibility'
import { buyersStampDuty } from '../stampDuty'
import { newScenario, upgradeCosts } from '../../state/defaults'
import type { Scenario } from '../types'

function base(fn: (s: Scenario) => void = () => {}): Scenario {
  const s = newScenario('t', '2026-01')
  s.flat.price = 480000
  s.flat.dates = { application: '2026-02', booking: '2026-06', afl: '2026-12', keys: '2029-12' }
  s.costs = s.costs.filter((c) => ['optionFee', 'bsd'].includes(c.kind))
  for (const p of s.partners) {
    Object.assign(p, { annualRaisePct: 0, bonuses: [], cash: 60000, cpfOA: 60000, monthlyCashSavings: 1000, grossMonthly: 4000, birthYearMonth: '1997-01' })
  }
  s.policyOverrides = { 'cpf.oaInterestRate': 0 }
  fn(s)
  return s
}
const policy = resolvePolicy()

describe('CPF: low wages, PRs, self-employed', () => {
  it('applies the low-wage rules (≤ $750)', () => {
    expect(ordinaryWageCpf(40, 30 * 12, P).total).toBe(0)
    expect(ordinaryWageCpf(400, 30 * 12, P)).toMatchObject({ total: 68, employee: 0 })
    const mid = ordinaryWageCpf(600, 30 * 12, P)
    expect(mid.employee).toBeCloseTo(60, 6) // 0.6 × (600 − 500)
    expect(mid.total).toBeCloseTo(102 + 60, 6)
    expect(ordinaryWageCpf(750, 30 * 12, P).total).toBeCloseTo(750 * 0.37, 6) // continuous at $750
  })
  it('uses graduated rates in the first two years of PR', () => {
    const p = { ...base().partners[0], citizenship: 'SPR' as const, prSinceMonth: '2026-01' }
    expect(prYear(p, '2026-06')).toBe(1)
    expect(prYear(p, '2027-01')).toBe(2)
    expect(prYear(p, '2028-01')).toBe(3)
    expect(ordinaryWageCpf(5000, 30 * 12, P, ratesFor(30 * 12, P, 1)).total).toBeCloseTo(450, 6)
    expect(ordinaryWageCpf(5000, 30 * 12, P, ratesFor(30 * 12, P, 2)).total).toBeCloseTo(1200, 6)
    expect(ordinaryWageCpf(5000, 30 * 12, P, ratesFor(30 * 12, P, 3)).total).toBeCloseTo(1850, 6)
  })
  it('gives self-employed partners no employer CPF; top-ups come from cash', () => {
    const core = simulateCore(base((s) => { s.partners[0].employment = 'selfEmployed'; s.partners[0].voluntaryOaMonthly = 300 }))
    expect(core.months[1].oaContribution.A).toBe(0)
    expect(core.months[1].oaContribution.B).toBeCloseTo(4000 * 0.37 * 0.6217, 6)
    const topUp = core.events.find((e) => e.kind === 'voluntaryCpf')!
    expect(topUp.fromCash).toBe(300)
    expect(topUp.fromCpf).toBeCloseTo(-300 * 0.6217, 2)
  })
})

describe('eligibility and grants', () => {
  it('reads the EHG tiers', () => {
    expect(tierAmount(1500, P.eligibility.ehgFamilies)).toBe(120000)
    expect(tierAmount(8400, P.eligibility.ehgFamilies)).toBe(10000)
    expect(tierAmount(9001, P.eligibility.ehgFamilies)).toBe(0)
  })
  it('computes EHG from average income, and uses it as the grant', () => {
    const s = base((s) => { s.flat.grants = [{ id: 'g', name: 'Enhanced CPF Housing Grant', amount: 0, auto: 'EHG', splitA: 50, when: { milestone: 'keys' } }] })
    const el = assessEligibility(s, policy)
    expect(el.avgIncome).toBe(8000)
    expect(el.ehg).toBe(20000)
    expect(buildSchedule(s, policy).loan.grantsTotal).toBe(20000)
  })
  it('first-timer + second-timer couples use the singles table on half income', () => {
    const el = assessEligibility(base((s) => { s.flat.household = 'firstAndSecond'; for (const p of s.partners) p.grossMonthly = 3000 }), policy)
    expect(el.ehg).toBe(25000) // half of 6,000 = 3,000
  })
  it('second-timers get no EHG; Step-Up if the conditions fit', () => {
    const s = base((s) => {
      s.flat.household = 'secondTimers'; s.flat.fromRentalOr2Room = true; s.flat.type = '3R'
      for (const p of s.partners) p.grossMonthly = 3000
    })
    const el = assessEligibility(s, policy)
    expect(el.ehg).toBe(0)
    expect(el.stepUp).toBe(15000)
  })
  it('needs 12 months of work before the income assessment', () => {
    const el = assessEligibility(base((s) => { for (const p of s.partners) p.workStartMonth = '2025-06' }), policy)
    expect(el.employmentOk).toBe(false)
    expect(el.ehg).toBe(0)
  })
  it('flags income above the ceiling', () => {
    const r = runScenario(base((s) => { for (const p of s.partners) p.grossMonthly = 9000 }))
    expect(r.warnings.some((w) => w.id === 'income-ceiling')).toBe(true)
    const r2 = runScenario(base((s) => { s.flat.type = '2R'; for (const p of s.partners) p.grossMonthly = 4000 }))
    expect(r2.warnings.some((w) => w.id === 'income-ceiling')).toBe(true) // $8,000 > $7,000
  })
  it('adds the SC/SPR premium to the price; two PRs are not eligible', () => {
    const s = base((s) => { s.partners[1].citizenship = 'SPR' })
    const { loan, obligations } = buildSchedule(s, policy)
    expect(loan.effectivePrice).toBe(490000)
    expect(obligations.find((o) => o.id === 'bsd')!.amount).toBe(buyersStampDuty(490000, policy))
    const both = runScenario(base((s) => { for (const p of s.partners) p.citizenship = 'SPR' }))
    expect(both.warnings.some((w) => w.id === 'both-spr')).toBe(true)
  })
  it('warns when a typed-in EHG is higher than income suggests', () => {
    const r = runScenario(base((s) => { s.flat.grants = [{ id: 'g', name: 'Enhanced CPF Housing Grant', amount: 80000, splitA: 50, when: { milestone: 'keys' } }] }))
    expect(r.warnings.some((w) => w.id === 'ehg-high-g')).toBe(true)
  })
})

describe('loan rules', () => {
  it('bank loan LTV drops to 55% for tenure over 25 years', () => {
    const s = base((s) => { s.financing.loanType = 'bank'; s.financing.tenureYears = 30 })
    expect(maxLtvFor(s, policy)).toMatchObject({ max: 0.55, reduced: true })
    const { loan, obligations } = buildSchedule(s, policy)
    expect(loan.loanAmount).toBe(480000 * 0.55)
    const keys = obligations.find((o) => o.id === 'dp-keys')!
    const afl = obligations.find((o) => o.id === 'dp-afl')!
    expect(afl.minCash + keys.minCash + 2000).toBeCloseTo(48000, 6) // 10% cash incl. option fee
    expect(runScenario(s).warnings.find((w) => w.id === 'ltv')!.severity).toBe('error')
  })
  it('bank loan LTV drops when the loan runs past 65', () => {
    const s = base((s) => { s.financing.loanType = 'bank'; s.financing.tenureYears = 25; for (const p of s.partners) p.birthYearMonth = '1985-01' })
    expect(maxLtvFor(s, policy).reduced).toBe(true)
  })
  it('caps an HDB loan at 65 minus the average age, and says so', () => {
    // Born Jan 1985, both about 41 at application: 65 − 41 = 24 years, under the 25 you asked for.
    const r = runScenario(base((s) => { for (const p of s.partners) p.birthYearMonth = '1985-01' }))
    expect(r.loan.tenureYears).toBe(24)
    expect(r.warnings.find((w) => w.id === 'hdb-tenure')!.title).toMatch(/at most, not 25/)
  })
  it('uses the plain average age for the HDB cap, not the income-weighted one', () => {
    // Ages ~21 and ~61 average 41 → 24 years, whoever earns more.
    const r = runScenario(base((s) => {
      s.partners[0].birthYearMonth = '2005-01'; s.partners[0].grossMonthly = 20000
      s.partners[1].birthYearMonth = '1965-01'; s.partners[1].grossMonthly = 1000
    }))
    expect(r.loan.tenureYears).toBe(24)
  })
  it('changes the instalment when the rate changes after lock-in', () => {
    const core = simulateCore(base((s) => { s.financing.loanType = 'bank'; s.financing.rate = 0.02; s.financing.rateAfter = { afterYears: 0.5, rate: 0.04 } }))
    const m = core.events.filter((e) => e.kind === 'mortgage')
    expect(m[6].amount).toBeGreaterThan(m[5].amount + 100)
    expect(m[7].amount).toBeCloseTo(m[6].amount, 1)
  })
})

describe('CPF limits and BSD with a bank loan', () => {
  it('pays BSD in cash first, then reimburses from CPF', () => {
    const core = simulateCore(base((s) => { s.financing.loanType = 'bank' }))
    const bsd = core.events.find((e) => e.itemId === 'bsd')!
    expect(bsd.fromCash).toBe(9000)
    const refund = core.events.find((e) => e.itemId === 'bsd-refund')!
    expect(refund.ym).toBe('2027-02')
    expect(refund.fromCpf).toBe(9000)
    expect(refund.fromCash).toBe(-9000)
  })
  it('caps CPF used for the flat at the Valuation Limit with a bank loan', () => {
    const s = base((s) => { s.financing.loanType = 'bank'; s.financing.tenureYears = 5; s.flat.price = 150000; for (const p of s.partners) p.cpfOA = 200000 })
    const r = runScenario(s)
    expect(r.cpfCapReachedYm).toBeDefined()
    expect(r.accrued[2].principal).toBeLessThanOrEqual(150000 + 1)
    const long = simulateCore(s, undefined, { monthsAfterKeys: 180 })
    const after = long.events.filter((e) => e.kind === 'mortgage' && e.ym > r.cpfCapReachedYm!)
    expect(after.every((e) => e.fromCpf < 0.01 && e.fromCash > 0)).toBe(true)
  })
  it('allows up to 120% once the BRS is set aside', () => {
    const s = base((s) => { s.financing.loanType = 'bank'; s.financing.brsSetAside = true })
    expect(buildSchedule(s, policy).loan.cpfCap).toBeCloseTo(480000 * 1.2, 6)
    expect(buildSchedule(base(), policy).loan.cpfCap).toBe(Infinity)
  })
})

describe('money over time', () => {
  it('adds interest on cash', () => {
    const plain = simulateCore(base())
    const withInt = simulateCore(base((s) => { s.assumptions = { cashInterestPct: 2.4, inflationPct: 0 } }))
    const i = plain.months.length - 1
    expect(withInt.months[i].combined.cash).toBeGreaterThan(plain.months[i].combined.cash + 1000)
    expect(withInt.months[1].combined.cash - plain.months[1].combined.cash).toBeCloseTo(120000 * 0.002, 6)
  })
  it('inflates your own future costs (not policy fees)', () => {
    const s = base((s) => {
      s.assumptions = { cashInterestPct: 0, inflationPct: 3 }
      s.costs.push({ id: 'reno', label: 'Reno', kind: 'reno', amount: 40000, auto: false, when: { date: '2028-01' }, funding: 'cashOnly', payer: 'joint' })
    })
    const { obligations } = buildSchedule(s, policy)
    expect(obligations.find((o) => o.id === 'reno')!.amount).toBeCloseTo(40000 * 1.03 ** 2, 1)
    expect(obligations.find((o) => o.id === 'bsd')!.amount).toBe(9000)
  })
  it('projects accrued interest from a full 15-year simulation', () => {
    const r = runScenario(base())
    expect(r.accrued.map((a) => a.yearsAfterKeys)).toEqual([5, 10, 15])
    expect(r.accrued[2].principal).toBeGreaterThan(r.accrued[1].principal)
  })
})

describe('bonuses, voluntary CPF and money coming in', () => {
  it('pays fixed-dollar and one-off bonuses', () => {
    const core = simulateCore(base((s) => {
      s.partners[0].bonuses = [{ months: 0, amount: 5000, paidInMonth: 3 }, { months: 0, amount: 20000, paidInMonth: 6, year: 2027 }]
      s.partners[0].bonusSavedPct = 100
    }))
    const gain = (ym: string) => {
      const i = core.months.findIndex((m) => m.ym === ym)
      return core.months[i + 1].combined.cash - core.months[i].combined.cash - 2000 // minus normal savings
    }
    expect(gain('2026-03')).toBeCloseTo(5000 * 0.8, 0) // after 20% employee CPF
    expect(gain('2027-03')).toBeCloseTo(5000 * 0.8, 0)
    expect(gain('2027-06')).toBeCloseTo(20000 * 0.8, 0)
    expect(gain('2028-06')).toBeCloseTo(0, 0)
  })
  it('takes voluntary top-ups from cash and splits them like normal contributions', () => {
    const core = simulateCore(base((s) => { s.partners[1].voluntaryCpf = [{ id: 'v', amount: 10000, frequency: 'once', date: '2026-05' }] }))
    const e = core.events.find((x) => x.kind === 'voluntaryCpf')!
    expect(e.ym).toBe('2026-05')
    expect(e.fromCash).toBe(10000)
    expect(-e.fromCpf).toBeCloseTo(10000 * 0.6217, 2)
    const m = core.months.find((x) => x.ym === '2026-05')!
    expect(m.perPartner.B.cash).toBeLessThan(core.months.find((x) => x.ym === '2026-04')!.perPartner.B.cash)
  })
  it('caps top-ups at the CPF Annual Limit', () => {
    // $4,000/mth × 37% × 12 = $17,760 mandatory → room $19,980
    const r = runScenario(base((s) => { s.partners[0].voluntaryCpf = [{ id: 'v', amount: 30000, frequency: 'once', date: '2026-06' }] }))
    const e = r.events.find((x) => x.kind === 'voluntaryCpf')!
    expect(e.amount).toBeCloseTo(37740 - 4000 * 0.37 * 12, 2)
    expect(r.warnings.some((w) => w.id === 'topup-A')).toBe(true)
  })
  it('repeats yearly top-ups in the chosen month', () => {
    const core = simulateCore(base((s) => { s.partners[0].voluntaryCpf = [{ id: 'v', amount: 1000, frequency: 'yearly', month: 12 }] }))
    expect(core.events.filter((e) => e.kind === 'voluntaryCpf').map((e) => e.ym)).toEqual(['2026-12', '2027-12', '2028-12', '2029-12', '2030-12'])
  })
  it('adds money coming in to cash', () => {
    const core = simulateCore(base((s) => {
      s.costs.push({ id: 'gift', label: 'Gift from parents', kind: 'inflow', amount: 20000, auto: false, when: { date: '2026-04' }, funding: 'cashOnly', payer: 'B' })
    }))
    const e = core.events.find((x) => x.itemId === 'gift')!
    expect(e.amount).toBe(-20000)
    const i = core.months.findIndex((m) => m.ym === '2026-04')
    expect(core.months[i].perPartner.B.cash - core.months[i - 1].perPartner.B.cash).toBeCloseTo(20000 + 1000, 6)
    expect(runScenario(base((s) => { s.costs.push({ id: 'gift', label: 'Gift', kind: 'inflow', amount: 20000, auto: false, when: { date: '2026-04' }, funding: 'cashOnly', payer: 'B' }) })).summary.totalPaid)
      .toBe(runScenario(base()).summary.totalPaid)
  })
})

describe('changing pay: job changes, gaps, uneven raises', () => {
  it('uses a new salary from the change month, with raises after that', () => {
    const p = { ...base().partners[0], annualRaisePct: 5, incomeChanges: [{ id: 'j', kind: 'newSalary' as const, from: '2027-07', salary: 6000 }] }
    expect(salaryAt(p, '2026-01', '2027-01')).toBeCloseTo(4000 * 1.05, 6)
    expect(salaryAt(p, '2026-01', '2027-07')).toBe(6000)
    expect(salaryAt(p, '2026-01', '2028-01')).toBeCloseTo(6300, 6)
  })
  it('applies a different raise for one year', () => {
    const p = { ...base().partners[0], annualRaisePct: 3, incomeChanges: [{ id: 'r', kind: 'raise' as const, year: 2027, pct: 0 }, { id: 'r2', kind: 'raise' as const, year: 2028, pct: 10 }] }
    expect(salaryAt(p, '2026-01', '2027-06')).toBe(4000)
    expect(salaryAt(p, '2026-01', '2028-06')).toBeCloseTo(4400, 6)
    expect(salaryAt(p, '2026-01', '2029-06')).toBeCloseTo(4400 * 1.03, 6)
  })
  it('has no pay, CPF or bonus during a gap, and spends savings', () => {
    const core = simulateCore(base((s) => {
      s.partners[0].bonuses = [{ months: 1, paidInMonth: 12 }]
      s.partners[0].incomeChanges = [{ id: 'g', kind: 'noIncome', from: '2026-11', until: '2027-02', monthlyCashChange: -2000 }]
    }))
    const dec = core.months.find((m) => m.ym === '2026-12')!
    expect(dec.oaContribution.A).toBe(0)
    const i = core.months.findIndex((m) => m.ym === '2026-12')
    expect(core.months[i + 1].perPartner.A.cash - core.months[i].perPartner.A.cash).toBeCloseTo(-2000, 6)
    const mar = core.months.find((m) => m.ym === '2027-03')!
    expect(mar.oaContribution.A).toBeGreaterThan(0)
  })
  it('a gap in the 12 months before applying breaks the grant work rule', () => {
    const el = assessEligibility(base((s) => { for (const p of s.partners) p.incomeChanges = [{ id: 'g', kind: 'noIncome', from: '2025-09', until: '2025-10', monthlyCashChange: 0 }] }), policy)
    expect(el.employmentOk).toBe(false)
  })
  it('shows what a 6-month job loss at key collection does', () => {
    const s = base()
    const res = jobLossImpact(s)
    expect(res).toHaveLength(2)
    expect(res[0].from).toBe('2029-12')
    expect(res[0].monthlyCosts).toBeGreaterThan(0)
    expect(res[0].leanestChange).toBeLessThan(0)
    const trial = withJobLoss(s, 1, '2029-12', 6)
    expect(trial.partners[1].incomeChanges).toHaveLength(1)
    expect(s.partners[1].incomeChanges).toBeUndefined()
  })
})

describe('loan changes after key collection', () => {
  const mort = (core: ReturnType<typeof simulateCore>) => core.events.filter((e) => e.kind === 'mortgage')
  const long = (s: Scenario) => simulateCore(s, undefined, { monthsAfterKeys: 60 })

  it('follows a floating-rate path with several rate changes', () => {
    const core = long(base((s) => {
      s.financing.loanType = 'bank'; s.financing.rate = 0.02
      s.financing.loanChanges = [
        { id: 'r1', kind: 'rate', from: '2031-01', rate: 0.035 },
        { id: 'r2', kind: 'rate', from: '2032-01', rate: 0.028 },
      ]
    }))
    const m = mort(core)
    const at = (ym: string) => m.find((e) => e.ym === ym)!.amount
    expect(at('2031-01')).toBeGreaterThan(at('2030-12') + 100)
    expect(at('2032-01')).toBeLessThan(at('2031-12') - 50)
    expect(core.loanPath.map((p) => p.change)).toEqual(['start', 'rate', 'rate'])
  })
  it('refinances from HDB to a bank loan: new rate, cash costs, lock-in penalty, CPF cap from then', () => {
    const s = base((s) => {
      s.financing.loanChanges = [{ id: 'rf', kind: 'refinance', from: '2031-06', rate: 0.018, costs: 3000, penaltyPct: 0 }]
    })
    const core = long(s)
    const step = core.loanPath.find((p) => p.change === 'refinance')!
    expect(step.loanType).toBe('bank')
    expect(step.instalment).toBeLessThan(core.loanPath[0].instalment)
    const cost = core.events.find((e) => e.itemId === 'rf-cost')!
    expect(cost.fromCash).toBe(3000)
    expect(cost.kind).toBe('loanChange')
    const r = runScenario(s)
    expect(r.warnings.some((w) => w.id === 'hdb-to-bank')).toBe(true)
    expect(r.loanPath.some((p) => p.change === 'refinance')).toBe(true)
  })
  it('charges a lock-in penalty as % of the balance', () => {
    const core = long(base((s) => {
      s.financing.loanType = 'bank'
      s.financing.loanChanges = [{ id: 'rf', kind: 'refinance', from: '2030-06', rate: 0.02, costs: 0, penaltyPct: 1.5 }]
    }))
    const step = core.loanPath.find((p) => p.change === 'refinance')!
    expect(step.cost).toBeCloseTo(step.outstanding * 0.015, 1)
  })
  it('changes the remaining tenure and re-prices the instalment', () => {
    const core = long(base((s) => { s.financing.loanChanges = [{ id: 't', kind: 'tenure', from: '2031-01', tenureYears: 15 }] }))
    const m = mort(core)
    const before = m.find((e) => e.ym === '2030-12')!.amount
    const after = m.find((e) => e.ym === '2031-01')!.amount
    expect(after).toBeGreaterThan(before + 300)
    expect(core.loanPath.at(-1)!.monthsLeft).toBe(180)
  })
  it('warns when a new tenure runs past the limits', () => {
    const r = runScenario(base((s) => { s.financing.loanChanges = [{ id: 't', kind: 'tenure', from: '2032-01', tenureYears: 30 }] }))
    expect(r.warnings.some((w) => w.id.startsWith('loan-term-'))).toBe(true)
  })
  it('applies changes dated before keys from the first instalment', () => {
    const r = runScenario(base((s) => { s.financing.loanChanges = [{ id: 'r', kind: 'rate', from: '2027-01', rate: 0.03 }] }))
    expect(r.loanPath[1].ym).toBe('2030-02') // keys Dec 2029: first HDB instalment 1 Feb 2030
    expect(r.warnings.some((w) => w.id === 'loan-change-early')).toBe(true)
  })
})

describe('switching from HDB loan to bank loan', () => {
  const switchAt = (from: string) => base((s) => {
    s.financing.loanChanges = [{ id: 'sw', kind: 'refinance', from, rate: 0.02, costs: 2500, penaltyPct: 0 }]
  })
  it('before keys: makes up the 5% cash downpayment at key collection', () => {
    // AFL 10% paid fully from CPF (slider 100%); option fee $2,000 in cash → $22,000 more cash at keys.
    const core = simulateCore(switchAt('2029-06'))
    const keys = core.events.find((e) => e.itemId === 'dp-keys')!
    expect(keys.label).toMatch(/switching to bank loan/)
    expect(keys.fromCash).toBeCloseTo(480000 * 0.05 - 2000, 2)
    expect(core.bankSwitch).toMatchObject({ cashRequiredTotal: 24000, cashPaidBefore: 2000, extraCash: 22000 })
    const step = core.loanPath.find((p) => p.change === 'refinance')!
    expect(step.ym).toBe('2030-01')
    expect(step.loanType).toBe('bank')
    const r = runScenario(switchAt('2029-06'))
    expect(r.warnings.some((w) => w.id === 'switch-before-keys')).toBe(true)
    expect(r.warnings.some((w) => w.id === 'hdb-to-bank')).toBe(false)
  })
  it('counts cash already paid at AFL towards the rule', () => {
    const core = simulateCore(base((s) => {
      s.financing.cpfUsagePct = 0
      for (const p of s.partners) p.cpfOA = 10000 // below the $20k HDB retention, so AFL is paid in cash
      s.financing.loanChanges = [{ id: 'sw', kind: 'refinance', from: '2029-06', rate: 0.02, costs: 0, penaltyPct: 0 }]
    }))
    expect(core.bankSwitch!.cashPaidBefore).toBeGreaterThanOrEqual(24000)
    expect(core.bankSwitch!.extraCash).toBe(0)
  })
  it('after keys: no cash rule, just the refinance', () => {
    const core = simulateCore(switchAt('2031-01'), undefined, { monthsAfterKeys: 24 })
    expect(core.bankSwitch).toBeUndefined()
    expect(core.events.find((e) => e.itemId === 'dp-keys')!.fromCash).toBe(0)
    expect(runScenario(switchAt('2031-01')).warnings.some((w) => w.id === 'hdb-to-bank')).toBe(true)
  })
  it('suggests choosing a bank loan outright if the switch is before AFL', () => {
    expect(runScenario(switchAt('2026-10')).warnings.some((w) => w.id === 'switch-before-afl')).toBe(true)
  })
})

describe('SBF and open booking', () => {
  it('completed flat: AFL is signed at key collection and the whole downpayment is due then', () => {
    const s = base((s) => {
      s.flat.saleType = 'SBF'; s.flat.completed = true; s.financing.staggered = true
      s.flat.dates = { application: '2026-02', booking: '2026-05', afl: '2026-06', keys: '2026-09' }
    })
    const { obligations, loan } = buildSchedule(s, policy)
    expect(obligations.find((o) => o.id === 'dp-afl')!.ym).toBe('2026-09')
    expect(obligations.find((o) => o.id === 'dp-keys')!.ym).toBe('2026-09')
    expect(obligations.find((o) => o.id === 'bsd')!.ym).toBe('2026-09')
    // Staggered doesn't apply: standard 10% + 15%
    expect(obligations.find((o) => o.id === 'dp-afl')!.amount).toBe(48000 - 2000)
    expect(loan.assessedAt).toBe('2026-09')
    const r = runScenario(s)
    expect(r.milestones.afl).toBe('2026-09')
    expect(r.events.find((e) => e.kind === 'mortgage')!.ym).toBe('2026-11')
  })
  it('open booking: no ballot — application is the booking month', () => {
    const s = base((s) => {
      s.flat.saleType = 'OBF'; s.flat.completed = true
      s.flat.dates = { application: '2025-01', booking: '2026-03', afl: '2026-03', keys: '2026-07' }
    })
    const el = assessEligibility(s, policy)
    expect(el.assessedAt).toBe('2026-02') // HFE letter a month before applying
    expect(runScenario(s).milestones.application).toBe('2026-03')
  })
  it('warns if keys for a completed flat are more than 9 months after booking', () => {
    const r = runScenario(base((s) => {
      s.flat.saleType = 'SBF'; s.flat.completed = true
      s.flat.dates = { application: '2026-02', booking: '2026-04', afl: '2026-04', keys: '2027-06' }
    }))
    expect(r.warnings.some((w) => w.id === 'completed-keys')).toBe(true)
  })
  it('DIA on a completed flat: income assessed at booking', () => {
    const s = base((s) => {
      s.flat.saleType = 'SBF'; s.flat.completed = true; s.financing.deferredIncomeAssessment = true
      s.flat.dates = { application: '2026-02', booking: '2026-05', afl: '2026-05', keys: '2026-09' }
    })
    expect(buildSchedule(s, policy).loan.assessedAt).toBe('2026-05')
    expect(assessEligibility(s, policy).assessedAt).toBe('2026-05')
  })
  it('an uncompleted SBF flat works like a BTO', () => {
    const s = base((s) => { s.flat.saleType = 'SBF' })
    expect(buildSchedule(s, policy).obligations.find((o) => o.id === 'dp-afl')!.ym).toBe('2026-12')
  })
})

describe('remaining lease (age-95 rule)', () => {
  it('pro-rates CPF use and the HDB loan limit when the lease falls short of age 95', () => {
    // Youngest is ~29 at AFL → needs 66 years; 60-year lease → 60/66
    const s = base((s) => { s.flat.saleType = 'SBF'; s.flat.remainingLeaseYears = 60 })
    const f = 60 / 66
    expect(maxLtvFor(s, policy).max).toBeCloseTo(0.75 * f, 6)
    const { loan } = buildSchedule(s, policy)
    expect(loan.cpfCap).toBeCloseTo(480000 * f, 2)
    expect(loan.loanAmount).toBeCloseTo(480000 * 0.75 * f, 0)
    const r = runScenario(s)
    expect(r.warnings.some((w) => w.id === 'lease-prorated')).toBe(true)
    expect(r.warnings.find((w) => w.id === 'ltv')!.title).toMatch(/HDB will lend/)
    expect(r.warnings.some((w) => w.id === 'hdb-tenure')).toBe(false) // 25 ≤ 60 − 20
  })
  it('no CPF or HDB loan with 20 years or less', () => {
    const s = base((s) => { s.flat.saleType = 'SBF'; s.flat.remainingLeaseYears = 20 })
    const { loan } = buildSchedule(s, policy)
    expect(loan.cpfCap).toBe(0)
    expect(loan.loanAmount).toBe(0)
    const core = simulateCore(s)
    expect(core.events.filter((e) => e.kind !== 'grant').every((e) => e.fromCpf <= 0.001)).toBe(true)
    expect(runScenario(s).warnings.some((w) => w.id === 'lease-no-cpf')).toBe(true)
  })
  it('limits HDB loan tenure to lease − 20', () => {
    const r = runScenario(base((s) => { s.flat.saleType = 'SBF'; s.flat.remainingLeaseYears = 40 }))
    expect(r.loan.tenureYears).toBe(20)
    expect(r.warnings.some((w) => w.id === 'hdb-tenure')).toBe(true)
  })
  it('a 99-year lease is unaffected', () => {
    expect(buildSchedule(base(), policy).loan.cpfCap).toBe(Infinity)
  })
})

describe('typical dates by mode of sale', () => {
  it('fills sensible dates for each mode', () => {
    expect(typicalDates('2026-09', 'OBF', true)).toEqual({ application: '2026-10', booking: '2026-10', afl: '2027-01', keys: '2027-01' })
    const sbf = typicalDates('2026-09', 'SBF', false)
    expect(sbf.keys > sbf.afl && sbf.afl > sbf.booking && sbf.booking > sbf.application).toBe(true)
    expect(typicalDates('2026-09', 'BTO', false).keys).toBe('2030-08')
  })
})

describe('singles and the Joint Singles Scheme', () => {
  const single = (fn: (s: Scenario) => void = () => {}) => base((s) => {
    s.buyers = 'single'
    s.flat.type = '2R'
    s.flat.price = 180000
    s.partners[0].birthYearMonth = '1988-01'
    s.partners[0].grossMonthly = 4000
    fn(s)
  })
  it('only the single buyer’s money counts; everything is paid by them', () => {
    const core = simulateCore(single((s) => { s.costs.push({ id: 'x', label: 'X', kind: 'custom', amount: 1000, auto: false, when: { date: '2026-03' }, funding: 'cashOnly', payer: 'B' }) }))
    expect(core.months[0].perPartner.B.cash).toBe(0)
    expect(core.months[0].perPartner.B.oa).toBe(0)
    expect(core.months.every((m) => m.oaContribution.B === 0)).toBe(true)
    expect(core.months.every((m) => m.perPartner.B.cash === 0)).toBe(true)
    expect(core.months[0].combined.cash).toBe(60000)
  })
  it('uses the singles income ceiling and grant table', () => {
    const el = assessEligibility(single(), policy)
    expect(el.incomeCeiling).toBe(8000)
    expect(el.avgIncome).toBe(4000)
    expect(el.ehg).toBe(10000) // singles table: $3,751–$4,000 → $10,000
    expect(el.singlesIssues).toEqual([])
  })
  it('assesses the loan on the single buyer’s income and age', () => {
    const { loan } = buildSchedule(single(), policy)
    expect(loan.grossIncomeAtAssessment).toBe(4000)
  })
  it('flags singles under 35, non-2-room flats, PRs and second-timers', () => {
    const el = assessEligibility(single((s) => {
      s.partners[0].birthYearMonth = '1995-01'
      s.flat.type = '4R'
      s.partners[0].citizenship = 'SPR'
      s.flat.household = 'secondTimers'
    }), policy)
    expect(el.singlesIssues).toHaveLength(4)
    expect(el.ehg).toBe(0)
    const r = runScenario(single((s) => { s.flat.type = '4R' }))
    expect(r.warnings.some((w) => w.id === 'singles-eligibility')).toBe(true)
    expect(r.warnings.some((w) => w.id === 'both-spr')).toBe(false)
  })
  it('turns off the staggered scheme and DIA for singles', () => {
    const s = single((s) => { s.financing.staggered = true; s.financing.deferredIncomeAssessment = true })
    const { obligations } = buildSchedule(s, policy)
    expect(obligations.find((o) => o.id === 'dp-afl')!.amount).toBe(180000 * 0.1 - 500)
  })
  it('Joint Singles Scheme: both incomes, families grant table, JSS ceiling', () => {
    const s = base((s) => {
      s.buyers = 'jointSingles'
      s.flat.type = '2R'
      for (const p of s.partners) { p.birthYearMonth = '1988-01'; p.grossMonthly = 3500 }
    })
    const el = assessEligibility(s, policy)
    expect(el.avgIncome).toBe(7000)
    expect(el.incomeCeiling).toBe(16000)
    expect(el.ehg).toBe(30000)
    expect(el.singlesIssues).toEqual([])
    expect(assessEligibility(base((s) => { s.buyers = 'jointSingles'; s.flat.type = '2R' }), policy).singlesIssues[0]).toMatch(/35 or older/)
  })
})

describe('partial prepayments', () => {
  const long = (s: Scenario) => simulateCore(s, undefined, { monthsAfterKeys: 60 })
  const prepay = (over: Partial<Extract<NonNullable<Scenario['financing']['loanChanges']>[number], { kind: 'prepay' }>> = {}) =>
    base((s) => { s.financing.loanChanges = [{ id: 'p', kind: 'prepay', from: '2031-01', amount: 50000, source: 'cash', then: 'lowerInstalment', penaltyPct: 0, ...over }] })

  it('cash prepayment lowers the instalment, same end date', () => {
    const core = long(prepay())
    const step = core.loanPath.find((p) => p.change === 'prepay')!
    expect(step.prepaid).toBe(50000)
    expect(step.instalment).toBeLessThan(core.loanPath[0].instalment - 200)
    expect(step.monthsLeft).toBe(core.loanPath[0].monthsLeft - monthsBetween(core.loanPath[0].ym, step.ym))
    expect(core.events.find((e) => e.itemId === 'p-prepay')!.fromCash).toBe(50000)
  })
  it('“finish sooner” keeps the instalment and shortens the loan', () => {
    const core = long(prepay({ then: 'shorterTenure' }))
    const step = core.loanPath.find((p) => p.change === 'prepay')!
    expect(step.instalment).toBeCloseTo(core.loanPath[0].instalment, 0)
    expect(step.monthsLeft).toBeLessThan(core.loanPath[0].monthsLeft - 12 - 24)
  })
  it('CPF prepayment comes from OA and counts as CPF used for housing', () => {
    const s = prepay({ source: 'cpf', amount: 30000 })
    const core = long(s)
    const e = core.events.find((x) => x.itemId === 'p-prepay')!
    expect(e.fromCpf).toBe(30000)
    expect(e.fromCash).toBe(0)
    expect(core.housingWithdrawals.filter((w) => w.ym === '2031-01').reduce((a, w) => a + w.amount, 0)).toBeGreaterThanOrEqual(30000)
  })
  it('charges a bank-loan penalty but not for HDB loans', () => {
    const hdb = long(prepay({ penaltyPct: 1.5 }))
    expect(hdb.events.some((e) => e.itemId === 'p-penalty')).toBe(false)
    const bank = long(base((s) => {
      s.financing.loanType = 'bank'
      s.financing.loanChanges = [{ id: 'p', kind: 'prepay', from: '2031-01', amount: 50000, source: 'cash', then: 'lowerInstalment', penaltyPct: 1.5 }]
    }))
    expect(bank.events.find((e) => e.itemId === 'p-penalty')!.fromCash).toBe(750)
  })
  it('repeats yearly and can pay the loan off entirely', () => {
    const core = simulateCore(prepay({ repeatYearly: true, amount: 100000 }), undefined, { monthsAfterKeys: 180 })
    const steps = core.loanPath.filter((p) => p.change === 'prepay')
    expect(steps.length).toBeGreaterThanOrEqual(3)
    expect(steps.at(-1)!.monthsLeft).toBe(0)
    const lastMortgage = core.events.filter((e) => e.kind === 'mortgage').at(-1)!
    expect(lastMortgage.ym < '2036-01').toBe(true)
  })
})

describe('HDB loan servicing rules', () => {
  it('a bank loan starts the month after keys', () => {
    const core = simulateCore(base((s) => { s.financing.loanType = 'bank' }))
    expect(core.events.find((e) => e.kind === 'mortgage')!.ym).toBe('2030-01')
  })
  it('a switch to a bank loan before keys starts like a bank loan', () => {
    const core = simulateCore(base((s) => { s.financing.loanChanges = [{ id: 'sw', kind: 'refinance', from: '2029-12', rate: 0.025, tenureYears: 25, costs: 0, penaltyPct: 0 }] as Scenario['financing']['loanChanges'] }))
    expect(core.events.find((e) => e.kind === 'mortgage')!.ym).toBe('2030-01')
  })
  it('still pays the full tenure: n instalments from the first one', () => {
    const core = simulateCore(base(), undefined, { monthsAfterKeys: 26 * 12 })
    const mort = core.events.filter((e) => e.kind === 'mortgage')
    expect(mort).toHaveLength(25 * 12)
    expect(mort.at(-1)!.ym).toBe('2055-01')
  })
  const prepay = (amount: number) => runScenario(base((s) => { s.financing.loanChanges = [{ id: 'p', kind: 'prepay', from: '2031-06', amount, source: 'cash', then: 'lowerInstalment' }] as Scenario['financing']['loanChanges'] }))
  it('flags HDB partial repayments under $5,000 or not in $1,000 steps', () => {
    expect(prepay(3000).warnings.map((w) => w.id)).toContain('hdb-prepay-amount')
    expect(prepay(12500).warnings.map((w) => w.id)).toContain('hdb-prepay-amount')
    expect(prepay(12000).warnings.map((w) => w.id)).not.toContain('hdb-prepay-amount')
  })
  it('paying the whole loan off can be any amount', () => {
    expect(prepay(999_999).warnings.map((w) => w.id)).not.toContain('hdb-prepay-amount')
  })
})

describe('turning 55 while CPF pays the loan', () => {
  const ids = (f: (s: Scenario) => void) => runScenario(base(f)).warnings.filter((w) => w.id === 'cpf-55')
  it('a warning if it happens within the plan', () => {
    const [w] = ids((s) => { s.partners[1].birthYearMonth = '1975-06' }) // 55 in Jun 2030, keys Dec 2029
    expect(w.severity).toBe('warning')
    expect(w.title).toMatch(/turns 55 in Jun 2030/)
  })
  it('a note if it happens later but before the loan ends', () => {
    const [w] = ids((s) => { s.partners.forEach((p) => { p.birthYearMonth = '1985-01' }) })
    expect(w.severity).toBe('info')
  })
  it('nothing when the loan ends before 55, or when paying the mortgage in cash', () => {
    expect(ids((s) => { s.financing.tenureYears = 15 })).toHaveLength(0)
    expect(ids((s) => { s.partners[1].birthYearMonth = '1975-06'; s.financing.mortgageFrom = 'cashOnly' })).toHaveLength(0)
  })
})

describe('changing the tenure of an HDB loan later', () => {
  it('dates early loan changes from the real first instalment (2nd month after keys)', () => {
    const r = runScenario(base((s) => { s.financing.loanChanges = [{ id: 'r', kind: 'rate', from: '2027-01', rate: 0.03 }] }))
    expect(r.warnings.find((w) => w.id === 'loan-change-early')!.explanation).toMatch(/Feb 2030/)
  })
  it('checks the age limit with the plain average age, like HDB', () => {
    // Ages ~25 and ~55 at the change: plain average 40 → a 25-year extension ends at 65, fine.
    // Weighted towards the older, higher earner it would look like ~53 → 78 and be flagged.
    const r = runScenario(base((s) => {
      s.partners[0].birthYearMonth = '2006-01'; s.partners[0].grossMonthly = 2000
      s.partners[1].birthYearMonth = '1976-01'; s.partners[1].grossMonthly = 12000
      s.financing.tenureYears = 20
      s.financing.loanChanges = [{ id: 't', kind: 'tenure', from: '2031-01', tenureYears: 24 }]
    }))
    expect(r.warnings.some((w) => w.id.startsWith('loan-term-'))).toBe(false)
  })
})

describe('HFE letter and HDB’s check before keys', () => {
  const ids = (f: (s: Scenario) => void) => runScenario(base(f)).warnings.map((w) => w.id)
  it('assesses income at the HFE letter, a month before the flat application by default', () => {
    expect(assessEligibility(base(), policy).assessedAt).toBe('2026-01') // application Feb 2026
    expect(assessEligibility(base((s) => { s.flat.hfeMonth = '2025-11' }), policy).assessedAt).toBe('2025-11')
  })
  it('flags an HFE letter after the application, or one that would expire first', () => {
    expect(ids((s) => { s.flat.hfeMonth = '2026-03' })).toContain('hfe-after-application')
    expect(ids((s) => { s.flat.hfeMonth = '2025-04' })).toContain('hfe-expired') // 10 months before
    expect(ids((s) => { s.flat.hfeMonth = '2025-05' })).not.toContain('hfe-expired') // 9 months: still valid
  })
  it('warns when income before keys can’t support the HDB loan', () => {
    // Both out of work from mid-2029 (keys Dec 2029): nothing when HDB re-checks around Sep 2029.
    const noPay = (s: Scenario) => s.partners.forEach((p, i) => { p.incomeChanges = [{ id: `gap${i}`, kind: 'noIncome', from: '2029-06', until: '2030-06', monthlyCashChange: 0 }] })
    expect(ids(noPay)).toContain('loan-review')
    expect(ids(() => {})).not.toContain('loan-review')
  })
  it('doesn’t repeat the check under DIA, which already assesses near keys', () => {
    const noPay = (s: Scenario) => { s.financing.deferredIncomeAssessment = true; s.partners.forEach((p, i) => { p.incomeChanges = [{ id: `gap${i}`, kind: 'noIncome', from: '2029-06', until: '2030-06', monthlyCashChange: 0 }] }) }
    expect(ids(noPay)).not.toContain('loan-review')
  })
})

describe('HDB’s income average: total income ÷ months worked, per person', () => {
  // Application Feb 2026 → HFE Jan 2026 → window Dec 2024 – Nov 2025. Both earn $4,000.
  it('someone who started work mid-window is averaged over the months they worked', () => {
    const el = assessEligibility(base((s) => { s.partners[1].workStartMonth = '2025-06' }), policy)
    expect(el.windowEnd).toBe('2025-11')
    expect(el.avgIncome).toBeCloseTo(8000, 6) // $4,000 each, not $4,000 + $2,000
  })
  it('no-pay months don’t count', () => {
    const el = assessEligibility(base((s) => { s.partners[0].incomeChanges = [{ id: 'npl', kind: 'noIncome', from: '2025-03', until: '2025-05', monthlyCashChange: 0 }] }), policy)
    expect(el.avgIncome).toBeCloseTo(8000, 6)
  })
  it('someone who didn’t work at all in the window adds nothing', () => {
    const el = assessEligibility(base((s) => { s.partners[1].workStartMonth = '2026-06' }), policy)
    expect(el.avgIncome).toBeCloseTo(4000, 6)
  })
})

describe('Enhanced CPF Housing Grant: HDB’s worked examples (hdb.gov.sg, 2024)', () => {
  const el = P.eligibility
  it('families table: $4,200 → $70,000; $3,000 → $95,000; $4,400 → $70,000', () => {
    expect(tierAmount(4200, el.ehgFamilies)).toBe(70000)
    expect(tierAmount(3000, el.ehgFamilies)).toBe(95000)
    expect(tierAmount(4400, el.ehgFamilies)).toBe(70000)
  })
  it('singles table on half the income: $2,000 → $40,000; $2,200 → $35,000', () => {
    expect(tierAmount(2000, el.ehgSingles)).toBe(40000)
    expect(tierAmount(2200, el.ehgSingles)).toBe(35000)
  })

  const ehgPlan = (f: (s: Scenario) => void) => base((s) => {
    s.flat.grants = [{ id: 'ehg', name: 'EHG', amount: 0, auto: 'EHG', splitA: 50, when: { milestone: 'keys' } }]
    f(s)
  })
  it('Mr and Mrs G: first-timer + second-timer, $4,000 → $40,000, all to the first-timer', () => {
    const s = ehgPlan((s) => { s.flat.household = 'firstAndSecond'; s.flat.secondTimer = 'B'; s.partners.forEach((p) => { p.grossMonthly = 2000 }) })
    const { eligibility, grantCredits } = buildSchedule(s, policy)
    expect(eligibility.ehg).toBe(40000)
    expect(grantCredits[0].amounts).toEqual({ A: 40000, B: 0 })
    const flipped = buildSchedule(ehgPlan((s) => { s.flat.household = 'firstAndSecond'; s.flat.secondTimer = 'A'; s.partners.forEach((p) => { p.grossMonthly = 2000 }) }), policy)
    expect(flipped.grantCredits[0].amounts).toEqual({ A: 0, B: 40000 })
  })
  it('two first-timers still split it as set', () => {
    const { grantCredits } = buildSchedule(ehgPlan(() => {}), policy)
    expect(grantCredits[0].amounts.A).toBe(grantCredits[0].amounts.B)
  })
  it('pro-rates the grant when the lease doesn’t cover the youngest to 95', () => {
    // A 50-year lease covers the youngest (29 at AFL here) only to 79: 50 of the 66 years needed.
    const full = assessEligibility(ehgPlan(() => {}), policy).ehg
    const s = ehgPlan((s) => { s.flat.saleType = 'SBF'; s.flat.remainingLeaseYears = 50 })
    const short = assessEligibility(s, policy)
    const lf = leaseFactor(s, policy)
    expect(lf.needed).toBe(66)
    expect(short.ehg).toBe(Math.round(full * 50 / 66))
    expect(short.ehgReason).toMatch(/Pro-rated/)
  })
})

describe('Top-Up Grant note for singles buying a 2-room Flexi', () => {
  it('shows for singles buying a 2-room Flexi, not for couples', () => {
    const single = runScenario(base((s) => { s.buyers = 'single'; s.flat.type = '2R'; s.partners[0].birthYearMonth = '1985-01' }))
    expect(single.warnings.find((w) => w.id === 'topup-grant')?.title).toMatch(/\$15,000/)
    expect(runScenario(base((s) => { s.flat.type = '2R' })).warnings.some((w) => w.id === 'topup-grant')).toBe(false)
  })
})

describe('Step-Up CPF Housing Grant (hdb.gov.sg)', () => {
  const stepUp = (f: (s: Scenario) => void) => assessEligibility(base((s) => {
    s.flat.household = 'secondTimers'; s.flat.fromRentalOr2Room = true; s.flat.type = '3R'
    f(s)
  }), policy)
  it('$15,000 up to $8,000 household income', () => {
    expect(stepUp((s) => { s.partners.forEach((p) => { p.grossMonthly = 3900 }) }).stepUp).toBe(15000) // $7,800
    expect(stepUp((s) => { s.partners.forEach((p) => { p.grossMonthly = 4100 }) }).stepUp).toBe(0) // $8,200
  })
  it('only for a 2-room Flexi or 3-room Standard flat', () => {
    expect(stepUp((s) => { s.flat.type = '4R' }).stepUp).toBe(0)
    expect(stepUp((s) => { s.flat.classification = 'Plus' }).stepUp).toBe(0)
  })
})

describe('Home Protection Scheme', () => {
  const ids = (f: (s: Scenario) => void) => runScenario(base((s) => {
    s.costs.push({ id: 'hps', label: 'HPS', kind: 'hps', amount: 300, auto: false, when: { milestone: 'keys' }, funding: 'cpfAllowed', payer: 'joint', recurrence: { everyMonths: 12, times: 30 } })
    f(s)
  })).warnings.map((w) => w.id)
  it('notes it’s optional when the mortgage is paid in cash', () => {
    expect(ids((s) => { s.financing.mortgageFrom = 'cashOnly' })).toContain('hps-optional')
    expect(ids(() => {})).not.toContain('hps-optional')
  })
  it('warns when CPF pays the mortgage but there’s no HPS', () => {
    expect(ids((s) => { s.costs = s.costs.filter((c) => c.kind !== 'hps') })).toContain('hps-missing')
    expect(ids(() => {})).not.toContain('hps-missing')
  })
})

describe('buyers aged 55+', () => {
  const ids = (f: (s: Scenario) => void) => runScenario(base(f)).warnings.map((w) => w.id)
  it('mentions short-lease flats only when every buyer is 55+', () => {
    expect(ids((s) => { s.partners.forEach((p) => { p.birthYearMonth = '1965-01' }) })).toContain('seniors-short-lease')
    expect(ids((s) => { s.partners[0].birthYearMonth = '1965-01' })).not.toContain('seniors-short-lease')
    expect(ids(() => {})).not.toContain('seniors-short-lease')
  })
})

describe('cost of pulling out, in cash shortfall warnings', () => {
  const cashWarning = (f: (s: Scenario) => void) => runScenario(base(f)).warnings.find((w) => w.id.startsWith('cash-'))
  it('after AFL: 5% of the price', () => {
    // A big cash-only cost a year after AFL (Dec 2026), before keys (Dec 2029).
    const w = cashWarning((s) => { s.costs.push({ id: 'x', label: 'Big bill', kind: 'custom', amount: 500000, auto: false, when: { date: '2027-12' }, funding: 'cashOnly', payer: 'joint' }) })
    expect(w?.explanation).toMatch(/5% of the price \(\$24,000\)/) // price $480,000
  })
  it('between booking and AFL: the option fee', () => {
    const w = cashWarning((s) => { s.costs.push({ id: 'x', label: 'Big bill', kind: 'custom', amount: 500000, auto: false, when: { date: '2026-08' }, funding: 'cashOnly', payer: 'joint' }) })
    expect(w?.explanation).toMatch(/costs the option fee/)
  })
})

describe('signing the AFL (hdb.gov.sg example and rules)', () => {
  it('HDB’s example: $345,000 flat, HDB loan: 10% less the option fee, $5,100 stamp duty, legal fees, all at AFL', () => {
    const s = base((s) => { s.flat.price = 345000; s.costs = newScenario('t', '2026-01').costs })
    const obs = buildSchedule(s, policy).obligations.filter((o) => o.ym === s.flat.dates.afl)
    expect(obs.find((o) => o.id === 'dp-afl')!.amount).toBe(32500)
    expect(obs.find((o) => o.kind === 'bsd')!.amount).toBe(5100)
    expect(obs.find((o) => o.kind === 'legal')).toBeDefined() // purchase $239.80 + mortgage fee on the loan
  })
  it('bank loan at 55% LTV, standard: 20% at AFL with 10% cash, 25% at keys', () => {
    const s = base((s) => { s.financing.loanType = 'bank'; s.financing.tenureYears = 30 })
    const obs = buildSchedule(s, policy).obligations
    expect(obs.find((o) => o.id === 'dp-afl')!.amount).toBe(94000) // 20% of $480,000 less $2,000
    expect(obs.find((o) => o.id === 'dp-afl')!.minCash).toBe(46000) // 10% less the option fee
    expect(obs.find((o) => o.id === 'dp-keys')!.amount).toBe(120000)
  })
  it('flags an AFL more than 9 months after booking', () => {
    expect(runScenario(base((s) => { s.flat.dates.afl = '2027-06' })).warnings.some((w) => w.id === 'afl-late')).toBe(true) // booking Jun 2026
    expect(runScenario(base()).warnings.some((w) => w.id === 'afl-late')).toBe(false)
  })
  it('moves a saved plan’s legal fees from keys to AFL once', () => {
    const old = { ...newScenario('t', '2026-01'), costDefaultsVersion: 3 }
    old.costs = old.costs.map((c) => (c.kind === 'legal' ? { ...c, when: { milestone: 'keys' as const } } : c))
    expect(upgradeCosts(old).costs.find((c) => c.kind === 'legal')!.when).toEqual({ milestone: 'afl' })
  })
})

describe('fees at key collection (hdb.gov.sg)', () => {
  const keyFees = (f: (s: Scenario) => void) => {
    const s = base((s) => { s.costs = newScenario('t', '2026-01').costs; f(s) })
    return buildSchedule(s, policy).obligations.find((o) => o.kind === 'keyFees')
  }
  it('HDB loan: $500 mortgage stamp duty (0.4%, capped) + 2 × $38.30 registration', () => {
    expect(keyFees(() => {})).toMatchObject({ ym: '2029-12', amount: 576.6 })
  })
  it('bank loan: only the mortgage stamp duty', () => {
    expect(keyFees((s) => { s.financing.loanType = 'bank' })!.amount).toBe(500)
  })
  it('small loan: 0.4% of the loan', () => {
    expect(keyFees((s) => { s.flat.price = 100000 })!.amount).toBeCloseTo(0.004 * 75000 + 76.6, 2)
  })
  it('survey fee for a 3-room is $231.60', () => {
    expect(P.fees.surveyFee['3R']).toBe(231.6)
  })
})

describe('flat types and classification', () => {
  it('flags an Executive flat as a BTO, but not in SBF', () => {
    expect(runScenario(base((s) => { s.flat.type = 'Exec' })).warnings.some((w) => w.id === 'exec-not-bto')).toBe(true)
    expect(runScenario(base((s) => { s.flat.type = 'Exec'; s.flat.saleType = 'SBF' })).warnings.some((w) => w.id === 'exec-not-bto')).toBe(false)
  })
  it('spells out Plus/Prime conditions', () => {
    expect(runScenario(base((s) => { s.flat.classification = 'Prime' })).warnings.find((w) => w.id === 'plus-prime')!.explanation).toMatch(/10-year minimum occupation period/)
  })
})
