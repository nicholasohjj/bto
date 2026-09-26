import type { ReactNode } from 'react'
import type { Policy, Tier } from '../config/policy'
import { formatYm } from '../engine/dates'
import { money } from '../engine/format'
import type { Milestone, PaidEvent, Scenario, SimResult } from '../engine/types'
import { Button, Card } from './controls'

/**
 * "How buying a new HDB flat works, and what you pay at each step." Rules and figures come from
 * the same policy the calculator uses (checked against hdb.gov.sg / cpf.gov.sg), so the guide
 * and the numbers can't drift apart. With a plan open, each step also lists that plan's payments.
 */
export function GuidePage({ policy: p, scenario, result, onOpenPlan }: {
  policy: Policy; scenario?: Scenario; result?: SimResult | null; onOpenPlan: () => void
}) {
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`
  const dp = p.downpayment
  const fees = p.fees

  const steps: { id: string; title: string; when: string; milestone?: Milestone; body: ReactNode }[] = [
    {
      id: 'hfe', title: 'Get your HDB Flat Eligibility (HFE) letter', when: 'Before the sales exercise opens',
      body: (
        <>
          <Li>It tells you whether you can buy, and your <b>grants</b> and <b>HDB loan</b>. You need a valid one to apply.</Li>
          <Li>Processing takes <b>up to a month</b> (longer just before an exercise), and the e-service closes while an exercise is open. It’s valid for <b>{p.hfe.validityMonths} months</b>.</Li>
          <Li>Income is the <b>12 months ending 2 months before</b> you apply for it: each person’s pay (no bonuses or employer CPF) averaged over the months they worked. Families’ ceiling: <b>{money(p.eligibility.incomeCeilingFamilies)}</b> a month.</Li>
          <Li>Taking a bank loan? Ask DBS, Hong Leong Finance, Maybank, OCBC or UOB for a free <b>In-Principle Approval</b> at the same time.</Li>
          <Pay>Nothing yet.</Pay>
        </>
      ),
    },
    {
      id: 'apply', title: 'Apply in a sales exercise', when: 'BTO, Sale of Balance Flats or open booking', milestone: 'application',
      body: (
        <>
          <Li>One application per exercise: one town and flat type. Ballot results come <b>within about 2 months</b>.</Li>
          <Li>Ballot chances: <b>3</b> for first-timer married couples (40 or under) and parents, <b>2</b> for other first-timer couples, <b>1</b> for second-timers and singles. First-timers get <b>+1</b> after 2 unsuccessful tries for Standard flats (up to +2), and from February 2027 <b>+1</b> per Singapore Citizen child aged 18 or under.</Li>
          <Li>Open booking has no ballot: you can book as soon as the next working day.</Li>
          <Pay><b>{money(fees.applicationFee)}</b> application fee (non-refundable, card or QR).</Pay>
        </>
      ),
    },
    {
      id: 'booking', title: 'Book your flat', when: 'When your queue number comes up', milestone: 'booking',
      body: (
        <>
          <Li>HDB tells you at booking if you qualify for the <b>staggered downpayment</b> or <b>Deferred Income Assessment</b>; you don’t apply for them.</Li>
          <Li>Optional Component Scheme items (flooring, doors, bathroom fittings) are added to the flat price. You can only choose them now.</Li>
          <Li>Cancelling after booking: you lose the option fee and wait a year before applying again.</Li>
          <Pay>
            <b>Option fee</b> in cash: {money(p.optionFee['2R'])} (2-room Flexi), {money(p.optionFee['3R'])} (3-room), {money(p.optionFee['4R'])} (4-room and bigger). It counts towards your downpayment.
          </Pay>
        </>
      ),
    },
    {
      id: 'afl', title: 'Sign the Agreement for Lease (AFL)', when: `Within ${p.lease.completedKeysWithinMonths} months of booking`, milestone: 'afl',
      body: (
        <>
          <Li>
            <b>Downpayment now</b> (less the option fee):
            <Table rows={[
              ['HDB loan', `${pct(dp.hdb.standard.afl.pct)} (staggered ${pct(dp.hdb.staggered.afl.pct)}, DIA ${pct(dp.hdb.dia.afl.pct)})`, 'Cash or CPF'],
              ['Bank loan', `${pct(dp.bank.standard.afl.pct)} (staggered ${pct(dp.bank.staggered.afl.pct)}, DIA ${pct(dp.bank.dia.afl.pct)})`, `At least ${pct(dp.bank.standard.afl.minCashPct)} of the price in cash`],
            ]} />
          </Li>
          <Li><b>Buyer’s Stamp Duty</b>: {tiersText(p.bsdTiers.slice(0, 4), 'rate')} of the price. <b>Legal fees</b> (if HDB acts for you): {tiersText(fees.conveyancingTiers, 'per1000')}, plus GST. Both can be paid from CPF.</Li>
          <Li>A bank loan needs the bank’s <b>Letter of Offer</b> before you sign.</Li>
          <Li>Pulling out after signing costs <b>{pct(fees.cancelAfterAflPct)} of the price</b> (stamp duty can be refunded; legal fees can’t).</Li>
          <Pay>First part of the downpayment, stamp duty and legal fees.</Pay>
        </>
      ),
    },
    {
      id: 'wait', title: 'While your flat is being built', when: 'Usually 3–5 years for a BTO',
      body: (
        <>
          <Li>Keep saving for the cash parts at key collection, renovation and furniture.</Li>
          <Li>With an HDB loan, HDB <b>re-checks your finances</b> nearer completion and can reduce the loan if you can’t afford it any more. Under DIA, your income for the grant and loan is assessed about {p.dia.assessmentMonthsBeforeKeys} months before completion.</Li>
          <Pay>Rent, if you’re not living with family.</Pay>
        </>
      ),
    },
    {
      id: 'keys', title: 'Collect your keys', when: 'When HDB invites you; within a month of the notice', milestone: 'keys',
      body: (
        <>
          <Li><b>Rest of the downpayment</b>: HDB loan {pct(dp.hdb.standard.keys.pct)} (staggered {pct(dp.hdb.staggered.keys.pct)}, DIA {pct(dp.hdb.dia.keys.pct)}); bank loan {pct(dp.bank.standard.keys.pct)}. Your grant and CPF OA go in first; with an HDB loan each of you can keep up to <b>{money(p.hdbLoan.oaRetainMax)}</b> in OA.</Li>
          <Li>Fees: survey {cents(fees.surveyFee['2R'])}–{cents(fees.surveyFee.Exec)} by flat type, registration {cents(fees.escrowRegistrationFee)} each (HDB loan), and stamp duty on the loan ({pct(fees.mortgageStampDutyPct)}, up to {money(fees.mortgageStampDutyMax)}).</Li>
          <Li>Second-timers pay the <b>resale levy</b> in cash ({money(Math.min(...Object.values(p.resaleLevy)))}–{money(Math.max(...Object.values(p.resaleLevy)))}).</Li>
          <Li>HDB fire insurance is compulsory with an HDB loan; the Home Protection Scheme is compulsory if CPF pays your instalments.</Li>
          <Pay>The balance of the price (grant, CPF, loan and cash), fees, and any resale levy.</Pay>
        </>
      ),
    },
    {
      id: 'after', title: 'After you move in', when: 'For the life of the loan',
      body: (
        <>
          <Li>HDB loan instalments start on the <b>1st of the 2nd month</b> after keys, from CPF OA or cash. Instalments are capped at <b>{pct(p.msr)} of income</b> when you borrow.</Li>
          <Li>HDB loans run up to <b>{p.hdbLoan.maxTenureYears} years</b> (less if 65 minus your average age is shorter); bank loans up to {p.bankLoan.maxTenureYears}. You can prepay an HDB loan with no fee (from {money(p.hdbLoan.minPrepay)}, in {money(p.hdbLoan.prepayStep)} steps) or refinance to a bank, but never back.</Li>
          <Li>Monthly service &amp; conservancy charges, yearly property tax (little or none for most flats), and HPS premiums.</Li>
          <Li>Live in the flat for the minimum occupation period: <b>5 years</b> (10 for Plus and Prime flats). Turning 55 before the loan ends? Apply to CPF to keep your OA for housing.</Li>
          <Pay>Monthly instalments and running costs.</Pay>
        </>
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Buying a new HDB flat, step by step</h1>
        <p className="mt-1 text-sm text-ink-2">
          What happens at each stage and what you pay, from the HFE letter to after you move in. Figures are the ones this app uses,
          checked against hdb.gov.sg and cpf.gov.sg.{result && scenario && <> Payments from your plan “{scenario.name}” are shown under each step.</>}
        </p>
      </div>
      <ol className="space-y-3">
        {steps.map((st, i) => (
          <li key={st.id}>
            <Card>
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold">{st.title}</h2>
                  <p className="text-xs text-muted">{st.when}{st.milestone && result ? ` · in your plan: ${formatYm(result.milestones[st.milestone])}` : ''}</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-ink-2">{st.body}</ul>
                  {st.milestone && result && <YourPayments events={result.events.filter((e) => e.ym === result.milestones[st.milestone!] && isOneOff(e))} />}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <Card>
        <p className="text-sm text-ink-2">See every payment month by month, and whether your cash and CPF cover each one.</p>
        <Button variant="primary" className="mt-2" onClick={onOpenPlan}>Open my plan</Button>
      </Card>
    </div>
  )
}

/** "$163.50" — small fees shown to the cent. */
function cents(n: number): string {
  return `$${n.toFixed(2)}`
}

function Li({ children }: { children: ReactNode }) {
  return <li className="flex gap-2"><span aria-hidden className="text-muted">•</span><span className="min-w-0">{children}</span></li>
}

function Pay({ children }: { children: ReactNode }) {
  return <li className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink"><span className="font-medium">You pay: </span>{children}</li>
}

function Table({ rows }: { rows: [string, string, string][] }) {
  return (
    <table className="mt-1 w-full text-xs">
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]} className="border-b border-line last:border-0">
            <td className="py-1 pr-2 font-medium text-ink">{r[0]}</td>
            <td className="py-1 pr-2 tnum">{r[1]}</td>
            <td className="py-1 text-muted">{r[2]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The plan's one-off payments at this step (not mortgage, rent or repeats). */
function isOneOff(e: PaidEvent): boolean {
  return e.kind !== 'mortgage' && e.kind !== 'rent' && e.kind !== 'loanChange' && !(/#\d+$/.test(e.itemId) && !e.itemId.endsWith('#1'))
}

function YourPayments({ events }: { events: PaidEvent[] }) {
  const paid = events.filter((e) => e.amount > 0 && e.kind !== 'grant')
  if (!paid.length) return null
  const total = paid.reduce((s, e) => s + e.amount, 0)
  return (
    <div className="mt-2 rounded-lg border border-line p-2 text-xs">
      <div className="mb-1 font-medium text-ink">In your plan</div>
      <ul className="space-y-0.5">
        {paid.map((e, i) => (
          <li key={`${e.itemId}-${i}`} className="flex justify-between gap-2 tnum">
            <span className="min-w-0 text-ink-2">{e.label.replace(/ \(\d+\/\d+\)$/, '')}</span>
            <span className="shrink-0">{money(e.amount)} <span className="text-muted">({e.fromCpf <= 0 ? 'cash' : e.fromCash <= 0 ? 'CPF' : `${money(e.fromCash)} cash + ${money(e.fromCpf)} CPF`})</span></span>
          </li>
        ))}
      </ul>
      {paid.length > 1 && <div className="mt-1 flex justify-between border-t border-line pt-1 font-medium tnum"><span>Total</span><span>{money(total)}</span></div>}
    </div>
  )
}

/** "1% on the first $180,000, 2% on the next $180,000, …" or "$0.90 per $1,000 on the first $30,000, …". */
function tiersText(tiers: Tier[], style: 'rate' | 'per1000'): string {
  return tiers.map((t, i) => {
    const r = style === 'rate' ? `${Math.round(t.rate * 1000) / 10}%` : `$${(t.rate * 1000).toFixed(2)} per $1,000`
    const on = !Number.isFinite(t.width) ? 'on the rest' : `on the ${i === 0 ? 'first' : 'next'} ${money(t.width)}`
    return `${r} ${on}`
  }).join(', ')
}
