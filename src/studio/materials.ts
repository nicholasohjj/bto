/**
 * Finishes library: floor materials painted procedurally (colour and bump maps, no image files),
 * and one-click style presets that set walls, floors, carpentry and skirting together.
 */
import type { Design } from './model'

export type FloorPattern = 'plank' | 'herr' | 'tile' | 'marble' | 'terr' | 'cement' | 'hex'
export interface FloorSpec {
  n: string
  /** Base colour, also used on the plan. */
  c: string
  /** Roughness. */
  r: number
  t: FloorPattern
  /** Metres covered by one texture tile. */
  size: number
  /** Tiles or planks across one texture (pattern detail). */
  k?: number
  grout?: string
  /** Wet areas: suitable for bathrooms, kitchens and yards. */
  wet?: boolean
}
export const FLOOR_SPECS: Record<string, FloorSpec> = {
  oak: { n: 'Oak plank', c: '#c6a47a', r: 0.7, t: 'plank', size: 2.4, k: 6 },
  loak: { n: 'Light oak plank', c: '#d9c19e', r: 0.7, t: 'plank', size: 2.4, k: 6 },
  goak: { n: 'Grey oak plank', c: '#b3aba0', r: 0.7, t: 'plank', size: 2.4, k: 6 },
  walnut: { n: 'Walnut plank', c: '#7a5a43', r: 0.65, t: 'plank', size: 2.4, k: 6 },
  vinyl: { n: 'Ash vinyl', c: '#d6ccbb', r: 0.8, t: 'plank', size: 2.4, k: 4 },
  herr: { n: 'Oak herringbone', c: '#c9a678', r: 0.65, t: 'herr', size: 1.2 },
  tile: { n: 'Grey tile 60×60', c: '#c9cecd', r: 0.35, t: 'tile', size: 1.2, k: 2, grout: '#8f9796', wet: true },
  por: { n: 'Light porcelain 60×60', c: '#e4e0d8', r: 0.3, t: 'tile', size: 1.2, k: 2, grout: '#b9b4ab', wet: true },
  pord: { n: 'Charcoal porcelain 60×60', c: '#5b5d5e', r: 0.4, t: 'tile', size: 1.2, k: 2, grout: '#3f4142', wet: true },
  marble: { n: 'White marble', c: '#e8e7e3', r: 0.2, t: 'marble', size: 1.2, k: 2, grout: '#cfcdc8', wet: true },
  terr: { n: 'Terrazzo', c: '#d8d3ca', r: 0.4, t: 'terr', size: 1.2, wet: true },
  cement: { n: 'Cement screed', c: '#9c9c97', r: 0.75, t: 'cement', size: 2.4, wet: true },
  hex: { n: 'Hexagon mosaic', c: '#eef0ef', r: 0.35, t: 'hex', size: 0.6, grout: '#a9afae', wet: true },
}

function rng(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
const hex2 = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const rgb = (c: number[]) => `rgb(${c.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(',')})`
const jitter = (h: string, R: () => number, a: number) => { const f = 1 + (R() - 0.5) * a; return rgb(hex2(h).map((v) => v * f)) }

/** Paint a floor: returns a colour canvas and a bump canvas (light = raised), both N×N pixels. */
export function paintFloor(key: string, N = 1024): { map: HTMLCanvasElement; bump: HTMLCanvasElement } {
  const s = FLOOR_SPECS[key] ?? FLOOR_SPECS.oak, R = rng(key.length * 977 + key.charCodeAt(0) * 31)
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c }
  const map = mk(), bump = mk(), x = map.getContext('2d')!, b = bump.getContext('2d')!
  x.fillStyle = s.c; x.fillRect(0, 0, N, N)
  b.fillStyle = '#ffffff'; b.fillRect(0, 0, N, N)
  const grain = (px: number, py: number, w: number, h: number, vertical = false) => {
    x.save(); x.beginPath(); x.rect(px, py, w, h); x.clip()
    for (let g = 0; g < (vertical ? w : h) / 6; g++) {
      x.strokeStyle = `rgba(60,40,20,${0.04 + R() * 0.08})`; x.lineWidth = 0.6 + R() * 1.4; x.beginPath()
      if (vertical) { const gx = px + R() * w; x.moveTo(gx, py); x.bezierCurveTo(gx + R() * 6 - 3, py + h * 0.3, gx + R() * 6 - 3, py + h * 0.7, gx + R() * 4 - 2, py + h) }
      else { const gy = py + R() * h; x.moveTo(px, gy); x.bezierCurveTo(px + w * 0.3, gy + R() * 6 - 3, px + w * 0.7, gy + R() * 6 - 3, px + w, gy + R() * 4 - 2) }
      x.stroke()
    }
    // Knots.
    if (R() < 0.3) { x.fillStyle = 'rgba(70,45,25,.18)'; x.beginPath(); x.ellipse(px + R() * w, py + R() * h, 6 + R() * 6, 3 + R() * 2, 0, 0, 7); x.fill() }
    x.restore()
  }
  const seam = (ctx: CanvasRenderingContext2D, col: string, lw: number, px: number, py: number, w: number, h: number) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.strokeRect(px + lw / 2, py + lw / 2, w - lw, h - lw) }
  if (s.t === 'plank') {
    const rows = s.k ?? 6, rh = N / rows, pl = N / 2
    for (let i = 0; i < rows; i++) {
      const off = R() * pl
      for (let k = -1; k < 3; k++) {
        const px = off + k * pl
        x.fillStyle = jitter(s.c, R, 0.16); x.fillRect(px, i * rh, pl, rh)
        grain(px, i * rh, pl, rh)
        seam(x, 'rgba(40,28,15,.4)', 2, px, i * rh, pl, rh)
        seam(b, '#555', 3, px, i * rh, pl, rh)
      }
    }
  } else if (s.t === 'herr') {
    const L = N / 4, W = L / 4
    for (let r = -4; r < 12; r++) for (let c = -2; c < 10; c++) for (const flip of [0, 1]) {
      x.save(); b.save()
      const cx = c * L / 2 * Math.SQRT2 * 1.0 + (flip ? W * 0.7 : 0), cy = r * W * Math.SQRT2 + c * L * 0.35 * Math.SQRT2
      for (const ctx of [x, b]) { ctx.translate(cx, cy); ctx.rotate(flip ? -Math.PI / 4 : Math.PI / 4) }
      x.fillStyle = jitter(s.c, R, 0.18); x.fillRect(0, 0, L, W)
      grain(0, 0, L, W)
      seam(x, 'rgba(40,28,15,.4)', 2, 0, 0, L, W); seam(b, '#555', 3, 0, 0, L, W)
      x.restore(); b.restore()
    }
  } else if (s.t === 'tile' || s.t === 'marble') {
    const n = s.k ?? 2, ts = N / n
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      x.fillStyle = jitter(s.c, R, s.t === 'marble' ? 0.03 : 0.05); x.fillRect(i * ts, j * ts, ts, ts)
      if (s.t === 'marble') {
        for (let v = 0; v < 7; v++) {
          x.strokeStyle = `rgba(110,118,125,${0.08 + R() * 0.18})`; x.lineWidth = 0.6 + R() * 2.4; x.beginPath()
          let px = i * ts + R() * ts, py = j * ts
          x.moveTo(px, py)
          for (let q = 0; q < 6; q++) { px += R() * 90 - 45; py += ts / 6; x.lineTo(Math.min(i * ts + ts, Math.max(i * ts, px)), py) }
          x.stroke()
        }
      } else for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},.025)`; x.fillRect(i * ts + R() * ts, j * ts + R() * ts, 2, 2) }
    }
    x.strokeStyle = s.grout ?? '#999'; x.lineWidth = 4; b.strokeStyle = '#333'; b.lineWidth = 6
    for (let i = 0; i <= n; i++) for (const ctx of [x, b]) { ctx.beginPath(); ctx.moveTo(i * ts, 0); ctx.lineTo(i * ts, N); ctx.moveTo(0, i * ts); ctx.lineTo(N, i * ts); ctx.stroke() }
  } else if (s.t === 'terr') {
    const chips = ['#8a8580', '#f3f1ec', '#b7aa98', '#6f6b66', '#c9b9a6', '#a39e96']
    for (let k = 0; k < 2600; k++) { x.fillStyle = chips[Math.floor(R() * chips.length)]; x.beginPath(); const r = 1.5 + R() * R() * 9; x.ellipse(R() * N, R() * N, r, r * (0.5 + R() * 0.5), R() * 3, 0, 7); x.fill() }
  } else if (s.t === 'cement') {
    for (let k = 0; k < 160; k++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); const v = R() < 0.5 ? 0 : 255; g.addColorStop(0, `rgba(${v},${v},${v},${0.03 + R() * 0.05})`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.save(); x.translate(R() * N, R() * N); x.scale(40 + R() * 160, 40 + R() * 160); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore() }
    for (let k = 0; k < 9000; k++) { x.fillStyle = `rgba(0,0,0,${R() * 0.05})`; x.fillRect(R() * N, R() * N, 1.5, 1.5) }
  } else if (s.t === 'hex') {
    const r = N / 12, h = r * Math.sqrt(3)
    for (let row = -1; row < N / h + 1; row++) for (let col = -1; col < N / (r * 1.5) + 1; col++) {
      const cx = col * r * 1.5, cy = row * h + (col % 2 ? h / 2 : 0)
      const path = (ctx: CanvasRenderingContext2D) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; ctx.lineTo(cx + r * 0.94 * Math.cos(a), cy + r * 0.94 * Math.sin(a)) } ctx.closePath() }
      x.fillStyle = s.grout ?? '#aaa'; path(x); x.lineWidth = r * 0.12; x.strokeStyle = s.grout ?? '#aaa'; x.stroke()
      x.fillStyle = jitter(s.c, R, 0.06); path(x); x.fill()
      path(b); b.lineWidth = r * 0.14; b.strokeStyle = '#333'; b.stroke()
    }
  }
  return { map, bump }
}

/* style presets */
export interface Preset {
  n: string
  /** Walls, ceiling and skirting. */
  wall: string; ceil: string; skirt: string | null
  /** Floors for dry rooms and for wet rooms (bath, kitchen, yard, shelter, ledge). */
  dry: string; wet: string
  /** Carpentry laminate and worktop, and loose-furniture accent. */
  lam: string; top: string; soft: string
}
export const PRESETS: Record<string, Preset> = {
  japandi: { n: 'Japandi', wall: '#efe9df', ceil: '#f6f2ea', skirt: null, dry: 'loak', wet: 'por', lam: '#d9c8ad', top: '#e8e6e1', soft: '#c9bfae' },
  scandi: { n: 'Scandinavian', wall: '#f4f3ef', ceil: '#f8f7f4', skirt: '#f4f2ee', dry: 'oak', wet: 'tile', lam: '#f0eee9', top: '#f4f3f0', soft: '#9aa5a0' },
  industrial: { n: 'Industrial', wall: '#d4d2cd', ceil: '#9c9c97', skirt: '#3a3d3f', dry: 'cement', wet: 'pord', lam: '#2b2e31', top: '#8d8a85', soft: '#8b6f55' },
  luxe: { n: 'Modern luxe', wall: '#ece8e1', ceil: '#f8f7f4', skirt: null, dry: 'marble', wet: 'marble', lam: '#5c4a3c', top: '#f4f3f0', soft: '#4a4f52' },
  warm: { n: 'Warm minimal', wall: '#e9e1d4', ceil: '#f1ece3', skirt: '#e9e1d4', dry: 'herr', wet: 'terr', lam: '#b9a58a', top: '#e8e6e1', soft: '#c89a82' },
}
const WET = /bath|wc|toilet|kitchen|yard|shelter|ledge|utility|balcony/i

/** Apply a preset to the whole design in place. Loose furniture keeps its colours except sofas and rugs. */
export function applyPreset(S: Design, key: string, carp: Set<string>) {
  const p = PRESETS[key]
  if (!p) return false
  S.wallColor = p.wall; S.ceilCol = p.ceil
  S.walls.forEach((w) => { w.col = '' })
  S.skirt = !!p.skirt; if (p.skirt) S.skirtCol = p.skirt
  for (const r of S.rooms) r.floor = WET.test(r.name) ? p.wet : p.dry
  for (const it of S.items) {
    if (carp.has(it.type)) { it.color = p.lam; it.cfg = { ...(it.cfg || {}), topCol: p.top } }
    else if (['sofa', 'lsofa', 'arm', 'rug', 'ottoman', 'pouf'].includes(it.type)) it.color = p.soft
  }
  return true
}
