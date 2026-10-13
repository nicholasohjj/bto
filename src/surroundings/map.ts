/** The map: the estate and what's around it, with walking rings from your block. */
import { ellipsePoly, type Pt, type Site, type UnitPos } from './analysis'

export const KIND: Record<string, { c: string; l: string; n: string }> = {
  mrt: { c: '#d22f45', l: 'M', n: 'MRT station' }, bus: { c: '#7a5aa6', l: 'B', n: 'Bus interchange' }, school: { c: '#2f6db5', l: 'S', n: 'School' },
  park: { c: '#3f8f4e', l: 'P', n: 'Park' }, shops: { c: '#c07a14', l: '$', n: 'Shops and food' }, community: { c: '#5a7380', l: 'C', n: 'Community' },
  health: { c: '#c0392b', l: '+', n: 'Health' },
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const pts = (p: Pt[]) => p.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')

export function createMap(svg: SVGSVGElement) {
  let site: Site | null = null, unit: UnitPos | null = null, future = 40
  const view = { x: -300, y: -500, w: 1900, h: 1400 }
  const apply = () => svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`)
  function draw() {
    if (!site) return
    const S = site, k = view.w / (svg.clientWidth || 800), fs = 12 * k
    let h = `<rect x="-5000" y="-5000" width="10000" height="10000" fill="var(--paper)"/>`
    for (const z of S.zones) h += `<polygon points="${pts(z.poly)}" fill="${z.kind === 'park' ? '#a8cf95' : future > 0 ? '#c7d4e0' : '#dfe5ea'}" stroke="${z.kind === 'park' ? '#7fae6b' : '#8aa0b5'}" stroke-dasharray="${z.kind === 'future' ? 6 * k : 0}" stroke-width="${k}"><title>${esc(z.name)}</title></polygon>`
    for (const r of S.roads) h += `<polyline points="${pts(r.line)}" fill="none" stroke="${r.kind === 'expressway' ? '#8c9396' : '#b3b9bc'}" stroke-width="${r.w}" stroke-linejoin="round" stroke-linecap="round"><title>${esc(r.name)}</title></polyline>`
    for (const r of S.rail) h += `<polyline points="${pts(r.line)}" fill="none" stroke="#d22f45" stroke-width="${3 * k}" stroke-dasharray="${r.underground ? `${8 * k} ${6 * k}` : 0}" opacity=".8"><title>${esc(r.name)}</title></polyline>`
    for (const b of S.buildings) h += `<polygon points="${pts(b.poly ?? ellipsePoly(...b.ellipse!))}" fill="#d8d2c6" stroke="#a9a397" stroke-width="${k}"><title>${esc(b.name)}</title></polygon>`
    for (const b of S.blocks) {
      const mine = unit?.block.id === b.id, c = b.footprint.reduce((s, p) => [s[0] + p[0] / b.footprint.length, s[1] + p[1] / b.footprint.length], [0, 0])
      h += `<polygon points="${pts(b.footprint)}" fill="${mine ? '#f6e7b8' : '#efece6'}" stroke="${mine ? '#d98c00' : '#8d8a85'}" stroke-width="${(mine ? 2 : 1) * k}"><title>Block ${b.id}, ${b.storeys} storeys</title></polygon>`
      h += `<text x="${c[0]}" y="${c[1]}" font-size="${fs}" text-anchor="middle" dominant-baseline="central" font-weight="600" fill="#14242a">${b.id}</text>`
    }
    if (unit) {
      const { eye, n } = unit, c = unit.block.footprint.reduce((s, p) => [s[0] + p[0] / unit!.block.footprint.length, s[1] + p[1] / unit!.block.footprint.length], [0, 0])
      for (const [r, l] of [[400, '400 m · 5 min walk'], [1000, '1 km · 15 min walk']] as const) {
        h += `<circle cx="${c[0]}" cy="${c[1]}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${1.5 * k}" stroke-dasharray="${6 * k} ${5 * k}"/><text x="${c[0]}" y="${c[1] - r - 4 * k}" font-size="${fs * 0.9}" text-anchor="middle" fill="var(--accent)">${l}</text>`
      }
      h += `<line x1="${eye[0]}" y1="${eye[1]}" x2="${eye[0] + n[0] * 40}" y2="${eye[1] + n[1] * 40}" stroke="#ff8a00" stroke-width="${4 * k}" stroke-linecap="round"/><circle cx="${eye[0]}" cy="${eye[1]}" r="${5 * k}" fill="#ff8a00" stroke="#fff" stroke-width="${1.5 * k}"/>`
    }
    for (const a of S.amenities) {
      const s = KIND[a.kind] ?? KIND.community, r = 8 * k
      h += `<g><title>${esc(a.name)}</title><circle cx="${a.at[0]}" cy="${a.at[1]}" r="${r}" fill="${s.c}" stroke="#fff" stroke-width="${1.5 * k}"/><text x="${a.at[0]}" y="${a.at[1]}" font-size="${r * 1.2}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="700">${esc(s.l)}</text>`
      h += `<text x="${a.at[0] + r * 1.4}" y="${a.at[1]}" font-size="${fs}" dominant-baseline="central" fill="var(--ink)" paint-order="stroke" stroke="var(--paper)" stroke-width="${3 * k}">${esc(a.name)}</text></g>`
    }
    // Scale bar (200 m) and north arrow, in screen-sized units.
    const bx = view.x + 20 * k, by = view.y + view.h - 24 * k
    h += `<g stroke="var(--ink)" stroke-width="${2 * k}"><line x1="${bx}" y1="${by}" x2="${bx + 200}" y2="${by}"/><line x1="${bx}" y1="${by - 5 * k}" x2="${bx}" y2="${by + 5 * k}"/><line x1="${bx + 200}" y1="${by - 5 * k}" x2="${bx + 200}" y2="${by + 5 * k}"/></g><text x="${bx + 100}" y="${by - 8 * k}" font-size="${fs}" text-anchor="middle" fill="var(--ink)">200 m</text>`
    const nx = view.x + view.w - 30 * k, ny = view.y + 40 * k
    h += `<path d="M${nx} ${ny - 16 * k}L${nx + 8 * k} ${ny + 8 * k}L${nx} ${ny + 3 * k}L${nx - 8 * k} ${ny + 8 * k}Z" fill="var(--ink)"/><text x="${nx}" y="${ny - 22 * k}" font-size="${fs}" text-anchor="middle" font-weight="700" fill="var(--ink)">N</text>`
    svg.innerHTML = h
  }
  // Pan and zoom.
  const toW = (e: { clientX: number; clientY: number }) => { const r = svg.getBoundingClientRect(); return [view.x + (e.clientX - r.left) / r.width * view.w, view.y + (e.clientY - r.top) / r.height * view.h] as Pt }
  svg.addEventListener('wheel', (e) => {
    e.preventDefault()
    const p = toW(e), f = Math.exp(e.deltaY * 0.0015), nw = Math.max(150, Math.min(6000, view.w * f)), s = nw / view.w
    view.x = p[0] - (p[0] - view.x) * s; view.y = p[1] - (p[1] - view.y) * s; view.w = nw; view.h *= s
    apply(); draw()
  }, { passive: false })
  const ptrs = new Map<number, { x: number; y: number }>()
  let pinch: { d: number; w: number; c: Pt } | null = null
  svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture?.(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, w: view.w, c: toW({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }) } } })
  svg.addEventListener('pointermove', (e) => {
    const prev = ptrs.get(e.pointerId)
    if (!prev) return
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], nw = Math.max(150, Math.min(6000, pinch.w * pinch.d / (Math.hypot(a.x - b.x, a.y - b.y) || 1))), s = nw / view.w
      view.x = pinch.c[0] - (pinch.c[0] - view.x) * s; view.y = pinch.c[1] - (pinch.c[1] - view.y) * s; view.w = nw; view.h *= s
    } else if (ptrs.size === 1) {
      const r = svg.getBoundingClientRect()
      view.x -= (e.clientX - prev.x) / r.width * view.w; view.y -= (e.clientY - prev.y) / r.height * view.h
    }
    apply(); draw()
  })
  const end = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null }
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end)
  function fit() {
    const r = svg.getBoundingClientRect(), asp = (r.height || 600) / (r.width || 800)
    view.x = -650; view.w = 2400; view.h = view.w * asp; view.y = 180 - view.h / 2
    apply(); draw()
  }
  new ResizeObserver(() => fit()).observe(svg)
  return {
    setSite(s: Site) { site = s; fit() },
    setUnit(u: UnitPos | null) { unit = u; draw() },
    setFuture(st: number) { future = st; draw() },
    redraw: draw,
  }
}
