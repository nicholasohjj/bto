/**
 * Compare renovation quotes: paste each contractor's quote as text; lines are read, sorted into
 * categories and compared side by side, with each category's rate against this design's quantities
 * (for example $ per foot run of carpentry).
 */
import { carpentryLines, FT } from './carpentry'
import { ceilingQty } from './ceiling'
import { electricalCounts } from './electrical'
import { rarea, rpts, type Design } from './model'

export interface QuoteLine { d: string; amt: number; cat: string }
export interface Quote { id: string; name: string; lines: QuoteLine[] }

export const CATS: [string, string, RegExp][] = [
  ['hack', 'Hacking & disposal', /hack|demoli|dismantl|remov|dispos|debris/i],
  ['carp', 'Carpentry', /carpent|wardrobe|cabinet|shoe\s*(rack|cab)|tv\s*(console|feature)|vanity|laminate|ft\s*run|f\.?r\.?\b|bookshel|study\s*table|platform|bay\s*window\s*seat|feature\s*wall/i],
  ['floor', 'Flooring', /floor|vinyl|parquet|laminate\s*floor|tiling|tiles?\b|homogeneous|marble|skirting|screed/i],
  ['ceil', 'False ceiling', /ceiling|cove|l-?box|box[\s-]*up|plaster\s*board|gypsum/i],
  ['elec', 'Electrical', /electric|power\s*point|socket|lighting\s*point|light\s*point|switch|downlight|wiring|db\s*box|13\s*a|15\s*a|data\s*point|tv\s*point/i],
  ['plumb', 'Plumbing & sanitary', /plumb|pipe|tap|sink|basin|toilet|w\.?c\b|water\s*heater|shower|bathtub|mixer|trap/i],
  ['wet', 'Masonry & waterproofing', /waterproof|masonry|plaster(?!\s*board)|cement|brick|wall\s*(build|construct)|kerb/i],
  ['paint', 'Painting', /paint/i],
  ['doors', 'Doors, windows & gates', /door|window|grille|gate|glass\s*panel|shower\s*screen/i],
  ['aircon', 'Aircon', /air[\s-]*con|trunking|compressor|fan\s*coil/i],
  ['misc', 'Cleaning, protection & haulage', /clean|haul|protect|transport|lorry|permit|insurance|admin/i],
  ['gst', 'GST', /\bgst\b/i],
]
const OTHER = 'other'
export const catName = (c: string) => CATS.find((x) => x[0] === c)?.[1] ?? 'Other'
export const categorize = (d: string) => CATS.find(([, , re]) => re.test(d))?.[0] ?? OTHER

/**
 * Read a quote pasted as text: one item per line, the last amount on the line is its price.
 * Total and subtotal lines are skipped so they don't count twice.
 */
export function parseQuote(text: string): QuoteLine[] {
  const out: QuoteLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, ' ').trim()
    if (!line || /^(grand\s*)?(sub\s*-?\s*)?total\b|^amount\s*due|^balance/i.test(line)) continue
    const nums = [...line.matchAll(/(?:S?\$\s*)?(-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)(?!\s*(?:mm|cm|m\b|ft|sq|%|x\b|pcs|nos|no\.|units?\b|points?\b|pts?\b))/gi)]
    if (!nums.length) continue
    const m = nums[nums.length - 1], amt = parseFloat(m[1].replace(/,/g, ''))
    if (!isFinite(amt) || amt === 0 || Math.abs(amt) > 500000) continue
    // A lone small number with no $ is more likely a quantity or item number than a price.
    if (!/\$/.test(m[0]) && Math.abs(amt) < 20 && nums.length === 1) continue
    const d = (line.slice(0, m.index) + line.slice((m.index ?? 0) + m[0].length)).replace(/\s*[-–:|]+\s*$/, '').replace(/\s+/g, ' ').trim()
    out.push({ d: d.slice(0, 120) || 'Item', amt: Math.round(amt * 100) / 100, cat: categorize(d) })
  }
  return out.slice(0, 300)
}

/** What this design measures, per category, to turn quote totals into rates. */
export function designQty(S: Design): Record<string, { qty: number; unit: string }> {
  const carpFt = carpentryLines(S).reduce((s, l) => s + l.qty, 0)
  const floorM2 = S.rooms.reduce((s, r) => s + rarea(r), 0)
  const c = ceilingQty(S), pts = Object.values(electricalCounts(S)).reduce((s, n) => s + n, 0)
  const wallM2 = S.rooms.reduce((s, r) => { const P = rpts(r); let per = 0; P.forEach((q, i) => { const n = P[(i + 1) % P.length]; per += Math.hypot(n[0] - q[0], n[1] - q[1]) }); return s + per * S.H }, 0)
  const out: Record<string, { qty: number; unit: string }> = {}
  if (carpFt > 0) out.carp = { qty: carpFt, unit: 'ft run' }
  if (floorM2 > 0) out.floor = { qty: floorM2, unit: 'm²' }
  if (c.box > 0 || c.full > 0) out.ceil = c.full > 0 ? { qty: c.full, unit: 'm² (full)' } : { qty: c.box / FT, unit: 'ft run' }
  if (pts > 0) out.elec = { qty: pts, unit: 'point' }
  if (wallM2 > 0) out.paint = { qty: wallM2, unit: 'm² of wall' }
  return out
}

export function quoteTotals(q: Quote) {
  const t: Record<string, number> = {}
  for (const l of q.lines) t[l.cat] = (t[l.cat] || 0) + l.amt
  return t
}

/** Sanitise saved quotes. */
export function cleanQuotes(o: unknown): Quote[] {
  if (!Array.isArray(o)) return []
  const cats = new Set([...CATS.map((c) => c[0]), OTHER])
  return o.slice(0, 3).filter((q) => q && typeof q === 'object').map((q: any, i) => ({
    id: typeof q.id === 'string' ? q.id.slice(0, 20) : 'q' + i,
    name: String(q.name || `Quote ${i + 1}`).slice(0, 40),
    lines: (Array.isArray(q.lines) ? q.lines : []).slice(0, 300).filter((l: any) => l && isFinite(+l.amt))
      .map((l: any) => ({ d: String(l.d || '').slice(0, 120), amt: +(+l.amt).toFixed(2), cat: cats.has(l.cat) ? l.cat : categorize(String(l.d || '')) })),
  }))
}

/* UI */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const money = (v: number) => '$' + Math.round(v).toLocaleString('en-US')
export function quotesHtml(S: Design & { quotes?: Quote[] }): string {
  const qs = S.quotes || []
  let h = `<div class="sec"><h3>Compare quotes</h3>`
  if (!qs.length) return h + `<p class="note" style="margin-top:0">Paste each contractor's quote to compare them by category, with rates against this design's quantities.</p><div class="acts"><button class="btn" data-q="add">Add a quote</button></div></div>`
  const totals = qs.map(quoteTotals), dq = designQty(S)
  const used = [...CATS.map((c) => c[0]), OTHER].filter((c) => totals.some((t) => t[c]))
  h += `<div style="overflow:auto"><table class="qt"><thead><tr><th></th>${qs.map((q) => `<th>${esc(q.name)}<br><button class="btn" data-q="edit" data-id="${q.id}" style="padding:1px 6px;margin-top:3px">Edit</button></th>`).join('')}</tr></thead><tbody>`
  for (const c of used) {
    const vals = totals.map((t) => t[c] || 0), lo = Math.min(...vals.filter((v) => v > 0)), hi = Math.max(...vals)
    const q = dq[c]
    h += `<tr><td>${esc(catName(c))}${q ? `<br><small>${q.qty.toFixed(q.unit === 'point' ? 0 : 1)} ${q.unit} in this design</small>` : ''}</td>${vals.map((v) => `<td class="${qs.length > 1 && v > 0 && v === lo && lo !== hi ? 'lo' : ''}">${v ? money(v) : '–'}${q && v ? `<br><small>${money(v / q.qty)} / ${q.unit.replace(/ \(.*\)/, '').replace(' of wall', '')}</small>` : ''}</td>`).join('')}</tr>`
  }
  const sums = totals.map((t) => Object.values(t).reduce((s, v) => s + v, 0))
  h += `<tr class="tot"><td>Total</td>${sums.map((v) => `<td>${money(v)}</td>`).join('')}</tr></tbody></table></div>`
  h += `<div class="acts">${qs.length < 3 ? '<button class="btn" data-q="add">Add a quote</button>' : ''}<button class="btn" data-q="budget" data-v="${Math.round(Math.min(...sums))}">Use lowest total as budget cap</button></div>`
  h += `<p class="note">Lowest in each row is highlighted. Quotes split work differently, so compare what each line includes, not just the totals. Rates use this design's quantities, which come from the drawing.</p></div>`
  return h
}
export function quoteDialogHtml(q?: Quote): string {
  const text = q ? q.lines.map((l) => `${l.d}  $${l.amt}`).join('\n') : ''
  return `<h2>${q ? 'Edit quote' : 'Add a quote'}</h2><label class="row" style="grid-template-columns:90px 1fr"><span>Contractor</span><input id="qn" type="text" maxlength="40" value="${esc(q?.name || '')}" placeholder="e.g. ABC Renovation"></label>
    <p class="note" style="margin:6px 0">Paste the quote's item lines. Each line's last amount is taken as its price; total lines are skipped.</p>
    <textarea id="qt" spellcheck="false" placeholder="Hacking of kitchen wall tiles  $1,200&#10;Kitchen bottom cabinet 12 ft run  $2,640&#10;Vinyl flooring 650 sq ft  $3,250">${esc(text)}</textarea><p id="qmsg" class="note"></p>
    <div class="acts"><button class="btn primary" data-q="save" data-id="${q?.id || ''}">Save</button>${q ? `<button class="btn danger" data-q="del" data-id="${q.id}">Delete</button>` : ''}<button class="btn" data-d="close">Cancel</button></div>`
}
