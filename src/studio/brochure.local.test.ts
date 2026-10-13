/// <reference types="node" />
// Runs only where the (git-ignored) Berlayar Rise brochure is present: checks the importer on a real block plan.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findScale, isPlanPage, readOperators, unitLabels, type PagePrims, type Txt } from './brochure'
import { vectorize } from './vectorize'

const FILE = 'brochures/berlayar_rise.pdf'

async function page(n: number): Promise<PagePrims> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(FILE)), verbosity: 0 }).promise
  const pg = await doc.getPage(n), vp = pg.getViewport({ scale: 1 })
  const prims = readOperators(await pg.getOperatorList(), pdfjs.OPS, vp.transform as never, vp.width, vp.height)
  const tc = await pg.getTextContent()
  const texts: Txt[] = (tc.items as { str?: string; transform: number[] }[]).filter((t) => t.str?.trim()).map((t) => {
    const [a, b, c, d, e, f] = vp.transform
    return { s: t.str!, x: a * t.transform[4] + c * t.transform[5] + e, y: b * t.transform[4] + d * t.transform[5] + f, size: Math.hypot(t.transform[2], t.transform[3]) }
  })
  return { ...prims, texts }
}

describe.skipIf(!existsSync(FILE))('Berlayar Rise brochure (local only)', () => {
  it('finds the scale bar and units on a block plan', async () => {
    const p = await page(17)
    expect(isPlanPage(p.texts)).toBe(true)
    expect(findScale(p)).toBeCloseTo(10.0197, 2)
    expect(unitLabels(p.texts).map((u) => u.label)).toContain('UNIT 101')
  })
  it('turns the 3-room unit 103 into walls, doors, windows and rooms', async () => {
    const p = await page(17), ppm = findScale(p)!
    const r = vectorize(p, { x0: 578, y0: 172, x1: 690, y1: 278 }, ppm)
    if (process.env.VEC_DUMP) (await import('node:fs')).writeFileSync(process.env.VEC_DUMP, JSON.stringify(r))
    expect(r.stats.structural).toBeGreaterThan(6)
    expect(r.stats.doors).toBeGreaterThanOrEqual(4)
    expect(r.stats.windows).toBeGreaterThanOrEqual(3)
    expect(r.rooms.map((x) => x.name)).toEqual(expect.arrayContaining(['Master Bedroom', 'Bedroom 2', 'Common Bath', 'Master Bath', 'Household Shelter']))
  })
})

describe.skipIf(!existsSync(FILE))('Berlayar Rise other units (local only)', () => {
  it.each([[17, { x0: 318, y0: 36, x1: 456, y1: 132 }, 'UNIT 115'], [17, { x0: 505, y0: 292, x1: 580, y1: 395 }, 'UNIT 107'], [20, { x0: 575, y0: 165, x1: 665, y1: 290 }, 'UNIT 119']] as const)('page %i box gives walls and rooms', async (n, box, unit) => {
    const p = await page(n), r = vectorize(p, box, findScale(p)!)
    expect(r.unit).toBe(unit)
    expect(r.stats.structural).toBeGreaterThan(4)
    expect(r.rooms.length).toBeGreaterThanOrEqual(2)
  })
})
