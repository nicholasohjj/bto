import type { FlatType, Policy } from '../config/policy'
import { tieredAmount } from './tiers'

/** Buyer's Stamp Duty, rounded down to the dollar, minimum $1. */
export function buyersStampDuty(price: number, policy: Policy): number {
  if (price <= 0) return 0
  return Math.max(1, Math.floor(tieredAmount(price, policy.bsdTiers) + 1e-9))
}

/** HDB conveyancing fee on an amount (price or loan), incl. GST. */
export function conveyancingFee(amount: number, policy: Policy): number {
  if (amount <= 0) return 0
  const { conveyancingTiers, conveyancingMin, gst } = policy.fees
  // HDB rounds the fee (not the amount) up to the next dollar, then adds GST.
  const fee = Math.ceil(tieredAmount(amount, conveyancingTiers) - 1e-9) * (1 + gst)
  return round2(Math.max(conveyancingMin, fee))
}

/**
 * Estimated legal fees. HDB loan: HDB conveyancing on the price (lease) plus on
 * the loan (mortgage). Bank loan: private lawyer estimate.
 */
export function legalFees(price: number, loanAmount: number, loanType: 'HDB' | 'bank', policy: Policy): number {
  if (loanType === 'bank') return policy.fees.bankLegalFee
  return round2(conveyancingFee(price, policy) + (loanAmount > 0 ? conveyancingFee(loanAmount, policy) : 0))
}

/** HDB's resale legal fee on an amount: per $100 or part, rounded up to the dollar, + GST, with a minimum. */
function resaleFee(amount: number, min: number, policy: Policy): number {
  if (amount <= 0) return 0
  const r = policy.resale
  const rounded = Math.ceil(amount / r.legalRoundTo - 1e-9) * r.legalRoundTo
  return round2(Math.max(min, Math.ceil(tieredAmount(rounded, r.legalTiers) - 1e-9) * (1 + policy.fees.gst)))
}

/**
 * Resale legal fees. HDB acting (HDB loan): transfer fee on the price plus mortgage fee on the loan.
 * Bank loan: private lawyer estimate.
 */
export function resaleLegalFees(price: number, loanAmount: number, loanType: 'HDB' | 'bank', type: FlatType, policy: Policy): number {
  if (loanType === 'bank') return policy.fees.bankLegalFee
  const r = policy.resale
  const mortgage = loanAmount > 0 ? resaleFee(loanAmount, type === '2R' ? r.mortgageLegalMinSmall : r.mortgageLegalMin, policy) : 0
  return round2(resaleFee(price, r.legalMin, policy) + mortgage)
}

export function optionFee(type: FlatType, policy: Policy): number {
  return policy.optionFee[type]
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
