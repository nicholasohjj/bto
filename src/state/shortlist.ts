/**
 * Units ranked for selection day, made in Surroundings. Like the chosen unit, it's in localStorage
 * shared by all three pages: Surroundings edits it, the money plan's print summary lists it.
 */
import { parseChosenUnit, type ChosenUnit } from './unit'

export type ShortlistUnit = Omit<ChosenUnit, 'at'>

export const SHORTLIST_KEY = 'bto.shortlist'
/** Enough backups for a late queue number, short enough to print on one page. */
export const SHORTLIST_MAX = 15

export const sameUnit = (a: ShortlistUnit, b: ShortlistUnit) => a.site === b.site && a.block === b.block && a.unit === b.unit && a.storey === b.storey

export function parseShortlist(raw: string | null): ShortlistUnit[] {
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    const out: ShortlistUnit[] = []
    for (const o of list) {
      const u = parseChosenUnit(JSON.stringify(o))
      if (!u || out.some((x) => sameUnit(x, u))) continue
      const { at: _at, ...rest } = u
      out.push(rest)
    }
    return out.slice(0, SHORTLIST_MAX)
  } catch {
    return []
  }
}

export function readShortlist(): ShortlistUnit[] {
  try { return parseShortlist(localStorage.getItem(SHORTLIST_KEY)) } catch { return [] }
}

export function saveShortlist(list: ShortlistUnit[]) {
  try { localStorage.setItem(SHORTLIST_KEY, JSON.stringify(list.slice(0, SHORTLIST_MAX))) } catch { /* private mode */ }
}

/** Adds at the end (the lowest rank), unless it's there already or the list is full. */
export function addToShortlist(list: ShortlistUnit[], u: ShortlistUnit): { list: ShortlistUnit[]; added: boolean } {
  if (list.length >= SHORTLIST_MAX || list.some((x) => sameUnit(x, u))) return { list, added: false }
  return { list: [...list, u], added: true }
}

/** Moves one unit up (-1) or down (+1) the ranking. */
export function moveInShortlist(list: ShortlistUnit[], i: number, by: -1 | 1): ShortlistUnit[] {
  const j = i + by
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
