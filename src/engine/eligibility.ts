import type { GrantTier, Policy } from '../config/policy'
import { isWorking, salaryAt } from './cpf'
import { addMonths } from './dates'
import type { Scenario, YearMonth } from './types'
import { ageInMonths } from './cpf'
import { isCompleted, isResale, isSingle, isSinglesPurchase, leaseFactor, normalizeScenario } from './saleType'

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
  /** Resale: CPF Housing Grant for resale flats (Families), and the Proximity Housing Grant. */
  familyGrant: number
  familyGrantReason: string
  phg: number
  phgReason: string
  /** One citizen + one PR. */
  scSpr: boolean
  /** Both PRs: can't buy a BTO flat. */
  bothSpr: boolean
  /** Extra paid on the flat by SC/SPR households. */
  premium: number
  /** Singles / Joint Singles: problems with eligibility (age, citizenship, flat type, first-timer). */
  singlesIssues: string[]
  /**
   * Income used to decide whether you can buy the flat: at the HFE application
   * (application month), even under DIA — the grant/loan income above is deferred.
   */
  purchaseAvgIncome: number
  purchaseAssessedAt: YearMonth
  /** HDB loan household income ceiling (families / singles / joint singles). */
  hdbLoanIncomeCeiling: number
  /** Under DIA: income at the deferred assessment is above the HDB loan ceiling. */
  hdbLoanBlockedByDia: boolean
}

export function tierAmount(income: number, tiers: GrantTier[]): number {
  if (income < 0) return 0
  return tiers.find((t) => income <= t.upTo)?.amount ?? 0
}

/** When you apply for the HFE letter: as set, or a month before the flat application. */
export function hfeMonth(s: Scenario, policy: Policy): YearMonth {
  return s.flat.hfeMonth ?? addMonths(s.flat.dates.application, -policy.hfe.monthsBeforeApplication)
}

/**
 * Month HDB assesses income for the grant: when you apply for the HFE letter,
 * or ~3 months before keys under DIA.
 */
export function grantAssessmentMonth(raw: Scenario, policy: Policy): YearMonth {
  const s = normalizeScenario(raw)
  if (s.financing.deferredIncomeAssessment) {
    // DIA on a completed flat: assessed at flat booking.
    if (isCompleted(s)) return s.flat.dates.booking
    return addMonths(s.flat.dates.keys, -policy.dia.assessmentMonthsBeforeKeys)
  }
  return hfeMonth(s, policy)
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
  // HDB's method: each person's total income over the 12-month window divided by the months they
  // actually worked (no-pay months don't count), then added up across the household.
  const averageTo = (end: YearMonth) => s.partners.reduce((sum, p) => {
    let total = 0
    let worked = 0
    for (let i = 0; i < months; i++) {
      const ym = addMonths(end, -i)
      if (!isWorking(p, ym)) continue
      total += salaryAt(p, s.startMonth, ym)
      worked++
    }
    return sum + (worked ? total / worked : 0)
  }, 0)
  // Grant (and, under DIA, HDB loan) income: at the HFE application, or deferred under DIA.
  const avgIncome = averageTo(windowEnd)
  // Buying the flat is decided at the HFE application, even under DIA.
  const purchaseAssessedAt = hfeMonth(s, policy)
  const purchaseAvgIncome = s.financing.deferredIncomeAssessment
    ? averageTo(addMonths(purchaseAssessedAt, -el.ehgIncomeLagMonths))
    : avgIncome

  const singles = isSinglesPurchase(s)
  const resale = isResale(s)
  const incomeCeiling = isSingle(s)
    ? el.incomeCeilingSingles
    : s.buyers === 'jointSingles'
      ? el.incomeCeilingJointSingles
      // Resale: no ceiling to buy; the families' ceiling applies to grants and the HDB loan (2-room Flexi's lower one is for new flats).
      : s.flat.type === '2R' && s.flat.saleType !== 'resale' ? el.incomeCeiling2RFlexi : s.flat.type === '3Gen' ? el.incomeCeilingExtended : el.incomeCeilingFamilies
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
    if (resale) {
      // Resale: any flat type except 3Gen; in Prime projects, 2-room only (hdb.gov.sg classification page).
      if (s.flat.type === '3Gen') singlesIssues.push('Singles can’t buy a 3Gen flat.')
      else if (s.flat.classification === 'Prime' && s.flat.type !== '2R') singlesIssues.push('Singles can only buy a 2-room resale flat in a Prime project.')
    } else {
      if (household !== 'firstTimers') singlesIssues.push('Singles who have owned a subsidised flat or had a housing grant before can’t buy a new flat from HDB.')
      if (s.flat.type !== '2R') singlesIssues.push('Singles can only buy a 2-room Flexi when buying a new flat (BTO, SBF or open booking), in any location.')
    }
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
  // Full EHG only if the remaining lease covers the youngest to 95; otherwise pro-rated (none at ≤ 20 years).
  const lease = leaseFactor(s, policy)
  if (ehg > 0 && lease.factor < 1) {
    ehg = Math.round(ehg * lease.factor)
    ehgReason += ` Pro-rated to ${Math.round(lease.factor * 100)}% because the lease doesn’t cover the youngest of you to ${policy.lease.coverToAge}.`
  }

  let stepUp = 0
  let stepUpReason: string
  if (household !== 'secondTimers') stepUpReason = 'Only for second-timer families.'
  else if (!s.flat.fromRentalOr2Room) stepUpReason = 'Only if you now live in public rental, or own a 2-room or 3-room flat (Standard, or in a non-mature estate).'
  else if (!(s.flat.type === '2R' || s.flat.type === '3R') || s.flat.classification !== 'Standard') stepUpReason = 'Only for a 2-room Flexi or 3-room Standard flat.'
  else if (avgIncome > el.stepUpIncomeCeiling) stepUpReason = `Income is above $${el.stepUpIncomeCeiling.toLocaleString()}.`
  else if (!employmentOk) stepUpReason = `Needs ${months} months of continuous work.`
  else {
    stepUp = el.stepUpAmount
    stepUpReason = 'Eligible.'
  }

  // --- Resale grants (hdb.gov.sg): CPF Housing Grant for resale flats (Families), Proximity Housing Grant ---
  const big = s.flat.type === '5R' || s.flat.type === '3Gen' || s.flat.type === 'Exec' ? 1 : 0
  const grantCeiling = s.flat.type === '3Gen' ? el.incomeCeilingExtended : el.incomeCeilingFamilies
  let familyGrant = 0
  let familyGrantReason: string
  const r = policy.resale
  if (!resale) familyGrantReason = 'Only for resale flats.'
  else if (singles) familyGrantReason = 'Singles have a separate resale grant, not modelled here.'
  else if (bothSpr) familyGrantReason = 'At least one of you must be a Singapore Citizen.'
  else if (household === 'secondTimers') familyGrantReason = 'Only for first-timers (or a first-timer with a second-timer).'
  else if (avgIncome > grantCeiling) familyGrantReason = `Household income is above $${grantCeiling.toLocaleString()}.`
  else {
    familyGrant = (household === 'firstAndSecond' ? r.familyGrantFtSt : scSpr ? r.familyGrantScSpr : r.familyGrantScSc)[big]
    familyGrantReason = `${household === 'firstAndSecond' ? 'First-timer + second-timer couple' : scSpr ? 'Citizen + PR couple' : 'Two Singapore Citizens'}, ${big ? '5-room or bigger' : '2- to 4-room'} flat.`
  }
  // EHG on a resale flat needs the resale Family Grant first (hdb.gov.sg EHG page).
  if (resale && !isSingle(s) && ehg > 0 && familyGrant === 0) {
    ehg = 0
    ehgReason = 'For a resale flat, you must first qualify for the CPF Housing Grant for resale flats.'
  }
  let phg = 0
  let phgReason: string
  if (!resale) phgReason = 'Only for resale flats.'
  else if (singles) phgReason = 'Singles have a separate Proximity Housing Grant, not modelled here.'
  else if (bothSpr) phgReason = 'At least one of you must be a Singapore Citizen.'
  else if (!s.flat.proximity) phgReason = 'Only if you’ll live with, or within 4 km of, your parents or child.'
  else {
    phg = s.flat.proximity === 'with' ? r.phgWith : r.phgNear
    phgReason = s.flat.proximity === 'with' ? 'Living with your parents or child.' : 'Living within 4 km of your parents or child.'
  }

  const hdbLoanIncomeCeiling = isSingle(s)
    ? el.incomeCeilingSingles
    : s.buyers === 'jointSingles' ? el.incomeCeilingJointSingles
      : s.flat.type === '3Gen' ? el.incomeCeilingExtended : el.incomeCeilingFamilies
  const hdbLoanBlockedByDia = !!s.financing.deferredIncomeAssessment && s.financing.loanType === 'HDB' && avgIncome > hdbLoanIncomeCeiling

  return {
    assessedAt,
    windowEnd,
    avgIncome,
    incomeCeiling,
    // No income ceiling to buy a resale flat (only for grants and the HDB loan).
    aboveCeiling: !resale && purchaseAvgIncome > incomeCeiling,
    purchaseAvgIncome,
    purchaseAssessedAt,
    hdbLoanIncomeCeiling,
    hdbLoanBlockedByDia,
    household,
    employmentOk,
    ehg,
    ehgReason,
    stepUp,
    stepUpReason,
    familyGrant,
    familyGrantReason,
    phg,
    phgReason,
    scSpr,
    bothSpr,
    // The citizen + PR premium is for new flats from HDB.
    premium: !resale && scSpr && household !== 'secondTimers' ? el.scSprPremium : 0,
    singlesIssues,
  }
}
