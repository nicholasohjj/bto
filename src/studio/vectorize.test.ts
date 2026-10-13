import { describe, expect, it } from 'vitest'
import type { PagePrims, Seg } from './brochure'
import { findScale } from './brochure'
import { _test, vectorize } from './vectorize'

// A synthetic plan drawn at 10 pt per metre: a 6 × 4 m flat with solid outer walls, a partition
// with a dashed door swing, a window band, room labels and a scale bar.
const K = 10
const rect = (x0: number, y0: number, x1: number, y1: number) => ({ pts: [[x0 * K, y0 * K], [x1 * K, y0 * K], [x1 * K, y1 * K], [x0 * K, y1 * K]] as [number, number][], dark: true })
const seg = (x1: number, y1: number, x2: number, y2: number): Seg => ({ x1: x1 * K, y1: y1 * K, x2: x2 * K, y2: y2 * K })
function dashedArc(cx: number, cy: number, r: number, a0: number, a1: number): Seg[] {
  const out: Seg[] = []
  for (let t = a0; t < a1 - 0.01; t += 0.12) { const u = Math.min(a1, t + 0.07); out.push(seg(cx + r * Math.cos(t), cy + r * Math.sin(t), cx + r * Math.cos(u), cy + r * Math.sin(u))) }
  return out
}
function plan(): PagePrims {
  const fills = [rect(0, 0, 6, 0.2), rect(0, 3.8, 6, 4), rect(0, 0, 0.2, 4), rect(5.8, 0, 6, 4)]
  const segs: Seg[] = [
    // Partition at x = 3.0–3.1 from the top wall down to y = 2.0, then a 0.9 m door gap to y = 2.9, then on to the bottom.
    seg(3.0, 0.2, 3.0, 2.0), seg(3.1, 0.2, 3.1, 2.0), seg(3.0, 2.9, 3.0, 3.8), seg(3.1, 2.9, 3.1, 3.8),
    // The door leaf swings into the right-hand room: hinge at (3.05, 2.9), radius 0.9.
    ...dashedArc(3.05, 2.9, 0.9, -Math.PI / 2, 0),
    // A window band inside the top wall's line on the left room's side is drawn as three lines (outer, glass, outer).
    // Scale bar: ticks every 2 m (20 pt), labelled up to 10.
    ...[0, 2, 4, 6, 8, 10].map((m) => ({ x1: 100 + m * K, y1: 500, x2: 100 + m * K, y2: 506 })),
  ]
  return {
    w: 800, h: 600, fills, segs, curves: [],
    texts: [
      { s: 'BEDROOM', x: 15, y: 20, size: 1 }, { s: 'LIVING/DINING', x: 40, y: 20, size: 1 }, { s: 'UNIT 101', x: 30, y: 45, size: 1 }, { s: '3 ROOM', x: 30, y: 43, size: 1 },
      { s: 'SCALE 0', x: 80, y: 498, size: 4 }, { s: '2', x: 118, y: 498, size: 4 }, { s: '10 METRES', x: 196, y: 498, size: 4 },
    ],
  }
}

describe('brochure scale bar', () => {
  it('reads points per metre from the ticks and the largest number', () => {
    expect(findScale(plan())).toBeCloseTo(10)
  })
})

describe('vectorize', () => {
  const r = vectorize(plan(), { x0: -5, y0: -5, x1: 70, y1: 50 }, 10)
  it('makes structural walls from solid fills and a partition from paired lines', () => {
    expect(r.stats.structural).toBe(4)
    const part = r.walls.find((w) => !w.str && w.x1 === w.x2 && Math.abs(w.x1 - 3.55) < 0.06)
    expect(part).toBeTruthy()
    expect(part!.th).toBeCloseTo(0.1)
  })
  it('finds the door from its dashed swing, on the partition', () => {
    const d = r.openings.find((o) => o.kind === 'door')!
    expect(d.axis).toBe('v')
    expect(d.c).toBeCloseTo(3.55, 1)
    expect(d.w).toBeCloseTo(0.9, 1)
    expect(d.flip).toBe(1)
  })
  it('turns labels into rooms that stop at the walls', () => {
    expect(r.rooms.map((x) => x.name).sort()).toEqual(['Bedroom', 'Living & Dining'])
    const bed = r.rooms.find((x) => x.name === 'Bedroom')!
    expect(bed.w * bed.h).toBeGreaterThan(8)
    expect(bed.w * bed.h).toBeLessThan(13)
    expect(r.unit).toBe('UNIT 101')
  })
})

describe('circle fit', () => {
  it('recovers a circle from points on it', () => {
    const pts = Array.from({ length: 12 }, (_, i): [number, number] => [2 + 0.8 * Math.cos(i * 0.13), 1 + 0.8 * Math.sin(i * 0.13)])
    const c = _test.fitCircle(pts)!
    expect(c.cx).toBeCloseTo(2)
    expect(c.cy).toBeCloseTo(1)
    expect(c.r).toBeCloseTo(0.8)
  })
})

describe('plan page titles', async () => {
  const { planTitle } = await import('./brochure')
  it('joins split text on the same line', () => {
    expect(planTitle([{ s: 'BLOCK', x: 10, y: 50, size: 9 }, { s: '200A', x: 40, y: 50.5, size: 9 }, { s: '|', x: 60, y: 50, size: 9 }])).toBe('Block 200A')
    expect(planTitle([{ s: 'UNIT 101', x: 10, y: 50, size: 9 }])).toBe('')
  })
})
