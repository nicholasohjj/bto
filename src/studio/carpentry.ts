/**
 * Built-in carpentry made to measure: kitchen runs, wardrobes, shoe cabinets, TV consoles, vanities,
 * desks and display shelves. Each has a configuration (height, doors, inside, handles, worktop) that
 * the 3D builder and the budget read. Singapore contractors usually quote carpentry per foot run.
 */
import type { BudgetLine } from './budget'
import type { CatalogItem } from './catalog'
import type { Design, Item } from './model'

export type Doors = 'swing' | 'slide' | 'drawers' | 'open' | 'glass' | 'lift'
export type Inner = 'shelves' | 'hang' | 'mixed' | 'drawers'
export interface CarpCfg {
  /** Height of the unit and of its bottom above the floor, metres. */
  h: number; elev: number
  doors: Doors
  /** Number of doors or drawer columns (0 = automatic from the width). */
  n: number
  inner: Inner
  handle: 'bar' | 'knob' | 'push'
  /** Worktop on top (kitchen base runs and vanities). */
  top: 'quartz' | 'solid' | 'none'
  topCol: string
  /** Recessed kick at the bottom. */
  plinth: boolean
  /** Sink and hob positions along a base run (0–1, or -1 for none). */
  sink: number; hob: number
}

interface Kind { n: string; w: number; d: number; c: string; cfg: CarpCfg; elev?: number; tall?: boolean }
const base: Omit<CarpCfg, 'h' | 'elev' | 'doors' | 'inner' | 'top'> = { n: 0, handle: 'bar', topCol: '#e8e6e1', plinth: false, sink: -1, hob: -1 }
export const KINDS: Record<string, Kind> = {
  cbase: { n: 'Kitchen base run', w: 2.4, d: 0.6, c: '#f0eee9', cfg: { ...base, h: 0.9, elev: 0, doors: 'swing', inner: 'shelves', top: 'quartz', plinth: true, sink: 0.3, hob: 0.75 } },
  cwall: { n: 'Kitchen wall cabinets', w: 2.4, d: 0.35, c: '#f0eee9', elev: 1, cfg: { ...base, h: 0.7, elev: 1.5, doors: 'swing', inner: 'shelves', top: 'none' } },
  ctall: { n: 'Full-height wardrobe', w: 2.0, d: 0.6, c: '#d9d3c5', tall: true, cfg: { ...base, h: 2.4, elev: 0, doors: 'swing', inner: 'mixed', top: 'none', plinth: true } },
  cshoe: { n: 'Shoe cabinet (built-in)', w: 1.2, d: 0.38, c: '#f0eee9', cfg: { ...base, h: 1.0, elev: 0.15, doors: 'swing', inner: 'shelves', top: 'none', handle: 'push' } },
  ctv: { n: 'TV console (built-in)', w: 2.4, d: 0.4, c: '#b9a58a', cfg: { ...base, h: 0.4, elev: 0.25, doors: 'drawers', inner: 'drawers', top: 'none', handle: 'push' } },
  cvan: { n: 'Vanity cabinet (built-in)', w: 0.8, d: 0.5, c: '#b9a58a', cfg: { ...base, h: 0.5, elev: 0.35, doors: 'swing', inner: 'shelves', top: 'solid', handle: 'push', sink: 0.5 } },
  cdesk: { n: 'Study desk with shelves', w: 1.4, d: 0.6, c: '#b9a58a', cfg: { ...base, h: 0.75, elev: 0, doors: 'open', inner: 'shelves', top: 'none' } },
  cdisp: { n: 'Display shelves (built-in)', w: 1.2, d: 0.35, c: '#b9a58a', tall: true, cfg: { ...base, h: 2.0, elev: 0, doors: 'open', inner: 'shelves', top: 'none' } },
}
export const CARP_CATALOG: Record<string, CatalogItem> = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, { n: v.n, g: 'Carpentry', w: v.w, d: v.d, c: v.c, b: 'carp', k: 1, carp: 1, ...(v.elev ? { elev: 1 } : {}) } as CatalogItem]))
export const TALL_CARP = Object.keys(KINDS).filter((k) => KINDS[k].tall)

const DOORS: [Doors, string][] = [['swing', 'Swing doors'], ['slide', 'Sliding doors'], ['drawers', 'Drawers'], ['lift', 'Lift-up doors'], ['glass', 'Glass doors'], ['open', 'Open (no doors)']]
const INNER: [Inner, string][] = [['shelves', 'Shelves'], ['hang', 'Hanging rail'], ['mixed', 'Hanging + shelves'], ['drawers', 'Drawers']]
const HANDLES: [CarpCfg['handle'], string][] = [['bar', 'Bar'], ['knob', 'Knob'], ['push', 'Push to open']]
const TOPS: [CarpCfg['top'], string][] = [['quartz', 'Quartz'], ['solid', 'Solid surface'], ['none', 'None']]
export const LAMINATES = ['#f0eee9', '#e7e1d6', '#d9d3c5', '#b9a58a', '#8b6f55', '#5c4a3c', '#9aa5a0', '#4a4f52', '#2b2e31']
export const TOP_COLS = ['#e8e6e1', '#f4f3f0', '#cfcbc4', '#8d8a85', '#2f3033']

/** An item's carpentry settings, with defaults for anything missing. */
export function cfgOf(it: Pick<Item, 'type'> & { cfg?: Record<string, unknown> }): CarpCfg {
  const k = KINDS[it.type]
  return { ...(k ? k.cfg : KINDS.ctall.cfg), ...(it.cfg as Partial<CarpCfg> | undefined) }
}

/** Keep a setting within sensible limits. */
export function setCfg(it: Item, key: string, raw: string, ceiling: number): void {
  const c = cfgOf(it), num = parseFloat(raw), out: Record<string, string | number | boolean> = { ...(it.cfg || {}) }
  const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  if (key === 'h' && isFinite(num)) out.h = +clampN(num, 0.2, ceiling - c.elev).toFixed(3)
  else if (key === 'elev' && isFinite(num)) out.elev = +clampN(num, 0, ceiling - 0.2).toFixed(3)
  else if (key === 'n' && isFinite(num)) out.n = Math.round(clampN(num, 0, 12))
  else if ((key === 'sink' || key === 'hob') && isFinite(num)) out[key] = num < 0 ? -1 : +clampN(num, 0, 1).toFixed(2)
  else if (key === 'doors' && DOORS.some(([v]) => v === raw)) out.doors = raw
  else if (key === 'inner' && INNER.some(([v]) => v === raw)) out.inner = raw
  else if (key === 'handle' && HANDLES.some(([v]) => v === raw)) out.handle = raw
  else if (key === 'top' && TOPS.some(([v]) => v === raw)) out.top = raw
  else if (key === 'topCol' && TOP_COLS.includes(raw)) out.topCol = raw
  else if (key === 'plinth') out.plinth = raw === 'true'
  it.cfg = out
}

/** Number of door leaves (or drawer columns) across the width. */
export function leaves(w: number, c: CarpCfg) {
  if (c.n > 0) return c.n
  if (c.doors === 'slide') return Math.max(2, Math.round(w / 0.9))
  if (c.doors === 'lift') return Math.max(1, Math.round(w / 0.9))
  return Math.max(1, Math.round(w / 0.5))
}

/* budget: carpentry runs per kind, in foot run */
export const FT = 0.3048
export function carpentryLines(S: Design): BudgetLine[] {
  const run: Record<string, number> = {}
  for (const it of S.items) if (KINDS[it.type] && !(it.pr > 0)) run[it.type] = (run[it.type] || 0) + it.w
  return Object.entries(run).map(([k, m]) => ({ key: 'c:' + k, name: 'Carpentry: ' + KINDS[k].n, qty: +(m / FT).toFixed(1), unit: 'ft run', part: 'reno' as const }))
}

/* inspector */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const opt = <V extends string>(list: [V, string][], cur: string) => list.map(([v, n]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')
const row = (l: string, h: string) => `<label class="row"><span>${l}</span>${h}</label>`
const sw = (key: string, cols: string[], cur: string) => `<div class="sw">${cols.map((c) => `<button data-cfgsw="${key}" data-v="${c}" style="background:${c}" aria-label="Colour ${c}" aria-pressed="${c.toLowerCase() === cur.toLowerCase()}"></button>`).join('')}</div>`
export function carpHtml(it: Item, ceiling: number): string {
  const c = cfgOf(it), k = it.type
  let h = `<div style="margin:12px 0 6px;color:var(--ink2)">Made to measure</div>`
  h += row('Height (m)', `<input type="number" data-cfg="h" value="${c.h.toFixed(2)}" step="0.05" min="0.2" max="${ceiling}" inputmode="decimal">`)
  h += row('Off floor (m)', `<input type="number" data-cfg="elev" value="${c.elev.toFixed(2)}" step="0.05" min="0" max="${ceiling}" inputmode="decimal">`)
  h += row('Fronts', `<select data-cfg="doors">${opt(DOORS, c.doors)}</select>`)
  h += row('Doors across', `<input type="number" data-cfg="n" value="${c.n || ''}" min="0" max="12" step="1" placeholder="auto (${leaves(it.w, { ...c, n: 0 })})" inputmode="numeric">`)
  if (c.doors !== 'drawers') h += row('Inside', `<select data-cfg="inner">${opt(INNER, c.inner)}</select>`)
  if (c.doors !== 'open') h += row('Handles', `<select data-cfg="handle">${opt(HANDLES, c.handle)}</select>`)
  if (k === 'cbase' || k === 'cvan') {
    h += row('Worktop', `<select data-cfg="top">${opt(TOPS, c.top)}</select>`)
    if (c.top !== 'none') h += `<div style="margin:6px 0;color:var(--ink2)">Worktop colour</div>${sw('topCol', TOP_COLS, c.topCol)}`
    h += row(k === 'cbase' ? 'Sink at (0–1)' : 'Basin at (0–1)', `<input type="number" data-cfg="sink" value="${c.sink}" step="0.05" min="-1" max="1" inputmode="decimal" title="-1 for none">`)
    if (k === 'cbase') h += row('Hob at (0–1)', `<input type="number" data-cfg="hob" value="${c.hob}" step="0.05" min="-1" max="1" inputmode="decimal" title="-1 for none">`)
  }
  h += `<label class="chk"><input type="checkbox" data-cfgck="plinth"${c.plinth ? ' checked' : ''}> Plinth (kick board)</label>`
  h += `<div style="margin:12px 0 6px;color:var(--ink2)">Laminate</div>${sw('color', LAMINATES, it.color)}`
  h += `<p class="note">${(it.w / FT).toFixed(1)} ft run. Priced per foot run in the Budget tab. Sizes come from the drawing, so the carpenter measures on site.</p>`
  return h
}

/* 3D */
export interface Helpers {
  bx: (g: unknown, w: number, h: number, d: number, x: number, y: number, z: number, c: string, r?: number, m?: number, x2?: object) => unknown
  cyl: (g: unknown, r: number, h: number, x: number, y: number, z: number, c: string, o?: object) => unknown
  shade: (hex: string, f: number) => string
  glass: object
}
/** Build a carpentry unit in item space (centred, front facing +z). */
export function buildCarp(g: unknown, w: number, d: number, col: string, it: Item, H: { bx: Helpers['bx']; cyl: Helpers['cyl']; shade: Helpers['shade']; glass: object }) {
  const c = cfgOf(it), { bx, cyl, shade } = H, y0 = c.elev, h = c.h, k = it.type
  const gap = 0.004, front = d / 2, T = 0.018
  const pl = c.plinth && y0 < 0.05 ? 0.1 : 0
  if (pl) bx(g, w - 0.02, pl, d - 0.06, 0, pl / 2, -0.03, '#3b3e40', 0.9)
  const body0 = y0 + pl, bh = h - pl
  if (k === 'cdesk') {
    // Desk top with a shelf unit above it on the wall.
    bx(g, w, 0.035, d, 0, 0.75, 0, col, 0.55)
    bx(g, 0.04, 0.73, d - 0.04, -w / 2 + 0.02, 0.365, 0, col, 0.6)
    bx(g, w * 0.4, 0.6, d - 0.06, w / 2 - w * 0.2, 0.42, 0, col, 0.6)
    for (let i = 0; i < 3; i++) bx(g, w * 0.4 - 0.01, 0.005, 0.01, w / 2 - w * 0.2, 0.25 + i * 0.2, d / 2 - 0.025, shade(col, 0.6))
    bx(g, w, 0.025, 0.3, 0, 1.35, -d / 2 + 0.15, col, 0.6)
    bx(g, w, 0.025, 0.3, 0, 1.7, -d / 2 + 0.15, col, 0.6)
    return
  }
  // Carcass: back, sides, top, bottom; open and glass fronts show shelves inside.
  const showInside = c.doors === 'open' || c.doors === 'glass'
  bx(g, w, bh, T, 0, body0 + bh / 2, -d / 2 + T / 2, showInside ? shade(col, 0.88) : col, 0.6)
  bx(g, T, bh, d, -w / 2 + T / 2, body0 + bh / 2, 0, col, 0.6)
  bx(g, T, bh, d, w / 2 - T / 2, body0 + bh / 2, 0, col, 0.6)
  bx(g, w, T, d, 0, body0 + T / 2, 0, col, 0.6)
  bx(g, w, T, d, 0, y0 + h - T / 2, 0, col, 0.6)
  const n = leaves(w, c), lw = w / n
  if (showInside || c.doors !== 'drawers') {
    // Inside: shelves every ~35 cm, a rail for hanging space.
    const hang = c.inner === 'hang' || (c.inner === 'mixed'), hangW = c.inner === 'mixed' ? w * 0.5 : w
    if (hang && bh > 1.2) {
      const hx = c.inner === 'mixed' ? -w / 2 + hangW / 2 : 0
      H.cyl(g, 0.012, hangW - 0.04, hx, y0 + h - 0.12, 0, '#9aa2a6', { r: 0.3, m: 0.8, rx: 0 })
      bx(g, hangW - 0.04, T, d - T, hx, y0 + h - 0.06, T / 2, col, 0.6)
    }
    if (c.inner === 'shelves' || c.inner === 'mixed') {
      const sx0 = c.inner === 'mixed' ? 0 : -w / 2, sw = c.inner === 'mixed' ? w / 2 : w, rows = Math.max(1, Math.floor(bh / 0.35))
      for (let i = 1; i < rows; i++) bx(g, sw - 2 * T, T, d - T - 0.02, sx0 + sw / 2, body0 + i * bh / rows, -0.01, col, 0.6)
      if (c.inner === 'mixed') bx(g, T, bh - 2 * T, d - T, 0, body0 + bh / 2, 0, col, 0.6)
    }
    if (c.inner === 'drawers' && !showInside) { /* behind doors: nothing visible */ }
  }
  // Fronts.
  const handle = (x: number, y: number, horiz: boolean) => {
    if (c.handle === 'push') return
    if (c.handle === 'knob') { cyl(g, 0.012, 0.025, x, y, front + 0.025, '#6b6e70', { r: 0.4, m: 0.6, rx: Math.PI / 2 }); return }
    if (horiz) bx(g, Math.min(0.3, lw * 0.5), 0.014, 0.02, x, y, front + 0.02, '#6b6e70', 0.4, 0.6)
    else bx(g, 0.014, Math.min(0.3, bh * 0.4), 0.02, x, y, front + 0.02, '#6b6e70', 0.4, 0.6)
  }
  if (c.doors === 'swing' || c.doors === 'glass' || c.doors === 'lift') {
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + lw * (i + 0.5)
      if (c.doors === 'glass') {
        bx(g, lw - gap - 0.06, bh - gap - 0.06, 0.006, x, body0 + bh / 2, front + 0.004, '#cfe6ee', 0.1, 0, H.glass)
        for (const [fw, fh, fx, fy] of [[lw - gap, 0.03, x, body0 + 0.015], [lw - gap, 0.03, x, body0 + bh - 0.015], [0.03, bh, x - lw / 2 + 0.015, body0 + bh / 2], [0.03, bh, x + lw / 2 - 0.015, body0 + bh / 2]]) bx(g, fw, fh, 0.02, fx, fy, front + 0.008, shade(col, 0.8), 0.5)
      } else bx(g, lw - gap, bh - gap, 0.018, x, body0 + bh / 2, front + 0.009, col, 0.55)
      if (c.doors === 'lift') handle(x, body0 + 0.05, true)
      else handle(x + (i % 2 ? -1 : 1) * (lw / 2 - 0.05), bh > 1.2 ? body0 + Math.min(1.1, bh / 2) : body0 + bh - 0.08, false)
    }
  } else if (c.doors === 'slide') {
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + lw * (i + 0.5), z = front + 0.012 + (i % 2) * 0.025
      bx(g, lw + 0.02, bh - gap, 0.02, x, body0 + bh / 2, z, i % 2 ? shade(col, 0.95) : col, 0.5)
      if (c.handle !== 'push') bx(g, 0.02, Math.min(0.5, bh * 0.4), 0.03, x + (i % 2 ? -1 : 1) * (lw / 2 - 0.04), body0 + bh / 2, z + 0.02, '#6b6e70', 0.4, 0.6)
    }
  } else if (c.doors === 'drawers') {
    const rows = Math.max(1, Math.min(6, Math.round(bh / 0.2)))
    for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
      const x = -w / 2 + lw * (i + 0.5), y = body0 + bh * (j + 0.5) / rows
      bx(g, lw - gap, bh / rows - gap, 0.018, x, y, front + 0.009, col, 0.55)
      handle(x, y + bh / rows * 0.25, true)
    }
  }
  // Worktop, sink and hob.
  if (c.top !== 'none') {
    const ty = y0 + h + 0.02
    bx(g, w + 0.02, 0.04, d + 0.03, 0, ty, 0.015, c.topCol, c.top === 'quartz' ? 0.25 : 0.4)
    if (c.sink >= 0) {
      const sx = -w / 2 + c.sink * w, sw2 = Math.min(k === 'cvan' ? 0.45 : 0.6, w - 0.2)
      bx(g, sw2, 0.012, d - 0.22, sx, ty + 0.016, 0.02, k === 'cvan' ? '#fafafa' : '#b7bec2', 0.25, k === 'cvan' ? 0 : 0.8)
      cyl(g, 0.014, 0.2, sx, ty + 0.12, -d / 2 + 0.08, '#9aa2a6', { r: 0.3, m: 0.8 })
    }
    if (k === 'cbase' && c.hob >= 0) {
      const hx = -w / 2 + c.hob * w
      bx(g, 0.6, 0.008, 0.5, hx, ty + 0.022, 0.02, '#1c1d1f', 0.25)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.07, 0.006, hx + sx * 0.14, ty + 0.028, 0.02 + sz * 0.12, '#3a3c3e', { r: 0.4 })
    }
  }
}
