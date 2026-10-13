import type { CostItem } from '../engine/types'
import { newId } from './defaults'

/** Renovation paid in stages: one cost item per stage, months after key collection. */
const STAGES = [
  { label: 'Renovation: deposit', offsetMonths: 0 },
  { label: 'Renovation: progress payment', offsetMonths: 1 },
  { label: 'Renovation: final payment', offsetMonths: 2 },
]

const round = (n: number) => Math.round(n)

/**
 * Replace the renovation items with three stage payments that add up to the same total.
 * Equal thirds to start with; the contract's payment terms decide the real split.
 */
export function splitRenoIntoStages(costs: CostItem[]): CostItem[] {
  const reno = costs.filter((c) => c.kind === 'reno')
  const total = reno.reduce((t, c) => t + c.amount, 0)
  const base = reno[0]
  const parts = STAGES.map((_, i) => (i < STAGES.length - 1 ? round(total / STAGES.length) : total - round(total / STAGES.length) * (STAGES.length - 1)))
  const stages: CostItem[] = STAGES.map((s, i) => ({
    id: newId('cost'), label: s.label, kind: 'reno', amount: parts[i], auto: false,
    when: { milestone: 'keys', offsetMonths: s.offsetMonths },
    funding: base?.funding ?? 'cashOnly', payer: base?.payer ?? 'joint', delayable: true,
  }))
  const at = costs.findIndex((c) => c.kind === 'reno')
  const rest = costs.filter((c) => c.kind !== 'reno')
  rest.splice(at < 0 ? rest.length : at, 0, ...stages)
  return rest
}

/** Merge all renovation items back into one payment (the first item's timing), keeping the total. */
export function mergeRenoStages(costs: CostItem[]): CostItem[] {
  const reno = costs.filter((c) => c.kind === 'reno')
  if (reno.length < 2) return costs
  const total = reno.reduce((t, c) => t + c.amount, 0)
  const keep: CostItem = { ...reno[0], label: 'Renovation', amount: total }
  return costs.filter((c) => c.kind !== 'reno' || c === reno[0]).map((c) => (c === reno[0] ? keep : c))
}

/** Set a new total across these items, keeping each item's share (all to the first if they're all zero). */
export function spreadTotal(items: CostItem[], total: number): void {
  const old = items.reduce((t, c) => t + c.amount, 0)
  let left = total
  items.forEach((c, i) => {
    const last = i === items.length - 1
    c.amount = last ? left : old > 0 ? round((total * c.amount) / old) : i === 0 ? total : 0
    left -= c.amount
  })
}
