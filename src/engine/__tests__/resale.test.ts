import { describe, expect, it } from 'vitest'
import { runScenario } from '../index'
import { buildSchedule } from '../payments'
import { assessEligibility } from '../eligibility'
import { resolvePolicy } from '../policyOverrides'
import { typicalDates } from '../saleType'
import { newPlan } from '../../state/defaults'
import type { Scenario } from '../types'

const P = resolvePolicy()

/** A resale 4-room: OTP Feb 2026, exercised the same month, completion May 2026. $500k, valued at $480k. */
function resale(f: (s: Scenario) => void = () => {}): Scenario {
  const s = newPlan('resale')
  s.startMonth = '2026-01'
  s.exampleFields = []
  s.flat.saleType = 'resale'
  s.flat.price = 500000
  s.flat.valuation = 480000
  s.flat.remainingLeaseYears = 70
  s.flat.dates = { application: '2026-02', booking: '2026-02', afl: '2026-02', keys: '2026-05' }
  s.flat.grants.push({ id: 'fg', name: 'CPF Housing Grant (resale)', amount: 0, auto: 'FamilyGrant', splitA: 50, when: { milestone: 'keys' } })
  s.partners.forEach((p) => { p.birthYearMonth = '1996-01'; p.grossMonthly = 4000; p.cash = 60000; p.cpfOA = 40000 })
  f(s)
  return s
}
const ob = (s: Scenario, id: string) => buildSchedule(s, P).obligations.find((o) => o.id === id)

describe('resale flats', () => {
  it('typical dates: OTP next month, exercised then, completion 3 months on', () => {
    expect(typicalDates('2026-01', 'resale', false, P)).toEqual({ application: '2026-02', booking: '2026-02', afl: '2026-02', keys: '2026-05' })
  })

  it('loan on the lower of price and valuation; the rest of the price above valuation is cash', () => {
    const { loan } = buildSchedule(resale(), P)
    expect(loan.loanAmount).toBeLessThanOrEqual(480000 * 0.75)
    expect(ob(resale(), 'cov')).toMatchObject({ ym: '2026-05', amount: 20000, funding: 'cashOnly', minCash: 20000 })
    expect(ob(resale((s) => { s.flat.valuation = 520000 }), 'cov')).toBeUndefined() // valued above price: no COV
  })

  it('deposit: $1,000 option fee at OTP, $4,000 exercise fee, both counting towards the downpayment', () => {
    const s = resale((s) => { s.flat.grants = []; s.flat.valuation = 500000 })
    const obs = buildSchedule(s, P).obligations
    expect(obs.find((o) => o.kind === 'optionFee')).toMatchObject({ ym: '2026-02', amount: 1000, funding: 'cashOnly' })
    expect(obs.find((o) => o.id === 'exercise-fee')).toMatchObject({ ym: '2026-02', amount: 4000, funding: 'cashOnly' })
    expect(obs.find((o) => o.id === 'dp-afl')).toBeUndefined()
    // 25% of $500,000 = $125,000, less the $5,000 deposit, due about a month before completion (after endorsing HDB's documents).
    expect(obs.find((o) => o.id === 'dp-keys')).toMatchObject({ ym: '2026-04', amount: 120000 })
  })

  it('HDB resale fees and stamp duty on the higher of price and valuation', () => {
    const s = resale((s) => { s.flat.valuation = 520000 })
    expect(ob(s, 'request-for-value')).toMatchObject({ ym: '2026-02', amount: 120 })
    expect(ob(s, 'resale-application')).toMatchObject({ ym: '2026-02', amount: 80 })
    const bsd = buildSchedule(s, P).obligations.find((o) => o.kind === 'bsd')!
    expect(bsd.amount).toBe(1800 + 3600 + 160000 * 0.03) // on $520,000
    expect(buildSchedule(s, P).obligations.some((o) => o.kind === 'applicationFee' || o.kind === 'survey')).toBe(false)
  })

  it('CPF capped at the lower of price and valuation, even with an HDB loan', () => {
    expect(buildSchedule(resale(), P).loan.cpfCap).toBeLessThanOrEqual(480000)
  })

  it('resale grant: $80k for two citizens (2- to 4-room), $70k citizen + PR, $50k for 5-room, $40k first-timer + second-timer', () => {
    const fg = (f: (s: Scenario) => void) => assessEligibility(resale(f), P).familyGrant
    expect(fg(() => {})).toBe(80000)
    expect(fg((s) => { s.partners[1].citizenship = 'SPR' })).toBe(70000)
    expect(fg((s) => { s.flat.type = '5R' })).toBe(50000)
    expect(fg((s) => { s.flat.household = 'firstAndSecond' })).toBe(40000)
    expect(fg((s) => { s.flat.household = 'secondTimers' })).toBe(0)
    expect(fg((s) => { s.partners.forEach((p) => { p.grossMonthly = 9000 }) })).toBe(0) // $18,000 > $16,000
  })

  it('Proximity Housing Grant: $30k living with parents, $20k within 4 km', () => {
    expect(assessEligibility(resale((s) => { s.flat.proximity = 'with' }), P).phg).toBe(30000)
    expect(assessEligibility(resale((s) => { s.flat.proximity = 'near' }), P).phg).toBe(20000)
    expect(assessEligibility(resale(), P).phg).toBe(0)
  })

  it('no income ceiling to buy, no citizen + PR premium, no staggered scheme or DIA', () => {
    const el = assessEligibility(resale((s) => { s.partners.forEach((p) => { p.grossMonthly = 12000 }); s.partners[1].citizenship = 'SPR' }), P)
    expect(el.aboveCeiling).toBe(false)
    expect(el.premium).toBe(0)
    const w = runScenario(resale((s) => { s.financing.staggered = true; s.financing.deferredIncomeAssessment = true })).warnings.map((x) => x.id)
    expect(w).not.toContain('staggered-eligibility')
    expect(w).not.toContain('dia-info')
  })

  it('warnings: exercising the option late, cash over valuation, missing resale grant', () => {
    const ids = (f: (s: Scenario) => void) => runScenario(resale(f)).warnings.map((w) => w.id)
    expect(ids((s) => { s.flat.dates.afl = '2026-04' })).toContain('otp-exercise')
    expect(ids(() => {})).toContain('cov')
    expect(ids((s) => { s.flat.grants = s.flat.grants.filter((g) => g.auto !== 'FamilyGrant') })).toContain('family-grant-missing')
    expect(ids((s) => { s.interim = { mode: 'pphs', monthlyCost: 900 } })).toContain('pphs-eligibility')
  })

  it('singles can buy any resale type except 3Gen', () => {
    const issues = (f: (s: Scenario) => void) => assessEligibility(resale((s) => { s.buyers = 'single'; s.partners[0].birthYearMonth = '1985-01'; f(s) }), P).singlesIssues
    expect(issues((s) => { s.flat.type = '4R' })).toEqual([])
    expect(issues((s) => { s.flat.type = '3Gen' })[0]).toMatch(/3Gen/)
  })

  it('no resale levy when buying a resale flat (hdb.gov.sg)', () => {
    const levy = (f: (s: Scenario) => void) => buildSchedule(resale((s) => { s.flat.household = 'secondTimers'; s.flat.firstSubsidisedFlat = '4R'; f(s) }), P).obligations.find((o) => o.kind === 'resaleLevy')
    expect(levy(() => {})).toBeUndefined()
    expect(levy((s) => { s.flat.grants.push({ id: 'x', name: 'Other grant', amount: 15000, splitA: 50, when: { milestone: 'keys' } }) })).toBeUndefined()
  })
  it('Plus/Prime note: no subsidy recovery for resale ones', () => {
    const n = runScenario(resale((s) => { s.flat.classification = 'Plus' })).warnings.find((w) => w.id === 'plus-prime')!
    expect(n.explanation).toMatch(/no subsidy recovery/)
  })

  it('HDB resale legal fees: 13.5¢ / 10.8¢ / 9¢ per $100 on the price (and loan), + GST', () => {
    const s = resale((s) => { s.flat.grants = []; s.flat.valuation = 500000 })
    const legal = buildSchedule(s, P).obligations.find((o) => o.kind === 'legal')!
    const loan = buildSchedule(s, P).loan.loanAmount // $375,000
    // Transfer on $500,000: 40.50 + 32.40 + 396.00 = 468.90 → $469 × 1.09 = $511.21.
    // Mortgage on $375,000: 40.50 + 32.40 + 283.50 = 356.40 → $357 × 1.09 = $389.13.
    expect(loan).toBe(375000)
    expect(legal.amount).toBeCloseTo(511.21 + 389.13, 2)
  })
  it('SLA and HDB charges at completion with an HDB loan', () => {
    const s = resale((s) => { s.flat.grants = []; s.flat.valuation = 500000 })
    const fees = buildSchedule(s, P).obligations.find((o) => o.kind === 'keyFees')!
    expect(fees.amount).toBeCloseTo(500 + 32 + 38.3 + 38.3 + 64.45 + 16.35, 2)
  })
  it('grants are credited in time to pay the downpayment', () => {
    const obs = buildSchedule(resale(), P).obligations
    expect(obs.find((o) => o.id === 'dp-keys')!.grantFunded).toBeGreaterThan(0)
  })
  it('PR-only households pay 5% ABSD on the higher of price and valuation', () => {
    const s = resale((s) => { s.partners.forEach((p) => { p.citizenship = 'SPR' }); s.financing.loanType = 'bank'; s.flat.grants = [] })
    expect(buildSchedule(s, P).obligations.find((o) => o.id === 'absd')).toMatchObject({ amount: 25000, ym: '2026-05' })
    expect(buildSchedule(resale(), P).obligations.find((o) => o.id === 'absd')).toBeUndefined()
  })
  it('runs end to end', () => {
    const r = runScenario(resale())
    expect(r.events.some((e) => e.kind === 'mortgage')).toBe(true)
    expect(r.loan.grantsTotal).toBeGreaterThan(0)
  })
})
