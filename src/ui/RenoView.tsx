import type { CostItem, Scenario } from '../engine/types'
import { money } from '../engine/format'
import { newId } from '../state/defaults'
import { mergeRenoStages, splitRenoIntoStages, spreadTotal } from '../state/reno'
import { brochureLayouts, readStudioSummary, studioUrl, SURROUNDINGS, surroundingsUrl, type StudioSummary } from '../state/studio'
import { readChosenUnit, surroundingsUnitUrl, unitLabel, unitLayout, CHOSEN_UNIT_KEY } from '../state/unit'
import { Button, Card, MoneyInput, NumberInput } from './controls'
import { useStored } from './useStored'
import type { Update } from './editors'

type Kind = 'reno' | 'furniture'
const LABEL: Record<Kind, string> = { reno: 'Renovation', furniture: 'Furniture & appliances' }

/** Renovation planning: the plan's renovation and furniture budget, and Flat Studio (/studio/) for the layout and costing. */
export function RenoView({ scenario, update, onEditCosts, onMessage }: {
  scenario: Scenario; update: Update; onEditCosts: () => void; onMessage: (m: string) => void
}) {
  const studio = useStudioSummary()
  const planned = (k: Kind) => scenario.costs.filter((c) => c.kind === k).reduce((t, c) => t + c.amount, 0)
  const budget = planned('reno') + planned('furniture')
  const studioTotal = studio ? studio.reno + studio.furniture : 0
  const layouts = brochureLayouts(scenario)
  const chosen = useStored(CHOSEN_UNIT_KEY, readChosenUnit)
  // The unit picked in Surroundings, if it's in this plan's project: Flat Studio opens on its layout.
  const mine = chosen && chosen.site === scenario.flat.project?.id ? chosen : null
  const myLayout = mine ? unitLayout(mine)?.key : undefined

  const use = (k: Kind, amount: number) => {
    update((d) => {
      const items = d.costs.filter((c) => c.kind === k)
      if (items.length) {
        // Keep each item's share, so staged payments stay staged.
        spreadTotal(items, amount)
      } else {
        const item: CostItem = { id: newId('cost'), label: LABEL[k], kind: k, amount, auto: false, when: { milestone: 'keys', offsetMonths: k === 'reno' ? 1 : 2 }, funding: 'cashOnly', payer: 'joint', delayable: true }
        d.costs.push(item)
      }
    })
    onMessage(`${LABEL[k]} set to ${money(amount)} from Flat Studio.`)
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-base font-semibold">Plan your renovation</h2>
        <p className="mt-1 text-sm text-ink-2">
          Draw your layout in Flat Studio, place furniture, see it in 3D and price it from your own quotes.
          Then bring the total back here so your money plan uses it. Renovation and furniture are paid in cash, not CPF.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={studioUrl(scenario, myLayout)} className="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">
            Open Flat Studio
          </a>
          <Button variant="secondary" onClick={onEditCosts}>Edit costs</Button>
        </div>
        {layouts.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-ink-2">Start from your unit’s layout, redrawn from HDB’s brochure:</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {layouts.map((l) => (
                <a key={l.key} href={studioUrl(scenario, l.key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${(myLayout ? l.key === myLayout : l.type === scenario.flat.type) ? 'border-accent font-medium text-ink' : 'border-line text-ink-2 hover:text-ink'}`}>
                  {l.label}{l.key === myLayout && ' · your unit'}
                </a>
              ))}
            </div>
            {mine ? (
              <p className="mt-1.5 text-xs text-ink-2">Your unit: <b className="font-medium text-ink">{unitLabel(mine)}</b>{mine.facing && `, facing ${mine.facing}`}. <a className="text-accent underline" href={surroundingsUnitUrl(mine)}>See its view and sun, or pick another</a></p>
            ) : scenario.flat.project?.id && SURROUNDINGS.has(scenario.flat.project.id) && (
              <p className="mt-1.5 text-xs"><a className="text-accent underline" href={surroundingsUrl(scenario.flat.project.id)}>Picking a unit? See each unit’s view, sun and distance to roads</a></p>
            )}
            <p className="mt-1.5 text-[11px] text-muted">
              Redrawn from the brochure’s block plans, so it’s close but not exact. Your unit may be the mirror image. Check it against your unit’s plan before you get quotes.
              Opening one saves your current Flat Studio design as a version first.
            </p>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">
          Flat Studio opens with your plan’s renovation + furniture budget ({money(budget)}) as its budget cap.
          Designs are saved in this browser. Export (JSON) in the ⋯ menu includes your design, so keep a copy. Flat Studio works best on a computer.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold">In your money plan</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label={LABEL.reno} value={money(planned('reno'))} />
            <Row label={LABEL.furniture} value={money(planned('furniture'))} />
            <Row label="Total" value={money(budget)} strong />
          </dl>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold">From Flat Studio</h3>
          {!studio ? (
            <p className="mt-2 text-sm text-ink-2">Nothing yet. Open Flat Studio, enter prices in its Budget tab, then come back here.</p>
          ) : studioTotal === 0 ? (
            <p className="mt-2 text-sm text-ink-2">“{studio.name}” has no prices yet. Enter unit prices in Flat Studio’s Budget tab.</p>
          ) : (
            <>
              <dl className="mt-2 space-y-1 text-sm">
                <Row label="Renovation (finishes, built-ins, bathroom fittings, other)" value={money(studio.reno)} />
                <Row label="Furniture & appliances" value={money(studio.furniture)} />
                <Row label="Total" value={money(studioTotal)} strong />
              </dl>
              <p className={`mt-2 text-xs ${studioTotal > budget ? 'text-critical' : 'text-ink-2'}`}>
                {studioTotal > budget ? `${money(studioTotal - budget)} more than your plan allows.` : `${money(budget - studioTotal)} under your plan’s budget.`}
                {' '}From “{studio.name}”{studio.at ? `, saved ${new Date(studio.at).toLocaleString()}` : ''}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {studio.reno > 0 && studio.reno !== planned('reno') && <Button variant="secondary" className="text-xs" onClick={() => use('reno', studio.reno)}>Use {money(studio.reno)} for renovation</Button>}
                {studio.furniture > 0 && studio.furniture !== planned('furniture') && <Button variant="secondary" className="text-xs" onClick={() => use('furniture', studio.furniture)}>Use {money(studio.furniture)} for furniture</Button>}
              </div>
            </>
          )}
        </Card>
      </div>

      <RenoStages scenario={scenario} update={update} />

      <Card>
        <h3 className="text-sm font-semibold">Before you renovate</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Read HDB’s renovation guidelines for your flat. Some works need a permit, and structural walls can’t be hacked.</li>
          <li>Use a contractor on HDB’s Directory of Renovation Contractors (DRC) for works that need one.</li>
          {/* UNVERIFIED: from renovation guides quoting HDB's guidelines; not yet checked against hdb.gov.sg. */}
          <li>In a new flat, the bathroom floor and wall tiles can’t be hacked or replaced for the first 3 years after the block is completed. This protects the waterproofing. Ask your contractor what you can do instead.</li>
          <li>Full-height and three-quarter-height windows (W1 and W2 on brochure plans) can’t be replaced. Changing any other window needs HDB’s approval.</li>
          <li>Get quotes from more than one contractor and put their unit prices into Flat Studio’s Budget tab.</li>
          <li>Keep some cash aside after key collection for the mortgage and for renovation surprises.</li>
        </ul>
      </Card>
    </div>
  )
}

/** When renovation is paid: one payment, or stages (deposit, progress, final) at months after key collection. */
function RenoStages({ scenario, update }: { scenario: Scenario; update: Update }) {
  const reno = scenario.costs.filter((c) => c.kind === 'reno')
  const total = reno.reduce((t, c) => t + c.amount, 0)
  const set = (id: string, fn: (c: CostItem) => void) => update((d) => { const c = d.costs.find((x) => x.id === id); if (c) fn(c) })
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">When you pay for the renovation</h3>
        {reno.length > 1
          ? <Button variant="ghost" className="text-xs" onClick={() => update((d) => { d.costs = mergeRenoStages(d.costs) })}>Pay in one go</Button>
          : <Button variant="secondary" className="text-xs" onClick={() => update((d) => { d.costs = splitRenoIntoStages(d.costs) })}>Pay in stages</Button>}
      </div>
      <p className="mt-1 text-xs text-ink-2">
        {reno.length > 1
          ? 'Set each payment to match your contractor’s payment terms. They usually ask for a deposit when you sign, then progress payments, then the rest when the work is done.'
          : 'Contractors usually take a deposit, then progress payments, then the rest at the end. Splitting it shows how that spreads your cash.'}
      </p>
      {reno.length === 0 ? <p className="mt-2 text-sm text-ink-2">No renovation cost in this plan.</p> : (
        <div className="mt-3 space-y-2">
          {reno.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_8rem] items-center gap-2 sm:grid-cols-[1fr_9rem_9rem]">
              <span className="col-span-2 text-sm sm:col-span-1">{c.label}</span>
              <MoneyInput value={c.amount} onChange={(v) => set(c.id, (x) => { x.amount = v })} ariaLabel={`${c.label} amount`} />
              {'milestone' in c.when && c.when.milestone === 'keys'
                ? <NumberInput value={c.when.offsetMonths ?? 0} min={-12} max={36} suffix="mo" onChange={(v) => set(c.id, (x) => { x.when = { milestone: 'keys', offsetMonths: Math.round(v) } })} ariaLabel={`${c.label}: months after key collection`} />
                : <span className="text-xs text-muted">Set in Edit costs</span>}
            </div>
          ))}
          {reno.length > 1 && <p className="tnum text-right text-xs text-ink-2">Total {money(total)}</p>}
          <p className="text-[11px] text-muted">Months are counted from key collection (−1 = a month before). Your own costs rise with the inflation setting.</p>
        </div>
      )}
    </Card>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'border-t border-line pt-1 font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-ink-2'}>{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  )
}

/** Re-reads the studio's budget when you come back to this tab (e.g. after editing in Flat Studio). */
function useStudioSummary(): StudioSummary | null {
  return useStored('flatstudio.summary', readStudioSummary)
}
