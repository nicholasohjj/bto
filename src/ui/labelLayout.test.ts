import { describe, expect, it } from 'vitest'
import { layoutLabels } from './labelLayout'

const ms = (idx: number[]) =>
  [['application', 'Apply'], ['booking', 'Booking'], ['afl', 'AFL'], ['keys', 'Keys']].map(([key, text], i) => ({ key, text, index: idx[i] }))

describe('milestone label layout', () => {
  it('keeps everything on one row when labels are far apart', () => {
    const { rows, rowCount } = layoutLabels(ms([0, 20, 40, 60]), 10)
    expect(rowCount).toBe(1)
    expect(Object.values(rows)).toEqual([0, 0, 0, 0])
  })
  it('stacks labels that would overlap (Apply, Booking, AFL close together)', () => {
    const { rows, rowCount } = layoutLabels(ms([1, 6, 12, 48]), 5) // 5px per month: 25–30px apart
    expect(rows.application).toBe(0)
    expect(rows.booking).toBe(1)
    expect(rows.afl).not.toBe(rows.booking)
    expect(rows.keys).toBe(0)
    expect(rowCount).toBeGreaterThanOrEqual(2)
  })
  it('accounts for labels nudged inside the plot at the edges', () => {
    // Apply at month 0 is nudged right; AFL 4 months later (20px) must not collide with it.
    const { rows, x } = layoutLabels(ms([0, 40, 4, 60]), 5, 300)
    expect(x.application).toBeGreaterThan(0)
    expect(rows.afl).not.toBe(rows.application)
    expect(x.keys).toBeLessThanOrEqual(300)
  })
  it('reuses a row once the earlier label is cleared', () => {
    const { rows } = layoutLabels(ms([0, 2, 30, 32]), 5)
    expect(rows.afl).toBe(0)
    expect(rows.keys).toBe(1)
  })
})
