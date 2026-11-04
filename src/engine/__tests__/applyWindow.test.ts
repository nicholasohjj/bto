import { describe, expect, it } from 'vitest'
import { DEFAULT_POLICY as POLICY } from '../../config/policy'
import { seedScenario } from '../../state/defaults'
import { applyWindow } from '../applyWindow'
import { runScenario } from '../index'
import type { Scenario } from '../types'

const plan = (f: (s: Scenario) => void = () => {}) => {
  const s = seedScenario()
  s.startMonth = '2026-10'
  s.flat.saleType = 'BTO'
  s.flat.dates = { application: '2026-11', booking: '2027-04', afl: '2027-09', keys: '2030-09' }
  f(s)
  return s
}

describe('apply window', () => {
  it('lists the announced launch, then estimates until the first one past the letter', () => {
    const w = applyWindow(plan((s) => { s.flat.hfeValidUntil = '2027-07' }), POLICY)
    expect(w.fromLetter).toBe(true)
    expect(w.launches.map((l) => [l.month, !!l.launch, l.hfe])).toEqual([
      ['2026-11', true, 'valid'],
      ['2027-02', true, 'valid'],
      ['2027-06', false, 'valid'],
      ['2027-10', false, 'expired'],
    ])
    expect(w.chances).toBe(3)
    expect(w.launches[0].isPlan).toBe(true)
    expect(w.launches[1].keys).toBe('2030-12') // typical 46-month wait
  })

  it('works out the letter from the HFE month when it isn’t set', () => {
    const w = applyWindow(plan((s) => { s.flat.hfeMonth = '2026-09' }), POLICY)
    expect(w.validUntil).toBe('2027-06')
    expect(w.fromLetter).toBe(false)
    expect(w.launches.at(-1)!.hfe).toBe('expired')
  })

  it('warns about the letter from its own date', () => {
    const ids = (s: Scenario) => runScenario(s).warnings.map((x) => x.id)
    expect(ids(plan((s) => { s.flat.hfeValidUntil = '2026-10' }))).toContain('hfe-expired')
    expect(ids(plan((s) => { s.flat.hfeValidUntil = '2026-11' }))).not.toContain('hfe-expired')
  })
})
