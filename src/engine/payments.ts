import type { Policy } from '../config/policy'
import { addMonths, ymToIndex } from './dates'
import { monthlyInstalment } from './loan'
import { buyersStampDuty, legalFees, optionFee, round2 } from './stampDuty'
import type { CostItem, CostKind, FundingRule, LoanInfo, Milestone, Payer, PartnerId, Scenario, When, YearMonth } from './types'
import { ageInMonths, salaryAt } from './cpf'
import { assessEligibility, type Eligibility } from './eligibility'
import { isCompleted, leaseFactor, normalizeScenario } from './saleType'

/** One dated payment the simulation must make. */
export interface Obligation {
  id: string
  label: string
  kind: CostKind | 'downpayment' | 'rent' | 'voluntaryCpf'
  ym: YearMonth
  amount: number
  funding: FundingRule
  /** Part of `amount` that must be paid in cash even when CPF is allowed. */
  minCash: number
  /** Part of `amount` paid from grant money already credited to OA. */
  grantFunded: number
  payer: Payer
  /** CPF used for this counts as "CPF used for housing" (accrued interest applies). */
  housing: boolean
  /** Downpayment tranche — HDB "use OA beyond retained amount" rule applies. */
  downpayment: boolean
  milestone?: Milestone
  delayable: boolean
  /** Id of the CostItem this came from (for solver tweaks). */
  sourceId: string
  /** Moves money from CPF OA back to cash (e.g. BSD reimbursement with a bank loan). */
  reimburse?: boolean
  /** Voluntary CPF top-up: cash out, CPF in (capped by the Annual Limit). */
  cpfTopUp?: boolean
  /**
   * Switching to a bank loan before keys: total cash across the downpayment
   * (option fee + AFL + keys) must reach this, so the keys payment makes up the rest.
   */
  cashRuleTotal?: number
}

export interface GrantCredit {
  id: string
  label: string
  ym: YearMonth
  amounts: Record<PartnerId, number>
}

export interface Schedule {
  obligations: Obligation[]
  grantCredits: GrantCredit[]
  loan: LoanInfo
  eligibility: Eligibility
}

const HOUSING_KINDS: CostKind[] = ['bsd', 'legal', 'survey', 'caveat']

export function resolveWhen(when: When, dates: Record<Milestone, YearMonth>): YearMonth {
  if ('date' in when) return when.date
  return addMonths(dates[when.milestone], when.offsetMonths ?? 0)
}

/** Flat price plus the SC/SPR premium, if any. */
export function effectivePrice(scenario: Scenario, policy: Policy): number {
  return scenario.flat.price + assessEligibility(scenario, policy).premium
}

/** Income-weighted average age of the borrowers in a month (MAS rule for joint loans). */
export function weightedAge(scenario: Scenario, ym: YearMonth): number {
  const ages = scenario.partners.map((p) => ageInMonths(p.birthYearMonth, ym) / 12)
  const incomes = scenario.partners.map((p) => salaryAt(p, scenario.startMonth, ym))
  const total = incomes[0] + incomes[1]
  return total > 0 ? (ages[0] * incomes[0] + ages[1] * incomes[1]) / total : (ages[0] + ages[1]) / 2
}

/**
 * Highest LTV allowed. Bank loans drop to the reduced LTV if the tenure is
 * over 25 years or the loan runs past (weighted) age 65.
 */
export function maxLtvFor(raw: Scenario, policy: Policy): { max: number; reduced: boolean; reason?: string } {
  const scenario = normalizeScenario(raw)
  const f = scenario.financing
  if (f.loanType === 'HDB') {
    // Age-95 rule: HDB loan limit pro-rated if the lease won't last the youngest of you to 95.
    const lf = leaseFactor(scenario, policy)
    if (lf.factor < 1) {
      return {
        max: policy.hdbLoan.maxLtv * lf.factor,
        reduced: true,
        reason: lf.factor === 0
          ? `the remaining lease is ${policy.lease.minYearsForCpf} years or less`
          : `the ${lf.lease}-year lease covers the youngest of you only to age ${lf.youngest + lf.lease} (not ${policy.lease.coverToAge})`,
      }
    }
    return { max: policy.hdbLoan.maxLtv, reduced: false }
  }
  const b = policy.bankLoan
  const ageAtEnd = weightedAge(scenario, scenario.flat.dates.afl) + f.tenureYears
  if (f.tenureYears > b.ltvTenureYears) return { max: b.reducedLtv, reduced: true, reason: `tenure is over ${b.ltvTenureYears} years` }
  if (ageAtEnd > b.ltvMaxAge) return { max: b.reducedLtv, reduced: true, reason: `the loan runs past age ${b.ltvMaxAge} (you’d be about ${Math.round(ageAtEnd)})` }
  return { max: b.maxLtv, reduced: false }
}

/** Effective LTV: the chosen LTV, capped by what's allowed. */
export function effectiveLtv(scenario: Scenario, policy: Policy): number {
  return Math.max(0, Math.min(scenario.financing.ltv, maxLtvFor(scenario, policy).max))
}

/** Grant amount: computed for auto grants (EHG / Step-Up), else as typed. */
export function grantAmount(g: Scenario['flat']['grants'][number], elig: Eligibility): number {
  if (g.auto === 'EHG') return elig.ehg
  if (g.auto === 'StepUp') return elig.stepUp
  return g.amount
}

/**
 * Loan changes in date order. The old single "rate after lock-in" setting reads
 * as a rate change that many years after key collection.
 */
export function loanChangesOf(financing: Scenario['financing'], keys: YearMonth): NonNullable<Scenario['financing']['loanChanges']> {
  const list: NonNullable<Scenario['financing']['loanChanges']> = []
  // Yearly prepayments expand into one entry per year (up to 35 years).
  for (const c of financing.loanChanges ?? []) {
    if (c.kind === 'prepay' && c.repeatYearly) {
      for (let y = 0; y < 35; y++) {
        const from = addMonths(c.from, y * 12)
        if (c.until && from > c.until) break
        list.push({ ...c, id: y === 0 ? c.id : `${c.id}#${y + 1}`, from, repeatYearly: false })
      }
    } else list.push(c)
  }
  if (!financing.loanChanges && financing.rateAfter) {
    list.push({ id: 'legacy-rate-after', kind: 'rate', from: addMonths(keys, Math.round(financing.rateAfter.afterYears * 12) + 1), rate: financing.rateAfter.rate })
  }
  return list.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
}

/**
 * A switch from an HDB loan to a bank loan dated on or before key collection.
 * The bank loan then starts at keys, and the bank's minimum cash downpayment
 * applies at keys (making up any AFL portion paid with CPF). Rule as described
 * by the user and in bank/HDB guidance; not read on hdb.gov.sg.
 */
export function preKeysSwitch(scenario: Scenario) {
  if (scenario.financing.loanType !== 'HDB') return undefined
  return loanChangesOf(scenario.financing, scenario.flat.dates.keys).find(
    (c): c is Extract<typeof c, { kind: 'refinance' }> => c.kind === 'refinance' && c.from <= scenario.flat.dates.keys,
  )
}

/** Minimum total cash downpayment (fraction of price) for the bank loan you'd switch to. */
export function switchCashPct(scenario: Scenario, policy: Policy): number {
  const sw = preKeysSwitch(scenario)
  if (!sw) return 0
  const asBank: Scenario = { ...scenario, financing: { ...scenario.financing, loanType: 'bank', tenureYears: sw.tenureYears || scenario.financing.tenureYears } }
  return maxLtvFor(asBank, policy).reduced ? policy.bankLoan.reducedMinCashPct : policy.bankLoan.minCashPct
}

/**
 * CPF usable for the flat: no cap with an HDB loan, the Valuation Limit (or
 * 120% with BRS) with a bank loan — both pro-rated by the age-95 lease factor.
 */
export function cpfCapFor(loanType: 'HDB' | 'bank', price: number, brsSetAside: boolean | undefined, policy: Policy, lease = 1): number {
  if (loanType === 'HDB') return lease >= 1 ? Infinity : price * lease
  return price * (brsSetAside ? policy.cpf.withdrawalLimitMultiple : 1) * lease
}

/** Far enough ahead for the 15-year accrued-interest run. */
const VC_HORIZON_MONTHS = 15 * 12 + 2

/** A partner's voluntary top-ups (the old `voluntaryOaMonthly` field reads as a monthly top-up). */
export function voluntaryList(p: Scenario['partners'][number]): NonNullable<Scenario['partners'][number]['voluntaryCpf']> {
  if (p.voluntaryCpf) return p.voluntaryCpf
  return p.voluntaryOaMonthly ? [{ id: `vc-legacy-${p.id}`, amount: p.voluntaryOaMonthly, frequency: 'monthly' }] : []
}

/** Your own costs (not policy fees) grow with inflation from today. */
const INFLATING: CostKind[] = ['reno', 'furniture', 'moving', 'custom']
function inflate(amount: number, ym: YearMonth, scenario: Scenario): number {
  const pct = scenario.assumptions?.inflationPct ?? 0
  if (!pct) return amount
  const years = Math.max(0, ymToIndex(ym) - ymToIndex(scenario.startMonth)) / 12
  return amount * Math.pow(1 + pct / 100, years)
}

/** Amount for an auto-computed cost item, or the item's own amount. */
export function autoAmount(item: CostItem, scenario: Scenario, policy: Policy, loanAmount: number, price?: number): number {
  if (item.auto === false) return item.amount
  const { type } = scenario.flat
  price ??= effectivePrice(scenario, policy)
  switch (item.kind) {
    case 'optionFee':
      return optionFee(type, policy)
    case 'bsd':
      return buyersStampDuty(price, policy)
    case 'legal':
      return legalFees(price, loanAmount, scenario.financing.loanType, policy)
    case 'survey':
      return policy.fees.surveyFee[type]
    case 'caveat':
      return policy.fees.caveatFee
    case 'fire':
      return policy.fees.fireInsurance5yr[type]
    default:
      return item.amount
  }
}

/** Which downpayment table applies. DIA takes precedence over the staggered toggle. */
export function downpaymentScheme(financing: Scenario['financing']): 'standard' | 'staggered' | 'dia' {
  if (financing.deferredIncomeAssessment) return 'dia'
  return financing.staggered ? 'staggered' : 'standard'
}

/** Month whose income is used for loan assessment. */
export function assessmentMonth(raw: Scenario, policy: Policy): YearMonth {
  const scenario = normalizeScenario(raw)
  const { dates } = scenario.flat
  if (!scenario.financing.deferredIncomeAssessment) return dates.afl
  // DIA on a completed flat: income is assessed at flat booking.
  if (isCompleted(scenario)) return dates.booking
  const m = addMonths(dates.keys, -policy.dia.assessmentMonthsBeforeKeys)
  return ymToIndex(m) < ymToIndex(dates.afl) ? dates.afl : m
}

export function buildSchedule(raw: Scenario, policy: Policy): Schedule {
  const scenario = normalizeScenario(raw)
  const { flat, financing } = scenario
  const dates = flat.dates
  const eligibility = assessEligibility(scenario, policy)
  const price = flat.price + eligibility.premium
  const ltvRule = maxLtvFor(scenario, policy)
  const ltv = effectiveLtv(scenario, policy)
  const loanKey = financing.loanType === 'HDB' ? 'hdb' : 'bank'
  const sched = policy.downpayment[loanKey][downpaymentScheme(financing)]

  const optionFeeItem = scenario.costs.find((c) => c.kind === 'optionFee')
  const optFee = optionFeeItem ? autoAmount(optionFeeItem, scenario, policy, 0, price) : 0

  // --- Downpayment tranches (price × (1 − LTV) in total) ---
  const downpaymentTotal = price * (1 - ltv)
  const aflGross = Math.min(downpaymentTotal, sched.afl.pct * price)
  const keysGross = Math.max(0, downpaymentTotal - aflGross)
  const aflDue = Math.max(0, aflGross - optFee) // option fee already counts towards it
  const aflMinCash = Math.min(aflDue, Math.max(0, sched.afl.minCashPct * price - optFee))
  // With a bank loan, the total cash across tranches must meet the minimum cash %.
  const bankMinTotal = financing.loanType === 'bank'
    ? (ltvRule.reduced ? policy.bankLoan.reducedMinCashPct : policy.bankLoan.minCashPct) * price
    : 0
  const keysMinCash = Math.min(
    keysGross,
    Math.max(sched.keys.minCashPct * price, bankMinTotal - optFee - aflMinCash),
  )

  // --- Grants: credited to OA, used for the next tranche(s); any excess reduces the loan ---
  const grantCredits: GrantCredit[] = []
  let grantsTotal = 0
  for (const g of flat.grants) {
    const amount = grantAmount(g, eligibility)
    if (amount <= 0) continue
    let ym = resolveWhen(g.when, dates)
    if (ymToIndex(ym) > ymToIndex(dates.keys)) ym = dates.keys
    const a = (amount * g.splitA) / 100
    grantCredits.push({ id: g.id, label: g.name, ym, amounts: { A: a, B: amount - a } })
    grantsTotal += amount
  }
  const grantsAt = (ym: YearMonth) =>
    grantCredits.filter((g) => ymToIndex(g.ym) <= ymToIndex(ym)).reduce((s, g) => s + g.amounts.A + g.amounts.B, 0)

  const grantForAfl = Math.min(aflDue, grantsAt(dates.afl))
  const grantLeftForKeys = grantsTotal - grantForAfl
  const grantForKeys = Math.min(keysGross, grantLeftForKeys)
  const grantExcess = Math.max(0, grantLeftForKeys - grantForKeys)

  const loanBeforeGrants = price * ltv
  const loanAmount = Math.max(0, loanBeforeGrants - grantExcess)

  const obligations: Obligation[] = []
  const common = { payer: 'joint' as Payer, housing: true, downpayment: true, delayable: false, funding: 'cpfAllowed' as FundingRule }

  if (aflDue > 0) {
    obligations.push({
      ...common,
      id: 'dp-afl',
      sourceId: 'dp-afl',
      label: `Downpayment at AFL (${pct(sched.afl.pct)} less option fee)`,
      kind: 'downpayment',
      ym: dates.afl,
      amount: round2(aflDue),
      minCash: round2(Math.min(aflDue - grantForAfl, aflMinCash)),
      grantFunded: round2(grantForAfl),
      milestone: 'afl',
    })
  }
  const keysAmount = keysGross + grantExcess
  const switching = preKeysSwitch(scenario)
  if (keysAmount > 0) {
    obligations.push({
      ...common,
      id: 'dp-keys',
      sourceId: 'dp-keys',
      label: (grantExcess > 0 ? 'Balance at key collection (incl. grant used to cut loan)' : 'Balance downpayment at key collection') +
        (switching ? ' — switching to bank loan' : ''),
      cashRuleTotal: switching ? round2(switchCashPct(scenario, policy) * price) : undefined,
      kind: 'downpayment',
      ym: dates.keys,
      amount: round2(keysAmount),
      minCash: round2(Math.min(keysGross - grantForKeys, keysMinCash)),
      grantFunded: round2(grantForKeys + grantExcess),
      milestone: 'keys',
    })
  }

  // --- Other cost items ---
  for (const item of scenario.costs) {
    // Money coming in is entered as a positive amount; negative amounts on other items also count as inflows.
    const raw = autoAmount(item, scenario, policy, loanAmount, price)
    const amount = item.kind === 'inflow' ? -Math.abs(raw) : raw
    if (amount === 0) continue
    const first = resolveWhen(item.when, dates)
    const times = item.recurrence ? Math.max(1, item.recurrence.times) : 1
    const every = item.recurrence ? Math.max(1, item.recurrence.everyMonths) : 0
    const milestone = 'milestone' in item.when && !item.when.offsetMonths ? item.when.milestone : undefined
    // Bank loan: the lawyer pays BSD from your cash; CPF reimburses it later.
    const bsdCashFirst = item.kind === 'bsd' && financing.loanType === 'bank' && item.funding === 'cpfAllowed' && amount > 0
    if (bsdCashFirst) {
      obligations.push({
        id: 'bsd-refund',
        sourceId: item.id,
        label: "Buyer's Stamp Duty reimbursed from CPF",
        kind: 'bsd',
        ym: addMonths(first, policy.bankLoan.bsdReimburseMonths),
        amount: round2(amount),
        funding: 'cpfAllowed',
        minCash: 0,
        grantFunded: 0,
        payer: item.payer,
        housing: true,
        downpayment: false,
        delayable: false,
        reimburse: true,
      })
    }
    for (let i = 0; i < times; i++) {
      const ym = addMonths(first, i * every)
      const amt = item.auto === false && INFLATING.includes(item.kind) ? inflate(amount, ym, scenario) : amount
      obligations.push({
        id: times > 1 ? `${item.id}#${i + 1}` : item.id,
        sourceId: item.id,
        label: times > 1 ? `${item.label} (${i + 1}/${times})` : bsdCashFirst ? `${item.label} (paid in cash, CPF reimburses later)` : item.label,
        kind: item.kind,
        ym,
        amount: round2(amt),
        funding: amount < 0 || bsdCashFirst ? 'cashOnly' : item.funding,
        minCash: 0,
        grantFunded: 0,
        payer: item.payer,
        housing: HOUSING_KINDS.includes(item.kind),
        downpayment: false,
        milestone: i === 0 ? milestone : undefined,
        delayable: item.kind !== 'inflow' && (item.delayable ?? ['reno', 'furniture', 'moving', 'custom'].includes(item.kind)),
      })
    }
  }

  // --- Voluntary CPF top-ups (paid from each partner's cash) ---
  const horizonEnd = addMonths(dates.keys, VC_HORIZON_MONTHS)
  scenario.partners.forEach((p) => {
    for (const vc of voluntaryList(p)) {
      if (vc.amount <= 0) continue
      const first = vc.date ?? scenario.startMonth
      const last = vc.until && vc.until < horizonEnd ? vc.until : horizonEnd
      const months: YearMonth[] = []
      if (vc.frequency === 'once') months.push(first)
      else {
        for (let ym = first; ym <= last; ym = addMonths(ym, 1)) {
          if (vc.frequency === 'monthly' || Number(ym.slice(5)) === (vc.month ?? 12)) months.push(ym)
        }
      }
      months.forEach((ym, i) => obligations.push({
        id: `${vc.id}-${p.id}#${i + 1}`,
        sourceId: vc.id,
        label: `Voluntary CPF top-up (${p.name})`,
        kind: 'voluntaryCpf',
        ym,
        amount: round2(vc.amount),
        funding: 'cashOnly',
        minCash: 0,
        grantFunded: 0,
        payer: p.id,
        housing: false,
        downpayment: false,
        delayable: false,
        cpfTopUp: true,
      }))
    }
  })

  // --- Interim housing: rent until the month before keys ---
  if (scenario.interim.mode === 'rent' && scenario.interim.monthlyCost > 0) {
    const from = ymToIndex(scenario.startMonth)
    const to = ymToIndex(dates.keys)
    for (let i = from; i < to; i++) {
      const ym = addMonths(scenario.startMonth, i - from)
      obligations.push({
        id: `rent-${ym}`,
        sourceId: 'rent',
        label: 'Rent (interim housing)',
        kind: 'rent',
        ym,
        amount: round2(inflate(scenario.interim.monthlyCost, ym, scenario)),
        funding: 'cashOnly',
        minCash: 0,
        grantFunded: 0,
        payer: 'joint',
        housing: false,
        downpayment: false,
        delayable: false,
      })
    }
  }

  // --- Loan & servicing ratios (assessed on income at AFL, or shortly before keys under DIA) ---
  const assessedAt = assessmentMonth(scenario, policy)
  const isHdb = financing.loanType === 'HDB'
  const rate = financing.rate
  const tenure = financing.tenureYears
  const instalment = monthlyInstalment(loanAmount, rate, tenure)
  const stressRate = Math.max(rate, isHdb ? policy.hdbLoan.stressRate : policy.bankLoan.stressRate)
  const stressInstalment = monthlyInstalment(loanAmount, stressRate, tenure)
  const income = scenario.partners.reduce((s, p) => s + salaryAt(p, scenario.startMonth, assessedAt), 0)
  const otherDebt = scenario.partners.reduce((s, p) => s + (p.otherMonthlyDebt || 0), 0)
  const msr = income > 0 ? stressInstalment / income : Infinity
  const tdsr = income > 0 ? (stressInstalment + otherDebt) / income : Infinity
  const maxInstalment = Math.min(policy.msr * income, isHdb ? Infinity : policy.tdsr * income - otherDebt)
  const r = stressRate / 12
  const n = Math.round(tenure * 12)
  const maxLoanUnderMsr = maxInstalment <= 0 ? 0 : r === 0 ? maxInstalment * n : (maxInstalment * (1 - Math.pow(1 + r, -n))) / r

  const cpfCap = cpfCapFor(financing.loanType, price, financing.brsSetAside, policy, leaseFactor(scenario, policy).factor)

  const loan: LoanInfo = {
    price: flat.price,
    effectivePrice: price,
    maxLtvAllowed: ltvRule.max,
    cpfCap,
    grantsTotal,
    loanAmount: round2(loanAmount),
    monthlyInstalment: round2(instalment),
    rate,
    tenureYears: tenure,
    ltvUsed: ltv,
    downpaymentTotal: round2(downpaymentTotal),
    msr,
    tdsr,
    msrLimit: policy.msr,
    tdsrLimit: policy.tdsr,
    stressInstalment: round2(stressInstalment),
    grossIncomeAtAssessment: round2(income),
    assessedAt,
    maxLoanUnderMsr: Math.floor(maxLoanUnderMsr),
  }

  return { obligations, grantCredits, loan, eligibility }
}

function pct(x: number): string {
  return `${Math.round(x * 1000) / 10}%`
}
