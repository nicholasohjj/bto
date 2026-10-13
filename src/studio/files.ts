/** File formats Flat Studio writes: ZIP (stored), PDF (images + Courier/Helvetica text) and DXF R12 in millimetres. */
import type { Catalog } from './budget'
import { rarea, rcent, rpts, wallInfo, type Design } from './model'

const te = new TextEncoder()
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
export const crc32 = (u: Uint8Array) => { let c = ~0; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (~c) >>> 0 }

/** An uncompressed ZIP. */
export function zipStore(files: { name: string; data: Uint8Array }[]): Blob {
  const parts: Uint8Array[] = [], cen: Uint8Array[] = []
  let off = 0
  const w16 = (v: number) => [v & 255, v >> 8 & 255], w32 = (v: number) => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255]
  for (const f of files) {
    const nm = te.encode(f.name), crc = crc32(f.data), sz = f.data.length
    const lh = Uint8Array.from([0x50, 0x4b, 3, 4, ...w16(20), ...w16(0), ...w16(0), ...w16(0), ...w16(0x21), ...w32(crc), ...w32(sz), ...w32(sz), ...w16(nm.length), ...w16(0)])
    parts.push(lh, nm, f.data)
    cen.push(Uint8Array.from([0x50, 0x4b, 1, 2, ...w16(20), ...w16(20), ...w16(0), ...w16(0), ...w16(0), ...w16(0x21), ...w32(crc), ...w32(sz), ...w32(sz), ...w16(nm.length), ...w16(0), ...w16(0), ...w16(0), ...w16(0), ...w32(0), ...w32(off)]), nm)
    off += lh.length + nm.length + sz
  }
  let cl = 0
  cen.forEach((c) => { cl += c.length })
  const end = Uint8Array.from([0x50, 0x4b, 5, 6, ...w16(0), ...w16(0), ...w16(files.length), ...w16(files.length), ...w32(cl), ...w32(off), ...w16(0)])
  return new Blob([...parts, ...cen, end] as BlobPart[], { type: 'application/zip' })
}

/** Text safe for the PDF's standard fonts (ASCII only, escaped). */
export const pdfTxt = (t: unknown) => String(t).replace(/×/g, 'x').replace(/²/g, '2').replace(/°/g, ' deg').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1')
function b64bytes(u: string) { const b = atob(u.split(',')[1]), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a }

export interface PdfPage {
  w: number; h: number
  /** A JPEG data URL drawn at (x, y) with size dw × dh points. */
  img: { url: string; w: number; h: number; x: number; y: number; dw: number; dh: number } | null
  text?: { x: number; y: number; s: number; t: string; b?: number }[]
  /** Raw PDF drawing operators (lines, rectangles) for vector content. */
  ops?: string
}
export function pdfBuild(pages: PdfPage[]): Blob {
  const chunks: Uint8Array[] = [], offs: number[] = []
  let pos = 0
  const push = (b: string | Uint8Array) => { if (typeof b === 'string') b = te.encode(b); chunks.push(b); pos += b.length }
  const obj = (n: number, fn: () => void) => { offs[n] = pos; push(`${n} 0 obj\n`); fn(); push('\nendobj\n') }
  push('%PDF-1.4\n')
  const N = 4 + pages.length * 3
  obj(1, () => push('<</Type/Catalog/Pages 2 0 R>>'))
  obj(2, () => push(`<</Type/Pages/Count ${pages.length}/Kids[${pages.map((_, i) => `${5 + i * 3} 0 R`).join(' ')}]>>`))
  obj(3, () => push('<</Type/Font/Subtype/Type1/BaseFont/Courier>>'))
  obj(4, () => push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold>>'))
  pages.forEach((p, i) => {
    const pg = 5 + i * 3, ct = 6 + i * 3, im = 7 + i * 3
    let c = ''
    if (p.img) c += `q ${p.img.dw.toFixed(2)} 0 0 ${p.img.dh.toFixed(2)} ${p.img.x.toFixed(2)} ${p.img.y.toFixed(2)} cm /Im0 Do Q\n`
    if (p.ops) c += p.ops + '\n'
    for (const t of p.text || []) c += `BT /${t.b ? 'F2' : 'F1'} ${t.s} Tf ${t.x.toFixed(1)} ${t.y.toFixed(1)} Td (${pdfTxt(t.t)}) Tj ET\n`
    obj(pg, () => push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${p.w} ${p.h}]/Contents ${ct} 0 R/Resources<</Font<</F1 3 0 R/F2 4 0 R>>${p.img ? `/XObject<</Im0 ${im} 0 R>>` : ''}>>>>`))
    obj(ct, () => { const b = te.encode(c); push(`<</Length ${b.length}>>\nstream\n`); push(b); push('\nendstream') })
    if (p.img) {
      const d = b64bytes(p.img.url), img = p.img
      obj(im, () => { push(`<</Type/XObject/Subtype/Image/Width ${img.w}/Height ${img.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${d.length}>>\nstream\n`); push(d); push('\nendstream') })
    } else obj(im, () => push('<<>>'))
  })
  const xr = pos
  push(`xref\n0 ${N + 1}\n0000000000 65535 f \n`)
  for (let i = 1; i <= N; i++) push(String(offs[i]).padStart(10, '0') + ' 00000 n \n')
  push(`trailer\n<</Size ${N + 1}/Root 1 0 R>>\nstartxref\n${xr}\n%%EOF\n`)
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

/** Extra DXF layers from feature modules: each returns entities via the helpers. */
export interface DxfHelpers {
  line: (ly: string, x1: number, y1: number, x2: number, y2: number) => void
  poly: (ly: string, pts: [number, number][]) => void
  text: (ly: string, x: number, y: number, h: number, t: string, rot?: number) => void
  circle: (ly: string, x: number, y: number, r: number) => void
}
export type DxfSource = { layers: Record<string, number>; draw: (S: Design, h: DxfHelpers) => void }

/** The plan as a DXF R12 drawing in millimetres (y flipped so north is up). */
export function dxfBuild(S: Design, cat: Catalog, extra: DxfSource[] = []): string {
  const L: string[] = [], layers: Record<string, number> = { WALLS: 7, DOORS: 3, WINDOWS: 5, ROOMS: 8, FURNITURE: 2, TEXT: 7, DIMS: 1 }
  for (const x of extra) Object.assign(layers, x.layers)
  const g = (c: number, v: string | number) => L.push(String(c), String(v)), M = (v: number) => +(v * 1000).toFixed(1)
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(0, 'ENDSEC')
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(layers).length)
  for (const [n, c] of Object.entries(layers)) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, c); g(6, 'CONTINUOUS') }
  g(0, 'ENDTAB'); g(0, 'ENDSEC'); g(0, 'SECTION'); g(2, 'ENTITIES')
  const line = (ly: string, x1: number, y1: number, x2: number, y2: number) => { g(0, 'LINE'); g(8, ly); g(10, M(x1)); g(20, M(-y1)); g(30, 0); g(11, M(x2)); g(21, M(-y2)); g(31, 0) }
  const poly = (ly: string, pts: [number, number][]) => pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; line(ly, p[0], p[1], q[0], q[1]) })
  const text = (ly: string, x: number, y: number, h: number, t: string, rot = 0) => { g(0, 'TEXT'); g(8, ly); g(10, M(x)); g(20, M(-y)); g(30, 0); g(40, M(h)); g(1, pdfTxt(t).replace(/\\/g, '')); if (rot) g(50, rot) }
  const circle = (ly: string, x: number, y: number, r: number) => { g(0, 'CIRCLE'); g(8, ly); g(10, M(x)); g(20, M(-y)); g(30, 0); g(40, M(r)) }
  const arc = (x: number, y: number, r: number, a0: number, a1: number) => { g(0, 'ARC'); g(8, 'DOORS'); g(10, M(x)); g(20, M(-y)); g(30, 0); g(40, M(r)); g(50, a0); g(51, a1) }
  const arcA = (a: number, b: number) => ((b - a + 360) % 360 === 90) ? [a, b] : [b, a]
  for (const r of S.rooms) { poly('ROOMS', rpts(r)); const c = rcent(r); text('TEXT', c.x - 0.6, c.y, 0.15, r.name); text('TEXT', c.x - 0.6, c.y + 0.25, 0.12, rarea(r).toFixed(1) + ' m2') }
  for (const w of S.walls) {
    const wi = wallInfo(w, S.openings), T = wi.th
    if (wi.axis === 'a') {
      const c = Math.cos(wi.ang!), s = Math.sin(wi.ang!), h = T / 2, P = (u: number, v: number): [number, number] => [w.x1 + c * u - s * v, w.y1 + s * u + c * v]
      poly('WALLS', [P(-h, -h), P(wi.len! + h, -h), P(wi.len! + h, h), P(-h, h)])
      continue
    }
    for (const [a, b] of wi.segs) {
      if (wi.axis === 'h') poly('WALLS', [[a, wi.c - T / 2], [b, wi.c - T / 2], [b, wi.c + T / 2], [a, wi.c + T / 2]])
      else poly('WALLS', [[wi.c - T / 2, a], [wi.c + T / 2, a], [wi.c + T / 2, b], [wi.c - T / 2, b]])
    }
    for (const o of wi.ops) {
      const lo = o.p - o.w / 2, hi = o.p + o.w / 2, f = o.flip || -1, h = wi.axis === 'h'
      const P = (u: number, n: number): [number, number] => h ? [u, wi.c + n] : [wi.c + n, u]
      if (o.kind === 'window') {
        const a = P(lo, -T / 2), b = P(hi, -T / 2), c = P(lo, T / 2), d = P(hi, T / 2), m1 = P(lo, 0), m2 = P(hi, 0)
        line('WINDOWS', a[0], a[1], c[0], c[1]); line('WINDOWS', b[0], b[1], d[0], d[1]); line('WINDOWS', m1[0], m1[1], m2[0], m2[1])
      } else {
        const dt = o.dt || 'single'
        if (dt === 'single' || dt === 'double') {
          const half = dt === 'double' ? o.w / 2 : o.w, hs: [number, number][] = dt === 'double' ? [[lo, 1], [hi, -1]] : [[lo, 1]]
          for (const [hu, dir] of hs) {
            const A = P(hu, 0), B = P(hu, f * half)
            line('DOORS', A[0], A[1], B[0], B[1])
            const cl = h ? (dir > 0 ? 0 : 180) : (dir > 0 ? 270 : 90), op = h ? (f > 0 ? 270 : 90) : (f > 0 ? 0 : 180)
            const [a0, a1] = arcA(cl % 360, op % 360)
            arc(A[0], A[1], half, a0, a1)
          }
        } else { const a = P(lo, 0), b = P(hi, 0); line('DOORS', a[0], a[1], b[0], b[1]) }
      }
    }
  }
  for (const it of S.items) {
    const k = cat[it.type]
    if (!k) continue
    const a = it.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), R = (x: number, y: number): [number, number] => [it.x + x * c - y * s, it.y + x * s + y * c], hw = it.w / 2, hd = it.d / 2
    poly('FURNITURE', [R(-hw, -hd), R(hw, -hd), R(hw, hd), R(-hw, hd)])
    text('TEXT', it.x - hw * 0.8, it.y, Math.min(0.1, it.w * 0.18), k.n)
  }
  for (const d of S.dims) {
    const dx = d.x2 - d.x1, dy = d.y2 - d.y1, Ln = Math.hypot(dx, dy), ux = dx / Ln, uy = dy / Ln, nx = -uy * d.o, ny = ux * d.o
    line('DIMS', d.x1, d.y1, d.x1 + nx, d.y1 + ny); line('DIMS', d.x2, d.y2, d.x2 + nx, d.y2 + ny); line('DIMS', d.x1 + nx, d.y1 + ny, d.x2 + nx, d.y2 + ny)
    text('DIMS', (d.x1 + d.x2) / 2 + nx, (d.y1 + d.y2) / 2 + ny - 0.05, 0.12, Ln.toFixed(2) + ' m')
  }
  for (const x of extra) x.draw(S, { line, poly, text, circle })
  g(0, 'ENDSEC'); g(0, 'EOF')
  return L.join('\n') + '\n'
}
