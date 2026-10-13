import { describe, expect, it } from 'vitest'
import { buildGraph, ESTATE_DETOUR, estateStarts, fromStarts, hull, nearestNodes, routeTo } from './walk'

// A square of paths 100 m a side with one diagonal shortcut missing: corners 0 (0,0), 1 (100,0), 2 (100,100), 3 (0,100).
const g = buildGraph({ nodes: [0, 0, 100, 0, 100, 100, 0, 100], ways: [[0, 1, 2], [0, 3], [3, 2]] })

describe('walking routes', () => {
  it('finds the nearest path points', () => {
    expect(nearestNodes(g, [5, 5], 1)[0].i).toBe(0)
  })
  it('walks around the paths, not straight across', () => {
    const run = fromStarts(g, nearestNodes(g, [0, 0], 1))
    const r = routeTo(g, run, [0, 0], [100, 100])!
    expect(r.dist).toBe(200)
    expect(r.walkMin).toBe(3)
    expect(r.line[0]).toEqual([0, 0])
    expect(r.line[r.line.length - 1]).toEqual([100, 100])
  })
  it('adds the walk to and from the network', () => {
    const run = fromStarts(g, nearestNodes(g, [-30, 0], 1))
    expect(routeTo(g, run, [-30, 0], [130, 0])!.dist).toBe(30 + 100 + 30)
  })
  it('gives up when nothing is reachable nearby', () => {
    const run = fromStarts(g, nearestNodes(g, [0, 0], 1))
    expect(routeTo(g, run, [0, 0], [5000, 5000])).toBeNull()
  })

  it('crosses the estate to any path point on its edge', () => {
    // Estate covering the left half of the square: corners 0 and 3 are on its edge, 1 and 2 are 100 m away.
    const estate = hull([[-10, -10], [10, -10], [10, 110], [-10, 110], [0, 50]])
    expect(estate).toHaveLength(4)
    const st = estateStarts(g, [0, 50], estate)
    expect(st.map((e) => e.i).sort()).toEqual([0, 3])
    expect(st[0].d).toBeCloseTo(50 * ESTATE_DETOUR)
    const r = routeTo(g, fromStarts(g, st), [0, 50], [100, 100])!
    expect(r.dist).toBe(Math.round(50 * ESTATE_DETOUR + 100))
  })
})
