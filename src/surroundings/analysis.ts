/**
 * Surroundings analysis for one unit: where its windows are, the sun on its facade through the day,
 * how open its view is, how far it is from roads, and distances to amenities.
 * Site coordinates are metres with x east and y south; heights are metres above ground.
 */

export type Pt = [number, number]
export interface Unit { no: string; type: string; win: Pt; n: Pt }
export interface Block { id: string; storeys: number; footprint: Pt[]; units: Unit[] }
export interface Building { name: string; h: number; poly?: Pt[]; ellipse?: [number, number, number, number] }
export interface Zone { name: string; kind: 'future' | 'park'; poly: Pt[] }
export interface Road { name: string; kind: 'major' | 'minor' | 'expressway'; w: number; line: Pt[] }
export interface Amenity { name: string; kind: string; at: Pt }
export interface Site {
  id: string; name: string; town: string; source: string
  lat: number; lon: number; storeyM: number
  blocks: Block[]; buildings: Building[]; zones: Zone[]; roads: Road[]
  rail: { name: string; underground: boolean; line: Pt[] }[]
  amenities: Amenity[]
}
export interface Pick { block: string; unit: string; storey: number }

/* sun */
const rad = Math.PI / 180
/** Sun altitude and azimuth (degrees; azimuth clockwise from north) at a moment, for a place. */
export function sunPosition(date: Date, lat: number, lon: number): { alt: number; az: number } {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = (23.439 - 0.0000004 * n) * rad
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam))
  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24
  const H = (gmst * 15 + lon) * rad - ra, phi = lat * rad
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / rad + 180
  return { alt: alt / rad, az: ((az % 360) + 360) % 360 }
}
/** A Singapore clock time (UTC+8) as a Date. */
export const sgTime = (y: number, m: number, d: number, hours: number) => new Date(Date.UTC(y, m - 1, d, 0, 0) + (hours - 8) * 3600000)
/** Horizontal direction towards an azimuth, in site coordinates (north is -y). */
export const azDir = (az: number): Pt => [Math.sin(az * rad), -Math.cos(az * rad)]
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
/** Compass name for a direction in site coordinates. */
export function compass(v: Pt) {
  const a = (Math.atan2(v[0], -v[1]) / rad + 360) % 360
  return COMPASS[Math.round(a / 45) % 8]
}

/* geometry */
export function ellipsePoly(cx: number, cy: number, rx: number, ry: number, n = 24): Pt[] {
  return Array.from({ length: n }, (_, i): Pt => [cx + rx * Math.cos(2 * Math.PI * i / n), cy + ry * Math.sin(2 * Math.PI * i / n)])
}
/** Distance from a point to a segment. */
export function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
  return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), at: [a[0] + t * dx, a[1] + t * dy] as Pt }
}
export function lineDist(p: Pt, line: Pt[]) {
  let best = { d: Infinity, at: line[0] }
  for (let i = 1; i < line.length; i++) { const s = segDist(p, line[i - 1], line[i]); if (s.d < best.d) best = s }
  return best
}
/** First distance along a ray (origin o, unit direction d) where it enters a polygon, or Infinity. */
export function rayPoly(o: Pt, d: Pt, poly: Pt[]) {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1]
    const den = d[0] * ey - d[1] * ex
    if (Math.abs(den) < 1e-12) continue
    const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den, u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den
    if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t
  }
  return best
}

/* obstacles: everything that can block sun or view */
export interface Obstacle { name: string; poly: Pt[]; h: number; block?: string; assumed?: boolean }
export function obstacles(site: Site, futureStoreys: number): Obstacle[] {
  const out: Obstacle[] = site.blocks.map((b) => ({ name: 'Block ' + b.id, poly: b.footprint, h: b.storeys * site.storeyM + 2, block: b.id }))
  for (const g of site.buildings) out.push({ name: g.name, h: g.h, poly: g.poly ?? ellipsePoly(...g.ellipse!) })
  if (futureStoreys > 0) for (const z of site.zones) if (z.kind === 'future') out.push({ name: z.name, poly: z.poly, h: futureStoreys * site.storeyM, assumed: true })
  return out
}

/* the unit */
export interface UnitPos { block: Block; unit: Unit; storey: number; floorZ: number; eye: [number, number, number]; n: Pt; facing: string }
export function unitPos(site: Site, p: Pick): UnitPos | null {
  const block = site.blocks.find((b) => b.id === p.block), unit = block?.units.find((u) => u.no === p.unit)
  if (!block || !unit) return null
  const storey = Math.max(2, Math.min(block.storeys, Math.round(p.storey)))
  const floorZ = (storey - 1) * site.storeyM
  return { block, unit, storey, floorZ, eye: [unit.win[0] + unit.n[0] * 0.3, unit.win[1] + unit.n[1] * 0.3, floorZ + 1.5], n: unit.n, facing: compass(unit.n) }
}

/** Is the straight line from the eye towards the sun blocked by anything taller than the line? */
function shaded(eye: [number, number, number], dir: Pt, tanAlt: number, obs: Obstacle[]) {
  for (const o of obs) {
    const t = rayPoly([eye[0], eye[1]], dir, o.poly)
    if (t < Infinity && eye[2] + t * tanAlt < o.h) return o
  }
  return null
}

export interface SunDay { sunHours: number; afternoonHours: number; slots: { t: number; lit: boolean; why?: string }[] }
/**
 * Direct sun on the unit's main windows through a day, sampled every 10 minutes from 6:30 to 19:30
 * Singapore time: the sun must be up, in front of the facade, and not hidden behind a building.
 * "Afternoon" is after 3 pm, when the west sun heats rooms most.
 */
export function sunDay(site: Site, u: UnitPos, y: number, m: number, d: number, obs: Obstacle[]): SunDay {
  const slots: SunDay['slots'] = []
  let lit = 0, pm = 0
  for (let t = 6.5; t <= 19.5 + 1e-9; t += 1 / 6) {
    const s = sunPosition(sgTime(y, m, d, t), site.lat, site.lon)
    let on = false, why: string | undefined
    if (s.alt <= 1) why = 'Sun down'
    else {
      const dir = azDir(s.az), dot = dir[0] * u.n[0] + dir[1] * u.n[1]
      if (dot <= 0.05) why = 'Sun behind the facade'
      else { const o = shaded(u.eye, dir, Math.tan(s.alt * rad), obs); if (o) why = 'Shaded by ' + o.name; else on = true }
    }
    slots.push({ t, lit: on, ...(why ? { why } : {}) })
    if (on) { lit++; if (t >= 15) pm++ }
  }
  return { sunHours: lit / 6, afternoonHours: pm / 6, slots }
}

export interface View { openPct: number; farPct: number; nearest: { name: string; dist: number } | null; rays: { a: number; dist: number; name?: string }[] }
/**
 * How open the view is: rays at eye height across 140° in front of the window. A ray is blocked by
 * anything taller than the eye. "Open" = nothing within 100 m; "far" = nothing within 300 m.
 */
export function view(u: UnitPos, obs: Obstacle[]): View {
  const base = Math.atan2(u.n[1], u.n[0]), rays: View['rays'] = []
  let nearest: View['nearest'] = null
  for (let k = -70; k <= 70; k += 2) {
    const a = base + k * rad, dir: Pt = [Math.cos(a), Math.sin(a)]
    let dist = 1000, name: string | undefined
    for (const o of obs) {
      if (o.h <= u.eye[2]) continue
      const t = rayPoly([u.eye[0], u.eye[1]], dir, o.poly)
      if (t < dist) { dist = t; name = o.name }
    }
    rays.push({ a: k, dist, ...(name ? { name } : {}) })
    if (name && Math.abs(k) <= 20 && (!nearest || dist < nearest.dist)) nearest = { name, dist }
  }
  const pct = (m: number) => Math.round(100 * rays.filter((r) => r.dist >= m).length / rays.length)
  return { openPct: pct(100), farPct: pct(300), nearest, rays }
}

export interface RoadDist { name: string; kind: Road['kind']; dist: number; faces: boolean }
/** Distance from the window to the edge of each road (straight line, including height), and whether the window faces it. */
export function roadDistances(site: Site, u: UnitPos): RoadDist[] {
  return site.roads.map((r) => {
    const ld = lineDist([u.eye[0], u.eye[1]], r.line), flat = Math.max(0, ld.d - r.w / 2)
    const toward: Pt = [ld.at[0] - u.eye[0], ld.at[1] - u.eye[1]], L = Math.hypot(...toward) || 1
    return { name: r.name, kind: r.kind, dist: Math.round(Math.hypot(flat, u.eye[2])), faces: (toward[0] * u.n[0] + toward[1] * u.n[1]) / L > 0.3 }
  }).sort((a, b) => a.dist - b.dist)
}

export interface AmenityDist { a: Amenity; dist: number; walkMin: number }
/** Straight-line distance from the block, and a walking estimate (30% longer route at 80 m a minute). */
export function amenityDistances(site: Site, u: UnitPos): AmenityDist[] {
  const fp = u.block.footprint, c: Pt = [fp.reduce((s, p) => s + p[0], 0) / fp.length, fp.reduce((s, p) => s + p[1], 0) / fp.length]
  return site.amenities.map((a) => { const dist = Math.round(Math.hypot(a.at[0] - c[0], a.at[1] - c[1])); return { a, dist, walkMin: Math.max(1, Math.round(dist * 1.3 / 80)) } })
    .sort((p, q) => p.dist - q.dist)
}

/** The days used for a year summary. */
export const KEY_DAYS: { label: string; m: number; d: number }[] = [
  { label: 'March equinox', m: 3, d: 20 }, { label: 'June solstice', m: 6, d: 21 }, { label: 'September equinox', m: 9, d: 22 }, { label: 'December solstice', m: 12, d: 21 },
]
export function yearSun(site: Site, u: UnitPos, obs: Obstacle[], year = new Date().getFullYear()) {
  const days = KEY_DAYS.map((k) => ({ ...k, ...sunDay(site, u, year, k.m, k.d, obs) }))
  return { days, avgSun: days.reduce((s, d) => s + d.sunHours, 0) / days.length, avgAfternoon: days.reduce((s, d) => s + d.afternoonHours, 0) / days.length }
}
