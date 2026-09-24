import type { Policy } from '../config/policy'
import { ageInMonths } from './cpf'
import { addMonths } from './dates'
import type { Scenario } from './types'

const cache = new WeakMap<Scenario, Scenario>()

/**
 * The scenario with dates adjusted for how the flat is bought:
 * - Open booking: no ballot, so the application month is the booking month.
 * - Completed flat (SBF / open booking): AFL is signed at key collection, and
 *   there's nothing to stagger (downpayment is paid in full then).
 * Idempotent and cached, so every part of the engine sees the same dates.
 */
export function normalizeScenario(s: Scenario): Scenario {
  const hit = cache.get(s)
  if (hit) return hit
  const type = s.flat.saleType ?? 'BTO'
  const completed = type !== 'BTO' && !!s.flat.completed
  if (type === 'BTO' || (!completed && type !== 'OBF')) {
    cache.set(s, s)
    return s
  }
  const dates = { ...s.flat.dates }
  if (type === 'OBF') dates.application = dates.booking
  if (completed) dates.afl = dates.keys
  const out: Scenario = {
    ...s,
    flat: { ...s.flat, dates },
    financing: completed ? { ...s.financing, staggered: false } : s.financing,
  }
  cache.set(s, out)
  cache.set(out, out)
  return out
}

export function isCompleted(s: Scenario): boolean {
  return (s.flat.saleType ?? 'BTO') !== 'BTO' && !!s.flat.completed
}

/**
 * Age-95 rule: share (0–1) of the normal CPF usage / HDB loan limit you get,
 * by how far the remaining lease covers the youngest buyer to age 95.
 * 0 if the remaining lease is 20 years or less.
 */
export function leaseFactor(s: Scenario, policy: Policy): { factor: number; lease: number; needed: number; youngest: number } {
  const lease = s.flat.remainingLeaseYears ?? 99
  const at = s.flat.dates.afl
  const youngest = Math.min(...s.partners.map((p) => Math.floor(ageInMonths(p.birthYearMonth, at) / 12)))
  const needed = Math.max(1, policy.lease.coverToAge - youngest)
  if (lease <= policy.lease.minYearsForCpf) return { factor: 0, lease, needed, youngest }
  return { factor: Math.min(1, lease / needed), lease, needed, youngest }
}

/** Typical milestone dates for each way of buying (you adjust them to your own). */
export function typicalDates(start: string, saleType: 'BTO' | 'SBF' | 'OBF', completed: boolean): Scenario['flat']['dates'] {
  if (saleType === 'OBF') {
    const booking = addMonths(start, 1)
    return completed
      ? { application: booking, booking, afl: addMonths(booking, 3), keys: addMonths(booking, 3) }
      : { application: booking, booking, afl: addMonths(booking, 6), keys: addMonths(booking, 18) }
  }
  const application = addMonths(start, 1)
  if (saleType === 'SBF') {
    const booking = addMonths(application, 3)
    return completed
      ? { application, booking, afl: addMonths(booking, 3), keys: addMonths(booking, 3) }
      : { application, booking, afl: addMonths(booking, 6), keys: addMonths(booking, 24) }
  }
  return { application, booking: addMonths(application, 5), afl: addMonths(application, 10), keys: addMonths(application, 46) }
}
