import { describe, expect, it } from 'vitest'
import { CATALOG } from './catalog'
import { setCeil } from './ceiling'
import { chain, elevPanels, elevSheetSvg, hChain, vChain } from './elevation'
import { loadState, type Design } from './model'

// A 4 × 3 m bedroom: a window on the north wall, a door on the south wall, a wardrobe and a socket on the east wall.
const flat = (): Design => loadState({
  H: 2.6,
  walls: [{ x1: 0, y1: 0, x2: 4, y2: 0, fin: 'tile' }, { x1: 4, y1: 0, x2: 4, y2: 3 }, { x1: 4, y1: 3, x2: 0, y2: 3 }, { x1: 0, y1: 3, x2: 0, y2: 0 }],
  rooms: [{ name: 'Bedroom', x: 0, y: 0, w: 4, h: 3 }],
  openings: [{ kind: 'window', axis: 'h', c: 0, p: 2, w: 1.2, wt: 'std' }, { kind: 'door', axis: 'h', c: 3, p: 0.8, w: 0.9, dt: 'single' }],
  items: [
    { type: 'ctall', x: 3.7, y: 1.5, rot: 90, w: 2, d: 0.6 },
    { type: 'socket', x: 3.97, y: 0.3, rot: 90, w: 0.1, d: 0.06 },
    { type: 'bed_q', x: 1.5, y: 1.5, rot: 0, w: 1.52, d: 1.9 },
  ],
}, (i) => CATALOG[i.type])
const z = (): [number, number] => [0.25, 0.35]

describe('elevations', () => {
  it('draws one panel per wall, lettered through the flat, seen from inside', () => {
    const ps = elevPanels(flat(), CATALOG, z)
    expect(ps.map((p) => p.id)).toEqual(['A', 'B', 'C', 'D'])
    expect(ps.map((p) => p.facing)).toEqual(['north', 'east', 'south', 'west'])
    expect(ps[0].fin).toBe('tile')
    expect(ps[1].fin).toBe('paint')
  })
  it('places the window with its sill and head, and chains the breaks in the wall', () => {
    const n = elevPanels(flat(), CATALOG, z)[0]
    expect(n.ops).toHaveLength(1)
    expect(n.ops[0]).toMatchObject({ kind: 'window', w: 1.2, z0: 0.9 })
    expect(n.ops[0].z1).toBeCloseTo(2.1)
    expect(hChain(n)).toEqual([0, 1.4, 2.6, 4])
    expect(vChain(n).map((v) => +v.toFixed(3))).toEqual([0, 0.9, 2.1, 2.6])
  })
  it('mirrors the door position on the far wall (seen from inside, left and right swap)', () => {
    const s = elevPanels(flat(), CATALOG, z)[2]
    expect(s.ops[0].kind).toBe('door')
    expect(s.ops[0].u).toBeCloseTo(4 - 0.8)
  })
  it('uses carpentry settings for heights and puts services on their own wall only', () => {
    const S = flat()
    S.items[0].cfg = { h: 2.4, elev: 0, doors: 'swing', n: 4 }
    const [north, east] = elevPanels(S, CATALOG, z)
    const ward = east.its.find((i) => i.kind === 'carp')!
    expect(ward).toMatchObject({ on: true, front: true, z0: 0, z1: 2.4 })
    // The same wardrobe from the north wall is seen side-on.
    expect(north.its.find((i) => i.kind === 'carp')).toMatchObject({ front: false })
    expect(ward.u2 - ward.u1).toBeCloseTo(2)
    expect(hChain(east).map((v) => +v.toFixed(3))).toEqual([0, 0.5, 2.5, 3])
    expect(east.its.some((i) => i.kind === 'svc')).toBe(true)
    expect(north.its.some((i) => i.kind === 'svc')).toBe(false)
  })
  it('marks a false ceiling and filters by room', () => {
    const S = flat()
    setCeil(S.rooms[0], 'type', 'full'); setCeil(S.rooms[0], 'drop', '0.3')
    const n = elevPanels(S, CATALOG, z)[0]
    expect(n.drop).toBe(0.3)
    expect(vChain(n).map((v) => +v.toFixed(3))).toContain(2.3)
    expect(elevPanels(S, CATALOG, z, new Set(['nope']))).toHaveLength(0)
  })
  it('draws loose built-ins from their model parts and dimensions the big ones, not taps', () => {
    const S = loadState({ H: 2.6, walls: [], rooms: [{ name: 'Bath', x: 0, y: 0, w: 2, h: 2 }], items: [{ type: 'vanity', x: 1, y: 0.25, rot: 0, w: 0.6, d: 0.45 }] }, (i) => CATALOG[i.type])
    // Cabinet 0.35–0.85, a tap above it, a mirror 1.05–1.95 on the wall.
    const parts = () => [[0.7, 1.3, 0, 0.45, 0.35, 0.85, '#b9a58a'], [0.98, 1.02, 0.05, 0.1, 0.85, 1.0, '#9aa2a6'], [0.7, 1.3, 0, 0.03, 1.05, 1.95, '#cfe0e6']] as never
    const north = elevPanels(S, CATALOG, () => [0, 1.95], undefined, parts)[0]
    const v = north.its[0]
    expect(v.parts).toHaveLength(3)
    expect([v.z0, v.z1]).toEqual([0.35, 1.95])
    expect(vChain(north).map((x) => +x.toFixed(2))).toEqual([0, 0.35, 0.85, 1.05, 1.95, 2.6])
  })
  it('clips an opening that straddles the corner to the wall', () => {
    const S = loadState({ H: 2.6, walls: [], rooms: [{ name: 'Room', x: 0, y: 0, w: 3, h: 3 }], openings: [{ kind: 'door', axis: 'h', c: 0, p: 0.1, w: 0.9, dt: 'single' }] }, (i) => CATALOG[i.type])
    const o = elevPanels(S, CATALOG, z)[0].ops[0]
    expect([o.u1, +o.u2.toFixed(2)]).toEqual([0, 0.55])
    expect(hChain(elevPanels(S, CATALOG, z)[0]).map((x) => +x.toFixed(2))).toEqual([0, 0.55, 3])
  })
  it('merges near-duplicate breaks', () => {
    expect(chain([0.5, 0.505, 2.995], 0, 3)).toEqual([0, 0.5, 3])
  })
  it('builds a sheet with millimetre dimensions', () => {
    const sh = elevSheetSvg(elevPanels(flat(), CATALOG, z), 'Test', 1200)
    expect(sh.svg).toContain('>1200<')
    expect(sh.svg).toContain('>4000<')
    expect(sh.svg).toContain('>900<')
    expect(sh.svg).not.toContain('NaN')
  })
})
