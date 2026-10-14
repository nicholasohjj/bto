import type { FlatType } from '../config/policy'
import type { Scenario } from '../engine/types'

/** What Flat Studio (/studio/) saves about its budget. It runs on the same site, so it shares localStorage. */
export interface StudioSummary {
  name: string
  /** Priced furniture and appliances. */
  furniture: number
  /** Floors, wall finishes, doors, windows and the "other costs" lines. */
  reno: number
  /** The budget cap set in the studio (0 = none). */
  cap: number
  /** When it was saved (ms since epoch). */
  at: number
}

const KEY = 'flatstudio.summary'
const DESIGN_KEY = 'flatstudio.v1'
const VERSIONS_KEY = 'flatstudio.versions'

const isDesign = (o: unknown): o is { name?: string; walls: unknown[] } =>
  !!o && typeof o === 'object' && Array.isArray((o as { walls?: unknown }).walls)

/** The Flat Studio design saved in this browser (for the JSON export), or undefined if there's none. */
export function readStudioDesign(): unknown {
  try {
    const o = JSON.parse(localStorage.getItem(DESIGN_KEY) ?? 'null')
    return isDesign(o) && o.walls.length ? o : undefined
  } catch { return undefined }
}

/**
 * Put an exported design back into Flat Studio. A different design already there is kept as a
 * Flat Studio version first. Returns false if the file has no design or it couldn't be saved.
 */
export function restoreStudioDesign(design: unknown): boolean {
  if (!isDesign(design)) return false
  try {
    const current = localStorage.getItem(DESIGN_KEY)
    const next = JSON.stringify(design)
    if (current === next) return true
    if (current && isDesign(JSON.parse(current))) {
      const versions = JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? '[]')
      const list = Array.isArray(versions) ? versions : []
      list.unshift({ id: 'v' + Date.now().toString(36), name: 'Before import', t: Date.now(), json: current })
      localStorage.setItem(VERSIONS_KEY, JSON.stringify(list.slice(0, 30)))
    }
    localStorage.setItem(DESIGN_KEY, next)
    // The budget summary is rewritten when Flat Studio next opens; until then it would describe the old design.
    localStorage.removeItem(KEY)
    return true
  } catch { return false }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

/** The studio's latest budget, or null if it hasn't been opened in this browser. */
export function parseStudioSummary(raw: string | null): StudioSummary | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return null
    return { name: typeof o.name === 'string' ? o.name : 'Flat Studio design', furniture: num(o.furniture), reno: num(o.reno), cap: num(o.cap), at: num(o.at) }
  } catch {
    return null
  }
}

export function readStudioSummary(): StudioSummary | null {
  try { return parseStudioSummary(localStorage.getItem(KEY)) } catch { return null }
}

/** Unit layouts redrawn from brochures, as listed in src/studio/layouts.json, by project id. */
export const BROCHURE_LAYOUTS: Record<string, { key: string; label: string; type: FlatType }[]> = {
  'berlayar-rise': [
    { key: 'berlayar-rise/2R-1', label: '2-room Flexi (Type 1)', type: '2R' },
    { key: 'berlayar-rise/2R-2', label: '2-room Flexi (Type 2)', type: '2R' },
    { key: 'berlayar-rise/3R', label: '3-room', type: '3R' },
    { key: 'berlayar-rise/4R', label: '4-room', type: '4R' },
  ],
  'lakeview-cascadia': [
    { key: 'lakeview-cascadia/2R-1', label: '2-room Flexi (Type 1)', type: '2R' },
    { key: 'lakeview-cascadia/2R-2', label: '2-room Flexi (Type 2)', type: '2R' },
    { key: 'lakeview-cascadia/4R', label: '4-room', type: '4R' },
  ],
  'kebun-baru-ridge': [
    { key: 'kebun-baru-ridge/3R', label: '3-room', type: '3R' },
    { key: 'kebun-baru-ridge/4R', label: '4-room', type: '4R' },
  ],
  'kebun-baru-breeze': [
    { key: 'kebun-baru-breeze/2R-1', label: '2-room Flexi (Type 1)', type: '2R' },
    { key: 'kebun-baru-breeze/2R-2', label: '2-room Flexi (Type 2)', type: '2R' },
    { key: 'kebun-baru-breeze/4R', label: '4-room', type: '4R' },
  ],
}

/** Projects with a Surroundings page (view, sun, roads and amenities per unit). */
export const SURROUNDINGS = new Set(['berlayar-rise', 'kebun-baru-breeze', 'kebun-baru-ridge', 'lakeview-cascadia'])
export const surroundingsUrl = (projectId: string) => `/surroundings/?site=${encodeURIComponent(projectId)}`

/** Brochure layouts for this plan's project, if it was picked from a launch that has them. */
export function brochureLayouts(s: Scenario) {
  return (s.flat.project?.id && BROCHURE_LAYOUTS[s.flat.project.id]) || []
}

/**
 * Link into Flat Studio with this plan's renovation + furniture budget as the cap, and a starting layout:
 * a brochure unit when given (or the plan's project has one for its flat type), else a generic one for the flat type.
 */
export function studioUrl(s: Scenario, layout?: string): string {
  const cap = s.costs.filter((c) => c.kind === 'reno' || c.kind === 'furniture').reduce((t, c) => t + c.amount, 0)
  const flat = s.flat.type === '3R' || s.flat.type === '2R' ? '3' : s.flat.type === '4R' ? '4' : '5'
  const q = new URLSearchParams({ flat })
  if (cap > 0) q.set('cap', String(Math.round(cap)))
  const unit = layout ?? brochureLayouts(s).find((l) => l.type === s.flat.type)?.key
  if (unit) q.set('layout', unit)
  return `/studio/?${q}`
}
