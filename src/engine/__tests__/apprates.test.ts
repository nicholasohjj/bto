import { describe, expect, it } from 'vitest'
import { LAUNCHES } from '../../config/launches'
import { fromHdb, type HdbAppRates } from '../liveRates'

/**
 * src/config/apprates/ archives HDB's final apprates JSON for each closed exercise
 * (services-homes.hdb.gov.sg deletes them after about a year). Each archived file must match
 * the hand-typed table in launches.ts, so a typo in either is caught.
 */
const files = import.meta.glob<{ default: unknown }>('../../config/apprates/*.json', { eager: true })

describe('archived apprates files match the hand-typed tables', () => {
  const entries = Object.entries(files)
  it('has an archive for every launch with rates', () => {
    const archived = entries.map(([path]) => path.match(/(BTO|SBF)(\d{4})(\d{2})\.json$/)!).map((m) => `${m[2]}-${m[3]}`)
    for (const l of LAUNCHES) if (l.applicationRates) expect(archived).toContain(l.applicationMonth)
  })
  it.each(entries.map(([path, mod]) => [path.split('/').pop()!, mod.default as HdbAppRates] as const))('%s', (name, data) => {
    const ym = name.match(/(\d{4})(\d{2})\.json$/)!
    const launch = LAUNCHES.find((l) => l.applicationMonth === `${ym[1]}-${ym[2]}`)!
    expect(data.is_final_update).toBe(true)
    if (!launch.applicationRates) return // not typed in yet: only check it is a final file
    const live = fromHdb(data, launch)!
    const key = (r: { projects: string[]; types: string[] }) => [...r.projects].sort().join('+') + ':' + [...r.types].sort().join('+')
    const sort = (rows: typeof live.rates.rows) => [...rows].sort((a, b) => key(a).localeCompare(key(b)))
    expect(live.rates.asAt).toBe(launch.applicationRates.asAt)
    expect(sort(live.rates.rows)).toEqual(sort(launch.applicationRates.rows))
    expect(live.rates.median).toEqual(launch.applicationRates.median)
  })
})
