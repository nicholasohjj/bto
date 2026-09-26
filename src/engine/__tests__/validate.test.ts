import { describe, expect, it } from 'vitest'
import { runScenario, simulateCore } from '../index'
import { affordablePrice } from '../afford'
import { scenarioProblem } from '../validate'
import { newPlan, seedScenario } from '../../state/defaults'

describe('dates that are typos', () => {
  it('refuses a five-digit key-collection year quickly instead of simulating 10,000 years', () => {
    const s = seedScenario()
    s.flat.dates.keys = '12022-01'
    const t = performance.now()
    expect(() => runScenario(s)).toThrow(/Key collection date: the year 12022/)
    expect(() => simulateCore(s)).toThrow()
    expect(() => affordablePrice(s)).toThrow()
    expect(performance.now() - t).toBeLessThan(100)
  })

  it('names the field', () => {
    const s = seedScenario()
    s.partners[1].birthYearMonth = '12022-01'
    expect(scenarioProblem(s)).toMatch(/birth month: the year 12022/)
    const c = seedScenario()
    c.financing.loanChanges = [{ id: 'r', kind: 'rate', from: '99999-01', rate: 0.03 }]
    expect(scenarioProblem(c)).toMatch(/A date in this plan: the year 99999/)
  })

  it('refuses key collection far in the future', () => {
    const s = seedScenario()
    s.flat.dates.keys = '2150-01'
    expect(scenarioProblem(s)).toMatch(/more than 30 years away/)
  })

  it('accepts the example plans and ignores names that look like dates', () => {
    const s = seedScenario()
    s.name = '12022-01'
    expect(scenarioProblem(s)).toBeNull()
  })
})

describe('key dates out of order', () => {
  const ids = (s: ReturnType<typeof seedScenario>) => runScenario(s).warnings.filter((w) => w.severity === 'error').map((w) => w.id)

  it('flags key collection before today', () => {
    const s = seedScenario()
    s.flat.dates.keys = '2022-12'
    expect(ids(s)).toContain('keys-past')
  })

  it('flags keys before AFL, and AFL before booking', () => {
    const a = seedScenario()
    a.flat.dates.keys = a.flat.dates.booking
    expect(ids(a)).toContain('dates-order')
    const b = seedScenario()
    b.flat.dates.afl = b.flat.dates.application
    expect(runScenario(b).warnings.find((w) => w.id === 'dates-order')?.title).toMatch(/AFL signing .* is before booking/)
  })

  it('allows an application already in the past', () => {
    const s = seedScenario()
    s.flat.dates.application = '2024-01'
    expect(ids(s)).not.toContain('dates-order')
    expect(ids(s)).not.toContain('keys-past')
  })
})

describe('staggered downpayment eligibility', () => {
  const staggered = (f: (s: ReturnType<typeof seedScenario>) => void) => {
    const s = seedScenario()
    s.financing.staggered = true
    s.financing.deferredIncomeAssessment = false
    s.flat.dates.application = '2026-10'
    s.partners[0].birthYearMonth = '1998-01'
    s.partners[1].birthYearMonth = '1999-01'
    s.flat.type = '4R'
    s.flat.household = 'firstTimers'
    f(s)
    return runScenario(s).warnings.map((w) => w.id)
  }

  it('is fine for a young first-timer couple with a 4-room', () => {
    expect(staggered(() => {})).not.toContain('staggered-eligibility')
  })
  it('flags a younger applicant past 30 at HFE', () => {
    expect(staggered((s) => { s.partners[1].birthYearMonth = '1995-01' ; s.partners[0].birthYearMonth = '1994-01' })).toContain('staggered-eligibility')
  })
  it('allows the 30th birthday month itself', () => {
    expect(staggered((s) => { s.partners[1].birthYearMonth = '1996-10'; s.partners[0].birthYearMonth = '1990-01' })).not.toContain('staggered-eligibility')
  })
  it('flags flats bigger than 5-room', () => {
    expect(staggered((s) => { s.flat.type = 'Exec' })).toContain('staggered-eligibility')
  })
  it('second-timers: only right-sizing to 3-room or smaller', () => {
    expect(staggered((s) => { s.flat.household = 'secondTimers' })).toContain('staggered-eligibility')
    const ids = staggered((s) => { s.flat.household = 'secondTimers'; s.flat.type = '3R'; s.partners[0].birthYearMonth = '1980-01'; s.partners[1].birthYearMonth = '1980-01' })
    expect(ids).not.toContain('staggered-eligibility')
    expect(ids).toContain('staggered-rightsizer')
  })
})

describe('Enhanced CPF Housing Grant in new plans', () => {
  it('new plans from the wizard include the auto grant', () => {
    const s = newPlan()
    expect(s.flat.grants).toEqual([expect.objectContaining({ auto: 'EHG' })])
    expect(runScenario(s).loan.grantsTotal).toBeGreaterThan(0)
    expect(runScenario(s).warnings.map((w) => w.id)).not.toContain('ehg-missing')
  })

  it('warns when an eligible plan has no grant', () => {
    const s = newPlan()
    s.flat.grants = []
    const w = runScenario(s).warnings.find((x) => x.id === 'ehg-missing')
    expect(w?.title).toMatch(/missing a \$[\d,]+ grant/)
  })

  it('doesn’t warn when you’re not eligible', () => {
    const s = newPlan()
    s.flat.grants = []
    s.partners.forEach((p) => { p.grossMonthly = 20000 })
    expect(runScenario(s).warnings.map((w) => w.id)).not.toContain('ehg-missing')
  })
})
