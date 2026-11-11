/** Surroundings page: pick a unit, see its view, sun, roads and amenities, and compare units. */
import { KEY_DAYS, obstacles, toLatLng, railDistances, roadDistances, storeysLabel, sunDay, unitAt, unitPos, unitStoreys, view, yearSun, type Amenity, type Osm, type Pick, type Pt, type Site, type UnitPos } from './analysis'
import { createMap, KIND } from './map'
import { createScene } from './scene'
import berlayar from './sites/berlayar-rise.json'
import kebunBaru from './sites/kebun-baru-breeze.json'
import kebunBaruRidge from './sites/kebun-baru-ridge.json'
import lakeviewCascadia from './sites/lakeview-cascadia.json'
import sembawangBrook from './sites/sembawang-brook.json'
import sembawangPortico from './sites/sembawang-portico.json'
import woodgroveAcres from './sites/woodgrove-acres.json'
import { saveChosenUnit, studioUnitUrl, unitLabel } from '../state/unit'
import { addToShortlist, moveInShortlist, readShortlist, saveShortlist, SHORTLIST_MAX, type ShortlistUnit } from '../state/shortlist'
import { BOOK_SHARES, flatTypeOf, queueBands, siteUnits, unitKey, type QueueBand, type QueueResult, type QueueUnit } from './queue'
import { bindPlaces, distanceM, kmText, loadPlaces, placesHtml } from './places'
import { loadResale, resaleHtml, summarise, type ResaleFile } from './resale'
import { buildGraph, estateStarts, fromStarts, hull, routeTo, type Graph, type Route } from './walk'

const SITES: Record<string, Site> = {
  'berlayar-rise': berlayar as unknown as Site,
  'kebun-baru-breeze': kebunBaru as unknown as Site,
  'kebun-baru-ridge': kebunBaruRidge as unknown as Site,
  'lakeview-cascadia': lakeviewCascadia as unknown as Site,
  'sembawang-brook': sembawangBrook as unknown as Site,
  'sembawang-portico': sembawangPortico as unknown as Site,
  'woodgrove-acres': woodgroveAcres as unknown as Site,
}
/** OpenStreetMap snapshots load after the page is up (they're the bulk of the data). */
const OSM: Record<string, () => Promise<Osm>> = {
  'berlayar-rise': () => import('./sites/berlayar-rise.osm.json').then((m) => m.default as unknown as Osm),
  'kebun-baru-breeze': () => import('./sites/kebun-baru-breeze.osm.json').then((m) => m.default as unknown as Osm),
  'kebun-baru-ridge': () => import('./sites/kebun-baru-ridge.osm.json').then((m) => m.default as unknown as Osm),
  'lakeview-cascadia': () => import('./sites/lakeview-cascadia.osm.json').then((m) => m.default as unknown as Osm),
  'sembawang-brook': () => import('./sites/sembawang-brook.osm.json').then((m) => m.default as unknown as Osm),
  'sembawang-portico': () => import('./sites/sembawang-portico.osm.json').then((m) => m.default as unknown as Osm),
  'woodgrove-acres': () => import('./sites/woodgrove-acres.osm.json').then((m) => m.default as unknown as Osm),
}
/** Flat types, as a queue number is for one of them. */
const QTYPE: Record<string, string> = { '2R': '2-room Flexi', '3R': '3-room', '4R': '4-room', '5R': '5-room', '3Gen': '3Gen' }
const TYPE: Record<string, string> = { '2R-1': '2-room Flexi (Type 1)', '2R-2': '2-room Flexi (Type 2)', '3R': '3-room', '4R': '4-room', '5R': '5-room', '3Gen': '3Gen' }

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const hrs = (h: number) => h < 0.05 ? 'none' : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`
const clock = (t: number) => `${Math.floor(t)}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`
const km = (m: number) => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
let toastT = 0
function toast(m: string) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('on'), 2400) }

/* state, from the address, then this browser, then defaults */
const q = new URLSearchParams(location.search)
/** A unit in the comparison, from any project. */
interface CmpPick extends Pick { site: string }
/** A queue number for one project: its flat type and the share of those ahead assumed to book. */
interface QueueSet { no: number; type: string; share: number }
let saved: { site?: string; pick?: Pick; compare?: (Pick & { site?: string })[]; queue?: Record<string, QueueSet> } = {}
try { saved = JSON.parse(localStorage.getItem('surroundings') || '{}') } catch { /* fresh start */ }
let siteId = q.get('site') && SITES[q.get('site')!] ? q.get('site')! : saved.site && SITES[saved.site] ? saved.site : 'berlayar-rise'
let site = SITES[siteId]
const first = site.blocks[0]
let pick: Pick = q.get('block') ? { block: q.get('block')!, unit: q.get('unit') || '', storey: +(q.get('storey') || 10) } : saved.pick ?? { block: first.id, unit: first.units[0].no, storey: Math.round(first.storeys / 2) }
// Entries saved before comparisons spanned projects are from the project that was open.
let compare: CmpPick[] = (saved.compare ?? []).map((p) => ({ ...p, site: p.site ?? saved.site ?? siteId })).filter((p) => SITES[p.site])
const queue: Record<string, QueueSet> = saved.queue ?? {}
let shortlist = readShortlist()
let future = 40, winView = false
const today = new Date()
const dayText = (d: { label: string }) => d.label === 'Today' ? 'today' : 'on the ' + d.label
const DAYS = [{ label: 'Today', m: today.getMonth() + 1, d: today.getDate() }, ...KEY_DAYS]
let dayIdx = 0, time = 15
/** A project's surroundings: its OpenStreetMap snapshot and walking network (loaded on demand), and walks worked out so far. */
interface Ctx { id: string; site: Site; osm: Osm | null; graph: Graph | null; runs: Map<string, ReturnType<typeof fromStarts>>; loading?: Promise<Ctx> }
const ctxs = new Map<string, Ctx>()
function ctxOf(id: string): Ctx {
  let c = ctxs.get(id)
  if (!c) { c = { id, site: SITES[id], osm: null, graph: null, runs: new Map() }; ctxs.set(id, c) }
  return c
}
function loadCtx(id: string): Promise<Ctx> {
  const c = ctxOf(id)
  c.loading ??= OSM[id]().then((o) => { c.osm = o; c.graph = buildGraph(o.walk); return c }).catch((e) => { c.loading = undefined; throw e })
  return c.loading
}
/** The open project. */
let cx = ctxOf(siteId)

function persist() {
  try { localStorage.setItem('surroundings', JSON.stringify({ site: siteId, pick, compare, queue })) } catch { /* private mode */ }
  const u = new URL(location.href)
  u.search = new URLSearchParams({ site: siteId, block: pick.block, unit: pick.unit, storey: String(pick.storey) }).toString()
  history.replaceState(null, '', u)
}

/* views */
const scene = createScene($('#gl') as HTMLCanvasElement)
const map = createMap($('#map'), (a) => showRoute(a), (b, at) => pickAt(b, at))
if (!scene) $('#hint3').textContent = 'The 3D view needs WebGL. The Map tab and results still work.'

function current(): UnitPos | null {
  const b = site.blocks.find((x) => x.id === pick.block) ?? site.blocks[0]
  if (!b.units.some((u) => u.no === pick.unit)) pick.unit = b.units[0].no
  pick.block = b.id
  return unitPos(site, pick)
}

/** Pick the unit whose window is nearest a clicked point on a block, at the clicked height (3D) or the current storey (map). */
function pickAt(blockId: string, at: Pt, heightM?: number) {
  const b = site.blocks.find((x) => x.id === blockId)
  if (!b) return
  const storey = heightM == null ? pick.storey : Math.max(2, Math.floor(heightM / site.storeyM) + 1)
  const u = unitAt(b, at, storey)
  pick = { block: b.id, unit: u.no, storey }
  update()
  toast(`Picked Block ${b.id} #${String(pick.storey).padStart(2, '0')}-${u.no}`)
}

/* places and walking */
const centre = (u: UnitPos): Pt => { const fp = u.block.footprint; return [fp.reduce((s, p) => s + p[0], 0) / fp.length, fp.reduce((s, p) => s + p[1], 0) / fp.length] }
/** In-estate places from the brochure, plus OpenStreetMap's once loaded (the brochure's town-map list until then). */
const places = (c: Ctx = cx): Amenity[] => c.osm ? [...c.site.amenities.filter((a) => a.local), ...c.osm.amenities] : c.site.amenities
interface Place { a: Amenity; straight: number; route: Route | null; dist: number; walkMin: number }
function walkTo(u: UnitPos, a: Amenity, c: Ctx = cx): Place {
  const o = centre(u), straight = Math.hypot(a.at[0] - o[0], a.at[1] - o[1])
  let route: Route | null = null
  if (c.graph && !a.local) {
    let run = c.runs.get(u.block.id)
    if (!run) {
      const estate = c.osm?.estate ?? hull([...c.site.blocks.flatMap((b) => b.footprint), ...c.site.buildings.flatMap((b) => b.poly ?? [])])
      run = fromStarts(c.graph, estateStarts(c.graph, o, estate)); c.runs.set(u.block.id, run)
    }
    route = routeTo(c.graph, run, o, a.at)
  }
  const dist = route ? route.dist : Math.round(straight * 1.3)
  return { a, straight: Math.round(straight), route, dist, walkMin: Math.max(1, Math.round(dist / 80)) }
}
/** Nearest of a kind by walking distance (checks the 8 closest in a straight line). */
function nearest(u: UnitPos, kind: string, filter: (a: Amenity) => boolean = () => true, cc: Ctx = cx): Place | null {
  const c = centre(u)
  // A station still being built isn't one to walk to yet, and a playground tagged as a park isn't the park people mean.
  const cands = places(cc).filter((a) => a.kind === kind && a.sub !== 'future' && !(kind === 'park' && /playground/i.test(a.name)) && filter(a)).sort((p, q2) => Math.hypot(p.at[0] - c[0], p.at[1] - c[1]) - Math.hypot(q2.at[0] - c[0], q2.at[1] - c[1])).slice(0, 8)
  return cands.map((a) => walkTo(u, a, cc)).sort((p, q2) => p.dist - q2.dist)[0] ?? null
}
function showRoute(a: Amenity) {
  const u = current()
  if (!u) return
  const p = walkTo(u, a)
  const c = centre(u)
  if ($('#pmap').hidden) (document.querySelector('.seg [data-v=map]') as HTMLElement).click()
  // On a phone the map sits above the results: bring it into view to show the route.
  const stage = $('#stage'), r = stage.getBoundingClientRect()
  if (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) < r.height * 0.6) stage.scrollIntoView({ behavior: 'smooth', block: 'start' })
  map.showRoute(p.route?.line ?? [c, a.at], `${a.name}: ${km(p.dist)}, about ${p.walkMin} min walk${p.route ? '' : ' (straight line)'}`)
}

function fillPickers() {
  $<HTMLSelectElement>('#site').innerHTML = Object.entries(SITES).map(([k, s]) => `<option value="${k}"${k === siteId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
  $<HTMLSelectElement>('#block').innerHTML = site.blocks.map((b) => `<option value="${b.id}"${b.id === pick.block ? ' selected' : ''}>${b.id} · ${storeysLabel(b)}</option>`).join('')
  const b = site.blocks.find((x) => x.id === pick.block)!
  $<HTMLSelectElement>('#unit').innerHTML = b.units.map((u) => `<option value="${u.no}"${u.no === pick.unit ? ' selected' : ''}>Unit ${u.no} · ${TYPE[u.type] ?? u.type}</option>`).join('')
  const unit = b.units.find((u) => u.no === pick.unit), [lowest, highest] = unit ? unitStoreys(b, unit) : [2, b.storeys]
  for (const id of ['#storey', '#storeyR']) { const el = $<HTMLInputElement>(id); el.min = String(lowest); el.max = String(highest); if (el !== document.activeElement || id === '#storeyR') el.value = String(pick.storey) }
  const order = Object.keys(QTYPE), types = [...new Set(site.blocks.flatMap((x) => x.units.map((u) => flatTypeOf(u.type))))].sort((a, c) => order.indexOf(a) - order.indexOf(c))
  const qs = queue[siteId], qt = qs && types.includes(qs.type) ? qs.type : flatTypeOf(unit?.type ?? types[0])
  $<HTMLSelectElement>('#qType').innerHTML = types.map((t) => `<option value="${t}"${t === qt ? ' selected' : ''}>${QTYPE[t] ?? t}</option>`).join('')
  $<HTMLSelectElement>('#qShare').innerHTML = BOOK_SHARES.map((o) => `<option value="${o.value}"${o.value === (qs?.share ?? 1) ? ' selected' : ''}>${o.label}</option>`).join('')
  const qNo = $<HTMLInputElement>('#qNo')
  if (qNo !== document.activeElement) qNo.value = qs?.no ? String(qs.no) : ''
  $<HTMLSelectElement>('#day').innerHTML = DAYS.map((d, i) => `<option value="${i}"${i === dayIdx ? ' selected' : ''}>${d.label}</option>`).join('')
}

/* Work that only changes with the project, reserved-land height or loaded data is redone only then. */
const obsCache = new Map<string, { key: string; obs: ReturnType<typeof obstacles> }>()
const obsKey = (c: Ctx) => `${c.id}|${future}|${c.osm ? 1 : 0}`
const getObstacles = (c: Ctx = cx) => {
  const key = obsKey(c)
  let o = obsCache.get(c.id)
  if (o?.key !== key) { o = { key, obs: obstacles(c.site, future, c.osm) }; obsCache.set(c.id, o) }
  return o.obs
}
let shown = { future: -1, places: '' }
const walkLabel = (u: UnitPos, a: Amenity) => { const p = walkTo(u, a); return `${km(p.dist)} · ${p.walkMin} min walk${p.route ? '' : ' (estimate)'}` }

/** Where the stack starts or stops, when that isn't the 2nd storey or the top of the block. */
function stackNote(u: UnitPos) {
  const { from, to } = u.unit
  if (from && to) return ` This stack runs from storey ${from} to ${to}.`
  if (from) return ` This stack starts at storey ${from}.`
  if (to) return ` This stack stops at storey ${to}; other parts of the block rise to ${u.block.storeys}.`
  return ''
}

function update() {
  const u = current()
  if (!u) return
  pick.storey = u.storey
  fillPickers()
  persist()
  const obs = getObstacles(), d = DAYS[dayIdx], y = today.getFullYear()
  scene?.setUnit(u); scene?.setSun(y, d.m, d.d, time)
  map.setUnit(u)
  if (shown.future !== future) { shown.future = future; scene?.setFuture(future); map.setFuture(future) }
  const pk = `${siteId}|${u.block.id}|${cx.graph ? 1 : 0}`
  if (shown.places !== pk) {
    shown.places = pk
    map.setAmenities(places().map((a) => ({ a, label: walkLabel(u, a) })))
    scene?.labelText((a) => walkLabel(u, a))
  }
  $('#futureSec').hidden = !site.zones.some((z) => z.kind === 'future')
  $('#timeLbl').textContent = `${clock(time)} ${dayText(d)}`
  // The money plan and Flat Studio pick this unit up from here.
  saveChosenUnit({ site: siteId, block: u.block.id, unit: u.unit.no, storey: u.storey, type: u.unit.type, facing: u.facing })
  const studio = studioUnitUrl({ site: siteId, type: u.unit.type }), toStudio = $<HTMLAnchorElement>('#toStudio')
  toStudio.hidden = !studio
  if (studio) { toStudio.href = studio; toStudio.title = `Open the ${TYPE[u.unit.type] ?? u.unit.type} layout, redrawn from HDB's brochure, for ${unitLabel({ block: u.block.id, unit: u.unit.no, storey: u.storey })}` }
  $('#unitNote').textContent = `Unit #${String(u.storey).padStart(2, '0')}-${u.unit.no} is about ${Math.round(u.floorZ)} m above ground; its main windows face ${u.facing}.${stackNote(u)}`
  renderResults(u, obs)
}
/** Sliders fire many times a frame; redo the results once per frame at most. */
let queued = 0
const updateSoon = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; update() }) }

const pct = (t: number) => `${((t - 6.5) / 13 * 100).toFixed(2)}%`
function sunBar(day: ReturnType<typeof sunDay>) {
  const W = 300, x = (t: number) => (t - 6.5) / 13 * W
  const hour = (t: number) => t > 12 ? t - 12 + ' pm' : t + (t === 12 ? ' pm' : ' am')
  return `<div class="tlw"><svg class="tl" viewBox="0 0 ${W} 16" preserveAspectRatio="none" role="img" aria-label="Direct sun through the day: coloured where the sun reaches the windows, orange after 3 pm">${day.slots.map((s) => `<rect x="${x(s.t)}" y="0" width="${W / 78 + 0.3}" height="16" fill="${s.lit ? (s.t >= 15 ? '#e8833a' : '#f2c14e') : 'var(--line)'}"><title>${clock(s.t)}: ${s.lit ? 'direct sun' : esc(s.why ?? 'no direct sun')}</title></rect>`).join('')}</svg>
    <span class="tl3" style="left:${pct(15)}" title="3 pm: afternoon (west) sun after this"></span><span class="tlnow" id="tlNow" style="left:${pct(time)}" title="The time on the slider"></span>
    <div class="tlx">${[7, 10, 13, 16, 19].map((t) => `<span style="left:${pct(t)}">${hour(t)}</span>`).join('')}</div></div>`
}

function renderResults(u: UnitPos, obs: ReturnType<typeof obstacles>) {
  const d = DAYS[dayIdx], y = today.getFullYear(), day = sunDay(site, u, y, d.m, d.d, obs), yr = yearSun(site, u, obs, y), v = view(u, obs), roads = roadDistances(site, u)
  const westy = yr.avgAfternoon >= 1.5, bright = yr.avgSun >= 2
  const osm = cx.osm, graph = cx.graph, guessed = osm ? osm.buildings.filter((b) => b.a).length : 0
  let h = `<div class="sec"><h3>Block ${u.block.id}, #${String(u.storey).padStart(2, '0')}-${u.unit.no}</h3>
    <div class="kv"><span>Flat type</span><b>${TYPE[u.unit.type] ?? u.unit.type}</b></div>
    <div class="kv"><span>Height above ground</span><b>about ${Math.round(u.floorZ)} m</b></div>
    <div class="kv"><span>Main windows face</span><b>${u.facing}</b></div></div>`
  h += queueHtml(u)
  h += `<div class="sec"><h3>Sun on the main windows</h3><div class="big">${hrs(day.sunHours)} <small>direct sun ${dayText(d)}</small></div>${sunBar(day)}
    <div class="kv"><span>After 3 pm (west sun)</span><b>${hrs(day.afternoonHours)}</b></div>
    <div class="kv"><span>Year average</span><b>${hrs(yr.avgSun)} a day</b></div>
    <div class="kv"><span>Year average after 3 pm</span><b>${hrs(yr.avgAfternoon)}</b></div>
    ${yr.days.map((k) => `<div class="kv"><span>${k.label}</span><b>${hrs(k.sunHours)}</b></div>`).join('')}
    <p class="note"><span class="pill ${westy ? 'warn' : 'good'}">${westy ? 'Afternoon sun most of the year' : 'Little afternoon sun over the year'}</span> ${westy ? 'Rooms on this side warm up in the afternoon; blinds or tinted glass help.' : 'Cooler in the afternoon on most days.'} ${bright ? '' : 'Not much direct sun: rooms stay cooler but can be dimmer.'} Direct sun only, on the side the unit faces; other windows may differ.</p></div>`
  h += `<div class="sec"><h3>View</h3><div class="big">${v.farPct}% <small>of the view clear for 300 m or more</small></div>
    <div class="kv"><span>Clear for 100 m or more</span><b>${v.openPct}%</b></div>
    <div class="kv"><span>Nearest building in front${v.nearest ? `: ${esc(v.nearest.name.replace(/:.*/, ''))}` : ''}</span><b>${v.nearest ? `${Math.round(v.nearest.dist)} m` : 'none within 1 km'}</b></div>
    <p class="note">Looking out across 140° at eye level. Only buildings taller than your floor block the view.${future > 0 && site.zones.some((z) => z.kind === 'future') ? ` Reserved land is assumed to get ${future}-storey blocks.` : ''} ${osm ? `Buildings around the estate are from OpenStreetMap (${guessed} of ${osm.buildings.length} have no height there and are taken as 2 storeys).` : '<b>Loading the buildings around the estate…</b>'}</p></div>`
  const rail = railDistances(u, osm), trains = rail.filter((r) => !r.underground), under = [...new Set([...rail.filter((r) => r.underground && r.dist < 250).map((r) => r.name), ...site.rail.filter((r) => r.underground).map((r) => r.name)].map((n) => n.replace(/ \(.*\)$/, '')))]
  h += `<div class="sec"><h3>Roads and noise</h3>${roads.slice(0, 4).map((r) => `<div class="kv"><span>${esc(r.name)}${r.faces ? ' <span class="pill warn">faces it</span>' : ''}</span><b>${r.dist} m</b></div>`).join('')}
    ${trains.slice(0, 2).map((r) => `<div class="kv"><span>${esc(r.name)} (train tracks above ground)${r.faces ? ' <span class="pill warn">faces it</span>' : ''}</span><b>${r.dist} m</b></div>`).join('')}
    <p class="note">Distance from the window to the road's edge${trains.length ? ' or the track' : ''}, counting height. ${roads[0].dist < 80 && roads[0].faces ? 'Close to a road and facing it, so expect traffic noise; check at different times.' : 'Visit at peak hour to judge noise.'}${trains.some((r) => r.dist < 150 || (r.faces && r.dist < 300)) ? ' Trains on the track nearby can be heard, more so with windows facing it; visit when trains are running, including early morning and late at night.' : ''}${under.map((n) => ` The ${esc(n)} runs underground nearby, so it adds no train noise.`).join('')}${osm ? '' : ' Train tracks show once the surroundings load.'}</p></div>`
  const kinds: [string, string][] = [['mrt', 'MRT'], ['bus', 'Bus interchange'], ['shops', 'Shops and food'], ['park', 'Park'], ['community', 'Community'], ['health', 'Clinic or hospital']]
  const near = kinds.map(([k]) => nearest(u, k)).filter((x): x is Place => !!x)
  h += `<div class="sec"><h3>Nearby</h3>${near.map((x) => `<button type="button" class="am link" data-am="${esc(x.a.name)}" title="Show the walking route on the map"><i aria-hidden="true" style="background:${KIND[x.a.kind].c}">${esc(KIND[x.a.kind].l)}</i><span>${esc(x.a.name)}</span><b>${km(x.dist)} · ${x.walkMin} min</b></button>`).join('')}
    <p class="note">${graph ? 'Walking distance from the block: across the estate (its paths aren\'t mapped yet, so straight line plus 30%), then along paths and streets (OpenStreetMap). Pick one to see the route on the map.' : 'Walking estimates for now (straight line plus 30%); routes along real paths load in a moment.'} 80 m a minute.</p></div>`
  // Primary schools by straight-line distance: Primary 1 registration gives priority within 1 km and 2 km.
  const c = centre(u), prim = places().filter((a) => a.kind === 'school' && (a.sub === 'primary' || /primary/i.test(a.name))).map((a) => ({ a, d: Math.round(Math.hypot(a.at[0] - c[0], a.at[1] - c[1])) })).filter((x) => x.d <= 2000).sort((p, q2) => p.d - q2.d)
  h += `<div class="sec"><h3>Primary schools within 2 km</h3>${prim.length ? prim.map((x) => `<button type="button" class="am link" data-am="${esc(x.a.name)}" title="Show the walking route on the map"><i aria-hidden="true" style="background:${KIND.school.c}">S</i><span>${esc(x.a.name)}</span><b>${x.d <= 1000 ? '<span class="pill good">within 1 km</span>' : '1–2 km'} · ${km(x.d)}</b></button>`).join('') : '<p class="note" style="margin:0">None found.</p>'}
    <p class="note">Primary 1 registration gives priority to homes within 1 km and 2 km of a school. These are rough straight-line distances to the school's map point; the official distance is measured by SLA from your address (OneMap's school query).</p></div>`
  const rf = resale.get(siteId) ?? null
  h += resaleHtml(rf, rf ? summarise(rf.rows, (x) => Math.hypot(x.at[0] - c[0], x.at[1] - c[1])) : [], `Block ${esc(u.block.id)}`, u.unit.type.replace(/-\d$/, ''))
  const at = toLatLng(site, c)
  h += placesHtml(at, (p) => { const d = Math.round(distanceM(at[0], at[1], p.lat, p.lon)); return { near: d, far: d } })
  h += shortlistHtml()
  h += compareHtml()
  h += `<div class="sec"><p class="note" style="margin:0">Estate: ${esc(site.source)}. ${osm ? `Surroundings: ${esc(osm.attribution)}, snapshot of ${osm.fetched}.` : ''} Blocks are placed to within a few metres; storeys are taken as ${site.storeyM} m. Heights of future buildings on reserved land are not known. A planning aid, not a survey.</p></div>`
  $('#results').innerHTML = h
}

interface Metrics { sun: number; pm: number; far: number; road: number; mrt: number }
const cmpCache = new Map<string, Metrics>()
/** Year-average sun, view, nearest road and walk to the MRT, for comparing units (needs the project's surroundings loaded). */
function metricsOf(ctx: Ctx, u: UnitPos, y = today.getFullYear()): Metrics {
  const key = `${obsKey(ctx)}|${u.block.id}|${u.unit.no}|${u.storey}`
  let c = cmpCache.get(key)
  if (!c) {
    const obs = getObstacles(ctx), yr = yearSun(ctx.site, u, obs, y), v = view(u, obs), r = roadDistances(ctx.site, u)[0], mrt = nearest(u, 'mrt', undefined, ctx)
    c = { sun: yr.avgSun, pm: yr.avgAfternoon, far: v.farPct, road: r.dist, mrt: mrt ? mrt.walkMin : 99 }
    cmpCache.set(key, c)
  }
  return c
}

/* queue number and shortlist */
const BAND_TEXT: Record<QueueBand, string> = { gone: 'likely gone', maybe: 'might be gone', left: 'likely left' }
const BAND_PILL: Record<QueueBand, string> = { gone: 'bad', maybe: 'warn', left: 'good' }
const qMemo = new Map<string, { units: QueueUnit[]; r: QueueResult }>()
/** The queue estimate for a project, once a number is entered for it. */
function queueFor(id: string) {
  const set = queue[id]
  if (!set?.no || !SITES[id]) return null
  const key = `${id}|${set.type}|${set.no}|${set.share}`
  let m = qMemo.get(key)
  if (!m) { const units = siteUnits(SITES[id], set.type); m = { units, r: queueBands(units, set.no, set.share) }; qMemo.set(key, m) }
  return { set, ...m }
}
/** A shortlisted unit's band, if its project has a queue number for its flat type. */
function bandOf(s: ShortlistUnit): QueueBand | undefined {
  const q = queueFor(s.site)
  return q && flatTypeOf(s.type) === q.set.type ? q.r.band.get(unitKey(s)) : undefined
}
/** "all 599 people ahead of you book", "3 in 4 of the 599 people ahead of you book". */
const aheadText = (share: number, ahead: number) => {
  const n = ahead.toLocaleString(), who = `${ahead === 1 ? 'person' : 'people'} ahead of you`
  return share === 1 ? `all ${n} ${who} book` : `${BOOK_SHARES.find((o) => o.value === share)?.label.replace(/ book$/, '') ?? share} of the ${n} ${who} book`
}

function queueHtml(u: UnitPos) {
  const q = queueFor(siteId)
  if (!q) return ''
  const { set, r } = q, label = QTYPE[set.type] ?? set.type
  if (!r.total) return `<div class="sec"><h3>Units left at number ${set.no}</h3><p class="note" style="margin:0">No ${label} flats in this project.</p></div>`
  const me = flatTypeOf(u.unit.type) === set.type ? r.band.get(unitKey({ block: u.block.id, unit: u.unit.no, storey: u.storey })) : undefined
  const sl = shortlist.filter((x) => x.site === siteId && flatTypeOf(x.type) === set.type), slKeys = new Set(sl.map(unitKey))
  const meKey = unitKey({ block: u.block.id, unit: u.unit.no, storey: u.storey })
  const blocks = site.blocks.map((b) => {
    const stacks = b.units.filter((x) => flatTypeOf(x.type) === set.type)
    if (!stacks.length) return ''
    const range = stacks.map((x) => unitStoreys(b, x)), lo = Math.min(...range.map((x) => x[0])), hi = Math.max(...range.map((x) => x[1]))
    let cells = ''
    for (let st = hi; st >= lo; st--) stacks.forEach((x, i) => {
      if (st < range[i][0] || st > range[i][1]) { cells += '<span class="qc"></span>'; return }
      const k = unitKey({ block: b.id, unit: x.no, storey: st }), band = r.band.get(k)!
      cells += `<span class="qc ${band}${k === meKey ? ' me' : ''}${slKeys.has(k) ? ' sl' : ''}" data-q="${esc(k)}" title="#${String(st).padStart(2, '0')}-${esc(x.no)}: ${BAND_TEXT[band]}"></span>`
    })
    return `<div class="qb"><b>Block ${esc(b.id)}</b><div class="qg" style="grid-template-columns:repeat(${stacks.length},11px)" aria-hidden="true">${cells}</div>storeys ${lo}–${hi}</div>`
  }).join('')
  const slLeft = sl.filter((x) => bandOf(x) === 'left').length
  return `<div class="sec"><h3>Units left at number ${set.no}</h3>
    <p class="note" style="margin-top:0">${r.total.toLocaleString()} ${label} flats on the block plans. If ${aheadText(set.share, set.no - 1)}, about <b>${r.taken.toLocaleString()}</b> are booked before your turn.${set.no - 1 >= r.total ? ' Your number is past the number of flats, so you’d get one only if enough people ahead don’t book.' : ''}</p>
    ${me ? `<p class="note"><span class="pill ${BAND_PILL[me]}">This unit: ${BAND_TEXT[me]}</span></p>` : `<p class="note">This unit is a ${TYPE[u.unit.type] ?? u.unit.type} flat; the map below is for ${label} flats.</p>`}
    ${sl.length ? `<p class="note">${slLeft} of your ${sl.length} shortlisted ${label} units here ${slLeft === 1 ? 'is' : 'are'} likely left.</p>` : ''}
    <div class="qbs">${blocks}</div>
    <p class="note qkey"><i style="background:color-mix(in srgb,var(--danger) 55%,var(--line))"></i>likely gone<i style="background:var(--warn)"></i>might be gone<i style="background:var(--good)"></i>likely left. Each column is a stack, top floor at the top; click one to pick it. Outlined: this unit (thick) and your shortlist (thin).</p>
    <p class="note">A rough guide. Units are taken as booked from the highest floor down, with west-facing stacks counted 6 storeys lower and south-west or north-west ones 3 lower, for the afternoon sun. HDB sets flats aside for different groups, and people choose for price, stack and view in their own ways. Before your appointment, check which units are still available on HDB’s site.</p></div>`
}

function shortlistHtml() {
  if (!shortlist.length) return `<div class="sec"><h3>Your shortlist</h3><p class="note" style="margin:0">Add units in the order you’d pick them, with backups, for your flat selection appointment. Up to ${SHORTLIST_MAX}, from any project.</p></div>`
  // Projects whose surroundings aren't loaded yet load now, so the printout can give their sun and view.
  for (const id of new Set(shortlist.map((x) => x.site))) if (SITES[id] && !ctxOf(id).osm) loadCtx(id).catch(() => {})
  const multi = shortlist.some((x) => x.site !== siteId)
  return `<div class="sec"><h3>Your shortlist</h3>${shortlist.map((x, i) => {
    const b = bandOf(x), name = `${multi ? `${esc(SITES[x.site]?.name ?? x.site)} ` : ''}${esc(unitLabel(x))}`
    return `<div class="slr"><span class="n">${i + 1}</span><button type="button" class="go" data-slgo="${i}" title="Open this unit"><b>${name}</b><small>${TYPE[x.type] ?? esc(x.type)}${x.facing ? `, faces ${esc(x.facing)}` : ''}${b ? ` · <span class="pill ${BAND_PILL[b]}">${BAND_TEXT[b]}</span>` : ''}</small></button>
      <span class="mv"><button class="btn" data-slmv="${i}|-1" aria-label="Move ${name} up"${i === 0 ? ' disabled' : ''}>↑</button><button class="btn" data-slmv="${i}|1" aria-label="Move ${name} down"${i === shortlist.length - 1 ? ' disabled' : ''}>↓</button><button class="btn" data-slrm="${i}" aria-label="Remove ${name}">×</button></span></div>`
  }).join('')}
    <div class="acts"><button class="btn" id="slPrint">Print the shortlist</button></div>
    <p class="note">First choice at the top. Saved in this browser; the money plan’s printed summary lists it too.</p></div>`
}

/** One page for the selection appointment: the units in order, with a box to tick what's still available. */
async function printShortlist() {
  await Promise.allSettled([...new Set(shortlist.map((x) => x.site))].filter((id) => SITES[id]).map(loadCtx))
  const queues = Object.keys(SITES).map((id) => ({ id, q: queueFor(id) })).filter((x) => x.q && shortlist.some((s) => s.site === x.id))
  const rows = shortlist.map((x, i) => {
    const c = SITES[x.site] ? ctxOf(x.site) : null, u = c ? unitPos(c.site, x) : null, m = c?.osm && u ? metricsOf(c, u) : null, b = bandOf(x)
    return `<tr><td>${i + 1}</td><td>${esc(SITES[x.site]?.name ?? x.site)}<br><b>${esc(unitLabel(x))}</b></td><td>${TYPE[x.type] ?? esc(x.type)}${x.facing ? `<br>faces ${esc(x.facing)}` : ''}${u ? `, ${Math.round(u.floorZ)} m up` : ''}</td>
      <td>${m ? `${hrs(m.sun)} sun a day, ${hrs(m.pm)} after 3 pm<br>View clear 300 m+: ${m.far}%<br>MRT: ${m.mrt < 99 ? `${m.mrt} min walk` : '—'}` : ''}</td><td>${b ? BAND_TEXT[b] : ''}</td><td class="box"></td></tr>`
  }).join('')
  $('#print').innerHTML = `<h1>Unit shortlist</h1>
    <p>Printed ${today.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}. In order of choice: tick what’s still available on the day and take the first one left.</p>
    ${queues.map(({ id, q }) => `<p>${esc(SITES[id].name)}: queue number ${q!.set.no}, ${QTYPE[q!.set.type] ?? q!.set.type}, if ${aheadText(q!.set.share, q!.set.no - 1)} (a rough guess).</p>`).join('')}
    <table><tr><th>#</th><th>Unit</th><th>Type</th><th>Sun, view, MRT (year average)</th><th>At your number</th><th>Available?</th></tr>${rows}</table>
    <p>From Surroundings: a planning aid, not a survey. Check units, prices and availability with HDB.</p>`
  window.print()
}

function compareHtml() {
  const rows = compare.map((p) => ({ c: ctxOf(p.site), u: unitPos(SITES[p.site], p) })).filter((r): r is { c: Ctx; u: UnitPos } => !!r.u)
  if (!rows.length) return `<div class="sec"><h3>Compare units</h3><p class="note" style="margin:0">Add up to 3 units, from any of the projects, to compare their sun, view and distances side by side.</p></div>`
  // Units from other projects need those projects' surroundings: load them, then come back.
  const waiting = rows.filter((r) => !r.c.osm)
  for (const r of waiting) if (r.c !== cx) loadCtx(r.c.id).then(updateSoon, () => toast(`Could not load the surroundings of ${r.c.site.name}`))
  if (waiting.length) return `<div class="sec"><h3>Compare units</h3><p class="note" style="margin:0">Loading the surroundings of ${[...new Set(waiting.map((r) => esc(r.c.site.name)))].join(' and ')}…</p></div>`
  const multi = new Set(rows.map((r) => r.c.id)).size > 1
  const y = today.getFullYear(), data = rows.map(({ c: ctx, u }) => {
    return { u, ctx, ...metricsOf(ctx, u, y) }
  })
  const best = (k: keyof (typeof data)[number], hi: boolean) => { const vals = data.map((x) => x[k] as number); return hi ? Math.max(...vals) : Math.min(...vals) }
  const cell = (v: number, b: number, s: string) => `<td class="${data.length > 1 && v === b ? 'best' : ''}">${s}</td>`
  const bs = best('sun', true), bp = best('pm', false), bf = best('far', true), br = best('road', true), bm = best('mrt', false)
  return `<div class="sec"><h3>Compare units</h3><div style="overflow:auto"><table class="cmp"><tr><th></th>${data.map((x, i) => `<th>${multi ? `<span class="proj">${esc(x.ctx.site.name)}</span><br>` : ''}${x.u.block.id} #${String(x.u.storey).padStart(2, '0')}-${x.u.unit.no}<br><button class="btn rm" data-rm="${i}" aria-label="Remove ${multi ? esc(x.ctx.site.name) + ' ' : ''}${x.u.block.id} #${String(x.u.storey).padStart(2, '0')}-${x.u.unit.no} from the comparison">×</button></th>`).join('')}</tr>
    <tr><td>Type</td>${data.map((x) => `<td>${TYPE[x.u.unit.type]?.replace(' Flexi', '') ?? x.u.unit.type}</td>`).join('')}</tr>
    <tr><td>Faces</td>${data.map((x) => `<td>${x.u.facing}</td>`).join('')}</tr>
    <tr><td>Height</td>${data.map((x) => `<td>${Math.round(x.u.floorZ)} m</td>`).join('')}</tr>
    <tr><td>Sun a day (year avg)</td>${data.map((x) => cell(x.sun, bs, hrs(x.sun))).join('')}</tr>
    <tr><td>After 3 pm</td>${data.map((x) => cell(x.pm, bp, hrs(x.pm))).join('')}</tr>
    <tr><td>View clear 300 m+</td>${data.map((x) => cell(x.far, bf, x.far + '%')).join('')}</tr>
    <tr><td>Nearest road</td>${data.map((x) => cell(x.road, br, x.road + ' m')).join('')}</tr>
    <tr><td>Walk to MRT</td>${data.map((x) => cell(x.mrt, bm, x.mrt < 99 ? x.mrt + ' min' : '—')).join('')}</tr>
    ${loadPlaces().map((p) => { const ds = data.map((x) => { const ll = toLatLng(x.ctx.site, centre(x.u)); return distanceM(ll[0], ll[1], p.lat, p.lon) }), b = Math.min(...ds); return `<tr><td>To ${esc(p.name)}</td>${ds.map((d) => cell(d, b, kmText(d))).join('')}</tr>` }).join('')}</table></div>
    <p class="note">Highlighted: best in each row (more sun, less afternoon sun, more view, further from roads, closer to the MRT${loadPlaces().length ? ' and to your places, in a straight line' : ''}).${multi ? ' Units from different projects are worked out the same way, each with its own surroundings.' : ''}${site.zones.some((z) => z.kind === 'future') || rows.some((r) => r.c.site.zones.some((z) => z.kind === 'future')) ? ` Reserved land is taken as ${future} storeys everywhere.` : ''}</p></div>`
}

/* controls */
/** Resale snapshots, loaded with the surroundings (null: none taken for this site). */
const resale = new Map<string, ResaleFile | null>()
async function loadOsm() {
  const c = cx
  if (!resale.has(c.id)) { resale.set(c.id, null); loadResale(c.id)?.then((f) => { resale.set(c.id, f); if (c === cx) updateSoon() }, () => resale.delete(c.id)) }
  try { await loadCtx(c.id) } catch { toast('Could not load the buildings around the estate'); return }
  if (c !== cx) return
  scene?.setOsm(c.osm!)
  update()
}
/** Open another project, at a unit (else the first block, halfway up). */
function openSite(id: string, at?: Pick) {
  siteId = id; site = SITES[siteId]; cx = ctxOf(siteId); shown = { future: -1, places: '' }
  pick = at ?? { block: site.blocks[0].id, unit: site.blocks[0].units[0].no, storey: Math.round(site.blocks[0].storeys / 2) }
  scene?.setSite(site); map.setSite(site); update(); loadOsm()
}
$('#site').addEventListener('change', (e) => openSite((e.target as HTMLSelectElement).value))
$('#block').addEventListener('change', (e) => { pick.block = (e.target as HTMLSelectElement).value; update(); scene?.reset() })
$('#unit').addEventListener('change', (e) => { pick.unit = (e.target as HTMLSelectElement).value; update() })
for (const id of ['#storey', '#storeyR']) $(id).addEventListener('input', (e) => { const v = parseInt((e.target as HTMLInputElement).value); if (isFinite(v)) { pick.storey = v; updateSoon() } })
// The typed storey is left alone while typing (so "15" doesn't become "25" via a clamped "2"); tidy it on leaving.
$('#storey').addEventListener('change', () => { $<HTMLInputElement>('#storey').value = String(pick.storey) })
$('#day').addEventListener('change', (e) => { dayIdx = +(e.target as HTMLSelectElement).value; update() })
$('#time').addEventListener('input', (e) => {
  time = +(e.target as HTMLInputElement).value
  const d = DAYS[dayIdx], now = document.getElementById('tlNow')
  scene?.setSun(today.getFullYear(), d.m, d.d, time)
  $('#futureSec').hidden = !site.zones.some((z) => z.kind === 'future')
  $('#timeLbl').textContent = `${clock(time)} ${dayText(d)}`
  if (now) now.style.left = pct(time)
})
$('#future').addEventListener('change', (e) => { future = +(e.target as HTMLSelectElement).value; update() })
$('#addCmp').addEventListener('click', () => {
  if (compare.some((p) => p.site === siteId && p.block === pick.block && p.unit === pick.unit && p.storey === pick.storey)) { toast('Already in the comparison'); return }
  compare = [...compare, { ...pick, site: siteId }].slice(-3); update(); toast(compare.length === 1 ? 'Added to the comparison. Units from other projects can join it too.' : 'Added to the comparison')
})
$('#addSl').addEventListener('click', () => {
  const u = current()
  if (!u) return
  const r = addToShortlist(shortlist, { site: siteId, block: u.block.id, unit: u.unit.no, storey: u.storey, type: u.unit.type, facing: u.facing })
  if (!r.added) { toast(shortlist.length >= SHORTLIST_MAX ? `The shortlist is full (${SHORTLIST_MAX} units)` : 'Already on the shortlist'); return }
  shortlist = r.list; saveShortlist(shortlist); update(); toast(`Added to the shortlist as choice ${shortlist.length}`)
})
function readQueue() {
  const no = parseInt($<HTMLInputElement>('#qNo').value)
  queue[siteId] = { no: no > 0 ? no : 0, type: $<HTMLSelectElement>('#qType').value, share: +$<HTMLSelectElement>('#qShare').value }
  updateSoon()
}
$('#qNo').addEventListener('input', readQueue)
$('#qType').addEventListener('change', readQueue)
$('#qShare').addEventListener('change', readQueue)
bindPlaces($('#results'), () => update())
$('#results').addEventListener('click', (e) => {
  const t = e.target as HTMLElement, b = t.closest<HTMLElement>('[data-rm]')
  if (b) { compare.splice(+b.dataset.rm!, 1); update(); return }
  const qc = t.closest<HTMLElement>('[data-q]')
  if (qc) { const [block, unit, storey] = qc.dataset.q!.split('|'); pick = { block, unit, storey: +storey }; update(); return }
  const go = t.closest<HTMLElement>('[data-slgo]')
  if (go) {
    const x = shortlist[+go.dataset.slgo!]
    if (!x || !SITES[x.site]) return
    if (x.site === siteId) { pick = { block: x.block, unit: x.unit, storey: x.storey }; update() } else openSite(x.site, { block: x.block, unit: x.unit, storey: x.storey })
    return
  }
  const mv = t.closest<HTMLElement>('[data-slmv]')
  if (mv) { const [i, by] = mv.dataset.slmv!.split('|').map(Number); shortlist = moveInShortlist(shortlist, i, by as -1 | 1); saveShortlist(shortlist); update(); return }
  const rm = t.closest<HTMLElement>('[data-slrm]')
  if (rm) { shortlist = shortlist.filter((_, i) => i !== +rm.dataset.slrm!); saveShortlist(shortlist); update(); return }
  if (t.closest('#slPrint')) { printShortlist(); return }
  const am = t.closest<HTMLElement>('[data-am]')
  if (am) {
    const a = places().find((x) => x.name === am.dataset.am)
    if (a) { showRoute(a); document.querySelectorAll('#results .am.on').forEach((x) => x.classList.remove('on')); am.classList.add('on') }
  }
})
$('#winView').addEventListener('click', () => { winView = !winView; $('#winView').setAttribute('aria-pressed', String(winView)); scene?.windowView(winView); $('#hint3').textContent = winView ? 'Drag to look around. This is the view straight out of the main windows at eye level.' : '' })
$('#reset').addEventListener('click', () => { if (winView) { winView = false; $('#winView').setAttribute('aria-pressed', 'false'); scene?.windowView(false); $('#hint3').textContent = '' } scene?.reset() })
document.querySelectorAll<HTMLElement>('.seg [data-v]').forEach((b) => b.addEventListener('click', () => {
  const v = b.dataset.v
  document.querySelectorAll('.seg [data-v]').forEach((x) => x.setAttribute('aria-selected', String(x === b)))
  $('#p3d').hidden = v !== '3d'; $('#pmap').hidden = v !== 'map'
  if (v === 'map') map.redraw(); else scene?.resize()
}))

scene?.onPick((b, at, h) => pickAt(b, at, h))
scene?.onHeading((deg) => { $('#compass').style.transform = `rotate(${-deg}deg)` })
scene?.setSite(site)
map.setSite(site)
update()
loadOsm()
