import { describe, expect, it } from 'vitest'
import { BROCHURE_LAYOUTS, parseStudioSummary, studioUrl } from '../../state/studio'
import { seedScenario } from '../../state/defaults'
import layoutsJs from '../../../public/studio/layouts.js?raw'

describe('Flat Studio link', () => {
  it('reads the studio summary and ignores bad values', () => {
    expect(parseStudioSummary(null)).toBeNull()
    expect(parseStudioSummary('not json')).toBeNull()
    expect(parseStudioSummary('{"name":"Home","reno":30000,"furniture":-5,"cap":"x","at":1}'))
      .toEqual({ name: 'Home', reno: 30000, furniture: 0, cap: 0, at: 1 })
  })
  it('passes the renovation + furniture budget and flat type', () => {
    const s = seedScenario()
    const budget = s.costs.filter((c) => c.kind === 'reno' || c.kind === 'furniture').reduce((t, c) => t + c.amount, 0)
    const q = new URLSearchParams(studioUrl(s).split('?')[1])
    expect(q.get('cap')).toBe(String(budget))
    expect(['3', '4', '5']).toContain(q.get('flat'))
  })
})

describe('Brochure layouts', () => {
  it('opens the brochure unit for a plan picked from a project that has one', () => {
    const s = seedScenario()
    s.flat.project = { launch: '2026-06', id: 'berlayar-rise' }
    s.flat.type = '3R'
    expect(new URLSearchParams(studioUrl(s).split('?')[1]).get('layout')).toBe('berlayar-rise/3R')
    expect(new URLSearchParams(studioUrl(s, 'berlayar-rise/2R-2').split('?')[1]).get('layout')).toBe('berlayar-rise/2R-2')
    s.flat.project = undefined
    expect(new URLSearchParams(studioUrl(s).split('?')[1]).get('layout')).toBeNull()
  })
  it('lists only layouts that exist in the studio', () => {
    const src = layoutsJs
    const data = JSON.parse(src.slice(src.indexOf('=') + 1).trim().replace(/;$/, ''))
    for (const list of Object.values(BROCHURE_LAYOUTS)) for (const l of list) expect(data[l.key], l.key).toBeDefined()
  })
})

describe('Export with a Flat Studio design', () => {
  it('adds the design when there is one, and still imports', async () => {
    const { exportJson, importJson } = await import('../../state/storage')
    const s = seedScenario()
    const design = { name: 'Home', walls: [{ x1: 0, y1: 0, x2: 1, y2: 0 }] }
    const text = exportJson([s], design)
    expect(JSON.parse(text).studio).toEqual(design)
    expect(importJson(text, [])).toHaveLength(1)
    expect(JSON.parse(exportJson([s])).studio).toBeUndefined()
  })
})
