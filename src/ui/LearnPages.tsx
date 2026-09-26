import { useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_POLICY, POLICY_META, POLICY_VERSION_DATE, type Policy, type PolicyMeta } from '../config/policy'
import { money } from '../engine/format'
import { flattenPolicy } from '../engine/policyOverrides'
import { Card, Segmented, TextInput } from './controls'
import { GLOSSARY, type Term } from './glossary'
import type { LearnPage } from './labels'


export function LearnNav({ page, onPage }: { page: LearnPage; onPage: (p: LearnPage) => void }) {
  return (
    <div className="mx-auto max-w-3xl">
      <Segmented value={page} onChange={onPage} ariaLabel="Guide pages"
        options={[{ value: 'guide', label: 'Step by step' }, { value: 'glossary', label: 'Glossary' }, { value: 'faq', label: 'FAQ' }, { value: 'rules', label: 'Rules we use' }]} />
    </div>
  )
}

// ---------------- Glossary ----------------

/** Housing terms for the public glossary (app-setting tips are left out), with display titles. */
const TERMS: [Term, string][] = [
  ['AFL', 'Agreement for Lease (AFL)'], ['application', 'Application'], ['bankLoan', 'Bank loan'], ['booking', 'Booking'],
  ['BSD', 'Buyer’s Stamp Duty (BSD)'], ['BTO', 'Build-To-Order (BTO)'], ['classification', 'Standard, Plus and Prime flats'],
  ['completed', 'Completed flat'], ['CPF', 'CPF'], ['accrued', 'CPF accrued interest'], ['cpfLimit', 'CPF limit for bank loans'],
  ['OA', 'CPF Ordinary Account (OA)'], ['DIA', 'Deferred Income Assessment (DIA)'], ['downpayment', 'Downpayment'],
  ['EHG', 'Enhanced CPF Housing Grant (EHG)'], ['household', 'First-timers and second-timers'], ['hdbLoan', 'HDB loan'],
  ['fire', 'HDB fire insurance'], ['HFE', 'HFE letter'], ['HPS', 'Home Protection Scheme (HPS)'], ['grant', 'Housing grants'],
  ['keys', 'Key collection'], ['legal', 'Legal fees'], ['LTV', 'Loan-to-Value (LTV)'], ['lockIn', 'Lock-in period'],
  ['MSR', 'Mortgage Servicing Ratio (MSR)'], ['optionFee', 'Option fee'], ['citizenship', 'Permanent residents and CPF'],
  ['propertyTax', 'Property tax'], ['remainingLease', 'Remaining lease'], ['resaleLevy', 'Resale levy'], ['selfEmployed', 'Self-employed'],
  ['scc', 'Service & conservancy charges (S&CC)'], ['staggered', 'Staggered Downpayment Scheme'], ['stepUp', 'Step-Up CPF Housing Grant'],
  ['stress', 'Stress-test rate'], ['TDSR', 'Total Debt Servicing Ratio (TDSR)'], ['voluntaryCpf', 'Voluntary CPF top-ups'],
  ['saleType', 'Ways of buying: BTO, SBF, open booking'], ['buyers', 'Who can buy'],
]
/** Tips that start with their own name ("Agreement for Lease: …"); the title already says it. */
const STRIP: Term[] = ['AFL', 'BSD', 'BTO', 'HFE', 'resaleLevy', 'scc', 'propertyTax', 'staggered', 'DIA', 'stepUp', 'LTV', 'MSR', 'TDSR', 'EHG', 'accrued', 'HPS', 'fire', 'keys']

export function GlossaryPage() {
  const [q, setQ] = useState('')
  const items = useMemo(() => TERMS
    .map(([key, title]) => {
      const text: string = GLOSSARY[key]
      const i = text.indexOf(': ')
      return { key, title, body: STRIP.includes(key) && i > 0 ? text.slice(i + 2) : text }
    })
    .sort((a, b) => a.title.localeCompare(b.title)), [])
  const needle = q.trim().toLowerCase()
  const shown = needle ? items.filter((t) => `${t.title} ${t.body}`.toLowerCase().includes(needle)) : items
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Glossary</h1>
        <p className="mt-1 text-sm text-ink-2">The HDB and CPF terms used in this app, in plain English.</p>
      </div>
      <TextInput value={q} onChange={setQ} ariaLabel="Search the glossary" placeholder="Search, e.g. AFL, grant, stamp duty" />
      <Card className="!p-0">
        <dl className="divide-y divide-line">
          {shown.map((t) => (
            <div key={t.key} id={`term-${t.key}`} className="px-4 py-3">
              <dt className="text-sm font-semibold">{t.title}</dt>
              <dd className="mt-0.5 text-sm text-ink-2">{t.body}</dd>
            </div>
          ))}
          {shown.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nothing matches “{q}”.</p>}
        </dl>
      </Card>
    </div>
  )
}

// ---------------- FAQ ----------------

export function FaqPage({ policy: p }: { policy: Policy }) {
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`
  const qa: [string, ReactNode][] = [
    ['HDB loan or bank loan?', <>
      An <b>HDB loan</b> charges the CPF OA rate + 0.1% ({pct(p.hdbLoan.interestRate)} now), needs no minimum cash, lets each of you keep {money(p.hdbLoan.oaRetainMax)} in OA,
      has no prepayment fees, and you can switch to a bank later. It runs up to {p.hdbLoan.maxTenureYears} years (less if 65 minus your average age is shorter).
      A <b>bank loan</b> can have a lower rate that changes over time, needs at least {pct(p.bankLoan.minCashPct)} of the price in cash, runs up to {p.bankLoan.maxTenureYears} years
      (a longer loan lowers the limit to {pct(p.bankLoan.reducedLtv)}), may have lock-in penalties, and you can never move back to an HDB loan.
      To compare: duplicate your plan, set one to a bank loan, and use <b>Compare</b>.
    </>],
    ['Should we use Deferred Income Assessment (DIA)?', <>
      It’s for couples where at least one of you is a full-time student or NSF (or finished within 12 months), one of you is {p.dia.maxAgeYears} or under, and one is a first-timer.
      You pay just {pct(p.downpayment.hdb.dia.afl.pct)} at AFL, and your grant and loan are based on your income about {p.dia.assessmentMonthsBeforeKeys} months before keys.
      The catch: if your income has risen by then, the grant can be smaller, and above {money(p.eligibility.incomeCeilingFamilies)} a month there’s no HDB loan.
      You don’t opt in; HDB tells you at booking.
    </>],
    ['How much cash do we need?', <>
      The option fee ({money(p.optionFee['2R'])}–{money(p.optionFee['4R'])}) is always cash. With an HDB loan the rest can come from CPF if you have enough; with a bank loan at least
      {' '}{pct(p.bankLoan.minCashPct)} of the price must be cash. Renovation, furniture, moving and any resale levy are cash too. Your plan’s <b>leanest cash month</b> shows the tightest point.
    </>],
    ['What grants can we get?', <>
      First-timer families can get the <b>Enhanced CPF Housing Grant</b> of up to {money(p.eligibility.ehgFamilies[0].amount)} (income up to {money(p.eligibility.ehgFamilies.at(-1)!.upTo)} a month);
      a first-timer + second-timer couple up to {money(p.eligibility.ehgSingles[0].amount)}, paid to the first-timer. Second-timers moving from rental or a small flat may get the
      {' '}<b>Step-Up grant</b> ({money(p.eligibility.stepUpAmount)}). The Family and Proximity grants are for resale flats only. Grants go into your CPF OA and reduce what you pay or borrow.
    </>],
    ['What if one of us loses a job?', <>
      Try <b>“What if one of you loses your job?”</b> on the Overview. After keys, HDB can reduce or defer instalments for 6 months, or 12 months with interest suspended under the
      Homeowner Job Support pilot. With a bank loan, talk to the bank early.
    </>],
    ['Can we pull out after booking?', <>
      Before signing the AFL you lose the option fee; after signing, {pct(p.fees.cancelAfterAflPct)} of the price (stamp duty can be refunded, legal fees can’t). Either way you wait a year
      before applying again. Not collecting your keys also forfeits the option fee and {pct(p.fees.cancelAfterAflPct)}.
    </>],
    ['When does the mortgage start?', <>
      HDB loan instalments start on the <b>1st of the 2nd month</b> after key collection (keys in March → first instalment 1 May). Bank loans usually start the month after.
    </>],
    ['Our income changed after the HFE letter. Does it matter?', <>
      Once the letter is issued, a change in income needs no action. But with an HDB loan, HDB re-checks your finances nearer completion and can reduce the loan if you can no longer afford it.
    </>],
  ]
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Common questions</h1>
        <p className="mt-1 text-sm text-ink-2">Short answers, using the same figures as the calculator.</p>
      </div>
      <Card className="!p-0">
        <div className="divide-y divide-line">
          {qa.map(([q, a]) => (
            <details key={q} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                {q}<span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span>
              </summary>
              <p className="mt-2 text-sm text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ---------------- Rules we use ----------------

const FLAT = flattenPolicy(DEFAULT_POLICY)
const STATUS: Record<PolicyMeta['status'], { label: string; cls: string; order: number }> = {
  verified: { label: 'Verified', cls: 'bg-good/15 text-good-ink', order: 0 },
  secondary: { label: 'Secondary source', cls: 'bg-surface-2 text-ink-2', order: 1 },
  unverified: { label: 'Not verified', cls: 'bg-critical/15 text-critical', order: 2 },
}

const cents = (v: number) => (Number.isInteger(v) ? money(v) : `$${v.toFixed(2)}`)
const pctText = (v: number) => `${Math.round(v * 10000) / 100}%`

function at(path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), DEFAULT_POLICY)
}

type Tranche = { pct: number; minCashPct: number }
const trancheText = (t: Tranche) => `${pctText(t.pct)}${t.minCashPct > 0 ? ` (at least ${pctText(t.minCashPct)} cash)` : ''}`

/** A figure's value(s) in plain words: tiers, downpayment splits, short lists, or a count for big tables. */
function valuesText(prefix: string, unit: PolicyMeta['unit']): string {
  const node = at(prefix)
  // Bands: "1% on the first $180,000 · … · 6% on the rest" (legal fees per $1,000).
  if (Array.isArray(node) && node.every((x) => x && typeof x === 'object' && 'width' in x && 'rate' in x)) {
    const per1000 = prefix === 'fees.conveyancingTiers'
    return (node as { width: number; rate: number }[]).map((b, i) => {
      const r = per1000 ? `$${(b.rate * 1000).toFixed(2)} per $1,000` : pctText(b.rate)
      return `${r} ${Number.isFinite(b.width) ? `on the ${i === 0 ? 'first' : 'next'} ${money(b.width)}` : 'on the rest'}`
    }).join(' · ')
  }
  // Downpayment: "AFL 10% (at least 5% cash) · keys 15% · at 55% LTV: …"
  if (node && typeof node === 'object' && 'afl' in node && 'keys' in node) {
    const d = node as { afl: Tranche; keys: Tranche; reducedLtv?: { afl: Tranche; keys: Tranche } }
    const main = `AFL ${trancheText(d.afl)} · keys ${trancheText(d.keys)}`
    return d.reducedLtv ? `${main} · at 55% LTV: AFL ${trancheText(d.reducedLtv.afl)} · keys ${trancheText(d.reducedLtv.keys)}` : main
  }
  const paths = Object.keys(FLAT).filter((k) => (k === prefix || k.startsWith(prefix + '.')) && Number.isFinite(FLAT[k]))
  const fmt = (path: string, v: number) => {
    const leaf = path.split('.').pop()!
    if (leaf === 'width' || leaf === 'upTo' || leaf === 'amount') return money(v)
    if (unit === 'pct' || unit === 'ratio') return pctText(v)
    if (unit === 'sgd') return cents(v)
    if (unit === 'years') return `${v} years`
    if (unit === 'months') return `${v} months`
    return String(v)
  }
  if (paths.length === 1) return fmt(paths[0], FLAT[paths[0]])
  if (paths.length > 8) return `${paths.length} figures (see Advanced settings)`
  return paths.map((k) => `${k.slice(prefix.length + 1)} ${fmt(k, FLAT[k])}`).join(' · ')
}

export function RulesPage() {
  const [filter, setFilter] = useState<'all' | PolicyMeta['status']>('all')
  const rows = Object.entries(POLICY_META)
    .map(([prefix, meta]) => ({ prefix, meta, value: valuesText(prefix, meta.unit) }))
    .sort((a, b) => STATUS[a.meta.status].order - STATUS[b.meta.status].order)
  const count = (s: PolicyMeta['status']) => rows.filter((r) => r.meta.status === s).length
  const shown = filter === 'all' ? rows : rows.filter((r) => r.meta.status === filter)
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Rules and figures we use</h1>
        <p className="mt-1 text-sm text-ink-2">
          Every figure the calculator relies on, where it comes from, and whether we’ve checked it against an official page (last checked {POLICY_VERSION_DATE}).
          {' '}{count('verified')} verified, {count('secondary')} from secondary sources, {count('unverified')} not verified. You can change any of them for a plan under Advanced settings.
        </p>
      </div>
      <Segmented value={filter} onChange={setFilter} ariaLabel="Filter by status"
        options={[{ value: 'all', label: 'All' }, { value: 'verified', label: 'Verified' }, { value: 'secondary', label: 'Secondary' }, { value: 'unverified', label: 'Not verified' }]} />
      <Card className="!p-0">
        <ul className="divide-y divide-line">
          {shown.map((r) => (
            <li key={r.prefix} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm font-semibold">{r.meta.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS[r.meta.status].cls}`}>{STATUS[r.meta.status].label}</span>
              </div>
              <div className="mt-0.5 text-sm tnum text-ink">{r.value}</div>
              <div className="mt-0.5 text-xs text-muted">Source: {r.meta.source}</div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
