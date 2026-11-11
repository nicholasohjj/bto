/**
 * Live application rates while a sales exercise is open, from HDB's own JSON
 * (services-homes.hdb.gov.sg/sales/files/apprates/<MODE><YYYYMM>.json, the file behind its
 * application-rate page). HDB sends no CORS headers, so the browser can't read it directly:
 * the app fetches it through /api/rates/<MODE><YYYYMM> (a proxy function on Vercel;
 * `npm run dev` proxies the same path straight to HDB, see vite.config.ts).
 *
 * The counts update a few times a day while applications are open (8am, 12pm and 5pm in the
 * November 2026 exercise) and once more, finally, the day after they close. They're shown as
 * they come and marked unverified; once final, the figures are checked by hand and baked into
 * launches.ts as the launch's `applicationRates`, which then takes over.
 */

import type { ApplicationRateRow, ApplicationRates, Launch, RateGroup } from '../config/launches'
import type { FlatType } from '../config/policy'
import { addMonths } from './dates'
import type { YearMonth } from './types'

/** One flat-type row of HDB's file (one estate can pool several projects in a row). */
export interface HdbRateRow {
  flat_type: string
  projects: { project_name: string }[]
  flat_supply: number
  total_applicant_no: number
  app_rates: Partial<Record<'elderly' | 'first_time_fam' | 'second_time_fam' | 'first_time_singles', number>>
}

/** The shape of HDB's apprates JSON (only the parts used here). */
export interface HdbAppRates {
  display_datetime: string
  is_final_update: boolean
  estate_list: { estate_name: string; flat_type_list: HdbRateRow[] }[]
}

export interface LiveRates {
  rates: ApplicationRates
  /** HDB's last update after applications closed; earlier counts still move. */
  final: boolean
}

/** The proxy path for a launch's rates ("/api/rates/BTO202611"). */
export function liveRatesPath(launch: Launch): string {
  return `/api/rates/BTO${launch.applicationMonth.replace('-', '')}`
}

/**
 * Whether live rates are worth fetching: none baked into launches.ts yet, and the launch
 * opened this month or up to two months ago (HDB's file appears when applications open).
 */
export function wantsLiveRates(launch: Launch, thisMonth: YearMonth): boolean {
  if (launch.applicationRates) return false
  return launch.applicationMonth <= thisMonth && thisMonth <= addMonths(launch.applicationMonth, 2)
}

const GROUP_KEY = {
  elderly: 'seniors', first_time_fam: 'ftFamilies', first_time_singles: 'ftSingles', second_time_fam: 'stFamilies',
} as const

/** HDB's flat-type labels, which pool types with "/" ("5-Room/3Gen", "2-Room Flexi"). */
const TYPE_TOKEN: [string, FlatType][] = [
  ['2-Room', '2R'], ['3-Room', '3R'], ['4-Room', '4R'], ['5-Room', '5R'], ['3Gen', '3Gen'], ['Executive', 'Exec'],
]
function flatTypes(label: string): FlatType[] {
  return TYPE_TOKEN.filter(([t]) => label.includes(t)).map(([, v]) => v)
}

/** The app's project id for an HDB project name (unknown names get a slug, so the row still shows). */
function idFor(launch: Launch, name: string): string {
  return launch.projects.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id
    ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Median rounded to one decimal place, like HDB's rates. */
function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  return Math.round(mid * 10) / 10
}

/** Medians per group, for 2-room Flexi rows and for 3-room-and-bigger rows (as the baked-in rates keep them). */
function medians(rows: ApplicationRateRow[]): ApplicationRates['median'] {
  const of = (pick: (r: ApplicationRateRow) => boolean) => {
    const out: Partial<Record<RateGroup, number>> = {}
    for (const g of Object.values(GROUP_KEY)) {
      const m = median(rows.filter(pick).map((r) => r.rates[g]).filter((x): x is number => x !== undefined))
      if (m !== undefined) out[g] = m
    }
    return out
  }
  return { flexi: of((r) => r.types.includes('2R')), bigger: of((r) => !r.types.includes('2R')) }
}

/** HDB's JSON mapped to the app's ApplicationRates, or null when it has no usable rows. */
export function fromHdb(data: HdbAppRates, launch: Launch): LiveRates | null {
  const rows: ApplicationRateRow[] = []
  for (const estate of data.estate_list ?? []) {
    for (const r of estate.flat_type_list ?? []) {
      const types = flatTypes(r.flat_type ?? '')
      if (!types.length || typeof r.flat_supply !== 'number' || typeof r.total_applicant_no !== 'number') continue
      const rates: Partial<Record<RateGroup, number>> = {}
      for (const [k, g] of Object.entries(GROUP_KEY)) {
        const v = r.app_rates?.[k as keyof typeof GROUP_KEY]
        if (typeof v === 'number') rates[g] = v
      }
      rows.push({
        projects: (r.projects ?? []).map((p) => idFor(launch, p.project_name)),
        types, units: r.flat_supply, applicants: r.total_applicant_no, rates,
      })
    }
  }
  if (!rows.length) return null
  const asAt = (data.display_datetime ?? '').slice(0, 10)
  const final = !!data.is_final_update
  return {
    final,
    rates: {
      asAt, rows, median: medians(rows),
      source: `HDB Flat Supply & Applications Received, ${launch.name}, as at ${asAt}${final ? ' (HDB’s final update)' : ' (applications still open, so the counts keep changing)'} — live from HDB, not checked by hand`,
      verified: '',
    },
  }
}
