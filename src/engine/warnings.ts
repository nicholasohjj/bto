import { ageInMonths } from './cpf'
import { addMonths, formatYm, monthsBetween, ymToIndex } from './dates'
import { money } from './format'
import { hdbMaxTenure, loanChangesOf, maxLtvFor, preKeysSwitch, weightedAge } from './payments'
import { monthlyInstalment } from './loan'
import { hfeMonth, householdIncome } from './eligibility'
import { isCompleted, isSingle, isSinglesPurchase, leaseFactor } from './saleType'
import { simulateCore, type CoreResult, type LoanStep } from './simulate'
import type { Milestone, Scenario, Warning, When, YearMonth } from './types'

interface Episode {
  start: YearMonth
  end: YearMonth
  deepest: number
  deepestYm: YearMonth
}

/** Months where cash is negative (household total if cash is pooled, else either partner). */
export function negativeCashMonths(core: CoreResult): Set<number> {
  const out = new Set<number>()
  for (const m of core.months) {
    const neg = core.scenario.financing.poolCash
      ? m.combined.cash < -0.5
      : m.perPartner.A.cash < -0.5 || m.perPartner.B.cash < -0.5
    if (neg) out.add(m.index)
  }
  return out
}

export function cashEpisodes(core: CoreResult): Episode[] {
  const eps: Episode[] = []
  const neg = negativeCashMonths(core)
  let cur: Episode | null = null
  for (const m of core.months) {
    const low = core.scenario.financing.poolCash ? m.combined.cash : Math.min(m.perPartner.A.cash, m.perPartner.B.cash)
    if (neg.has(m.index)) {
      if (!cur) cur = { start: m.ym, end: m.ym, deepest: low, deepestYm: m.ym }
      cur.end = m.ym
      if (low < cur.deepest) {
        cur.deepest = low
        cur.deepestYm = m.ym
      }
    } else if (cur) {
      eps.push(cur)
      cur = null
    }
  }
  if (cur) eps.push(cur)
  return eps
}

/** True if the episode is gone and no new negative months appear. */
function resolves(original: Set<number>, ep: Episode, trial: CoreResult): boolean {
  const next = negativeCashMonths(trial)
  const s = ymToIndex(ep.start)
  const e = ymToIndex(ep.end)
  for (const idx of next) {
    if (idx >= s && idx <= e) return false
    if (!original.has(idx)) return false
  }
  return true
}

export function withCpfUsage(s: Scenario, pct: number): Scenario {
  return { ...s, financing: { ...s.financing, cpfUsagePct: pct } }
}

export function shiftWhen(when: When, n: number): When {
  if ('date' in when) return { date: addMonths(when.date, n) }
  return { ...when, offsetMonths: (when.offsetMonths ?? 0) + n }
}

export function withDelay(s: Scenario, itemId: string, n: number): Scenario {
  return { ...s, costs: s.costs.map((c) => (c.id === itemId ? { ...c, when: shiftWhen(c.when, n) } : c)) }
}

function cpfUsedUpTo(core: CoreResult, ym: YearMonth): number {
  const idx = ymToIndex(ym)
  return core.events
    .filter((e) => e.kind !== 'grant' && e.kind !== 'voluntaryCpf' && ymToIndex(e.ym) <= idx)
    .reduce((s, e) => s + e.fromCpf, 0)
}

function cashFixes(core: CoreResult, ep: Episode, original: Set<number>): string[] {
  const s = core.scenario
  const fixes: string[] = []

  // 1. Use more CPF (slider), if any CPF-allowed payment happened by then.
  const cur = s.financing.cpfUsagePct
  if (cur < 100) {
    const at100 = simulateCore(withCpfUsage(s, 100), core.policy)
    if (resolves(original, ep, at100)) {
      let lo = cur
      let hi = 100
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2)
        if (resolves(original, ep, simulateCore(withCpfUsage(s, mid), core.policy))) hi = mid
        else lo = mid
      }
      const best = simulateCore(withCpfUsage(s, hi), core.policy)
      const extra = cpfUsedUpTo(best, ep.end) - cpfUsedUpTo(core, ep.end)
      if (extra > 0) fixes.push(`Use about ${money(extra)} more CPF for housing payments (set the CPF slider to ${hi}% or more).`)
    }
  }

  // 2. Delay a flexible expense due on or before the episode.
  const epEnd = ymToIndex(ep.end)
  const candidates = s.costs
    .filter((c) => (c.delayable ?? ['reno', 'furniture', 'moving', 'custom'].includes(c.kind)) && c.amount > 0)
    .map((c) => ({ c, ym: core.schedule.obligations.find((o) => o.sourceId === c.id)?.ym }))
    .filter((x): x is { c: (typeof s.costs)[number]; ym: YearMonth } => !!x.ym && ymToIndex(x.ym) <= epEnd && ymToIndex(x.ym) >= ymToIndex(core.startMonth))
    .sort((a, b) => b.c.amount - a.c.amount)
    .slice(0, 3)
  for (const { c, ym } of candidates) {
    for (let n = 1; n <= 36; n++) {
      if (resolves(original, ep, simulateCore(withDelay(s, c.id, n), core.policy))) {
        fixes.push(`Delay "${c.label}" by ${n} month${n > 1 ? 's' : ''} (to ${formatYm(addMonths(ym, n))}).`)
        break
      }
    }
  }

  // 3. Interim housing / mortgage source.
  if (s.interim.mode !== 'parents' && s.interim.monthlyCost > 0 && ymToIndex(ep.start) <= ymToIndex(s.flat.dates.keys)) {
    const trial = simulateCore({ ...s, interim: { ...s.interim, mode: 'parents' } }, core.policy)
    if (resolves(original, ep, trial)) fixes.push('Live with parents instead of renting until key collection.')
  }
  if (s.financing.mortgageFrom === 'cashOnly' && ymToIndex(ep.end) > ymToIndex(s.flat.dates.keys)) {
    fixes.push('Pay the monthly mortgage from CPF OA first instead of cash.')
  }

  // 4. Pause voluntary CPF top-ups paid before the shortfall.
  const topUps = core.events.filter((e) => e.kind === 'voluntaryCpf' && e.amount > 0 && ymToIndex(e.ym) <= epEnd)
  if (topUps.length) {
    const strip = (p: Scenario['partners'][number]) => ({ ...p, voluntaryCpf: [], voluntaryOaMonthly: 0 })
    const noTopUps: Scenario = { ...s, partners: [strip(s.partners[0]), strip(s.partners[1])] }
    const total = topUps.reduce((a, e) => a + e.amount, 0)
    if (resolves(original, ep, simulateCore(noTopUps, core.policy))) fixes.push(`Pause voluntary CPF top-ups until after ${formatYm(ep.end)} (${money(total)} of cash goes into CPF before then).`)
  }

  // 5. Save more each month from now.
  const months = Math.max(1, monthsBetween(core.startMonth, ep.deepestYm))
  const perMonth = Math.ceil(-ep.deepest / months / 10) * 10
  fixes.push(`Save an extra ${money(perMonth)} a month from now (${months} month${months > 1 ? 's' : ''} to go).`)
  return fixes
}

export interface WarningExtras {
  /** From the 15-year run: first month CPF for the flat hits its limit. */
  cpfCapReachedYm?: YearMonth
  /** From the 15-year run: mortgage terms after each loan change. */
  loanPath?: LoanStep[]
}

export function buildWarnings(core: CoreResult, extras: WarningExtras = {}): Warning[] {
  const s = core.scenario
  const { loan } = core.schedule
  const warnings: Warning[] = []
  const isHdb = s.financing.loanType === 'HDB'

  // --- Key dates: before today or out of order make every number below wrong ---
  const d = s.flat.dates
  if (d.keys < core.startMonth) {
    warnings.push({
      id: 'keys-past', severity: 'error', ym: d.keys,
      title: `Key collection (${formatYm(d.keys)}) is before ${formatYm(core.startMonth)}`,
      explanation: 'This plan runs from today to 12 months after key collection, so payments dated earlier are treated as already paid and the numbers here leave them out.',
      fixes: ['Set the key collection date (Flat section) to when you expect to get your keys.'],
    })
  }
  const order: [Milestone, string][] = [['application', 'Application'], ['booking', 'Booking'], ['afl', 'AFL signing'], ['keys', 'Key collection']]
  for (let i = 1; i < order.length; i++) {
    const [prev, prevLabel] = order[i - 1]
    const [cur, curLabel] = order[i]
    if (d[cur] < d[prev]) {
      warnings.push({
        id: 'dates-order', severity: 'error', ym: d[cur],
        title: `${curLabel} (${formatYm(d[cur])}) is before ${prevLabel.toLowerCase()} (${formatYm(d[prev])})`,
        explanation: 'Key dates must go application → booking → AFL signing → key collection. Out of order, payments land in the wrong months (e.g. the key-collection downpayment before the AFL one).',
        fixes: [`Check the ${curLabel.toLowerCase()} and ${prevLabel.toLowerCase()} dates (Flat section).`],
      })
      break
    }
  }

  // --- Cash shortfalls ---
  const original = negativeCashMonths(core)
  for (const [i, ep] of cashEpisodes(core).entries()) {
    const startIdx = ymToIndex(ep.start)
    const causeEvents = core.events
      .filter((e) => ymToIndex(e.ym) === startIdx && e.kind !== 'grant' && e.fromCash > 0)
      .sort((a, b) => b.fromCash - a.fromCash)
      .slice(0, 3)
    const causes = causeEvents.map((e) => `${e.label} (${money(e.fromCash)} cash)`)
    const funding = (id: string) => core.schedule.obligations.find((o) => o.id === id)?.funding ?? 'cashOnly'
    const allCashOnly = causeEvents.every((e) => e.kind === 'rent' || funding(e.itemId) === 'cashOnly')
    const span = ep.start === ep.end ? formatYm(ep.start) : `${formatYm(ep.start)} to ${formatYm(ep.end)}`
    warnings.push({
      id: `cash-${i}`,
      severity: 'error',
      ym: ep.start,
      title: `Not enough cash: ${span}`,
      explanation:
        `Your cash runs out and would be ${money(ep.deepest)} at its lowest (${formatYm(ep.deepestYm)}).` +
        (causes.length ? ` Payments that month: ${causes.join(', ')}.` : '') +
        (allCashOnly
          ? ' These can only be paid in cash, so CPF can’t help here.'
          : ' Part of this could be paid from CPF instead of cash.') +
        // Pulling out isn't free once you've booked: worth knowing before you sign.
        (ep.start > s.flat.dates.afl && ep.start <= s.flat.dates.keys
          ? ` Pulling out after signing the AFL costs 5% of the price (${money(core.policy.fees.cancelAfterAflPct * core.schedule.loan.effectivePrice)}) and a 1-year wait, so sort this out before you sign.`
          : ep.start >= s.flat.dates.booking && ep.start <= s.flat.dates.afl && s.flat.dates.booking < s.flat.dates.afl
            ? ' Cancelling after booking costs the option fee and a 1-year wait before you can apply again.'
            : ''),
      fixes: i < 3 ? cashFixes(core, ep, original) : [],
    })
  }

  // --- CPF OA negative (should not happen, but check) ---
  const oaNeg = core.months.find((m) => m.perPartner.A.oa < -0.5 || m.perPartner.B.oa < -0.5)
  if (oaNeg) {
    warnings.push({
      id: 'oa-negative', severity: 'error', ym: oaNeg.ym,
      title: `CPF OA goes negative in ${formatYm(oaNeg.ym)}`,
      explanation: 'A payment drew more from CPF OA than was available.',
      fixes: ['Lower the CPF slider or check the amounts you entered.'],
    })
  }

  // --- LTV / tenure / age ---
  const ltvRule = maxLtvFor(s, core.policy)
  const maxLtv = ltvRule.max
  if (s.financing.ltv > maxLtv + 1e-9 && isHdb && ltvRule.reduced) {
    // HDB loan limit cut by the age-95 lease rule.
    warnings.push({
      id: 'ltv', severity: 'error',
      title: `HDB will lend at most ${Math.round(maxLtv * 1000) / 10}% (not ${Math.round(s.financing.ltv * 100)}%)`,
      explanation: `The HDB loan limit is reduced because ${ltvRule.reason}. The simulation uses ${Math.round(maxLtv * 1000) / 10}%, so you pay ${money((s.financing.ltv - maxLtv) * core.schedule.loan.effectivePrice)} more upfront.`,
      fixes: [`Plan for a ${Math.round(maxLtv * 1000) / 10}% loan-to-value, or look at flats with a longer remaining lease.`],
    })
  } else if (s.financing.ltv > maxLtv + 1e-9) {
    const b = core.policy.bankLoan
    warnings.push({
      id: 'ltv', severity: ltvRule.reduced ? 'error' : 'warning',
      title: ltvRule.reduced ? `Bank will lend at most ${Math.round(maxLtv * 100)}% (not ${Math.round(s.financing.ltv * 100)}%)` : `Loan-to-value capped at ${Math.round(maxLtv * 100)}%`,
      explanation: ltvRule.reduced
        ? `For HDB flats, a bank loan’s limit drops to ${Math.round(b.reducedLtv * 100)}% when ${ltvRule.reason}, and at least ${Math.round(b.reducedMinCashPct * 100)}% must be paid in cash. The simulation uses ${Math.round(maxLtv * 100)}%, so you pay ${money((s.financing.ltv - maxLtv) * core.schedule.loan.effectivePrice)} more upfront.`
        : `You chose ${Math.round(s.financing.ltv * 100)}%, but the limit for ${isHdb ? 'an HDB' : 'a bank'} loan is ${Math.round(maxLtv * 100)}%. The simulation uses ${Math.round(maxLtv * 100)}%.`,
      fixes: ltvRule.reduced
        ? [`Shorten the tenure to ${b.ltvTenureYears} years or less${s.financing.tenureYears > b.ltvTenureYears ? '' : ', so the loan ends by age ' + b.ltvMaxAge}.`, `Or plan for a ${Math.round(maxLtv * 100)}% loan-to-value.`]
        : [`Set the loan-to-value to ${Math.round(maxLtv * 100)}% or less.`],
    })
  }
  if (isHdb && core.schedule.loan.loanAmount > 0) {
    const cap = hdbMaxTenure(s, core.policy)
    if (s.financing.tenureYears > cap.years) {
      warnings.push({
        id: 'hdb-tenure', severity: 'warning', ym: s.flat.dates.keys,
        title: `HDB lends over ${cap.years} years at most, not ${s.financing.tenureYears}`,
        explanation:
          `An HDB loan runs for the shortest of: ${cap.byMax} years; ${core.policy.hdbLoan.maxAgeAtEnd} minus your average age at application (${Number.isInteger(cap.avgAge) ? cap.avgAge : cap.avgAge.toFixed(1)}), which is ${cap.byAge} years; ` +
          `and the remaining lease minus ${core.policy.lease.minYearsForCpf}, which is ${cap.byLease} years. The plan uses ${cap.years} years: ${money(core.schedule.loan.monthlyInstalment)}/month.`,
        fixes: [`Set the tenure to ${cap.years} years (Loan section) so the numbers match.`],
      })
    }
  }
  const maxTenure = isHdb ? core.policy.hdbLoan.maxTenureYears : core.policy.bankLoan.maxTenureYears
  if (!isHdb && s.financing.tenureYears > maxTenure) {
    warnings.push({
      id: 'tenure', severity: 'warning',
      title: `Tenure longer than ${maxTenure} years`,
      explanation: `${isHdb ? 'HDB' : 'Bank'} loans for HDB flats are usually capped at ${maxTenure} years (and may be shorter depending on your ages).`,
      fixes: [`Use a tenure of ${maxTenure} years or less.`],
    })
  }

  // --- Eligibility, household & grants ---
  const el = core.schedule.eligibility
  const singles = isSinglesPurchase(s)
  if (el.singlesIssues.length) {
    warnings.push({
      id: 'singles-eligibility', severity: 'error',
      title: isSingle(s) ? 'You may not be able to buy this flat as a single' : 'You may not qualify under the Joint Singles Scheme',
      explanation: el.singlesIssues.join(' '),
      fixes: s.flat.type !== '2R' ? ['Set the flat type to 2-room Flexi.'] : [],
    })
  }
  if (singles) {
    // Citizenship is covered by the singles check above.
  } else if (el.bothSpr) {
    warnings.push({
      id: 'both-spr', severity: 'error',
      title: 'Two PRs can’t buy a BTO flat',
      explanation: 'A BTO flat needs at least one Singapore Citizen applicant. PR couples can only buy resale flats.',
      fixes: ['Check each partner’s citizenship under Us.'],
    })
  } else if (el.scSpr) {
    warnings.push({
      id: 'sc-spr', severity: 'info',
      title: `Citizen + PR household: ${money(el.premium)} premium included`,
      explanation: `SC/SPR households pay ${money(el.premium)} more for a new flat, so the price used is ${money(core.schedule.loan.effectivePrice)}. You may get it back as a Citizen Top-Up when the PR partner becomes a citizen (or you have a citizen child).`,
      fixes: [],
    })
  }
  if (el.aboveCeiling) {
    warnings.push({
      id: 'income-ceiling', severity: 'error', ym: el.purchaseAssessedAt,
      title: `${isSingle(s) ? 'Income' : 'Household income'} above the ${money(el.incomeCeiling)} ceiling`,
      explanation: `Your average ${isSingle(s) ? '' : 'household '}income of about ${money(el.purchaseAvgIncome)}/month (12 months before applying in ${formatYm(el.purchaseAssessedAt)}) is above the income ceiling for this flat type, so you can’t buy this flat.`,
      fixes: ['Check the income figures, or look at resale flats / Executive Condominiums.'],
    })
  }
  for (const g of s.flat.grants) {
    if (g.auto === 'EHG' && el.ehg === 0) {
      warnings.push({
        id: `ehg-zero-${g.id}`, severity: 'warning',
        title: 'No Enhanced CPF Housing Grant expected',
        explanation: el.ehgReason + (s.financing.deferredIncomeAssessment ? '' : ' Students/NSFs may qualify later with Deferred Income Assessment.'),
        fixes: [],
      })
    }
    if (g.auto === 'StepUp' && el.stepUp === 0) {
      warnings.push({ id: `stepup-zero-${g.id}`, severity: 'warning', title: 'Not eligible for the Step-Up grant', explanation: el.stepUpReason, fixes: [] })
    }
    if (!g.auto && /enhanced/i.test(g.name) && el.household !== 'secondTimers' && g.amount > el.ehg + 1) {
      warnings.push({
        id: `ehg-high-${g.id}`, severity: 'warning',
        title: `Grant looks higher than your income suggests`,
        explanation: `You entered ${money(g.amount)}, but an average household income of ${money(el.avgIncome)}/month points to about ${money(el.ehg)}. ${el.ehgReason}`,
        fixes: [`Use the automatic grant amount, or check your HFE letter.`],
      })
    }
  }
  if (el.household === 'secondTimers' && !singles) {
    warnings.push({
      id: 'second-timers', severity: 'info',
      title: 'Second-timers: resale levy not included',
      explanation: 'If you previously bought a subsidised flat or got a housing grant, you may have to pay a resale levy on this purchase. It isn’t included here — add it as a cost if it applies.',
      fixes: [],
    })
  }
  if (extras.cpfCapReachedYm) {
    const within = ymToIndex(extras.cpfCapReachedYm) <= ymToIndex(core.endMonth)
    warnings.push({
      id: 'cpf-cap', severity: within ? 'warning' : 'info', ym: extras.cpfCapReachedYm,
      title: `CPF limit for the flat reached in ${formatYm(extras.cpfCapReachedYm)}`,
      explanation: `With a bank loan you can use CPF up to the flat’s value${s.financing.brsSetAside ? ` × ${core.policy.cpf.withdrawalLimitMultiple} (Withdrawal Limit)` : ''}: ${money(core.schedule.loan.cpfCap)}. After that, the mortgage has to be paid in cash.`,
      fixes: s.financing.brsSetAside ? [] : [`If you have at least the Basic Retirement Sum (${money(core.policy.cpf.basicRetirementSum)}) in CPF, tick “BRS set aside” to use up to ${Math.round(core.policy.cpf.withdrawalLimitMultiple * 100)}%.`],
    })
  }

  // --- SBF / open booking: completed flats, remaining lease ---
  const lp = core.policy.lease
  if (isCompleted(s)) {
    const months = monthsBetween(s.flat.dates.booking, s.flat.dates.keys)
    if (months > lp.completedKeysWithinMonths || months < 0) {
      warnings.push({
        id: 'completed-keys', severity: 'warning', ym: s.flat.dates.keys,
        title: `Key collection is ${months} months after booking`,
        explanation: `For a completed flat, HDB invites you to sign the AFL and collect keys within ${lp.completedKeysWithinMonths} months of booking.`,
        fixes: [`Set “AFL + key collection” within ${lp.completedKeysWithinMonths} months of booking.`],
      })
    }
  }
  // Flats still being built: HDB invites you to sign the AFL within 9 months of booking.
  if (!isCompleted(s) && monthsBetween(s.flat.dates.booking, s.flat.dates.afl) > lp.completedKeysWithinMonths) {
    warnings.push({
      id: 'afl-late', severity: 'warning', ym: s.flat.dates.afl,
      title: `AFL signing is ${monthsBetween(s.flat.dates.booking, s.flat.dates.afl)} months after booking`,
      explanation: `HDB invites you to sign the Agreement for Lease within ${lp.completedKeysWithinMonths} months of booking, so the AFL payments are likely due earlier than planned.`,
      fixes: [`Set AFL signing within ${lp.completedKeysWithinMonths} months of booking (Flat section).`],
    })
  }
  const lf = leaseFactor(s, core.policy)
  if (lf.factor === 0) {
    warnings.push({
      id: 'lease-no-cpf', severity: 'error',
      title: `Remaining lease of ${lf.lease} years is too short for CPF or an HDB loan`,
      explanation: `With ${lp.minYearsForCpf} years or less left on the lease, you can’t use CPF for the flat or take an HDB loan, so everything is paid in cash.`,
      fixes: ['Check the remaining lease, or look at flats with a longer lease.'],
    })
  } else if (lf.factor < 1) {
    warnings.push({
      id: 'lease-prorated', severity: 'warning',
      title: `Shorter lease: CPF use ${isHdb ? 'and HDB loan ' : ''}limited to ${Math.round(lf.factor * 100)}%`,
      explanation: `The ${lf.lease}-year remaining lease lasts the youngest of you (${lf.youngest}) only to age ${lf.youngest + lf.lease}, not ${lp.coverToAge}. CPF you can use for the flat${isHdb ? ' and the HDB loan limit are' : ' is'} pro-rated to ${lf.lease}/${lf.needed} = ${Math.round(lf.factor * 100)}%.`,
      fixes: [],
    })
  }

  // --- Loan changes after key collection ---
  // The loan's real first instalment (HDB: the 2nd month after keys; banks: the month after).
  const firstInstalment = core.loanPath[0]?.ym ?? addMonths(s.flat.dates.keys, 1)
  const changes = loanChangesOf(s.financing, s.flat.dates.keys)
  // A refinance dated before keys is a financing switch, explained separately below.
  const early = changes.filter((c) => c.from < firstInstalment && c.kind !== 'refinance')
  if (early.length) {
    warnings.push({
      id: 'loan-change-early', severity: 'info',
      title: 'Some loan changes are dated before the loan starts',
      explanation: `They take effect from the first instalment in ${formatYm(firstInstalment)}.`,
      fixes: [],
    })
  }
  const sw = preKeysSwitch(s)
  if (sw) {
    const b = core.bankSwitch
    const pct = b ? Math.round((b.cashRequiredTotal / core.schedule.loan.effectivePrice) * 1000) / 10 : 5
    warnings.push({
      id: 'switch-before-keys', severity: 'info', ym: s.flat.dates.keys,
      title: `Switching to a bank loan before key collection`,
      explanation:
        `The bank loan starts at key collection (${formatYm(s.flat.dates.keys)}), and the bank’s cash rule applies then: at least ${pct}% of the price in cash across the whole downpayment` +
        (b ? ` (${money(b.cashRequiredTotal)}; you’ll have paid ${money(b.cashPaidBefore)} in cash before keys, so ${money(b.extraCash)} more cash at keys).` : '.') +
        ' You won’t be able to switch back to an HDB loan. Based on the rule you described; confirm with HDB and your bank.',
      fixes: [],
    })
    if (sw.from < s.flat.dates.afl) {
      warnings.push({
        id: 'switch-before-afl', severity: 'info',
        title: 'Switch dated before AFL signing',
        explanation: 'You declare your financing at AFL. If you already know you’ll take a bank loan, choose “Bank loan” as the loan type instead, so AFL follows the bank schedule (20% at AFL, 5% of it in cash) and you get the bank’s Letter of Offer in time.',
        fixes: ['Set Loan type to Bank loan and remove this switch.'],
      })
    }
    // The bank will assess affordability at its stress rate when the loan starts.
    const loan = core.schedule.loan
    const stress = Math.max(sw.rate, core.policy.bankLoan.stressRate)
    const inst = monthlyInstalment(loan.loanAmount, stress, sw.tenureYears || s.financing.tenureYears)
    const income = householdIncome(s, s.flat.dates.keys)
    const otherDebt = s.partners.reduce((a, p) => a + (p.otherMonthlyDebt || 0), 0)
    if (income > 0 && (inst / income > core.policy.msr || (inst + otherDebt) / income > core.policy.tdsr)) {
      warnings.push({
        id: 'switch-msr', severity: 'warning', ym: s.flat.dates.keys,
        title: 'The bank may not lend the full amount when you switch',
        explanation: `Tested at ${(stress * 100).toFixed(1)}%, the instalment would be ${money(inst)}/month on ${money(income)} income at key collection: MSR ${(inst / income * 100).toFixed(1)}% (limit ${Math.round(core.policy.msr * 100)}%), TDSR ${((inst + otherDebt) / income * 100).toFixed(1)}% (limit ${Math.round(core.policy.tdsr * 100)}%).`,
        fixes: ['Keep the HDB loan, or plan to borrow less / choose a longer tenure with the bank.'],
      })
    }
  }
  const path = extras.loanPath ?? core.loanPath
  const refi = path.find((p) => p.change === 'refinance')
  if (refi && isHdb && !preKeysSwitch(s)) {
    warnings.push({
      id: 'hdb-to-bank', severity: 'info', ym: refi.ym,
      title: `Switching from HDB loan to bank loan in ${formatYm(refi.ym)}`,
      explanation: `Once you leave an HDB loan you can’t switch back. From then, CPF for the flat is capped at its value${s.financing.brsSetAside ? ' × 1.2 (BRS set aside)' : ''}, counting what you’ve already used, and bank rates can change.`,
      fixes: [],
    })
  }
  for (const step of path.filter((p) => p.change === 'tenure' || p.change === 'refinance')) {
    const totalYears = (ymToIndex(step.ym) - ymToIndex(firstInstalment) + step.monthsLeft) / 12
    const maxYears = step.loanType === 'HDB' ? core.policy.hdbLoan.maxTenureYears : core.policy.bankLoan.maxTenureYears
    // HDB goes by the applicants' plain average age (whole years); banks by the income-weighted one.
    const endAge = (step.loanType === 'HDB'
      ? s.partners.reduce((a, p) => a + Math.floor(ageInMonths(p.birthYearMonth, step.ym) / 12), 0) / s.partners.length
      : weightedAge(s, step.ym)) + step.monthsLeft / 12
    const ageLimit = step.loanType === 'HDB' ? core.policy.hdbLoan.maxAgeAtEnd : core.policy.bankLoan.ltvMaxAge
    if (totalYears > maxYears + 0.05 || endAge > ageLimit + 0.5) {
      warnings.push({
        id: `loan-term-${step.ym}`, severity: 'warning', ym: step.ym,
        title: `Loan term after ${formatYm(step.ym)} may not be allowed`,
        explanation: [
          totalYears > maxYears + 0.05 ? `The loan would last about ${Math.round(totalYears)} years in total; ${step.loanType === 'HDB' ? 'HDB' : 'bank'} loans for HDB flats usually max out at ${maxYears}.` : '',
          endAge > ageLimit + 0.5 ? `You’d be about ${Math.round(endAge)} when it ends; lenders usually want it paid off by ${ageLimit}.` : '',
        ].filter(Boolean).join(' '),
        fixes: ['Choose a shorter remaining tenure.'],
      })
    }
  }

  // --- Voluntary CPF top-ups cut back ---
  for (const id of ['A', 'B'] as const) {
    const notes = core.topUpNotes.filter((n) => n.partner === id)
    if (!notes.length) continue
    const name = s.partners[id === 'A' ? 0 : 1].name
    const limit = notes.filter((n) => n.reason === 'limit')
    const cash = notes.filter((n) => n.reason === 'cash')
    warnings.push({
      id: `topup-${id}`, severity: 'info', ym: notes[0].ym,
      title: `${name}: some voluntary CPF top-ups were reduced`,
      explanation: [
        limit.length ? `${limit.length} top-up${limit.length > 1 ? 's' : ''} hit the CPF Annual Limit of ${money(core.policy.cpf.annualLimit)} (normal + voluntary contributions in a year), first in ${formatYm(limit[0].ym)}.` : '',
        cash.length ? `${cash.length} top-up${cash.length > 1 ? 's were' : ' was'} cut because there wasn’t enough cash, first in ${formatYm(cash[0].ym)}.` : '',
      ].filter(Boolean).join(' '),
      fixes: [],
    })
  }

  if (el.hdbLoanBlockedByDia && !preKeysSwitch(s)) {
    warnings.push({
      id: 'dia-loan-ceiling', severity: 'error', ym: el.assessedAt,
      title: `No HDB loan: income above ${money(el.hdbLoanIncomeCeiling)} at the deferred assessment`,
      explanation:
        `With Deferred Income Assessment, HDB checks your income around ${formatYm(el.assessedAt)}: about ${money(el.avgIncome)}/month, above the ${money(el.hdbLoanIncomeCeiling)} ceiling for an HDB loan. ` +
        `You keep the flat (you qualified when you applied), but you’d need a bank loan instead — with the bank’s 5% cash downpayment rule at key collection — and no Enhanced CPF Housing Grant above ${money(core.policy.eligibility.ehgFamilies.at(-1)?.upTo ?? 9000)}.`,
      fixes: [
        'In Loan changes, add “Switch to bank loan” dated at key collection to see the extra cash needed.',
        'Or choose Bank loan as your loan type from the start.',
      ],
    })
  }

  // --- Home Protection Scheme: compulsory only when CPF pays the instalments ---
  const hps = s.costs.find((c) => c.kind === 'hps')
  if (core.schedule.loan.loanAmount > 0) {
    if (s.financing.mortgageFrom === 'cashOnly' && hps && hps.amount > 0) {
      warnings.push({
        id: 'hps-optional', severity: 'info', ym: s.flat.dates.keys,
        title: 'Home Protection Scheme is optional when you pay the mortgage in cash',
        explanation: `HPS is compulsory only if CPF pays your instalments. This plan pays them in cash but still includes ${money(hps.amount)} a year of HPS.`,
        fixes: ['If you won’t take it, remove the HPS item under Costs (and consider other life or mortgage cover).'],
      })
    } else if (s.financing.mortgageFrom === 'cpfFirst' && !hps) {
      warnings.push({
        id: 'hps-missing', severity: 'warning', ym: s.flat.dates.keys,
        title: 'Home Protection Scheme is compulsory when CPF pays the mortgage',
        explanation: 'This plan pays the instalments from CPF but has no HPS premium. HPS is a yearly premium, paid from CPF OA or cash, from when the loan is disbursed.',
        fixes: ['Add an HPS cost (yearly from key collection), or pay the mortgage in cash only (Loan section).'],
      })
    }
  }

  // --- Turning 55 while CPF pays the mortgage (the Retirement Account transfer isn't simulated) ---
  if (core.schedule.loan.loanAmount > 0 && s.financing.mortgageFrom === 'cpfFirst') {
    const loanEnd = addMonths(s.flat.dates.keys, Math.round(core.schedule.loan.tenureYears * 12) + 1)
    const people = isSingle(s) ? [s.partners[0]] : s.partners
    const turning = people
      .map((p) => ({ name: p.name, at: addMonths(p.birthYearMonth, 55 * 12) }))
      .filter((x) => x.at > core.startMonth && x.at <= loanEnd)
      .sort((a, b) => (a.at < b.at ? -1 : 1))[0]
    if (turning) {
      const inPlan = turning.at <= core.endMonth
      warnings.push({
        id: 'cpf-55', severity: inPlan ? 'warning' : 'info', ym: turning.at,
        title: `${isSingle(s) ? 'You turn' : `${turning.name} turns`} 55 in ${formatYm(turning.at)}, before the loan is paid off`,
        explanation:
          `At 55, CPF opens a Retirement Account and moves your Special Account, then Ordinary Account savings into it, up to the Full Retirement Sum (${money(core.policy.cpf.fullRetirementSum)}). ` +
          `This app doesn’t model that move${inPlan ? ', so the CPF OA shown from that month may be too high' : ''}. Your OA contributions after 55 can still pay the loan.`,
        fixes: [
          `Apply to CPF to reserve your OA savings for housing payments, within the 6 months before turning 55 (from ${formatYm(addMonths(turning.at, -6))}). They then stay in OA instead of moving to the Retirement Account. Not needed if your Special Account already meets the Full Retirement Sum.`,
          'Or plan to pay more of the instalment in cash after 55, or prepay part of the loan with OA before then.',
        ],
      })
    }
  }

  // --- HDB partial repayments: at least $5,000, in multiples of $1,000 (paying it all off is fine) ---
  const hp = core.policy.hdbLoan
  const oddPrepay = (extras.loanPath ?? core.loanPath).find((st) =>
    st.change === 'prepay' && st.loanType === 'HDB' && st.outstanding > 0.5 && st.prepaid !== undefined &&
    (st.prepaid < hp.minPrepay - 0.5 || Math.abs(st.prepaid / hp.prepayStep - Math.round(st.prepaid / hp.prepayStep)) > 1e-6))
  if (oddPrepay) {
    warnings.push({
      id: 'hdb-prepay-amount', severity: 'warning', ym: oddPrepay.ym,
      title: `HDB takes partial repayments of ${money(hp.minPrepay)} or more, in ${money(hp.prepayStep)} steps`,
      explanation: `The prepayment of ${money(oddPrepay.prepaid!)} in ${formatYm(oddPrepay.ym)} doesn’t fit HDB’s rule (loans from April 2012). Paying off the whole loan can be any amount.`,
      fixes: [`Round it to ${money(Math.max(hp.minPrepay, Math.round(oddPrepay.prepaid! / hp.prepayStep) * hp.prepayStep))} (Loan changes).`],
    })
  }

  // --- Made-up starting values still in the plan ---
  const people = isSingle(s) ? [s.partners[0]] : s.partners
  const FIELD_NAMES: Record<string, string> = { grossMonthly: 'salary', cash: 'cash savings', cpfOA: 'CPF OA', monthlyCashSavings: 'monthly savings', birthYearMonth: 'birth month' }
  const leftovers = [
    ...people.map((p) => {
      const fields = (s.exampleFields ?? []).filter((k) => k.startsWith(`${p.id}.`)).map((k) => FIELD_NAMES[k.slice(2)]).filter(Boolean)
      return fields.length ? `${isSingle(s) ? 'your' : `${p.name}’s`} ${fields.join(', ')}` : ''
    }),
    s.exampleFields?.includes('flat.price') ? 'the flat price' : '',
  ].filter(Boolean)
  if (leftovers.length) {
    warnings.push({
      id: 'example-values', severity: 'warning',
      title: 'Some numbers are still examples',
      explanation: `These are made-up starting values, not yours: ${leftovers.join('; ')}. The results won’t mean much until you replace them.`,
      fixes: ['Change them in Edit plan (Us and Flat); fields marked “example” are the ones left.'],
    })
  }

  // --- A grant you'd likely get but haven't added (plans made before the wizard included it) ---
  const ehg = core.schedule.eligibility.ehg
  const hasEhg = s.flat.grants.some((g) => g.auto === 'EHG' || /enhanced/i.test(g.name))
  if (ehg > 0 && !hasEhg) {
    warnings.push({
      id: 'ehg-missing', severity: 'warning', ym: s.flat.dates.keys,
      title: `You may be missing a ${money(ehg)} grant`,
      explanation: `From your income, you look eligible for about ${money(ehg)} of Enhanced CPF Housing Grant, but this plan doesn’t include it, so your CPF is shown lower than it will be.`,
      fixes: ['In the Flat section, tap “+ Enhanced CPF Housing Grant (auto)”.'],
    })
  }

  // --- Parenthood Provisional Housing Scheme (HDB rental while waiting) ---
  if (s.interim.mode === 'pphs') {
    const why: string[] = []
    if (isCompleted(s)) why.push('it’s for flats still being built, and yours is completed')
    if (isSinglesPurchase(s)) why.push('it’s for couples, or divorced or widowed parents with children')
    else if ((s.flat.household ?? 'firstTimers') === 'secondTimers') why.push('at least one of you must be a first-timer')
    const income = core.schedule.eligibility.purchaseAvgIncome
    if (income > core.policy.pphs.incomeCeiling) why.push(`household income must be ${money(core.policy.pphs.incomeCeiling)} or less (yours is about ${money(income)})`)
    if (why.length) {
      warnings.push({
        id: 'pphs-eligibility', severity: 'warning', ym: s.flat.dates.booking,
        title: 'Probably not eligible for a PPHS flat',
        explanation: `The Parenthood Provisional Housing Scheme lets you rent from HDB after booking, until keys, but ${why.join('; ')}.`,
        fixes: ['Choose “Rent” with an open-market rent, or “Live with parents” (Costs section).'],
      })
    }
    if (s.interim.monthlyCost <= 0) {
      warnings.push({
        id: 'pphs-rent', severity: 'info', ym: s.flat.dates.booking,
        title: 'Enter your PPHS rent',
        explanation: 'The plan has no rent for the PPHS flat yet. Rents depend on the flat; use the amount HDB quotes.',
        fixes: [],
      })
    }
  }

  // --- Resale levy (second-timers) ---
  const levyItem = s.costs.find((c) => c.kind === 'resaleLevy')
  if ((s.flat.household ?? 'firstTimers') !== 'firstTimers' && levyItem && levyItem.auto !== false && !s.flat.firstSubsidisedFlat) {
    warnings.push({
      id: 'resale-levy-unset', severity: 'warning', ym: s.flat.dates.keys,
      title: 'Resale levy not included yet',
      explanation: `Second-timers buying another subsidised flat usually pay a resale levy in cash (${money(Math.min(...Object.values(core.policy.resaleLevy)))} to ${money(Math.max(...Object.values(core.policy.resaleLevy)))}), set by the type of their first subsidised flat.`,
      fixes: ['Pick your first subsidised flat in the Flat section (or “No subsidy before” if you never had one).'],
    })
  }

  // --- Staggered Downpayment Scheme eligibility (HDB tells you at booking; DIA takes precedence) ---
  if (s.financing.staggered && !s.financing.deferredIncomeAssessment && !isCompleted(s)) {
    const sp = core.policy.staggered
    const problems: string[] = []
    const standardAfl = core.policy.downpayment[isHdb ? 'hdb' : 'bank'].standard.afl.pct
    if ((s.flat.household ?? 'firstTimers') === 'secondTimers') {
      if (!sp.rightSizerFlatTypes.includes(s.flat.type)) {
        problems.push('Second-timer couples qualify only when right-sizing from a flat they own to a 3-room or smaller flat.')
      } else {
        warnings.push({
          id: 'staggered-rightsizer', severity: 'warning', ym: s.flat.dates.application,
          title: 'Staggered downpayment: only if you’re right-sizing',
          explanation: 'As second-timers, you qualify only if you own a flat and haven’t sold it (or completed the sale) when you apply for the HFE letter.',
          fixes: [`If that’s not you, turn off Staggered downpayment: you’d pay ${pctStr(standardAfl)} at AFL.`],
        })
      }
    } else {
      if (!sp.flatTypes.includes(s.flat.type)) problems.push('Only 5-room or smaller flats qualify.')
      const youngest = Math.min(...s.partners.map((p) => ageInMonths(p.birthYearMonth, s.flat.dates.application)))
      if (youngest > sp.maxYoungerAgeYears * 12) {
        problems.push(`The HFE letter must be applied for on or before the younger applicant’s ${sp.maxYoungerAgeYears}th birthday; at application (${formatYm(s.flat.dates.application)}) the younger of you will be ${Math.floor(youngest / 12)}.`)
      }
    }
    if (problems.length) {
      warnings.push({
        id: 'staggered-eligibility', severity: 'error', ym: s.flat.dates.application,
        title: 'Probably not eligible for the staggered downpayment',
        explanation: problems.join(' ') + ` Without it you pay ${pctStr(standardAfl)} at AFL instead of ${pctStr(core.policy.downpayment[isHdb ? 'hdb' : 'bank'].staggered.afl.pct)}.`,
        fixes: ['Turn off Staggered downpayment (Loan section) to see the standard payments.'],
      })
    }
  }

  // --- Deferred Income Assessment ---
  const dia = !!s.financing.deferredIncomeAssessment
  if (dia) {
    const maxAge = core.policy.dia.maxAgeYears
    // Checked at the HFE letter application (hdb.gov.sg DIA page).
    const hfeAt = hfeMonth(s, core.policy)
    const ages = s.partners.map((p) => Math.floor(ageInMonths(p.birthYearMonth, hfeAt) / 12))
    if (ages.every((a) => a > maxAge)) {
      warnings.push({
        id: 'dia-age', severity: 'error', ym: hfeAt,
        title: 'Probably not eligible for Deferred Income Assessment',
        explanation: `At least one of you must be ${maxAge} or younger when applying for the HFE letter. In ${formatYm(hfeAt)} you’ll be ${ages[0]} and ${ages[1]}.`,
        fixes: ['Turn off Deferred Income Assessment, or apply for the HFE letter earlier.'],
      })
    }
    if ((s.flat.household ?? 'firstTimers') === 'secondTimers') {
      warnings.push({
        id: 'dia-household', severity: 'error', ym: hfeAt,
        title: 'Deferred Income Assessment needs a first-timer',
        explanation: 'At least one of you must be a first-timer; second-timer couples can’t use it.',
        fixes: ['Turn off Deferred Income Assessment (Loan section).'],
      })
    }
    warnings.push({
      id: 'dia-info', severity: 'info', ym: loan.assessedAt,
      title: `Deferred Income Assessment: loan and grant assessed around ${formatYm(loan.assessedAt)}`,
      explanation:
        (isCompleted(s)
          ? `For a completed flat, HDB looks at your income at flat booking (projected`
          : `HDB will look at your income about ${core.policy.dia.assessmentMonthsBeforeKeys} months before key collection (projected`) + `  ${money(loan.grossIncomeAtAssessment)}/month combined) to decide your Enhanced CPF Housing Grant and HDB loan. ` +
        `The grant is paid at key collection. At least one of you must be a full-time student/NSF, or have finished within ${core.policy.dia.recentGradMonths} months, when you apply for the HFE letter.`,
      fixes: [],
    })
    const early = s.flat.grants.filter((g) => !('milestone' in g.when && g.when.milestone === 'keys' && !g.when.offsetMonths))
    if (early.length) {
      warnings.push({
        id: 'dia-grant-timing', severity: 'warning',
        title: 'Under DIA, grants are paid at key collection',
        explanation: `${early.map((g) => g.name).join(', ')} ${early.length > 1 ? 'are' : 'is'} set to arrive before key collection, but with Deferred Income Assessment the grant is only disbursed at key collection.`,
        fixes: ['Set the grant’s “Credited at” to Key collection.'],
      })
    }
  }
  if (loan.loanAmount > 0 && loan.grossIncomeAtAssessment <= 0) {
    warnings.push({
      id: 'no-income', severity: 'error', ym: loan.assessedAt,
      title: `No income when the loan is assessed (${formatYm(loan.assessedAt)})`,
      explanation: 'Neither of you has a salary in the month your loan is assessed, so you wouldn’t get a loan.' + (dia ? '' : ' If you are students/NSFs, turn on Deferred Income Assessment so income is checked just before key collection.'),
      fixes: ['Check each partner’s “Starts full-time work” month.', ...(dia ? [] : ['Turn on Deferred Income Assessment (Loan section).'])],
    })
  }

  // --- HFE letter timing: needed (valid) when you apply; valid 9 months ---
  const hfe = hfeMonth(s, core.policy)
  if (hfe > s.flat.dates.application) {
    warnings.push({
      id: 'hfe-after-application', severity: 'warning', ym: hfe,
      title: 'The HFE letter comes after the flat application',
      explanation: `You need a valid HFE letter when you apply for the flat (${formatYm(s.flat.dates.application)}), and it can take up to a month to process.`,
      fixes: [`Set the HFE letter to ${formatYm(addMonths(s.flat.dates.application, -core.policy.hfe.monthsBeforeApplication))} or earlier (Flat section, Key dates).`],
    })
  } else if (monthsBetween(hfe, s.flat.dates.application) > core.policy.hfe.validityMonths) {
    warnings.push({
      id: 'hfe-expired', severity: 'warning', ym: s.flat.dates.application,
      title: `The HFE letter would expire before you apply`,
      explanation: `An HFE letter is valid for ${core.policy.hfe.validityMonths} months. Applied for in ${formatYm(hfe)}, it runs out before ${formatYm(s.flat.dates.application)}, so you’d need a fresh one and HDB would look at your income then.`,
      fixes: ['Move the HFE letter date closer to the flat application (Flat section, Key dates).'],
    })
  }

  // --- HDB re-checks your finances before keys (uncompleted flats; DIA already assesses then) ---
  if (isHdb && !dia && !isCompleted(s) && !preKeysSwitch(s) && loan.loanAmount > 0) {
    const reviewAt = addMonths(s.flat.dates.keys, -core.policy.dia.assessmentMonthsBeforeKeys)
    const income = householdIncome(s, reviewAt)
    const ratio = income > 0 ? loan.stressInstalment / income : Infinity
    if (ratio > loan.msrLimit + 1e-9 && !(loan.grossIncomeAtAssessment > 0 && loan.msr > loan.msrLimit + 1e-9)) {
      warnings.push({
        id: 'loan-review', severity: 'warning', ym: reviewAt,
        title: income > 0 ? 'HDB’s check before keys may cut your loan' : 'No income when HDB re-checks your loan before keys',
        explanation:
          `HDB reviews your finances nearer completion and may reduce the loan if you can’t afford it any more. ` +
          (income > 0
            ? `Around ${formatYm(reviewAt)} your income is about ${money(income)}/month, so the instalment at ${pctStr(Math.max(loan.rate, core.policy.hdbLoan.stressRate))} (${money(loan.stressInstalment)}) would be ${pctStr(ratio)} of it, above the ${pctStr(loan.msrLimit)} limit.`
            : `Around ${formatYm(reviewAt)} neither of you has a salary in this plan.`),
        fixes: ['Check the job and pay changes around then (Us section).', 'Keep extra cash for a bigger payment at key collection in case the loan is reduced.'],
      })
    }
  }

  // --- MSR / TDSR ---
  if (loan.loanAmount > 0 && loan.grossIncomeAtAssessment > 0 && loan.msr > loan.msrLimit + 1e-9) {
    const cut = Math.ceil((loan.loanAmount - loan.maxLoanUnderMsr) / 100) * 100
    warnings.push({
      id: 'msr', severity: 'error',
      title: `Mortgage Servicing Ratio ${pctStr(loan.msr)} is above ${pctStr(loan.msrLimit)}`,
      explanation:
        `Lenders test your loan at ${pctStr(Math.max(loan.rate, isHdb ? core.policy.hdbLoan.stressRate : core.policy.bankLoan.stressRate))} interest: ` +
        `${money(loan.stressInstalment)}/month against combined income of ${money(loan.grossIncomeAtAssessment)} (${formatYm(loan.assessedAt)}). ` +
        `The loan you can get is likely capped at about ${money(loan.maxLoanUnderMsr)}, so you may need to pay more upfront.`,
      fixes: [
        `Borrow ${money(cut)} less (pay it as extra downpayment at key collection).`,
        ...(s.financing.tenureYears < maxTenure ? [`Stretch the tenure towards ${maxTenure} years to lower the instalment.`] : []),
        `Look at flats priced around ${money(Math.floor((loan.maxLoanUnderMsr / Math.max(0.01, loan.ltvUsed)) / 1000) * 1000)} or less.`,
      ],
    })
  }
  if (!isHdb && loan.loanAmount > 0 && loan.grossIncomeAtAssessment > 0 && loan.tdsr > loan.tdsrLimit + 1e-9) {
    warnings.push({
      id: 'tdsr', severity: 'error',
      title: `Total Debt Servicing Ratio ${pctStr(loan.tdsr)} is above ${pctStr(loan.tdsrLimit)}`,
      explanation: 'Your mortgage (at the stress-test rate) plus other monthly debts take up too much of your income for a bank to lend this amount.',
      fixes: ['Pay down other debts (e.g. car loan) before applying.', `Borrow no more than about ${money(loan.maxLoanUnderMsr)}.`],
    })
  }

  // --- Informational ---
  const fallback = core.events.filter((e) => e.cpfFallbackToCash > 0.5 && e.kind !== 'mortgage')
  if (fallback.length) {
    const total = fallback.reduce((a, e) => a + e.cpfFallbackToCash, 0)
    warnings.push({
      id: 'cpf-fallback', severity: 'info', ym: fallback[0].ym,
      title: 'Planned CPF wasn’t enough — paid in cash instead',
      explanation: `For ${fallback.length} payment${fallback.length > 1 ? 's' : ''}, your OA didn’t have enough for the planned CPF share, so ${money(total)} was paid in cash instead. First: ${fallback[0].label} in ${formatYm(fallback[0].ym)}.`,
      fixes: [],
    })
  }
  const mortgageCash = core.events.filter((e) => e.kind === 'mortgage' && e.fromCash > 0.5)
  if (s.financing.mortgageFrom === 'cpfFirst' && mortgageCash.length) {
    const avg = mortgageCash.reduce((a, e) => a + e.fromCash, 0) / mortgageCash.length
    warnings.push({
      id: 'mortgage-cash', severity: 'info', ym: mortgageCash[0].ym,
      title: 'Monthly CPF doesn’t fully cover the mortgage',
      explanation: `From ${formatYm(mortgageCash[0].ym)}, about ${money(avg)} a month of the mortgage comes from cash because OA contributions aren’t enough.`,
      fixes: [],
    })
  }
  for (const b of core.hdbRuleBumps) {
    warnings.push({
      id: `hdb-oa-${b.ym}`, severity: 'info', ym: b.ym,
      title: 'HDB loan: OA savings must be used first',
      explanation: `With an HDB loan you must use your OA savings for the flat, keeping at most ${money(core.policy.hdbLoan.oaRetainMax)} each. ${money(b.extraCpf)} more CPF than your slider setting was used for "${b.label}".`,
      fixes: [],
    })
  }
  if (core.skipped.length) {
    warnings.push({
      id: 'skipped', severity: 'info',
      title: `${core.skipped.length} payment${core.skipped.length > 1 ? 's' : ''} dated before ${formatYm(core.startMonth)} assumed already paid`,
      explanation: core.skipped.slice(0, 5).map((o) => `${o.label} (${formatYm(o.ym)})`).join(', ') + '. Your entered balances should already reflect them.',
      fixes: [],
    })
  }
  const resaleOnly = s.flat.grants.filter((g) => /proximity|family grant|cpf housing grant/i.test(g.name) && !/enhanced/i.test(g.name))
  if (resaleOnly.length) {
    warnings.push({
      id: 'resale-grants', severity: 'warning',
      title: 'Some grants are for resale flats only',
      explanation: `${resaleOnly.map((g) => g.name).join(', ')}: the Proximity Housing Grant and CPF Housing (Family) Grant apply to resale flats, not new flats from HDB (BTO, SBF or open booking). For a new flat, first-timers usually get only the Enhanced CPF Housing Grant (EHG).`,
      fixes: ['Remove these grants unless HDB has confirmed them in your HFE letter.'],
    })
  }
  // Aged 55+: HDB also sells short-lease flats (not modelled here).
  const buyers = isSingle(s) ? [s.partners[0]] : s.partners
  const atHfe = hfeMonth(s, core.policy)
  if ((s.flat.saleType ?? 'BTO') === 'BTO' && buyers.every((p) => ageInMonths(p.birthYearMonth, atHfe) >= 55 * 12)) {
    warnings.push({
      id: 'seniors-short-lease', severity: 'info', ym: atHfe,
      title: 'Aged 55 or over? You can also buy a short-lease flat',
      explanation:
        'Singapore Citizens aged 55+ can buy a short-lease 2-room Flexi flat or a Community Care Apartment from HDB, choosing a lease of 15 to 45 years that lasts every buyer to 95. ' +
        'There’s no housing loan for these (cash and CPF only), and the price and any extra amounts are lower with a shorter lease. This app plans 99-year flats, so it doesn’t model them.',
      fixes: ['Check HDB’s pages for seniors, or your HFE letter, for the options and prices.'],
    })
  }
  if (isSinglesPurchase(s) && s.flat.type === '2R') {
    const el = core.policy.eligibility
    warnings.push({
      id: 'topup-grant', severity: 'info',
      title: `If you marry later: a Top-Up Grant of up to ${money(el.topUpGrant2RFlexi)}`,
      explanation:
        `Singles who buy a 2-room Flexi from HDB and later marry a first-timer Singapore Citizen or PR can apply for a Top-Up Grant of up to ${money(el.topUpGrant2RFlexi)}, ` +
        `within 6 months of registering the marriage, if household income is ${money(el.topUpIncomeCeiling2RFlexi)}/month or less. It isn’t in this plan.`,
      fixes: ['Once you know the month, add it under Grants as “Other grant”.'],
    })
  }
  if (s.flat.classification !== 'Standard') {
    warnings.push({
      id: 'plus-prime', severity: 'info',
      title: `${s.flat.classification} flat: extra conditions not modelled`,
      explanation:
        `${s.flat.classification} flats have a 10-year minimum occupation period (5 for Standard), you return a share of the resale price to HDB when you sell (${s.flat.classification === 'Prime' ? 'more than for Plus' : 'less than for Prime'}; the percentage is announced at launch), ` +
        'and you can’t rent out the whole flat (spare rooms are allowed for 3-room or bigger). None of this changes what you pay up to key collection, so this timeline isn’t affected.',
      fixes: [],
    })
  }
  if (s.flat.type === 'Exec' && (s.flat.saleType ?? 'BTO') === 'BTO') {
    warnings.push({
      id: 'exec-not-bto', severity: 'warning',
      title: 'Executive flats aren’t sold as BTO',
      explanation: 'HDB offers Executive flats only in Sale of Balance Flats exercises (when available) or on the resale market. BTO flat types go up to 5-room and 3Gen.',
      fixes: ['Pick a 5-room or 3Gen flat, or switch “How you’re buying” to SBF.'],
    })
  }
  const keysMonth = core.months.find((m) => m.ym === s.flat.dates.keys)
  if (keysMonth && loan.monthlyInstalment > 0 && keysMonth.combined.cash >= 0 && keysMonth.combined.cash < 3 * loan.monthlyInstalment) {
    warnings.push({
      id: 'thin-buffer', severity: 'warning', ym: keysMonth.ym,
      title: 'Thin cash buffer at key collection',
      explanation: `You’ll have ${money(keysMonth.combined.cash)} in cash right after collecting keys — less than 3 months of mortgage (${money(3 * loan.monthlyInstalment)}), before renovation surprises.`,
      fixes: ['Keep some cash aside, or delay part of the renovation/furniture spend.'],
    })
  }

  const rank = { error: 0, warning: 1, info: 2 }
  return warnings.sort((a, b) => rank[a.severity] - rank[b.severity])
}

function pctStr(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}
