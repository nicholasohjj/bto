import type { FlatType } from '../config/policy'

/** Calendar month, "YYYY-MM". */
export type YearMonth = string

export type PartnerId = 'A' | 'B'
export type Milestone = 'application' | 'booking' | 'afl' | 'keys'
export type FundingRule = 'cashOnly' | 'cpfAllowed'
export type Payer = 'joint' | PartnerId

/** A cost is due either relative to a milestone or on a fixed month. */
export type When =
  | { milestone: Milestone; offsetMonths?: number }
  | { date: YearMonth }

export interface Bonus {
  /** Bonus size in months of salary (ignored if `amount` is set). */
  months: number
  /** Fixed dollar bonus instead of months of salary. */
  amount?: number
  /** Calendar month it is paid (1–12). */
  paidInMonth: number
  /** Only paid in this year (one-off); omit for every year. */
  year?: number
}

/** A change to someone's pay over time. */
export type IncomeChange =
  /** New job, promotion or pay cut: new gross salary from this month (raises continue from there). */
  | { id: string; kind: 'newSalary'; from: YearMonth; salary: number; monthlyCashSavings?: number }
  /** Job loss, sabbatical, further study: no salary/CPF/bonus; cash changes by this much a month (negative = living costs from savings). */
  | { id: string; kind: 'noIncome'; from: YearMonth; until?: YearMonth; monthlyCashChange: number }
  /** A different raise for one year (applied that January) instead of the usual yearly raise. */
  | { id: string; kind: 'raise'; year: number; pct: number }

/** Voluntary top-up to CPF, paid from cash; split across accounts like normal contributions. */
export interface VoluntaryCpf {
  id: string
  amount: number
  frequency: 'monthly' | 'yearly' | 'once'
  /** Yearly: calendar month (1–12). */
  month?: number
  /** Once: the month; monthly/yearly: first month (default: start). */
  date?: YearMonth
  /** Monthly/yearly: stop after this month (optional). */
  until?: YearMonth
}

export interface Partner {
  id: PartnerId
  name: string
  birthYearMonth: YearMonth
  grossMonthly: number
  annualRaisePct: number
  cpfOA: number
  cash: number
  /** Cash saved each month after normal living costs (before rent and mortgage). */
  monthlyCashSavings: number
  bonuses: Bonus[]
  /** Share of each bonus (after employee CPF) that is saved. 0–100. */
  bonusSavedPct: number
  /** Other monthly debt repayments (car loan etc.) — used for TDSR. */
  otherMonthlyDebt: number
  /**
   * Month this partner starts full-time work (e.g. a student using Deferred
   * Income Assessment). Before it: no salary, no CPF, no bonus. Omit if working now.
   */
  workStartMonth?: YearMonth
  /** Cash saved per month before starting work (part-time job, allowance). */
  preWorkMonthlySavings?: number
  /** Singapore Citizen (default) or Permanent Resident. */
  citizenship?: 'SC' | 'SPR'
  /** For SPRs: month PR status started (graduated CPF rates in years 1–2). */
  prSinceMonth?: YearMonth
  /** Self-employed: no employer CPF; OA only gets voluntary contributions. */
  employment?: 'employee' | 'selfEmployed'
  /** @deprecated use voluntaryCpf. Read as a monthly top-up of this amount. */
  voluntaryOaMonthly?: number
  /** Voluntary CPF top-ups (employees and self-employed). */
  voluntaryCpf?: VoluntaryCpf[]
  /** Job changes, gaps without income, uneven raises. */
  incomeChanges?: IncomeChange[]
}

export interface Grant {
  id: string
  name: string
  amount: number
  /** Share credited to partner A's OA (0–100); rest to B. */
  splitA: number
  when: When
  /** Amount computed from income and household (EHG / Step-Up) instead of typed in. */
  auto?: 'EHG' | 'StepUp'
}

export interface Flat {
  price: number
  type: FlatType
  classification: 'Standard' | 'Plus' | 'Prime'
  dates: Record<Milestone, YearMonth>
  grants: Grant[]
  /** First-timer status of the couple (default: both first-timers). */
  household?: 'firstTimers' | 'firstAndSecond' | 'secondTimers'
  /** Step-Up grant: currently living in public rental or owning a 2-room flat. */
  fromRentalOr2Room?: boolean
}

export interface Financing {
  loanType: 'HDB' | 'bank'
  /** Chosen LTV as fraction; capped by policy. */
  ltv: number
  /** Annual rate as fraction. */
  rate: number
  tenureYears: number
  staggered: boolean
  /**
   * Deferred Income Assessment: for young student/NSF couples. 2.5% downpayment
   * at AFL, and loan/grant income assessed ~3 months before key collection.
   */
  deferredIncomeAssessment?: boolean
  /** 0–100: share of each CPF-allowed housing payment we try to pay from CPF. */
  cpfUsagePct: number
  mortgageFrom: 'cpfFirst' | 'cashOnly'
  /** Partner A's share (0–100) of joint payments. */
  jointSplitA: number
  /** If a partner is short of cash, the other partner's cash covers it. */
  poolCash: boolean
  /** @deprecated use loanChanges. Read as a rate change `afterYears` after key collection. */
  rateAfter?: { afterYears: number; rate: number }
  /** Rate changes, refinancing (incl. HDB → bank) and tenure changes after key collection. */
  loanChanges?: LoanChange[]
  /** Bank loans: you have set aside the BRS, so CPF can go up to the Withdrawal Limit. */
  brsSetAside?: boolean
}

/** A change to the mortgage after key collection, from a given month. */
export type LoanChange =
  /** New interest rate (repeat for a floating-rate path). */
  | { id: string; kind: 'rate'; from: YearMonth; rate: number }
  /** Refinance to a bank loan (from HDB, or bank to bank): new rate, optional new tenure, costs. */
  | { id: string; kind: 'refinance'; from: YearMonth; rate: number; tenureYears?: number; costs: number; penaltyPct: number }
  /** Change the remaining tenure (years from this month). */
  | { id: string; kind: 'tenure'; from: YearMonth; tenureYears: number }

export interface Assumptions {
  /** Interest earned on cash savings, % p.a. (compounded monthly). */
  cashInterestPct: number
  /** Cost inflation, % p.a., applied to your own (non-policy) costs and rent after today. */
  inflationPct: number
}

export type CostKind =
  | 'optionFee'
  | 'bsd'
  | 'legal'
  | 'survey'
  | 'caveat'
  | 'fire'
  | 'hps'
  | 'reno'
  | 'furniture'
  | 'moving'
  | 'custom'
  /** Money coming in (gift, car sale…): amount entered as positive. */
  | 'inflow'

export interface CostItem {
  id: string
  label: string
  amount: number
  when: When
  funding: FundingRule
  payer: Payer
  kind: CostKind
  /** Amount is computed from policy (option fee, BSD, legal…) unless false. */
  auto?: boolean
  recurrence?: { everyMonths: number; times: number }
  /** Solver may suggest delaying this item. */
  delayable?: boolean
}

export interface Interim {
  mode: 'parents' | 'rent'
  monthlyCost: number
}

/** Flat map of policy path -> number (e.g. "hdbLoan.interestRate": 0.027). */
export type PolicyOverrides = Record<string, number>

export interface Scenario {
  schemaVersion: 1
  id: string
  name: string
  /** First simulated month (defaults to the month the scenario was created). */
  startMonth: YearMonth
  partners: [Partner, Partner]
  flat: Flat
  financing: Financing
  costs: CostItem[]
  interim: Interim
  policyOverrides: PolicyOverrides
  assumptions?: Assumptions
}

// ---------- Results ----------

export interface PotBalances {
  cash: number
  oa: number
}

export interface PaidEvent {
  ym: YearMonth
  itemId: string
  label: string
  kind: CostKind | 'downpayment' | 'grant' | 'mortgage' | 'rent' | 'voluntaryCpf' | 'loanChange'
  amount: number
  fromCash: number
  fromCpf: number
  /** Amount that could not be covered by any allowed pot (pushed cash negative). */
  shortfall: number
  /** Planned CPF that had to be paid in cash instead because OA was short. */
  cpfFallbackToCash: number
  /** Combined balances right after this event. */
  after: PotBalances
  milestone?: Milestone
}

export interface MonthState {
  ym: YearMonth
  index: number
  perPartner: Record<PartnerId, PotBalances>
  combined: PotBalances
  oaContribution: Record<PartnerId, number>
  events: PaidEvent[]
}

export type Severity = 'error' | 'warning' | 'info'

export interface Warning {
  id: string
  severity: Severity
  ym?: YearMonth
  title: string
  explanation: string
  fixes: string[]
}

export interface LoanInfo {
  price: number
  grantsTotal: number
  loanAmount: number
  monthlyInstalment: number
  rate: number
  tenureYears: number
  ltvUsed: number
  downpaymentTotal: number
  msr: number
  tdsr: number
  msrLimit: number
  tdsrLimit: number
  stressInstalment: number
  grossIncomeAtAssessment: number
  /** Month whose income the loan (MSR/TDSR) is assessed on. */
  assessedAt: YearMonth
  /** Max LTV allowed for this loan after tenure/age rules. */
  maxLtvAllowed: number
  /** Flat price incl. any SC/SPR premium. */
  effectivePrice: number
  /** CPF usage cap for the flat (Infinity with an HDB loan). */
  cpfCap: number
  maxLoanUnderMsr: number
}

export interface Summary {
  totalPaid: number
  totalCashUsed: number
  totalCpfUsed: number
  monthlyMortgage: number
  leanestCash: { ym: YearMonth; amount: number }
  bufferAtKeys: PotBalances
  endBalances: PotBalances
}

export interface AccruedPoint {
  yearsAfterKeys: number
  principal: number
  accrued: number
  refundDue: number
  perPartner: Record<PartnerId, { principal: number; accrued: number }>
}

export interface SimResult {
  months: MonthState[]
  events: PaidEvent[]
  loan: LoanInfo
  warnings: Warning[]
  summary: Summary
  accrued: AccruedPoint[]
  milestones: Record<Milestone, YearMonth>
  eligibility: import('./eligibility').Eligibility
  /** First month CPF for the flat hits its limit (bank loans), within 15 years of keys. */
  cpfCapReachedYm?: YearMonth
  /** Mortgage terms over time (start + each loan change), over 15 years after keys. */
  loanPath: import('./simulate').LoanStep[]
}
