import { describe, expect, it } from 'vitest'
import { LAUNCHES, TYPICAL_WAIT_MONTHS, findProject } from '../../config/launches'
import { runScenario } from '../index'
import { applyProject, launchFit, offeredTypes, pickedProject, setLaunchDates } from '../launch'
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

describe('which projects fit', () => {
  const june = LAUNCHES.find((l) => l.id === '2026-06')!
  const plan = (f: (s: Scenario) => void = () => {}) => {
    const s = newPlan('fit')
    s.startMonth = '2026-05'
    s.exampleFields = []
    s.partners.forEach((p) => { p.birthYearMonth = '1997-01'; p.grossMonthly = 5000; p.cash = 40000; p.cpfOA = 40000; p.monthlyCashSavings = 1000 })
    f(s)
    return s
  }

  it('checks every flat type of every project', () => {
    const fits = launchFit(plan(), june)
    expect(fits).toHaveLength(june.projects.reduce((n, p) => n + offeredTypes(p).length, 0))
    const ridge = fits.filter((f) => f.project.id === 'kebun-baru-ridge')
    expect(ridge.map((f) => f.type)).toEqual(['2R', '3R', '4R'])
    expect(ridge[0].keys).toBe('2029-07')
    // Same flat type and dates: whether it works depends only on the price.
    for (const f of fits) {
      for (const g of fits) {
        if (f.type === g.type && f.keys === g.keys && f.project.classification === g.project.classification && f.ok && g.fromPrice <= f.fromPrice) expect(g.ok).toBe(true)
      }
    }
  })

  it('agrees with running the plan at that price', () => {
    for (const f of launchFit(plan(), june).filter((x) => x.project.id === 'woodgrove-acres')) {
      const s = plan()
      applyProject(s, june, f.project, { type: f.type })
      const failing = runScenario(s).warnings.some((w) => w.id.startsWith('cash-') || w.id === 'msr')
      expect(failing).toBe(!f.ok)
    }
  })

  it('a poor plan fails on cash and says when', () => {
    const fits = launchFit(plan((s) => s.partners.forEach((p) => { p.cash = 0; p.cpfOA = 0; p.monthlyCashSavings = 0 })), june)
    const prime = fits.find((f) => f.project.id === 'berlayar-rise' && f.type === '4R')!
    expect(prime.ok).toBe(false)
    expect(prime.limit).toBeDefined()
  })

  it('singles only see 2-room Flexi', () => {
    expect(new Set(launchFit(plan((s) => { s.buyers = 'single' }), june).map((f) => f.type))).toEqual(new Set(['2R']))
  })

  it('can move a closed launch to a later month', () => {
    const fits = launchFit(plan((s) => { s.startMonth = '2026-10' }), june, { applicationMonth: '2026-11' })
    expect(fits.find((f) => f.project.id === 'kebun-baru-ridge')!.keys).toBe(addMonths('2026-11', 37))
  })
})

describe('upcoming launch without projects', () => {
  it('sets BTO dates from the launch month', () => {
    const s = newPlan('nov')
    setLaunchDates(s, '2026-11')
    expect(s.flat.dates).toEqual({ application: '2026-11', booking: '2027-04', afl: '2027-09', keys: addMonths('2026-11', TYPICAL_WAIT_MONTHS) })
    expect(LAUNCHES.find((l) => l.id === '2026-11')!.projects).toEqual([])
  })
})

describe('sites shown before a launch', () => {
  it('adds up the Yishun flat mix from the town map', () => {
    const y = LAUNCHES.find((l) => l.id === '2026-11')!.previews!.find((v) => v.town === 'Yishun')!
    // 390 2-room Flexi, 80 3-room, 460 4-room, 650 5-room (1,580 flats).
    expect(Object.values(y.flats).reduce((a, b) => a + b!, 0)).toBe(1580)
  })
  it('adds up the Toa Payoh flat mix, Community Care Apartments included', () => {
    const t = LAUNCHES.find((l) => l.id === '2026-11')!.previews!.find((v) => v.town === 'Toa Payoh')!
    // 260 Community Care Apartments, 590 2-room Flexi, 580 4-room (1,430 flats).
    expect(Object.values(t.flats).reduce((a, b) => a + b!, 0) + t.cca!).toBe(1430)
  })
  it('adds up the Tengah flat mix', () => {
    const t = LAUNCHES.find((l) => l.id === '2026-11')!.previews!.find((v) => v.town === 'Tengah')!
    // 180 2-room Flexi, 80 3-room, 170 4-room, 250 5-room, 30 3Gen (710 flats).
    expect(Object.values(t.flats).reduce((a, b) => a + b!, 0)).toBe(710)
  })
  it('adds up the Sembawang flat mix', () => {
    const t = LAUNCHES.find((l) => l.id === '2026-11')!.previews!.find((v) => v.town === 'Sembawang')!
    // 330 2-room Flexi, 100 3-room, 460 4-room, 420 5-room (1,310 flats).
    expect(Object.values(t.flats).reduce((a, b) => a + b!, 0)).toBe(1310)
  })
  it('adds up the Geylang flat mix', () => {
    const t = LAUNCHES.find((l) => l.id === '2026-11')!.previews!.find((v) => v.town === 'Geylang')!
    // 170 2-room Flexi, 270 4-room (440 flats).
    expect(Object.values(t.flats).reduce((a, b) => a + b!, 0)).toBe(440)
  })
  it('adds up the flat mix of both Bedok sites', () => {
    const b = LAUNCHES.find((l) => l.id === '2026-11')!.previews!.filter((v) => v.town === 'Bedok')
    // 890 2-room Flexi, 90 3-room, 660 4-room (1,640 flats); 350 2-room Flexi, 510 4-room (860 flats).
    expect(b.map((t) => Object.values(t.flats).reduce((a, n) => a + n!, 0))).toEqual([1640, 860])
  })
  it('has a site for every town the launch names', () => {
    const l = LAUNCHES.find((x) => x.id === '2026-11')!
    expect([...new Set(l.previews!.map((v) => v.town))].sort()).toEqual([...l.towns!].sort())
  })
})
