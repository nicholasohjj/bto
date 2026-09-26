import { describe, expect, it } from 'vitest'
import { runScenario } from '../index'
import { buildSchedule, resaleLevy } from '../payments'
import { resolvePolicy } from '../policyOverrides'
import { newScenario, runningCostDefaults, seedScenario, upgradeCosts, COST_DEFAULTS_VERSION } from '../../state/defaults'
import { importJson, loadState } from '../../state/storage'
import type { Scenario } from '../types'

const P = resolvePolicy()

function plan(f: (s: Scenario) => void = () => {}): Scenario {
  const s = newScenario('t', '2026-01')
  s.flat.dates = { application: '2026-02', booking: '2026-06', afl: '2026-12', keys: '2029-12' }
  f(s)
  return s
}

describe('resale levy', () => {
  it('is nothing for first-timers, whatever flat is picked', () => {
    expect(resaleLevy(plan((s) => { s.flat.firstSubsidisedFlat = '4R' }), P)).toBe(0)
  })
  it('follows the first subsidised flat for second-timers, halved when asked', () => {
    expect(resaleLevy(plan((s) => { s.flat.household = 'secondTimers'; s.flat.firstSubsidisedFlat = '4R' }), P)).toBe(40000)
    expect(resaleLevy(plan((s) => { s.flat.household = 'firstAndSecond'; s.flat.firstSubsidisedFlat = 'EC' }), P)).toBe(55000)
    expect(resaleLevy(plan((s) => { s.flat.household = 'firstAndSecond'; s.flat.firstSubsidisedFlat = '3R'; s.flat.halfResaleLevy = true }), P)).toBe(15000)
    expect(resaleLevy(plan((s) => { s.flat.household = 'secondTimers'; s.flat.firstSubsidisedFlat = 'none' }), P)).toBe(0)
  })
  it('is due in cash at key collection', () => {
    const s = plan((s) => { s.flat.household = 'secondTimers'; s.flat.firstSubsidisedFlat = '2R' })
    const ob = buildSchedule(s, P).obligations.find((o) => o.kind === 'resaleLevy')!
    expect(ob).toMatchObject({ ym: '2029-12', amount: 15000, funding: 'cashOnly' })
  })
  it('warns second-timers who haven’t picked their first flat yet', () => {
    const ids = (s: Scenario) => runScenario(s).warnings.map((w) => w.id)
    expect(ids(plan((s) => { s.flat.household = 'secondTimers' }))).toContain('resale-levy-unset')
    expect(ids(plan((s) => { s.flat.household = 'secondTimers'; s.flat.firstSubsidisedFlat = 'none' }))).not.toContain('resale-levy-unset')
    expect(ids(plan())).not.toContain('resale-levy-unset')
  })
})

describe('running costs after keys', () => {
  it('charges S&CC monthly in cash from key collection', () => {
    const obs = buildSchedule(plan(), P).obligations.filter((o) => o.kind === 'scc')
    expect(obs[0]).toMatchObject({ ym: '2029-12', amount: 71.6, funding: 'cashOnly' })
    expect(obs[1].ym).toBe('2030-01')
  })
  it('charges property tax yearly on the annual value above $12,000', () => {
    const tax = (type: Scenario['flat']['type']) => buildSchedule(plan((s) => { s.flat.type = type }), P).obligations.filter((o) => o.kind === 'propertyTax')
    expect(tax('4R')).toEqual([]) // AV $11,400: nothing to pay
    const five = tax('5R')
    expect(five[0]).toMatchObject({ ym: '2030-12', amount: 96 }) // 4% of $2,400
    expect(five[1].ym).toBe('2031-12')
  })
  it('uses the annual value from Advanced settings', () => {
    const s = plan((s) => { s.policyOverrides = { 'runningCosts.annualValue.4R': 22000 } })
    expect(buildSchedule(s, resolvePolicy(s.policyOverrides)).obligations.find((o) => o.kind === 'propertyTax')!.amount).toBe(400)
  })
})

describe('saved plans get the new cost items once', () => {
  const old = (): Scenario => {
    const s = seedScenario()
    s.costs = s.costs.filter((c) => !['resaleLevy', 'scc', 'propertyTax'].includes(c.kind))
    delete s.costDefaultsVersion
    return s
  }
  it('adds them to a plan saved before they existed', () => {
    const up = upgradeCosts(old())
    expect(up.costDefaultsVersion).toBe(COST_DEFAULTS_VERSION)
    expect(up.costs.filter((c) => ['resaleLevy', 'scc', 'propertyTax'].includes(c.kind))).toHaveLength(runningCostDefaults().length)
  })
  it('doesn’t add back an item you removed later', () => {
    const up = upgradeCosts(old())
    up.costs = up.costs.filter((c) => c.kind !== 'scc')
    expect(upgradeCosts(up).costs.some((c) => c.kind === 'scc')).toBe(false)
  })
  it('upgrades imported files and localStorage', () => {
    const [imported] = importJson(JSON.stringify([old()]), [])
    expect(imported.costs.some((c) => c.kind === 'scc')).toBe(true)
    const store = new Map<string, string>()
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } } as Storage
    store.set('bto-money-timeline:v1', JSON.stringify({ scenarios: [old()], activeId: 'x', compareIds: [], wizardDone: true, showPerPartner: false }))
    expect(loadState().scenarios[0].costs.some((c) => c.kind === 'propertyTax')).toBe(true)
  })
})
