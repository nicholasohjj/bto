import { Component, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { runScenario } from './engine'
import { resolvePolicy } from './engine/policyOverrides'
import { scenarioProblem } from './engine/validate'
import type { Scenario, SimResult } from './engine/types'
import { money } from './engine/format'
import { newId } from './state/defaults'
import { exportJson, importJson, loadState, saveState, type AppState } from './state/storage'
import { decodeScenario, sharedCode, shareUrl } from './state/share'
import { AdvancedSettings } from './ui/AdvancedSettings'
import { TimelineChart } from './ui/lazyCharts'
import { Button, Card, Segmented, Toggle } from './ui/controls'
import { Disclaimer } from './ui/Disclaimer'
import { CostsEditor, FinancingEditor, FlatEditor, PartnersEditor, type Update } from './ui/editors'
import { AccruedView, AffordCard, CompareView, JobLossCard, LoanPanel, ScheduleTable, SummaryCards, WarningsList } from './ui/views'
import { PrintSummary } from './ui/PrintSummary'
import { Wizard } from './ui/Wizard'

type Tab = 'overview' | 'schedule' | 'cpf' | 'edit' | 'compare' | 'advanced'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedule', label: 'Payments' },
  { id: 'cpf', label: 'CPF interest' },
  { id: 'edit', label: 'Edit plan' },
  { id: 'compare', label: 'Compare' },
  { id: 'advanced', label: 'Advanced settings' },
]
type EditSection = 'us' | 'flat' | 'financing' | 'costs'

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [tab, setTab] = useState<Tab>('overview')
  const [editSection, setEditSection] = useState<EditSection>('us')
  const [wizardOpen, setWizardOpen] = useState(!state.wizardDone)
  const [renaming, setRenaming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const theme = useTheme()

  useEffect(() => saveState(state), [state])

  // Opening a share link (#s=…) adds that plan, or switches to it if it's already here.
  useEffect(() => {
    const open = async () => {
      const code = sharedCode(location.hash)
      if (!code) return
      // Clear the hash first so a reload (or StrictMode's second run) doesn't add it again.
      history.replaceState(null, '', location.pathname + location.search)
      try {
        const shared = await decodeScenario(code)
        setState((st) => {
          const same = st.scenarios.find((s) => sameContent(s, shared))
          if (same) return { ...st, activeId: same.id, wizardDone: true }
          const [added] = importJson(JSON.stringify(shared), st.scenarios)
          return { ...st, scenarios: [...st.scenarios, added], activeId: added.id, wizardDone: true }
        })
        setWizardOpen(false)
        setTab('overview')
        setMessage(`Opened “${shared.name}” from a shared link.`)
      } catch (e) {
        setMessage(`Couldn’t open the shared link: ${(e as Error).message}`)
      }
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [])
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(t)
  }, [message])

  const active = state.scenarios.find((s) => s.id === state.activeId) ?? state.scenarios[0]
  const policy = useMemo(() => resolvePolicy(active.policyOverrides), [active.policyOverrides])

  // Results for every scenario, keyed by id. Deferred so typing stays responsive; each
  // scenario object is cached, so editing one scenario only re-runs that one.
  const deferredScenarios = useDeferredValue(state.scenarios)
  const results = useMemo(() => {
    const map = new Map<string, SimResult>()
    for (const s of deferredScenarios) {
      const r = cachedRun(s)
      if (r) map.set(s.id, r)
    }
    return map
  }, [deferredScenarios])
  const result = results.get(active.id)

  // The plan as it was before the last edit, so a crash can be undone.
  const beforeEdit = useRef<Scenario | null>(null)
  const update: Update = (fn) =>
    setState((st) => ({
      ...st,
      scenarios: st.scenarios.map((s) => {
        if (s.id !== st.activeId) return s
        beforeEdit.current = s
        const d = structuredClone(s)
        fn(d)
        return d
      }),
    }))
  const undoLastEdit = () => {
    const prev = beforeEdit.current
    if (!prev) return
    beforeEdit.current = null
    setState((st) => ({ ...st, scenarios: st.scenarios.map((s) => (s.id === prev.id ? prev : s)) }))
  }

  const addScenario = (s: Scenario) =>
    setState((st) => ({ ...st, scenarios: [...st.scenarios, s], activeId: s.id, wizardDone: true, compareIds: [...st.compareIds, s.id].slice(-3) }))

  const duplicate = () => {
    const copy: Scenario = { ...structuredClone(active), id: newId('sc'), name: `${active.name} (copy)` }
    addScenario(copy)
    setMessage('Duplicated — change something, then use Compare.')
    setTab('edit')
  }
  const remove = () => {
    if (state.scenarios.length <= 1) return
    const rest = state.scenarios.filter((s) => s.id !== active.id)
    setState((st) => ({ ...st, scenarios: rest, activeId: rest[0].id, compareIds: st.compareIds.filter((id) => id !== active.id) }))
    setMessage(`Deleted “${active.name}”.`)
  }
  const download = (all: boolean) => {
    const list = all ? state.scenarios : [active]
    const blob = new Blob([exportJson(list)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = all ? 'bto-scenarios.json' : `bto-${slug(active.name)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const onImport = async (file: File) => {
    try {
      const imported = importJson(await file.text(), state.scenarios)
      setState((st) => ({ ...st, scenarios: [...st.scenarios, ...imported], activeId: imported[0].id, wizardDone: true }))
      setMessage(`Imported ${imported.length} scenario${imported.length > 1 ? 's' : ''}.`)
    } catch (e) {
      setMessage(`Couldn’t import: ${(e as Error).message}`)
    }
  }
  const share = async () => {
    try {
      const url = await shareUrl(active, location.origin + location.pathname)
      if (navigator.share) {
        try {
          await navigator.share({ title: active.name, url })
          return
        } catch (e) {
          if ((e as Error).name === 'AbortError') return
          // Share sheet failed: fall back to copying.
        }
      }
      await navigator.clipboard.writeText(url)
      setMessage('Link copied. It contains this plan’s numbers (salaries, savings), so share it only with your partner.')
    } catch {
      setMessage('Couldn’t create or copy the link. Use Export (JSON) instead.')
    }
  }
  const toggleCompare = (id: string) =>
    setState((st) => ({
      ...st,
      compareIds: st.compareIds.includes(id) ? st.compareIds.filter((x) => x !== id) : [...st.compareIds, id].slice(0, 3),
    }))

  if (wizardOpen) {
    return (
      <Wizard
        firstRun={!state.wizardDone}
        canSkip
        onSkip={() => { setWizardOpen(false); setState((st) => ({ ...st, wizardDone: true })) }}
        onFinish={(s) => { addScenario(s); setWizardOpen(false); setTab('overview') }}
      />
    )
  }

  const names: [string, string] = [active.partners[0].name, active.partners[1].name]
  const errorCount = result?.warnings.filter((w) => w.severity === 'error').length ?? 0

  return (
    <>
    {result && <PrintSummary scenario={active} result={result} />}
    <div className="min-h-screen bg-page print:hidden">
      <header className="sticky top-0 z-30 border-b border-line bg-page/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
          <div className="mr-auto flex min-w-0 flex-1 items-center gap-2">
            <span className="hidden text-sm font-semibold sm:inline">BTO Money Timeline</span>
            {renaming ? (
              <RenameInput
                name={active.name}
                onSave={(name) => { update((d) => { d.name = name }); setRenaming(false) }}
                onCancel={() => setRenaming(false)}
              />
            ) : (
              <>
                <select
                  aria-label="Scenario"
                  className="w-full min-w-0 truncate rounded-lg border border-line bg-surface px-2 py-1.5 text-sm sm:w-auto sm:max-w-xs"
                  value={active.id}
                  onChange={(e) => setState((st) => ({ ...st, activeId: e.target.value }))}
                >
                  {state.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="button" onClick={() => setRenaming(true)} aria-label="Rename this plan" title="Rename"
                  className="shrink-0 rounded-lg p-2 text-ink-2 hover:bg-surface-2 hover:text-ink">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </>
            )}
          </div>
          <ScenarioMenu
            onRename={() => setRenaming(true)}
            onDuplicate={duplicate}
            onNew={() => setWizardOpen(true)}
            onDelete={state.scenarios.length > 1 ? remove : undefined}
            onExport={download}
            onImport={() => fileRef.current?.click()}
            onShare={share}
            onPrint={result ? () => window.print() : undefined}
            theme={theme.value}
            onTheme={theme.set}
          />
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
        </div>
        <nav className="relative mx-auto max-w-6xl" aria-label="Sections">
          <div className="flex gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => (
              <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined}
                onClick={(e) => { setTab(t.id); e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }) }}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.id ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}>
                {t.label}
                {t.id === 'overview' && errorCount > 0 && <span className="ml-1.5 rounded-full bg-critical px-1.5 text-[10px] font-semibold text-white">{errorCount}</span>}
              </button>
            ))}
          </div>
          {/* Fade hints that more tabs scroll into view on narrow screens */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-page to-transparent md:hidden" />
        </nav>
      </header>

      {message && (
        <div role="status" className="fixed inset-x-0 bottom-4 z-40 mx-auto w-fit max-w-[90vw] rounded-lg bg-ink px-4 py-2 text-sm text-page shadow-lg">{message}</div>
      )}

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <ErrorBoundary key={`${active.id}-${tab}`} onUndo={undoLastEdit}>
        {!result && (
          <Card>
            <p className="text-sm text-critical">This plan can’t be simulated. {scenarioProblem(active) ?? 'Check the dates (key collection must be after today).'}</p>
            {tab !== 'edit' && <Button variant="secondary" className="mt-2 text-xs" onClick={() => setTab('edit')}>Edit plan</Button>}
          </Card>
        )}

        {result && tab === 'overview' && (
          <>
            <SummaryCards result={result} />
            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <Card>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Cash and CPF OA over time</h2>
                  {active.buyers !== 'single' && (
                    <div className="w-44"><Toggle label="Each person" checked={state.showPerPartner} onChange={(v) => setState((st) => ({ ...st, showPerPartner: v }))} /></div>
                  )}
                </div>
                <TimelineChart result={result} perPartner={state.showPerPartner && active.buyers !== 'single'} names={names} />
                <p className="mt-1 text-[11px] text-muted">Solid vertical lines mark milestones; dotted lines mark other payments over $1,000. Red shading = cash below zero. Tap the chart for details.</p>
              </Card>
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">What to watch</h2>
                <WarningsList warnings={result.warnings} />
              </div>
            </div>
            <LoanPanel result={result} scenario={active} />
            <AffordCard scenario={active} onTry={(price) => {
              addScenario({ ...structuredClone(active), id: newId('sc'), name: `${active.name} — at ${money(price)}`, flat: { ...structuredClone(active.flat), price } })
              setMessage('Added. Use Compare to see it next to your plan.')
            }} />
            <JobLossCard scenario={active} onAddScenario={(s) => {
              const gap = s.partners.flatMap((p) => p.incomeChanges ?? []).find((c) => c.id.startsWith('whatif-gap'))
              const who = gap ? s.partners.find((p) => p.incomeChanges?.includes(gap))?.name : ''
              addScenario({ ...structuredClone(s), id: newId('sc'), name: `${active.name} — ${who} loses job` })
              setMessage('Added. Use Compare to see it next to your plan.')
            }} />
          </>
        )}

        {result && tab === 'schedule' && <ScheduleTable result={result} />}
        {result && tab === 'cpf' && <AccruedView result={result} names={names} single={active.buyers === 'single'} />}

        {tab === 'edit' && (
          <div className="space-y-4">
            <Segmented value={editSection} onChange={setEditSection} ariaLabel="Edit section"
              options={[{ value: 'us', label: 'Us' }, { value: 'flat', label: 'Flat' }, { value: 'financing', label: 'Loan' }, { value: 'costs', label: 'Costs' }]} />
            {editSection === 'us' && <PartnersEditor scenario={active} update={update} policy={policy} />}
            {editSection === 'flat' && <FlatEditor scenario={active} update={update} policy={policy} />}
            {editSection === 'financing' && <FinancingEditor scenario={active} update={update} policy={policy} />}
            {editSection === 'costs' && <CostsEditor scenario={active} update={update} policy={policy} />}
            {result && <MiniStatus result={result} onOpen={() => setTab('overview')} />}
          </div>
        )}

        {tab === 'compare' && <CompareView scenarios={state.scenarios} results={results} compareIds={state.compareIds} onToggle={toggleCompare} />}
        {tab === 'advanced' && <AdvancedSettings scenario={active} update={update} />}
        </ErrorBoundary>

        <footer className="pt-4 pb-8"><Disclaimer compact /></footer>
      </main>
    </div>
    </>
  )
}

/** Inline name editor: Enter or tapping away saves, Escape cancels, empty names are ignored. */
function RenameInput({ name, onSave, onCancel }: { name: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(name)
  const save = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== name) onSave(trimmed)
    else onCancel()
  }
  return (
    <form className="flex w-full min-w-0 items-center gap-1 sm:w-80" onSubmit={(e) => { e.preventDefault(); save() }}>
      <input
        autoFocus
        aria-label="Plan name"
        value={draft}
        maxLength={80}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
        className="w-full min-w-0 rounded-lg border border-accent bg-surface px-2 py-1.5 text-sm outline-none ring-2 ring-accent/30"
      />
      <button type="submit" onMouseDown={(e) => e.preventDefault()} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">Save</button>
    </form>
  )
}

/** Sticky summary while editing so you see the effect of each change. */
function MiniStatus({ result, onOpen }: { result: SimResult; onOpen: () => void }) {
  const errors = result.warnings.filter((w) => w.severity === 'error')
  return (
    <div className="sticky bottom-3 z-20">
      <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm shadow-lg">
        <span className="min-w-0">{errors.length ? <span className="text-critical">✖ {errors.length} problem{errors.length > 1 ? 's' : ''}: {errors[0].title}</span> : <span className="text-good-ink">✔ No shortfalls</span>}</span>
        <span className="tnum shrink-0 text-ink-2">Leanest cash {money(result.summary.leanestCash.amount)}</span>
      </button>
    </div>
  )
}

function ScenarioMenu(props: {
  onRename: () => void; onDuplicate: () => void; onNew: () => void; onDelete?: () => void
  onExport: (all: boolean) => void; onImport: () => void; onShare: () => void; onPrint?: () => void; theme: ThemePref; onTheme: (t: ThemePref) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const item = (label: string, fn?: () => void, danger = false) => (
    <button type="button" disabled={!fn} onClick={() => { fn?.(); setOpen(false) }}
      className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-40 ${danger ? 'text-critical' : ''}`}>{label}</button>
  )
  return (
    <div className="flex items-center gap-1">
      <span className="hidden sm:block"><Button variant="secondary" onClick={props.onDuplicate}>Duplicate</Button></span>
      <div ref={ref} className="relative">
        <Button variant="secondary" onClick={() => setOpen((o) => !o)} ariaLabel="More actions">⋯</Button>
        {open && (
          <div className="absolute right-0 top-11 z-50 w-60 rounded-xl border border-line bg-surface p-1 shadow-xl">
            {item('Rename', props.onRename)}
            {item('Duplicate', props.onDuplicate)}
            {item('New plan (setup wizard)', props.onNew)}
            <div className="my-1 border-t border-line" />
            {item('Share link to this scenario', props.onShare)}
            {item('Print summary (or PDF)', props.onPrint)}
            <div className="my-1 border-t border-line" />
            {item('Export this scenario (JSON)', () => props.onExport(false))}
            {item('Export all scenarios (JSON)', () => props.onExport(true))}
            {item('Import from JSON…', props.onImport)}
            <div className="my-1 border-t border-line" />
            <div className="px-3 py-1 text-[11px] text-muted">Theme</div>
            <div className="px-2 pb-1">
              <Segmented value={props.theme} onChange={props.onTheme} ariaLabel="Theme"
                options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
            </div>
            <div className="my-1 border-t border-line" />
            {item('Delete this scenario', props.onDelete, true)}
          </div>
        )}
      </div>
    </div>
  )
}

const resultCache = new WeakMap<Scenario, SimResult | null>()
function cachedRun(s: Scenario): SimResult | null {
  if (!resultCache.has(s)) {
    try {
      resultCache.set(s, runScenario(s))
    } catch (e) {
      console.error('Simulation failed for', s.name, e)
      resultCache.set(s, null)
    }
  }
  return resultCache.get(s) ?? null
}

type ThemePref = 'system' | 'light' | 'dark'
function useTheme() {
  const [value, setValue] = useState<ThemePref>(() => {
    try { return (localStorage.getItem('bto-theme') as ThemePref) || 'system' } catch { return 'system' }
  })
  useEffect(() => {
    const root = document.documentElement
    if (value === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', value)
    try { localStorage.setItem('bto-theme', value) } catch { /* ignore */ }
  }, [value])
  return { value, set: setValue }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'scenario'
}

/** Same plan apart from its id (so opening a link twice doesn't add a copy). */
function sameContent(a: Scenario, b: Scenario): boolean {
  return JSON.stringify({ ...a, id: '' }) === JSON.stringify({ ...b, id: '' })
}

/** Keeps one broken view from blanking the whole app. Resets when the plan or tab changes. */
class ErrorBoundary extends Component<{ children: ReactNode; onUndo: () => void }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('View crashed:', error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <Card>
        <p className="text-sm text-critical">Something in this plan broke this page: {this.state.error.message}</p>
        <p className="mt-1 text-sm text-ink-2">Your other plans are fine. Undo the last change, or switch to another tab or plan.</p>
        <Button variant="secondary" className="mt-2 text-xs" onClick={() => { this.props.onUndo(); this.setState({ error: null }) }}>Undo last change</Button>
      </Card>
    )
  }
}
