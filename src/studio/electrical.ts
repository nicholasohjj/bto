/**
 * Electrical plan: power, lighting, switch, data and aircon points placed in the design, priced per
 * point, checked for obvious gaps, and drawn as a separate sheet with symbols and a legend.
 */
import type { BudgetLine } from './budget'
import type { Check } from './checks'
import { bounds, pip, rcent, rpts, wallInfo, type Design, type Item } from './model'

/** Point kinds: which catalogue items count, and how each is drawn on the electrical sheet. */
export const POINTS: { key: string; name: string; types: string[]; sym: string }[] = [
  { key: 'power', name: 'Power socket', types: ['socket'], sym: 'socket' },
  { key: 'acpt', name: 'Aircon point', types: ['acpt', 'aircon'], sym: 'ac' },
  { key: 'light', name: 'Lighting point', types: ['ceilL', 'pendant', 'downl', 'wlight', 'fan'], sym: 'light' },
  { key: 'switch', name: 'Light switch', types: ['sw1'], sym: 'switch' },
  { key: 'data', name: 'Data / TV point', types: ['datapt'], sym: 'data' },
  { key: 'heater', name: 'Water heater point', types: ['heater'], sym: 'wh' },
]
const kindOf = (t: string) => POINTS.find((p) => p.types.includes(t))

export function electricalCounts(S: Design) {
  const n: Record<string, number> = {}
  for (const it of S.items) { const k = kindOf(it.type); if (k) n[k.key] = (n[k.key] || 0) + 1 }
  return n
}
export function electricalLines(S: Design): BudgetLine[] {
  const n = electricalCounts(S)
  return POINTS.filter((p) => n[p.key]).map((p) => ({ key: 'e:' + p.key, name: 'Electrical: ' + p.name, qty: n[p.key], unit: 'point', part: 'reno' as const }))
}

export function electricalChecks(S: Design): Check[] {
  const out: Check[] = [], inRoom = (it: Item, r: Design['rooms'][number]) => pip(it.x, it.y, rpts(r))
  const has = (r: Design['rooms'][number], key: string) => S.items.some((it) => kindOf(it.type)?.key === key && inRoom(it, r))
  if (!S.items.some((it) => kindOf(it.type))) return out
  for (const r of S.rooms) {
    if (/bed|living|study|kitchen/i.test(r.name) && !has(r, 'power')) out.push({ lvl: 'info', msg: `${r.name} has no power socket on the electrical plan.`, cat: 'electrical' })
    if (/bath|wc|toilet/i.test(r.name) && has(r, 'power')) out.push({ lvl: 'warn', msg: `${r.name} has an ordinary power socket. Wet areas normally only get special points (such as the water heater); check with your electrician.`, cat: 'electrical' })
    if (has(r, 'light') && !has(r, 'switch') && !/ledge|shelter|yard/i.test(r.name)) out.push({ lvl: 'info', msg: `${r.name} has lights but no switch on the plan.`, cat: 'electrical' })
  }
  return out
}

/* the sheet */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
/** One symbol at (x, y), metres; `rot` turns wall-mounted symbols to face into the room. */
export function symbol(sym: string, x: number, y: number, rot = 0): string {
  const t = `transform="translate(${x} ${y}) rotate(${rot})"`, s = 'stroke="#14242a" stroke-width=".02" fill="none"'
  switch (sym) {
    case 'socket': return `<g ${t}><circle r=".11" ${s} fill="#fff"/><path d="M-.04 -.05V.05M.04 -.05V.05" ${s}/></g>`
    case 'ac': return `<g ${t}><rect x="-.13" y="-.09" width=".26" height=".18" ${s} fill="#fff"/><text y=".04" font-size=".11" text-anchor="middle" fill="#14242a" font-family="Arial">AC</text></g>`
    case 'light': return `<g ${t}><circle r=".12" ${s} fill="#fff"/><path d="M-.085 -.085L.085 .085M-.085 .085L.085 -.085" ${s}/></g>`
    case 'switch': return `<g ${t}><circle r=".07" ${s} fill="#fff"/><text y=".035" font-size=".1" text-anchor="middle" fill="#14242a" font-family="Arial">S</text></g>`
    case 'data': return `<g ${t}><path d="M0 -.11L.11 .08H-.11Z" ${s} fill="#fff"/><text y=".06" font-size=".08" text-anchor="middle" fill="#14242a" font-family="Arial">D</text></g>`
    case 'wh': return `<g ${t}><rect x="-.12" y="-.08" width=".24" height=".16" ${s} fill="#fff"/><text y=".035" font-size=".09" text-anchor="middle" fill="#14242a" font-family="Arial">WH</text></g>`
    default: return ''
  }
}
/** The electrical plan as an SVG sheet: walls and rooms in grey, points in black, a legend with counts. */
export function electricalSvg(S: Design, wpx = 2400): { svg: string; w: number; h: number } {
  const b = bounds(S), pad = 1.2, legendW = 3.4, W = b.w + pad * 2 + legendW, H = Math.max(b.h + pad * 2, 4.5), x0 = b.x0 - pad, y0 = b.y0 - pad
  let body = ''
  for (const r of S.rooms) {
    const P = rpts(r), c = rcent(r)
    body += `<polygon points="${P.map((q) => q[0] + ',' + q[1]).join(' ')}" fill="#f6f8f8" stroke="#c7d0d0" stroke-width=".015"/>`
    if (r.w > 1 && r.h > 0.8) body += `<text x="${c.x}" y="${c.y}" font-size=".18" text-anchor="middle" fill="#8a989c" font-family="Arial">${esc(r.name)}</text>`
  }
  for (const w of S.walls) {
    const wi = wallInfo(w, S.openings), T = wi.th
    if (wi.axis === 'a') body += `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="#9aa6a8" stroke-width="${T}"/>`
    else for (const [a, c2] of wi.segs) body += wi.axis === 'h' ? `<rect x="${a}" y="${wi.c - T / 2}" width="${c2 - a}" height="${T}" fill="#9aa6a8"/>` : `<rect x="${wi.c - T / 2}" y="${a}" width="${T}" height="${c2 - a}" fill="#9aa6a8"/>`
  }
  const n = electricalCounts(S)
  for (const it of S.items) { const k = kindOf(it.type); if (k) body += symbol(k.sym, it.x, it.y, k.sym === 'ac' || k.sym === 'wh' ? 0 : it.rot) }
  // Legend.
  const lx = b.x1 + pad + 0.3
  let legend = `<text x="${lx}" y="${y0 + 0.8}" font-size=".24" font-weight="bold" fill="#14242a" font-family="Arial">Electrical points</text>`
  POINTS.forEach((p, i) => {
    const y = y0 + 1.3 + i * 0.45
    legend += symbol(p.sym, lx + 0.15, y) + `<text x="${lx + 0.45}" y="${y + 0.06}" font-size=".17" fill="#14242a" font-family="Arial">${esc(p.name)}: ${n[p.key] || 0}</text>`
  })
  legend += `<text x="${lx}" y="${y0 + 1.3 + POINTS.length * 0.45 + 0.3}" font-size=".13" fill="#54686f" font-family="Arial">For discussion with a licensed electrician.</text>`
  const hp = Math.round(wpx * H / W)
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${W} ${H}" width="${wpx}" height="${hp}"><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#fff"/><text x="${x0 + 0.3}" y="${y0 + 0.5}" font-size=".26" font-weight="bold" fill="#14242a" font-family="Arial">${esc(S.name)} - electrical plan</text>${body}${legend}</svg>`,
    w: wpx, h: hp,
  }
}
