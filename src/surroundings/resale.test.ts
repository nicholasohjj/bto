import { describe, expect, it } from 'vitest'
import { resaleHtml, summarise, type Sale } from './resale'

const sale = (t: string, p: number, d: number, m = '2026-09', l = 2000): Sale => ({ m, t, b: '1', s: 'TEST ST 1', f: '04–06', a: 90, l, p, at: [d, 0], d })

describe('resale prices nearby', () => {
  const rows = [sale('4R', 500000, 200), sale('4R', 600000, 900, '2026-10', 1990), sale('4R', 700000, 400), sale('4R', 2000000, 1200), sale('3R', 400000, 300)]

  it('summarises sales within 1 km by flat type', () => {
    const s = summarise(rows, (x) => x.d)
    expect(s.map((x) => x.type)).toEqual(['3R', '4R'])
    const four = s[1]
    expect(four).toMatchObject({ n: 3, median: 600000, low: 500000, high: 700000, leaseFrom: 1990, leaseTo: 2000 })
    expect(four.latest[0].m).toBe('2026-10')
    expect(four.perM2).toBeCloseTo(600000 / 90)
  })

  it('takes the median of an even count as the middle two', () => {
    expect(summarise([sale('5R', 1, 0), sale('5R', 3, 0)], (x) => x.d)[0].median).toBe(2)
  })

  it('renders the section, or nothing without a snapshot', () => {
    const file = { fetched: '2026-10-16', from: '2025-11', to: '2026-10', source: '', rows }
    const h = resaleHtml(file, summarise(rows, (x) => x.d), 'Block 1', '4R')
    expect(h).toContain('Resale prices within 1 km')
    expect(h).toContain('this flat type')
    expect(h).toContain('$600k')
    expect(resaleHtml(null, [], 'x')).toBe('')
  })
})
