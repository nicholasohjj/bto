import { describe, expect, it } from 'vitest'
import { LAUNCHES } from '../config/launches'
import { areaM2, centroid, edgeDist, noiseSources, type AreaOsm } from './area'
import { AREA_OSM, AREAS } from './areaList'

const previews = LAUNCHES.flatMap((l) => (l.previews ?? []).map((v) => ({ l, v })))

describe('upcoming sites', () => {
  it('has a placed site for every town-map preview, in the same launch and town', () => {
    for (const { l, v } of previews) {
      const a = AREAS.find((x) => x.id === v.area)
      expect(a, v.where).toBeDefined()
      expect([a!.launch, a!.town]).toEqual([l.id, v.town])
    }
    expect(new Set(AREAS.map((a) => a.id)).size).toBe(AREAS.length)
  })
  it('has outlines of a believable size for their flat counts', () => {
    for (const { v } of previews) {
      const a = AREAS.find((x) => x.id === v.area)!, flats = Object.values(v.flats).reduce((s, n) => s + n!, 0) + (v.cca ?? 0)
      const ha = areaM2(a.outline) / 1e4
      // HDB estates run from about 150 to 700 flats a hectare.
      expect(flats / ha, a.id).toBeGreaterThan(150); expect(flats / ha, a.id).toBeLessThan(700)
      // The outline sits on the geo anchor.
      expect(Math.hypot(...centroid(a.outline)), a.id).toBeLessThan(150)
    }
  })
  // The MRT station each town map draws next to its site, walking aside: its nearest exit is close to the site.
  const NEAR: [string, string, number][] = [
    ['yishun-khatib', 'Khatib', 700], ['toa-payoh-caldecott', 'Caldecott', 150], ['sembawang-admiralty-lane', 'Sembawang', 1300],
    ['geylang-aljunied', 'Mattar', 500], ['bedok-upper-east-coast', 'Bayshore', 150], ['bedok-bayshore-walk', 'Bayshore', 150],
  ]
  for (const [id, station, within] of NEAR) {
    it(`puts ${id} within ${within} m of ${station} MRT, as the town map draws it`, async () => {
      const a = AREAS.find((x) => x.id === id)!, osm: AreaOsm = await AREA_OSM[id]()
      const exits = osm.amenities.filter((x) => x.kind === 'mrt' && x.name.startsWith(station))
      expect(exits.length).toBeGreaterThan(0)
      expect(Math.min(...exits.map((x) => edgeDist(x.at, a.outline)))).toBeLessThan(within)
    })
  }
  it('keeps the two Bedok sites apart, on either side of Bayshore Drive', () => {
    const [a, b] = ['bedok-upper-east-coast', 'bedok-bayshore-walk'].map((id) => AREAS.find((x) => x.id === id)!)
    // b's corners in a's metres
    const kx = (g: { lat0: number }) => 111320 * Math.cos(g.lat0 * Math.PI / 180)
    const toA = ([x, y]: [number, number]): [number, number] => {
      const lat = b.geo.lat0 - y / 110574, lon = b.geo.lon0 + x / kx(b.geo)
      return [(lon - a.geo.lon0) * kx(a.geo), -(lat - a.geo.lat0) * 110574]
    }
    for (const p of b.outline) expect(edgeDist(toA(p), a.outline)).toBeGreaterThan(5)
  })
  it('lists the Jurong Region Line stations near Tengah stations as being built, and the open stations nearby without mapped exits', async () => {
    const mrt = (await AREA_OSM['tengah-garden-avenue']()).amenities.filter((x) => x.kind === 'mrt')
    const named = (n: string) => mrt.find((x) => x.name.startsWith(n))
    for (const n of ['Tengah Plantation', 'Tengah Park', 'Hong Kah', 'Tengah MRT']) expect(named(n)?.sub, n).toBe('future')
    for (const n of ['Bukit Batok MRT', 'Chinese Garden MRT']) expect(named(n)?.sub, n).toBeUndefined()
  })
  it('finds the expressways the town maps draw beside the Tengah and Bedok sites', async () => {
    const tg = AREAS.find((x) => x.id === 'tengah-garden-avenue')!, bd = AREAS.find((x) => x.id === 'bedok-bayshore-walk')!
    const nt = noiseSources(tg, await AREA_OSM[tg.id]()), nb = noiseSources(bd, await AREA_OSM[bd.id]())
    // Measured to the carriageway's centre line; the town map draws a canal between the site and the expressway.
    expect(nt.find((n) => /Pan-Island/.test(n.name))!.dist).toBeLessThan(120)
    expect(nb.find((n) => /East Coast Parkway/.test(n.name))!.dist).toBeLessThan(150)
  })
})
