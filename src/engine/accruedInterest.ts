import { addMonths, monthOf, ymToIndex } from './dates'
import type { HousingWithdrawal } from './simulate'
import type { AccruedPoint, PartnerId, YearMonth } from './types'

export const ACCRUED_HORIZONS = [5, 10, 15]

export interface AccruedInput {
  withdrawals: HousingWithdrawal[]
  keys: YearMonth
  /** Simulation end; monthly mortgage CPF is projected after this. */
  simEnd: YearMonth
  /** CPF used per month for the mortgage after simEnd, per partner. */
  monthlyMortgageCpf: Record<PartnerId, number>
  /** Month the loan is fully repaid (no projection beyond). */
  loanEnd: YearMonth
  rate: number
}

/**
 * Accrued interest on CPF used for housing: the interest the money would have
 * earned in the OA. Interest is computed monthly and compounded yearly
 * (credited each December), matching how CPF credits OA interest.
 */
export function projectAccruedInterest(input: AccruedInput, horizons = ACCRUED_HORIZONS): AccruedPoint[] {
  const ids: PartnerId[] = ['A', 'B']
  const byMonth = new Map<number, Record<PartnerId, number>>()
  const add = (idx: number, id: PartnerId, amt: number) => {
    const row = byMonth.get(idx) ?? { A: 0, B: 0 }
    row[id] += amt
    byMonth.set(idx, row)
  }
  for (const w of input.withdrawals) add(ymToIndex(w.ym), w.partner, w.amount)

  const simEndIdx = ymToIndex(input.simEnd)
  const loanEndIdx = ymToIndex(input.loanEnd)
  const keysIdx = ymToIndex(input.keys)
  const targets = horizons.map((y) => keysIdx + y * 12)
  const lastTarget = Math.max(...targets)
  const firstIdx = Math.min(keysIdx, ...Array.from(byMonth.keys()))

  const principal = { A: 0, B: 0 }
  const accrued = { A: 0, B: 0 }
  const pendingInt = { A: 0, B: 0 }
  const out: AccruedPoint[] = []

  for (let idx = firstIdx; idx <= lastTarget; idx++) {
    const ym = addMonths(input.keys, idx - keysIdx)
    const row = byMonth.get(idx)
    for (const id of ids) {
      let w = row?.[id] ?? 0
      if (idx > simEndIdx && idx <= loanEndIdx) w += input.monthlyMortgageCpf[id]
      principal[id] += w
      pendingInt[id] += (principal[id] + accrued[id]) * (input.rate / 12)
      if (monthOf(ym) === 12) {
        accrued[id] += pendingInt[id]
        pendingInt[id] = 0
      }
    }
    const h = targets.indexOf(idx)
    if (h >= 0) {
      // Include interest accrued so far this year (as CPF would on a sale mid-year).
      const acc = { A: accrued.A + pendingInt.A, B: accrued.B + pendingInt.B }
      out.push({
        yearsAfterKeys: horizons[h],
        principal: principal.A + principal.B,
        accrued: acc.A + acc.B,
        refundDue: principal.A + principal.B + acc.A + acc.B,
        perPartner: {
          A: { principal: principal.A, accrued: acc.A },
          B: { principal: principal.B, accrued: acc.B },
        },
      })
    }
  }
  return out
}
