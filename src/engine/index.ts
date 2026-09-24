import type { Policy } from '../config/policy'
import { ACCRUED_HORIZONS, projectAccruedInterest } from './accruedInterest'
import { ymToIndex } from './dates'
import { resolvePolicy } from './policyOverrides'
import { simulateCore, type CoreResult } from './simulate'
import type { Scenario, SimResult, Summary } from './types'
import { buildWarnings } from './warnings'

export * from './types'
export { simulateCore } from './simulate'
export { resolvePolicy, flattenPolicy } from './policyOverrides'

/** Full run: simulation + warnings + summary + accrued-interest projection. */
export function runScenario(scenario: Scenario, policy: Policy = resolvePolicy(scenario.policyOverrides)): SimResult {
  const core = simulateCore(scenario, policy)
  const loan = core.schedule.loan
  const keys = scenario.flat.dates.keys
  // Accrued interest: keep simulating (salaries, CPF, mortgage, CPF limits) to 15 years after keys.
  const longRun = simulateCore(scenario, policy, { monthsAfterKeys: Math.max(...ACCRUED_HORIZONS) * 12 + 1 })
  return {
    months: core.months,
    events: core.events,
    loan,
    warnings: buildWarnings(core, { cpfCapReachedYm: longRun.cpfCapReachedYm }),
    summary: summarize(core),
    accrued: projectAccruedInterest({
      withdrawals: longRun.housingWithdrawals,
      keys,
      simEnd: longRun.endMonth,
      monthlyMortgageCpf: { A: 0, B: 0 },
      loanEnd: longRun.endMonth,
      rate: policy.cpf.accruedInterestRate,
    }),
    milestones: scenario.flat.dates,
    eligibility: core.schedule.eligibility,
    cpfCapReachedYm: longRun.cpfCapReachedYm,
  }
}

export function summarize(core: CoreResult): Summary {
  // Grants and voluntary top-ups are transfers into CPF, not payments.
  const transfer = (k: string) => k === 'grant' || k === 'voluntaryCpf'
  const paid = core.events.filter((e) => !transfer(e.kind) && e.amount > 0)
  // Cash/CPF used: payments plus CPF reimbursements (cash back in, CPF out); not cash inflows.
  const flows = core.events.filter((e) => !transfer(e.kind) && !(e.amount < 0 && e.fromCpf === 0))
  const keysIdx = ymToIndex(core.scenario.flat.dates.keys)
  let leanest = core.months[0]
  for (const m of core.months) if (m.combined.cash < leanest.combined.cash) leanest = m
  const atKeys = core.months.find((m) => m.index === keysIdx) ?? core.months[core.months.length - 1]
  const last = core.months[core.months.length - 1]
  return {
    totalPaid: paid.reduce((s, e) => s + e.amount, 0),
    totalCashUsed: flows.reduce((s, e) => s + e.fromCash, 0),
    totalCpfUsed: flows.reduce((s, e) => s + e.fromCpf, 0),
    monthlyMortgage: core.schedule.loan.monthlyInstalment,
    leanestCash: { ym: leanest.ym, amount: leanest.combined.cash },
    bufferAtKeys: { ...atKeys.combined },
    endBalances: { ...last.combined },
  }
}
