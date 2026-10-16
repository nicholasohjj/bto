import type { Policy } from '../config/policy'
import { addMonths, ymToIndex } from './dates'
import { pickedProject } from './launch'
import { isResale } from './saleType'
import type { LoanStep } from './simulate'
import type { PartnerId, Scenario, SimResult, YearMonth } from './types'

/**
 * Selling after the minimum occupation period (MOP): what's left on the loan, the CPF to put back,
 * subsidy recovery on Plus/Prime flats, and what comes back as cash and as CPF for the next home.
 */

/** Years after keys before the flat can be sold: 10 for Plus and Prime, 5 otherwise. */
export const mopYears = (s: Scenario) => (s.flat.classification === 'Standard' ? 5 : 10)

/** Loan still owed at the start of `ym`, before that month's instalment. */
export function outstandingAt(path: LoanStep[], ym: YearMonth): number {
  const at = ymToIndex(ym)
  const step = [...path].reverse().find((p) => ymToIndex(p.ym) <= at)
  if (!step) return path[0]?.outstanding ?? 0
  let owed = step.outstanding
  for (let i = ymToIndex(step.ym); i < at && owed > 0.005; i++) {
    const interest = owed * (step.rate / 12)
    owed = Math.max(0, owed + interest - Math.min(step.instalment, owed + interest))
  }
  return owed
}

export interface SaleInput {
  /** Years after keys: one of the CPF projection's horizons (5, 10, 15). */
  years: number
  price: number
  /** Agent's commission on the sale, as a fraction (0.01 = 1%), GST added on top. */
  agentPct?: number
}

export interface SaleResult {
  ym: YearMonth
  /** Before the MOP is over: can't be sold yet. */
  beforeMop: boolean
  mop: number
  loan: number
  /** Plus/Prime BTO: share of the price paid back to HDB; null when the rate isn't known. */
  recovery: number | null
  recoveryPct?: number
  agentFee: number
  /** CPF used plus accrued interest, by partner. */
  refundDue: Record<PartnerId, number>
  /** What actually goes back into CPF: all of it, or what the sale leaves after the loan and costs. */
  cpfBack: number
  cash: number
  /** The price at which the sale just covers the loan, costs and the full CPF refund. */
  breakEven: number
}

export function projectSale(s: Scenario, r: SimResult, policy: Policy, input: SaleInput): SaleResult | null {
  const point = r.accrued.find((a) => a.yearsAfterKeys === input.years)
  if (!point) return null
  const ym = addMonths(r.milestones.keys, input.years * 12)
  const mop = mopYears(s)
  const loan = outstandingAt(r.loanPath, ym)
  // Subsidy recovery applies to Plus and Prime flats bought new from HDB, at the project's rate.
  const picked = pickedProject(s)
  const recoveryPct = s.flat.classification !== 'Standard' && !isResale(s) && picked?.project.classification === s.flat.classification
    ? picked.project.subsidyRecoveryPct : undefined
  const recovery = s.flat.classification === 'Standard' || isResale(s) ? 0 : recoveryPct !== undefined ? input.price * recoveryPct / 100 : null
  const gst = policy.fees.gst
  const agentFee = input.price * (input.agentPct ?? 0) * (1 + gst)
  const refundDue = { A: point.perPartner.A.principal + point.perPartner.A.accrued, B: point.perPartner.B.principal + point.perPartner.B.accrued }
  const refund = refundDue.A + refundDue.B
  // A sale at market value only has to refund CPF from what's left after the loan; no cash top-up.
  const left = input.price - (recovery ?? 0) - loan - agentFee
  const cpfBack = Math.max(0, Math.min(refund, left))
  const cash = left - cpfBack
  const keep = 1 - (recoveryPct ?? 0) / 100 - (input.agentPct ?? 0) * (1 + gst)
  return { ym, beforeMop: input.years < mop, mop, loan, recovery, recoveryPct, agentFee, refundDue, cpfBack, cash, breakEven: (loan + refund) / keep }
}

/** Resale levy for buying another subsidised flat (BTO or EC) after selling this one; half for singles. */
export function resaleLevy(s: Scenario, policy: Policy): number {
  // A resale flat bought without a CPF housing grant isn't subsidised, so it carries no levy.
  if (isResale(s) && !s.flat.grants.some((g) => g.amount > 0 || g.auto)) return 0
  const levy = policy.resaleLevy[s.flat.type]
  return (s.buyers ?? 'couple') === 'single' ? levy / 2 : levy
}
