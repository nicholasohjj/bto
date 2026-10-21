/**
 * Wall elevations: each room wall seen from inside the room, drawn the way a carpenter or contractor
 * quotes from. Openings with sill and head heights, carpentry with its doors, drawers, plinth and
 * worktop, wall-mounted services at their heights, false ceilings, tiled finishes and skirting,
 * and dimension chains in millimetres.
 */
import { WTYPES } from './catalog'
import { ceilOf } from './ceiling'
import { cfgOf, leaves, type CarpCfg } from './carpentry'
import { pip, rpts, type Design, type Item } from './model'

/** Door heights, metres (as built in 3D). */
export const DOOR_H = 2.05, ARCH_H = 2.3
/** Skirting height when the design has skirting, metres. */
const SKIRT_H = 0.1
/** Worktop thickness above a carpentry unit, metres. */
const TOP_T = 0.04

export interface CatLite { [type: string]: { n: string; k?: number; carp?: number; svc?: number; flat?: number; top?: number; lamp?: number; elev?: number } | undefined }

export interface ElevOpening { u: number; w: number; kind: 'door' | 'window'; z0: number; z1: number; dt: string; wt: string }
export interface ElevItem {
  u1: number; u2: number; z0: number; z1: number
  /** Distance from the wall to the item's back, metres. */
  d: number
  c: string; n: string
  kind: 'carp' | 'svc' | 'furn'
  /** Against the wall (within 20 cm; rooms are often drawn to wall centrelines): drawn solid. */
  on: boolean
  /** Built in (dimensioned along the wall). */
  built: boolean
  /** Front faces the viewer (otherwise it is seen from the side or back). */
  front: boolean
  cfg?: CarpCfg; type: string
}
export interface ElevPanel {
  /** Letter for cross-referencing (A, B, …). */
  id: string
  room: string; roomId: string; facing: string
  title: string
  L: number; H: number
  ops: ElevOpening[]; its: ElevItem[]
  /** Wall finish ('paint', 'tile', …) and false ceiling drop (0 = none). */
  fin: string; drop: number; box: boolean; cove: boolean
  skirt: boolean
}

const compass = (fx: number, fy: number) => Math.abs(fx) < 0.25 ? (fy < 0 ? 'north' : 'south') : Math.abs(fy) < 0.25 ? (fx > 0 ? 'east' : 'west') : 'angled'
const letter = (i: number): string => (i >= 26 ? letter(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26))

/** Item corner points in plan. */
function corners(it: Pick<Item, 'x' | 'y' | 'w' | 'd' | 'rot'>) {
  const a = it.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([qx, qy]) => [it.x + qx * it.w / 2 * c - qy * it.d / 2 * s, it.y + qx * it.w / 2 * s + qy * it.d / 2 * c])
}

/**
 * One panel per room wall at least 60 cm long. `zRange` gives an item's bottom and top above the
 * floor (from the 3D model); carpentry uses its own settings instead.
 */
export function elevPanels(S: Design, cat: CatLite, zRange: (it: Item) => [number, number], rooms?: Set<string>): ElevPanel[] {
  const out: ElevPanel[] = []
  for (const r of S.rooms) {
    const P = rpts(r), ce = ceilOf(r)
    for (let i = 0; i < P.length; i++) {
      const A = P[i], B = P[(i + 1) % P.length], L = Math.hypot(B[0] - A[0], B[1] - A[1])
      if (L < 0.6) continue
      const ex = (B[0] - A[0]) / L, ey = (B[1] - A[1]) / L
      let nx = ey, ny = -ex
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2
      if (!pip(mx + nx * 0.1, my + ny * 0.1, P)) { nx = -nx; ny = -ny }
      // u runs left to right as seen from inside the room, D is the distance into the room.
      const rx = ny, ry = -nx, u0 = Math.min(A[0] * rx + A[1] * ry, B[0] * rx + B[1] * ry), d0 = A[0] * nx + A[1] * ny
      const U = (x: number, y: number) => x * rx + y * ry - u0, D = (x: number, y: number) => x * nx + y * ny - d0
      const ops: ElevOpening[] = []
      for (const o of S.openings) {
        const M = o.axis === 'h' ? [o.p, o.c] : [o.c, o.p]
        if (Math.abs(D(M[0], M[1])) >= 0.08) continue
        const u = U(M[0], M[1])
        if (u <= -0.05 || u >= L + 0.05) continue
        if (o.kind === 'door') ops.push({ u, w: o.w, kind: 'door', z0: 0, z1: Math.min(o.dt === 'arch' ? ARCH_H : DOOR_H, S.H), dt: o.dt, wt: o.wt })
        else { const wt = WTYPES[o.wt as keyof typeof WTYPES] || WTYPES.std, z1 = Math.min(wt.sill + wt.wh, S.H - 0.1); ops.push({ u, w: o.w, kind: 'window', z0: wt.sill, z1, dt: o.dt, wt: o.wt }) }
      }
      ops.sort((a, b) => a.u - b.u)
      const its: ElevItem[] = []
      for (const it of S.items) {
        const k = cat[it.type]
        if (!k || k.flat) continue
        let u1 = 1e9, u2 = -1e9, d1 = 1e9, d2 = -1e9
        for (const [px, py] of corners(it)) { const uu = U(px, py), dd = D(px, py); u1 = Math.min(u1, uu); u2 = Math.max(u2, uu); d1 = Math.min(d1, dd); d2 = Math.max(d2, dd) }
        if (!(d2 > -0.05 && d1 < 1.0 && u2 > 0.05 && u1 < L - 0.05)) continue
        // Only things inside this room (the wall's other side belongs to the next room).
        if (!pip(it.x, it.y, P) && d1 < -0.02) continue
        // Fronts face local +y: (-sin, cos) in plan. Facing the viewer means facing into the room.
        const a = it.rot * Math.PI / 180, front = -Math.sin(a) * nx + Math.cos(a) * ny > 0.7
        const kind: ElevItem['kind'] = k.carp ? 'carp' : k.svc ? 'svc' : 'furn'
        let z0: number, z1: number, cfg: CarpCfg | undefined
        if (kind === 'carp') { cfg = cfgOf(it); z0 = cfg.elev; z1 = Math.min(S.H, cfg.elev + cfg.h + (cfg.top !== 'none' ? TOP_T : 0)) }
        else[z0, z1] = zRange(it)
        // Services face the wall they sit on: skip ones on the other walls of the room.
        if (kind === 'svc' && (d1 > 0.2 || !front)) continue
        its.push({ u1: Math.max(0, u1), u2: Math.min(L, u2), z0, z1, d: Math.max(0, d1), c: it.color, n: it.nm || k.n, kind, on: d1 < 0.2, built: !!(k.carp || k.k), front, cfg, type: it.type })
      }
      // Wall finish: the drawn wall that lies along this edge.
      const wall = S.walls.find((w) => { const a = D(w.x1, w.y1), b = D(w.x2, w.y2); if (Math.abs(a) > 0.15 || Math.abs(b) > 0.15) return false; const p = U(w.x1, w.y1), q = U(w.x2, w.y2); return Math.min(Math.max(p, q), L) - Math.max(Math.min(p, q), 0) > 0.3 })
      const facing = compass(-nx, -ny)
      out.push({ id: '', room: r.name, roomId: r.id, facing, title: `${r.name}, ${facing} wall`, L, H: S.H, ops, its, fin: wall?.fin || 'paint', drop: ce.type === 'none' ? 0 : ce.drop, box: ce.type === 'box', cove: ce.cove, skirt: !!S.skirt })
    }
  }
  // Letters run through the whole flat, so a wall keeps its letter on every sheet.
  out.forEach((p, i) => { p.id = letter(i) })
  return rooms ? out.filter((p) => rooms.has(p.roomId)) : out
}

/** Break points along one axis, without near-duplicates (under 1 cm apart). */
export function chain(points: number[], lo: number, hi: number): number[] {
  const v = [lo, hi, ...points.filter((p) => p > lo + 0.01 && p < hi - 0.01)].sort((a, b) => a - b), out: number[] = []
  for (const p of v) if (!out.length || p - out[out.length - 1] >= 0.01) out.push(p)
  if (hi - out[out.length - 1] < 0.01 && out[out.length - 1] !== hi) out[out.length - 1] = hi
  return out
}
const mm = (m: number) => String(Math.round(m * 1000))

/** Horizontal break points: wall ends, opening edges and the edges of carpentry against the wall. */
export function hChain(p: ElevPanel) {
  const pts: number[] = []
  for (const o of p.ops) pts.push(o.u - o.w / 2, o.u + o.w / 2)
  for (const it of p.its) if (it.built && it.on) pts.push(it.u1, it.u2)
  return chain(pts, 0, p.L)
}
/** Vertical break points: floor, ceiling, sills, heads, carpentry bottoms and tops, false ceiling. */
export function vChain(p: ElevPanel) {
  const pts: number[] = []
  for (const o of p.ops) pts.push(o.z0, o.z1)
  for (const it of p.its) if (it.built && it.on) pts.push(it.z0, it.z1)
  if (p.drop) pts.push(p.H - p.drop)
  return chain(pts, 0, p.H)
}

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const INK = '#14242a', INK2 = '#54686f', DIM = '#2f6f7a'
const f3 = (v: number) => +v.toFixed(3)

/** A dimension chain: ticks at each break, each span labelled in mm. Horizontal at height y, or vertical at x. */
function dimLine(pts: number[], at: number, vertical: boolean, H: number, fs: number) {
  if (pts.length < 2) return ''
  const P = (a: number, b: number) => vertical ? `${f3(b)} ${f3(H - a)}` : `${f3(a)} ${f3(b)}`
  let s = `<path d="M${P(pts[0], at)}L${P(pts[pts.length - 1], at)}${pts.map((q) => `M${P(q, at - 0.06)}L${P(q, at + 0.06)}M${vertical ? `${f3(at - 0.035)} ${f3(H - q + 0.035)}L${f3(at + 0.035)} ${f3(H - q - 0.035)}` : `${f3(q - 0.035)} ${f3(at + 0.035)}L${f3(q + 0.035)} ${f3(at - 0.035)}`}`).join('')}" stroke="${DIM}" stroke-width=".008" fill="none"/>`
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], span = b - a
    if (span < 0.012) continue
    const mid = (a + b) / 2, t = mm(span), small = span < t.length * fs * 0.62
    if (vertical) s += `<text transform="translate(${f3(at - 0.04 - (small ? 0.12 : 0))} ${f3(H - mid)}) rotate(-90)" font-size="${fs}" text-anchor="middle" fill="${DIM}">${t}</text>`
    else s += `<text x="${f3(mid)}" y="${f3(at - 0.04 - (small && i % 2 ? fs * 1.2 : 0))}" font-size="${fs}" text-anchor="middle" fill="${DIM}">${t}</text>`
  }
  return s
}

/** Carpentry front: door leaves, drawers, plinth, worktop, handles and open shelving. */
function carpSvg(it: ElevItem, H: number) {
  const c = it.cfg!, w = it.u2 - it.u1, x0 = it.u1, sk = `stroke="${INK}"`
  const pl = c.plinth && c.elev < 0.05 ? 0.1 : 0, b0 = c.elev + pl, top = c.elev + c.h, bh = top - b0
  const Y = (z: number) => f3(H - z)
  let s = `<rect x="${f3(x0)}" y="${Y(top)}" width="${f3(w)}" height="${f3(c.h - pl)}" fill="${it.c}" fill-opacity=".55" ${sk} stroke-width=".014"/>`
  if (pl) s += `<rect x="${f3(x0 + 0.01)}" y="${Y(b0)}" width="${f3(w - 0.02)}" height="${f3(pl)}" fill="#3b3e40" fill-opacity=".5" ${sk} stroke-width=".008"/>`
  if (c.top !== 'none') s += `<rect x="${f3(x0 - 0.01)}" y="${Y(top + TOP_T)}" width="${f3(w + 0.02)}" height="${TOP_T}" fill="${c.topCol}" ${sk} stroke-width=".01"/>`
  if (it.type === 'cdesk') {
    s += `<line x1="${f3(x0)}" y1="${Y(1.35)}" x2="${f3(x0 + w)}" y2="${Y(1.35)}" ${sk} stroke-width=".012"/><line x1="${f3(x0)}" y1="${Y(1.7)}" x2="${f3(x0 + w)}" y2="${Y(1.7)}" ${sk} stroke-width=".012"/>`
    return s
  }
  const n = leaves(w, c), lw = w / n
  const handle = (x: number, z: number, horiz: boolean) => {
    if (c.handle === 'push' || c.doors === 'open') return ''
    if (c.handle === 'knob') return `<circle cx="${f3(x)}" cy="${Y(z)}" r=".015" fill="${INK2}"/>`
    const hl = horiz ? Math.min(0.3, lw * 0.5) : Math.min(0.3, bh * 0.4)
    return horiz ? `<line x1="${f3(x - hl / 2)}" y1="${Y(z)}" x2="${f3(x + hl / 2)}" y2="${Y(z)}" stroke="${INK2}" stroke-width=".014"/>` : `<line x1="${f3(x)}" y1="${Y(z - hl / 2)}" x2="${f3(x)}" y2="${Y(z + hl / 2)}" stroke="${INK2}" stroke-width=".014"/>`
  }
  if (c.doors === 'open' || c.doors === 'glass') {
    const rows = Math.max(1, Math.floor(bh / 0.35))
    for (let j = 1; j < rows; j++) s += `<line x1="${f3(x0 + 0.02)}" y1="${Y(b0 + j * bh / rows)}" x2="${f3(x0 + w - 0.02)}" y2="${Y(b0 + j * bh / rows)}" stroke="${INK2}" stroke-width=".01"/>`
  }
  if (c.doors === 'drawers') {
    const rows = Math.max(1, Math.min(6, Math.round(bh / 0.2)))
    for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
      const x = x0 + lw * i, z = b0 + bh * j / rows
      s += `<rect x="${f3(x + 0.004)}" y="${Y(z + bh / rows - 0.004)}" width="${f3(lw - 0.008)}" height="${f3(bh / rows - 0.008)}" fill="none" ${sk} stroke-width=".008"/>${handle(x + lw / 2, z + bh / rows * 0.75, true)}`
    }
  } else if (c.doors !== 'open') {
    for (let i = 0; i < n; i++) {
      const x = x0 + lw * i
      s += `<rect x="${f3(x + 0.004)}" y="${Y(top - 0.004)}" width="${f3(lw - 0.008)}" height="${f3(bh - 0.008)}" fill="${c.doors === 'glass' ? '#cfe6ee' : 'none'}" fill-opacity=".5" ${sk} stroke-width=".008"/>`
      if (c.doors === 'swing' || c.doors === 'glass') {
        // Hinge side: the opening triangle points to the hinges, as on joinery drawings.
        const hingeL = i % 2 === 0, hx = hingeL ? x + 0.01 : x + lw - 0.01, ox = hingeL ? x + lw - 0.01 : x + 0.01
        s += `<path d="M${f3(ox)} ${Y(top - 0.01)}L${f3(hx)} ${Y(b0 + bh / 2)}L${f3(ox)} ${Y(b0 + 0.01)}" fill="none" stroke="${INK2}" stroke-width=".006" stroke-dasharray=".03 .02"/>`
        s += handle(hingeL ? x + lw - 0.05 : x + 0.05, bh > 1.2 ? b0 + Math.min(1.1, bh / 2) : top - 0.08, false)
      } else if (c.doors === 'lift') s += handle(x + lw / 2, b0 + 0.05, true)
      else if (c.doors === 'slide') { s += `<path d="M${f3(x + lw * 0.3)} ${Y(b0 + bh / 2)}h${f3(lw * 0.4)}m-.04 -.025l.04 .025l-.04 .025" fill="none" stroke="${INK2}" stroke-width=".008"/>` }
    }
  }
  return s
}

/** Symbol for a wall-mounted service point, with its height above the floor in mm. */
function svcSvg(it: ElevItem, H: number, fs: number) {
  const x = (it.u1 + it.u2) / 2, z = (it.z0 + it.z1) / 2, y = f3(H - z)
  const tag = it.type === 'socket' ? 'S' : it.type === 'sw1' ? 'SW' : it.type === 'datapt' ? 'D' : it.type === 'acpt' ? 'AC' : it.type === 'wpoint' ? 'W' : it.n.slice(0, 2).toUpperCase()
  return `<rect x="${f3(x - 0.045)}" y="${f3(+y - 0.045)}" width=".09" height=".09" fill="#fff" stroke="${INK}" stroke-width=".01"/><text x="${f3(x)}" y="${f3(+y + 0.022)}" font-size="${fs * 0.7}" text-anchor="middle" font-weight="bold" fill="${INK}">${tag}</text><text x="${f3(x + 0.06)}" y="${f3(+y - 0.06)}" font-size="${fs * 0.8}" fill="${DIM}">${mm(z)}</text>`
}

/** One wall drawn at metre units with its top-left at (ox, oy). */
export function elevPanelSvg(p: ElevPanel, ox: number, oy: number) {
  const { H, L } = p, sk = `stroke="${INK}"`, fs = 0.085, Y = (z: number) => f3(H - z)
  let s = `<g transform="translate(${ox} ${oy})" font-family="Arial,Helvetica,sans-serif">`
  s += `<circle cx=".14" cy="-.3" r=".13" fill="${INK}"/><text x=".14" y="-.255" font-size=".13" font-weight="bold" text-anchor="middle" fill="#fff">${esc(p.id)}</text><text x=".34" y="-.25" font-size=".17" font-weight="bold" fill="${INK}">${esc(p.title)}</text>`
  s += `<rect x="0" y="0" width="${f3(L)}" height="${f3(H)}" fill="#fafafa"/>`
  // Tiled walls: a 600 mm tile grid.
  if (p.fin === 'tile') {
    let g = ''
    for (let x = 0.6; x < L; x += 0.6) g += `M${f3(x)} 0V${f3(H)}`
    for (let z = 0.6; z < H; z += 0.3) g += `M0 ${Y(z)}H${f3(L)}`
    s += `<path d="${g}" stroke="#c4cdd0" stroke-width=".006" fill="none"/>`
  } else if (p.fin === 'wood') {
    let g = ''
    for (let x = 0.15; x < L; x += 0.15) g += `M${f3(x)} 0V${f3(H)}`
    s += `<path d="${g}" stroke="#d8cbb8" stroke-width=".006" fill="none"/>`
  }
  if (p.skirt) s += `<line x1="0" y1="${Y(SKIRT_H)}" x2="${f3(L)}" y2="${Y(SKIRT_H)}" stroke="${INK2}" stroke-width=".008"/>`
  // False ceiling: the drop line, hatched above.
  if (p.drop) {
    const zc = H - p.drop
    s += `<rect x="0" y="0" width="${f3(L)}" height="${f3(p.drop)}" fill="#e9eded"/><line x1="0" y1="${Y(zc)}" x2="${f3(L)}" y2="${Y(zc)}" ${sk} stroke-width=".012" stroke-dasharray=".08 .04"/>`
    s += `<text x=".08" y="${f3(p.drop / 2 + 0.03)}" font-size="${fs}" fill="${INK2}">${p.box ? 'Ceiling box' : 'False ceiling'}${p.cove ? ' with cove light' : ''}</text>`
  }
  for (const o of p.ops) {
    const x0 = f3(o.u - o.w / 2)
    if (o.kind === 'door') {
      s += `<rect x="${x0}" y="${Y(o.z1)}" width="${f3(o.w)}" height="${f3(o.z1)}" fill="${o.dt === 'arch' ? '#fff' : '#e6dccb'}" ${sk} stroke-width=".018"/>`
      if (o.dt === 'double') s += `<line x1="${f3(o.u)}" y1="${Y(o.z1)}" x2="${f3(o.u)}" y2="${Y(0)}" ${sk} stroke-width=".012"/>`
      if (o.dt === 'slide') s += `<path d="M${f3(o.u - o.w * 0.2)} ${Y(1.05)}h${f3(o.w * 0.4)}m-.05 -.03l.05 .03l-.05 .03" fill="none" stroke="${INK2}" stroke-width=".01"/>`
      s += `<text x="${f3(o.u)}" y="${Y(o.z1 / 2)}" font-size="${fs}" text-anchor="middle" fill="${INK2}">${o.dt === 'arch' ? 'Opening' : 'Door'}</text>`
    } else {
      s += `<rect x="${x0}" y="${Y(o.z1)}" width="${f3(o.w)}" height="${f3(o.z1 - o.z0)}" fill="#cfe6ee" ${sk} stroke-width=".018"/>`
      if (o.w > 1.4 || o.wt === 'slide') s += `<line x1="${f3(o.u)}" y1="${Y(o.z1)}" x2="${f3(o.u)}" y2="${Y(o.z0)}" ${sk} stroke-width=".01"/>`
    }
  }
  // Loose furniture: further from the wall drawn first and lighter; things in front are dashed.
  for (const it of p.its.filter((i) => i.kind === 'furn').sort((a, b) => b.d - a.d)) {
    s += `<rect x="${f3(it.u1)}" y="${Y(it.z1)}" width="${f3(it.u2 - it.u1)}" height="${f3(it.z1 - it.z0)}" fill="${it.c}" fill-opacity="${it.on ? 0.7 : 0.35}" ${sk} stroke-width=".01"${it.on ? '' : ' stroke-dasharray=".04 .03"'}/>`
    if (it.u2 - it.u1 > 0.45 && it.z1 - it.z0 > 0.18) s += `<text x="${f3((it.u1 + it.u2) / 2)}" y="${Y((it.z0 + it.z1) / 2 - 0.03)}" font-size="${fs}" text-anchor="middle" fill="${INK}">${esc(it.n)}</text>`
  }
  for (const it of p.its.filter((i) => i.kind === 'carp')) {
    // Seen side-on or from behind: just its outline.
    s += it.front ? carpSvg(it, H) : `<rect x="${f3(it.u1)}" y="${Y(it.z1)}" width="${f3(it.u2 - it.u1)}" height="${f3(it.z1 - it.z0)}" fill="${it.c}" fill-opacity=".45" ${sk} stroke-width=".012"/>`
    // Label above the unit, or just inside its top when it reaches the ceiling.
    const inside = it.z1 > H - p.drop - 0.15
    if (it.front && it.u2 - it.u1 > 0.5) s += `<text x="${f3((it.u1 + it.u2) / 2)}" y="${f3(inside ? H - it.z1 + 0.13 : H - it.z1 - 0.05)}" font-size="${fs}" text-anchor="middle" fill="${INK}" font-weight="bold"${inside ? ' paint-order="stroke" stroke="#fff" stroke-width=".03"' : ''}>${esc(it.n)}</text>`
  }
  for (const it of p.its.filter((i) => i.kind === 'svc')) s += svcSvg(it, H, fs)
  s += `<rect x="0" y="0" width="${f3(L)}" height="${f3(H)}" fill="none" ${sk} stroke-width=".03"/><line x1="-.15" y1="${f3(H)}" x2="${f3(L + 0.15)}" y2="${f3(H)}" ${sk} stroke-width=".05"/>`
  s += `<text x="${f3(L + 0.06)}" y="${f3(H + 0.03)}" font-size="${fs * 0.8}" fill="${INK2}">FFL</text>`
  // Dimension chains: breaks below the floor, overall below that; heights on the right.
  const hc = hChain(p), vc = vChain(p)
  if (hc.length > 2) s += dimLine(hc, H + 0.3, false, H, fs)
  s += dimLine([0, L], H + (hc.length > 2 ? 0.58 : 0.3), false, H, fs)
  s += dimLine(vc, L + 0.32, true, H, fs)
  if (vc.length > 2) s += dimLine([0, H], L + 0.62, true, H, fs)
  return s + '</g>'
}

/** Room for one panel on a sheet, metres. */
export const panelSize = (p: ElevPanel) => ({ w: p.L + 1.2, h: p.H + 1.4 })

/** A sheet of panels laid out in rows, with a title, notes and a 1 m scale bar. */
export function elevSheetSvg(panels: ElevPanel[], name: string, wpx: number) {
  let x = 0.6, y = 1.2, rowH = 0, maxW = 0, body = ''
  const WMAX = 22
  for (const p of panels) {
    const { w: pw, h: ph } = panelSize(p)
    if (x + pw > WMAX && x > 0.6) { x = 0.6; y += rowH; rowH = 0 }
    body += elevPanelSvg(p, x, y); x += pw; rowH = Math.max(rowH, ph); maxW = Math.max(maxW, x)
  }
  const W = Math.max(maxW + 0.2, 7), Hh = y + rowH + 0.1, hp = Math.round(wpx * Hh / W)
  const bar = `<g transform="translate(${f3(W - 1.4)} .62)"><rect width=".5" height=".06" fill="${INK}"/><rect x=".5" width=".5" height=".06" fill="#fff" stroke="${INK}" stroke-width=".008"/><text y=".19" font-size=".1" fill="${INK2}">0</text><text x="1" y=".19" font-size=".1" text-anchor="middle" fill="${INK2}">1 m</text></g>`
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f3(W)} ${f3(Hh)}" width="${wpx}" height="${hp}"><rect width="${f3(W)}" height="${f3(Hh)}" fill="#fff"/><g font-family="Arial,Helvetica,sans-serif"><text x=".6" y=".45" font-size=".24" font-weight="bold" fill="${INK}">${esc(name)}: elevations</text><text x=".6" y=".7" font-size=".12" fill="${INK2}">Each wall seen from inside the room. Dimensions in millimetres; heights from finished floor level (FFL). S socket, SW switch, D data, AC aircon point. Check on site before fabrication.</text></g>${bar}${body}</svg>`,
    w: wpx, h: hp,
  }
}
