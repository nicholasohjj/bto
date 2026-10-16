import { describe, expect, it } from 'vitest'
import { runScenario } from '..'
import { DEFAULT_POLICY as POLICY } from '../../config/policy'
import { seedScenario } from '../../state/defaults'
import { addMonths } from '../dates'
import { mopYears, outstandingAt, projectSale, resaleLevy } from '../afterMop'
import { applyProject } from '../launch'
import { LAUNCHES } from '../../config/launches'

describe('selling after the MOP', () => {
  const s = seedScenario()
  const r = runScenario(s)
  const start = r.loanPath[0]

  it('follows the loan down month by month', () => {
    expect(outstandingAt(r.loanPath, start.ym)).toBeCloseTo(start.outstanding, 2)
    // Standard amortisation: balance after k payments.
    const i = start.rate / 12, k = 60, g = (1 + i) ** k
    const expected = start.outstanding * g - start.instalment * (g - 1) / i
    expect(outstandingAt(r.loanPath, addMonths(start.ym, k))).toBeCloseTo(expected, 0)
    expect(outstandingAt(r.loanPath, addMonths(start.ym, start.monthsLeft + 1))).toBe(0)
  })

  it('takes the loan and the CPF refund out of the price', () => {
    const p = projectSale(s, r, POLICY, { years: 5, price: 700000 })!
    const point = r.accrued.find((a) => a.yearsAfterKeys === 5)!
    expect(p.ym).toBe(addMonths(r.milestones.keys, 60))
    expect(p.beforeMop).toBe(s.flat.classification === 'Standard' ? false : true)
    expect(p.cpfBack).toBeCloseTo(point.refundDue, 2)
    expect(p.cash).toBeCloseTo(700000 - p.loan - (p.recovery ?? 0) - point.refundDue, 2)
    // At the break-even price, cash comes to zero.
    const b = projectSale(s, r, POLICY, { years: 5, price: p.breakEven })!
    expect(b.cash).toBeCloseTo(0, 0)
  })

  it('refunds CPF only from what the sale leaves (no cash top-up)', () => {
    const loan = projectSale(s, r, POLICY, { years: 5, price: 0 })!.loan
    const p = projectSale(s, r, POLICY, { years: 5, price: loan + 50000 })!
    expect(p.cpfBack).toBeCloseTo(50000 - (p.recovery ?? 0), 2)
    expect(p.cash).toBeCloseTo(0, 2)
    // Below the loan, the difference has to be found in cash.
    expect(projectSale(s, r, POLICY, { years: 5, price: loan - 10000 })!.cash).toBeCloseTo(-10000, 2)
  })

  it('charges the agent’s fee with GST', () => {
    const a = projectSale(s, r, POLICY, { years: 10, price: 800000, agentPct: 0.01 })!
    expect(a.agentFee).toBeCloseTo(8000 * (1 + POLICY.fees.gst), 2)
  })

  it('applies a Prime project’s subsidy recovery and 10-year MOP', () => {
    const p = seedScenario()
    const june = LAUNCHES.find((l) => l.id === '2026-06')!
    applyProject(p, june, june.projects.find((x) => x.id === 'berlayar-rise')!)
    const rp = runScenario(p)
    expect(mopYears(p)).toBe(10)
    const sale = projectSale(p, rp, POLICY, { years: 10, price: 1000000 })!
    expect(sale.beforeMop).toBe(false)
    expect(sale.recovery).toBe(140000)
    expect(projectSale(p, rp, POLICY, { years: 5, price: 1000000 })!.beforeMop).toBe(true)
  })

  it('names the resale levy for the next subsidised flat', () => {
    expect(resaleLevy({ ...s, flat: { ...s.flat, type: '4R' } }, POLICY)).toBe(40000)
    expect(resaleLevy({ ...s, buyers: 'single', flat: { ...s.flat, type: '4R' } }, POLICY)).toBe(20000)
  })
})
