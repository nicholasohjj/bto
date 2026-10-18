/**
 * Selection day: which units of a flat type are likely booked before a queue number comes up.
 * Nobody knows what others will pick, so this ranks units the way buyers tend to choose (higher
 * floors first, west-facing ones later for the afternoon sun) and books them in that order.
 */
import { compass, unitStoreys, type Site } from './analysis'

export type QueueBand = 'gone' | 'maybe' | 'left'

export interface QueueUnit { block: string; unit: string; storey: number; facing: string; score: number }

/** Storeys a west-ish facing unit is pushed down the order, as if it were that much lower. */
const FACING_PENALTY: Record<string, number> = { west: 6, 'south-west': 3, 'north-west': 3 }

/** The money plan's flat type of a brochure unit type ('2R-1' → '2R'). */
export const flatTypeOf = (t: string) => t.split('-')[0]

/** Every unit of a flat type in the estate, one per stack and storey, with how keenly it's likely picked. */
export function siteUnits(site: Site, type: string): QueueUnit[] {
  const out: QueueUnit[] = []
  for (const b of site.blocks) for (const u of b.units) {
    if (flatTypeOf(u.type) !== type) continue
    const facing = compass(u.n), [lo, hi] = unitStoreys(b, u)
    for (let s = lo; s <= hi; s++) out.push({ block: b.id, unit: u.no, storey: s, facing, score: s - (FACING_PENALTY[facing] ?? 0) })
  }
  return out
}

export const unitKey = (u: { block: string; unit: string; storey: number }) => `${u.block}|${u.unit}|${u.storey}`

export interface QueueResult {
  total: number
  /** Units booked by the people ahead, at the assumed share who book. */
  taken: number
  band: Map<string, QueueBand>
}

/**
 * Bands for each unit: with `taken` units booked ahead of you in the usual order, the first 80% of them are
 * likely gone, up to 125% might be, and the rest are likely left. Units that tie share their place in the order.
 */
export function queueBands(units: QueueUnit[], queueNo: number, bookShare: number): QueueResult {
  const total = units.length
  const taken = Math.min(total, Math.max(0, Math.round((queueNo - 1) * bookShare)))
  // Place in the order of each score: units ranked above it, plus half of those it ties with.
  const count = new Map<number, number>()
  for (const u of units) count.set(u.score, (count.get(u.score) ?? 0) + 1)
  const placeOf = new Map<number, number>()
  let above = 0
  for (const s of [...count.keys()].sort((a, b) => b - a)) { placeOf.set(s, above + count.get(s)! / 2); above += count.get(s)! }
  const band = new Map<string, QueueBand>()
  for (const u of units) {
    const place = placeOf.get(u.score)!
    band.set(unitKey(u), taken === 0 ? 'left' : place < taken * 0.8 ? 'gone' : place < taken * 1.25 ? 'maybe' : 'left')
  }
  return { total, taken, band }
}

/** Share of the people ahead of you who book a flat, as the queue assumption. */
export const BOOK_SHARES: { value: number; label: string }[] = [
  { value: 1, label: 'all book' },
  { value: 0.75, label: '3 in 4 book' },
  { value: 0.5, label: 'half book' },
]
