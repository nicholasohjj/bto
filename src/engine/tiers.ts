import type { Tier } from '../config/policy'

/** Sum of amount across progressive tiers. */
export function tieredAmount(value: number, tiers: Tier[]): number {
  let remaining = Math.max(0, value)
  let total = 0
  for (const tier of tiers) {
    if (remaining <= 0) break
    const slice = Math.min(remaining, tier.width)
    total += slice * tier.rate
    remaining -= slice
  }
  return total
}
