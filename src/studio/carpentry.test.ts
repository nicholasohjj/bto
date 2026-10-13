import { describe, expect, it } from 'vitest'
import { budgetLines, budgetSummary } from './budget'
import { CATALOG } from './catalog'
import { carpentryLines, cfgOf, FT, leaves, setCfg } from './carpentry'
import { loadState, type Item } from './model'

const item = (type: string, w: number, extra: Partial<Item> = {}): Item => ({ id: 'i' + Math.random(), type, x: 0, y: 0, rot: 0, w, d: 0.6, color: '#fff', g: 0, h: 0, mt: '', nm: '', pr: 0, ...extra })

describe('carpentry settings', () => {
  it('fills defaults and keeps changes within limits', () => {
    const it2 = item('ctall', 2)
    expect(cfgOf(it2).h).toBe(2.4)
    setCfg(it2, 'h', '9', 2.6)
    expect(cfgOf(it2).h).toBe(2.6)
    setCfg(it2, 'doors', 'slide', 2.6)
    setCfg(it2, 'doors', 'bogus', 2.6)
    expect(cfgOf(it2).doors).toBe('slide')
    expect(leaves(2, cfgOf(it2))).toBe(2)
    setCfg(it2, 'plinth', 'false', 2.6)
    expect(cfgOf(it2).plinth).toBe(false)
  })
  it('survives saving and loading, and drops junk', () => {
    const d = loadState({ items: [{ type: 'cbase', x: 1, y: 1, w: 3, cfg: { h: 0.85, doors: 'drawers', evil: { a: 1 }, 'bad key': 1 } }] }, (i) => CATALOG[i.type])
    expect(d.items[0].cfg).toEqual({ h: 0.85, doors: 'drawers' })
  })
})

describe('carpentry pricing', () => {
  it('prices runs per foot and counts them as renovation', () => {
    const S = loadState({}, () => undefined)
    S.items = [item('cbase', 2.4), item('cbase', 1.2), item('ctall', 1.8), item('sofa', 2.2)]
    const lines = carpentryLines(S)
    expect(lines.find((l) => l.key === 'c:cbase')!.qty).toBeCloseTo(3.6 / FT, 1)
    S.prices = { 'c:cbase': 200, 'c:ctall': 300, 'i:sofa': 1000 }
    expect(budgetLines(S, CATALOG).some((l) => l.key === 'i:cbase')).toBe(false)
    const sum = budgetSummary(S, CATALOG)
    expect(sum.furniture).toBe(1000)
    expect(sum.reno).toBe(Math.round(+(3.6 / FT).toFixed(1) * 200 + +(1.8 / FT).toFixed(1) * 300))
  })
})
