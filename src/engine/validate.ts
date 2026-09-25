import { formatYm, monthsBetween } from './dates'
import type { Milestone, Scenario } from './types'

export const MIN_YEAR = 1900
export const MAX_YEAR = 2199
/** Key collection this far after today is a typo; the simulation runs month by month up to it. */
export const MAX_YEARS_TO_KEYS = 30

const MILESTONE_LABEL: Record<Milestone, string> = {
  application: 'Application', booking: 'Booking', afl: 'AFL signing', keys: 'Key collection',
}
const YM = /^(\d+)-(\d{2})$/
/** Free text and ids, which could look like a date by chance. */
const TEXT_KEYS = new Set(['id', 'name', 'label', 'policyOverrides'])

/**
 * Dates the simulation can't sensibly run with (e.g. a year typed as 12022),
 * as a message for the person; null if the scenario is fine. The engine refuses
 * these rather than simulating thousands of years month by month.
 */
export function scenarioProblem(s: Scenario): string | null {
  for (const m of Object.keys(MILESTONE_LABEL) as Milestone[]) {
    const bad = badYear(s.flat.dates[m])
    if (bad) return `${MILESTONE_LABEL[m]} date: ${bad}`
  }
  for (const p of s.partners) {
    const bad = badYear(p.birthYearMonth)
    if (bad) return `${p.name}’s birth month: ${bad}`
  }
  const other = findBadDate(s)
  if (other) return `A date in this plan: ${other}`
  if (monthsBetween(s.startMonth, s.flat.dates.keys) > MAX_YEARS_TO_KEYS * 12) {
    return `Key collection (${formatYm(s.flat.dates.keys)}) is more than ${MAX_YEARS_TO_KEYS} years away. Check the year.`
  }
  return null
}

function badYear(ym: unknown): string | null {
  if (typeof ym !== 'string') return null
  const m = YM.exec(ym)
  if (!m) return null
  const year = Number(m[1])
  return year < MIN_YEAR || year > MAX_YEAR ? `the year ${year} looks like a typo (use ${MIN_YEAR}–${MAX_YEAR}).` : null
}

/** Any other "YYYY-MM" value anywhere in the scenario (costs, loan changes, pay changes…). */
function findBadDate(x: unknown): string | null {
  if (typeof x === 'string') return badYear(x)
  if (Array.isArray(x)) {
    for (const v of x) {
      const bad = findBadDate(v)
      if (bad) return bad
    }
  } else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (TEXT_KEYS.has(k)) continue
      const bad = findBadDate(v)
      if (bad) return bad
    }
  }
  return null
}
