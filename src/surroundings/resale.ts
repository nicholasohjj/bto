/**
 * Recent HDB resale prices near a site, from a snapshot (scripts/resale-snapshot.mjs): data.gov.sg's
 * resale transactions, each block placed with OneMap. Positions are in the site's metres (`at`), and `d`
 * is the distance to the nearest part of the site (its blocks, or the town-map outline).
 */
import type { Pt } from './analysis'

export interface Sale {
  /** Month of registration ("YYYY-MM"). */
  m: string
  /** Flat type: 1R, 2R, 3R, 4R, 5R, Exec, 3Gen. */
  t: string
  b: string
  s: string
  /** Storey range, e.g. "10–12". */
  f: string
  /** Floor area, m². */
  a: number
  /** Year the lease started. */
  l: number
  p: number
  at: Pt
  d: number
}
export interface ResaleFile { fetched: string; from: string; to: string; source: string; rows: Sale[] }

const FILES = import.meta.glob<ResaleFile>('./resale/*.json', { import: 'default' })
/** The snapshot for a site or area, if one has been taken. */
export function loadResale(id: string): Promise<ResaleFile> | null {
  const f = FILES[`./resale/${id}.json`]
  return f ? f() : null
}

export const TYPE_ORDER = ['1R', '2R', '3R', '4R', '5R', '3Gen', 'Exec']
export const TYPE_NAME: Record<string, string> = { '1R': '1-room', '2R': '2-room', '3R': '3-room', '4R': '4-room', '5R': '5-room', '3Gen': '3Gen', Exec: 'Executive' }

export interface TypeSummary { type: string; n: number; median: number; low: number; high: number; perM2: number; leaseFrom: number; leaseTo: number; latest: Sale[] }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2 }

/** Sales within `within` metres (by `distance`), summarised by flat type. */
export function summarise(rows: Sale[], distance: (s: Sale) => number, within = 1000): TypeSummary[] {
  const near = rows.filter((r) => distance(r) <= within)
  return TYPE_ORDER.map((type) => {
    const xs = near.filter((r) => r.t === type)
    if (!xs.length) return null
    const prices = xs.map((r) => r.p), leases = xs.map((r) => r.l)
    return {
      type, n: xs.length, median: median(prices), low: Math.min(...prices), high: Math.max(...prices),
      perM2: median(xs.map((r) => r.p / r.a)), leaseFrom: Math.min(...leases), leaseTo: Math.max(...leases),
      latest: [...xs].sort((x, y) => y.m.localeCompare(x.m) || y.p - x.p).slice(0, 5),
    }
  }).filter((x): x is TypeSummary => !!x)
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const k = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}m` : `$${Math.round(n / 1000)}k`
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ym = (m: string) => `${MON[+m.slice(5) - 1]} ${m.slice(0, 4)}`
const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())

/** The "Resale prices within 1 km" section. `from` says what distances are measured from. */
export function resaleHtml(file: ResaleFile | null, summary: TypeSummary[], from: string, highlight?: string): string {
  if (!file) return ''
  const rows = summary.map((x) => `<details class="rs"><summary><span><b>${TYPE_NAME[x.type] ?? x.type}</b>${x.type === highlight ? ' <span class="pill good">this flat type</span>' : ''} <small>${x.n} sale${x.n > 1 ? 's' : ''}</small></span><b>${k(x.median)}</b></summary>
      <div class="kv"><span>Range</span><b>${k(x.low)} – ${k(x.high)}</b></div>
      <div class="kv"><span>Per m² (median)</span><b>$${Math.round(x.perM2).toLocaleString()}</b></div>
      <div class="kv"><span>Lease started</span><b>${x.leaseFrom === x.leaseTo ? x.leaseFrom : `${x.leaseFrom}–${x.leaseTo}`}</b></div>
      <ul class="rs-list">${x.latest.map((s) => `<li><span>${ym(s.m)} · Blk ${esc(s.b)} ${esc(title(s.s))} · #${esc(s.f)} · ${s.a} m² · ${s.l}</span><b>${k(s.p)}</b></li>`).join('')}</ul></details>`).join('')
  return `<div class="sec"><h3>Resale prices within 1 km</h3>${rows || '<p class="note" style="margin:0">No resale sales within 1 km in this period.</p>'}
    <p class="note">Median price of HDB resale flats sold within 1 km of ${from}, ${ym(file.from)} to ${ym(file.to)}. Open a flat type for its latest sales. Older flats have shorter leases left, so they usually cost less than a new flat will fetch; compare flats of a similar age. Source: HDB resale prices on data.gov.sg (Singapore Open Data Licence); blocks placed with OpenStreetMap addresses (© OpenStreetMap contributors) and OneMap; snapshot of ${file.fetched}.</p></div>`
}
