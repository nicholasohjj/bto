import type { Scenario } from '../engine/types'
import { newId, seedDiaScenario, seedScenario } from './defaults'

const KEY = 'bto-money-timeline:v1'

export interface AppState {
  scenarios: Scenario[]
  activeId: string
  compareIds: string[]
  wizardDone: boolean
  showPerPartner: boolean
}

export function initialState(): AppState {
  const seed = seedScenario()
  const bank = bankVariant(seed)
  return { scenarios: [seed, bank, seedDiaScenario()], activeId: seed.id, compareIds: [seed.id, bank.id], wizardDone: false, showPerPartner: false }
}

/** Second seeded scenario so comparison has something to show. */
function bankVariant(seed: Scenario): Scenario {
  return {
    ...structuredClone(seed),
    id: 'seed-bank',
    name: 'Example: same flat, bank loan',
    financing: {
      ...seed.financing, loanType: 'bank', rate: 0.022, tenureYears: 25, cpfUsagePct: 100,
      // Fixed 2.2% for 3 years, then floating.
      loanChanges: [
        { id: 'float-1', kind: 'rate', from: '2033-10', rate: 0.03 },
        { id: 'float-2', kind: 'rate', from: '2035-10', rate: 0.028 },
      ],
    },
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initialState()
    const parsed = JSON.parse(raw) as AppState
    if (!Array.isArray(parsed.scenarios) || parsed.scenarios.length === 0) return initialState()
    const valid = parsed.scenarios.filter(isScenario)
    if (!valid.length) return initialState()
    const activeId = valid.some((s) => s.id === parsed.activeId) ? parsed.activeId : valid[0].id
    return { ...initialState(), ...parsed, scenarios: valid, activeId, compareIds: (parsed.compareIds ?? []).filter((id) => valid.some((s) => s.id === id)) }
  } catch {
    return initialState()
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked (private mode) — the app still works for this session.
  }
}

// ---------- JSON export / import ----------

export interface ExportFile {
  app: 'bto-money-timeline'
  schemaVersion: 1
  exportedAt: string
  scenarios: Scenario[]
}

export function exportJson(scenarios: Scenario[]): string {
  const file: ExportFile = { app: 'bto-money-timeline', schemaVersion: 1, exportedAt: new Date().toISOString(), scenarios }
  return JSON.stringify(file, null, 2)
}

/** Parse an export file (or a bare scenario / array). Clashing ids get fresh ones. */
export function importJson(text: string, existing: Scenario[]): Scenario[] {
  const data = JSON.parse(text)
  const list: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.scenarios) ? data.scenarios : [data]
  const scenarios = list.filter(isScenario)
  if (!scenarios.length) throw new Error('No scenarios found in this file.')
  const taken = new Set(existing.map((s) => s.id))
  return scenarios.map((s) => {
    const copy = structuredClone(s)
    if (taken.has(copy.id)) copy.id = newId('sc')
    taken.add(copy.id)
    copy.policyOverrides ??= {}
    return copy
  })
}

export function isScenario(x: unknown): x is Scenario {
  const s = x as Scenario
  return !!s && typeof s === 'object' && s.schemaVersion === 1 && typeof s.id === 'string' &&
    Array.isArray(s.partners) && s.partners.length === 2 && !!s.flat?.dates && !!s.financing && Array.isArray(s.costs)
}
