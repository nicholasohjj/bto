import { describe, expect, it } from 'vitest'
import { CATALOG } from './catalog'
import { loadState } from './model'
import { SIZES, applySize, currentSize, sizeHtml, tvWidth } from './sizes'

const item = (type: string) => loadState({ items: [{ type, x: 1, y: 1, rot: 0 }] }, (i) => CATALOG[i.type]).items[0]

describe('size presets', () => {
  it('works out TV widths from the diagonal', () => {
    // A 55-inch 16:9 panel is 1.218 m wide; plus about a centimetre of bezel.
    expect(tvWidth(55)).toBeCloseTo(1.228, 3)
    expect(tvWidth(65)).toBeCloseTo(1.449, 3)
  })
  it('only lists presets for catalogue items, with sensible sizes', () => {
    for (const [k, list] of Object.entries(SIZES)) {
      expect(CATALOG[k], k).toBeDefined()
      for (const p of list) { expect(p.w).toBeGreaterThan(0.05); expect(p.w).toBeLessThan(4); expect(p.d).toBeGreaterThan(0.05); expect(p.d).toBeLessThan(3) }
    }
  })
  it('recognises the default queen bed as the Singapore queen size', () => {
    const b = item('bed_q')
    expect(SIZES.bed_q[currentSize(b)].n).toMatch(/Queen/)
    expect(sizeHtml(b)).toContain('selected')
  })
  it('applies a size and names IKEA products without overwriting the user’s own name', () => {
    const s = item('sofa'), kivik = SIZES.sofa.findIndex((p) => p.nm === 'IKEA KIVIK 3-seat sofa')
    applySize(s, kivik)
    expect([s.w, s.d, s.nm]).toEqual([2.28, 0.95, 'IKEA KIVIK 3-seat sofa'])
    applySize(s, 0)
    expect(s.nm).toBe('')
    s.nm = 'Castlery Dawson'
    applySize(s, kivik)
    expect(s.nm).toBe('Castlery Dawson')
    expect(applySize(s, 99)).toBe(false)
  })
  it('has nothing to offer for items without presets', () => {
    expect(sizeHtml(item('plant'))).toBe('')
  })
})
