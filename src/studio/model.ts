/**
 * Flat Studio design model: types, loading (with validation) and pure geometry.
 * Units are metres; x runs right and y runs down the plan.
 */
import { DTYPES, FINS, FLOORS, WALLS, WTYPES } from './catalog'

export type Pt = [number, number]

export interface Wall { id: string; x1: number; y1: number; x2: number; y2: number; fin: string; col: string; str: boolean; th: number }
export interface Room { id: string; name: string; x: number; y: number; w: number; h: number; floor: string; pts?: Pt[] }
/** A door or window in a wall: on a horizontal wall (axis 'h') at y = c, centred at x = p; on a vertical wall at x = c, y = p. */
export interface Opening {
  id: string; kind: 'door' | 'window'; axis: 'h' | 'v'; c: number; p: number; w: number
  /** Which side of the wall a door swings to, or a bay window projects to. */
  flip: 1 | -1; wt: string; dt: string
}
export interface Item {
  id: string; type: string; x: number; y: number; rot: number; w: number; d: number; color: string
  /** Group id (0 = none). */
  g: string | number
  /** Height, for imported models. */
  h: number
  /** Material finish ('' = plain). */
  mt: string
  /** Product name and the user's own price. */
  nm: string; pr: number
}
export interface Dim { id: string; x1: number; y1: number; x2: number; y2: number; o: number }
export interface View { id: string; n: string; m: 'walk' | 'orbit'; a: number[] }
export interface Extra { id: string; name: string; amt: number }
/** The layout as handed over, for the Checks tab. */
export interface Base {
  t: number
  walls: { x1: number; y1: number; x2: number; y2: number; str: boolean }[]
  wet: { type: string; x: number; y: number }[]
  ops: { axis: 'h' | 'v'; c: number; p: number; w: number; kind: 'door' | 'window' }[]
}
export interface Design {
  name: string; H: number; wallColor: string
  walls: Wall[]; rooms: Room[]; openings: Opening[]; items: Item[]; dims: Dim[]; views: View[]
  layers: Record<string, number>
  prices: Record<string, number>; extras: Extra[]; budget: number
  cid: string; base: Base | null
  skirt: boolean; skirtCol: string; ceilCol: string
}

/* ids */
let uidn = 1
export const uid = () => 'n' + (uidn++)
/** Make sure new ids don't clash with ids already in a design. */
export function bumpIds(ids: string[]) {
  let m = 0
  for (const id of ids) { const k = +String(id).replace(/\D/g, ''); if (k > m) m = k }
  uidn = Math.max(uidn, m + 1)
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
/** Snap to a grid (default 10 cm). */
export const sn = (v: number, g = 0.1) => +(Math.round(v / g) * g).toFixed(3)

/**
 * Read a design from untrusted JSON (a saved file, a share link, localStorage): fills defaults,
 * drops invalid entries and clamps sizes. `itemDefaults` gives an item type's default size and colour,
 * or undefined to drop items of a type that can't be shown.
 */
export function loadState(o: any, itemDefaults: (raw: any) => { w: number; d: number; c: string } | undefined): Design {
  const num = (v: unknown) => +(v as number)
  const n: Design = {
    name: String(o.name || 'My flat').slice(0, 60), H: clamp(+o.H || 2.6, 2.2, 3.2), wallColor: o.wallColor || WALLS[0],
    walls: (o.walls || []).map((w: any) => ({ id: w.id || uid(), x1: num(w.x1), y1: num(w.y1), x2: num(w.x2), y2: num(w.y2), fin: (FINS as Record<string, string>)[w.fin] ? w.fin : 'paint', col: typeof w.col === 'string' ? w.col : '', str: !!w.str, th: (+w.th >= 0.06 && +w.th <= 0.4) ? +(+w.th).toFixed(3) : 0 }))
      .filter((w: Wall) => [w.x1, w.y1, w.x2, w.y2].every(isFinite) && Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 0.05),
    rooms: (o.rooms || []).map((r: any) => {
      const q: Room = { id: r.id || uid(), name: String(r.name || 'Room').slice(0, 40), x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h), floor: (FLOORS as Record<string, unknown>)[r.floor] ? r.floor : 'oak' }
      if (Array.isArray(r.pts) && r.pts.length >= 3) {
        const p: Pt[] = r.pts.map((a: any) => [+a[0], +a[1]])
        if (p.every((a) => isFinite(a[0]) && isFinite(a[1]))) { q.pts = p; syncBox(q) }
      }
      return q
    }).filter((r: Room) => [r.x, r.y, r.w, r.h].every(isFinite) && r.w > 0 && r.h > 0),
    dims: (o.dims || []).map((d: any) => ({ id: d.id || uid(), x1: num(d.x1), y1: num(d.y1), x2: num(d.x2), y2: num(d.y2), o: isFinite(+d.o) ? +d.o : 0.5 }))
      .filter((d: Dim) => [d.x1, d.y1, d.x2, d.y2].every(isFinite) && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 0.05),
    views: (Array.isArray(o.views) ? o.views : []).filter((v: any) => v && Array.isArray(v.a)).slice(0, 24)
      .map((v: any) => ({ id: v.id || uid(), n: String(v.n || 'View').slice(0, 40), m: v.m === 'walk' ? 'walk' : 'orbit', a: [0, 1, 2, 3, 4].map((i) => +(+v.a[i] || 0).toFixed(3)) })),
    layers: Object.assign({ furn: 1, labels: 1, dims: 1, grid: 1 }, o.layers || {}),
    prices: Object.fromEntries(Object.entries(o.prices || {}).filter(([, v]) => typeof v === 'number' && isFinite(v) && v >= 0)) as Record<string, number>,
    extras: (o.extras || []).map((x: any) => ({ id: x.id || uid(), name: String(x.name || '').slice(0, 40), amt: Math.max(0, +x.amt || 0) })),
    budget: Math.max(0, +o.budget || 0), cid: typeof o.cid === 'string' ? o.cid : '',
    base: o.base && typeof o.base === 'object' ? o.base : null,
    skirt: !!o.skirt, skirtCol: typeof o.skirtCol === 'string' ? o.skirtCol : '#f4f2ee', ceilCol: typeof o.ceilCol === 'string' ? o.ceilCol : '#f8f7f4',
    openings: (o.openings || []).map((p: any) => ({ id: p.id || uid(), kind: p.kind === 'window' ? 'window' : 'door', axis: p.axis === 'v' ? 'v' : 'h', c: num(p.c), p: num(p.p), w: clamp(+p.w || 0.9, 0.4, 5), flip: p.flip === undefined ? -1 : (p.flip < 0 ? -1 : 1), wt: (WTYPES as Record<string, unknown>)[p.wt] ? p.wt : 'std', dt: (DTYPES as Record<string, unknown>)[p.dt] ? p.dt : 'single' }))
      .filter((p: Opening) => isFinite(p.c) && isFinite(p.p)),
    items: (o.items || []).flatMap((i: any) => {
      const k = i && typeof i.type === 'string' ? itemDefaults(i) : undefined
      return k ? [{ i, k }] : []
    }).map(({ i, k }: { i: any; k: { w: number; d: number; c: string } }) => ({
      id: i.id || uid(), type: i.type, x: num(i.x), y: num(i.y), rot: +i.rot || 0, w: clamp(+i.w || k.w, 0.1, 8), d: clamp(+i.d || k.d, 0.1, 8), color: i.color || k.c, g: i.g || 0, h: +i.h > 0 ? +i.h : 0,
      mt: ['wood', 'fabric', 'leather', 'metal', 'gloss'].includes(i.mt) ? i.mt : '', nm: typeof i.nm === 'string' ? i.nm.slice(0, 40) : '', pr: (+i.pr > 0 && +i.pr < 1e7) ? +(+i.pr).toFixed(2) : 0,
    })).filter((i: Item) => isFinite(i.x) && isFinite(i.y)),
  }
  bumpIds([...n.walls, ...n.rooms, ...n.openings, ...n.items, ...n.dims].map((e) => e.id))
  return n
}

/* rooms */
export const rpts = (r: Room): Pt[] => r.pts || [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]
export function rarea(r: Pick<Room, 'w' | 'h' | 'pts'>): number {
  if (!r.pts) return r.w * r.h
  let a = 0
  const p = r.pts
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1] }
  return Math.abs(a) / 2
}
export function syncBox(r: Room) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  r.pts!.forEach((q) => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]) })
  r.x = x0; r.y = y0; r.w = x1 - x0; r.h = y1 - y0
}
/** Centroid (falls back to the box centre for degenerate polygons). */
export function rcent(r: Room) {
  const p = rpts(r)
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length], f = p[i][0] * q[1] - q[0] * p[i][1]; a += f; cx += (p[i][0] + q[0]) * f; cy += (p[i][1] + q[1]) * f }
  if (Math.abs(a) < 1e-6) return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}
/** Point in polygon. */
export function pip(x: number, y: number, p: Pt[]) {
  let c = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c
  }
  return c
}
/** Douglas-Peucker simplification. */
export function dpSimp(p: Pt[], eps: number): Pt[] {
  if (p.length < 3) return p
  const a = p[0], b = p[p.length - 1]
  let md = -1, mi = 0
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((p[i][0] - a[0]) * dy - (p[i][1] - a[1]) * dx) / L; if (d > md) { md = d; mi = i } }
  if (md > eps) { const l = dpSimp(p.slice(0, mi + 1), eps), r = dpSimp(p.slice(mi), eps); return l.slice(0, -1).concat(r) }
  return [a, b]
}

/* walls */
export const DEFAULT_TH = 0.12
export interface WallInfo {
  axis: 'h' | 'v' | 'a'
  /** Extent along the wall (a..b) and position across it (c), for straight walls. */
  a: number; b: number; c: number
  /** Openings in the wall, and the solid stretches between them (including half the thickness at each end). */
  ops: Opening[]; segs: [number, number][]
  th: number
  /** Angled walls only. */
  ang?: number; len?: number
}
export function wallInfo(w: Wall, openings: Opening[]): WallInfo {
  const T = w.th || DEFAULT_TH
  if (w.x1 !== w.x2 && w.y1 !== w.y2) {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy)
    return { axis: 'a', a: 0, b: len, c: 0, ops: [], segs: [[-T / 2, len + T / 2]], ang: Math.atan2(dy, dx), len, th: T }
  }
  const axis = w.y1 === w.y2 ? 'h' : 'v'
  const a = axis === 'h' ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2), b = axis === 'h' ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2), c = axis === 'h' ? w.y1 : w.x1
  const ops = openings.filter((o) => o.axis === axis && Math.abs(o.c - c) < 0.011 && o.p > a - 0.01 && o.p < b + 0.01).sort((m, n) => m.p - n.p)
  const segs: [number, number][] = []
  let cur = a - T / 2
  for (const o of ops) { const lo = o.p - o.w / 2, hi = o.p + o.w / 2; if (lo > cur + 1e-4) segs.push([cur, lo]); cur = Math.max(cur, hi) }
  if (b + T / 2 > cur + 1e-4) segs.push([cur, b + T / 2])
  return { axis, a, b, c, ops, segs, th: T }
}
export function bounds(S: Pick<Design, 'walls' | 'rooms'>) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  S.walls.forEach((w) => { add(w.x1, w.y1); add(w.x2, w.y2) })
  S.rooms.forEach((r) => { add(r.x, r.y); add(r.x + r.w, r.y + r.h) })
  if (x0 > 1e8) { x0 = y0 = 0; x1 = y1 = 6 }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}
/** Drop openings that no longer sit on any wall. */
export function pruneOps(S: Design) {
  S.openings = S.openings.filter((o) => S.walls.some((w) => {
    const wi = wallInfo(w, S.openings)
    return wi.axis === o.axis && Math.abs(wi.c - o.c) < 0.011 && o.p > wi.a - 0.01 && o.p < wi.b + 0.01
  }))
}
/** How much of wall `b` (0–1) is still covered by `walls` (straight walls compare overlap; angled walls must match end to end). */
export function wallCover(b: Base['walls'][number], walls: Base['walls']): number {
  const L = Math.hypot(b.x2 - b.x1, b.y2 - b.y1)
  if (L < 1e-6) return 1
  if (b.x1 !== b.x2 && b.y1 !== b.y2) {
    return walls.some((w) => (Math.hypot(w.x1 - b.x1, w.y1 - b.y1) < 0.12 && Math.hypot(w.x2 - b.x2, w.y2 - b.y2) < 0.12) || (Math.hypot(w.x1 - b.x2, w.y1 - b.y2) < 0.12 && Math.hypot(w.x2 - b.x1, w.y2 - b.y1) < 0.12)) ? 1 : 0
  }
  const hz = b.y1 === b.y2, a0 = hz ? Math.min(b.x1, b.x2) : Math.min(b.y1, b.y2), a1 = hz ? Math.max(b.x1, b.x2) : Math.max(b.y1, b.y2), c = hz ? b.y1 : b.x1, iv: [number, number][] = []
  for (const w of walls) {
    if (w.x1 !== w.x2 && w.y1 !== w.y2) continue
    const wh = w.y1 === w.y2
    if (wh !== hz) continue
    if (Math.abs((wh ? w.y1 : w.x1) - c) > 0.06) continue
    const s = Math.max(a0, wh ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2)), e = Math.min(a1, wh ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2))
    if (e > s) iv.push([s, e])
  }
  iv.sort((p, q) => p[0] - q[0])
  let tot = 0, cur = a0
  for (const [s, e] of iv) { const s2 = Math.max(s, cur); if (e > s2) { tot += e - s2; cur = e } }
  return tot / (a1 - a0)
}

/* items */
/** An item's footprint corners. */
export const itemPoly = (it: Pick<Item, 'x' | 'y' | 'w' | 'd' | 'rot'>): Pt[] => {
  const a = it.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([qx, qy]) => [it.x + qx * it.w / 2 * c - qy * it.d / 2 * s, it.y + qx * it.w / 2 * s + qy * it.d / 2 * c])
}
/** Do two convex quads overlap by more than 3 cm (separating axis test)? */
export function polyOverlap(A: Pt[], B: Pt[]) {
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const q = P[(i + 1) % 4], nx = -(q[1] - P[i][1]), ny = q[0] - P[i][0]
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9
    for (const p of A) { const d = p[0] * nx + p[1] * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d) }
    for (const p of B) { const d = p[0] * nx + p[1] * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d) }
    const L = Math.hypot(nx, ny) || 1
    if (a1 / L <= b0 / L + 0.03 || b1 / L <= a0 / L + 0.03) return false
  }
  return true
}

/* whole-design operations */
/** The current layout as the "original" for the Checks tab. */
export function snapBase(S: Design, isWet: (type: string) => boolean): Base {
  return {
    t: Date.now(),
    walls: S.walls.map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, str: !!w.str })),
    wet: S.items.filter((i) => isWet(i.type)).map((i) => ({ type: i.type, x: i.x, y: i.y })),
    ops: S.openings.map((o) => ({ axis: o.axis, c: o.c, p: o.p, w: o.w, kind: o.kind })),
  }
}
/** Flip the design left to right in place (many HDB units are mirror images of the brochure layout). False if empty. */
export function mirrorDesign(S: Design): boolean {
  const xs = S.walls.flatMap((w) => [w.x1, w.x2]).concat(S.rooms.flatMap((r) => [r.x, r.x + r.w]))
  if (!xs.length) return false
  const M = Math.min(...xs) + Math.max(...xs), X = (x: number) => +(M - x).toFixed(3)
  S.walls.forEach((w) => { w.x1 = X(w.x1); w.x2 = X(w.x2) })
  S.rooms.forEach((r) => { if (r.pts) { r.pts = r.pts.map((q): Pt => [X(q[0]), q[1]]).reverse(); syncBox(r) } else r.x = X(r.x + r.w) })
  S.openings.forEach((o) => { if (o.axis === 'h') o.p = X(o.p); else { o.c = X(o.c); o.flip = o.flip === 1 ? -1 : 1 } })
  S.items.forEach((i) => { i.x = X(i.x); i.rot = (360 - i.rot) % 360 })
  S.dims.forEach((d) => { d.x1 = X(d.x1); d.x2 = X(d.x2); d.o = -d.o })
  if (S.base) {
    S.base.walls.forEach((w) => { w.x1 = X(w.x1); w.x2 = X(w.x2) })
    S.base.wet.forEach((w) => { w.x = X(w.x) })
    S.base.ops.forEach((o) => { if (o.axis === 'h') o.p = X(o.p); else o.c = X(o.c) })
  }
  return true
}
