import { describe, expect, it } from 'vitest'
import { CATALOG } from './catalog'
import layouts from './layouts.json'
import { budgetLines, budgetSummary, budgetTotal } from './budget'
import { lightPlan, lightSpots, runChecks } from './checks'
import { loadState, snapBase, type Design } from './model'

const unit = (k: string): Design => loadState(structuredClone((layouts as Record<string, { design: unknown }>)[k].design), (i) => CATALOG[i.type])

describe('budget', () => {
  it('prices quantities from the design and splits renovation from furniture', () => {
    const S = unit('berlayar-rise/4R')
    S.prices = { 'i:ward': 1000, 'i:sofa': 1500, 'f:oak': 100 }
    S.extras = [{ id: 'x', name: 'Hacking', amt: 2000 }]
    const wards = S.items.filter((i) => i.type === 'ward').length
    const oak = budgetLines(S, CATALOG).find((l) => l.key === 'f:oak')!.qty
    const sum = budgetSummary(S, CATALOG)
    expect(sum.furniture).toBe(1500)
    expect(sum.reno).toBe(Math.round(wards * 1000 + oak * 100 + 2000))
    expect(budgetTotal(S, CATALOG)).toBeCloseTo(sum.furniture + wards * 1000 + oak * 100 + 2000, 0)
  })
  it('uses an item’s own price instead of the unit price', () => {
    const S = unit('berlayar-rise/3R')
    S.prices = { 'i:sofa': 1500 }
    S.items.find((i) => i.type === 'sofa')!.pr = 2222
    expect(budgetSummary(S, CATALOG).furniture).toBe(2222)
  })
})

describe('checks', () => {
  it('finds nothing to warn about in any untouched brochure layout', () => {
    for (const k of Object.keys(layouts)) {
      const S = unit(k)
      S.base = snapBase(S, (t) => !!CATALOG[t]?.wet)
      expect(runChecks(S, CATALOG).filter((c) => c.lvl === 'warn' || c.cat === 'walls' || c.cat === 'wet').map((c) => c.msg), k).toEqual([])
    }
  })
  it('flags a removed structural wall and a moved toilet', () => {
    const S = unit('berlayar-rise/2R-2')
    S.base = snapBase(S, (t) => !!CATALOG[t]?.wet)
    S.walls = S.walls.filter((w) => !(w.str && w.th === 0.35))
    S.items.find((i) => i.type === 'wc')!.x += 1.5
    const r = runChecks(S, CATALOG)
    expect(r.some((c) => c.lvl === 'warn' && /Removed wall.*structural/.test(c.msg))).toBe(true)
    expect(r.some((c) => c.lvl === 'warn' && /Toilet moved 1\.5 m/.test(c.msg))).toBe(true)
  })
  it('suggests ceiling lights inside each room', () => {
    const S = unit('berlayar-rise/2R-2')
    const bed = lightPlan(S, CATALOG).find((x) => x.r.name === 'Bedroom')!
    expect(bed.want).toBeGreaterThan(0)
    expect(lightSpots(bed.r, 2)).toHaveLength(2)
  })
})

describe('file formats', async () => {
  const { crc32, dxfBuild, pdfBuild, zipStore } = await import('./files')
  it('computes CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('writes a ZIP with the right signatures', async () => {
    const b = new Uint8Array(await zipStore([{ name: 'a.txt', data: new TextEncoder().encode('hi') }]).arrayBuffer())
    expect([...b.slice(0, 4)]).toEqual([0x50, 0x4b, 3, 4])
    expect([...b.slice(-22, -18)]).toEqual([0x50, 0x4b, 5, 6])
  })
  it('writes a PDF with an xref that points at each object', async () => {
    const t = new TextDecoder().decode(await pdfBuild([{ w: 595, h: 842, img: null, text: [{ x: 40, y: 800, s: 9, t: 'Hello (world)' }] }]).arrayBuffer())
    expect(t.startsWith('%PDF-1.4')).toBe(true)
    expect(t).toContain('(Hello \\(world\\)) Tj')
    const xr = +t.match(/startxref\n(\d+)/)![1]
    expect(t.slice(xr, xr + 4)).toBe('xref')
    const offs = [...t.slice(xr).matchAll(/^(\d{10}) 00000 n/gm)].map((m) => +m[1])
    offs.forEach((o, i) => expect(t.slice(o, o + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)))
  })
  it('writes DXF walls, doors and furniture in millimetres', () => {
    const d = dxfBuild(unit('berlayar-rise/2R-1'), CATALOG)
    expect(d).toContain('AC1009')
    for (const ly of ['WALLS', 'DOORS', 'WINDOWS', 'FURNITURE']) expect(d).toContain(`8\n${ly}\n`)
    expect(d.trim().endsWith('EOF')).toBe(true)
  })
})
