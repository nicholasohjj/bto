import type { Policy } from '../config/policy'
import { estimatedLivingCosts } from './cpf'
import { addMonths } from './dates'
import { resolvePolicy } from './policyOverrides'
import { simulateCore } from './simulate'
import type { Scenario, YearMonth } from './types'
import { normalizeScenario } from './saleType'

export interface JobLossResult {
  partnerIndex: 0 | 1
  name: string
  from: YearMonth
  months: number
  /** Living costs assumed to come out of savings each month during the gap. */
  monthlyCosts: number
  leanestCash: { ym: YearMonth; amount: number }
  /** First month cash goes below zero (undefined if it never does). */
  firstShortYm?: YearMonth
  /** Change in the lowest cash (from the job loss onwards) vs your plan. */
  leanestChange: number
  /** First month your plan (without the job loss) already goes below zero. */
  planFirstShortYm?: YearMonth
}

/** The scenario with one partner out of work for `months` from `from`. */
export function withJobLoss(s: Scenario, partnerIndex: 0 | 1, from: YearMonth, months: number): Scenario {
  const p = s.partners[partnerIndex]
  const gap = {
    id: `whatif-gap-${partnerIndex}-${from}-${months}-${(p.incomeChanges ?? []).length}`,
    kind: 'noIncome' as const,
    from,
    until: addMonths(from, months - 1),
    monthlyCashChange: -estimatedLivingCosts(p, s.startMonth, from),
  }
  const partner = { ...p, incomeChanges: [...(p.incomeChanges ?? []), gap] }
  const partners: Scenario['partners'] = partnerIndex === 0 ? [partner, s.partners[1]] : [s.partners[0], partner]
  return { ...s, partners }
}

/** Lowest cash from `from` onwards, and the first month cash goes negative. */
function leanest(s: Scenario, policy: Policy, from: YearMonth) {
  const core = simulateCore(s, policy)
  const after = core.months.filter((m) => m.ym >= from)
  const months = after.length ? after : core.months
  let low = months[0]
  for (const m of months) if (m.combined.cash < low.combined.cash) low = m
  const neg = core.months.find((m) => m.combined.cash < -0.5)
  return { leanestCash: { ym: low.ym, amount: low.combined.cash }, firstShortYm: neg?.ym }
}

/**
 * "What if one of you loses their job?" for each partner: no pay, no CPF and
 * living costs paid from savings for `months`, starting at `from` (default: key
 * collection, usually the tightest time).
 */
export function jobLossImpact(raw: Scenario, months = 6, from: YearMonth = normalizeScenario(raw).flat.dates.keys, policy: Policy = resolvePolicy(raw.policyOverrides)): JobLossResult[] {
  const s = normalizeScenario(raw)
  const base = leanest(s, policy, from)
  return ([0, 1] as const).map((i) => {
    const trial = withJobLoss(s, i, from, months)
    const r = leanest(trial, policy, from)
    const gap = trial.partners[i].incomeChanges!.at(-1)!
    return {
      partnerIndex: i,
      name: s.partners[i].name,
      from,
      months,
      monthlyCosts: gap.kind === 'noIncome' ? -gap.monthlyCashChange : 0,
      leanestCash: r.leanestCash,
      firstShortYm: r.firstShortYm,
      leanestChange: r.leanestCash.amount - base.leanestCash.amount,
      planFirstShortYm: base.firstShortYm,
    }
  })
}
