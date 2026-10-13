/**
 * False ceilings per room: a full dropped ceiling, or a perimeter box (an L-box or border that hides
 * aircon trunking), with optional cove lighting along its inner edge.
 */
import type { BudgetLine } from './budget'
import type { Check } from './checks'
import { FT } from './carpentry'
import { rarea, rpts, type Design, type Pt, type Room } from './model'

export interface Ceil {
  type: 'none' | 'full' | 'box'
  /** How far below the slab, metres. */
  drop: number
  /** Box width from the walls, metres (box only). */
  band: number
  /** LED cove light along the inner edge (box) or the room edge (full). */
  cove: boolean
}
export const CEIL_DEFAULT: Ceil = { type: 'none', drop: 0.3, band: 0.6, cove: false }

export function ceilOf(r: Room): Ceil { return { ...CEIL_DEFAULT, ...(r as Room & { ceil?: Partial<Ceil> }).ceil } }

/** Sanitise a saved ceiling. */
export function cleanCeil(o: unknown): Ceil | undefined {
  if (!o || typeof o !== 'object') return undefined
  const c = o as Record<string, unknown>
  const type = c.type === 'full' || c.type === 'box' ? c.type : 'none'
  if (type === 'none') return undefined
  const num = (v: unknown, a: number, b: number, d: number) => (typeof v === 'number' && isFinite(v) ? Math.max(a, Math.min(b, v)) : d)
  return { type, drop: num(c.drop, 0.1, 0.6, 0.3), band: num(c.band, 0.3, 1.5, 0.6), cove: !!c.cove }
}

/** Shrink an outline by `d` (works for the right-angled and convex rooms HDB plans have). */
export function inset(pts: Pt[], d: number): Pt[] {
  const n = pts.length
  // Signed area tells which way is inside.
  let a = 0
  for (let i = 0; i < n; i++) { const q = pts[(i + 1) % n]; a += pts[i][0] * q[1] - q[0] * pts[i][1] }
  const s = a > 0 ? 1 : -1
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1
    const nx = -dy / L * s, ny = dx / L * s
    return { p: [p[0] + nx * d, p[1] + ny * d] as Pt, d: [dx / L, dy / L] as Pt }
  })
  return lines.map((l, i) => {
    const m = lines[(i + n - 1) % n], den = m.d[0] * l.d[1] - m.d[1] * l.d[0]
    if (Math.abs(den) < 1e-9) return l.p
    const t = ((l.p[0] - m.p[0]) * l.d[1] - (l.p[1] - m.p[1]) * l.d[0]) / den
    return [m.p[0] + m.d[0] * t, m.p[1] + m.d[1] * t] as Pt
  })
}
const perim = (p: Pt[]) => p.reduce((s, q, i) => s + Math.hypot(p[(i + 1) % p.length][0] - q[0], p[(i + 1) % p.length][1] - q[1]), 0)
const area = (p: Pt[]) => rarea({ w: 0, h: 0, pts: p })

/** Quantities: full ceiling area, box run (measured along its inner edge) and cove run. */
export function ceilingQty(S: Design) {
  let full = 0, box = 0, cove = 0
  for (const r of S.rooms) {
    const c = ceilOf(r), P = rpts(r)
    if (c.type === 'full') { full += area(P); if (c.cove) cove += perim(P) }
    else if (c.type === 'box') { const I = inset(P, c.band); box += perim(I); if (c.cove) cove += perim(I) }
  }
  return { full, box, cove }
}
export function ceilingLines(S: Design): BudgetLine[] {
  const q = ceilingQty(S), L: BudgetLine[] = []
  if (q.full > 0) L.push({ key: 'g:full', name: 'False ceiling (full)', qty: +q.full.toFixed(2), unit: 'm²', part: 'reno' })
  if (q.box > 0) L.push({ key: 'g:box', name: 'False ceiling box / L-box', qty: +(q.box / FT).toFixed(1), unit: 'ft run', part: 'reno' })
  if (q.cove > 0) L.push({ key: 'g:cove', name: 'Cove lighting', qty: +(q.cove / FT).toFixed(1), unit: 'ft run', part: 'reno' })
  return L
}

/** Ceiling height left under a false ceiling. */
export function ceilingChecks(S: Design): Check[] {
  const out: Check[] = []
  for (const r of S.rooms) {
    const c = ceilOf(r)
    if (c.type === 'none') continue
    const clear = S.H - c.drop
    if (clear < 2.2) out.push({ lvl: 'warn', msg: `${r.name}: the false ceiling leaves ${clear.toFixed(2)} m of headroom. Under about 2.3 m feels low, and tall wardrobes may not fit.`, cat: 'ceiling' })
    if (c.type === 'box' && Math.min(r.w, r.h) < 2 * c.band + 0.6) out.push({ lvl: 'info', msg: `${r.name}: the ${c.band.toFixed(2)} m ceiling box leaves little flat ceiling in the middle. A narrower box or a full ceiling may suit it better.`, cat: 'ceiling' })
  }
  return out
}

/* inspector */
export function ceilHtml(r: Room): string {
  const c = ceilOf(r)
  const sel = (k: string, list: [string, string][], cur: string) => `<select data-ceil="${k}">${list.map(([v, n]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${n}</option>`).join('')}</select>`
  const row = (l: string, h: string) => `<label class="row"><span>${l}</span>${h}</label>`
  let h = `<div style="margin:12px 0 6px;color:var(--ink2)">False ceiling</div>${row('Type', sel('type', [['none', 'None'], ['box', 'Box / L-box around the edge'], ['full', 'Full dropped ceiling']], c.type))}`
  if (c.type !== 'none') {
    h += row('Drop (m)', `<input type="number" data-ceil="drop" value="${c.drop.toFixed(2)}" step="0.05" min="0.1" max="0.6" inputmode="decimal">`)
    if (c.type === 'box') h += row('Box width (m)', `<input type="number" data-ceil="band" value="${c.band.toFixed(2)}" step="0.05" min="0.3" max="1.5" inputmode="decimal">`)
    h += `<label class="chk"><input type="checkbox" data-ceilck="cove"${c.cove ? ' checked' : ''}> Cove lighting</label>`
  }
  return h
}
export function setCeil(r: Room, key: string, raw: string) {
  const c = ceilOf(r) as unknown as Record<string, unknown>
  if (key === 'cove') c.cove = raw === 'true'
  else if (key === 'type') c.type = raw
  else c[key] = parseFloat(raw)
  const clean = cleanCeil(c)
  if (clean) (r as Room & { ceil?: Ceil }).ceil = clean
  else delete (r as Room & { ceil?: Ceil }).ceil
}

/** Plan overlay (SVG, metres): dashed outline of each ceiling box or full ceiling. */
export function ceilingSvg(S: Design): string {
  let h = ''
  for (const r of S.rooms) {
    const c = ceilOf(r)
    if (c.type === 'none') continue
    const P = c.type === 'box' ? inset(rpts(r), c.band) : rpts(r)
    h += `<polygon points="${P.map((q) => q[0] + ',' + q[1]).join(' ')}" class="ceilp${c.cove ? ' cove' : ''}"/>`
  }
  return h
}
