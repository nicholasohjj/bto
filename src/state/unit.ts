import type { FlatType } from '../config/policy'
import { BROCHURE_LAYOUTS } from './studio'

/**
 * The unit last picked in Surroundings (/surroundings/). All three pages run on the same site, so they
 * share localStorage: Surroundings writes it, the money plan and Flat Studio links read it.
 */
export interface ChosenUnit {
  /** Project id, as in config/launches.ts (e.g. 'berlayar-rise'). */
  site: string
  block: string
  /** Unit number on the block plan, e.g. '129'. */
  unit: string
  storey: number
  /** Unit type from the brochure: '2R-1', '2R-2', '3R', '4R', … */
  type: string
  /** Which way the main windows face ('north', 'south-east', …). */
  facing: string
  /** When it was picked (ms since epoch). */
  at: number
}

export const CHOSEN_UNIT_KEY = 'bto.chosenUnit'

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length < 60 ? v : null)

export function parseChosenUnit(raw: string | null): ChosenUnit | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return null
    const site = str(o.site), block = str(o.block), unit = str(o.unit), type = str(o.type)
    const storey = typeof o.storey === 'number' && Number.isInteger(o.storey) && o.storey > 0 && o.storey < 100 ? o.storey : null
    if (!site || !block || !unit || !type || !storey) return null
    return { site, block, unit, storey, type, facing: str(o.facing) ?? '', at: typeof o.at === 'number' ? o.at : 0 }
  } catch {
    return null
  }
}

export function readChosenUnit(): ChosenUnit | null {
  try { return parseChosenUnit(localStorage.getItem(CHOSEN_UNIT_KEY)) } catch { return null }
}

export function saveChosenUnit(u: Omit<ChosenUnit, 'at'>) {
  try { localStorage.setItem(CHOSEN_UNIT_KEY, JSON.stringify({ ...u, at: Date.now() })) } catch { /* private mode */ }
}

/** "Block 200B #12-129" */
export const unitLabel = (u: Pick<ChosenUnit, 'block' | 'unit' | 'storey'>) => `Block ${u.block} #${String(u.storey).padStart(2, '0')}-${u.unit}`

/** The money plan's flat type for a brochure unit type ('2R-1' → '2R'). */
export const unitFlatType = (u: Pick<ChosenUnit, 'type'>) => u.type.split('-')[0] as FlatType

/** The Flat Studio layout redrawn from the brochure for this unit's type, if there is one. */
export function unitLayout(u: Pick<ChosenUnit, 'site' | 'type'>) {
  return BROCHURE_LAYOUTS[u.site]?.find((l) => l.key === `${u.site}/${u.type}`)
}

/** Surroundings, opened on this unit. */
export const surroundingsUnitUrl = (u: Pick<ChosenUnit, 'site' | 'block' | 'unit' | 'storey'>) =>
  `/surroundings/?${new URLSearchParams({ site: u.site, block: u.block, unit: u.unit, storey: String(u.storey) })}`

/** Flat Studio, opened on this unit's brochure layout (no budget cap: that comes from a money plan). */
export function studioUnitUrl(u: Pick<ChosenUnit, 'site' | 'type'>): string | null {
  const l = unitLayout(u)
  if (!l) return null
  return `/studio/?${new URLSearchParams({ flat: l.type === '4R' ? '4' : l.type === '5R' ? '5' : '3', layout: l.key })}`
}
