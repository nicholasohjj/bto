import { describe, expect, it } from 'vitest'
import { LAUNCHES, type ApplicationRateRow, type Launch, type RateGroup } from '../../config/launches'
import type { FlatType } from '../../config/policy'
import { fromHdb, liveRatesPath, wantsLiveRates, type HdbAppRates, type HdbRateRow } from '../liveRates'

const june = LAUNCHES.find((l) => l.id === '2026-06')!
const november = LAUNCHES.find((l) => l.id === '2026-11')!

// The app's rows turned back into the shape HDB's apprates JSON uses.
const HDB_TYPE: Record<FlatType, string> = { '2R': '2-Room Flexi', '3R': '3-Room', '4R': '4-Room', '5R': '5-Room', '3Gen': '3Gen', Exec: 'Executive' }
const HDB_GROUP: Record<RateGroup, keyof HdbRateRow['app_rates']> = {
  seniors: 'elderly', ftFamilies: 'first_time_fam', ftSingles: 'first_time_singles', stFamilies: 'second_time_fam',
}
function toHdbRow(launch: Launch, r: ApplicationRateRow): HdbRateRow {
  const app_rates: HdbRateRow['app_rates'] = {}
  for (const [g, v] of Object.entries(r.rates)) app_rates[HDB_GROUP[g as RateGroup]] = v
  return {
    flat_type: r.types.map((t) => HDB_TYPE[t]).join('/'),
    projects: r.projects.map((id) => ({ project_name: launch.projects.find((p) => p.id === id)!.name })),
    flat_supply: r.units, total_applicant_no: r.applicants, app_rates,
  }
}
function toHdb(launch: Launch, rows: ApplicationRateRow[], extra: Partial<HdbAppRates> = {}): HdbAppRates {
  return {
    display_datetime: '2026-06-24T00:00:00.000Z', is_final_update: true,
    estate_list: rows.map((r, i) => ({ estate_name: `Estate ${i}`, flat_type_list: [toHdbRow(launch, r)] })),
    ...extra,
  }
}

describe('live application rates from HDB’s JSON', () => {
  it('round-trips the June 2026 table: rows, medians, as-at date and final flag', () => {
    const baked = june.applicationRates!
    const live = fromHdb(toHdb(june, baked.rows), june)!
    expect(live.final).toBe(true)
    expect(live.rates.rows).toEqual(baked.rows)
    // The medians HDB published fall out of the rows, so a live launch gets real bands.
    expect(live.rates.median).toEqual(baked.median)
    expect(live.rates.asAt).toBe('2026-06-24')
    expect(live.rates.source).toContain('final')
    expect(live.rates.verified).toBe('')
  })
  it('marks counts that are still moving', () => {
    const live = fromHdb(toHdb(june, june.applicationRates!.rows, { is_final_update: false }), june)!
    expect(live.final).toBe(false)
    expect(live.rates.source).toContain('still open')
  })
  it('maps pooled flat types and unknown project names (slugged, so the row still shows)', () => {
    const data: HdbAppRates = {
      display_datetime: '2026-11-11T00:00:00.000Z', is_final_update: false,
      estate_list: [{
        estate_name: 'Bedok',
        flat_type_list: [{
          flat_type: '5-Room/Executive/3Gen',
          projects: [{ project_name: 'Bayshore Sails' }, { project_name: 'Some New Project' }],
          flat_supply: 100, total_applicant_no: 250,
          app_rates: { first_time_fam: 1.9, second_time_fam: 12.5 },
        }],
      }],
    }
    const live = fromHdb(data, november)!
    expect(live.rates.rows).toEqual([{
      projects: ['bayshore-sails', 'some-new-project'], types: ['5R', '3Gen', 'Exec'],
      units: 100, applicants: 250, rates: { ftFamilies: 1.9, stFamilies: 12.5 },
    }])
    expect(live.rates.median).toEqual({ flexi: {}, bigger: { ftFamilies: 1.9, stFamilies: 12.5 } })
  })
  it('returns null for a file with no usable rows', () => {
    expect(fromHdb({ display_datetime: '', is_final_update: false, estate_list: [] }, november)).toBeNull()
  })
  it('is fetched only while the launch could have live counts and none are baked in', () => {
    expect(wantsLiveRates(november, '2026-10')).toBe(false)
    expect(wantsLiveRates(november, '2026-11')).toBe(true)
    expect(wantsLiveRates(november, '2027-01')).toBe(true)
    expect(wantsLiveRates(november, '2027-02')).toBe(false)
    expect(wantsLiveRates(june, '2026-06')).toBe(false) // June's rates are baked in
    expect(liveRatesPath(november)).toBe('/api/rates/BTO202611')
  })
})
