/**
 * Common sizes for furniture and appliances, so "will it fit" uses real numbers: Singapore standard
 * mattress sizes, TV widths worked out from the screen diagonal, typical appliance sizes, and a few
 * IKEA pieces with dimensions from IKEA's product pages (checked October 2026; check your store's
 * page before buying, as regional versions differ).
 */
import type { Item } from './model'

export interface SizePreset {
  n: string
  /** Width and depth on the plan, metres. */
  w: number; d: number
  /** Product name to fill in, for named products. */
  nm?: string
  src: 'std' | 'typ' | 'ikea'
}
const std = (n: string, w: number, d: number): SizePreset => ({ n, w, d, src: 'std' })
const typ = (n: string, w: number, d: number): SizePreset => ({ n, w, d, src: 'typ' })
const ikea = (nm: string, w: number, d: number, extra = ''): SizePreset => ({ n: `${nm}${extra}, ${Math.round(w * 100)}×${Math.round(d * 100)} cm`, w, d, nm: 'IKEA ' + nm, src: 'ikea' })

/** Width of a 16:9 screen from its diagonal in inches, plus about 1 cm of bezel. */
export const tvWidth = (inch: number) => +(inch * 0.0254 * 16 / Math.hypot(16, 9) + 0.01).toFixed(3)

// Singapore mattress sizes (local bed frames are sized to these; IKEA uses European sizes).
const BEDS = [std('Single mattress 91×190', 0.91, 1.9), std('Super single mattress 107×190', 1.07, 1.9), std('Queen mattress 152×190', 1.52, 1.9), std('King mattress 183×190', 1.83, 1.9),
  ikea('MALM bed frame, high', 1.66, 2.09, ' (150×200 mattress)')]
const WARDS = [ikea('PAX wardrobe frame', 1.0, 0.58), ikea('PAX wardrobe frames', 1.5, 0.58), ikea('PAX wardrobe frames', 2.0, 0.58)]

export const SIZES: Record<string, SizePreset[]> = {
  bed_s: BEDS, bed_ss: BEDS, bed_q: BEDS, bed_k: BEDS,
  sofa: [typ('2-seat sofa', 1.6, 0.85), typ('3-seat sofa', 2.0, 0.9), ikea('KIVIK 3-seat sofa', 2.28, 0.95), ikea('EKTORP 3-seat sofa', 2.18, 0.88)],
  lsofa: [typ('L-shaped sofa', 2.7, 1.7), ikea('FRIHETEN corner sofa-bed', 2.3, 1.51)],
  ward: WARDS, wardS: WARDS,
  bookc: [ikea('KALLAX shelving unit 2×4', 0.77, 0.39)], shelf: [ikea('KALLAX shelving unit 2×4', 0.77, 0.39)],
  coffee: [typ('Coffee table', 1.2, 0.6), ikea('LACK coffee table', 0.9, 0.55)],
  desk: [typ('Desk', 1.2, 0.6), typ('Large desk', 1.4, 0.7), ikea('MICKE desk', 1.05, 0.5)],
  tv: [43, 50, 55, 65, 75, 85].map((i) => std(`${i}-inch TV`, tvWidth(i), 0.1)),
  tvc: [typ('TV console', 1.6, 0.4), typ('TV console', 1.8, 0.4), typ('TV console', 2.0, 0.45)],
  // Dining sets include room to pull chairs out (the table is 50 cm shallower than the set).
  dining: [typ('2-seat table 80×75 with chairs', 0.8, 1.25), typ('4-seat table 120×80 with chairs', 1.2, 1.3), typ('6-seat table 160×90 with chairs', 1.6, 1.4), typ('8-seat table 200×100 with chairs', 2.0, 1.5)],
  roundt: [typ('Round table 90 cm, 4 seats', 0.9, 0.9), typ('Round table 120 cm, 6 seats', 1.2, 1.2)],
  fridge: [typ('Single-door fridge', 0.55, 0.6), typ('2-door fridge', 0.6, 0.65), typ('Large 2-door fridge', 0.7, 0.72)],
  fridgeL: [typ('French-door fridge', 0.84, 0.72), typ('Side-by-side fridge', 0.91, 0.72)],
  washer: [typ('Front-load washer', 0.6, 0.6), typ('Front-load washer, deep', 0.6, 0.65), typ('Top-load washer', 0.55, 0.6)],
  dishw: [std('Dishwasher, full size', 0.6, 0.6), std('Dishwasher, slimline', 0.45, 0.6)],
  aircon: [typ('9,000 BTU indoor unit', 0.8, 0.22), typ('12,000 BTU indoor unit', 0.85, 0.22), typ('18,000 BTU indoor unit', 1.0, 0.24), typ('24,000 BTU indoor unit', 1.1, 0.25)],
  bathtub: [typ('Bathtub 150', 1.5, 0.7), typ('Bathtub 170', 1.7, 0.75)],
  shower: [typ('Shower 90×90', 0.9, 0.9), typ('Shower 100×80', 1.0, 0.8), typ('Shower 120×80', 1.2, 0.8)],
  vanity: [typ('Vanity 60', 0.6, 0.45), typ('Vanity 80', 0.8, 0.45), typ('Vanity 100', 1.0, 0.5)],
  rug: [std('Rug 120×170', 1.7, 1.2), std('Rug 160×230', 2.3, 1.6), std('Rug 200×300', 3.0, 2.0)],
}
const GROUP = { std: 'Standard sizes', typ: 'Typical sizes (check the model you buy)', ikea: 'IKEA (from IKEA product pages)' }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const near = (a: number, b: number) => Math.abs(a - b) < 0.006

/** Index of the preset an item matches now, or -1. */
export function currentSize(it: Pick<Item, 'type' | 'w' | 'd'>): number {
  return (SIZES[it.type] || []).findIndex((p) => near(p.w, it.w) && near(p.d, it.d))
}

/** A "Common sizes" select for the inspector, or '' when the item has none. */
export function sizeHtml(it: Pick<Item, 'type' | 'w' | 'd'>): string {
  const list = SIZES[it.type]
  if (!list) return ''
  const cur = currentSize(it)
  let h = `<option value="">${cur < 0 ? 'Custom size' : 'Choose a size…'}</option>`
  for (const g of ['std', 'typ', 'ikea'] as const) {
    const opts = list.map((p, i) => [p, i] as const).filter(([p]) => p.src === g)
    if (opts.length) h += `<optgroup label="${GROUP[g]}">${opts.map(([p, i]) => `<option value="${i}"${i === cur ? ' selected' : ''}>${esc(p.n)}</option>`).join('')}</optgroup>`
  }
  return `<label class="row"><span>Common sizes</span><select data-size="1">${h}</select></label>`
}

/** Apply preset `i` to an item: its size, and the product name for named products (not over the user's own name). */
export function applySize(it: Item, i: number): boolean {
  const p = (SIZES[it.type] || [])[i]
  if (!p) return false
  it.w = p.w; it.d = p.d
  const ours = !it.nm || Object.values(SIZES).some((l) => l.some((q) => q.nm === it.nm))
  if (ours) it.nm = p.nm || ''
  return true
}
