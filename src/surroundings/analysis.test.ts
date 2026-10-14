import { describe, expect, it } from 'vitest'
import site from './sites/berlayar-rise.json'
import { amenityDistances, compass, obstacles, rayPoly, roadDistances, sgTime, sunDay, sunPosition, unitPos, view, yearSun, type Site } from './analysis'

const S = site as unknown as Site
const SG = { lat: 1.2655, lon: 103.812 }

describe('sun position in Singapore', () => {
  it('is almost overhead at solar noon on the March equinox', () => {
    const s = sunPosition(sgTime(2026, 3, 20, 13.12), SG.lat, SG.lon)
    expect(s.alt).toBeGreaterThan(87)
  })
  it('is to the north at noon in June and to the south in December', () => {
    const jun = sunPosition(sgTime(2026, 6, 21, 13.05), SG.lat, SG.lon), dec = sunPosition(sgTime(2026, 12, 21, 12.95), SG.lat, SG.lon)
    expect(jun.az > 300 || jun.az < 60).toBe(true)
    expect(jun.alt).toBeGreaterThan(62); expect(jun.alt).toBeLessThan(70)
    expect(Math.abs(dec.az - 180)).toBeLessThan(30)
    expect(dec.alt).toBeGreaterThan(60); expect(dec.alt).toBeLessThan(68)
  })
  it('rises around 7 am and sets around 7 pm, east then west', () => {
    expect(sunPosition(sgTime(2026, 3, 20, 6.8), SG.lat, SG.lon).alt).toBeLessThan(0)
    const am = sunPosition(sgTime(2026, 3, 20, 7.6), SG.lat, SG.lon), pm = sunPosition(sgTime(2026, 3, 20, 18.6), SG.lat, SG.lon)
    expect(am.alt).toBeGreaterThan(0); expect(Math.abs(am.az - 90)).toBeLessThan(10)
    expect(pm.alt).toBeGreaterThan(0); expect(Math.abs(pm.az - 270)).toBeLessThan(10)
  })
})

describe('geometry', () => {
  it('finds where a ray enters a polygon', () => {
    expect(rayPoly([0, 0], [1, 0], [[5, -1], [7, -1], [7, 1], [5, 1]])).toBeCloseTo(5)
    expect(rayPoly([0, 0], [-1, 0], [[5, -1], [7, -1], [7, 1], [5, 1]])).toBe(Infinity)
  })
  it('names compass directions with north as -y', () => {
    expect(compass([0, -1])).toBe('north'); expect(compass([1, 0])).toBe('east'); expect(compass([-1, 1])).toBe('south-west')
  })
})

describe('Berlayar Rise units', () => {
  const obs = obstacles(S, 0)
  it('has every unit of every block, facing outwards', () => {
    expect(S.blocks.map((b) => b.units.length)).toEqual([8, 8, 8, 8, 8, 8])
    // Unit 113 is on the north side of block 200A and 111 on the south.
    expect(unitPos(S, { block: '200A', unit: '113', storey: 10 })!.facing).toBe('north')
    expect(unitPos(S, { block: '200A', unit: '111', storey: 10 })!.facing).toBe('south')
  })
  it('keeps storeys within the block', () => {
    expect(unitPos(S, { block: '204B', unit: '116', storey: 99 })!.storey).toBe(33)
    expect(unitPos(S, { block: '204B', unit: '116', storey: 1 })!.storey).toBe(2)
  })
  it('opens up the view above lower buildings', () => {
    // 204B unit 116 faces south over the reserved sites, assumed here to be 20 storeys.
    const o20 = obstacles(S, 20)
    const low = view(unitPos(S, { block: '204B', unit: '116', storey: 3 })!, o20), high = view(unitPos(S, { block: '204B', unit: '116', storey: 33 })!, o20)
    expect(high.farPct).toBeGreaterThan(low.farPct)
    expect(unitPos(S, { block: '204B', unit: '116', storey: 33 })!.facing).toBe('south')
  })
  it('gives north-facing windows sun in June and none in December', () => {
    const u = unitPos(S, { block: '200B', unit: '129', storey: 40 })!
    expect(sunDay(S, u, 2026, 6, 21, obs).sunHours).toBeGreaterThan(3)
    expect(sunDay(S, u, 2026, 12, 21, obs).sunHours).toBe(0)
  })
  it('is shaded more on a low floor than a high one', () => {
    const lo = yearSun(S, unitPos(S, { block: '201B', unit: '149', storey: 3 })!, obs, 2026), hi = yearSun(S, unitPos(S, { block: '201B', unit: '149', storey: 44 })!, obs, 2026)
    expect(hi.avgSun).toBeGreaterThanOrEqual(lo.avgSun)
  })
  it('measures roads and amenities', () => {
    const u = unitPos(S, { block: '200B', unit: '129', storey: 10 })!
    const r = roadDistances(S, u)
    expect(r[0].name).toMatch(/Telok Blangah|Berlayar/)
    const a = amenityDistances(S, u)
    expect(a[0].a.kind).not.toBe('')
    expect(a.find((x) => x.a.name.startsWith('Telok Blangah MRT'))!.dist).toBeLessThan(150)
  })
})

describe('with OpenStreetMap', async () => {
  const { toLatLng, fromLatLng } = await import('./analysis')
  const osm = (await import('./sites/berlayar-rise.osm.json')).default as unknown as import('./analysis').Osm
  it('converts site metres to latitude and longitude and back', () => {
    const [lat, lon] = toLatLng(S, [258, 31])
    expect(lat).toBeCloseTo(1.2706, 3); expect(lon).toBeCloseTo(103.8097, 3)
    const p = fromLatLng(S, lat, lon)
    expect(p[0]).toBeCloseTo(258, 3); expect(p[1]).toBeCloseTo(31, 3)
    // Telok Blangah MRT exit A (from OpenStreetMap) sits on the station drawn on the site plan.
    const a = fromLatLng(S, 1.2707388, 103.8098348)
    expect(a[0]).toBeGreaterThan(240); expect(a[0]).toBeLessThan(295); expect(a[1]).toBeGreaterThan(10); expect(a[1]).toBeLessThan(45)
  })
  it('blocks a north view that looked clear without the existing buildings', () => {
    const u = unitPos(S, { block: '200B', unit: '129', storey: 5 })!
    expect(view(u, obstacles(S, 0)).farPct).toBe(100)
    expect(view(u, obstacles(S, 0, osm)).farPct).toBeLessThan(100)
  })
  it('keeps the estate out of the OpenStreetMap buildings (the brochure model covers it)', () => {
    const inEstate = osm.buildings.filter((b) => { const x = b.p[0], y = b.p[1]; return x > 110 && x < 330 && y > 80 && y < 290 })
    expect(inEstate.length).toBe(0)
  })
})

describe('trains', () => {
  const u = unitPos(S, { block: '200B', unit: '129', storey: 10 })!
  const [x, y] = u.eye, n = u.n
  // A straight track 60 m in front of the window, running across its view, and one underground behind the block.
  const across = (d: number) => [x + n[0] * d - n[1] * 300, y + n[1] * d + n[0] * 300, x + n[0] * d + n[1] * 300, y + n[1] * d - n[0] * 300]
  const osm = { rail: [{ n: 'Test Line', p: across(60) }, { n: 'Deep Line', u: 1 as const, p: across(-80) }, { n: 'Far Line', p: across(900) }] } as unknown as import('./analysis').Osm
  it('measures above-ground track from the window, counting height, and says whether the window faces it', async () => {
    const { railDistances } = await import('./analysis')
    const r = railDistances(u, osm)
    const t = r.find((x) => x.name === 'Test Line')!
    expect(t.underground).toBe(false); expect(t.faces).toBe(true)
    expect(t.dist).toBe(Math.round(Math.hypot(60, u.eye[2])))
    expect(r.find((x) => x.name === 'Deep Line')).toMatchObject({ underground: true, faces: false, dist: 80 })
    expect(r.some((x) => x.name === 'Far Line')).toBe(false)
  })
})

describe('picking a unit by clicking a block', async () => {
  const { unitAt } = await import('./analysis')
  it('takes the stack whose window is nearest the click', () => {
    const b = S.blocks[0], u = b.units[3]
    expect(unitAt(b, [u.win[0] + u.n[0], u.win[1] + u.n[1]], 10).no).toBe(u.no)
  })
  it('skips stacks that stop below the clicked storey', async () => {
    const lv = (await import('./sites/lakeview-cascadia.json')).default as unknown as Site
    const b = lv.blocks.find((x) => x.id === '325A')!, low = b.units.find((x) => x.no === '305')!
    expect(unitAt(b, low.win, 10).no).toBe('305')
    expect(unitAt(b, low.win, 30).no).not.toBe('305')
  })
})
