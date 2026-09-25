import { useMemo, useState } from 'react'
import { compareRows } from '../engine/compare'
import { addMonths, formatYm } from '../engine/dates'
import { jobLossImpact, withJobLoss } from '../engine/whatIf'
import { affordablePrice, type AffordLimit } from '../engine/afford'
import { money } from '../engine/format'
import type { Scenario, SimResult, Warning } from '../engine/types'
import { CompareChart } from './charts'
import { Button, Card, InfoTip, Select, T, Toggle } from './controls'
import type { Term } from './glossary'

// ---------------- Summary cards ----------------

function Stat({ label, value, sub, tip, tone }: { label: string; value: string; sub?: string; tip?: Term; tone?: 'bad' | 'good' }) {
  return (
    <Card className="!p-3">
      <div className="flex items-center text-xs text-ink-2">{label}{tip && <InfoTip term={tip} />}</div>
      <div className={`mt-1 text-xl font-semibold ${tone === 'bad' ? 'text-critical' : 'text-ink'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </Card>
  )
}

export function SummaryCards({ result }: { result: SimResult }) {
  const s = result.summary
  const grants = result.loan.grantsTotal
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <Stat label="Total paid" value={money(s.totalPaid)} sub="Until 12 months after keys" />
      <Stat label="Cash used" value={money(s.totalCashUsed)} tip="cash" />
      <Stat label="CPF used" value={money(s.totalCpfUsed)} tip="OA" sub={grants > 0 ? `incl. ${money(grants)} grants` : undefined} />
      <Stat label="Monthly mortgage" value={money(s.monthlyMortgage)} sub={`${money(result.loan.loanAmount)} over ${result.loan.tenureYears} yrs`} />
      <Stat label="Leanest cash month" value={money(s.leanestCash.amount)} sub={formatYm(s.leanestCash.ym)} tip="leanest" tone={s.leanestCash.amount < 0 ? 'bad' : undefined} />
      <Stat label="Buffer at keys" value={money(s.bufferAtKeys.cash)} sub={`cash · + ${money(s.bufferAtKeys.oa)} CPF OA`} tip="buffer" tone={s.bufferAtKeys.cash < 0 ? 'bad' : undefined} />
    </div>
  )
}

// ---------------- Warnings ----------------

const SEV: Record<Warning['severity'], { icon: string; label: string; cls: string }> = {
  error: { icon: '✖', label: 'Problem', cls: 'text-critical' },
  warning: { icon: '▲', label: 'Check', cls: 'text-serious' },
  info: { icon: 'ℹ', label: 'Note', cls: 'text-accent' },
}

export function WarningsList({ warnings }: { warnings: Warning[] }) {
  const [showInfo, setShowInfo] = useState(false)
  const main = warnings.filter((w) => w.severity !== 'info')
  const info = warnings.filter((w) => w.severity === 'info')
  return (
    <div className="space-y-2">
      {main.length === 0 && (
        <Card className="!p-3">
          <div className="flex items-center gap-2 text-sm"><span className="text-good-ink" aria-hidden>✔</span><b>No shortfalls.</b><span className="text-ink-2">Every payment can be covered by the right pot.</span></div>
        </Card>
      )}
      {main.map((w) => <WarningCard key={w.id} w={w} />)}
      {info.length > 0 && (
        <button type="button" className="text-sm text-accent" onClick={() => setShowInfo((v) => !v)}>
          {showInfo ? 'Hide' : 'Show'} {info.length} note{info.length > 1 ? 's' : ''}
        </button>
      )}
      {showInfo && info.map((w) => <WarningCard key={w.id} w={w} />)}
    </div>
  )
}

function WarningCard({ w }: { w: Warning }) {
  const sev = SEV[w.severity]
  return (
    <Card className="!p-3">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-sm ${sev.cls}`} aria-hidden>{sev.icon}</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold"><span className="sr-only">{sev.label}: </span>{w.title}</div>
          <p className="mt-1 text-sm text-ink-2">{w.explanation}</p>
          {w.fixes.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-ink">Ways to fix it</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
                {w.fixes.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// ---------------- Schedule table ----------------

export function ScheduleTable({ result }: { result: SimResult }) {
  const [showMonthly, setShowMonthly] = useState(false)
  // Rent, mortgage and 2nd+ occurrences of repeating items ("x#2") are hidden unless asked for.
  const isRoutine = (e: SimResult['events'][number]) =>
    e.kind === 'mortgage' || e.kind === 'rent' || (/#\d+$/.test(e.itemId) && !e.itemId.endsWith('#1'))
  const rows = result.events.filter((e) => showMonthly || !isRoutine(e))
  const monthlyCount = result.events.filter(isRoutine).length
  return (
    <Card className="!p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
        <div className="text-sm font-semibold">Payment schedule</div>
        {monthlyCount > 0 && <div className="w-full sm:w-72"><Toggle label={`Show repeating payments (${monthlyCount})`} checked={showMonthly} onChange={setShowMonthly} /></div>}
      </div>
      {/* Phones: one card per payment */}
      <ul className="divide-y divide-line sm:hidden">
        {rows.map((e, i) => {
          const grant = e.kind === 'grant'
          const inflow = !grant && e.amount < 0
          return (
            <li key={`${e.itemId}-m-${i}`} className={`px-3 py-2.5 ${e.milestone ? 'bg-surface-2/60' : ''}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm">{e.label}</span>
                <span className={`tnum shrink-0 text-sm font-semibold ${grant || inflow ? 'text-good-ink' : ''}`}>{grant || inflow ? '+' : ''}{money(Math.abs(e.amount))}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-xs text-ink-2 tnum">
                <span>{formatYm(e.ym)}{!grant && !inflow && <> · {e.fromCash ? `cash ${money(e.fromCash)}` : ''}{e.fromCash && e.fromCpf ? (e.fromCpf < 0 ? ' → ' : ' + ') : ''}{e.fromCpf ? (e.fromCpf < 0 ? `+${money(-e.fromCpf)} OA` : `CPF ${money(e.fromCpf)}`) : ''}</>}</span>
                <span>Left: <span className={e.after.cash < 0 ? 'font-semibold text-critical' : ''}>{money(e.after.cash)}</span> cash · {money(e.after.oa)} OA</span>
              </div>
              {e.shortfall > 0 && <div className="mt-0.5 text-xs text-critical">✖ short {money(e.shortfall)}</div>}
              {e.cpfFallbackToCash > 0.5 && e.kind !== 'mortgage' && <div className="mt-0.5 text-xs text-ink-2">{money(e.cpfFallbackToCash)} planned CPF paid in cash</div>}
            </li>
          )
        })}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-right font-medium">From cash</th>
              <th className="px-3 py-2 text-right font-medium">From CPF</th>
              <th className="px-3 py-2 text-right font-medium">Cash left</th>
              <th className="px-3 py-2 text-right font-medium">CPF OA left</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {rows.map((e, i) => {
              const grant = e.kind === 'grant'
              const inflow = !grant && e.amount < 0
              return (
                <tr key={`${e.itemId}-${i}`} className={`border-b border-line last:border-0 ${e.milestone ? 'bg-surface-2/60' : ''}`}>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">{formatYm(e.ym)}</td>
                  <td className="px-3 py-2">
                    {e.label}
                    {e.shortfall > 0 && <span className="ml-2 text-xs text-critical">✖ short {money(e.shortfall)}</span>}
                    {e.cpfFallbackToCash > 0.5 && e.kind !== 'mortgage' && <span className="ml-2 text-xs text-ink-2">({money(e.cpfFallbackToCash)} planned CPF paid in cash)</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{grant || inflow ? <span className="text-good-ink">+{money(Math.abs(e.amount))}</span> : money(e.amount)}</td>
                  <td className="px-3 py-2 text-right">{grant ? '—' : inflow ? <span className="text-good-ink">+{money(-e.fromCash)}</span> : e.fromCash ? money(e.fromCash) : '—'}</td>
                  <td className="px-3 py-2 text-right">{e.fromCpf < 0 ? <span className="text-good-ink">+{money(-e.fromCpf)}</span> : e.fromCpf ? money(e.fromCpf) : '—'}</td>
                  <td className={`px-3 py-2 text-right ${e.after.cash < 0 ? 'font-semibold text-critical' : ''}`}>{money(e.after.cash)}</td>
                  <td className="px-3 py-2 text-right">{money(e.after.oa)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------- Loan & ratios ----------------

export function LoanPanel({ result, scenario }: { result: SimResult; scenario: Scenario }) {
  const l = result.loan
  const isHdb = scenario.financing.loanType === 'HDB'
  const bar = (v: number, limit: number) => (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${v > limit ? 'bg-critical' : 'bg-accent'}`} style={{ width: `${Math.min(100, (v / Math.max(limit, 0.01)) * 100 * 0.8)}%` }} />
    </div>
  )
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs text-ink-2">Loan</div>
          <div className="text-sm tnum">{money(l.loanAmount)} at {(l.rate * 100).toFixed(2)}% for {l.tenureYears} yrs · {money(l.monthlyInstalment)}/mo</div>
          {result.loanPath.length > 1 && (
            <LoanPathList steps={result.loanPath.slice(1)} />
          )}
          {l.effectivePrice !== l.price && <div className="mt-0.5 text-xs text-ink-2">Price incl. citizen + PR premium: {money(l.effectivePrice)}</div>}
          <div className="mt-1 text-xs text-ink-2">Downpayment {money(l.downpaymentTotal)} ({Math.round((1 - l.ltvUsed) * 100)}%){l.grantsTotal > 0 && <> · grants {money(l.grantsTotal)}</>}</div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-ink-2">
            <span><T term="MSR">MSR</T> at <T term="stress">stress rate</T></span>
            <span className={`tnum ${l.msr > l.msrLimit ? 'text-critical' : 'text-ink'}`}>{(l.msr * 100).toFixed(1)}% / {(l.msrLimit * 100).toFixed(0)}%</span>
          </div>
          {bar(l.msr, l.msrLimit)}
          {!isHdb && (
            <>
              <div className="mt-2 flex items-center justify-between text-xs text-ink-2">
                <span><T term="TDSR">TDSR</T></span>
                <span className={`tnum ${l.tdsr > l.tdsrLimit ? 'text-critical' : 'text-ink'}`}>{(l.tdsr * 100).toFixed(1)}% / {(l.tdsrLimit * 100).toFixed(0)}%</span>
              </div>
              {bar(l.tdsr, l.tdsrLimit)}
            </>
          )}
          <div className="mt-1 text-[11px] text-muted">
            Based on {scenario.buyers === 'single' ? 'your' : 'combined'} income of {money(l.grossIncomeAtAssessment)}/mo in {formatYm(l.assessedAt)}
            {scenario.financing.deferredIncomeAssessment ? ' (Deferred Income Assessment)' : ' (at AFL)'}.
          </div>
        </div>
      </div>
    </Card>
  )
}

/** Loan changes over time; long runs (e.g. yearly prepayments) collapse after a few rows. */
function LoanPathList({ steps }: { steps: SimResult['loanPath'] }) {
  const [all, setAll] = useState(false)
  const shown = all || steps.length <= 5 ? steps : steps.slice(0, 4)
  const line = (p: SimResult['loanPath'][number]) => (
    <>
      {p.change === 'prepay' ? `${formatYm(p.ym)}: prepaid ${money(p.prepaid ?? 0)} (${p.prepaidFrom === 'cpf' ? 'CPF' : 'cash'}) → ` : `From ${formatYm(p.ym)}: `}
      {p.change === 'prepay' && p.monthsLeft === 0 ? 'loan fully repaid' : <>{p.change === 'refinance' ? 'bank loan at ' : ''}{(p.rate * 100).toFixed(2)}% · {money(p.instalment)}/mo</>}
      {(p.change === 'tenure' || p.change === 'refinance' || p.change === 'prepay') && p.monthsLeft > 0 ? ` · ${Math.round(p.monthsLeft / 12 * 10) / 10} yrs left` : ''}
      {p.cost ? ` · ${money(p.cost)} ${p.change === 'prepay' ? 'penalty' : 'costs'}` : ''}
    </>
  )
  const last = steps[steps.length - 1]
  return (
    <ol className="mt-1 space-y-0.5 text-xs text-ink-2 tnum">
      {shown.map((p) => <li key={`${p.ym}-${p.change}`}>{line(p)}</li>)}
      {shown.length < steps.length && (
        <li>
          <button type="button" className="text-accent" onClick={() => setAll(true)}>
            + {steps.length - shown.length} more changes
          </button>
          {' '}(last: {line(last)})
        </li>
      )}
    </ol>
  )
}

// ---------------- Accrued interest ----------------

export function AccruedView({ result, names, single = false }: { result: SimResult; names: [string, string]; single?: boolean }) {
  return (
    <div className="space-y-3">
      <Card>
        <p className="text-sm text-ink-2">
          If you sell, you must put back into your own CPF OA all the CPF you used for the flat <b className="text-ink">plus</b> the 2.5% a year it would have earned
          (<T term="accrued">accrued interest</T>). It’s not a fee — it goes back to your retirement savings — but it comes out of your sale proceeds, so less comes back as cash.
        </p>
        <p className="mt-2 text-[11px] text-muted">
          Projected by carrying on the simulation for 15 years after keys (salary raises, CPF contributions, mortgage and any rate change). Grants used also count.
          {result.cpfCapReachedYm && <> CPF use for the flat hits its limit in <b className="text-ink">{formatYm(result.cpfCapReachedYm)}</b>; after that the mortgage is paid in cash.</>}
        </p>
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        {result.accrued.map((a) => (
          <Card key={a.yearsAfterKeys}>
            <div className="text-xs text-ink-2">If sold {a.yearsAfterKeys} years after keys</div>
            <div className="mt-1 text-xl font-semibold tnum">{money(a.refundDue)}</div>
            <div className="text-[11px] text-muted">to refund to CPF</div>
            <dl className="mt-3 space-y-1 text-sm tnum">
              <div className="flex justify-between"><dt className="text-ink-2">CPF used</dt><dd>{money(a.principal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Accrued interest</dt><dd>{money(a.accrued)}</dd></div>
              {!single && (
                <>
                  <div className="flex justify-between border-t border-line pt-1 text-xs"><dt className="text-ink-2">{names[0]}</dt><dd>{money(a.perPartner.A.principal + a.perPartner.A.accrued)}</dd></div>
                  <div className="flex justify-between text-xs"><dt className="text-ink-2">{names[1]}</dt><dd>{money(a.perPartner.B.principal + a.perPartner.B.accrued)}</dd></div>
                </>
              )}
            </dl>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ---------------- Compare ----------------

export function CompareView({ scenarios, results, compareIds, onToggle }: {
  scenarios: Scenario[]; results: Map<string, SimResult>; compareIds: string[]; onToggle: (id: string) => void
}) {
  const picked = compareIds.map((id) => scenarios.find((s) => s.id === id)).filter((s): s is Scenario => !!s).slice(0, 3)
  // Plans that can't be simulated are left out, keeping names and results lined up.
  const chosen = picked.filter((s) => results.has(s.id))
  const broken = picked.filter((s) => !results.has(s.id))
  const rs = chosen.map((s) => results.get(s.id)!)
  const rows = rs.length ? compareRows(rs) : []
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 text-sm font-semibold">Pick 2–3 scenarios</div>
        <div className="flex flex-wrap gap-2">
          {scenarios.map((s) => {
            const idx = compareIds.indexOf(s.id)
            const on = idx >= 0 && idx < 3
            return (
              <button key={s.id} type="button" onClick={() => onToggle(s.id)} aria-pressed={on}
                disabled={!on && compareIds.length >= 3}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm disabled:opacity-40 ${on ? 'border-accent bg-surface-2' : 'border-line'}`}>
                {on && chosen.includes(s) && <span className="h-2 w-2 rounded-full" style={{ background: `var(--series-${chosen.indexOf(s) + 1})` }} aria-hidden />}
                {s.name}
              </button>
            )
          })}
        </div>
        {broken.length > 0 && <p className="mt-2 text-xs text-critical">Left out because {broken.length > 1 ? 'they' : 'it'} can’t be simulated: {broken.map((s) => s.name).join(', ')}. Open it and check the dates.</p>}
        <p className="mt-2 text-[11px] text-muted">Tip: use “Duplicate” on a scenario, change one thing (loan type, price, CPF slider), then compare.</p>
      </Card>
      {rs.length >= 2 ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><div className="mb-2 text-sm font-semibold">Cash</div><CompareChart results={rs} names={chosen.map((s) => s.name)} pot="cash" /></Card>
            <Card><div className="mb-2 text-sm font-semibold">CPF OA</div><CompareChart results={rs} names={chosen.map((s) => s.name)} pot="oa" /></Card>
          </div>
          <Card className="!p-0">
            {/* Phones: one block per metric */}
            <dl className="divide-y divide-line sm:hidden">
              {rows.map((r) => (
                <div key={r.label} className="px-3 py-2.5">
                  <dt className="text-xs text-ink-2">{r.label}</dt>
                  <dd className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${rs.length}, minmax(0, 1fr))` }}>
                    {r.values.map((v, i) => (
                      <span key={i} className="flex min-w-0 items-center gap-1.5 text-sm tnum">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--series-${i + 1})` }} aria-label={chosen[i].name} />
                        <span className="truncate">{r.format(v)}</span>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-2">
                    <th className="px-3 py-2 font-medium">Key numbers</th>
                    {chosen.map((s, i) => (
                      <th key={s.id} className="px-3 py-2 text-right font-medium">
                        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: `var(--series-${i + 1})` }} aria-hidden />{s.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tnum">
                  {rows.map((r) => {
                    const best = r.better === 'none' ? null : r.better === 'higher' ? Math.max(...r.values) : Math.min(...r.values)
                    const tol = r.label.includes('Ratio') ? 1e-4 : 0.5
                    const allSame = r.values.every((v) => Math.abs(v - r.values[0]) < tol)
                    return (
                      <tr key={r.label} className="border-b border-line last:border-0">
                        <td className="px-3 py-2 text-ink-2">{r.label}</td>
                        {r.values.map((v, i) => (
                          <td key={i} className={`px-3 py-2 text-right ${!allSame && best !== null && Math.abs(v - best) < tol ? 'font-semibold text-good-ink' : ''}`}>
                            {r.format(v)}
                            {i > 0 && !allSame && r.format !== undefined && r.label !== 'Problems (errors)' && (
                              <div className="text-[11px] font-normal text-muted">{diffStr(v - r.values[0], r.label.includes('Ratio'))}</div>
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line p-3 text-[11px] text-muted"><span className="sm:hidden">Dots match the scenario colours above.</span><span className="hidden sm:inline">Differences are vs the first scenario. Bold = better on that line.</span></p>
          </Card>
        </>
      ) : (
        <Card><p className="text-sm text-ink-2">Select at least two scenarios to compare.</p></Card>
      )}
    </div>
  )
}

function diffStr(d: number, isPct: boolean): string {
  if (isPct) return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)} pts`
  return `${d >= 0 ? '+' : '−'}${money(Math.abs(d))}`
}

// ---------------- What if: job loss ----------------

export function JobLossCard({ scenario, onAddScenario }: { scenario: Scenario; onAddScenario: (s: Scenario) => void }) {
  const [months, setMonths] = useState(6)
  const [when, setWhen] = useState<'now' | 'afl' | 'keys'>('keys')
  const from = when === 'now' ? scenario.startMonth : when === 'afl' ? scenario.flat.dates.afl : scenario.flat.dates.keys
  const single = scenario.buyers === 'single'
  const all = useMemo(() => jobLossImpact(scenario, months, from), [scenario, months, from])
  const results = single ? all.slice(0, 1) : all
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center text-sm font-semibold">{single ? 'What if you lose your job?' : 'What if one of you loses your job?'}<InfoTip term="whatIf" /></h2>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
        <Select value={String(months)} onChange={(v) => setMonths(Number(v))} ariaLabel="How long"
          options={[3, 6, 9, 12].map((m) => ({ value: String(m), label: `For ${m} months` }))} />
        <Select value={when} onChange={setWhen} ariaLabel="Starting"
          options={[{ value: 'now', label: 'Starting now' }, { value: 'afl', label: 'Starting at AFL' }, { value: 'keys', label: 'Starting at keys' }]} />
      </div>
      <ul className="mt-3 space-y-2">
        {results.map((r) => {
          const ok = !r.firstShortYm
          const alreadyShort = r.planFirstShortYm && r.firstShortYm && r.planFirstShortYm <= r.firstShortYm
          return (
            <li key={r.partnerIndex} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-surface-2 p-3">
              <div className="min-w-0 text-sm">
                <div className="font-medium">
                  <span aria-hidden className={ok ? 'text-good-ink' : 'text-critical'}>{ok ? '✔ ' : '✖ '}</span>
                  {r.name} out of work {formatYm(r.from)} – {formatYm(addMonths(r.from, r.months - 1))}
                </div>
                <div className="mt-0.5 text-xs text-ink-2">
                  Living costs of about {money(r.monthlyCosts)}/month from savings. Lowest cash afterwards{' '}
                  <span className={`tnum ${r.leanestCash.amount < 0 ? 'text-critical' : 'text-ink'}`}>{money(r.leanestCash.amount)}</span>
                  {' '}({r.leanestChange < 0 ? '−' : '+'}{money(Math.abs(r.leanestChange))} vs plan, {formatYm(r.leanestCash.ym)}).
                  {!r.firstShortYm
                    ? ' You’d stay above zero.'
                    : alreadyShort
                      ? <> Your plan already runs short in {formatYm(r.planFirstShortYm!)}; this makes it worse.</>
                      : <> Cash runs out in <b className="text-critical">{formatYm(r.firstShortYm)}</b>.</>}
                </div>
              </div>
              <Button variant="secondary" className="shrink-0 text-xs" onClick={() => onAddScenario(withJobLoss(scenario, r.partnerIndex, r.from, r.months))}>
                Add as scenario
              </Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ---------------- How much can we afford? ----------------

const LIMIT_TEXT: Record<AffordLimit, string> = {
  cash: 'you’d run short of cash',
  msr: 'the mortgage would take more than the lender’s limit of your income (MSR)',
  tdsr: 'your mortgage plus other debts would be above the bank’s limit (TDSR)',
}

export function AffordCard({ scenario, onTry }: { scenario: Scenario; onTry: (price: number) => void }) {
  const r = useMemo(() => affordablePrice(scenario), [scenario])
  const price = scenario.flat.price
  const diff = r.maxPrice !== undefined ? r.maxPrice - price : 0
  return (
    <Card>
      <h2 className="text-sm font-semibold">How much can {scenario.buyers === 'single' ? 'you' : 'we'} afford?</h2>
      {r.maxPrice === undefined ? (
        <p className="mt-2 text-sm text-ink-2">
          Your plan runs short of cash{r.failsAtMin?.firstShortYm ? <> in <b className="text-critical">{formatYm(r.failsAtMin.firstShortYm)}</b></> : ''} even
          for a {money(r.min)} flat, so the flat price isn’t the problem. Fix the problems under “What to watch” first, then check back.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 text-sm">
            <div className="text-xs text-ink-2">Highest flat price that works</div>
            <div className="tnum mt-0.5 text-xl font-semibold">{r.aboveMax ? `Over ${money(r.maxPrice)}` : money(r.maxPrice)}</div>
            <p className="mt-1 text-ink-2">
              {r.aboveMax
                ? 'Price isn’t what limits you.'
                : <>Above this, {LIMIT_TEXT[r.limitedBy!]}{r.limitedBy === 'cash' && r.next?.firstShortYm ? <> ({formatYm(r.next.firstShortYm)})</> : ''}. </>}
              {!r.aboveMax && (diff >= 0
                ? <>That’s <b className="tnum text-good-ink">{money(diff)}</b> more than the {money(price)} you’ve entered.</>
                : <>That’s <b className="tnum text-critical">{money(-diff)}</b> less than the {money(price)} you’ve entered.</>)}
            </p>
          </div>
          {!r.aboveMax && Math.abs(diff) >= 1000 && (
            <Button variant="secondary" className="shrink-0 text-xs" onClick={() => onTry(r.maxPrice!)}>Add as scenario at {money(r.maxPrice)}</Button>
          )}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Keeps everything else the same: loan type and LTV, CPF slider, costs, grants and dates. Stamp duty, fees and the downpayment change with the price.
        Rounded down to the nearest $1,000.
      </p>
    </Card>
  )
}
