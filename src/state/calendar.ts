import { formatYm } from '../engine/dates'
import { money } from '../engine/format'
import type { Milestone, PaidEvent, Scenario, SimResult, YearMonth } from '../engine/types'

/**
 * The plan's payment months as an iCalendar (.ics) file, for Google, Apple or Outlook calendars.
 * Dates are month-level, so each month with payments is one all-day event on the 1st,
 * with a reminder a week before. UIDs are stable per plan and month, so importing again
 * updates the events rather than duplicating them (in calendars that honour UIDs).
 */
export function calendarIcs(scenario: Scenario, result: SimResult, opts: { from: YearMonth; now?: Date }): string {
  const resale = scenario.flat.saleType === 'resale'
  const milestoneLabel: Record<Milestone, string> = resale
    ? { application: 'Application', booking: 'Option to Purchase', afl: 'Exercise option', keys: 'Completion (keys)' }
    : { application: 'Application', booking: 'Booking', afl: 'AFL signing', keys: 'Key collection' }

  const months = new Map<YearMonth, { milestones: Milestone[]; events: PaidEvent[] }>()
  const at = (ym: YearMonth) => {
    let m = months.get(ym)
    if (!m) months.set(ym, (m = { milestones: [], events: [] }))
    return m
  }
  for (const [m, ym] of Object.entries(result.milestones) as [Milestone, YearMonth][]) {
    // Open booking and resale have no separate application month.
    if (m === 'application' && (scenario.flat.saleType === 'OBF' || resale)) continue
    if (m === 'afl' && ym === result.milestones.keys) continue // completed flats: AFL and keys together
    at(ym).milestones.push(m)
  }
  let firstMortgage = true
  for (const e of result.events) {
    if (e.kind === 'rent' || e.kind === 'voluntaryCpf' || e.kind === 'loanChange') continue
    if (e.kind === 'mortgage') {
      if (!firstMortgage) continue
      firstMortgage = false
    } else if (/#\d+$/.test(e.itemId) && !e.itemId.endsWith('#1')) continue // repeats of recurring items
    at(e.ym).events.push(e)
  }

  const stamp = utc(opts.now ?? new Date())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BTO Money Timeline//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(scenario.name)}`]
  for (const ym of [...months.keys()].sort()) {
    if (ym < opts.from) continue
    const { milestones, events } = months.get(ym)!
    const due = events.filter((e) => e.kind !== 'grant' && e.amount > 0)
    const title = milestones.length
      ? milestones.map((m) => milestoneLabel[m]).join(' + ') + (due.length ? ` · pay ${money(sum(due))}` : '')
      : due.length === 1 ? `${due[0].label}: ${money(due[0].amount)}` : `Flat payments: ${money(sum(due))}`
    const body = [
      `Due in ${formatYm(ym)} (the plan works in months; check HDB's or your bank's notice for the exact date).`,
      '',
      ...events.map(describe),
      '',
      'Estimates only, from your BTO Money Timeline plan.',
    ]
    lines.push('BEGIN:VEVENT',
      `UID:${scenario.id}-${ym}@bto-money-timeline`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(ym)}`,
      `DTEND;VALUE=DATE:${ymd(ym, 2)}`,
      `SUMMARY:${text(title)}`,
      `DESCRIPTION:${text(body.join('\n'))}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P7D', `DESCRIPTION:${text(title)}`, 'END:VALARM',
      'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** How many months the file would have events in (to say so, or that there are none). */
export function calendarEventCount(ics: string): number {
  return ics.split('BEGIN:VEVENT').length - 1
}

function describe(e: PaidEvent): string {
  if (e.kind === 'grant') return `• ${e.label}: +${money(e.amount)}`
  if (e.amount < 0) return `• ${e.label}: +${money(-e.amount)} in`
  const split = e.fromCpf > 0 ? ` (${[e.fromCash ? `${money(e.fromCash)} cash` : '', `${money(e.fromCpf)} CPF OA`].filter(Boolean).join(' + ')})` : ' (cash)'
  const monthly = e.kind === 'mortgage' ? ' a month from here on' : ''
  return `• ${e.label}: ${money(e.amount)}${monthly}${split}` +
    (e.shortfall > 0 ? ` — short by ${money(e.shortfall)} in the plan` : '')
}

const sum = (es: PaidEvent[]) => es.reduce((t, e) => t + e.amount, 0)
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (ym: YearMonth, day = 1) => ym.replace('-', '') + pad(day)
const utc = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
/** RFC 5545 TEXT: escape backslashes, semicolons, commas and newlines. */
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Fold lines longer than 75 octets (UTF-8), without splitting a character. */
function fold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let size = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (size + n > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; size = 0 }
    cur += ch
    size += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}
