import type { YearMonth } from './types'

/** Months since year 0 — a simple integer index for YYYY-MM. */
export function ymToIndex(ym: YearMonth): number {
  const [y, m] = ym.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) throw new Error(`Bad YearMonth: ${ym}`)
  return y * 12 + (m - 1)
}

export function indexToYm(index: number): YearMonth {
  const y = Math.floor(index / 12)
  const m = index - y * 12 + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  return indexToYm(ymToIndex(ym) + n)
}

export function monthsBetween(from: YearMonth, to: YearMonth): number {
  return ymToIndex(to) - ymToIndex(from)
}

/** Calendar month 1–12. */
export function monthOf(ym: YearMonth): number {
  return Number(ym.split('-')[1])
}

export function currentYm(now = new Date()): YearMonth {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatYm(ym: YearMonth): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
