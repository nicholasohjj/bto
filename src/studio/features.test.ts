import { describe, expect, it } from 'vitest'
import { budgetSummary } from './budget'
import { CATALOG } from './catalog'
import { ceilingChecks, ceilingQty, inset, setCeil } from './ceiling'
import { electricalChecks, electricalCounts, electricalSvg } from './electrical'
import { loadState, type Design } from './model'
import { categorize, designQty, parseQuote, quoteTotals } from './quotes'

const flat = (): Design => loadState({
  H: 2.6,
  walls: [{ x1: 0, y1: 0, x2: 4, y2: 0 }, { x1: 4, y1: 0, x2: 4, y2: 3 }, { x1: 4, y1: 3, x2: 0, y2: 3 }, { x1: 0, y1: 3, x2: 0, y2: 0 }],
  rooms: [{ name: 'Master Bedroom', x: 0, y: 0, w: 4, h: 3 }, { name: 'Bathroom', x: 5, y: 0, w: 2, h: 2 }],
}, (i) => CATALOG[i.type])

describe('false ceilings', () => {
  it('insets an outline', () => {
    expect(inset([[0, 0], [4, 0], [4, 3], [0, 3]], 0.5)).toEqual([[0.5, 0.5], [3.5, 0.5], [3.5, 2.5], [0.5, 2.5]])
    expect(inset([[0, 0], [0, 3], [4, 3], [4, 0]], 0.5)).toEqual([[0.5, 0.5], [0.5, 2.5], [3.5, 2.5], [3.5, 0.5]])
  })
  it('measures and prices a box with cove light, and a full ceiling', () => {
    const S = flat()
    setCeil(S.rooms[0], 'type', 'box'); setCeil(S.rooms[0], 'band', '0.5'); setCeil(S.rooms[0], 'cove', 'true')
    setCeil(S.rooms[1], 'type', 'full')
    const q = ceilingQty(S)
    expect(q.box).toBeCloseTo(2 * (3 + 2))
    expect(q.cove).toBeCloseTo(10)
    expect(q.full).toBeCloseTo(4)
    S.prices = { 'g:full': 50, 'g:box': 10, 'g:cove': 5 }
    expect(budgetSummary(S, CATALOG).reno).toBe(Math.round(4 * 50 + +(10 / 0.3048).toFixed(1) * 10 + +(10 / 0.3048).toFixed(1) * 5))
  })
  it('survives a save and warns about low headroom', () => {
    const S = flat()
    setCeil(S.rooms[0], 'type', 'full'); setCeil(S.rooms[0], 'drop', '0.5')
    const again = loadState(JSON.parse(JSON.stringify(S)), (i) => CATALOG[i.type])
    expect(again.rooms[0].ceil).toEqual({ type: 'full', drop: 0.5, band: 0.6, cove: false })
    expect(ceilingChecks(again).some((c) => c.lvl === 'warn')).toBe(true)
    setCeil(S.rooms[0], 'type', 'none')
    expect(S.rooms[0].ceil).toBeUndefined()
  })
})

describe('electrical plan', () => {
  it('counts points, flags gaps and draws a sheet', () => {
    const S = flat()
    const add = (type: string, x: number, y: number) => S.items.push({ id: type + x, type, x, y, rot: 0, w: 0.1, d: 0.06, color: '#fff', g: 0, h: 0, mt: '', nm: '', pr: 0 })
    add('ceilL', 2, 1.5); add('downl', 1, 1); add('socket', 6, 1)
    expect(electricalCounts(S)).toEqual({ light: 2, power: 1 })
    const c = electricalChecks(S).map((x) => x.msg).join(' ')
    expect(c).toMatch(/Master Bedroom has no power socket/)
    expect(c).toMatch(/Master Bedroom has lights but no switch/)
    expect(c).toMatch(/Bathroom has an ordinary power socket/)
    const sv = electricalSvg(S)
    expect(sv.svg).toContain('Lighting point: 2')
  })
})

describe('quotes', () => {
  it('reads priced lines and skips totals', () => {
    const q = parseQuote(['Hacking of kitchen wall tiles  $1,200', 'Kitchen bottom cabinet 12 ft run - $2,640.50', 'Vinyl flooring 650 sq ft    3250', 'Subtotal $7,090', 'Item 3', 'GST 9%  $638'].join('\n'))
    expect(q.map((l) => [l.cat, l.amt])).toEqual([['hack', 1200], ['carp', 2640.5], ['floor', 3250], ['gst', 638]])
    expect(q[1].d).toBe('Kitchen bottom cabinet 12 ft run')
  })
  it('categorises common lines', () => {
    expect(categorize('Supply and install 13A power point')).toBe('elec')
    expect(categorize('L-box false ceiling with cove light')).toBe('ceil')
    expect(categorize('Paint whole unit with Nippon')).toBe('paint')
    expect(categorize('Water heater installation')).toBe('plumb')
  })
  it('gives rates against the design', () => {
    const S = flat()
    const totals = quoteTotals({ id: 'a', name: 'A', lines: parseQuote('Vinyl flooring  $1,800') })
    expect(totals.floor / designQty(S).floor.qty).toBeCloseTo(1800 / 16)
  })
})

describe('style presets', async () => {
  const { applyPreset, PRESETS, FLOOR_SPECS } = await import('./materials')
  it('sets dry and wet floors, walls and carpentry laminate', () => {
    const S = flat()
    S.items.push({ id: 'c1', type: 'ctall', x: 1, y: 1, rot: 0, w: 2, d: 0.6, color: '#fff', g: 0, h: 0, mt: '', nm: '', pr: 0 })
    S.walls[0].col = '#123456'
    expect(applyPreset(S, 'industrial', new Set(['ctall']))).toBe(true)
    expect(S.rooms.find((r) => r.name === 'Bathroom')!.floor).toBe(PRESETS.industrial.wet)
    expect(S.rooms.find((r) => r.name === 'Master Bedroom')!.floor).toBe(PRESETS.industrial.dry)
    expect(S.walls[0].col).toBe('')
    expect(S.items[0].color).toBe(PRESETS.industrial.lam)
    for (const p of Object.values(PRESETS)) { expect(FLOOR_SPECS[p.dry]).toBeTruthy(); expect(FLOOR_SPECS[p.wet]?.wet).toBe(true) }
  })
})
