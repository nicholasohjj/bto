import type { GrantTier, Policy } from '../config/policy'
import { isWorking, salaryAt } from './cpf'
import { addMonths } from './dates'
import type { Scenario, YearMonth } from './types'
import { ageInMonths } from './cpf'
import { isCompleted, isSingle, isSinglesPurchase, normalizeScenario } from './saleType'

export interface Eligibility {
  /** Month the HFE letter / income assessment is assumed (application, or DIA assessment). */
  assessedAt: YearMonth
  /** Last month of the 12-month income window. */
  windowEnd: YearMonth
  /** Average gross monthly household income over the window. */
  avgIncome: number
  incomeCeiling: number
  aboveCeiling: boolean
  household: NonNullable<Scenario['flat']['household']>
  /** At least one of you worked continuously for 12 months and works at assessment. */
  employmentOk: boolean
  /** Enhanced CPF Housing Grant from income and household (0 if not eligible). */
  ehg: number
  ehgReason: string
  stepUp: number
  stepUpReason: string
  /** One citizen + one PR. */
  scSpr: boolean
  /** Both PRs: can't buy a BTO flat. */
  bothSpr: boolean
  /** Extra paid on the flat by SC/SPR households. */
  premium: number
  /** Singles / Joint Singles: problems with eligibility (age, citizenship, flat type, first-timer). */
  singlesIssues: string[]
}

export function tierAmount(income: number, tiers: GrantTier[]): number {
  if (income < 0) return 0
  return tiers.find((t) => income <= t.upTo)?.amount ?? 0
}

/**
 * Month HDB assesses income for the grant: when you apply for the HFE letter
 * (assumed = BTO application month), or ~3 months before keys under DIA.
 */
export function grantAssessmentMonth(raw: Scenario, policy: Policy): YearMonth {
  const s = normalizeScenario(raw)
  if (s.financing.deferredIncomeAssessment) {
    // DIA on a completed flat: assessed at flat booking.
    if (isCompleted(s)) return s.flat.dates.booking
    return addMonths(s.flat.dates.keys, -policy.dia.assessmentMonthsBeforeKeys)
  }
  return s.flat.dates.application
}

export function householdIncome(s: Scenario, ym: YearMonth): number {
  return s.partners.reduce((sum, p) => sum + salaryAt(p, s.startMonth, ym), 0)
}

export function assessEligibility(raw: Scenario, policy: Policy): Eligibility {
  const s = normalizeScenario(raw)
  const el = policy.eligibility
  const assessedAt = grantAssessmentMonth(s, policy)
  const windowEnd = addMonths(assessedAt, -el.ehgIncomeLagMonths)
  const months = el.ehgEmploymentMonths
  let total = 0
  for (let i = 0; i < months; i++) total += householdIncome(s, addMonths(windowEnd, -i))
  const avgIncome = total / months

  const singles = isSinglesPurchase(s)
  const incomeCeiling = isSingle(s)
    ? el.incomeCeilingSingles
    : s.buyers === 'jointSingles'
      ? el.incomeCeilingJointSingles
      : s.flat.type === '2R' ? el.incomeCeiling2RFlexi : s.flat.type === '3Gen' ? el.incomeCeilingExtended : el.incomeCeilingFamilies
  const household = s.flat.household ?? 'firstTimers'

  // Employment: someone worked every month of the 12-month window (no gaps) and is working at assessment.
  const employmentOk = s.partners.some((p) => {
    if (!isWorking(p, assessedAt)) return false
    for (let i = 0; i < months; i++) if (!isWorking(p, addMonths(windowEnd, -i))) return false
    return p.grossMonthly > 0 || p.employment === 'selfEmployed'
  })

  const cit = s.partners.map((p) => p.citizenship ?? 'SC')
  const bothSpr = cit.every((c) => c === 'SPR')
  const scSpr = !bothSpr && cit.includes('SPR')

  // Singles: SC, 35+, first-timers, 2-room Flexi for new flats.
  const singlesIssues: string[] = []
  if (singles) {
    const people = isSingle(s) ? [s.partners[0]] : s.partners
    const ages = people.map((p) => Math.floor(ageInMonths(p.birthYearMonth, s.flat.dates.application) / 12))
    if (ages.some((a) => a < el.singlesMinAge)) singlesIssues.push(`Singles must be ${el.singlesMinAge} or older when applying (${isSingle(s) ? `you’ll be ${ages[0]}` : `you’ll be ${ages.join(' and ')}`}).`)
    if (people.some((p) => (p.citizenship ?? 'SC') !== 'SC')) singlesIssues.push('Singles must be Singapore Citizens to buy an HDB flat.')
    if (household !== 'firstTimers') singlesIssues.push('Singles who have owned a subsidised flat or had a housing grant before can’t buy a new flat from HDB.')
    if (s.flat.type !== '2R') singlesIssues.push('Singles can only buy a 2-room Flexi when buying a new flat (BTO, SBF or open booking), in any location.')
  }

  let ehg = 0
  let ehgReason: string
  if (singlesIssues.length) ehgReason = 'Not eligible as singles: ' + singlesIssues[0]
  else if (isSingle(s)) {
    ehg = employmentOk ? tierAmount(avgIncome, el.ehgSingles) : 0
    ehgReason = !employmentOk
      ? `Needs you to have worked continuously for ${months} months when HDB assesses income.`
      : ehg > 0 ? 'Singles grant table, based on your average income.' : `Your average income is above the $${(el.ehgSingles.at(-1)?.upTo ?? 0).toLocaleString()} grant ceiling for singles.`
  } else if (bothSpr) ehgReason = 'Two PRs can’t buy a BTO flat or get the grant.'
  else if (household === 'secondTimers') ehgReason = 'Second-timer couples don’t get the Enhanced CPF Housing Grant.'
  else if (!employmentOk) ehgReason = `Needs at least one of you to have worked continuously for ${months} months when HDB assesses income.`
  else if (household === 'firstAndSecond') {
    ehg = tierAmount(avgIncome / 2, el.ehgSingles)
    ehgReason = `First-timer + second-timer couple: singles table on half your income (${Math.round(avgIncome / 2).toLocaleString()}).`
  } else {
    ehg = tierAmount(avgIncome, el.ehgFamilies)
    const top = el.ehgFamilies[el.ehgFamilies.length - 1]?.upTo ?? 0
    ehgReason = ehg > 0 ? 'Based on your average household income.' : `Average income is above the $${top.toLocaleString()} grant ceiling.`
  }

  let stepUp = 0
  let stepUpReason: string
  if (household !== 'secondTimers') stepUpReason = 'Only for second-timer families.'
  else if (!s.flat.fromRentalOr2Room) stepUpReason = 'Only if you now live in public rental or own a 2-room flat.'
  else if (!(s.flat.type === '2R' || s.flat.type === '3R') || s.flat.classification !== 'Standard') stepUpReason = 'Only for a 2-room Flexi or 3-room Standard flat.'
  else if (avgIncome > el.stepUpIncomeCeiling) stepUpReason = `Income is above $${el.stepUpIncomeCeiling.toLocaleString()}.`
  else if (!employmentOk) stepUpReason = `Needs ${months} months of continuous work.`
  else {
    stepUp = el.stepUpAmount
    stepUpReason = 'Eligible.'
  }

  return {
    assessedAt,
    windowEnd,
    avgIncome,
    incomeCeiling,
    aboveCeiling: avgIncome > incomeCeiling,
    household,
    employmentOk,
    ehg,
    ehgReason,
    stepUp,
    stepUpReason,
    scSpr,
    bothSpr,
    premium: scSpr && household !== 'secondTimers' ? el.scSprPremium : 0,
    singlesIssues,
  }
}
