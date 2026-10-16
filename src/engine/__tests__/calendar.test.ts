import { describe, expect, it } from 'vitest'
import { runScenario } from '..'
import { calendarEventCount, calendarIcs } from '../../state/calendar'
import { seedScenario } from '../../state/defaults'

const now = new Date(Date.UTC(2026, 9, 16, 8, 0, 0))

describe('calendar export', () => {
  const s = seedScenario()
  const r = runScenario(s)
  const ics = calendarIcs(s, r, { from: '2026-01', now })
  const unfolded = ics.replace(/\r\n /g, '')

  it('is a valid iCalendar file', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.split('BEGIN:VEVENT').length).toBe(ics.split('END:VEVENT').length)
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(ics).toContain('DTSTAMP:20261016T080000Z')
  })

  it('has one all-day event per payment month, milestones in the title', () => {
    expect(unfolded).toContain(`DTSTART;VALUE=DATE:${r.milestones.keys.replace('-', '')}01`)
    expect(unfolded).toMatch(/SUMMARY:Key collection · pay \$/)
    expect(unfolded).toMatch(/SUMMARY:AFL signing · pay \$/)
    expect(unfolded).toContain(`UID:${s.id}-${r.milestones.afl}@bto-money-timeline`)
    expect(unfolded).toContain('TRIGGER:-P7D')
  })

  it('keeps one mortgage payment and the first of recurring items', () => {
    expect(unfolded.match(/Monthly mortgage/g)).toHaveLength(1)
    expect(unfolded).not.toMatch(/\(2\/6\)/)
    expect(unfolded).not.toMatch(/Rent a room after the wedding: .* a month/)
  })

  it('escapes commas and semicolons', () => {
    const t = calendarIcs({ ...s, name: 'Us, the plan; v2' }, r, { from: '2026-01', now })
    expect(t).toContain('X-WR-CALNAME:Us\\, the plan\\; v2')
  })

  it('leaves out months before the start', () => {
    const later = calendarIcs(s, r, { from: r.milestones.keys, now })
    expect(calendarEventCount(later)).toBeLessThan(calendarEventCount(ics))
    expect(later).not.toContain(`${r.milestones.afl.replace('-', '')}01`)
  })
})
