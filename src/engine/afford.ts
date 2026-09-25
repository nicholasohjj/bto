import type { Policy } from '../config/policy'
import { resolvePolicy } from './policyOverrides'
import { normalizeScenario } from './saleType'
import { simulateCore } from './simulate'
import type { Scenario, YearMonth } from './types'
import { negativeCashMonths } from './warnings'

export type AffordLimit = 'cash' | 'msr' | 'tdsr'

export interface PriceCheck {
  price: number
  ok: boolean
  /** Why this price fails (first rule broken). */
  limit?: AffordLimit
  firstShortYm?: YearMonth
}

export interface AffordResult {
  /** Highest price (rounded down to `step`) that passes; undefined if even `min` fails. */
  maxPrice?: number
  /** What stops you going higher (undefined if `max` itself passes). */
  limitedBy?: AffordLimit
  /** The check just above `maxPrice` (the first price that fails). */
  next?: PriceCheck
  /** The check at `min` when nothing passes — tells you why. */
  failsAtMin?: PriceCheck
  /** True when `max` passes, so the real limit is higher than we searched. */
  aboveMax: boolean
  min: number
  max: number
}

export function withPrice(s: Scenario, price: number): Scenario {
  return { ...s, flat: { ...s.flat, price } }
}

/** Does this scenario work at this price? No month short of cash, MSR (and TDSR for bank loans) within limits. */
export function checkPrice(s: Scenario, price: number, policy: Policy): PriceCheck {
  const core = simulateCore(withPrice(s, price), policy)
  const neg = negativeCashMonths(core)
  if (neg.size) {
    const first = core.months.find((m) => neg.has(m.index))
    return { price, ok: false, limit: 'cash', firstShortYm: first?.ym }
  }
  const loan = core.schedule.loan
  if (loan.loanAmount > 0 && loan.grossIncomeAtAssessment > 0) {
    if (loan.msr > loan.msrLimit + 1e-9) return { price, ok: false, limit: 'msr' }
    if (s.financing.loanType === 'bank' && loan.tdsr > loan.tdsrLimit + 1e-9) return { price, ok: false, limit: 'tdsr' }
  }
  return { price, ok: true }
}

/**
 * "How much can we afford?": the highest flat price at which the plan has no
 * cash shortfall and passes MSR/TDSR, keeping everything else (loan type, LTV,
 * CPF slider, costs, dates) as it is. Binary search to `step`; assumes a
 * higher price never makes things easier.
 */
export function affordablePrice(
  raw: Scenario,
  opts: { min?: number; max?: number; step?: number } = {},
  policy: Policy = resolvePolicy(raw.policyOverrides),
): AffordResult {
  const s = normalizeScenario(raw)
  const step = opts.step ?? 1000
  const min = opts.min ?? 50_000
  const max = opts.max ?? Math.max(1_500_000, Math.ceil((s.flat.price * 2) / step) * step)

  const atMin = checkPrice(s, min, policy)
  if (!atMin.ok) return { failsAtMin: atMin, aboveMax: false, min, max }
  const atMax = checkPrice(s, max, policy)
  if (atMax.ok) return { maxPrice: max, aboveMax: true, min, max }

  // Invariant: lo passes, hi fails.
  let lo = min
  let hi = max
  let hiCheck = atMax
  while (hi - lo > step) {
    const mid = Math.floor((lo + hi) / 2 / step) * step
    if (mid <= lo || mid >= hi) break
    const c = checkPrice(s, mid, policy)
    if (c.ok) lo = mid
    else { hi = mid; hiCheck = c }
  }
  return { maxPrice: lo, limitedBy: hiCheck.limit, next: hiCheck, aboveMax: false, min, max }
}
