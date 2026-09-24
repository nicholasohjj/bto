import type { Policy } from '../config/policy'
import { ageInMonths, bonusAmount, bonusCpf, cashSavingsAt, isWorking, partnerMonthCpf, prYear, ratesFor, salaryAt } from './cpf'
import { addMonths, monthOf, ymToIndex } from './dates'
import { buildSchedule, cpfCapFor, loanChangesOf, type Obligation, type Schedule } from './payments'
import { leaseFactor, normalizeScenario } from './saleType'
import { resolvePolicy } from './policyOverrides'
import { round2 } from './stampDuty'
import { money } from './format'
import { monthlyInstalment, monthsToRepay } from './loan'
import type { MonthState, PaidEvent, PartnerId, PotBalances, Scenario, YearMonth } from './types'

export const MONTHS_AFTER_KEYS = 12
const IDS: PartnerId[] = ['A', 'B']

export interface HousingWithdrawal {
  ym: YearMonth
  partner: PartnerId
  amount: number
}

export interface CoreResult {
  scenario: Scenario
  policy: Policy
  schedule: Schedule
  months: MonthState[]
  events: PaidEvent[]
  housingWithdrawals: HousingWithdrawal[]
  /** Obligations dated before the start month (assumed already paid). */
  skipped: Obligation[]
  /** Downpayments where the HDB-loan OA rule forced more CPF than the slider. */
  hdbRuleBumps: { ym: YearMonth; label: string; extraCpf: number }[]
  /** CPF-share of mortgage per partner in the last simulated month. */
  lastMortgageCpf: Record<PartnerId, number>
  /** First month CPF use for the flat hit the Valuation/Withdrawal Limit (bank loans). */
  cpfCapReachedYm?: YearMonth
  /** Switching HDB → bank before keys: cash needed at keys to meet the bank's cash rule. */
  bankSwitch?: { ym: YearMonth; cashRequiredTotal: number; cashPaidBefore: number; extraCash: number }
  /** Mortgage terms over time: the start, then after each loan change. */
  loanPath: LoanStep[]
  /** Voluntary top-ups cut back by the Annual Limit or by lack of cash. */
  topUpNotes: { ym: YearMonth; partner: PartnerId; planned: number; paid: number; reason: 'limit' | 'cash' }[]
  startMonth: YearMonth
  endMonth: YearMonth
}

interface PotState {
  cash: number
  oa: number
  /** Grant money credited but not yet applied to a tranche. */
  grant: number
  /** OA interest accrued this year, credited in December. */
  pendingInterest: number
}

export interface LoanStep {
  ym: YearMonth
  loanType: 'HDB' | 'bank'
  rate: number
  instalment: number
  /** Months left to pay from this month. */
  monthsLeft: number
  outstanding: number
  /** What changed ('start' for the original loan). */
  change: 'start' | 'rate' | 'refinance' | 'tenure' | 'prepay'
  /** Cash paid for refinancing or a prepayment penalty. */
  cost?: number
  /** Amount prepaid (partial prepayment). */
  prepaid?: number
  prepaidFrom?: 'cash' | 'cpf'
}

export interface SimOptions {
  /** How long to keep simulating after key collection (default 12 months). */
  monthsAfterKeys?: number
}

/** Month-by-month simulation (no warnings). Pure: same input → same output. */
export function simulateCore(
  raw: Scenario,
  policy: Policy = resolvePolicy(raw.policyOverrides),
  options: SimOptions = {},
): CoreResult {
  const scenario = normalizeScenario(raw)
  const schedule = buildSchedule(scenario, policy)
  const { flat, financing } = scenario
  const start = scenario.startMonth
  const keysIdx = ymToIndex(flat.dates.keys)
  const startIdx = ymToIndex(start)
  const endIdx = Math.max(keysIdx + (options.monthsAfterKeys ?? MONTHS_AFTER_KEYS), startIdx)
  const cashRate = (scenario.assumptions?.cashInterestPct ?? 0) / 100
  // CPF usable for the flat (Valuation / Withdrawal Limit); Infinity with an HDB loan.
  // Changes on refinancing from an HDB loan to a bank loan.
  let cpfCap = schedule.loan.cpfCap
  let cpfUsedForFlat = 0
  let cpfCapReachedYm: YearMonth | undefined
  const topUpNotes: CoreResult['topUpNotes'] = []
  // Cash paid towards the downpayment so far (option fee + tranches), for the bank cash rule.
  let downpaymentCash = 0
  let bankSwitch: CoreResult['bankSwitch']

  // Mandatory CPF per partner per calendar year (for the Annual Limit on voluntary top-ups).
  const mandatoryCache = new Map<string, number>()
  const mandatoryInYear = (id: PartnerId, year: number): number => {
    const key = `${id}-${year}`
    const hit = mandatoryCache.get(key)
    if (hit !== undefined) return hit
    const p = id === 'A' ? scenario.partners[0] : scenario.partners[1]
    let total = 0
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`
      if (!isWorking(p, ym)) continue
      const wage = salaryAt(p, start, ym)
      const c = partnerMonthCpf(p, wage, ym, policy)
      total += c.total
      if (c.rates) {
        for (const b of p.bonuses) {
          const amt = bonusAmount(b, wage, ym)
          if (amt > 0) total += bonusCpf(amt, wage, c.age, policy, c.rates).subject * (c.rates.employer + c.rates.employee)
        }
      }
    }
    mandatoryCache.set(key, total)
    return total
  }
  const topUpsInYear = new Map<string, number>()

  const partners = { A: scenario.partners[0], B: scenario.partners[1] }
  const pots: Record<PartnerId, PotState> = {
    A: { cash: partners.A.cash, oa: partners.A.cpfOA, grant: 0, pendingInterest: 0 },
    B: { cash: partners.B.cash, oa: partners.B.cpfOA, grant: 0, pendingInterest: 0 },
  }
  const splitA = clamp01(financing.jointSplitA / 100)
  const cpfUsage = clamp01(financing.cpfUsagePct / 100)

  // Bucket obligations by month; earlier-than-start ones are treated as paid.
  const byMonth = new Map<number, Obligation[]>()
  const skipped: Obligation[] = []
  for (const ob of schedule.obligations) {
    const idx = ymToIndex(ob.ym)
    if (idx < startIdx) {
      skipped.push(ob)
      continue
    }
    if (idx > endIdx) continue
    const list = byMonth.get(idx) ?? []
    list.push(ob)
    byMonth.set(idx, list)
  }
  const order = (ob: Obligation) => (ob.amount < 0 ? -1 : ob.funding === 'cashOnly' ? 0 : ob.downpayment ? 1 : 2)
  for (const list of byMonth.values()) list.sort((a, b) => order(a) - order(b))

  const months: MonthState[] = []
  const events: PaidEvent[] = []
  const housingWithdrawals: HousingWithdrawal[] = []
  const hdbRuleBumps: CoreResult['hdbRuleBumps'] = []
  let lastMortgageCpf: Record<PartnerId, number> = { A: 0, B: 0 }
  const pending: Record<PartnerId, { cash: number; oa: number }> = { A: { cash: 0, oa: 0 }, B: { cash: 0, oa: 0 } }

  const combined = (): PotBalances => ({ cash: pots.A.cash + pots.B.cash, oa: pots.A.oa + pots.B.oa })
  const sharesFor = (payer: Obligation['payer']): Record<PartnerId, number> =>
    payer === 'joint' ? { A: splitA, B: 1 - splitA } : payer === 'A' ? { A: 1, B: 0 } : { A: 0, B: 1 }

  /** Take up to `want` per partner from a pot; if `cover`, the other partner tops up shortfalls. */
  const draw = (pot: 'cash' | 'oa', wants: Record<PartnerId, number>, cover: boolean) => {
    const taken: Record<PartnerId, number> = { A: 0, B: 0 }
    let short = 0
    for (const id of IDS) {
      const avail = Math.max(0, pots[id][pot])
      const t = Math.min(wants[id], avail)
      taken[id] = t
      pots[id][pot] -= t
      short += wants[id] - t
    }
    if (cover && short > 1e-9) {
      for (const id of IDS) {
        const avail = Math.max(0, pots[id][pot])
        const t = Math.min(short, avail)
        taken[id] += t
        pots[id][pot] -= t
        short -= t
      }
    }
    return { taken, short: Math.max(0, short) }
  }

  const payObligation = (ob: Obligation, ym: YearMonth, forceCpfShare?: number): PaidEvent => {
    const shares = sharesFor(ob.payer)
    const joint = ob.payer === 'joint'
    const fromCpfBy: Record<PartnerId, number> = { A: 0, B: 0 }
    const fromCashBy: Record<PartnerId, number> = { A: 0, B: 0 }

    // Reimbursement from CPF back to cash (BSD with a bank loan): the slider's CPF share.
    if (ob.reimburse) {
      const want = Math.min(ob.amount * cpfUsage, Math.max(0, cpfCap - cpfUsedForFlat))
      const got = draw('oa', { A: want * shares.A, B: want * shares.B }, true)
      for (const id of IDS) {
        pots[id].cash += got.taken[id]
        if (got.taken[id] > 0) housingWithdrawals.push({ ym, partner: id, amount: got.taken[id] })
      }
      const total = got.taken.A + got.taken.B
      cpfUsedForFlat += total
      return {
        ym, itemId: ob.id, label: ob.label, kind: ob.kind, amount: -total, fromCash: -round2(total), fromCpf: round2(total),
        shortfall: 0, cpfFallbackToCash: 0, after: combined(), milestone: ob.milestone,
      }
    }

    // Voluntary CPF top-up: from the partner's cash, capped by the Annual Limit and available cash.
    if (ob.cpfTopUp) {
      const id = ob.payer as PartnerId
      const p = id === 'A' ? scenario.partners[0] : scenario.partners[1]
      const year = Number(ym.slice(0, 4))
      const key = `${id}-${year}`
      const room = Math.max(0, policy.cpf.annualLimit - mandatoryInYear(id, year) - (topUpsInYear.get(key) ?? 0))
      const afterLimit = Math.min(ob.amount, room)
      const paid = Math.max(0, Math.min(afterLimit, pots[id].cash))
      if (paid < ob.amount - 0.5) topUpNotes.push({ ym, partner: id, planned: ob.amount, paid, reason: afterLimit < ob.amount - 0.5 ? 'limit' : 'cash' })
      const age = ageInMonths(p.birthYearMonth, ym)
      const toOa = paid * ratesFor(age, policy, prYear(p, ym)).oaRatio
      pots[id].cash -= paid
      pots[id].oa += toOa
      topUpsInYear.set(key, (topUpsInYear.get(key) ?? 0) + paid)
      return {
        ym, itemId: ob.id, label: ob.label, kind: 'voluntaryCpf', amount: round2(paid), fromCash: round2(paid), fromCpf: -round2(toOa),
        shortfall: 0, cpfFallbackToCash: 0, after: combined(),
      }
    }

    // Inflow (negative amount): credit cash by share.
    if (ob.amount < 0) {
      for (const id of IDS) pots[id].cash += -ob.amount * shares[id]
      return {
        ym, itemId: ob.id, label: ob.label, kind: ob.kind, amount: ob.amount, fromCash: ob.amount, fromCpf: 0,
        shortfall: 0, cpfFallbackToCash: 0, after: combined(), milestone: ob.milestone,
      }
    }

    // 1. Grant money already sitting in OA.
    let grantLeft = ob.grantFunded
    for (const id of IDS) {
      const t = Math.min(grantLeft, pots[id].grant, pots[id].oa)
      pots[id].grant -= t
      pots[id].oa -= t
      fromCpfBy[id] += t
      grantLeft -= t
    }
    const rest = ob.amount - (ob.grantFunded - grantLeft)
    let minCash = Math.min(rest, ob.minCash)
    // Switching to a bank loan before keys: make up the bank's minimum cash downpayment now.
    if (ob.cashRuleTotal !== undefined) {
      const needed = Math.max(0, ob.cashRuleTotal - downpaymentCash)
      const newMin = Math.min(rest, Math.max(minCash, needed))
      bankSwitch = { ym, cashRequiredTotal: ob.cashRuleTotal, cashPaidBefore: round2(downpaymentCash), extraCash: round2(Math.max(0, newMin - minCash)) }
      minCash = newMin
    }
    const cpfRoom = ob.funding === 'cpfAllowed' ? Math.max(0, rest - minCash) : 0

    // 2. Planned CPF share (slider), bumped up by the HDB-loan OA rule for downpayments.
    let planCpf = cpfRoom * (forceCpfShare ?? cpfUsage)
    if (ob.downpayment && financing.loanType === 'HDB' && ob.cashRuleTotal === undefined && forceCpfShare === undefined) {
      const usable = IDS.reduce((s, id) => s + Math.max(0, pots[id].oa - policy.hdbLoan.oaRetainMax), 0)
      const mandatory = Math.min(cpfRoom, usable)
      if (mandatory > planCpf + 0.5) {
        hdbRuleBumps.push({ ym, label: ob.label, extraCpf: round2(mandatory - planCpf) })
        planCpf = mandatory
      }
    }
    // Bank loans: CPF for the flat is capped at the Valuation / Withdrawal Limit.
    if (ob.housing || ob.downpayment) {
      const grantUsed = ob.grantFunded - grantLeft
      const capLeft = Math.max(0, cpfCap - cpfUsedForFlat - grantUsed)
      if (planCpf > capLeft + 0.005) {
        planCpf = capLeft
        cpfCapReachedYm ??= ym
      }
    }
    const cpf = draw('oa', { A: planCpf * shares.A, B: planCpf * shares.B }, joint)
    for (const id of IDS) fromCpfBy[id] += cpf.taken[id]
    const cpfFallbackToCash = cpf.short

    // 3. Cash for the rest.
    const cashNeed = rest - (planCpf - cpf.short)
    const cash = draw('cash', { A: cashNeed * shares.A, B: cashNeed * shares.B }, joint || financing.poolCash)
    for (const id of IDS) fromCashBy[id] += cash.taken[id]
    const short = cash.short

    // 4. Still short: cash goes negative (flagged later, with a "use more CPF" fix
    //    when the slider left CPF room). The slider is treated as the plan.
    if (short > 1e-9) {
      for (const id of IDS) {
        const s = short * shares[id]
        pots[id].cash -= s
        fromCashBy[id] += s
      }
    }

    if (ob.housing || ob.downpayment) {
      for (const id of IDS) if (fromCpfBy[id] > 0) housingWithdrawals.push({ ym, partner: id, amount: fromCpfBy[id] })
      cpfUsedForFlat += fromCpfBy.A + fromCpfBy.B
    }
    return {
      ym,
      itemId: ob.id,
      label: ob.label,
      kind: ob.kind,
      amount: ob.amount,
      fromCash: round2(fromCashBy.A + fromCashBy.B),
      fromCpf: round2(fromCpfBy.A + fromCpfBy.B),
      shortfall: round2(short),
      cpfFallbackToCash: round2(cpfFallbackToCash),
      after: combined(),
      milestone: ob.milestone,
    }
  }

  let outstanding = schedule.loan.loanAmount
  let instalment = schedule.loan.monthlyInstalment
  let rate = financing.rate
  let loanType = financing.loanType
  let loanEndIdx = keysIdx + Math.round(financing.tenureYears * 12)
  const firstInstalmentIdx = keysIdx + 1
  // Loan changes take effect in their month (or at the first instalment if dated earlier).
  const changesByIdx = new Map<number, NonNullable<Scenario['financing']['loanChanges']>>()
  for (const c of loanChangesOf(financing, flat.dates.keys)) {
    const at = Math.max(ymToIndex(c.from), firstInstalmentIdx)
    changesByIdx.set(at, [...(changesByIdx.get(at) ?? []), c])
  }
  const loanPath: LoanStep[] = schedule.loan.loanAmount > 0
    ? [{ ym: addMonths(flat.dates.keys, 1), loanType, rate, instalment, monthsLeft: loanEndIdx - keysIdx, outstanding, change: 'start' }]
    : []

  for (let idx = startIdx; idx <= endIdx; idx++) {
    const ym = addMonths(start, idx - startIdx)
    const monthEvents: PaidEvent[] = []

    // a. Last month's income becomes available (savings, bonus, CPF contributions).
    for (const id of IDS) {
      pots[id].cash += pending[id].cash
      pots[id].oa += pending[id].oa
      pending[id] = { cash: 0, oa: 0 }
    }

    // b. Grants credited to OA.
    for (const g of schedule.grantCredits) {
      if (ymToIndex(g.ym) !== idx && !(idx === startIdx && ymToIndex(g.ym) < startIdx)) continue
      for (const id of IDS) {
        pots[id].oa += g.amounts[id]
        pots[id].grant += g.amounts[id]
      }
      const amount = g.amounts.A + g.amounts.B
      monthEvents.push({
        ym, itemId: g.id, label: `${g.label} credited to CPF OA`, kind: 'grant', amount,
        fromCash: 0, fromCpf: -amount, shortfall: 0, cpfFallbackToCash: 0, after: combined(),
      })
    }

    // c. Payments due this month.
    for (const ob of byMonth.get(idx) ?? []) {
      const ev = payObligation(ob, ym)
      if (ob.downpayment || ob.kind === 'optionFee') downpaymentCash += Math.max(0, ev.fromCash)
      monthEvents.push(ev)
    }

    // d. Loan changes this month (rate, refinance, tenure), then the mortgage payment.
    for (const c of changesByIdx.get(idx) ?? []) {
      if (outstanding <= 0.005) break
      if (c.kind === 'prepay') {
        // Partial prepayment from cash or CPF OA, then re-work the loan.
        const want = round2(Math.min(Math.max(0, c.amount), outstanding))
        if (want <= 0) continue
        let paid = 0
        let label = `Prepaid ${money(want)} from ${c.source === 'cpf' ? 'CPF OA' : 'cash'}`
        if (c.source === 'cash') {
          const ev = payObligation({
            id: `${c.id}-prepay`, sourceId: c.id, label, kind: 'custom', ym, amount: want,
            funding: 'cashOnly', minCash: 0, grantFunded: 0, payer: 'joint', housing: false, downpayment: false, delayable: false,
          }, ym)
          ev.kind = 'loanChange'
          monthEvents.push(ev)
          paid = want
        } else {
          const room = Math.max(0, Math.min(want, cpfCap - cpfUsedForFlat))
          const got = draw('oa', { A: room * splitA, B: room * (1 - splitA) }, true)
          paid = round2(got.taken.A + got.taken.B)
          for (const id of IDS) if (got.taken[id] > 0) housingWithdrawals.push({ ym, partner: id, amount: got.taken[id] })
          cpfUsedForFlat += paid
          if (paid < want - 0.5) label = `Prepaid ${money(paid)} from CPF OA (only this much was available)`
          monthEvents.push({ ym, itemId: `${c.id}-prepay`, label, kind: 'loanChange', amount: paid, fromCash: 0, fromCpf: paid, shortfall: 0, cpfFallbackToCash: 0, after: combined() })
        }
        outstanding = Math.max(0, outstanding - paid)
        const penalty = loanType === 'bank' ? round2((Math.max(0, c.penaltyPct) / 100) * paid) : 0
        if (penalty > 0) {
          const ev = payObligation({
            id: `${c.id}-penalty`, sourceId: c.id, label: 'Prepayment penalty', kind: 'custom', ym, amount: penalty,
            funding: 'cashOnly', minCash: 0, grantFunded: 0, payer: 'joint', housing: false, downpayment: false, delayable: false,
          }, ym)
          ev.kind = 'loanChange'
          monthEvents.push(ev)
        }
        if (outstanding <= 0.005) {
          instalment = 0
          loanPath.push({ ym, loanType, rate, instalment: 0, monthsLeft: 0, outstanding: 0, change: 'prepay', prepaid: paid, prepaidFrom: c.source, cost: penalty || undefined })
          continue
        }
        let monthsLeft = Math.max(1, loanEndIdx - idx + 1)
        const n = c.then === 'shorterTenure' ? monthsToRepay(outstanding, rate, instalment) : Infinity
        if (Number.isFinite(n)) {
          // Same instalment, fewer months (the last payment is just what's left).
          monthsLeft = Math.max(1, n)
          loanEndIdx = idx + monthsLeft - 1
        } else {
          instalment = round2(monthlyInstalment(outstanding, rate, monthsLeft / 12))
        }
        loanPath.push({ ym, loanType, rate, instalment, monthsLeft, outstanding, change: 'prepay', prepaid: paid, prepaidFrom: c.source, cost: penalty || undefined })
        continue
      }
      let cost = 0
      if (c.kind === 'rate') rate = c.rate
      if (c.kind === 'tenure') loanEndIdx = idx + Math.max(1, Math.round(c.tenureYears * 12)) - 1
      if (c.kind === 'refinance') {
        cost = round2(Math.max(0, c.costs) + (Math.max(0, c.penaltyPct) / 100) * outstanding)
        rate = c.rate
        if (c.tenureYears) loanEndIdx = idx + Math.max(1, Math.round(c.tenureYears * 12)) - 1
        if (loanType === 'HDB') {
          loanType = 'bank'
          cpfCap = cpfCapFor('bank', schedule.loan.effectivePrice, financing.brsSetAside, policy, leaseFactor(scenario, policy).factor)
        }
      }
      const monthsLeft = Math.max(1, loanEndIdx - idx + 1)
      instalment = round2(monthlyInstalment(outstanding, rate, monthsLeft / 12))
      loanPath.push({ ym, loanType, rate, instalment, monthsLeft, outstanding, change: c.kind, cost: cost || undefined })
      const what = c.kind === 'rate' ? `Rate now ${(rate * 100).toFixed(2)}%`
        : c.kind === 'tenure' ? `Tenure changed: ${Math.round(monthsLeft / 12 * 10) / 10} yrs left`
        : `Refinanced to bank loan at ${(rate * 100).toFixed(2)}%`
      const label = `${what} → ${money(instalment)}/mo`
      if (cost > 0) {
        const ev = payObligation({
          id: `${c.id}-cost`, sourceId: c.id, label: `${label} (refinancing costs)`, kind: 'custom', ym, amount: cost,
          funding: 'cashOnly', minCash: 0, grantFunded: 0, payer: 'joint', housing: false, downpayment: false, delayable: false,
        }, ym)
        ev.kind = 'loanChange'
        monthEvents.push(ev)
      } else {
        monthEvents.push({ ym, itemId: c.id, label, kind: 'loanChange', amount: 0, fromCash: 0, fromCpf: 0, shortfall: 0, cpfFallbackToCash: 0, after: combined() })
      }
    }
    if (idx > keysIdx && outstanding > 0.005 && instalment > 0) {
      const interest = outstanding * (rate / 12)
      const amount = round2(Math.min(instalment, outstanding + interest))
      const before = { A: pots.A.oa, B: pots.B.oa }
      const ev = payObligation(
        {
          id: `mortgage-${ym}`, sourceId: 'mortgage', label: 'Monthly mortgage', kind: 'downpayment', ym, amount,
          funding: financing.mortgageFrom === 'cpfFirst' ? 'cpfAllowed' : 'cashOnly', minCash: 0, grantFunded: 0,
          payer: 'joint', housing: true, downpayment: false, delayable: false,
        },
        ym, financing.mortgageFrom === 'cpfFirst' ? 1 : 0,
      )
      ev.kind = 'mortgage'
      monthEvents.push(ev)
      lastMortgageCpf = { A: before.A - pots.A.oa, B: before.B - pots.B.oa }
      outstanding = Math.max(0, outstanding + interest - amount)
    }

    // e. OA interest: accrue monthly on the balance, credit at year end. Cash interest monthly.
    for (const id of IDS) {
      if (cashRate > 0) pending[id].cash += Math.max(0, pots[id].cash) * (cashRate / 12)
      pots[id].pendingInterest += Math.max(0, pots[id].oa) * (policy.cpf.oaInterestRate / 12)
      if (monthOf(ym) === 12) {
        pending[id].oa += pots[id].pendingInterest
        pots[id].pendingInterest = 0
      }
    }

    // f. This month's income, available next month.
    const oaContribution: Record<PartnerId, number> = { A: 0, B: 0 }
    for (const id of IDS) {
      const p = partners[id]
      const wage = salaryAt(p, start, ym)
      const working = isWorking(p, ym)
      const cpfMonth = partnerMonthCpf(p, wage, ym, policy)
      let oa = working ? cpfMonth.oa : 0
      let cash = cashSavingsAt(p, ym)
      for (const b of p.bonuses) {
        const amt = working ? bonusAmount(b, wage, ym) : 0
        if (amt <= 0) continue
        const saved = clamp01((p.bonusSavedPct ?? 100) / 100)
        if (!cpfMonth.rates) {
          cash += amt * saved // self-employed: no CPF on bonus
          continue
        }
        const bc = bonusCpf(amt, wage, cpfMonth.age, policy, cpfMonth.rates)
        oa += bc.oa
        cash += bc.netBonus * saved
      }
      pending[id].cash += cash
      pending[id].oa += oa
      oaContribution[id] = oa
    }

    events.push(...monthEvents)
    months.push({
      ym,
      index: idx,
      perPartner: { A: { cash: pots.A.cash, oa: pots.A.oa }, B: { cash: pots.B.cash, oa: pots.B.oa } },
      combined: combined(),
      oaContribution,
      events: monthEvents,
    })
  }

  return {
    scenario,
    policy,
    schedule,
    months,
    events,
    housingWithdrawals,
    skipped,
    hdbRuleBumps,
    lastMortgageCpf,
    cpfCapReachedYm,
    topUpNotes,
    loanPath,
    bankSwitch,
    startMonth: start,
    endMonth: addMonths(start, endIdx - startIdx),
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0))
}
