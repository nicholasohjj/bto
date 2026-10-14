import { describe, expect, it } from 'vitest'
import { across, areaM2, centroid, edgeDist, noiseSources, primarySchools, undergroundNear, type Area, type AreaOsm } from './area'

// A 100 m square site with its north-west corner at the origin.
const A: Area = { id: 't', name: 'Test', town: 'Test', launch: '2026-11', source: '', geo: { lat0: 1.35, lon0: 103.8, cx: 0, cy: 0 }, outline: [[0, 0], [100, 0], [100, 100], [0, 100]] }
const osm = (o: Partial<AreaOsm>): AreaOsm => ({ fetched: '', attribution: '', walk: { nodes: [], ways: [] }, amenities: [], ...o })

describe('upcoming site geometry', () => {
  it('measures from the edge of the site', () => {
    expect(edgeDist([50, 50], A.outline)).toBe(0)
    expect(edgeDist([150, 50], A.outline)).toBe(50)
    expect(edgeDist([130, 140], A.outline)).toBe(50)
    expect(centroid(A.outline)).toEqual([50, 50])
    expect(areaM2(A.outline)).toBe(10000)
    expect(across(A.outline)).toBeCloseTo(141.4, 1)
  })
})

describe('primary schools by distance band', () => {
  const school = (name: string, at: [number, number]) => ({ name, kind: 'school', sub: 'primary', at })
  it('tells a school within 1 km of the whole site from one within 1 km of only part of it', () => {
    const s = primarySchools(A, osm({ amenities: [school('Near Primary School', [600, 50]), school('Edge Primary School', [1050, 50]), school('Far Primary School', [2050, 50]), school('Out Primary School', [2300, 50]), { name: 'A Secondary School', kind: 'school', sub: 'secondary', at: [200, 50] }] }))
    expect(s.map((x) => [x.a.name, x.within1, x.within2])).toEqual([
      ['Near Primary School', 'all', 'all'],
      ['Edge Primary School', 'part', 'all'],
      ['Far Primary School', 'none', 'part'],
    ])
    expect(s[0].near).toBe(500)
  })
})

describe('roads and trains near the site', () => {
  it('lists expressways, main roads and above-ground tracks nearest first, with the side they are on', () => {
    const n = noiseSources(A, osm({
      roads: [
        { n: 'Pan-Island Expressway', k: 'expressway', p: [-100, 160, 300, 160] },
        { n: 'Big Road', k: 'major', p: [130, -200, 130, 300] },
        { n: 'Small Street', k: 'minor', p: [-10, -200, -10, 300] },
        { n: 'Far Road', k: 'major', p: [-400, -200, -400, 300] },
      ],
      rail: [{ n: 'North South Line', p: [-200, -80, 300, -80] }, { n: 'Downtown Line', u: 1, p: [-200, 120, 300, 120] }],
    }))
    expect(n.map((x) => [x.name, x.kind, x.dist, x.side])).toEqual([
      ['Big Road', 'major', 30, 'east'],
      ['Pan-Island Expressway', 'expressway', 60, 'south'],
      ['North South Line', 'rail', 80, 'north'],
    ])
  })
  it('counts a road that crosses the site as next to it, and mentions underground lines', () => {
    const o = osm({ roads: [{ n: 'Through Road', k: 'major', p: [-50, 50, 150, 50] }], rail: [{ n: 'Downtown Line (DTL)', u: 1, p: [-200, 120, 300, 120] }] })
    expect(noiseSources(A, o)[0].dist).toBe(0)
    expect(undergroundNear(A, o)).toEqual(['Downtown Line'])
  })
})
