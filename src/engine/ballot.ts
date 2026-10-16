import { LAUNCHES, type ApplicationRateRow, type Launch, type RateGroup } from '../config/launches'
import type { FlatType } from '../config/policy'
import { monthsBetween } from './dates'
import type { Scenario } from './types'

/**
 * Ballot odds from HDB's published application rates: applicants per flat set aside for
 * each group (seniors, first-timer families, first-timer singles, second-timer families).
 */

export const GROUP_LABEL: Record<RateGroup, string> = {
  seniors: 'seniors', ftFamilies: 'first-timer families', ftSingles: 'first-timer singles', stFamilies: 'second-timer families',
}

/**
 * The plan's group for this flat type. `unsure`: HDB's page doesn't say which group a
 * first-timer + second-timer couple is counted in, so both family groups are shown.
 */
export function rateGroups(s: Scenario, type: FlatType, applicationMonth = s.flat.dates.application): { groups: RateGroup[]; unsure?: boolean } {
  const buyers = s.buyers ?? 'couple'
  const people = buyers === 'single' ? [s.partners[0]] : s.partners
  // 2-room Flexi: at least 40% go to seniors (55 and over).
  if (type === '2R' && people.every((p) => monthsBetween(p.birthYearMonth, applicationMonth) >= 55 * 12)) return { groups: ['seniors'] }
  const household = s.flat.household ?? 'firstTimers'
  if (buyers !== 'couple') return { groups: household === 'firstTimers' ? ['ftSingles'] : [] }
  if (household === 'firstTimers') return { groups: ['ftFamilies'] }
  if (household === 'secondTimers') return { groups: ['stFamilies'] }
  return { groups: ['ftFamilies', 'stFamilies'], unsure: true }
}

export interface Odds {
  launch: Launch
  row: ApplicationRateRow
  group: RateGroup
  rate: number
  median: number
  /** Other projects HDB counted together with this one. */
  pooledWith: string[]
  /** Fewer applicants than flats; at or below the launch's median; above it. */
  band: 'good' | 'fair' | 'hard'
}

/** The rate for one project, flat type and group in a launch that has closed. */
export function oddsFor(launch: Launch, projectId: string, type: FlatType, group: RateGroup): Odds | null {
  const ar = launch.applicationRates
  const row = ar?.rows.find((r) => r.projects.includes(projectId) && r.types.includes(type))
  const rate = row?.rates[group]
  const median = ar?.median[type === '2R' ? 'flexi' : 'bigger'][group]
  if (!ar || !row || rate === undefined || median === undefined) return null
  const band = rate <= 1 ? 'good' : rate <= median ? 'fair' : 'hard'
  return { launch, row, group, rate, median, pooledWith: row.projects.filter((p) => p !== projectId), band }
}

/** The picked project's rates for the plan's flat type and group (empty if none are published). */
export function planOdds(s: Scenario): { odds: Odds[]; unsure?: boolean; noGroup?: boolean } {
  const launch = LAUNCHES.find((l) => l.id === s.flat.project?.launch)
  const id = s.flat.project?.id
  if (!launch?.applicationRates || !id) return { odds: [] }
  const g = rateGroups(s, s.flat.type)
  const odds = g.groups.map((gr) => oddsFor(launch, id, s.flat.type, gr)).filter((o): o is Odds => !!o)
  return { odds, unsure: g.unsure, noGroup: g.groups.length === 0 }
}

/**
 * For a launch without rates yet: the latest published rates in the same town for this flat type,
 * as a hint of demand there (a new project can draw very differently).
 */
export function townHistory(town: string, type: FlatType, group: RateGroup, before: string): { odds: Odds; projects: string[] } | null {
  for (const l of LAUNCHES) {
    if (!l.applicationRates || l.applicationMonth >= before) continue
    const projects = l.projects.filter((p) => p.town === town)
    for (const p of projects) {
      const o = oddsFor(l, p.id, type, group)
      if (o) return { odds: o, projects: [p.name, ...o.pooledWith.map((id) => l.projects.find((x) => x.id === id)?.name ?? id)] }
    }
  }
  return null
}

/** Share of applicants, out of 10, rounded (at least 1). */
const outOf10 = (x: number) => Math.max(1, Math.min(10, Math.round(x * 10)))

/**
 * What a rate means, from HDB's notes: it shortlists up to twice as many applicants as flats
 * (taking quotas into account), and each gets a queue number; later numbers book only if earlier ones drop out.
 */
export function oddsText(o: Odds): string {
  const per = `${o.rate.toFixed(1)} applicants per flat set aside for ${GROUP_LABEL[o.group]} (median ${o.median.toFixed(1)})`
  if (o.rate <= 1) return `${per}. Fewer applicants than flats, so likely everyone in this group got a queue number.`
  if (o.rate <= 2) return `${per}. With up to twice as many applicants as flats shortlisted, most may have got a queue number, but about ${outOf10(1 / o.rate)} in 10 had a flat for them unless others dropped out.`
  return `${per}. At most about ${outOf10(2 / o.rate)} in 10 got a queue number, and about ${outOf10(1 / o.rate)} in 10 had a flat for them unless others dropped out.`
}
