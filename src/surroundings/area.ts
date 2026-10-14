/**
 * Sites known only from HDB's town map, before the brochure is out: where the site is, what's within walking
 * distance, which primary schools are within 1 km and 2 km, and the roads and train tracks that could be heard.
 * Site metres as in analysis.ts (x east, y south), placed by `geo`.
 */
import { compass, lineDist, type Amenity, type Osm, type Pt, type Site } from './analysis'

export interface Area {
  id: string; name: string; town: string
  /** The launch it's offered in ("YYYY-MM"), as in config/launches.ts. */
  launch: string
  source: string
  geo: Site['geo']
  /** The site's boundary as the town map draws it. */
  outline: Pt[]
}
/** OpenStreetMap snapshot around an area: walking network, amenities, railway tracks and main roads. */
export interface AreaOsm extends Omit<Osm, 'buildings'> {
  /** n name, k kind, p x,y pairs. */
  roads?: { n?: string; k: 'expressway' | 'major' | 'minor'; p: number[] }[]
}

const pairs = (p: number[]): Pt[] => { const out: Pt[] = []; for (let i = 0; i < p.length; i += 2) out.push([p[i], p[i + 1]]); return out }

export function inside(p: Pt, poly: Pt[]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}
/** Distance from a point to the site's edge (0 inside it). */
export const edgeDist = (p: Pt, outline: Pt[]) => inside(p, outline) ? 0 : lineDist(p, [...outline, outline[0]]).d
/** Distance from the site's farthest corner: every block is within this. */
export const farDist = (p: Pt, outline: Pt[]) => Math.max(...outline.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])))
export function centroid(poly: Pt[]): Pt {
  let a = 0, x = 0, y = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]
    a += f; x += (poly[j][0] + poly[i][0]) * f; y += (poly[j][1] + poly[i][1]) * f
  }
  return [x / (3 * a), y / (3 * a)]
}
export function areaM2(poly: Pt[]) {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]
  return Math.abs(a) / 2
}
/** Longest distance across the site: walking from a block on the far side adds up to this. */
export const across = (poly: Pt[]) => Math.max(...poly.flatMap((p) => poly.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))))

/** Shortest distance between the site's edge and a line, and the side of the site it's on. */
function lineToSite(line: Pt[], outline: Pt[]): { dist: number; side: string } {
  const ring = [...outline, outline[0]]
  // Closest points on the line, from its points and from the site's corners; the side is where the nearest ones are.
  const cands: { d: number; at: Pt }[] = [...line.map((p) => ({ d: edgeDist(p, outline), at: p })), ...outline.map((p) => lineDist(p, line))]
  // Segments can cross the site between their points.
  for (let i = 1; i < line.length; i++) for (let j = 1; j < ring.length; j++) if (crosses(line[i - 1], line[i], ring[j - 1], ring[j])) cands.push({ d: 0, at: line[i] })
  const dist = Math.min(...cands.map((c) => c.d)), near = cands.filter((c) => c.d <= dist + 1)
  const at: Pt = [near.reduce((s, c) => s + c.at[0], 0) / near.length, near.reduce((s, c) => s + c.at[1], 0) / near.length]
  const c = centroid(outline)
  return { dist: Math.round(dist), side: compass([at[0] - c[0], at[1] - c[1]]) }
}
function crosses(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)
}

export interface Noise { name: string; kind: 'expressway' | 'major' | 'rail'; dist: number; side: string }
/**
 * Expressways, main roads and above-ground train tracks near the site, nearest first: one entry per name.
 * `within` metres of the site's edge (blocks can stand anywhere on the site, so this is the closest a block could be).
 */
export function noiseSources(a: Area, osm: AreaOsm, within = 300): Noise[] {
  const best = new Map<string, Noise>()
  const add = (n: Noise) => { const k = `${n.kind}|${n.name}`, o = best.get(k); if (n.dist <= within && (!o || n.dist < o.dist)) best.set(k, n) }
  for (const r of osm.roads ?? []) {
    // Unnamed main-road ways are slip roads and links: their road is listed under its name.
    if (r.k === 'minor' || (!r.n && r.k !== 'expressway')) continue
    add({ name: r.n ?? (r.k === 'expressway' ? 'Expressway' : 'Main road'), kind: r.k, ...lineToSite(pairs(r.p), a.outline) })
  }
  for (const r of osm.rail ?? []) {
    if (r.u) continue
    add({ name: (r.n ?? 'Railway').replace(/\s*\(.*\)$/, '') + (r.f ? ' (being built)' : ''), kind: 'rail', ...lineToSite(pairs(r.p), a.outline) })
  }
  return [...best.values()].sort((x, y) => x.dist - y.dist)
}
/** Lines running underground within `within` metres: mentioned, since they add no noise. */
export function undergroundNear(a: Area, osm: AreaOsm, within = 250): string[] {
  return [...new Set((osm.rail ?? []).filter((r) => r.u && r.n && lineToSite(pairs(r.p), a.outline).dist <= within).map((r) => r.n!.replace(/\s*\(.*\)$/, '')))]
}

export interface SchoolBand { a: Amenity; near: number; far: number; within1: 'all' | 'part' | 'none'; within2: 'all' | 'part' | 'none' }
/**
 * Primary schools within 2 km of any part of the site. Primary 1 registration gives priority to homes within
 * 1 km and 2 km; until the blocks are known, a school can be within 1 km of the whole site or only part of it.
 */
export function primarySchools(a: Area, osm: AreaOsm): SchoolBand[] {
  const band = (near: number, far: number, r: number) => far <= r ? 'all' : near <= r ? 'part' : 'none'
  return osm.amenities
    .filter((x) => x.kind === 'school' && (x.sub === 'primary' || /primary/i.test(x.name)))
    .map((x) => { const near = Math.round(edgeDist(x.at, a.outline)), far = Math.round(farDist(x.at, a.outline)); return { a: x, near, far, within1: band(near, far, 1000), within2: band(near, far, 2000) } as SchoolBand })
    .filter((s) => s.within2 !== 'none')
    .sort((x, y) => x.near - y.near)
}
