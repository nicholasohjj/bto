import type { SimResult } from './types'
import { money } from './format'

export interface CompareRow {
  label: string
  values: number[]
  format: (n: number) => string
  /** Which direction is better, for highlighting. */
  better: 'higher' | 'lower' | 'none'
}

export function compareRows(results: SimResult[]): CompareRow[] {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const count = (n: number) => String(n)
  const acc10 = (r: SimResult) => r.accrued.find((a) => a.yearsAfterKeys === 10)?.accrued ?? 0
  return [
    { label: 'Flat price', values: results.map((r) => r.loan.price), format: money, better: 'none' },
    { label: 'Loan amount', values: results.map((r) => r.loan.loanAmount), format: money, better: 'none' },
    { label: 'Monthly mortgage', values: results.map((r) => r.summary.monthlyMortgage), format: money, better: 'lower' },
    { label: 'Mortgage Servicing Ratio', values: results.map((r) => r.loan.msr), format: pct, better: 'lower' },
    { label: 'Total paid (to keys + 12 mo)', values: results.map((r) => r.summary.totalPaid), format: money, better: 'lower' },
    { label: 'Total cash used', values: results.map((r) => r.summary.totalCashUsed), format: money, better: 'lower' },
    { label: 'Total CPF used', values: results.map((r) => r.summary.totalCpfUsed), format: money, better: 'none' },
    { label: 'Leanest cash month', values: results.map((r) => r.summary.leanestCash.amount), format: money, better: 'higher' },
    { label: 'Cash at key collection', values: results.map((r) => r.summary.bufferAtKeys.cash), format: money, better: 'higher' },
    { label: 'CPF OA at key collection', values: results.map((r) => r.summary.bufferAtKeys.oa), format: money, better: 'higher' },
    { label: 'Cash at end', values: results.map((r) => r.summary.endBalances.cash), format: money, better: 'higher' },
    { label: 'Accrued interest after 10 yrs', values: results.map(acc10), format: money, better: 'lower' },
    { label: 'Problems (errors)', values: results.map((r) => r.warnings.filter((w) => w.severity === 'error').length), format: count, better: 'lower' },
  ]
}
