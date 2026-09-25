import { formatYm } from '../engine/dates'
import { money } from '../engine/format'
import { isCompleted } from '../engine/saleType'
import type { PaidEvent, Scenario, SimResult } from '../engine/types'
import { Disclaimer } from './Disclaimer'
import { FLAT_TYPES, MILESTONES } from './labels'

const SALE_TYPE = { BTO: 'BTO', SBF: 'Sale of Balance Flats', OBF: 'Open booking' } as const

/**
 * One-page summary for an HDB or bank appointment. Hidden on screen; App hides
 * everything else when printing. Plain black-on-white so it prints the same in dark mode.
 */
export function PrintSummary({ scenario, result }: { scenario: Scenario; result: SimResult }) {
  const { loan, summary, eligibility: el } = result
  const single = scenario.buyers === 'single'
  // Same rule as the Payments tab: leave out rent, mortgage and repeats of recurring items.
  const payments = result.events.filter((e) =>
    e.kind !== 'mortgage' && e.kind !== 'rent' && e.kind !== 'voluntaryCpf' && !(/#\d+$/.test(e.itemId) && !e.itemId.endsWith('#1')))
  const problems = result.warnings.filter((w) => w.severity !== 'info')
  const completed = isCompleted(scenario)
  const milestones = MILESTONES.filter((m) => !(completed && m.value === 'afl'))
    .filter((m) => !(scenario.flat.saleType === 'OBF' && m.value === 'application'))

  return (
    <div className="print-summary hidden text-[11px] leading-snug text-black print:block">
      <header className="flex items-baseline justify-between border-b border-black pb-1">
        <h1 className="text-base font-bold">{scenario.name}</h1>
        <span>BTO Money Timeline · printed {new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </header>

      <section className="mt-2 grid grid-cols-3 gap-x-4">
        <div>
          <h2 className="font-bold">Flat</h2>
          <div>{FLAT_TYPES.find((t) => t.value === scenario.flat.type)?.label} · {SALE_TYPE[scenario.flat.saleType ?? 'BTO']}{completed ? ' (completed)' : ''} · {scenario.flat.classification}</div>
          <div>Price {money(loan.effectivePrice)}{el.premium > 0 ? ` (incl. ${money(el.premium)} SC/PR premium)` : ''}</div>
          <div>Grants {money(loan.grantsTotal)}</div>
          <div>{single ? 'Income' : 'Household income'} {money(el.purchaseAvgIncome)}/month at application (ceiling {money(el.incomeCeiling)})</div>
          {scenario.financing.deferredIncomeAssessment && <div>Deferred assessment: {money(el.avgIncome)}/month ({formatYm(el.assessedAt)})</div>}
        </div>
        <div>
          <h2 className="font-bold">Key dates</h2>
          {milestones.map((m) => (
            <div key={m.value}>
              {completed && m.value === 'keys' ? 'AFL + key collection' : m.label}: {formatYm(result.milestones[m.value])}
            </div>
          ))}
        </div>
        <div>
          <h2 className="font-bold">{loan.loanAmount > 0 ? `${scenario.financing.loanType === 'HDB' ? 'HDB' : 'Bank'} loan` : 'No loan'}</h2>
          {loan.loanAmount > 0 && <>
            <div>{money(loan.loanAmount)} at {(loan.rate * 100).toFixed(2)}% over {loan.tenureYears} years</div>
            <div>Instalment {money(loan.monthlyInstalment)}/month</div>
            <div>MSR {(loan.msr * 100).toFixed(1)}% (limit {Math.round(loan.msrLimit * 100)}%){scenario.financing.loanType === 'bank' ? ` · TDSR ${(loan.tdsr * 100).toFixed(1)}%` : ''}</div>
            <div>Downpayment {money(loan.downpaymentTotal)}</div>
          </>}
        </div>
      </section>

      <section className="mt-2 grid grid-cols-4 gap-x-4 border-y border-black py-1">
        <div>Cash used <b>{money(summary.totalCashUsed)}</b></div>
        <div>CPF used <b>{money(summary.totalCpfUsed)}</b></div>
        <div>Leanest cash <b>{money(summary.leanestCash.amount)}</b> ({formatYm(summary.leanestCash.ym)})</div>
        <div>At keys <b>{money(summary.bufferAtKeys.cash)}</b> cash + {money(summary.bufferAtKeys.oa)} OA</div>
      </section>

      <section className="mt-2">
        <h2 className="font-bold">Payments</h2>
        <table className="mt-0.5 w-full border-collapse tnum">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-0.5 pr-2 font-semibold">Month</th>
              <th className="pr-2 font-semibold">Item</th>
              <th className="pr-2 text-right font-semibold">Amount</th>
              <th className="pr-2 text-right font-semibold">Cash</th>
              <th className="pr-2 text-right font-semibold">CPF OA</th>
              <th className="text-right font-semibold">Cash left</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((e, i) => <PaymentRow key={`${e.itemId}-${i}`} e={e} />)}
          </tbody>
        </table>
      </section>

      <section className="mt-2 break-inside-avoid">
        <h2 className="font-bold">To check</h2>
        {problems.length === 0
          ? <p>No shortfalls: every payment can be covered by the right pot.</p>
          : (
            <ul className="list-disc pl-4">
              {problems.map((w) => (
                <li key={w.id}>
                  <b>{w.severity === 'error' ? 'Problem' : 'Check'}: {w.title}.</b>{w.fixes[0] ? ` ${w.fixes[0]}` : ''}
                </li>
              ))}
            </ul>
          )}
      </section>

      <footer className="mt-3"><Disclaimer compact /></footer>
    </div>
  )
}

function PaymentRow({ e }: { e: PaidEvent }) {
  const grant = e.kind === 'grant'
  const inflow = !grant && e.amount < 0
  return (
    <tr className={`border-b border-black/20 ${e.milestone ? 'font-semibold' : ''}`}>
      <td className="py-0.5 pr-2 whitespace-nowrap">{formatYm(e.ym)}</td>
      <td className="pr-2">{e.label}</td>
      <td className="pr-2 text-right">{grant || inflow ? '+' : ''}{money(Math.abs(e.amount))}</td>
      <td className="pr-2 text-right">{grant || inflow || !e.fromCash ? '' : money(e.fromCash)}</td>
      <td className="pr-2 text-right">{e.fromCpf ? (e.fromCpf < 0 ? `+${money(-e.fromCpf)}` : money(e.fromCpf)) : ''}</td>
      <td className={`text-right ${e.after.cash < 0 ? 'font-bold' : ''}`}>{money(e.after.cash)}</td>
    </tr>
  )
}
