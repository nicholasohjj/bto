import { describe, expect, it } from 'vitest'
import { LAUNCHES, TYPICAL_WAIT_MONTHS, findProject } from '../../config/launches'
import { runScenario } from '../index'
import { applyProject, offeredTypes, pickedProject } from '../launch'
import { addMonths } from '../dates'
import { newPlan } from '../../state/defaults'
import type { Scenario } from '../types'

function pick(projectId: string, f: (s: Scenario) => void = () => {}): Scenario {
  const s = newPlan('launch')
  s.startMonth = '2026-05'
  f(s)
  const { launch, project } = findProject('2026-06', projectId)!
  applyProject(s, launch, project)
  return s
}

describe('BTO launch data', () => {
  it('every launch has a source, and every project prices only BTO flat types', () => {
    for (const l of LAUNCHES) {
      expect(l.source).toBeTruthy()
      expect(l.applicationMonth).toMatch(/^\d{4}-\d{2}$/)
      for (const p of l.projects) {
        expect(offeredTypes(p).length).toBeGreaterThan(0)
        expect(p.fromPrices.Exec).toBeUndefined()
        expect(p.subsidyRecoveryPct !== undefined).toBe(p.classification !== 'Standard')
      }
    }
  })
})

describe('picking a project', () => {
  it('fills classification, the 4-room starting price and dates from the stated wait', () => {
    const s = pick('kebun-baru-ridge', (d) => { d.flat.type = '4R' })
    expect(s.flat).toMatchObject({ saleType: 'BTO', classification: 'Plus', type: '4R', price: 543000, project: { launch: '2026-06', id: 'kebun-baru-ridge' } })
    expect(s.flat.dates).toEqual({ application: '2026-06', booking: '2026-11', afl: '2027-04', keys: '2029-07' })
    expect(s.exampleFields).not.toContain('flat.price')
    expect(pickedProject(s)?.project.name).toBe('Kebun Baru Ridge')
  })

  it('uses a typical wait when HDB gave none', () => {
    expect(pick('woodgrove-acres').flat.dates.keys).toBe(addMonths('2026-06', TYPICAL_WAIT_MONTHS))
  })

  it('switches to the nearest flat type on offer, and 2-room Flexi for singles', () => {
    expect(pick('lakeview-cascadia', (d) => { d.flat.type = '5R' }).flat).toMatchObject({ type: '4R', price: 534000 })
    expect(pick('berlayar-rise', (d) => { d.buyers = 'single'; d.flat.type = '4R' }).flat).toMatchObject({ type: '2R', price: 247000 })
  })

  it('the Plus/Prime note gives the project’s subsidy recovery rate', () => {
    const w = runScenario(pick('berlayar-rise')).warnings.find((x) => x.id === 'plus-prime')!
    expect(w.explanation).toMatch(/14% of the resale price/)
  })
})
