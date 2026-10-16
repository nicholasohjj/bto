import { describe, expect, it } from 'vitest'
import { LAUNCHES } from '../../config/launches'
import { seedScenario } from '../../state/defaults'
import { oddsFor, oddsText, planOdds, rateGroups, townHistory } from '../ballot'
import type { Scenario } from '../types'

const june = LAUNCHES.find((l) => l.id === '2026-06')!
const plan = (f: (s: Scenario) => void) => { const s = seedScenario(); f(s); return s }

describe('ballot odds', () => {
  it('matches HDB’s June 2026 table', () => {
    const ar = june.applicationRates!
    // Each rate is applicants over flats set aside, so the totals must add up to the published units.
    expect(ar.rows.reduce((t, r) => t + r.units, 0)).toBe(6952)
    expect(oddsFor(june, 'berlayar-rise', '4R', 'ftFamilies')!.rate).toBe(3.3)
    expect(oddsFor(june, 'sembawang-brook', '3Gen', 'stFamilies')!.rate).toBe(3.4)
    expect(oddsFor(june, 'kebun-baru-ridge', '4R', 'ftFamilies')!.pooledWith).toEqual(['kebun-baru-breeze'])
    expect(oddsFor(june, 'lakeview-cascadia', '3R', 'ftFamilies')).toBeNull()
  })

  it('puts the plan in the right group', () => {
    expect(rateGroups(plan(() => {}), '4R').groups).toEqual(['ftFamilies'])
    expect(rateGroups(plan((s) => { s.buyers = 'single' }), '2R').groups).toEqual(['ftSingles'])
    expect(rateGroups(plan((s) => { s.flat.household = 'secondTimers' }), '4R').groups).toEqual(['stFamilies'])
    expect(rateGroups(plan((s) => { s.flat.household = 'firstAndSecond' }), '4R')).toEqual({ groups: ['ftFamilies', 'stFamilies'], unsure: true })
    const seniors = plan((s) => { s.partners[0].birthYearMonth = '1960-01'; s.partners[1].birthYearMonth = '1962-01' })
    expect(rateGroups(seniors, '2R').groups).toEqual(['seniors'])
    expect(rateGroups(seniors, '4R').groups).toEqual(['ftFamilies'])
  })

  it('reads the picked project', () => {
    const s = plan((d) => { d.flat.project = { launch: '2026-06', id: 'woodgrove-acres' }; d.flat.type = '4R' })
    const r = planOdds(s)
    expect(r.odds.map((o) => [o.rate, o.band])).toEqual([[4.1, 'hard']])
  })

  it('explains the rate', () => {
    expect(oddsText(oddsFor(june, 'sembawang-portico', '4R', 'ftFamilies')!)).toMatch(/likely everyone/)
    // 3.3 per flat: up to 2 × supply shortlisted, so about 6 in 10 get a queue number and 3 in 10 a flat.
    expect(oddsText(oddsFor(june, 'berlayar-rise', '4R', 'ftFamilies')!)).toMatch(/about 6 in 10 got a queue number, and about 3 in 10/)
  })

  it('looks back at the same town for a launch without rates', () => {
    const h = townHistory('Sembawang', '4R', 'ftFamilies', '2026-11')!
    expect(h.odds.rate).toBe(0.6)
    expect(h.projects).toEqual(['Sembawang Portico', 'Sembawang Brook'])
    expect(townHistory('Tengah', '4R', 'ftFamilies', '2026-11')).toBeNull()
  })
})
