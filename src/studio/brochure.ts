/**
 * Reading HDB sales brochures (PDF): find the block floor plan pages, read their vector drawing
 * (walls are solid fills, partitions and windows are stroked lines, door swings are curves) and
 * their text, and find the scale bar. Everything is in page points with y pointing down.
 */
import type { Pt } from './model'

export interface Fill { pts: Pt[]; dark: boolean }
export interface Seg { x1: number; y1: number; x2: number; y2: number }
export interface Curve { p0: Pt; p1: Pt; p2: Pt; p3: Pt }
export interface Txt { s: string; x: number; y: number; size: number }
export interface PagePrims { w: number; h: number; fills: Fill[]; segs: Seg[]; curves: Curve[]; texts: Txt[] }

type M6 = [number, number, number, number, number, number]
const mul = (a: M6, b: M6): M6 => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]
const ap = (m: M6, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** The pdf.js operator codes this reader needs (pdfjs.OPS). */
export interface Ops { constructPath: number; save: number; restore: number; transform: number; paintFormXObjectBegin: number; paintFormXObjectEnd: number; setFillRGBColor: number; fill: number; eoFill: number; fillStroke: number; eoFillStroke: number; closeFillStroke: number; closeEOFillStroke: number; stroke: number; closeStroke: number }

const darkHex = (c: unknown) => {
  if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) {
    const n = parseInt(c.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.35
  }
  if (Array.isArray(c) && c.length >= 3) return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 < 0.35
  return true
}

/**
 * Turn a pdf.js operator list into fills, line segments and curves, in viewport coordinates
 * (`vt` is the viewport transform at scale 1, so units are points with y down).
 */
export function readOperators(list: { fnArray: number[]; argsArray: unknown[] }, O: Ops, vt: M6, w: number, h: number): Omit<PagePrims, 'texts'> {
  const fills: Fill[] = [], segs: Seg[] = [], curves: Curve[] = []
  let ctm: M6 = [1, 0, 0, 1, 0, 0], dark = true
  const stack: { ctm: M6; dark: boolean }[] = []
  const FILL = new Set([O.fill, O.eoFill, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke])
  const STROKE = new Set([O.stroke, O.closeStroke, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke])
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i], args = list.argsArray[i] as any
    if (fn === O.save) stack.push({ ctm, dark })
    else if (fn === O.restore) { const s = stack.pop(); if (s) { ctm = s.ctm; dark = s.dark } }
    else if (fn === O.transform) ctm = mul(args as M6, ctm)
    else if (fn === O.paintFormXObjectBegin) { stack.push({ ctm, dark }); if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = mul(args[0] as M6, ctm) }
    else if (fn === O.paintFormXObjectEnd) { const s = stack.pop(); if (s) { ctm = s.ctm; dark = s.dark } }
    else if (fn === O.setFillRGBColor) dark = darkHex(args?.[0] ?? args)
    else if (fn === O.constructPath) {
      const op = args[0] as number, buf = args[1]?.[0] as ArrayLike<number> | undefined
      if (!buf || (!FILL.has(op) && !STROKE.has(op))) continue
      const T = (x: number, y: number) => { const p = ap(ctm, x, y); return ap(vt, p[0], p[1]) }
      const subs: Pt[][] = []
      let cur: Pt[] = [], last: Pt = [0, 0], start: Pt = [0, 0]
      for (let k = 0; k < buf.length;) {
        const c = buf[k]
        if (c === 0) { if (cur.length) subs.push(cur); last = start = T(buf[k + 1], buf[k + 2]); cur = [last]; k += 3 }
        else if (c === 1) { const p = T(buf[k + 1], buf[k + 2]); if (STROKE.has(op)) segs.push({ x1: last[0], y1: last[1], x2: p[0], y2: p[1] }); cur.push(p); last = p; k += 3 }
        else if (c === 2) {
          const p1 = T(buf[k + 1], buf[k + 2]), p2 = T(buf[k + 3], buf[k + 4]), p3 = T(buf[k + 5], buf[k + 6])
          if (STROKE.has(op)) curves.push({ p0: last, p1, p2, p3 })
          cur.push(p3); last = p3; k += 7
        } else if (c === 3) { const p3 = T(buf[k + 3], buf[k + 4]); cur.push(p3); last = p3; k += 5 }
        else if (c === 4) { if (STROKE.has(op) && (last[0] !== start[0] || last[1] !== start[1])) segs.push({ x1: last[0], y1: last[1], x2: start[0], y2: start[1] }); last = start; k += 1 }
        else break
      }
      if (cur.length) subs.push(cur)
      if (FILL.has(op)) for (const s of subs) if (s.length >= 3) fills.push({ pts: s, dark })
    }
  }
  return { w, h, fills, segs, curves }
}

/** Points per metre from a "SCALE 0 2 4 6 8 10 METRES" bar: its tick marks and the largest number. */
export function findScale(p: PagePrims): number | null {
  const lab = p.texts.find((t) => /METRE/i.test(t.s)) ?? p.texts.find((t) => /^SCALE/i.test(t.s))
  if (!lab) return null
  const row = p.texts.filter((t) => Math.abs(t.y - lab.y) < 6)
  const nums = row.flatMap((t) => (t.s.match(/\d+(\.\d+)?/g) ?? []).map(Number)).filter((n) => n > 0 && n <= 100)
  const max = Math.max(...nums)
  if (!isFinite(max)) return null
  const x0 = Math.min(...row.map((t) => t.x)) - 30, x1 = Math.max(...row.map((t) => t.x)) + 80
  // Short vertical ticks within the label row, a little above or below the numbers.
  const ticks = p.segs.filter((s) => Math.abs(s.x1 - s.x2) < 0.3 && Math.abs(s.y2 - s.y1) > 2 && Math.abs(s.y2 - s.y1) < 14 && s.x1 > x0 && s.x1 < x1 && Math.abs((s.y1 + s.y2) / 2 - lab.y) < 18)
  const xs = [...new Set(ticks.map((s) => +s.x1.toFixed(1)))].sort((a, b) => a - b)
  if (xs.length < 2) return null
  const span = xs[xs.length - 1] - xs[0]
  return span > 10 ? span / max : null
}

export interface PlanPage { page: number; title: string; units: { label: string; x: number; y: number }[] }
/** Pages that look like block floor plans: a scale bar and unit labels. */
export function isPlanPage(texts: Txt[]) {
  const all = texts.map((t) => t.s).join(' ')
  return /SCALE/i.test(all) && /METRE/i.test(all) && /UNIT\s*\d+/i.test(all)
}
/** "BLOCK 200A", reading text pieces on the same line together (PDFs often split words). */
export function planTitle(texts: Txt[]) {
  for (const t of texts.filter((x) => /^\s*BLOCK/i.test(x.s))) {
    const line = texts.filter((x) => Math.abs(x.y - t.y) < 2 && x.x >= t.x - 1 && x.x < t.x + 200).sort((p, q) => p.x - q.x).map((x) => x.s).join(' ')
    const m = line.match(/BLOCK\s+(\w+)/i)
    if (m) return `Block ${m[1].toUpperCase()}`
  }
  return ''
}
export function unitLabels(texts: Txt[]) {
  return texts.filter((t) => /^UNIT\s*\d+/i.test(t.s.trim())).map((t) => ({ label: t.s.trim(), x: t.x, y: t.y }))
}

/* pdf.js glue (browser only) */
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any> }
let lib: Promise<any> | null = null
async function pdfjs() {
  if (!lib) {
    lib = (async () => {
      const [m, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      m.GlobalWorkerOptions.workerSrc = worker.default
      return m
    })()
  }
  return lib
}
export async function openPdf(data: ArrayBuffer): Promise<PdfDoc> {
  const m = await pdfjs()
  return m.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise
}
export async function pageTexts(doc: PdfDoc, n: number): Promise<Txt[]> {
  const page = await doc.getPage(n), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent()
  return tc.items.filter((t: any) => typeof t.str === 'string' && t.str.trim()).map((t: any) => {
    const [x, y] = ap(vp.transform as M6, t.transform[4], t.transform[5])
    return { s: t.str as string, x, y, size: Math.hypot(t.transform[2], t.transform[3]) }
  })
}
export async function readPage(doc: PdfDoc, n: number): Promise<PagePrims> {
  const m = await pdfjs(), page = await doc.getPage(n), vp = page.getViewport({ scale: 1 })
  const prims = readOperators(await page.getOperatorList(), m.OPS, vp.transform as M6, vp.width, vp.height)
  return { ...prims, texts: await pageTexts(doc, n) }
}
/** Find the block floor plan pages (reads every page's text). */
export async function findPlanPages(doc: PdfDoc, onProgress?: (i: number, n: number) => void): Promise<PlanPage[]> {
  const out: PlanPage[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    onProgress?.(n, doc.numPages)
    const t = await pageTexts(doc, n)
    if (isPlanPage(t)) out.push({ page: n, title: planTitle(t), units: unitLabels(t) })
  }
  return out
}
/** Render a page to a canvas at `scale` pixels per point. */
export async function renderPage(doc: PdfDoc, n: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n), vp = page.getViewport({ scale }), c = document.createElement('canvas')
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise
  return c
}
