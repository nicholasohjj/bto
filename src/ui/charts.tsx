import { useEffect, useRef, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatYm } from '../engine/dates'
import { layoutLabels } from './labelLayout'
import { money, moneyShort } from '../engine/format'
import type { Milestone, PaidEvent, SimResult } from '../engine/types'

const MILESTONE_LABEL: Record<Milestone, string> = { application: 'Apply', booking: 'Booking', afl: 'AFL', keys: 'Keys' }
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)']

function shortYm(ym: string) {
  const [y, m] = ym.split('-')
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} ’${y.slice(2)}`
}

/** Second and later occurrences of a recurring item ("rent#2") — not marked on the chart. */
const isRepeat = (itemId: string) => /#\d+$/.test(itemId) && !itemId.endsWith('#1')

const legendText = (value: string) => <span style={{ color: 'var(--ink-2)' }}>{value}</span>

const axisProps = {
  stroke: 'var(--axis)',
  tick: { fill: 'var(--muted)', fontSize: 11 },
  tickLine: false,
} as const

interface TipRow { key: string; name: string; value: number; color: string; dashed?: boolean }

function TipBox({ title, rows, events }: { title: string; rows: TipRow[]; events?: PaidEvent[] }) {
  return (
    <div className="max-w-72 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg">
      <div className="mb-1.5 font-semibold text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 py-0.5">
          <svg width="16" height="6" aria-hidden><line x1="0" y1="3" x2="16" y2="3" stroke={r.color} strokeWidth="2" strokeDasharray={r.dashed ? '4 3' : undefined} /></svg>
          <span className={`tnum font-semibold ${r.value < 0 ? 'text-critical' : 'text-ink'}`}>{money(r.value)}</span>
          <span className="text-ink-2">{r.name}</span>
        </div>
      ))}
      {events && events.length > 0 && (
        <div className="mt-2 border-t border-line pt-2">
          {events.slice(0, 6).map((e) => (
            <div key={e.itemId} className="flex justify-between gap-3 py-0.5 text-ink-2">
              <span className="truncate">{e.label}</span>
              <span className="tnum text-ink">{e.kind === 'grant' ? '+' : ''}{money(Math.abs(e.amount))}</span>
            </div>
          ))}
          {events.length > 6 && <div className="text-muted">+{events.length - 6} more</div>}
        </div>
      )}
    </div>
  )
}

/** Width of an element, kept up to date as it resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

const Y_AXIS_WIDTH = 48
const MARGIN_RIGHT = 8
const LABEL_ROW = 13

export function TimelineChart({ result, perPartner, names }: { result: SimResult; perPartner: boolean; names: [string, string] }) {
  const [boxRef, boxWidth] = useWidth<HTMLDivElement>()
  const data = result.months.map((m) => ({
    ym: m.ym,
    cash: Math.round(m.combined.cash),
    oa: Math.round(m.combined.oa),
    cashA: Math.round(m.perPartner.A.cash),
    cashB: Math.round(m.perPartner.B.cash),
    oaA: Math.round(m.perPartner.A.oa),
    oaB: Math.round(m.perPartner.B.oa),
  }))
  const eventsByYm = new Map<string, PaidEvent[]>()
  for (const e of result.events) {
    if (e.kind === 'mortgage' || e.kind === 'rent') continue
    const list = eventsByYm.get(e.ym) ?? []
    list.push(e)
    eventsByYm.set(e.ym, list)
  }
  const firstYm = data[0]?.ym
  const lastYm = data[data.length - 1]?.ym
  const inRange = (ym: string) => ym >= firstYm && ym <= lastYm
  const bigPayments = [...eventsByYm.entries()].filter(([ym, evs]) => inRange(ym) && evs.some((e) => Math.abs(e.amount) >= 1000 && e.kind !== 'grant' && !isRepeat(e.itemId)))
  const milestoneYms = new Set(Object.values(result.milestones))
  // Shade each run of negative-cash months, from its first month to the month after it ends.
  const negRuns: [string, string][] = []
  result.months.forEach((m, i) => {
    const neg = m.combined.cash < 0 || (perPartner && (m.perPartner.A.cash < 0 || m.perPartner.B.cash < 0))
    if (!neg) return
    const end = result.months[Math.min(i + 1, result.months.length - 1)].ym
    const last = negRuns[negRuns.length - 1]
    if (last && last[1] === m.ym) last[1] = end
    else negRuns.push([m.ym, end])
  })

  // Milestone labels: stack into rows when they'd overlap.
  const milestones = (Object.entries(result.milestones) as [Milestone, string][]).filter(([, ym]) => inRange(ym))
  const plotWidth = Math.max(1, boxWidth - Y_AXIS_WIDTH - MARGIN_RIGHT)
  const pxPerMonth = plotWidth / Math.max(1, data.length - 1)
  const { rows: labelRow, x: labelX, rowCount } = layoutLabels(
    milestones.map(([m, ym]) => ({ key: m, index: data.findIndex((d) => d.ym === ym), text: MILESTONE_LABEL[m] })),
    pxPerMonth,
    plotWidth,
  )
  const topMargin = 8 + rowCount * LABEL_ROW

  const lines = perPartner
    ? [
        { key: 'cashA', name: `${names[0]} cash`, color: SERIES[0] },
        { key: 'cashB', name: `${names[1]} cash`, color: SERIES[0], dashed: true },
        { key: 'oaA', name: `${names[0]} CPF OA`, color: SERIES[1] },
        { key: 'oaB', name: `${names[1]} CPF OA`, color: SERIES[1], dashed: true },
      ]
    : [
        { key: 'cash', name: 'Cash', color: SERIES[0] },
        { key: 'oa', name: 'CPF OA', color: SERIES[1] },
      ]

  return (
    <div ref={boxRef} className="h-72 w-full sm:h-80" role="img" aria-label="Cash and CPF OA balances by month. See the payment schedule for the table view.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: topMargin, right: MARGIN_RIGHT, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="ym" tickFormatter={shortYm} minTickGap={24} {...axisProps} />
          <YAxis tickFormatter={moneyShort} width={48} {...axisProps} axisLine={false} />
          {negRuns.map(([x1, x2]) => (
            <ReferenceArea key={`neg-${x1}`} x1={x1} x2={x2} fill="var(--critical)" fillOpacity={0.14} stroke="none" />
          ))}
          <ReferenceLine y={0} stroke="var(--axis)" />
          {bigPayments.filter(([ym]) => !milestoneYms.has(ym)).map(([ym]) => (
            <ReferenceLine key={`p-${ym}`} x={ym} stroke="var(--muted)" strokeOpacity={0.5} strokeDasharray="2 3" />
          ))}
          {milestones.map(([m, ym]) => (
            <ReferenceLine key={m} x={ym} stroke="var(--ink-2)" strokeWidth={1}
              label={(props: { viewBox?: { x?: number; y?: number } }) => {
                const y = (props.viewBox?.y ?? 0) - 4 - (labelRow[m] ?? 0) * LABEL_ROW
                const cx = labelX[m] !== undefined ? Y_AXIS_WIDTH + labelX[m] : (props.viewBox?.x ?? 0)
                return (
                  <text x={cx} y={y} textAnchor="middle" fill="var(--ink-2)" fontSize={11}>{MILESTONE_LABEL[m]}</text>
                )
              }} />
          ))}
          <Tooltip
            cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }}
            content={({ active, label }) => {
              if (!active || !label) return null
              const row = data.find((d) => d.ym === label)
              if (!row) return null
              return (
                <TipBox
                  title={formatYm(String(label))}
                  rows={lines.map((l) => ({ key: l.key, name: l.name, value: row[l.key as keyof typeof row] as number, color: l.color, dashed: l.dashed }))}
                  events={eventsByYm.get(String(label))}
                />
              )
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" formatter={legendText} />
          {lines.map((l) => (
            <Line key={l.key} type="linear" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2}
              strokeDasharray={l.dashed ? '5 4' : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Overlay of 2–3 scenarios: one chart per pot (never two y-scales on one chart). */
export function CompareChart({ results, names, pot }: { results: SimResult[]; names: string[]; pot: 'cash' | 'oa' }) {
  const all = new Set<string>()
  for (const r of results) for (const m of r.months) all.add(m.ym)
  const yms = [...all].sort()
  const data = yms.map((ym) => {
    const row: Record<string, number | string> = { ym }
    results.forEach((r, i) => {
      const m = r.months.find((x) => x.ym === ym)
      if (m) row[`s${i}`] = Math.round(m.combined[pot])
    })
    return row
  })
  return (
    <div className="h-64 w-full" role="img" aria-label={`${pot === 'cash' ? 'Cash' : 'CPF OA'} balance by scenario`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="ym" tickFormatter={shortYm} minTickGap={24} {...axisProps} />
          <YAxis tickFormatter={moneyShort} width={48} {...axisProps} axisLine={false} />
          <ReferenceLine y={0} stroke="var(--axis)" />
          <Tooltip
            cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }}
            content={({ active, label }) => {
              if (!active || !label) return null
              const row = data.find((d) => d.ym === label)
              if (!row) return null
              return (
                <TipBox
                  title={formatYm(String(label))}
                  rows={results.map((_, i) => ({ key: `s${i}`, name: names[i], value: Number(row[`s${i}`] ?? 0), color: SERIES[i] }))}
                />
              )
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" formatter={legendText} />
          {results.map((_, i) => (
            <Line key={i} type="linear" dataKey={`s${i}`} name={names[i]} stroke={SERIES[i]} strokeWidth={2} dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} isAnimationActive={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
