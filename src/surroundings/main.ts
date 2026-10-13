/** Surroundings page: pick a unit, see its view, sun, roads and amenities, and compare units. */
import { amenityDistances, KEY_DAYS, obstacles, roadDistances, sunDay, unitPos, view, yearSun, type Pick, type Site, type UnitPos } from './analysis'
import { createMap, KIND } from './map'
import { createScene } from './scene'
import berlayar from './sites/berlayar-rise.json'

const SITES: Record<string, Site> = { 'berlayar-rise': berlayar as unknown as Site }
const TYPE: Record<string, string> = { '2R-1': '2-room Flexi (Type 1)', '2R-2': '2-room Flexi (Type 2)', '3R': '3-room', '4R': '4-room' }

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const hrs = (h: number) => h < 0.05 ? 'none' : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`
const clock = (t: number) => `${Math.floor(t)}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`
function toast(m: string) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2400) }

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
const DAYS = [{ label: 'Today', m: today.getMonth() + 1, d: today.getDate() }, ...KEY_DAYS]
let dayIdx = 0, time = 15

function persist() {
  try { localStorage.setItem('surroundings', JSON.stringify({ site: siteId, pick, compare })) } catch { /* private mode */ }
  const u = new URL(location.href)
  u.search = new URLSearchParams({ site: siteId, block: pick.block, unit: pick.unit, storey: String(pick.storey) }).toString()
  history.replaceState(null, '', u)
}

/* views */
const scene = createScene($('#gl') as HTMLCanvasElement)
const map = createMap($('#map') as unknown as SVGSVGElement)
if (!scene) $('#hint3').textContent = 'The 3D view needs WebGL. The Map tab and results still work.'

function current(): UnitPos | null {
  const b = site.blocks.find((x) => x.id === pick.block) ?? site.blocks[0]
  if (!b.units.some((u) => u.no === pick.unit)) pick.unit = b.units[0].no
  pick.block = b.id
  return unitPos(site, pick)
}

function fillPickers() {
  $<HTMLSelectElement>('#site').innerHTML = Object.entries(SITES).map(([k, s]) => `<option value="${k}"${k === siteId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
  $<HTMLSelectElement>('#block').innerHTML = site.blocks.map((b) => `<option value="${b.id}"${b.id === pick.block ? ' selected' : ''}>Block ${b.id} (${b.storeys} storeys)</option>`).join('')
  const b = site.blocks.find((x) => x.id === pick.block)!
  $<HTMLSelectElement>('#unit').innerHTML = b.units.map((u) => `<option value="${u.no}"${u.no === pick.unit ? ' selected' : ''}>#xx-${u.no} · ${TYPE[u.type] ?? u.type}</option>`).join('')
  for (const id of ['#storey', '#storeyR']) { const el = $<HTMLInputElement>(id); el.max = String(b.storeys); el.value = String(pick.storey) }
  $<HTMLSelectElement>('#day').innerHTML = DAYS.map((d, i) => `<option value="${i}"${i === dayIdx ? ' selected' : ''}>${d.label}</option>`).join('')
}

function update() {
  const u = current()
  if (!u) return
  pick.storey = u.storey
  fillPickers()
  persist()
  const obs = obstacles(site, future), d = DAYS[dayIdx], y = today.getFullYear()
  scene?.setUnit(u); scene?.setFuture(future); scene?.setSun(y, d.m, d.d, time)
  map.setUnit(u); map.setFuture(future)
  $('#timeLbl').textContent = `${clock(time)} on ${d.label === 'Today' ? 'today' : 'the ' + d.label}`
  $('#unitNote').textContent = `Unit #${String(u.storey).padStart(2, '0')}-${u.unit.no}: floor about ${Math.round(u.floorZ)} m up, main windows face ${u.facing}.`
  renderResults(u, obs)
}

function sunBar(day: ReturnType<typeof sunDay>) {
  const W = 300, x = (t: number) => (t - 6.5) / 13 * W
  return `<svg class="tl" viewBox="0 0 ${W} 34" preserveAspectRatio="none" aria-label="Direct sun through the day">${day.slots.map((s) => `<rect x="${x(s.t)}" y="6" width="${W / 78 + 0.3}" height="16" fill="${s.lit ? (s.t >= 15 ? '#e8833a' : '#f2c14e') : 'var(--line)'}"><title>${clock(s.t)}: ${s.lit ? 'direct sun' : esc(s.why ?? '')}</title></rect>`).join('')}
    ${[7, 10, 13, 16, 19].map((t) => `<text x="${x(t)}" y="33" font-size="8" text-anchor="middle" fill="var(--ink2)">${t > 12 ? t - 12 + 'pm' : t + (t === 12 ? 'pm' : 'am')}</text>`).join('')}<line x1="${x(15)}" y1="2" x2="${x(15)}" y2="24" stroke="var(--ink2)" stroke-dasharray="2 2"/></svg>`
}

function renderResults(u: UnitPos, obs: ReturnType<typeof obstacles>) {
  const d = DAYS[dayIdx], y = today.getFullYear(), day = sunDay(site, u, y, d.m, d.d, obs), yr = yearSun(site, u, obs, y), v = view(u, obs), roads = roadDistances(site, u), am = amenityDistances(site, u)
  const westy = yr.avgAfternoon >= 1.5, bright = yr.avgSun >= 2
  const near = (k: string) => am.find((a) => a.a.kind === k)
  let h = `<div class="sec"><h3>Block ${u.block.id}, #${String(u.storey).padStart(2, '0')}-${u.unit.no}</h3>
    <div class="kv"><span>Flat type</span><b>${TYPE[u.unit.type] ?? u.unit.type}</b></div>
    <div class="kv"><span>Floor height</span><b>about ${Math.round(u.floorZ)} m</b></div>
    <div class="kv"><span>Main windows face</span><b>${u.facing}</b></div></div>`
  h += `<div class="sec"><h3>Sun on the main windows</h3><div class="big">${hrs(day.sunHours)} <small>direct sun ${d.label === 'Today' ? 'today' : 'on the ' + d.label}</small></div>${sunBar(day)}
    <div class="kv"><span>After 3 pm (west sun)</span><b>${hrs(day.afternoonHours)}</b></div>
    <div class="kv"><span>Year average</span><b>${hrs(yr.avgSun)} a day, ${hrs(yr.avgAfternoon)} after 3 pm</b></div>
    ${yr.days.map((k) => `<div class="kv"><span>${k.label}</span><b>${hrs(k.sunHours)}</b></div>`).join('')}
    <p class="note"><span class="pill ${westy ? 'warn' : 'good'}">${westy ? 'Afternoon sun most of the year' : 'Little afternoon sun over the year'}</span> ${westy ? 'Rooms on this side warm up in the afternoon; blinds or tinted glass help.' : 'Cooler in the afternoon on most days.'} ${bright ? '' : 'Not much direct sun: rooms stay cooler but can be dimmer.'} Direct sun only, on the side the unit faces; other windows may differ.</p></div>`
  h += `<div class="sec"><h3>View</h3><div class="big">${v.farPct}% <small>of the view clear for 300 m or more</small></div>
    <div class="kv"><span>Clear for 100 m or more</span><b>${v.openPct}%</b></div>
    <div class="kv"><span>Nearest building in front</span><b>${v.nearest ? `${esc(v.nearest.name.replace(/:.*/, ''))}, ${Math.round(v.nearest.dist)} m` : 'none within 1 km'}</b></div>
    <p class="note">Looking out across 140° at eye level. Only buildings taller than your floor block the view.${future > 0 ? ` Reserved land is assumed to get ${future}-storey blocks.` : ''} <b>Only this estate and its reserved land are modelled</b>: existing buildings beyond the roads (for example the condominiums north of Telok Blangah Road) aren't, so a view that looks clear here may not be.</p></div>`
  h += `<div class="sec"><h3>Roads and noise</h3>${roads.slice(0, 4).map((r) => `<div class="kv"><span>${esc(r.name)}${r.faces ? ' <span class="pill warn">faces it</span>' : ''}</span><b>${r.dist} m</b></div>`).join('')}
    <p class="note">Distance from the window to the road's edge, counting height. ${roads[0].dist < 80 && roads[0].faces ? 'Close to a road and facing it, so expect traffic noise; check at different times.' : 'Visit at peak hour to judge noise.'} The Circle Line runs underground here.</p></div>`
  h += `<div class="sec"><h3>Nearby</h3>${['mrt', 'bus', 'school', 'park', 'shops', 'community', 'health'].map((k) => near(k)).filter(Boolean).map((x) => `<div class="am"><i style="background:${KIND[x!.a.kind].c}">${esc(KIND[x!.a.kind].l)}</i><span>${esc(x!.a.name)}</span><b>${x!.dist < 1000 ? x!.dist + ' m' : (x!.dist / 1000).toFixed(1) + ' km'} · ${x!.walkMin} min</b></div>`).join('')}
    <p class="note">Nearest of each kind. Straight-line distance from the block; walking times assume a 30% longer route at 80 m a minute. The Map tab shows more.</p></div>`
  h += compareHtml(obs)
  h += `<div class="sec"><p class="note" style="margin:0">From ${esc(site.source)}. Blocks are placed to within a few metres; storeys are taken as ${site.storeyM} m. Heights of future buildings around the estate are not known, and existing buildings beyond the estate's roads aren't modelled, so the view out is only part of the picture. A planning aid, not a survey.</p></div>`
  $('#results').innerHTML = h
}

function compareHtml(obs: ReturnType<typeof obstacles>) {
  const rows = compare.map((p) => unitPos(site, p)).filter((u): u is UnitPos => !!u)
  if (!rows.length) return `<div class="sec"><h3>Compare units</h3><p class="note" style="margin:0">Add up to 3 units to compare their sun, view and distances side by side.</p></div>`
  const y = today.getFullYear(), data = rows.map((u) => {
    const yr = yearSun(site, u, obs, y), v = view(u, obs), r = roadDistances(site, u)[0], mrt = amenityDistances(site, u).find((a) => a.a.kind === 'mrt')!
    return { u, sun: yr.avgSun, pm: yr.avgAfternoon, far: v.farPct, road: r.dist, mrt: mrt.walkMin }
  })
  const best = (k: keyof (typeof data)[number], hi: boolean) => { const vals = data.map((x) => x[k] as number); return hi ? Math.max(...vals) : Math.min(...vals) }
  const cell = (v: number, b: number, s: string) => `<td class="${data.length > 1 && v === b ? 'best' : ''}">${s}</td>`
  const bs = best('sun', true), bp = best('pm', false), bf = best('far', true), br = best('road', true), bm = best('mrt', false)
  return `<div class="sec"><h3>Compare units</h3><div style="overflow:auto"><table class="cmp"><tr><th></th>${data.map((x, i) => `<th>${x.u.block.id} #${String(x.u.storey).padStart(2, '0')}-${x.u.unit.no}<br><button class="btn" data-rm="${i}" style="padding:0 6px">×</button></th>`).join('')}</tr>
    <tr><td>Type</td>${data.map((x) => `<td>${TYPE[x.u.unit.type]?.replace(' Flexi', '') ?? x.u.unit.type}</td>`).join('')}</tr>
    <tr><td>Faces</td>${data.map((x) => `<td>${x.u.facing}</td>`).join('')}</tr>
    <tr><td>Floor height</td>${data.map((x) => `<td>${Math.round(x.u.floorZ)} m</td>`).join('')}</tr>
    <tr><td>Sun a day (year avg)</td>${data.map((x) => cell(x.sun, bs, hrs(x.sun))).join('')}</tr>
    <tr><td>After 3 pm</td>${data.map((x) => cell(x.pm, bp, hrs(x.pm))).join('')}</tr>
    <tr><td>View clear 300 m+</td>${data.map((x) => cell(x.far, bf, x.far + '%')).join('')}</tr>
    <tr><td>Nearest road</td>${data.map((x) => cell(x.road, br, x.road + ' m')).join('')}</tr>
    <tr><td>Walk to MRT</td>${data.map((x) => cell(x.mrt, bm, x.mrt + ' min')).join('')}</tr></table></div>
    <p class="note">Highlighted: best in each row (more sun, less afternoon sun, more view, further from roads, closer to the MRT).</p></div>`
}

/* controls */
$('#site').addEventListener('change', (e) => { siteId = (e.target as HTMLSelectElement).value; site = SITES[siteId]; compare = []; pick = { block: site.blocks[0].id, unit: site.blocks[0].units[0].no, storey: 10 }; scene?.setSite(site); map.setSite(site); update() })
$('#block').addEventListener('change', (e) => { pick.block = (e.target as HTMLSelectElement).value; update(); scene?.reset() })
$('#unit').addEventListener('change', (e) => { pick.unit = (e.target as HTMLSelectElement).value; update() })
for (const id of ['#storey', '#storeyR']) $(id).addEventListener('input', (e) => { const v = parseInt((e.target as HTMLInputElement).value); if (isFinite(v)) { pick.storey = v; update() } })
$('#day').addEventListener('change', (e) => { dayIdx = +(e.target as HTMLSelectElement).value; update() })
$('#time').addEventListener('input', (e) => { time = +(e.target as HTMLInputElement).value; const d = DAYS[dayIdx]; scene?.setSun(today.getFullYear(), d.m, d.d, time); $('#timeLbl').textContent = `${clock(time)} on ${d.label === 'Today' ? 'today' : 'the ' + d.label}` })
$('#future').addEventListener('change', (e) => { future = +(e.target as HTMLSelectElement).value; update() })
$('#addCmp').addEventListener('click', () => {
  if (compare.some((p) => p.block === pick.block && p.unit === pick.unit && p.storey === pick.storey)) { toast('Already in the comparison'); return }
  compare = [...compare, { ...pick }].slice(-3); update(); toast('Added to the comparison')
})
$('#results').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-rm]'); if (b) { compare.splice(+b.dataset.rm!, 1); update() } })
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
