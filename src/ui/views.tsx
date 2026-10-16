import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { compareRows } from '../engine/compare'
import { addMonths, formatYm } from '../engine/dates'
import { jobLossImpact, withJobLoss } from '../engine/whatIf'
import { affordablePrice, type AffordLimit } from '../engine/afford'
import { launchFit, pickedLaunch, pickedProject, type ProjectFit } from '../engine/launch'
import { GROUP_LABEL, oddsFor, rateGroups } from '../engine/ballot'
import { mopYears, projectSale, resaleLevy } from '../engine/afterMop'
import { loadResale, summarise, type ResaleFile } from '../surroundings/resale'
import { LAUNCHES, type Launch, type LaunchProject } from '../config/launches'
import type { FlatType, Policy } from '../config/policy'
import { FLAT_TYPES } from './labels'
import { areaUrl } from '../state/studio'
import { money } from '../engine/format'
import { monthlyInstalment } from '../engine/loan'
import type { Scenario, SimResult, Warning } from '../engine/types'
import { CompareChart } from './lazyCharts'
import { Button, Card, Field, InfoTip, MoneyInput, PercentInput, Segmented, Select, T, Toggle } from './controls'
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

// ---------------- Loan interest ----------------

/**
 * Total interest at today's rate, and what a loan 5 years shorter would do: HDB advises borrowing
 * less and for shorter to save interest. Ignores later rate changes and prepayments.
 */
function InterestLine({ loan: l }: { loan: SimResult['loan'] }) {
  if (l.loanAmount <= 0 || l.tenureYears <= 0) return null
  const interest = (years: number, inst: number) => inst * Math.round(years * 12) - l.loanAmount
  const total = interest(l.tenureYears, l.monthlyInstalment)
  const shorter = Math.max(10, l.tenureYears - 5)
  const inst2 = monthlyInstalment(l.loanAmount, l.rate, shorter)
  const tooMuch = l.grossIncomeAtAssessment > 0 && monthlyInstalment(l.loanAmount, l.stressRate, shorter) / l.grossIncomeAtAssessment > l.msrLimit + 1e-9
  return (
    <div className="mt-1 text-xs text-ink-2">
      Total interest about <span className="tnum text-ink">{money(total)}</span> at today’s rate.
      {shorter < l.tenureYears && (
        <> Over {shorter} years: <span className="tnum">{money(inst2 - l.monthlyInstalment)}</span>/mo more, <span className="tnum text-good-ink">{money(total - interest(shorter, inst2))}</span> less interest
          {tooMuch ? <span className="text-serious"> (above the {Math.round(l.msrLimit * 100)}% income limit)</span> : ''}.</>
      )}
    </div>
  )
}

// ---------------- Verdict ----------------

/** The answer in one line, above everything else: covered every month, or where it breaks. */
export function Verdict({ result, onDetails }: { result: SimResult; onDetails: () => void }) {
  const errors = result.warnings.filter((w) => w.severity === 'error')
  const checks = result.warnings.filter((w) => w.severity === 'warning').length
  const low = result.summary.leanestCash
  const bad = errors.length > 0
  return (
    <button type="button" onClick={onDetails}
      className={`flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border px-4 py-3 text-left ${bad ? 'border-critical/40 bg-critical/10' : 'border-good/30 bg-good/10'}`}>
      <span className="min-w-0 text-sm">
        {bad ? (
          <>
            <b className="text-critical"><span aria-hidden>✖ </span>{errors[0].title}</b>
            {low.amount < 0 && <span className="text-ink-2"> · cash down to <span className="tnum text-critical">{money(low.amount)}</span></span>}
            {errors.length > 1 && <span className="text-ink-2"> · {errors.length - 1} more problem{errors.length > 2 ? 's' : ''}</span>}
          </>
        ) : (
          <>
            <b className="text-good-ink"><span aria-hidden>✔ </span>Every payment is covered</b>
            <span className="text-ink-2"> · lowest cash <span className="tnum">{money(low.amount)}</span> ({formatYm(low.ym)})</span>
            {checks > 0 && <span className="text-ink-2"> · {checks} thing{checks > 1 ? 's' : ''} to check</span>}
          </>
        )}
      </span>
      {(bad || checks > 0) && <span className="shrink-0 text-xs font-medium text-accent">{bad ? 'What to change' : 'See details'} ↓</span>}
    </button>
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

export function ScheduleTable({ result, onCalendar }: { result: SimResult; onCalendar?: () => void }) {
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
        {onCalendar && <Button onClick={onCalendar} className="sm:ml-auto">Add to calendar</Button>}
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
          <InterestLine loan={l} />
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

export function AccruedView({ scenario, policy, result, names, single = false }: { scenario: Scenario; policy: Policy; result: SimResult; names: [string, string]; single?: boolean }) {
  return (
    <div className="space-y-3">
      <SaleCard scenario={scenario} policy={policy} result={result} names={names} single={single} />
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

/** Selling after the MOP at a price the user picks: the loan, the CPF refund and what comes back. */
function SaleCard({ scenario, policy, result, names, single }: { scenario: Scenario; policy: Policy; result: SimResult; names: [string, string]; single: boolean }) {
  const mop = mopYears(scenario)
  const horizons = result.accrued.map((a) => a.yearsAfterKeys)
  const [years, setYears] = useState(() => horizons.find((y) => y >= mop) ?? horizons[0])
  const [price, setPrice] = useState(() => Math.round(result.loan.effectivePrice / 1000) * 1000)
  const [agentPct, setAgentPct] = useState(0)
  const sale = projectSale(scenario, result, policy, { years, price, agentPct })
  const projectId = scenario.flat.project?.id
  const [resale, setResale] = useState<{ id: string; file: ResaleFile } | null>(null)
  useEffect(() => {
    let live = true
    if (projectId) loadResale(projectId)?.then((file) => { if (live) setResale({ id: projectId, file }) }, () => {})
    return () => { live = false }
  }, [projectId])
  const nearby = resale && resale.id === projectId ? summarise(resale.file.rows, (x) => x.d).find((x) => x.type === scenario.flat.type) : undefined
  if (!sale || !horizons.length) return null
  const levy = resaleLevy(scenario, policy)
  const refund = sale.refundDue.A + sale.refundDue.B
  const short = refund - sale.cpfBack
  const line = (label: ReactNode, value: string, cls = '') => (
    <div className={`flex justify-between gap-3 ${cls}`}><dt className="text-ink-2">{label}</dt><dd className="tnum">{value}</dd></div>
  )
  return (
    <Card>
      <h2 className="text-sm font-semibold">If you sell after the minimum occupation period</h2>
      <p className="mt-1 text-xs text-ink-2">
        {scenario.flat.classification} flats can be sold {mop} years after key collection{scenario.flat.classification !== 'Standard' ? ' (5 for Standard flats)' : ''}. Pick when and for how much.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Sell">
          <Segmented value={String(years)} onChange={(v) => setYears(+v)} ariaLabel="Years after keys"
            options={horizons.map((y) => ({ value: String(y), label: `${y} years` }))} />
        </Field>
        <Field label="For" hint={nearby
          ? <>You bought for {money(result.loan.effectivePrice)}. Resale {FLAT_TYPES.find((t) => t.value === nearby.type)?.label ?? nearby.type} flats within 1 km of {pickedProject(scenario)?.project.name ?? 'the project'}: median <b className="text-ink">{money(nearby.median)}</b> ({nearby.n} sales; leases from {nearby.leaseFrom === nearby.leaseTo ? nearby.leaseFrom : `${nearby.leaseFrom}–${nearby.leaseTo}`}).{' '}
            <button type="button" className="text-accent underline" onClick={() => setPrice(Math.round(nearby.median / 1000) * 1000)}>Use it</button></>
          : <>You bought for {money(result.loan.effectivePrice)}. Check recent prices nearby.</>}>
          <MoneyInput value={price} onChange={setPrice} ariaLabel="Sale price" />
        </Field>
        <Field label="Agent’s fee" hint="Leave at 0 if you sell it yourself. GST is added.">
          <PercentInput value={agentPct} onChange={setAgentPct} max={5} ariaLabel="Agent’s commission" />
        </Field>
      </div>
      {sale.beforeMop ? (
        <p className="mt-3 text-sm text-serious">
          {formatYm(sale.ym)} is before the {mop}-year minimum occupation period ends, so the flat can’t be sold then. Pick {mop} years or later.
        </p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <dl className="space-y-1 text-sm">
            {line(`Sale in ${formatYm(sale.ym)}`, money(price), 'font-medium')}
            {sale.recovery !== 0 && line(<>Subsidy recovery to HDB{sale.recoveryPct !== undefined ? ` (${sale.recoveryPct}%)` : ''}</>, sale.recovery === null ? 'not known' : `−${money(sale.recovery)}`)}
            {line('Loan still owed', `−${money(sale.loan)}`)}
            {sale.agentFee > 0 && line('Agent’s fee', `−${money(sale.agentFee)}`)}
            {line(<>Back into your CPF OA <span className="text-muted">(CPF used + <T term="accrued">accrued interest</T>)</span></>, `−${money(sale.cpfBack)}`)}
            {line('Cash in hand', sale.cash < 0 ? `−${money(-sale.cash)}` : money(sale.cash), `border-t border-line pt-1 font-semibold ${sale.cash < 0 ? 'text-critical' : ''}`)}
          </dl>
          <div className="space-y-2 text-xs text-ink-2">
            <p className="text-sm text-ink">
              For your next home: <b className="tnum">{money(Math.max(0, sale.cash))}</b> cash and <b className="tnum">{money(sale.cpfBack)}</b> back in CPF{!single && <> ({names[0]} {money(sale.refundDue.A * (sale.cpfBack / (refund || 1)))}, {names[1]} {money(sale.refundDue.B * (sale.cpfBack / (refund || 1)))})</>}.
            </p>
            {sale.cash < 0
              ? <p className="text-critical">The sale doesn’t cover the loan: you’d need {money(-sale.cash)} in cash to clear it.</p>
              : short > 1
                ? <p>The sale doesn’t cover the full {money(refund)} CPF refund. Sold at market value, only what’s left after the loan goes back ({money(short)} less); you don’t top up the rest in cash.</p>
                : <p>Below about <b className="tnum text-ink">{money(sale.breakEven)}</b>, nothing comes back as cash: it all goes to the loan and your CPF.</p>}
            {sale.recovery === null && <p>Pick the project in Edit plan → Flat to include its subsidy recovery rate.</p>}
            {levy > 0 && <p>Buying another new flat from HDB (BTO or EC) after this one means a <b className="text-ink">{money(levy)}</b> resale levy, paid in cash; a resale flat has none.</p>}
            <p className="text-muted">The loan follows your plan’s mortgage (with any rate or loan changes). Legal fees for the sale and HDB’s resale fees aren’t counted. Estimates only.</p>
          </div>
        </div>
      )}
    </Card>
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
      {/* Once the mortgage has started, lenders have hardship help worth knowing about. */}
      {addMonths(from, months - 1) > scenario.flat.dates.keys && (
        <p className="mt-3 text-xs text-ink-2">
          {scenario.financing.loanType === 'HDB' ? (
            <>
              <b className="text-ink">If this happens after keys:</b> HDB’s Financial Assistance Measures can reduce or defer your instalments for 6 months
              (interest still adds up), or for 12 months with interest suspended under the Homeowner Job Support pilot if you’re unemployed and work
              with a career coach. HDB may also extend the loan to lower the instalment. Apply early at your HDB branch; there’s no fee.
            </>
          ) : (
            <>
              <b className="text-ink">If this happens after keys:</b> talk to your bank early about repayment options, or refinance to a lower rate.
              Renting out a room or adding a working family member as an owner can also help.
            </>
          )}
        </p>
      )}
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

// ---------------- Which projects fit? ----------------

export interface LaunchPick { launch: Launch; project: LaunchProject; type: FlatType; applicationMonth: string }

const FIT_LIMIT: Record<AffordLimit, string> = {
  cash: 'Cash runs short',
  msr: 'Mortgage over the MSR limit',
  tdsr: 'Over the TDSR limit',
}

/** Rows separated by 1px lines; two columns on wider screens (a lone last row spans both). */
const ROWS = 'grid gap-px overflow-hidden rounded-lg bg-line md:grid-cols-2 md:[&>li:last-child:nth-child(odd)]:col-span-2'

export function LaunchFitCard({ scenario, onCompare }: { scenario: Scenario; onCompare: (picks: LaunchPick[]) => void }) {
  const launches = LAUNCHES.filter((l) => l.projects.length > 0)
  const [launchId, setLaunchId] = useState(() => (pickedLaunch(scenario)?.projects.length ? pickedLaunch(scenario)!.id : launches[0]?.id))
  const [picks, setPicks] = useState<string[]>([])
  const launch = launches.find((l) => l.id === launchId)
  // A launch that has closed is checked as if it opened next month; otherwise its payments would count as already made.
  const closed = !!launch && launch.applicationMonth <= scenario.startMonth
  const applicationMonth = launch ? (closed ? addMonths(scenario.startMonth, 1) : launch.applicationMonth) : ''
  const fits = useMemo(() => (launch ? launchFit(scenario, launch, { applicationMonth }) : []), [scenario, launch, applicationMonth])
  const types = FLAT_TYPES.filter((t) => fits.some((f) => f.type === t.value))
  // Start on the plan's own flat type, so the list is one row per project.
  const [typeFilter, setTypeFilter] = useState<FlatType | 'all'>('all')
  const [filterTouched, setFilterTouched] = useState(false)
  const filter = filterTouched ? typeFilter : types.some((t) => t.value === scenario.flat.type) && types.length > 1 ? scenario.flat.type : 'all'
  if (!launch) return null
  // The next launch's sites that have a page before their projects are announced.
  const next = LAUNCHES.find((l) => !l.projects.length && l.previews?.some((v) => v.area))
  const upcoming = next?.previews?.flatMap((v) => (v.area ? [v.area] : [])) ?? []
  const upcomingName = next?.name ?? ''
  const key = (f: ProjectFit) => `${f.project.id}/${f.type}`
  const typeLabel = (t: FlatType) => FLAT_TYPES.find((x) => x.value === t)!.label
  const shown = fits.filter((f) => filter === 'all' || f.type === filter)
  // One flat type on show (picked, or the only one, as for singles): one row per project.
  const oneType: FlatType | null = filter !== 'all' ? filter : types.length === 1 ? types[0].value : null
  const okCount = shown.filter((f) => f.ok).length
  // Short of cash even for the cheapest flat we try: the project isn't the problem.
  const planShort = fits.length > 0 && fits.every((f) => f.maxPrice === undefined)
  const firstShort = fits.map((f) => f.firstShortYm).filter(Boolean).sort()[0]
  const toggle = (k: string) => setPicks((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < 3 ? [...p, k] : p))
  const keysText = (f: ProjectFit) => `keys ${f.project.waitMonths !== undefined ? '' : 'about '}${formatYm(f.keys)}`

  const row = (f: ProjectFit, title: string, sub?: string) => {
    const k = key(f)
    const checked = picks.includes(k)
    return (
      <li key={k} className="bg-surface-2">
        <label className={`flex h-full cursor-pointer items-start gap-3 px-3 py-2.5 ${!checked && picks.length >= 3 ? 'cursor-default opacity-60' : ''}`}>
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--accent)]" checked={checked} disabled={!checked && picks.length >= 3}
            onChange={() => toggle(k)} aria-label={`Compare ${f.project.name} ${typeLabel(f.type)}`} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-medium">{title}</span>
              <span className="tnum whitespace-nowrap text-sm text-ink-2">from {money(f.fromPrice)}</span>
            </span>
            {sub && <span className="block text-xs text-ink-2">{sub}</span>}
            {(() => {
              const g = rateGroups(scenario, f.type).groups[0], o = g && oddsFor(launch!, f.project.id, f.type, g)
              return o ? <span className="block text-xs text-ink-2">Ballot: <span className={o.band === 'good' ? 'text-good-ink' : o.band === 'hard' ? 'text-serious' : 'text-ink'}>{o.rate.toFixed(1)}</span> applicants per flat for {GROUP_LABEL[g]} (median {o.median.toFixed(1)})</span> : null
            })()}
            <span className={`mt-0.5 block text-xs ${f.ok ? 'text-good-ink' : 'text-critical'}`}>
              {f.ok
                ? <>✔ {f.aboveMax ? 'Price isn’t the limit' : <>Works up to <span className="tnum">{money(f.maxPrice!)}</span></>}</>
                : <>✖ {FIT_LIMIT[f.limit ?? 'cash']}{f.limit === 'cash' && f.firstShortYm ? ` in ${formatYm(f.firstShortYm)}` : ''}{f.maxPrice !== undefined && <>; works up to <span className="tnum">{money(f.maxPrice)}</span></>}</>}
            </span>
          </span>
        </label>
      </li>
    )
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold">Which projects fit {scenario.buyers === 'single' ? 'your' : 'our'} plan?</h2>
      {(launches.length > 1 || types.length > 1) && !planShort && (
        <div className="mt-2 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:max-w-md">
          {launches.length > 1 && (
            <Select value={launchId} onChange={(v) => { setLaunchId(v); setPicks([]); setFilterTouched(false) }} ariaLabel="Launch"
              options={launches.map((l) => ({ value: l.id, label: l.name }))} />
          )}
          {types.length > 1 && (
            <Select value={filter} onChange={(v) => { setTypeFilter(v); setFilterTouched(true) }} ariaLabel="Flat type"
              options={[{ value: 'all' as const, label: 'All flat types' }, ...types]} />
          )}
        </div>
      )}
      {planShort ? (
        <p className="mt-2 text-sm text-ink-2">
          Your plan runs short of cash{firstShort ? <> in <b className="text-critical">{formatYm(firstShort)}</b></> : ''} even with a much cheaper flat, so none of
          the {launch.name} projects would work yet. The project isn’t the problem: fix the problems under “What to watch” first, then check back.
        </p>
      ) : <>
        <p className="mt-2 text-sm text-ink-2">
          {launch.name}{oneType && `, ${typeLabel(oneType)}`}: <b className={okCount ? 'text-ink' : 'text-critical'}>{okCount} of {shown.length}</b>{' '}
          {oneType ? 'projects work' : 'flat choices work'} at the starting price.
        </p>
        {closed && (
          <p className="mt-1 text-xs text-muted">Applications have closed, so this uses its prices as if you applied in {formatYm(applicationMonth)}: a guide to what the next launch may cost.</p>
        )}
        {!oneType ? (
          <ul className="mt-3 space-y-3">
            {launch.projects.map((p) => {
              const rows = shown.filter((f) => f.project.id === p.id)
              if (!rows.length) return null
              return (
                <li key={p.id}>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-ink-2">{p.town} · {p.classification} · {keysText(rows[0])}</div>
                  <ul className={`mt-1.5 ${ROWS}`}>{rows.map((f) => row(f, typeLabel(f.type)))}</ul>
                </li>
              )
            })}
          </ul>
        ) : (
          <ul className={`mt-3 ${ROWS}`}>
            {shown.map((f) => row(f, f.project.name, `${f.project.town} · ${f.project.classification} · ${keysText(f)}`))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-2">{picks.length ? `${picks.length} of 3 ticked` : 'Tick up to 3 to compare side by side.'}</p>
          <Button variant="primary" disabled={!picks.length} className="text-xs"
            onClick={() => onCompare(picks.map((k) => {
              const f = fits.find((x) => key(x) === k)!
              return { launch, project: f.project, type: f.type, applicationMonth }
            }))}>
            Compare{picks.length ? ` ${picks.length}` : ''}
          </Button>
        </div>
      </>}
      <p className="mt-3 text-xs text-ink-2">
        Before you choose: <a className="text-accent underline" href="/surroundings/">Surroundings</a> shows each unit’s view, sun and walk to the MRT
        {upcoming.length > 0 && <>, and <a className="text-accent underline" href={areaUrl(upcoming[0])}>upcoming sites</a> shows walking, schools and noise around the {upcomingName} sites before their brochures are out</>}.
      </p>
      {!planShort && <p className="mt-3 text-[11px] text-muted">
        Starting prices are the cheapest unit of each type, before grants. Keeps your loan, CPF slider, costs and grants; each project’s dates come from
        its stated waiting time (“about”: a typical one). {(scenario.buyers ?? 'couple') !== 'couple' && 'Singles can only buy 2-room Flexi flats. '}Source: {launch.source}.{launch.applicationRates && <> Ballot: {launch.applicationRates.source}; fewer than 1 applicant per flat means everyone in that group could get a queue number.</>}
      </p>}
    </Card>
  )
}
