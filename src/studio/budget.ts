/** Flat Studio budget: priced lines from the design's quantities and the user's own unit prices. */
import { FINS, FLOORS, type CatalogItem } from './catalog'
import { carpentryLines } from './carpentry'
import { rarea, type Design } from './model'

export type Catalog = Record<string, CatalogItem>

export interface BudgetLine {
  /** Price key in `S.prices` ('i:<type>', 'f:<floor>', 'w:<finish>', 'door', 'window', and carpentry/ceiling/electrical keys), or 'p:<item id>' for an item with its own price. */
  key: string
  name: string
  qty: number
  unit: string
  /** A price set on the item itself (overrides the unit price). */
  fixed?: number
  /** Which part of the money plan this goes to. */
  part: 'reno' | 'furniture'
}

/** Built-in carpentry and bathroom fittings: part of the renovation quote, not furniture. */
export const RENO_ITEMS = new Set(['ward', 'wardS', 'shoe', 'tvwall', 'cab', 'sink', 'hob', 'over', 'oventw', 'corner', 'island', 'pantry', 'wc', 'vanity', 'dvanity', 'shower', 'bathtub', 'heater'])

const pricedItem = (k: CatalogItem | undefined) => !!k && !k.svc && !k.missing && !k.carp

/** Extra quantity lines from other modules (carpentry runs, ceilings, electrical points). */
export type LineSource = (S: Design) => BudgetLine[]
const sources: LineSource[] = []
export function addBudgetLines(src: LineSource) { sources.push(src) }

export function budgetLines(S: Design, cat: Catalog): BudgetLine[] {
  const L: BudgetLine[] = [], cnt: Record<string, number> = {}
  S.items.forEach((i) => { if (i.pr > 0) return; cnt[i.type] = (cnt[i.type] || 0) + 1 })
  Object.keys(cnt).filter((t) => pricedItem(cat[t])).sort((a, b) => cat[a].n.localeCompare(cat[b].n))
    .forEach((t) => L.push({ key: 'i:' + t, name: cat[t].n, qty: cnt[t], unit: 'each', part: RENO_ITEMS.has(t) ? 'reno' : 'furniture' }))
  S.items.filter((i) => i.pr > 0 && (pricedItem(cat[i.type]) || cat[i.type]?.carp))
    .forEach((i) => L.push({ key: 'p:' + i.id, name: i.nm || cat[i.type].n, qty: 1, unit: 'each, your price', fixed: i.pr, part: RENO_ITEMS.has(i.type) || cat[i.type]?.carp ? 'reno' : 'furniture' }))
  L.push(...carpentryLines(S))
  const fa: Record<string, number> = {}
  S.rooms.forEach((r) => { fa[r.floor] = (fa[r.floor] || 0) + rarea(r) })
  Object.keys(fa).forEach((f) => L.push({ key: 'f:' + f, name: 'Floor: ' + (FLOORS as Record<string, { n: string }>)[f].n, qty: +fa[f].toFixed(2), unit: 'm²', part: 'reno' }))
  const d = S.openings.filter((o) => o.kind === 'door').length, w = S.openings.filter((o) => o.kind === 'window').length
  if (d) L.push({ key: 'door', name: 'Doors', qty: d, unit: 'each', part: 'reno' })
  if (w) L.push({ key: 'window', name: 'Windows', qty: w, unit: 'each', part: 'reno' })
  const wf: Record<string, number> = {}
  S.walls.forEach((x) => { const f = x.fin || 'paint'; if (f !== 'paint') wf[f] = (wf[f] || 0) + Math.hypot(x.x2 - x.x1, x.y2 - x.y1) * S.H })
  Object.keys(wf).forEach((f) => L.push({ key: 'w:' + f, name: 'Wall finish: ' + (FINS as Record<string, string>)[f] + ' (one face)', qty: +wf[f].toFixed(2), unit: 'm²', part: 'reno' }))
  for (const src of sources) L.push(...src(S))
  return L
}

export const lineCost = (S: Design, l: BudgetLine) => l.qty * (l.fixed ?? (S.prices[l.key] || 0))

export function budgetTotal(S: Design, cat: Catalog) {
  let t = 0
  for (const l of budgetLines(S, cat)) t += lineCost(S, l)
  for (const x of S.extras) t += +x.amt || 0
  return t
}

/** What the money plan reads (localStorage 'flatstudio.summary'). "Other costs" lines count as renovation. */
export function budgetSummary(S: Design, cat: Catalog) {
  let furniture = 0, reno = 0
  for (const l of budgetLines(S, cat)) { const v = lineCost(S, l); if (l.part === 'furniture') furniture += v; else reno += v }
  for (const x of S.extras) reno += +x.amt || 0
  return { name: S.name, furniture: Math.round(furniture), reno: Math.round(reno), cap: S.budget || 0, at: Date.now() }
}

export const money = (v: number) => '$' + (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function budgetText(S: Design, cat: Catalog) {
  const L = ['BUDGET']
  budgetLines(S, cat).forEach((l) => { const p = l.fixed ?? S.prices[l.key]; L.push(`  ${l.name}: ${l.qty} ${l.unit}` + (p ? ` x ${money(p)} = ${money(l.qty * p)}` : ' (no price)')) })
  S.extras.forEach((x) => L.push(`  ${x.name || 'Other'}: ${money(+x.amt || 0)}`))
  L.push(`  TOTAL ${money(budgetTotal(S, cat))}` + (S.budget ? `  (cap ${money(S.budget)})` : ''))
  return L.join('\n')
}
