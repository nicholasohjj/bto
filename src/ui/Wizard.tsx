import { useMemo, useState } from 'react'
import { resolvePolicy } from '../engine/policyOverrides'
import type { Scenario } from '../engine/types'
import { newScenario } from '../state/defaults'
import { Button, Card, Field, TextInput, T } from './controls'
import { CostsEditor, FinancingEditor, FlatEditor, PartnersEditor, type Update } from './editors'
import { Disclaimer } from './Disclaimer'

const STEPS = ['Welcome', 'About you', 'The flat', 'Financing', 'Other costs'] as const

export function Wizard({ onFinish, onSkip, canSkip, firstRun }: { onFinish: (s: Scenario) => void; onSkip: () => void; canSkip: boolean; firstRun: boolean }) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Scenario>(() => newScenario())
  const policy = useMemo(() => resolvePolicy(draft.policyOverrides), [draft.policyOverrides])
  const update: Update = (fn) => setDraft((s) => { const d = structuredClone(s); fn(d); return d })
  const last = step === STEPS.length - 1

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-base font-semibold sm:text-lg">BTO Money Timeline</h1>
        {canSkip && <Button variant="ghost" onClick={onSkip}>{firstRun ? 'Look at the example first' : 'Cancel'}</Button>}
      </div>
      <ol className="mb-5 flex gap-1" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <div className={`h-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-surface-2'}`} />
            <div className={`mt-1 hidden text-[11px] sm:block ${i === step ? 'text-ink' : 'text-muted'}`}>{s}</div>
          </li>
        ))}
      </ol>
      <p className="-mt-3 mb-4 text-xs text-ink-2 sm:hidden">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>

      {step === 0 && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-base font-semibold">See whether you’ll have enough, month by month</h2>
            <p className="mt-2 text-sm text-ink-2">
              Buying a new HDB flat — <T term="BTO">BTO</T>, SBF or open booking — means paying from two separate pots: <T term="cash">cash</T> and your <T term="OA">CPF OA</T>.
              Some things (option fee, renovation, furniture) can only be paid in cash. This app plays out both pots for both of you,
              from today until a year after key collection, and flags any month where a payment can’t be covered.
            </p>
            <p className="mt-2 text-sm text-ink-2">Setup takes about 5 minutes. You can change everything later.</p>
            <div className="mt-4 max-w-sm">
              <Field label="Name this plan"><TextInput value={draft.name} onChange={(v) => update((d) => { d.name = v })} ariaLabel="Plan name" /></Field>
            </div>
          </Card>
          <Disclaimer />
        </div>
      )}
      {step === 1 && <PartnersEditor scenario={draft} update={update} policy={policy} />}
      {step === 2 && <FlatEditor scenario={draft} update={update} policy={policy} />}
      {step === 3 && <FinancingEditor scenario={draft} update={update} policy={policy} />}
      {step === 4 && <CostsEditor scenario={draft} update={update} policy={policy} />}

      <div className="sticky bottom-0 -mx-4 mt-6 flex justify-between gap-2 border-t border-line bg-page/95 px-4 py-3 backdrop-blur">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
        {last
          ? <Button variant="primary" onClick={() => onFinish(draft)}>See our timeline</Button>
          : <Button variant="primary" onClick={() => setStep((s) => s + 1)}>{step === 0 ? 'Start' : 'Next'}</Button>}
      </div>
    </div>
  )
}
