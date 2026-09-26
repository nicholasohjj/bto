import type { FlatType, Policy } from '../config/policy'
import { ageInMonths, estimatedLivingCosts, prYear, ratesFor } from '../engine/cpf'
import { assessmentMonth, autoAmount, downpaymentSchedule, effectiveLtv, grantAmount, loanChangesOf, maxLtvFor, voluntaryList } from '../engine/payments'
import { assessEligibility } from '../engine/eligibility'
import { isCompleted, isSingle, isSinglesPurchase, leaseFactor, normalizeScenario, typicalDates } from '../engine/saleType'
import { addMonths, formatYm } from '../engine/dates'
import { money } from '../engine/format'
import type { CostItem, Milestone, Partner, Scenario, When } from '../engine/types'
import { newId } from '../state/defaults'
import { FLAT_TYPES, MILESTONES } from './labels'
import { Button, Card, Field, InfoTip, MoneyInput, MonthInput, NumberInput, PercentInput, Segmented, Select, Slider, TextInput, Toggle } from './controls'

export type Update = (fn: (draft: Scenario) => void) => void

// ---------------- Partners ----------------

export function PartnersEditor({ scenario, update, policy }: { scenario: Scenario; update: Update; policy: Policy }) {
  const years = yearOptions(scenario)
  const single = isSingle(scenario)
  const people = single ? scenario.partners.slice(0, 1) : scenario.partners
  return (
    <div className="space-y-4">
      <Card>
        <Field label="Who’s buying" tip="buyers">
          <Segmented value={scenario.buyers ?? 'couple'} ariaLabel="Who's buying"
            onChange={(v) => update((d) => {
              d.buyers = v
              // Singles can only buy a 2-room Flexi when buying new.
              if (v !== 'couple') d.flat.type = '2R'
            })}
            options={[{ value: 'couple', label: 'Couple' }, { value: 'single', label: 'Single' }, { value: 'jointSingles', label: 'Two singles' }]} />
        </Field>
        {scenario.buyers === 'single' && (
          <p className="mt-2 text-[11px] text-muted">Singles (Singapore Citizens, 35+) can buy a 2-room Flexi in any BTO, SBF or open-booking project. Income ceiling {money(policy.eligibility.incomeCeilingSingles)}; grant up to {money(policy.eligibility.ehgSingles[0].amount)}.</p>
        )}
        {scenario.buyers === 'jointSingles' && (
          <p className="mt-2 text-[11px] text-muted">Joint Singles Scheme: 2–4 singles aged 35+ buying a 2-room Flexi together. This app models two of you.</p>
        )}
      </Card>
      <div className={`grid gap-4 ${single ? '' : 'md:grid-cols-2'}`}>
        {people.map((p, i) => (
          <PartnerCard key={p.id} partner={p} startMonth={scenario.startMonth} policy={policy} years={years} onChange={(fn) => update((d) => fn(d.partners[i]))} />
        ))}
      </div>
    </div>
  )
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Years from the start month to a year after key collection (for one-off bonuses). */
function yearOptions(s: Scenario): number[] {
  const from = Number(s.startMonth.slice(0, 4))
  const to = Number(s.flat.dates.keys.slice(0, 4)) + 1
  return Array.from({ length: Math.max(1, to - from + 1) }, (_, i) => from + i)
}

function PartnerCard({ partner: p, startMonth, policy, years, onChange }: {
  partner: Partner; startMonth: string; policy: Policy; years: number[]; onChange: (fn: (p: Partner) => void) => void
}) {
  const age = Math.floor(ageInMonths(p.birthYearMonth, startMonth) / 12)
  const oaShare = ratesFor(ageInMonths(p.birthYearMonth, startMonth), policy, prYear(p, startMonth)).oaRatio
  const topUps = voluntaryList(p)
  // Editing top-ups moves any old single "monthly OA top-up" value into the list.
  const editTopUps = (fn: (list: NonNullable<Partner['voluntaryCpf']>) => void) =>
    onChange((d) => { const list = structuredClone(voluntaryList(d)); fn(list); d.voluntaryCpf = list; delete d.voluntaryOaMonthly })
  return (
    <Card>
      <div className="mb-3">
        <TextInput value={p.name} onChange={(v) => onChange((d) => { d.name = v })} ariaLabel="Name" />
      </div>
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
        {/* Full row: a month input needs ~170px, more than half a partner card on desktop. */}
        <div className="min-[360px]:col-span-2">
          <Field label="Birth month" hint={`Age ${age} now`}>
            <MonthInput value={p.birthYearMonth} onChange={(v) => onChange((d) => { d.birthYearMonth = v })} ariaLabel={`${p.name} birth month`} />
          </Field>
        </div>
        <Field label="Gross monthly salary">
          <MoneyInput value={p.grossMonthly} onChange={(v) => onChange((d) => { d.grossMonthly = v })} ariaLabel={`${p.name} salary`} />
        </Field>
        <Field label="Usual yearly raise" tipText="Applied every January. For uneven raises, a new job or time without income, use “Job & pay changes” below.">
          <NumberInput suffix="%" value={p.annualRaisePct} min={-20} max={50} onChange={(v) => onChange((d) => { d.annualRaisePct = v })} ariaLabel={`${p.name} raise`} />
        </Field>
        <Field label="CPF OA balance now" tip="OA">
          <MoneyInput value={p.cpfOA} onChange={(v) => onChange((d) => { d.cpfOA = v })} ariaLabel={`${p.name} OA`} />
        </Field>
        <Field label="Cash savings now" tip="cash">
          <MoneyInput value={p.cash} onChange={(v) => onChange((d) => { d.cash = v })} ariaLabel={`${p.name} cash`} />
        </Field>
        <Field label="Cash saved per month" tipText="What you put aside each month after normal spending. Don’t subtract rent or mortgage — the app does that.">
          <MoneyInput value={p.monthlyCashSavings} onChange={(v) => onChange((d) => { d.monthlyCashSavings = v })} ariaLabel={`${p.name} monthly savings`} />
        </Field>
        <div className="min-[360px]:col-span-2">
          <Toggle label="Still studying / in NS" tip="workStart" checked={!!p.workStartMonth}
            onChange={(v) => onChange((d) => {
              if (v) { d.workStartMonth = addMonths(startMonth, 12); d.preWorkMonthlySavings ??= 200 } else { delete d.workStartMonth }
            })} />
        </div>
        {p.workStartMonth && (
          <>
            <Field label="Starts full-time work" hint={`Salary above is the starting pay from ${formatYm(p.workStartMonth)}`}>
              <MonthInput value={p.workStartMonth} onChange={(v) => onChange((d) => { d.workStartMonth = v })} ariaLabel={`${p.name} work start`} />
            </Field>
            <Field label="Saved per month until then" tipText="From a part-time job or allowance. No CPF is added before full-time work starts.">
              <MoneyInput value={p.preWorkMonthlySavings ?? 0} onChange={(v) => onChange((d) => { d.preWorkMonthlySavings = v })} ariaLabel={`${p.name} pre-work savings`} />
            </Field>
          </>
        )}
        <Field label="Citizenship" tip="citizenship">
          <Select value={p.citizenship ?? 'SC'} ariaLabel={`${p.name} citizenship`}
            onChange={(v) => onChange((d) => { d.citizenship = v; if (v === 'SPR') d.prSinceMonth ??= startMonth })}
            options={[{ value: 'SC', label: 'Citizen' }, { value: 'SPR', label: 'Permanent Resident' }]} />
        </Field>
        <Field label="Work" tip="selfEmployed">
          <Select value={p.employment ?? 'employee'} ariaLabel={`${p.name} employment`}
            onChange={(v) => onChange((d) => { d.employment = v })}
            options={[{ value: 'employee', label: 'Employee' }, { value: 'selfEmployed', label: 'Self-employed' }]} />
        </Field>
        {p.citizenship === 'SPR' && (
          <Field label="PR since" hint="Lower CPF rates in the first 2 years">
            <MonthInput value={p.prSinceMonth ?? startMonth} onChange={(v) => onChange((d) => { d.prSinceMonth = v })} ariaLabel={`${p.name} PR since`} />
          </Field>
        )}
        <Field label="Other monthly debts" tip="TDSR" hint="Car loan etc.">
          <MoneyInput value={p.otherMonthlyDebt} onChange={(v) => onChange((d) => { d.otherMonthlyDebt = v })} ariaLabel={`${p.name} other debts`} />
        </Field>
        <Field label="Share of bonus saved">
          <NumberInput suffix="%" min={0} max={100} value={p.bonusSavedPct} onChange={(v) => onChange((d) => { d.bonusSavedPct = v })} ariaLabel={`${p.name} bonus saved`} />
        </Field>
      </div>
      <IncomeChanges partner={p} startMonth={startMonth} years={years} onChange={onChange} />
      <div className="mt-4">
        <div className="mb-1 flex items-center text-xs font-medium text-ink-2">Bonuses<InfoTip text="Months of salary, or a fixed dollar amount (e.g. a $5,000 sign-on or performance bonus). Pick “Every year” or a single year for a one-off. Employees pay CPF on bonuses." /></div>
        {p.bonuses.map((b, bi) => {
          const fixed = b.amount !== undefined
          return (
            <div key={bi} className="mb-2 space-y-2 rounded-lg border border-line p-2">
              <div className="flex items-center gap-2">
                <div className="w-28 shrink-0">
                  <Segmented value={fixed ? 'amount' : 'months'} ariaLabel="Bonus type"
                    onChange={(v) => onChange((d) => { if (v === 'amount') d.bonuses[bi].amount = Math.round(d.bonuses[bi].months * d.grossMonthly); else delete d.bonuses[bi].amount })}
                    options={[{ value: 'months', label: 'Months' }, { value: 'amount', label: '$' }]} />
                </div>
                <div className="min-w-0 flex-1">
                  {fixed
                    ? <MoneyInput value={b.amount ?? 0} onChange={(v) => onChange((d) => { d.bonuses[bi].amount = v })} ariaLabel="Bonus amount" />
                    : <NumberInput suffix="mths" min={0} max={24} value={b.months} onChange={(v) => onChange((d) => { d.bonuses[bi].months = v })} ariaLabel="Bonus months" />}
                </div>
                <Button variant="ghost" ariaLabel="Remove bonus" onClick={() => onChange((d) => { d.bonuses.splice(bi, 1) })}>✕</Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={String(b.paidInMonth)} onChange={(v) => onChange((d) => { d.bonuses[bi].paidInMonth = Number(v) })}
                  options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: `Paid in ${m}` }))} ariaLabel="Bonus month" />
                <Select value={b.year ? String(b.year) : 'every'} ariaLabel="Bonus year"
                  onChange={(v) => onChange((d) => { if (v === 'every') delete d.bonuses[bi].year; else d.bonuses[bi].year = Number(v) })}
                  options={[{ value: 'every', label: 'Every year' }, ...years.map((y) => ({ value: String(y), label: `Only ${y}` }))]} />
              </div>
            </div>
          )
        })}
        <Button variant="ghost" onClick={() => onChange((d) => { d.bonuses.push({ months: 1, paidInMonth: 12 }) })}>+ Add bonus</Button>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex items-center text-xs font-medium text-ink-2">Voluntary CPF top-ups<InfoTip term="voluntaryCpf" /></div>
        {topUps.map((v, vi) => (
          <div key={v.id} className="mb-2 space-y-2 rounded-lg border border-line p-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1"><MoneyInput value={v.amount} onChange={(x) => editTopUps((l) => { l[vi].amount = x })} ariaLabel="Top-up amount" /></div>
              <div className="w-32 shrink-0">
                <Select value={v.frequency} ariaLabel="Top-up frequency"
                  onChange={(x) => editTopUps((l) => { l[vi].frequency = x; if (x === 'yearly') l[vi].month ??= 12; if (x === 'once') l[vi].date ??= startMonth })}
                  options={[{ value: 'once', label: 'Once' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
              </div>
              <Button variant="ghost" ariaLabel="Remove top-up" onClick={() => editTopUps((l) => { l.splice(vi, 1) })}>✕</Button>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              {v.frequency === 'yearly' && (
                <Field label="Paid">
                  <Select value={String(v.month ?? 12)} onChange={(x) => editTopUps((l) => { l[vi].month = Number(x) })}
                    options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: `Each ${m}` }))} ariaLabel="Top-up month" />
                </Field>
              )}
              <Field label={v.frequency === 'once' ? 'Month' : 'From'}>
                <MonthInput value={v.date ?? startMonth} onChange={(x) => editTopUps((l) => { l[vi].date = x })} ariaLabel={v.frequency === 'once' ? 'Top-up month' : 'Starting'} />
              </Field>
              {v.frequency !== 'once' && (
                <Field label="Until (optional)">
                  <MonthInput value={v.until ?? ''} onChange={(x) => editTopUps((l) => { l[vi].until = x })} ariaLabel="Until" />
                </Field>
              )}
            </div>
          </div>
        ))}
        <Button variant="ghost" onClick={() => editTopUps((l) => { l.push({ id: newId('vc'), amount: 1000, frequency: 'once', date: startMonth }) })}>+ Add top-up</Button>
        {topUps.length > 0 && (
          <p className="mt-1 text-[11px] text-muted">
            Paid from {p.name}’s cash. About {Math.round(oaShare * 100)}% goes to OA at this age; the rest to Special/MediSave.
            Capped at {money(policy.cpf.annualLimit)} a year including normal CPF.
          </p>
        )}
      </div>
    </Card>
  )
}

function IncomeChanges({ partner: p, startMonth, years, onChange }: {
  partner: Partner; startMonth: string; years: number[]; onChange: (fn: (p: Partner) => void) => void
}) {
  const changes = p.incomeChanges ?? []
  const edit = (fn: (list: NonNullable<Partner['incomeChanges']>) => void) =>
    onChange((d) => { d.incomeChanges ??= []; fn(d.incomeChanges) })
  const nextYear = Number(startMonth.slice(0, 4)) + 1
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center text-xs font-medium text-ink-2">Job & pay changes<InfoTip term="incomeChanges" /></div>
      {changes.map((c, ci) => (
        <div key={c.id} className="mb-2 space-y-2 rounded-lg border border-line p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink">
              {c.kind === 'newSalary' ? 'New job / new pay' : c.kind === 'noIncome' ? 'Time without income' : 'Different raise for a year'}
            </span>
            <Button variant="ghost" ariaLabel="Remove change" onClick={() => edit((l) => { l.splice(ci, 1) })}>✕</Button>
          </div>
          {c.kind === 'newSalary' && (
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              <Field label="From"><MonthInput value={c.from} onChange={(v) => edit((l) => { (l[ci] as typeof c).from = v })} ariaLabel="New pay from" /></Field>
              <Field label="Gross monthly salary"><MoneyInput value={c.salary} onChange={(v) => edit((l) => { (l[ci] as typeof c).salary = v })} ariaLabel="New salary" /></Field>
              <div className="min-[360px]:col-span-2">
                <Field label="Cash saved per month from then" hint={c.monthlyCashSavings === undefined ? 'Same as now' : undefined}>
                  <MoneyInput value={c.monthlyCashSavings ?? p.monthlyCashSavings} onChange={(v) => edit((l) => { (l[ci] as typeof c).monthlyCashSavings = v })} ariaLabel="New monthly savings" />
                </Field>
              </div>
            </div>
          )}
          {c.kind === 'noIncome' && (
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              <Field label="From"><MonthInput value={c.from} onChange={(v) => edit((l) => { (l[ci] as typeof c).from = v })} ariaLabel="No income from" /></Field>
              <Field label="Until (optional)"><MonthInput value={c.until ?? ''} onChange={(v) => edit((l) => { (l[ci] as typeof c).until = v })} ariaLabel="No income until" /></Field>
              <div className="min-[360px]:col-span-2">
                <Field label="Living costs paid from savings / month" hint="No salary, CPF or bonus in this period.">
                  <MoneyInput value={-c.monthlyCashChange} onChange={(v) => edit((l) => { (l[ci] as typeof c).monthlyCashChange = -v })} ariaLabel="Living costs during gap" />
                </Field>
              </div>
            </div>
          )}
          {c.kind === 'raise' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Year">
                <Select value={String(c.year)} onChange={(v) => edit((l) => { (l[ci] as typeof c).year = Number(v) })}
                  options={years.map((y) => ({ value: String(y), label: `January ${y}` }))} ariaLabel="Raise year" />
              </Field>
              <Field label="Raise that year">
                <NumberInput suffix="%" min={-50} max={100} value={c.pct} onChange={(v) => edit((l) => { (l[ci] as typeof c).pct = v })} ariaLabel="Raise that year" />
              </Field>
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" onClick={() => edit((l) => { l.push({ id: newId('ic'), kind: 'newSalary', from: addMonths(startMonth, 12), salary: Math.round(p.grossMonthly * 1.15 / 100) * 100 }) })}>+ New job / pay</Button>
        <Button variant="ghost" onClick={() => edit((l) => { l.push({ id: newId('ic'), kind: 'noIncome', from: addMonths(startMonth, 12), until: addMonths(startMonth, 17), monthlyCashChange: -estimatedLivingCosts(p, startMonth, startMonth) }) })}>+ Time without income</Button>
        <Button variant="ghost" onClick={() => edit((l) => { l.push({ id: newId('ic'), kind: 'raise', year: nextYear, pct: 0 }) })}>+ Different raise</Button>
      </div>
    </div>
  )
}

// ---------------- Flat ----------------

export function FlatEditor({ scenario, update, policy }: { scenario: Scenario; update: Update; policy: Policy }) {
  const f = scenario.flat
  const el = assessEligibility(scenario, policy)
  const saleType = f.saleType ?? 'BTO'
  const completed = isCompleted(scenario)
  const lf = leaseFactor(scenario, policy)
  const shownMilestones = MILESTONES.filter((m) =>
    !(saleType === 'OBF' && m.value === 'application') && !(completed && m.value === 'afl'))
  return (
    <div className="space-y-4">
      <Card>
        <Field label="How you’re buying" tip="saleType">
          <Segmented value={saleType} ariaLabel="Mode of sale"
            onChange={(v) => update((d) => { d.flat.saleType = v; if (v === 'BTO') d.flat.completed = false; d.flat.dates = typicalDates(d.startMonth, v, !!d.flat.completed && v !== 'BTO') })}
            options={[{ value: 'BTO', label: 'BTO' }, { value: 'SBF', label: 'SBF' }, { value: 'OBF', label: 'Open booking' }]} />
        </Field>
        {saleType !== 'BTO' && (
          <div className="mt-3 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <div className="min-[360px]:col-span-2">
              <Toggle label="The flat is already completed" tip="completed" checked={!!f.completed}
                onChange={(v) => update((d) => { d.flat.completed = v; d.flat.dates = typicalDates(d.startMonth, saleType, v) })} />
            </div>
            <Field label="Remaining lease" tip="remainingLease"
              hint={lf.factor < 1 ? <span className="text-critical">CPF use {saleType && scenario.financing.loanType === 'HDB' ? '& HDB loan ' : ''}limited to {Math.round(lf.factor * 100)}%</span> : 'Covers you to age 95'}>
              <NumberInput suffix="yrs" min={1} max={99} value={f.remainingLeaseYears ?? 99} onChange={(v) => update((d) => { d.flat.remainingLeaseYears = v })} ariaLabel="Remaining lease" />
            </Field>
          </div>
        )}
        {saleType !== 'BTO' && (
          <p className="mt-2 text-[11px] text-muted">
            {saleType === 'SBF' ? 'SBF runs alongside BTO launches, with a ballot. ' : 'Open booking: no ballot — first come, first served, and you can book as early as the next working day. '}
            {completed ? 'For a completed flat you sign the AFL and collect keys together (within 9 months of booking) and pay the full downpayment then.' : 'Changing this resets the dates to typical ones — adjust them below.'}
          </p>
        )}
      </Card>
      <Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="Flat price">
            <MoneyInput value={f.price} onChange={(v) => update((d) => { d.flat.price = v })} ariaLabel="Flat price" />
          </Field>
          <Field label="Flat type">
            <Select value={f.type} onChange={(v) => update((d) => { d.flat.type = v })} options={FLAT_TYPES} ariaLabel="Flat type" />
          </Field>
          <Field label="Classification" tip="classification">
            <Select value={f.classification} onChange={(v) => update((d) => { d.flat.classification = v })} ariaLabel="Classification"
              options={[{ value: 'Standard', label: 'Standard' }, { value: 'Plus', label: 'Plus' }, { value: 'Prime', label: 'Prime' }]} />
          </Field>
          <div className="col-span-2 md:col-span-3">
            <Field label="You are" tip="household">
              <Select value={f.household ?? 'firstTimers'} onChange={(v) => update((d) => { d.flat.household = v })} ariaLabel="Household status"
                options={isSingle(scenario)
                  ? [{ value: 'firstTimers', label: 'A first-timer' }, { value: 'secondTimers', label: 'A second-timer' }]
                  : [
                    { value: 'firstTimers', label: 'Both first-timers' },
                    { value: 'firstAndSecond', label: 'One first-timer, one second-timer' },
                    { value: 'secondTimers', label: 'Both second-timers' },
                  ]} />
            </Field>
          </div>
          {f.household === 'secondTimers' && (
            <div className="col-span-2 md:col-span-3">
              <Toggle label="We now live in public rental or own a 2-room flat" tip="stepUp" checked={!!f.fromRentalOr2Room}
                onChange={(v) => update((d) => { d.flat.fromRentalOr2Room = v })} />
            </div>
          )}
          {(f.household ?? 'firstTimers') !== 'firstTimers' && (
            <>
              <div className="col-span-2 md:col-span-1"><Field label="First subsidised flat (sets the resale levy)" tip="resaleLevy">
                <Select value={f.firstSubsidisedFlat ?? 'unset'} ariaLabel="First subsidised flat"
                  onChange={(v) => update((d) => { d.flat.firstSubsidisedFlat = v === 'unset' ? undefined : v })}
                  options={[
                    { value: 'unset', label: 'Choose…' },
                    ...FLAT_TYPES.map((t) => ({ value: t.value, label: `${t.label} (${money(policy.resaleLevy[t.value])})` })),
                    { value: 'EC', label: `Executive condo (${money(policy.resaleLevy.EC)})` },
                    { value: 'none', label: 'No subsidy before (no levy)' },
                  ] as { value: FlatType | 'EC' | 'none' | 'unset'; label: string }[]} />
              </Field></div>
              <div className="col-span-2 flex items-end">
                <Toggle label="Only half the levy (e.g. divorced, now buying with a first-timer)" checked={!!f.halfResaleLevy}
                  onChange={(v) => update((d) => { d.flat.halfResaleLevy = v })} />
              </div>
            </>
          )}
        </div>
        <EligibilitySummary el={el} />
      </Card>
      <Card>
        <div className="mb-2 text-sm font-semibold">Key dates</div>
        <div className={`grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 ${shownMilestones.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          {shownMilestones.map((m) => (
            <Field key={m.value} label={completed && m.value === 'keys' ? 'AFL + key collection' : m.value === 'booking' && saleType === 'OBF' ? 'Booking (you apply & book)' : m.label}
              tip={m.value === 'application' ? 'application' : m.value === 'booking' ? 'booking' : m.value === 'afl' ? 'AFL' : 'keys'}>
              <MonthInput value={f.dates[m.value]} onChange={(v) => update((d) => {
                d.flat.dates[m.value] = v
                if (completed && m.value === 'keys') d.flat.dates.afl = v
                if (saleType === 'OBF' && m.value === 'booking') d.flat.dates.application = v
              })} ariaLabel={m.label} />
            </Field>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Simulation runs from {scenario.startMonth} to 12 months after key collection.</p>
      </Card>
      <Card>
        <div className="mb-2 flex items-center text-sm font-semibold">Grants <InfoTip term="grant" /></div>
        {f.grants.length === 0 && <p className="mb-2 text-sm text-ink-2">No grants yet. Add the amounts from your HFE letter.</p>}
        {f.grants.map((g, i) => (
          <div key={g.id} className="mb-3 grid grid-cols-2 gap-2 border-b border-line pb-3 last:border-0 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
            <div className="col-span-2 md:col-span-1"><Field label="Name"><TextInput value={g.name} onChange={(v) => update((d) => { d.flat.grants[i].name = v })} ariaLabel="Grant name" /></Field></div>
            <Field label={g.auto ? 'Amount (auto)' : 'Amount'} tipText={g.auto === 'EHG' ? el.ehgReason : g.auto === 'StepUp' ? el.stepUpReason : undefined}>
              {g.auto ? (
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm tnum">{money(grantAmount(g, el))}</div>
                  <Button variant="ghost" className="!px-2 text-xs" onClick={() => update((d) => { d.flat.grants[i].amount = grantAmount(g, el); delete d.flat.grants[i].auto })}>Edit</Button>
                </div>
              ) : <MoneyInput value={g.amount} onChange={(v) => update((d) => { d.flat.grants[i].amount = v })} ariaLabel="Grant amount" />}
            </Field>
            <Field label={`% to ${scenario.partners[0].name}`}><NumberInput suffix="%" min={0} max={100} value={g.splitA} onChange={(v) => update((d) => { d.flat.grants[i].splitA = v })} ariaLabel="Grant split" /></Field>
            <Field label="Credited at" tipText="When the grant lands in your OA. For BTO flats this is usually at key collection (not confirmed — check your HFE/HDB letters).">
              <Select value={'milestone' in g.when ? g.when.milestone : 'keys'} onChange={(v) => update((d) => { d.flat.grants[i].when = { milestone: v } })} options={MILESTONES.filter((m) => m.value !== 'application')} ariaLabel="Grant timing" />
            </Field>
            <Button variant="ghost" ariaLabel="Remove grant" onClick={() => update((d) => { d.flat.grants.splice(i, 1) })}>✕</Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => update((d) => { d.flat.grants.push({ id: newId('g'), name: 'Enhanced CPF Housing Grant', amount: 0, auto: 'EHG', splitA: 50, when: { milestone: 'keys' } }) })}>+ Enhanced CPF Housing Grant (auto)</Button>
          {f.household === 'secondTimers' && (
            <Button variant="ghost" onClick={() => update((d) => { d.flat.grants.push({ id: newId('g'), name: 'Step-Up CPF Housing Grant', amount: 0, auto: 'StepUp', splitA: 50, when: { milestone: 'keys' } }) })}>+ Step-Up grant (auto)</Button>
          )}
          <Button variant="ghost" onClick={() => update((d) => { d.flat.grants.push({ id: newId('g'), name: 'Other grant', amount: 0, splitA: 50, when: { milestone: 'keys' } }) })}>+ Other grant</Button>
        </div>
      </Card>
    </div>
  )
}

function EligibilitySummary({ el }: { el: ReturnType<typeof assessEligibility> }) {
  const row = (label: string, value: string, bad = false) => (
    <div className="flex justify-between gap-3"><dt className="text-ink-2">{label}</dt><dd className={`tnum text-right ${bad ? 'text-critical' : 'text-ink'}`}>{value}</dd></div>
  )
  return (
    <dl className="mt-3 space-y-1 rounded-lg bg-surface-2 p-3 text-xs">
      {el.purchaseAvgIncome !== el.avgIncome || el.purchaseAssessedAt !== el.assessedAt ? (
        <>
          {row(`Income when applying (${formatYm(el.purchaseAssessedAt)})`, `${money(el.purchaseAvgIncome)}/mth`, el.aboveCeiling)}
          {row('Income ceiling to buy this flat', money(el.incomeCeiling), el.aboveCeiling)}
          {row(`Income at deferred check (${formatYm(el.assessedAt)})`, `${money(el.avgIncome)}/mth`, el.hdbLoanBlockedByDia)}
          {row('HDB loan income ceiling', money(el.hdbLoanIncomeCeiling), el.hdbLoanBlockedByDia)}
        </>
      ) : (
        <>
          {row(`Avg household income (12 mths to ${formatYm(el.windowEnd)})`, `${money(el.avgIncome)}/mth`)}
          {row('Income ceiling for this flat', money(el.incomeCeiling), el.aboveCeiling)}
        </>
      )}
      {row('Enhanced CPF Housing Grant (estimate)', money(el.ehg))}
      {el.household === 'secondTimers' && row('Step-Up grant (estimate)', money(el.stepUp))}
      {el.premium > 0 && row('Citizen + PR premium', `+${money(el.premium)}`)}
      {el.bothSpr && <p className="text-critical">Two PRs can’t buy a BTO flat.</p>}
      <p className="pt-1 text-muted">Estimates from your salaries; your HFE letter has the real figures.</p>
    </dl>
  )
}

// ---------------- Financing ----------------

export function FinancingEditor({ scenario, update, policy }: { scenario: Scenario; update: Update; policy: Policy }) {
  const fin = scenario.financing
  const isHdb = fin.loanType === 'HDB'
  const ltvRule = maxLtvFor(scenario, policy)
  const maxLtv = ltvRule.max
  const [a, b] = scenario.partners
  return (
    <div className="space-y-4">
      <Card>
        <Field label={<>Loan type</>} tipText="HDB loan: 2.6%, fixed to the CPF rate, more flexible. Bank loan: often cheaper now but rates can change, and 5% must be cash.">
          <Segmented
            value={fin.loanType}
            ariaLabel="Loan type"
            onChange={(v) => update((d) => {
              d.financing.loanType = v
              d.financing.rate = v === 'HDB' ? policy.hdbLoan.interestRate : policy.bankLoan.defaultInterestRate
              const cap = v === 'HDB' ? policy.hdbLoan.maxLtv : policy.bankLoan.maxLtv
              d.financing.ltv = Math.min(d.financing.ltv, cap)
              d.financing.tenureYears = Math.min(d.financing.tenureYears, v === 'HDB' ? policy.hdbLoan.maxTenureYears : policy.bankLoan.maxTenureYears)
            })}
            options={[{ value: 'HDB', label: 'HDB loan' }, { value: 'bank', label: 'Bank loan' }]}
          />
        </Field>
        <p className="mt-1.5 text-[11px] text-muted">
          {isHdb
            ? 'You declare your financing when you sign the AFL. HDB assesses your loan with the HFE letter.'
            : 'You’ll need the bank’s Letter of Offer before signing the AFL (HDB requirement), and at least the minimum cash downpayment.'}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Loan-to-value" tip="LTV" hint={ltvRule.reduced ? <span className="text-critical">Max {Math.round(maxLtv * 100)}%: {ltvRule.reason}</span> : `Max ${Math.round(maxLtv * 100)}%`}>
            <PercentInput value={fin.ltv} max={(isHdb ? policy.hdbLoan.maxLtv : policy.bankLoan.maxLtv) * 100} onChange={(v) => update((d) => { d.financing.ltv = v })} ariaLabel="Loan to value" />
          </Field>
          <Field label="Interest rate">
            <PercentInput value={fin.rate} max={20} onChange={(v) => update((d) => { d.financing.rate = v })} ariaLabel="Interest rate" />
          </Field>
          <Field label="Tenure">
            <NumberInput suffix="yrs" min={1} max={35} value={fin.tenureYears} onChange={(v) => update((d) => { d.financing.tenureYears = v })} ariaLabel="Tenure" />
          </Field>
        </div>
        {(!isHdb || loanChangesOf(fin, scenario.flat.dates.keys).some((c) => c.kind === 'refinance')) && (
          <div className="mt-3 border-t border-line pt-3">
            <Toggle label={`We’ve set aside the Basic Retirement Sum (${money(policy.cpf.basicRetirementSum)})`} tip="cpfLimit" checked={!!fin.brsSetAside}
              onChange={(v) => update((d) => { d.financing.brsSetAside = v })} />
          </div>
        )}
      </Card>
      <LoanChangesEditor scenario={scenario} update={update} />
      <Card>
        {isSinglesPurchase(scenario) ? (
          <p className="py-1 text-xs text-ink-2">Singles pay the standard downpayment: the staggered scheme and Deferred Income Assessment are for couples.</p>
        ) : (
          <>
            <Toggle label="Deferred Income Assessment" tip="DIA" checked={!!fin.deferredIncomeAssessment}
              onChange={(v) => update((d) => { d.financing.deferredIncomeAssessment = v })} />
            {fin.deferredIncomeAssessment && <DiaChecklist scenario={scenario} policy={policy} />}
          </>
        )}
        {isSinglesPurchase(scenario) ? null : isCompleted(scenario)
          ? <p className="py-1 text-xs text-ink-2">Completed flat: the full downpayment is paid when you sign the AFL and collect keys, so there’s nothing to stagger.</p>
          : fin.deferredIncomeAssessment
            ? <p className="py-1 text-xs text-ink-2">Staggered downpayment isn’t needed: DIA already means just 2.5% at AFL.</p>
            : <Toggle label="Staggered downpayment" tip="staggered" checked={fin.staggered} onChange={(v) => update((d) => { d.financing.staggered = v })} />}
        <DownpaymentPreview scenario={scenario} policy={policy} />
      </Card>
      <Card>
        <Field label={<>Pay CPF-allowed items with CPF: <span className="ml-1 tnum text-ink">{fin.cpfUsagePct}%</span></>} tip="cpfSlider"
          hint={isHdb ? `HDB loan rule: OA above ${money(policy.hdbLoan.oaRetainMax)}${isSingle(scenario) ? '' : ' each'} is used for the downpayment even if the slider is lower.` : 'Min cash rules for bank loans are always applied.'}>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>Cash</span>
            <Slider value={fin.cpfUsagePct} onChange={(v) => update((d) => { d.financing.cpfUsagePct = v })} ariaLabel="CPF usage" />
            <span>CPF</span>
          </div>
        </Field>
        <div className="mt-3">
          <Field label="Monthly mortgage paid from">
            <Segmented value={fin.mortgageFrom} onChange={(v) => update((d) => { d.financing.mortgageFrom = v })} ariaLabel="Mortgage source"
              options={[{ value: 'cpfFirst', label: 'CPF OA first' }, { value: 'cashOnly', label: 'Cash only' }]} />
          </Field>
        </div>
      </Card>
      {!isSingle(scenario) && (
        <Card>
          <Field label={<>Joint payments: {a.name} {fin.jointSplitA}% · {b.name} {100 - fin.jointSplitA}%</>} tip="jointSplit">
            <Slider value={fin.jointSplitA} onChange={(v) => update((d) => { d.financing.jointSplitA = v })} ariaLabel="Joint split" />
          </Field>
          <Toggle label="Pool our cash" tip="poolCash" checked={fin.poolCash} onChange={(v) => update((d) => { d.financing.poolCash = v })} />
        </Card>
      )}
    </div>
  )
}

function LoanChangesEditor({ scenario, update }: { scenario: Scenario; update: Update }) {
  const fin = scenario.financing
  const keys = scenario.flat.dates.keys
  // Show the list as entered (yearly prepayments as one row), plus the old lock-in setting if present.
  const changes = fin.loanChanges ?? loanChangesOf(fin, keys)
  const hasRefi = changes.some((c) => c.kind === 'refinance')
  const onBankLoan = fin.loanType === 'bank' || hasRefi
  // Editing moves the old single "rate after lock-in" into the list.
  const edit = (fn: (list: NonNullable<Scenario['financing']['loanChanges']>) => void) =>
    update((d) => {
      const list = structuredClone(d.financing.loanChanges ?? loanChangesOf(d.financing, keys))
      fn(list)
      d.financing.loanChanges = list
      delete d.financing.rateAfter
    })
  const inYears = (n: number) => addMonths(keys, n * 12 + 1)
  const title = { rate: 'Rate change', refinance: fin.loanType === 'HDB' ? 'Switch to a bank loan' : 'Refinance / reprice', tenure: 'Change tenure', prepay: 'Prepay a lump sum' }
  return (
    <Card>
      <div className="mb-1 flex items-center text-sm font-semibold">Loan changes after key collection<InfoTip term="loanChanges" /></div>
      <p className="mb-2 text-xs text-ink-2">
        For floating rates, add a rate change for each period you expect. Refinancing and tenure changes re-work the instalment on what you still owe.
      </p>
      <ul className="mb-3 list-disc space-y-0.5 pl-4 text-[11px] text-muted">
        {fin.loanType === 'HDB' ? (
          <>
            <li>Switching to a bank loan <b>before keys</b>: the bank loan starts at key collection, and you must have paid at least 5% of the price in cash overall — any AFL part paid with CPF is made up in cash at keys.</li>
            <li><b>After keys</b>: switch any time; no HDB penalty and no cash rule.</li>
            <li>Once on a bank loan, you can’t go back to an HDB loan.</li>
          </>
        ) : (
          <li>You can’t switch from a bank loan to an HDB loan, before or after keys. You can refinance to another bank.</li>
        )}
      </ul>
      {changes.map((c, ci) => (
        <div key={c.id} className="mb-2 space-y-2 rounded-lg border border-line p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink">
              {title[c.kind]}
              {c.kind === 'refinance' && fin.loanType === 'HDB' && c.from <= keys && (
                <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-normal text-ink-2">before keys · 5% cash rule at keys</span>
              )}
            </span>
            <Button variant="ghost" ariaLabel="Remove loan change" onClick={() => edit((l) => { l.splice(ci, 1) })}>✕</Button>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
            <Field label="From"><MonthInput value={c.from} onChange={(v) => edit((l) => { l[ci].from = v })} ariaLabel="Change from" /></Field>
            {(c.kind === 'rate' || c.kind === 'refinance') && (
              <Field label="New rate"><PercentInput value={c.rate} max={20} onChange={(v) => edit((l) => { (l[ci] as typeof c).rate = v })} ariaLabel="New rate" /></Field>
            )}
            {c.kind === 'prepay' && (
              <>
                <Field label="Amount"><MoneyInput value={c.amount} onChange={(v) => edit((l) => { (l[ci] as typeof c).amount = v })} ariaLabel="Prepayment amount" /></Field>
                <Field label="Pay with">
                  <Select value={c.source} onChange={(v) => edit((l) => { (l[ci] as typeof c).source = v })} ariaLabel="Prepay with"
                    options={[{ value: 'cash', label: 'Cash' }, { value: 'cpf', label: 'CPF OA' }]} />
                </Field>
                <Field label="Then">
                  <Select value={c.then} onChange={(v) => edit((l) => { (l[ci] as typeof c).then = v })} ariaLabel="After prepaying"
                    options={[{ value: 'lowerInstalment', label: 'Lower instalment' }, { value: 'shorterTenure', label: 'Finish sooner' }]} />
                </Field>
                {onBankLoan && (
                  <Field label="Prepayment penalty" tipText="Banks may charge around 1.5% of the amount you prepay during the lock-in period. HDB loans have no penalty.">
                    <NumberInput suffix="% of amount" min={0} max={10} value={c.penaltyPct} onChange={(v) => edit((l) => { (l[ci] as typeof c).penaltyPct = v })} ariaLabel="Prepayment penalty" />
                  </Field>
                )}
                <div className="min-[360px]:col-span-2">
                  <Toggle label="Repeat every year" checked={!!c.repeatYearly} onChange={(v) => edit((l) => { (l[ci] as typeof c).repeatYearly = v })} />
                </div>
                {c.repeatYearly && (
                  <Field label="Until (optional)"><MonthInput value={c.until ?? ''} onChange={(v) => edit((l) => { (l[ci] as typeof c).until = v })} ariaLabel="Repeat until" /></Field>
                )}
              </>
            )}
            {c.kind === 'tenure' && (
              <Field label="Years left from then"><NumberInput suffix="yrs" min={1} max={35} value={c.tenureYears} onChange={(v) => edit((l) => { (l[ci] as typeof c).tenureYears = v })} ariaLabel="Remaining tenure" /></Field>
            )}
            {c.kind === 'refinance' && (
              <>
                <Field label="Years left (optional)" hint="0 = keep the same end date">
                  <NumberInput suffix="yrs" min={0} max={35} value={c.tenureYears ?? 0} onChange={(v) => edit((l) => { (l[ci] as typeof c).tenureYears = v > 0 ? v : undefined })} ariaLabel="Remaining tenure after refinancing" />
                </Field>
                <Field label="Costs (cash)" tipText="Legal and valuation fees for the new loan. Banks sometimes subsidise these; enter what you’d pay.">
                  <MoneyInput value={c.costs} onChange={(v) => edit((l) => { (l[ci] as typeof c).costs = v })} ariaLabel="Refinancing costs" />
                </Field>
                <Field label="Lock-in penalty" tipText="If you leave a bank loan during its lock-in, banks usually charge around 1.5% of the amount still owed. Leave at 0 when switching from an HDB loan.">
                  <NumberInput suffix="% of balance" min={0} max={10} value={c.penaltyPct} onChange={(v) => edit((l) => { (l[ci] as typeof c).penaltyPct = v })} ariaLabel="Lock-in penalty" />
                </Field>
              </>
            )}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" onClick={() => edit((l) => { l.push({ id: newId('lc'), kind: 'rate', from: inYears(2), rate: fin.rate + 0.005 }) })}>+ Rate change</Button>
        <Button variant="ghost" onClick={() => edit((l) => { l.push({ id: newId('lc'), kind: 'refinance', from: inYears(fin.loanType === 'HDB' && !hasRefi ? 1 : 3), rate: Math.max(0.01, fin.rate - 0.005), costs: 2500, penaltyPct: 0 }) })}>
          + {fin.loanType === 'HDB' && !hasRefi ? 'Switch to bank loan' : 'Refinance'}
        </Button>
        <Button variant="ghost" onClick={() => edit((l) => { l.push({ id: newId('lc'), kind: 'tenure', from: inYears(5), tenureYears: Math.max(1, fin.tenureYears - 10) }) })}>+ Change tenure</Button>
        <Button variant="ghost" onClick={() => edit((l) => { l.push({ id: newId('lc'), kind: 'prepay', from: inYears(2), amount: 20000, source: 'cash', then: 'lowerInstalment', penaltyPct: 0 }) })}>+ Prepay a lump sum</Button>
      </div>
    </Card>
  )
}

function DiaChecklist({ scenario, policy }: { scenario: Scenario; policy: Policy }) {
  const ages = scenario.partners.map((p) => Math.floor(ageInMonths(p.birthYearMonth, scenario.flat.dates.application) / 12))
  const ageOk = ages.some((a) => a <= policy.dia.maxAgeYears)
  const items: { ok: boolean | null; text: string }[] = [
    { ok: null, text: `Both of you are full-time students or NSFs, or finished within the last ${policy.dia.recentGradMonths} months, when you apply for the HFE letter` },
    { ok: ageOk, text: `At least one of you is ${policy.dia.maxAgeYears} or younger (you’ll be ${ages.join(' and ')} at application)` },
    { ok: null, text: 'You are married, or applying under the Fiancé/Fiancée Scheme' },
    { ok: null, text: 'At least one of you is a first-timer' },
  ]
  return (
    <div className="my-2 rounded-lg bg-surface-2 p-3 text-xs">
      <div className="mb-1 font-medium text-ink">Check you qualify</div>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.text} className="flex gap-2 text-ink-2">
            <span aria-hidden className={it.ok === false ? 'text-critical' : it.ok ? 'text-good-ink' : 'text-muted'}>{it.ok === false ? '✖' : it.ok ? '✔' : '○'}</span>
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-ink-2">Loan and grant will be based on your income around <b className="text-ink">{formatYm(assessmentMonth(scenario, policy))}</b>. Set “Still studying / in NS” for each of you under <b className="text-ink">Us</b>.</p>
    </div>
  )
}

function DownpaymentPreview({ scenario: raw, policy }: { scenario: Scenario; policy: Policy }) {
  const scenario = normalizeScenario(raw)
  const sched = downpaymentSchedule(scenario, policy)
  const ltv = effectiveLtv(scenario, policy)
  const total = 1 - ltv
  const afl = Math.min(total, sched.afl.pct)
  const p = scenario.flat.price
  if (isCompleted(scenario)) {
    const minCash = sched.afl.minCashPct + sched.keys.minCashPct
    return (
      <div className="mt-2 rounded-lg bg-surface-2 p-2 text-sm">
        <div className="text-xs text-ink-2">At AFL + key collection</div>
        <div className="tnum font-medium">{pctStr(total)} · {money(total * p)}</div>
        {minCash > 0 && <div className="text-[11px] text-muted">≥ {pctStr(minCash)} cash</div>}
      </div>
    )
  }
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
      <div className="rounded-lg bg-surface-2 p-2">
        <div className="text-xs text-ink-2">At AFL</div>
        <div className="tnum font-medium">{pctStr(afl)} · {money(afl * p)}</div>
        {sched.afl.minCashPct > 0 && <div className="text-[11px] text-muted">≥ {pctStr(sched.afl.minCashPct)} cash</div>}
      </div>
      <div className="rounded-lg bg-surface-2 p-2">
        <div className="text-xs text-ink-2">At key collection</div>
        <div className="tnum font-medium">{pctStr(total - afl)} · {money((total - afl) * p)}</div>
        {sched.keys.minCashPct > 0 && <div className="text-[11px] text-muted">≥ {pctStr(sched.keys.minCashPct)} cash</div>}
      </div>
    </div>
  )
}

// ---------------- Costs ----------------

export function CostsEditor({ scenario, update, policy }: { scenario: Scenario; update: Update; policy: Policy }) {
  const loanGuess = scenario.flat.price * scenario.financing.ltv
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex items-center text-sm font-semibold">While waiting for the flat <InfoTip term="interim" /></div>
        <Segmented value={scenario.interim.mode} ariaLabel="Interim housing"
          onChange={(v) => update((d) => { d.interim.mode = v; if (v === 'rent' && !d.interim.monthlyCost) d.interim.monthlyCost = 2500 })}
          options={[{ value: 'parents', label: 'Live with parents' }, { value: 'rent', label: 'Rent' }]} />
        {scenario.interim.mode === 'rent' && (
          <div className="mt-3 max-w-xs">
            <Field label="Monthly rent (paid in cash until keys)">
              <MoneyInput value={scenario.interim.monthlyCost} onChange={(v) => update((d) => { d.interim.monthlyCost = v })} ariaLabel="Rent" />
            </Field>
          </div>
        )}
      </Card>
      <Card>
        <div className="mb-2 text-sm font-semibold">Assumptions</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Interest on cash" tip="cashInterest">
            <NumberInput suffix="% p.a." min={0} max={20} value={scenario.assumptions?.cashInterestPct ?? 0}
              onChange={(v) => update((d) => { d.assumptions = { cashInterestPct: v, inflationPct: d.assumptions?.inflationPct ?? 0 } })} ariaLabel="Cash interest" />
          </Field>
          <Field label="Cost inflation" tip="inflation">
            <NumberInput suffix="% p.a." min={0} max={20} value={scenario.assumptions?.inflationPct ?? 0}
              onChange={(v) => update((d) => { d.assumptions = { cashInterestPct: d.assumptions?.cashInterestPct ?? 0, inflationPct: v } })} ariaLabel="Inflation" />
          </Field>
        </div>
      </Card>
      <div className="space-y-3">
        {scenario.costs.filter((c) => c.kind !== 'inflow').map((c) => (
          <CostRow key={c.id} item={c} computed={autoAmount(c, scenario, policy, loanGuess)}
            onChange={(fn) => update((d) => fn(d.costs.find((x) => x.id === c.id)!))}
            onRemove={c.kind === 'optionFee' ? undefined : () => update((d) => { d.costs = d.costs.filter((x) => x.id !== c.id) })}
            partnerNames={[scenario.partners[0].name, scenario.partners[1].name]} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ['Wedding', 30000], ['Car', 20000], ['Travel', 5000], ['Other', 1000],
        ].map(([label, amt]) => (
          <Button key={label} variant="secondary" onClick={() => update((d) => {
            d.costs.push({ id: newId('c'), label: String(label), kind: 'custom', amount: Number(amt), auto: false, when: { date: d.startMonth }, funding: 'cashOnly', payer: 'joint', delayable: true })
          })}>+ {label}</Button>
        ))}
      </div>
      <Card>
        <div className="mb-1 flex items-center text-sm font-semibold">Money coming in<InfoTip term="inflow" /></div>
        <p className="mb-3 text-xs text-ink-2">One-off cash you expect: gifts from family, hongbao, selling a car, an insurance payout…</p>
        <div className="space-y-3">
          {scenario.costs.filter((c) => c.kind === 'inflow').map((c) => (
            <CostRow key={c.id} item={c} computed={c.amount} inflow
              onChange={(fn) => update((d) => fn(d.costs.find((x) => x.id === c.id)!))}
              onRemove={() => update((d) => { d.costs = d.costs.filter((x) => x.id !== c.id) })}
              partnerNames={[scenario.partners[0].name, scenario.partners[1].name]} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[['Gift from family', 10000], ['Hongbao', 20000], ['Sale of car / items', 15000], ['Other', 5000]].map(([label, amt]) => (
            <Button key={label} variant="secondary" onClick={() => update((d) => {
              d.costs.push({ id: newId('in'), label: String(label), kind: 'inflow', amount: Number(amt), auto: false, when: { date: d.startMonth }, funding: 'cashOnly', payer: 'joint' })
            })}>+ {label}</Button>
          ))}
        </div>
      </Card>
    </div>
  )
}

const KIND_TIP: Partial<Record<CostItem['kind'], Parameters<typeof InfoTip>[0]['term']>> = {
  optionFee: 'optionFee', bsd: 'BSD', legal: 'legal', hps: 'HPS', fire: 'fire', resaleLevy: 'resaleLevy', scc: 'scc', propertyTax: 'propertyTax',
}
/** Cost kinds whose amount the app can work out from the plan and policy. */
const AUTO_KINDS: CostItem['kind'][] = ['optionFee', 'bsd', 'legal', 'survey', 'caveat', 'fire', 'resaleLevy', 'scc', 'propertyTax']

function CostRow({ item, computed, onChange, onRemove, partnerNames, inflow = false }: {
  item: CostItem; computed: number; onChange: (fn: (c: CostItem) => void) => void; onRemove?: () => void; partnerNames: [string, string]; inflow?: boolean
}) {
  const isAuto = item.auto !== false && AUTO_KINDS.includes(item.kind)
  const whenMode = 'date' in item.when ? 'date' : 'milestone'
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {item.kind === 'custom' || item.kind === 'reno' || item.kind === 'furniture' || item.kind === 'moving' || item.kind === 'inflow'
            ? <TextInput value={item.label} onChange={(v) => onChange((d) => { d.label = v })} ariaLabel="Item name" />
            : <div className="flex items-center text-sm font-medium">{item.label}{KIND_TIP[item.kind] && <InfoTip term={KIND_TIP[item.kind]} />}</div>}
        </div>
        {onRemove && <Button variant="ghost" ariaLabel={`Remove ${item.label}`} onClick={onRemove}>✕</Button>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-[1.2fr_1.8fr_1fr_1fr]">
        <Field label={isAuto ? 'Amount (auto)' : 'Amount'}>
          {isAuto ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm tnum">{money(computed)}</div>
              <Button variant="ghost" className="!px-2 text-xs" onClick={() => onChange((d) => { d.auto = false; d.amount = Math.round(computed * 100) / 100 })}>Edit</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1"><NumberInput prefix={inflow ? '+$' : '$'} min={inflow ? 0 : undefined} value={item.amount} onChange={(v) => onChange((d) => { d.amount = v })} ariaLabel={`${item.label} amount`} /></div>
              {AUTO_KINDS.includes(item.kind) && (
                <Button variant="ghost" className="!px-2 text-xs" onClick={() => onChange((d) => { d.auto = true })}>Auto</Button>
              )}
            </div>
          )}
        </Field>
        <div className="col-span-2 md:col-span-1"><Field label="When">
          <div className="flex flex-wrap gap-1">
            <div className="min-w-[10rem] flex-1">
              <Select
                value={whenMode === 'date' ? 'date' : (item.when as { milestone: Milestone }).milestone}
                onChange={(v) => onChange((d) => { d.when = v === 'date' ? { date: 'date' in d.when ? d.when.date : '2027-01' } : { milestone: v as Milestone, offsetMonths: 'offsetMonths' in d.when ? d.when.offsetMonths : 0 } })}
                options={[...MILESTONES, { value: 'date' as const, label: 'Specific month' }] as { value: string; label: string }[]}
                ariaLabel="When"
              />
            </div>
            {whenMode === 'date'
              ? <div className="min-w-[10rem] flex-1"><MonthInput value={(item.when as { date: string }).date} onChange={(v) => onChange((d) => { d.when = { date: v } })} ariaLabel="Month" /></div>
 
              : <div className="w-24 shrink-0"><NumberInput suffix="mths" min={-60} max={120} value={(item.when as Extract<When, { milestone: Milestone }>).offsetMonths ?? 0} onChange={(v) => onChange((d) => { if ('milestone' in d.when) d.when.offsetMonths = v })} ariaLabel="Months after" /></div>}
          </div>
        </Field></div>
        {!inflow && (
          <Field label="Pay with">
            <Select value={item.funding} onChange={(v) => onChange((d) => { d.funding = v })} ariaLabel="Funding"
              options={[{ value: 'cashOnly', label: 'Cash only' }, { value: 'cpfAllowed', label: 'CPF allowed' }]} />
          </Field>
        )}
        <Field label={inflow ? 'Goes to' : 'Paid by'}>
          <Select value={item.payer} onChange={(v) => onChange((d) => { d.payer = v })} ariaLabel="Payer"
            options={[{ value: 'joint', label: 'Both' }, { value: 'A', label: partnerNames[0] }, { value: 'B', label: partnerNames[1] }]} />
        </Field>
      </div>
      {item.recurrence && (
        <p className="mt-2 text-[11px] text-muted">Repeats every {item.recurrence.everyMonths} months.</p>
      )}
    </Card>
  )
}

function pctStr(x: number) {
  return `${Math.round(x * 1000) / 10}%`
}

