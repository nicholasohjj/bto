/** Surroundings page: pick a unit, see its view, sun, roads and amenities, and compare units. */
import { KEY_DAYS, obstacles, roadDistances, sunDay, unitPos, view, yearSun, type Amenity, type Osm, type Pick, type Pt, type Site, type UnitPos } from './analysis'
import { createMap, KIND } from './map'
import { createScene } from './scene'
import berlayar from './sites/berlayar-rise.json'
import { buildGraph, estateStarts, fromStarts, hull, routeTo, type Graph, type Route } from './walk'

const SITES: Record<string, Site> = { 'berlayar-rise': berlayar as unknown as Site }
/** OpenStreetMap snapshots load after the page is up (they're the bulk of the data). */
const OSM: Record<string, () => Promise<Osm>> = { 'berlayar-rise': () => import('./sites/berlayar-rise.osm.json').then((m) => m.default as unknown as Osm) }
const TYPE: Record<string, string> = { '2R-1': '2-room Flexi (Type 1)', '2R-2': '2-room Flexi (Type 2)', '3R': '3-room', '4R': '4-room' }

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const hrs = (h: number) => h < 0.05 ? 'none' : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`
const clock = (t: number) => `${Math.floor(t)}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`
const km = (m: number) => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
let toastT = 0
function toast(m: string) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('on'), 2400) }

/* state, from the address, then this browser, then defaults */
const q = new URLSearchParams(location.search)
let saved: { site?: string; pick?: Pick; compare?: Pick[] } = {}
try { saved = JSON.parse(localStorage.getItem('surroundings') || '{}') } catch { /* fresh start */ }
let siteId = q.get('site') && SITES[q.get('site')!] ? q.get('site')! : saved.site && SITES[saved.site] ? saved.site : 'berlayar-rise'
let site = SITES[siteId]
const first = site.blocks[0]
let pick: Pick = q.get('block') ? { block: q.get('block')!, unit: q.get('unit') || '', storey: +(q.get('storey') || 10) } : saved.pick ?? { block: first.id, unit: first.units[0].no, storey: Math.round(first.storeys / 2) }
let compare: Pick[] = saved.compare ?? []
let future = 40, winView = false
const today = new Date()
const dayText = (d: { label: string }) => d.label === 'Today' ? 'today' : 'on the ' + d.label
const DAYS = [{ label: 'Today', m: today.getMonth() + 1, d: today.getDate() }, ...KEY_DAYS]
let dayIdx = 0, time = 15
let osm: Osm | null = null, graph: Graph | null = null
const runs = new Map<string, ReturnType<typeof fromStarts>>()

function persist() {
  try { localStorage.setItem('surroundings', JSON.stringify({ site: siteId, pick, compare })) } catch { /* private mode */ }
  const u = new URL(location.href)
  u.search = new URLSearchParams({ site: siteId, block: pick.block, unit: pick.unit, storey: String(pick.storey) }).toString()
  history.replaceState(null, '', u)
}

/* views */
const scene = createScene($('#gl') as HTMLCanvasElement)
const map = createMap($('#map'), (a) => showRoute(a))
if (!scene) $('#hint3').textContent = 'The 3D view needs WebGL. The Map tab and results still work.'

function current(): UnitPos | null {
  const b = site.blocks.find((x) => x.id === pick.block) ?? site.blocks[0]
  if (!b.units.some((u) => u.no === pick.unit)) pick.unit = b.units[0].no
  pick.block = b.id
  return unitPos(site, pick)
}

/* places and walking */
const centre = (u: UnitPos): Pt => { const fp = u.block.footprint; return [fp.reduce((s, p) => s + p[0], 0) / fp.length, fp.reduce((s, p) => s + p[1], 0) / fp.length] }
/** In-estate places from the brochure, plus OpenStreetMap's once loaded (the brochure's town-map list until then). */
const places = (): Amenity[] => osm ? [...site.amenities.filter((a) => a.local), ...osm.amenities] : site.amenities
interface Place { a: Amenity; straight: number; route: Route | null; dist: number; walkMin: number }
function walkTo(u: UnitPos, a: Amenity): Place {
  const c = centre(u), straight = Math.hypot(a.at[0] - c[0], a.at[1] - c[1])
  let route: Route | null = null
  if (graph && !a.local) {
    let run = runs.get(u.block.id)
    if (!run) {
      const estate = hull([...site.blocks.flatMap((b) => b.footprint), ...site.buildings.flatMap((b) => b.poly ?? [])])
      run = fromStarts(graph, estateStarts(graph, c, estate)); runs.set(u.block.id, run)
    }
    route = routeTo(graph, run, c, a.at)
  }
  const dist = route ? route.dist : Math.round(straight * 1.3)
  return { a, straight: Math.round(straight), route, dist, walkMin: Math.max(1, Math.round(dist / 80)) }
}
/** Nearest of a kind by walking distance (checks the 8 closest in a straight line). */
function nearest(u: UnitPos, kind: string, filter: (a: Amenity) => boolean = () => true): Place | null {
  const c = centre(u)
  const cands = places().filter((a) => a.kind === kind && filter(a)).sort((p, q2) => Math.hypot(p.at[0] - c[0], p.at[1] - c[1]) - Math.hypot(q2.at[0] - c[0], q2.at[1] - c[1])).slice(0, 8)
  return cands.map((a) => walkTo(u, a)).sort((p, q2) => p.dist - q2.dist)[0] ?? null
}
function showRoute(a: Amenity) {
  const u = current()
  if (!u) return
  const p = walkTo(u, a)
  const c = centre(u)
  if ($('#pmap').hidden) (document.querySelector('.seg [data-v=map]') as HTMLElement).click()
  map.showRoute(p.route?.line ?? [c, a.at], `${a.name}: ${km(p.dist)}, about ${p.walkMin} min walk${p.route ? '' : ' (straight line)'}`)
}

function fillPickers() {
  $<HTMLSelectElement>('#site').innerHTML = Object.entries(SITES).map(([k, s]) => `<option value="${k}"${k === siteId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
  $<HTMLSelectElement>('#block').innerHTML = site.blocks.map((b) => `<option value="${b.id}"${b.id === pick.block ? ' selected' : ''}>${b.id} · ${b.storeys} storeys</option>`).join('')
  const b = site.blocks.find((x) => x.id === pick.block)!
  $<HTMLSelectElement>('#unit').innerHTML = b.units.map((u) => `<option value="${u.no}"${u.no === pick.unit ? ' selected' : ''}>Unit ${u.no} · ${TYPE[u.type] ?? u.type}</option>`).join('')
  for (const id of ['#storey', '#storeyR']) { const el = $<HTMLInputElement>(id); el.max = String(b.storeys); if (el !== document.activeElement || id === '#storeyR') el.value = String(pick.storey) }
  $<HTMLSelectElement>('#day').innerHTML = DAYS.map((d, i) => `<option value="${i}"${i === dayIdx ? ' selected' : ''}>${d.label}</option>`).join('')
}

/* Work that only changes with the block, reserved-land height or loaded data is redone only then. */
let obsCache: { key: string; obs: ReturnType<typeof obstacles> } | null = null
const getObstacles = () => {
  const key = `${siteId}|${future}|${osm ? 1 : 0}`
  if (obsCache?.key !== key) obsCache = { key, obs: obstacles(site, future, osm) }
  return obsCache.obs
}
let shown = { future: -1, places: '' }
const walkLabel = (u: UnitPos, a: Amenity) => { const p = walkTo(u, a); return `${km(p.dist)} · ${p.walkMin} min walk${p.route ? '' : ' (estimate)'}` }

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
  const pk = `${siteId}|${u.block.id}|${graph ? 1 : 0}`
  if (shown.places !== pk) {
    shown.places = pk
    map.setAmenities(places().map((a) => ({ a, label: walkLabel(u, a) })))
    scene?.labelText((a) => walkLabel(u, a))
  }
  $('#timeLbl').textContent = `${clock(time)} ${dayText(d)}`
  $('#unitNote').textContent = `Unit #${String(u.storey).padStart(2, '0')}-${u.unit.no} is about ${Math.round(u.floorZ)} m above ground; its main windows face ${u.facing}.`
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
  const guessed = osm ? osm.buildings.filter((b) => b.a).length : 0
  let h = `<div class="sec"><h3>Block ${u.block.id}, #${String(u.storey).padStart(2, '0')}-${u.unit.no}</h3>
    <div class="kv"><span>Flat type</span><b>${TYPE[u.unit.type] ?? u.unit.type}</b></div>
    <div class="kv"><span>Height above ground</span><b>about ${Math.round(u.floorZ)} m</b></div>
    <div class="kv"><span>Main windows face</span><b>${u.facing}</b></div></div>`
  h += `<div class="sec"><h3>Sun on the main windows</h3><div class="big">${hrs(day.sunHours)} <small>direct sun ${dayText(d)}</small></div>${sunBar(day)}
    <div class="kv"><span>After 3 pm (west sun)</span><b>${hrs(day.afternoonHours)}</b></div>
    <div class="kv"><span>Year average</span><b>${hrs(yr.avgSun)} a day, ${hrs(yr.avgAfternoon)} after 3 pm</b></div>
    ${yr.days.map((k) => `<div class="kv"><span>${k.label}</span><b>${hrs(k.sunHours)}</b></div>`).join('')}
    <p class="note"><span class="pill ${westy ? 'warn' : 'good'}">${westy ? 'Afternoon sun most of the year' : 'Little afternoon sun over the year'}</span> ${westy ? 'Rooms on this side warm up in the afternoon; blinds or tinted glass help.' : 'Cooler in the afternoon on most days.'} ${bright ? '' : 'Not much direct sun: rooms stay cooler but can be dimmer.'} Direct sun only, on the side the unit faces; other windows may differ.</p></div>`
  h += `<div class="sec"><h3>View</h3><div class="big">${v.farPct}% <small>of the view clear for 300 m or more</small></div>
    <div class="kv"><span>Clear for 100 m or more</span><b>${v.openPct}%</b></div>
    <div class="kv"><span>Nearest building in front</span><b>${v.nearest ? `${esc(v.nearest.name.replace(/:.*/, ''))}, ${Math.round(v.nearest.dist)} m` : 'none within 1 km'}</b></div>
    <p class="note">Looking out across 140° at eye level. Only buildings taller than your floor block the view.${future > 0 ? ` Reserved land is assumed to get ${future}-storey blocks.` : ''} ${osm ? `Buildings around the estate are from OpenStreetMap (${guessed} of ${osm.buildings.length} have no height there and are taken as 2 storeys).` : '<b>Loading the buildings around the estate…</b>'}</p></div>`
  h += `<div class="sec"><h3>Roads and noise</h3>${roads.slice(0, 4).map((r) => `<div class="kv"><span>${esc(r.name)}${r.faces ? ' <span class="pill warn">faces it</span>' : ''}</span><b>${r.dist} m</b></div>`).join('')}
    <p class="note">Distance from the window to the road's edge, counting height. ${roads[0].dist < 80 && roads[0].faces ? 'Close to a road and facing it, so expect traffic noise; check at different times.' : 'Visit at peak hour to judge noise.'} The Circle Line runs underground here.</p></div>`
  const kinds: [string, string][] = [['mrt', 'MRT'], ['bus', 'Bus interchange'], ['shops', 'Shops and food'], ['park', 'Park'], ['community', 'Community'], ['health', 'Clinic or hospital']]
  const near = kinds.map(([k]) => nearest(u, k)).filter((x): x is Place => !!x)
  h += `<div class="sec"><h3>Nearby</h3>${near.map((x) => `<button type="button" class="am link" data-am="${esc(x.a.name)}" title="Show the walking route on the map"><i aria-hidden="true" style="background:${KIND[x.a.kind].c}">${esc(KIND[x.a.kind].l)}</i><span>${esc(x.a.name)}</span><b>${km(x.dist)} · ${x.walkMin} min</b></button>`).join('')}
    <p class="note">${graph ? 'Walking distance from the block: across the estate (its paths aren\'t mapped yet, so straight line plus 30%), then along paths and streets (OpenStreetMap). Pick one to see the route on the map.' : 'Walking estimates for now (straight line plus 30%); routes along real paths load in a moment.'} 80 m a minute.</p></div>`
  // Primary schools by straight-line distance: Primary 1 registration gives priority within 1 km and 2 km.
  const c = centre(u), prim = places().filter((a) => a.kind === 'school' && (a.sub === 'primary' || /primary/i.test(a.name))).map((a) => ({ a, d: Math.round(Math.hypot(a.at[0] - c[0], a.at[1] - c[1])) })).filter((x) => x.d <= 2000).sort((p, q2) => p.d - q2.d)
  h += `<div class="sec"><h3>Primary schools within 2 km</h3>${prim.length ? prim.map((x) => `<button type="button" class="am link" data-am="${esc(x.a.name)}" title="Show the walking route on the map"><i aria-hidden="true" style="background:${KIND.school.c}">S</i><span>${esc(x.a.name)}</span><b>${x.d <= 1000 ? 'within 1 km' : '1–2 km'} · ${km(x.d)}</b></button>`).join('') : '<p class="note" style="margin:0">None found.</p>'}
    <p class="note">Primary 1 registration gives priority to homes within 1 km and 2 km of a school. These are rough straight-line distances to the school's map point; the official distance is measured by SLA from your address (OneMap's school query).</p></div>`
  h += compareHtml(obs)
  h += `<div class="sec"><p class="note" style="margin:0">Estate: ${esc(site.source)}. ${osm ? `Surroundings: ${esc(osm.attribution)}, snapshot of ${osm.fetched}.` : ''} Blocks are placed to within a few metres; storeys are taken as ${site.storeyM} m. Heights of future buildings on reserved land are not known. A planning aid, not a survey.</p></div>`
  $('#results').innerHTML = h
}

const cmpCache = new Map<string, { sun: number; pm: number; far: number; road: number; mrt: number }>()
function compareHtml(obs: ReturnType<typeof obstacles>) {
  const rows = compare.map((p) => unitPos(site, p)).filter((u): u is UnitPos => !!u)
  if (!rows.length) return `<div class="sec"><h3>Compare units</h3><p class="note" style="margin:0">Add up to 3 units to compare their sun, view and distances side by side.</p></div>`
  const y = today.getFullYear(), data = rows.map((u) => {
    const key = `${obsCache?.key}|${graph ? 1 : 0}|${u.block.id}|${u.unit.no}|${u.storey}`
    let c = cmpCache.get(key)
    if (!c) {
      const yr = yearSun(site, u, obs, y), v = view(u, obs), r = roadDistances(site, u)[0], mrt = nearest(u, 'mrt')
      c = { sun: yr.avgSun, pm: yr.avgAfternoon, far: v.farPct, road: r.dist, mrt: mrt ? mrt.walkMin : 99 }
      cmpCache.set(key, c)
    }
    return { u, ...c }
  })
  const best = (k: keyof (typeof data)[number], hi: boolean) => { const vals = data.map((x) => x[k] as number); return hi ? Math.max(...vals) : Math.min(...vals) }
  const cell = (v: number, b: number, s: string) => `<td class="${data.length > 1 && v === b ? 'best' : ''}">${s}</td>`
  const bs = best('sun', true), bp = best('pm', false), bf = best('far', true), br = best('road', true), bm = best('mrt', false)
  return `<div class="sec"><h3>Compare units</h3><div style="overflow:auto"><table class="cmp"><tr><th></th>${data.map((x, i) => `<th>${x.u.block.id} #${String(x.u.storey).padStart(2, '0')}-${x.u.unit.no}<br><button class="btn rm" data-rm="${i}" aria-label="Remove ${x.u.block.id} #${String(x.u.storey).padStart(2, '0')}-${x.u.unit.no} from the comparison">×</button></th>`).join('')}</tr>
    <tr><td>Type</td>${data.map((x) => `<td>${TYPE[x.u.unit.type]?.replace(' Flexi', '') ?? x.u.unit.type}</td>`).join('')}</tr>
    <tr><td>Faces</td>${data.map((x) => `<td>${x.u.facing}</td>`).join('')}</tr>
    <tr><td>Height</td>${data.map((x) => `<td>${Math.round(x.u.floorZ)} m</td>`).join('')}</tr>
    <tr><td>Sun a day (year avg)</td>${data.map((x) => cell(x.sun, bs, hrs(x.sun))).join('')}</tr>
    <tr><td>After 3 pm</td>${data.map((x) => cell(x.pm, bp, hrs(x.pm))).join('')}</tr>
    <tr><td>View clear 300 m+</td>${data.map((x) => cell(x.far, bf, x.far + '%')).join('')}</tr>
    <tr><td>Nearest road</td>${data.map((x) => cell(x.road, br, x.road + ' m')).join('')}</tr>
    <tr><td>Walk to MRT</td>${data.map((x) => cell(x.mrt, bm, x.mrt < 99 ? x.mrt + ' min' : '—')).join('')}</tr></table></div>
    <p class="note">Highlighted: best in each row (more sun, less afternoon sun, more view, further from roads, closer to the MRT).</p></div>`
}

/* controls */
async function loadOsm() {
  osm = null; graph = null; runs.clear()
  const load = OSM[siteId]
  if (!load) return
  try {
    const o = await load()
    if (site !== SITES[siteId]) return
    osm = o; graph = buildGraph(o.walk)
    scene?.setOsm(o)
    update()
  } catch { toast('Could not load the buildings around the estate') }
}
$('#site').addEventListener('change', (e) => { siteId = (e.target as HTMLSelectElement).value; site = SITES[siteId]; compare = []; shown = { future: -1, places: '' }; pick = { block: site.blocks[0].id, unit: site.blocks[0].units[0].no, storey: 10 }; scene?.setSite(site); map.setSite(site); update(); loadOsm() })
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
  $('#timeLbl').textContent = `${clock(time)} ${dayText(d)}`
  if (now) now.style.left = pct(time)
})
$('#future').addEventListener('change', (e) => { future = +(e.target as HTMLSelectElement).value; update() })
$('#addCmp').addEventListener('click', () => {
  if (compare.some((p) => p.block === pick.block && p.unit === pick.unit && p.storey === pick.storey)) { toast('Already in the comparison'); return }
  compare = [...compare, { ...pick }].slice(-3); update(); toast('Added to the comparison')
})
$('#results').addEventListener('click', (e) => {
  const t = e.target as HTMLElement, b = t.closest<HTMLElement>('[data-rm]')
  if (b) { compare.splice(+b.dataset.rm!, 1); update(); return }
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

scene?.onHeading((deg) => { $('#compass').style.transform = `rotate(${-deg}deg)` })
scene?.setSite(site)
map.setSite(site)
update()
loadOsm()
