import { LAUNCHES, TYPICAL_MONTHS_BETWEEN_LAUNCHES, TYPICAL_WAIT_MONTHS, type Launch } from '../config/launches'
import type { Policy } from '../config/policy'
import { checkPrice, type AffordLimit } from './afford'
import { addMonths } from './dates'
import { hfeValidUntil } from './eligibility'
import { setLaunchDates } from './launch'
import { resolvePolicy } from './policyOverrides'
import { normalizeScenario } from './saleType'
import type { Scenario, YearMonth } from './types'

/** One BTO sales exercise you could apply in, announced or estimated. */
export interface WindowLaunch {
  month: YearMonth
  /** From launches.ts; absent for a launch estimated from HDB's usual spacing. */
  launch?: Launch
  /** HFE letter at this launch: valid, in its last month (check the exact date), or expired. */
  hfe: 'valid' | 'lastMonth' | 'expired'
  /** Keys after a typical wait, or the shortest wait HDB stated for one of its projects. */
  keys: YearMonth
  /** HDB stated this wait (rather than a typical one). */
  statedWait: boolean
  /** The plan applies in this launch. */
  isPlan: boolean
  /** The plan, moved to this launch at its price: no cash shortfall, MSR/TDSR within limits. */
  ok: boolean
  limit?: AffordLimit
  firstShortYm?: YearMonth
}

export interface ApplyWindow {
  validUntil: YearMonth
  /** The valid-until month is from the letter (not worked out from the HFE month). */
  fromLetter: boolean
  launches: WindowLaunch[]
  /** Launches while the letter is valid (including its last month). */
  chances: number
}

/**
 * "Apply now or wait?": each BTO launch from this month while the HFE letter is valid, and the first one
 * after, with the keys it would give and whether the plan still works if it applied then (same price,
 * flat type and everything else). Launches HDB hasn't announced are spaced from the last announced one.
 */
export function applyWindow(raw: Scenario, policy: Policy = resolvePolicy(raw.policyOverrides)): ApplyWindow {
  const s = normalizeScenario(raw)
  const validUntil = hfeValidUntil(s, policy)
  const from = s.startMonth
  const known = LAUNCHES.filter((l) => l.applicationMonth >= from).sort((a, b) => a.applicationMonth.localeCompare(b.applicationMonth))
  const months: { month: YearMonth; launch?: Launch }[] = known.map((l) => ({ month: l.applicationMonth, launch: l }))
  // Estimates: one launch every few months after the last announced one, up to the first past the letter.
  let next = addMonths(LAUNCHES.map((l) => l.applicationMonth).sort().at(-1) ?? from, TYPICAL_MONTHS_BETWEEN_LAUNCHES)
  while (next < from) next = addMonths(next, TYPICAL_MONTHS_BETWEEN_LAUNCHES)
  while ((months.at(-1)?.month ?? from) <= validUntil && months.length < 8) {
    months.push({ month: next })
    next = addMonths(next, TYPICAL_MONTHS_BETWEEN_LAUNCHES)
  }
  const firstPast = months.findIndex((m) => m.month > validUntil)
  const shown = firstPast < 0 ? months : months.slice(0, firstPast + 1)

  const launches = shown.map(({ month, launch }): WindowLaunch => {
    const waits = launch?.projects.flatMap((p) => p.waitMonths ?? []) ?? []
    const wait = waits.length ? Math.min(...waits) : TYPICAL_WAIT_MONTHS
    const d = structuredClone(s)
    setLaunchDates(d, month, wait)
    const check = checkPrice(normalizeScenario(d), d.flat.price, policy)
    return {
      month, launch,
      hfe: month < validUntil ? 'valid' : month === validUntil ? 'lastMonth' : 'expired',
      keys: d.flat.dates.keys, statedWait: waits.length > 0,
      isPlan: month === s.flat.dates.application,
      ok: check.ok, limit: check.limit, firstShortYm: check.firstShortYm,
    }
  })
  return { validUntil, fromLetter: !!s.flat.hfeValidUntil, launches, chances: launches.filter((l) => l.hfe !== 'expired').length }
}
