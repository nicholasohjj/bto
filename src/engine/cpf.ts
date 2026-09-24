import type { ContributionBand, Policy } from '../config/policy'
import { ymToIndex } from './dates'
import type { Partner, YearMonth } from './types'

export function ageInMonths(birth: YearMonth, at: YearMonth): number {
  return ymToIndex(at) - ymToIndex(birth)
}

/**
 * Contribution band for an age. Rates change from the month after the
 * birthday, so "55 and below" covers up to and including the birthday month.
 */
export function bandFor(ageMonths: number, policy: Policy): ContributionBand {
  const bands = policy.cpf.bands
  return bands.find((b) => ageMonths <= b.maxAgeYears * 12) ?? bands[bands.length - 1]
}

type NoIncome = Extract<NonNullable<Partner['incomeChanges']>[number], { kind: 'noIncome' }>
type NewSalary = Extract<NonNullable<Partner['incomeChanges']>[number], { kind: 'newSalary' }>

/** The gap without income covering this month, if any. */
export function incomeGapAt(partner: Partner, ym: YearMonth): NoIncome | undefined {
  return partner.incomeChanges?.find(
    (c): c is NoIncome => c.kind === 'noIncome' && ym >= c.from && (!c.until || ym <= c.until),
  )
}

/** Latest salary change on or before this month. */
function salaryChangeAt(partner: Partner, ym: YearMonth): NewSalary | undefined {
  let best: NewSalary | undefined
  for (const c of partner.incomeChanges ?? []) {
    if (c.kind === 'newSalary' && c.from <= ym && (!best || c.from >= best.from)) best = c
  }
  return best
}

/** True if the partner has earned income this month (started work and not in a gap). */
export function isWorking(partner: Partner, ym: YearMonth): boolean {
  if (partner.workStartMonth && ymToIndex(ym) < ymToIndex(partner.workStartMonth)) return false
  return !incomeGapAt(partner, ym)
}

/** Raise applied in a given January: that year's override, else the usual raise. */
function raiseFor(partner: Partner, year: number): number {
  const o = partner.incomeChanges?.find((c) => c.kind === 'raise' && c.year === year)
  return o && o.kind === 'raise' ? o.pct : partner.annualRaisePct
}

/**
 * Gross monthly salary in a month. Pay starts from `grossMonthly` (at the start,
 * or when work starts), or from the latest "new salary" change; raises apply each
 * January after that. 0 before work starts and during gaps without income.
 */
export function salaryAt(partner: Partner, startMonth: YearMonth, ym: YearMonth): number {
  if (!isWorking(partner, ym)) return 0
  const change = salaryChangeAt(partner, ym)
  let base = partner.grossMonthly
  let baseYm = partner.workStartMonth && partner.workStartMonth > startMonth ? partner.workStartMonth : startMonth
  if (change) {
    base = change.salary
    baseYm = change.from
  }
  let pay = base
  for (let y = Number(baseYm.slice(0, 4)) + 1; y <= Number(ym.slice(0, 4)); y++) pay *= 1 + raiseFor(partner, y) / 100
  return pay
}

/** Cash saved (or spent, if negative) in a month. */
export function cashSavingsAt(partner: Partner, ym: YearMonth): number {
  if (partner.workStartMonth && ymToIndex(ym) < ymToIndex(partner.workStartMonth)) return partner.preWorkMonthlySavings ?? 0
  const gap = incomeGapAt(partner, ym)
  if (gap) return gap.monthlyCashChange
  return salaryChangeAt(partner, ym)?.monthlyCashSavings ?? partner.monthlyCashSavings
}

/**
 * Rough living costs covered by pay each month: take-home pay (after 20%
 * employee CPF, or full pay if self-employed) minus what's saved. Used as the
 * default spending from savings during a gap without income.
 */
export function estimatedLivingCosts(partner: Partner, startMonth: YearMonth, ym: YearMonth): number {
  const wage = salaryAt(partner, startMonth, ym) || partner.grossMonthly
  const takeHome = partner.employment === 'selfEmployed' ? wage : wage - Math.min(wage, 8000) * 0.2
  return Math.max(0, Math.round((takeHome - partner.monthlyCashSavings) / 50) * 50)
}

export interface Rates {
  employer: number
  employee: number
  oaRatio: number
}

/** Years (1, 2, 3+) of PR status in a month; 0 for citizens. */
export function prYear(partner: Partner, ym: YearMonth): number {
  if (partner.citizenship !== 'SPR') return 0
  if (!partner.prSinceMonth) return 3
  return Math.floor(Math.max(0, ymToIndex(ym) - ymToIndex(partner.prSinceMonth)) / 12) + 1
}

/**
 * Contribution rates for a person in a month: full SC rates by age, or the
 * graduated SPR rates in the first two years of PR (OA share as for SCs).
 */
export function ratesFor(ageMonths: number, policy: Policy, sprYear = 0): Rates {
  const band = bandFor(ageMonths, policy)
  if (sprYear === 1 || sprYear === 2) {
    const table = sprYear === 1 ? policy.cpf.spr.year1 : policy.cpf.spr.year2
    const g = table.find((b) => ageMonths <= b.maxAgeYears * 12) ?? table[table.length - 1]
    return { employer: g.employer, employee: g.employee, oaRatio: band.oaRatio }
  }
  return { employer: band.employer, employee: band.employee, oaRatio: band.oaRatio }
}

export interface MonthlyCpf {
  /** Total CPF (employer + employee) on ordinary wages. */
  total: number
  /** Employee's share (deducted from pay). */
  employee: number
  oa: number
}

/**
 * CPF on a month's ordinary wage, including the low-wage rules:
 * ≤ $50 nil; ≤ $500 employer only; ≤ $750 employee share phased in.
 */
export function ordinaryWageCpf(wage: number, ageMonths: number, policy: Policy, rates: Rates = ratesFor(ageMonths, policy)): MonthlyCpf {
  const lw = policy.cpf.lowWage
  const tw = Math.max(0, wage)
  let total: number
  let employee: number
  if (tw <= lw.nilUpTo) {
    total = 0
    employee = 0
  } else if (tw <= lw.employerOnlyUpTo) {
    total = tw * rates.employer
    employee = 0
  } else if (tw <= lw.phaseInUpTo) {
    employee = lw.employeeFactor * rates.employee * (tw - lw.employerOnlyUpTo)
    total = tw * rates.employer + employee
  } else {
    const ow = Math.min(tw, policy.cpf.owCeilingMonthly)
    total = ow * (rates.employer + rates.employee)
    employee = ow * rates.employee
  }
  return { total, employee, oa: total * rates.oaRatio }
}

export interface BonusCpf {
  /** Part of the bonus that attracts CPF (limited by the annual ceiling). */
  subject: number
  oa: number
  /** Bonus after employee CPF is deducted. */
  netBonus: number
}

/**
 * CPF on a bonus (Additional Wage). The AW ceiling is the annual salary
 * ceiling minus ordinary wages subject to CPF in that calendar year.
 */
export function bonusCpf(bonus: number, monthlyWage: number, ageMonths: number, policy: Policy, rates: Rates = ratesFor(ageMonths, policy)): BonusCpf {
  const owForYear = Math.min(monthlyWage, policy.cpf.owCeilingMonthly) * 12
  const awCeiling = Math.max(0, policy.cpf.annualSalaryCeiling - owForYear)
  const subject = Math.min(Math.max(0, bonus), awCeiling)
  const total = subject * (rates.employer + rates.employee)
  return { subject, oa: total * rates.oaRatio, netBonus: bonus - subject * rates.employee }
}

/**
 * A partner's mandatory CPF for a month. Self-employed people have no
 * employer CPF (voluntary top-ups are scheduled separately).
 */
export function partnerMonthCpf(partner: Partner, wage: number, ym: YearMonth, policy: Policy) {
  const age = ageInMonths(partner.birthYearMonth, ym)
  if (partner.employment === 'selfEmployed') return { oa: 0, total: 0, rates: null, age }
  const rates = ratesFor(age, policy, prYear(partner, ym))
  const c = ordinaryWageCpf(wage, age, policy, rates)
  return { oa: c.oa, total: c.total, rates, age }
}

/** A bonus's dollar amount in a month (0 if not paid then). */
export function bonusAmount(b: Partner['bonuses'][number], wage: number, ym: YearMonth): number {
  if (b.paidInMonth !== Number(ym.slice(5))) return 0
  if (b.year && Number(ym.slice(0, 4)) !== b.year) return 0
  return Math.max(0, b.amount ?? b.months * wage)
}
