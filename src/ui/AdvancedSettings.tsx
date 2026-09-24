import { DEFAULT_POLICY, POLICY_META, POLICY_VERSION_DATE, type PolicyMeta } from '../config/policy'
import { flattenPolicy } from '../engine/policyOverrides'
import type { Scenario } from '../engine/types'
import { Button, Card, NumberInput, PercentInput } from './controls'
import type { Update } from './editors'

const DEFAULTS = flattenPolicy(DEFAULT_POLICY)
const STATUS: Record<PolicyMeta['status'], { label: string; cls: string }> = {
  verified: { label: 'Verified', cls: 'text-good-ink' },
  secondary: { label: 'Secondary source', cls: 'text-ink-2' },
  unverified: { label: 'Not verified', cls: 'text-critical' },
}

export function AdvancedSettings({ scenario, update }: { scenario: Scenario; update: Update }) {
  const overrides = scenario.policyOverrides
  const count = Object.keys(overrides).length
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-ink-2">
          Official figures last checked on <b className="text-ink">{POLICY_VERSION_DATE}</b>. Changes here apply to <b className="text-ink">this scenario only</b>.
          Percentages are shown as %. {count > 0 && <>You have {count} override{count > 1 ? 's' : ''}.</>}
        </p>
        {count > 0 && (
          <Button className="mt-2" variant="secondary" onClick={() => update((d) => { d.policyOverrides = {} })}>Reset all to official figures</Button>
        )}
      </Card>
      {Object.entries(POLICY_META).map(([prefix, meta]) => {
        const paths = Object.keys(DEFAULTS).filter((p) => (p === prefix || p.startsWith(prefix + '.')) && Number.isFinite(DEFAULTS[p]))
        return (
          <Card key={prefix}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="text-sm font-semibold">{meta.label}</h3>
              <span className={`text-[11px] ${STATUS[meta.status].cls}`}>● {STATUS[meta.status].label} · {meta.source}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {paths.map((path) => {
                const isOverridden = path in overrides
                const value = isOverridden ? overrides[path] : DEFAULTS[path]
                const unit = unitFor(path, meta.unit)
                const set = (v: number) => update((d) => {
                  if (Math.abs(v - DEFAULTS[path]) < 1e-12) delete d.policyOverrides[path]
                  else d.policyOverrides[path] = v
                })
                return (
                  <label key={path} className="block min-w-0">
                    <span className="mb-1 flex min-h-[2lh] items-end justify-between gap-1 text-[11px] leading-tight text-ink-2">
                      <span className="line-clamp-2">{subLabel(prefix, path)}</span>
                      {isOverridden && (
                        <button type="button" className="shrink-0 text-accent" onClick={() => update((d) => { delete d.policyOverrides[path] })}>reset</button>
                      )}
                    </span>
                    <div className={isOverridden ? 'rounded-lg ring-2 ring-accent/40' : ''}>
                      {unit === 'pct'
                        ? <PercentInput value={value} onChange={set} max={100} ariaLabel={path} />
                        : <NumberInput value={value} onChange={set} prefix={unit === 'sgd' ? '$' : undefined} suffix={unit === 'years' ? 'yrs' : unit === 'months' ? 'mths' : undefined} ariaLabel={path} />}
                    </div>
                  </label>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function unitFor(path: string, group: PolicyMeta['unit']): PolicyMeta['unit'] {
  const leaf = path.split('.').pop()!
  if (leaf === 'width') return 'sgd'
  if (leaf === 'maxAgeYears') return 'years'
  if (leaf === 'upTo' || leaf === 'amount') return 'sgd'
  if (leaf === 'employeeFactor' || leaf === 'withdrawalLimitMultiple') return 'number'
  if (group === 'ratio') return 'pct'
  return group
}

const LEAF: Record<string, string> = {
  employer: 'employer', employee: 'employee', oaRatio: 'OA share', maxAgeYears: 'up to age',
  pct: 'of price', minCashPct: 'min cash', width: 'band size', rate: 'rate',
  upTo: 'income up to', amount: 'grant', nilUpTo: 'no CPF up to', employerOnlyUpTo: 'employer only up to',
  phaseInUpTo: 'phase-in up to', employeeFactor: 'employee factor (× rate)',
}

function subLabel(prefix: string, path: string): string {
  if (path === prefix) return 'Value'
  const rest = path.slice(prefix.length + 1).split('.')
  if (prefix === 'cpf.bands') {
    const band = DEFAULT_POLICY.cpf.bands[Number(rest[0])]
    const prev = Number(rest[0]) === 0 ? 0 : DEFAULT_POLICY.cpf.bands[Number(rest[0]) - 1].maxAgeYears
    const age = band.maxAgeYears >= 200 ? `>${prev}` : Number(rest[0]) === 0 ? `≤${band.maxAgeYears}` : `${prev}–${band.maxAgeYears}`
    return `Age ${age}: ${LEAF[rest[1]] ?? rest[1]}`
  }
  if (prefix === 'cpf.spr') {
    const year = rest[0] === 'year1' ? 1 : 2
    const table = DEFAULT_POLICY.cpf.spr[rest[0] as 'year1' | 'year2']
    const i = Number(rest[1])
    const prev = i === 0 ? 0 : table[i - 1].maxAgeYears
    const age = table[i].maxAgeYears >= 200 ? `>${prev}` : i === 0 ? `≤${table[i].maxAgeYears}` : `${prev}–${table[i].maxAgeYears}`
    return `Year ${year}, age ${age}: ${LEAF[rest[2]] ?? rest[2]}`
  }
  if (/^\d+$/.test(rest[0])) return `Tier ${Number(rest[0]) + 1}: ${LEAF[rest[1]] ?? rest[1]}`
  return rest.map((r) => LEAF[r] ?? (r === 'afl' ? 'AFL' : r === 'keys' ? 'Keys' : r)).join(' · ')
}
