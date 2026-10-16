/** Upcoming sites page: what's around a site known only from HDB's town map (no blocks yet). */
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fromLatLng, lineDist, toLatLng, type Amenity, type Pt, type Site } from './analysis'
import { across, areaM2, centroid, edgeDist, farDist, noiseSources, primarySchools, undergroundNear, type Area, type AreaOsm } from './area'
import { AREA_OSM, AREAS } from './areaList'
import { KIND } from './map'
import { bindPlaces, placesHtml, type MyPlace, type Reach } from './places'
import { loadResale, resaleHtml, summarise, type ResaleFile } from './resale'
import { buildGraph, fromStarts, nearestNodes, routeTo, type Graph } from './walk'
import { LAUNCHES } from '../config/launches'
import { FLAT_TYPES } from '../ui/labels'

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const km = (m: number) => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
let toastT = 0
function toast(m: string) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('on'), 2400) }

const q = new URLSearchParams(location.search)
let area = AREAS.find((a) => a.id === q.get('site')) ?? AREAS[0]
interface Ctx { osm: AreaOsm; graph: Graph; run: ReturnType<typeof fromStarts> }
const ctxs = new Map<string, Promise<Ctx>>()
/** Walks start anywhere on the site's edge (a gate could be on any side until the blocks are known). */
function loadCtx(a: Area): Promise<Ctx> {
  let p = ctxs.get(a.id)
  if (!p) {
    p = AREA_OSM[a.id]().then((osm) => {
      const graph = buildGraph(osm.walk), starts: { i: number; d: number }[] = []
      for (let i = 0; i < graph.adj.length; i++) {
        if (!graph.adj[i].length) continue
        const d = edgeDist([graph.xy[2 * i], graph.xy[2 * i + 1]], a.outline)
        if (d <= 40) starts.push({ i, d })
      }
      return { osm, graph, run: fromStarts(graph, starts.length ? starts : nearestNodes(graph, centroid(a.outline), 4, 400)) }
    })
    p.catch(() => ctxs.delete(a.id))
    ctxs.set(a.id, p)
  }
  return p
}
const preview = (a: Area) => LAUNCHES.find((l) => l.id === a.launch)?.previews?.find((v) => v.area === a.id)
const launchName = (a: Area) => LAUNCHES.find((l) => l.id === a.launch)?.name ?? a.launch

/* map */
const ll = (p: Pt) => toLatLng({ geo: area.geo } as Site, p)
const map = L.map($('#map'), { zoomControl: true, minZoom: 12, maxZoom: 19 })
const onemap = L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', {
  minZoom: 11, maxZoom: 19,
  attribution: '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> © contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>',
})
const osmTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' })
onemap.addTo(map)
const siteL = L.layerGroup().addTo(map), noiseL = L.layerGroup().addTo(map), amenL = L.layerGroup().addTo(map), routeL = L.layerGroup().addTo(map)
L.control.layers({ OneMap: onemap, OpenStreetMap: osmTiles }, { 'Roads and tracks to listen for': noiseL, Places: amenL, 'Walking route': routeL }, { collapsed: true }).addTo(map)
L.control.scale({ metric: true, imperial: false }).addTo(map)

/** The outline grown by `r` metres (its corners' circles, wrapped): every point within `r` of the site. */
function grown(outline: Pt[], r: number): Pt[] {
  const pts: Pt[] = outline.flatMap((p) => Array.from({ length: 24 }, (_, k): Pt => [p[0] + r * Math.cos(k * Math.PI / 12), p[1] + r * Math.sin(k * Math.PI / 12)]))
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Pt[] = [], hi: Pt[] = []
  for (const p of s) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p) }
  for (const p of s.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p) }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)]
}
function drawSite() {
  siteL.clearLayers(); noiseL.clearLayers(); amenL.clearLayers(); routeL.clearLayers()
  for (const [r, t] of [[1000, '1 km'], [2000, '2 km']] as const) {
    const g = grown(area.outline, r)
    L.polygon(g.map(ll), { color: '#17707a', weight: 1.5, dashArray: '6 5', fill: false, interactive: false }).addTo(siteL)
    const top = g.reduce((a, b) => (b[1] < a[1] ? b : a))
    L.tooltip({ permanent: true, direction: 'center', className: 'ring' }).setLatLng(ll(top)).setContent(`${t} from the site`).addTo(siteL)
  }
  L.polygon(area.outline.map(ll), { color: '#b58a00', weight: 2, fillColor: '#f3d23a', fillOpacity: 0.55 }).bindTooltip(esc(area.name)).addTo(siteL)
  map.fitBounds(L.latLngBounds(grown(area.outline, 700).map(ll)))
}
function drawPlaces(c: Ctx, list: { a: Amenity; label: string }[]) {
  amenL.clearLayers()
  for (const { a, label } of list) {
    const k = KIND[a.kind] ?? KIND.community
    L.marker(ll(a.at), { icon: L.divIcon({ className: 'amk', html: `<i style="background:${k.c}">${esc(k.l)}</i>`, iconSize: [20, 20], iconAnchor: [10, 10] }), title: a.name })
      .bindTooltip(`${esc(a.name)}<br><small>${esc(label)}</small>`).on('click', () => showRoute(c, a)).addTo(amenL)
  }
}
function drawNoise(c: Ctx) {
  noiseL.clearLayers()
  const near = new Set(noiseSources(area, c.osm).map((n) => `${n.kind}|${n.name}`))
  const pts = (p: number[]) => { const out: Pt[] = []; for (let i = 0; i < p.length; i += 2) out.push([p[i], p[i + 1]]); return out.map(ll) }
  for (const r of c.osm.roads ?? []) if (r.k !== 'minor' && near.has(`${r.k}|${r.n ?? (r.k === 'expressway' ? 'Expressway' : 'Main road')}`)) L.polyline(pts(r.p), { color: r.k === 'expressway' ? '#c0392b' : '#e8833a', weight: 4, opacity: 0.7 }).bindTooltip(esc(r.n ?? 'Road')).addTo(noiseL)
  for (const r of c.osm.rail ?? []) if (!r.u && near.has(`rail|${(r.n ?? 'Railway').replace(/\s*\(.*\)$/, '')}${r.f ? ' (being built)' : ''}`)) L.polyline(pts(r.p), { color: '#7a3fa0', weight: 4, opacity: 0.7, dashArray: '8 6' }).bindTooltip(esc(r.n ?? 'Railway')).addTo(noiseL)
}

/* walking */
interface Walk { dist: number; walkMin: number; line: Pt[] | null }
function walk(c: Ctx, a: Amenity): Walk {
  const r = routeTo(c.graph, c.run, centroid(area.outline), a.at)
  if (!r) { const d = Math.round(edgeDist(a.at, area.outline) * 1.3); return { dist: d, walkMin: Math.max(1, Math.round(d / 80)), line: null } }
  // The route starts at the path nearest the site: draw it from the site's edge, not its middle.
  const line = r.line.slice(1)
  line.unshift(lineDist(line[0], [...area.outline, area.outline[0]]).at)
  return { dist: r.dist, walkMin: r.walkMin, line }
}
function showRoute(c: Ctx, a: Amenity) {
  const w = walk(c, a)
  routeL.clearLayers()
  const line = w.line ?? [lineDist(a.at, [...area.outline, area.outline[0]]).at, a.at]
  L.polyline(line.map(ll), { color: '#17707a', weight: 5, opacity: 0.85, dashArray: w.line ? undefined : '2 9' }).bindTooltip(esc(`${a.name}: ${km(w.dist)}, about ${w.walkMin} min walk${w.line ? '' : ' (straight line)'}`), { sticky: true }).addTo(routeL)
  map.fitBounds(L.latLngBounds([...line, ...area.outline].map(ll)).pad(0.2))
  // On a phone the map sits above the results: bring it into view to show the route.
  const stage = $('#stage'), r = stage.getBoundingClientRect()
  if (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) < r.height * 0.6) stage.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
/** The nearest exit of each MRT station, by walking distance, nearest station first. */
function stations(c: Ctx, open = false, reach = 2000): { a: Amenity; w: Walk }[] {
  const best = new Map<string, { a: Amenity; w: Walk }>()
  for (const a of c.osm.amenities.filter((x) => x.kind === 'mrt' && (!open || x.sub !== 'future'))) {
    if (edgeDist(a.at, area.outline) > reach + 200) continue
    const name = a.name.replace(/,.*$/, ''), w = walk(c, a), o = best.get(name)
    if (!o || w.dist < o.w.dist) best.set(name, { a, w })
  }
  // Stations more than about 25 minutes' walk away aren't the site's station.
  return [...best.values()].filter((x) => x.w.dist <= reach).sort((x, y) => x.w.dist - y.w.dist)
}
function nearestOf(c: Ctx, kind: string): { a: Amenity; w: Walk } | null {
  // A playground tagged as a park isn't the park people mean.
  const cands = c.osm.amenities.filter((a) => a.kind === kind && !(kind === 'park' && /playground/i.test(a.name))).sort((x, y) => edgeDist(x.at, area.outline) - edgeDist(y.at, area.outline)).slice(0, 6)
  return cands.map((a) => ({ a, w: walk(c, a) })).sort((x, y) => x.w.dist - y.w.dist)[0] ?? null
}

/** When every station listed is still being built, the nearest one open today. */
function openNote(c: Ctx, listed: { a: Amenity }[]) {
  if (listed.slice(0, 3).some((s) => s.a.sub !== 'future')) return ''
  const o = stations(c, true, 4000)[0]
  return o ? `None of these is open yet; the nearest open station is ${esc(o.a.name.replace(/,.*$/, ''))}, ${km(o.w.dist)} (${o.w.walkMin} min) away. ` : ''
}

/* results */
/** A place's distance from the nearest and farthest edge of the site (0 if it's on the site). */
function reachOf(p: MyPlace): Reach {
  const at = fromLatLng({ geo: area.geo } as Site, p.lat, p.lon)
  return { near: Math.round(edgeDist(at, area.outline)), far: Math.round(farDist(at, area.outline)) }
}
const row = (a: Amenity, right: string, title = 'Show the walking route on the map') =>
  `<button type="button" class="am link" data-am="${esc(a.name)}" title="${title}"><i aria-hidden="true" style="background:${(KIND[a.kind] ?? KIND.community).c}">${esc((KIND[a.kind] ?? KIND.community).l)}</i><span>${esc(a.name)}</span><b>${right}</b></button>`
function siteHtml() {
  const v = preview(area), size = areaM2(area.outline), w = across(area.outline)
  const label = (t: string) => FLAT_TYPES.find((x) => x.value === t)?.label ?? t
  return `<div class="sec"><h3>${esc(area.name)}</h3>
    <div class="kv"><span>Launch</span><b>${esc(launchName(area))}</b></div>
    ${v ? `<div class="kv"><span>Flats</span><b>${[...Object.entries(v.flats).map(([t, n]) => `${n!.toLocaleString()} ${esc(label(t))}`), ...(v.cca ? [`${v.cca} Community Care Apartment`] : [])].join('<br>')}</b></div>` : ''}
    <div class="kv"><span>Site</span><b>about ${(size / 1e4).toFixed(1)} ha, ${km(w)} across</b></div>
    ${v?.note ? `<p class="note">${esc(v.note)}.</p>` : ''}
    <p class="note">HDB hasn't shown the blocks yet, so distances here are from the edge of the site. A block on the far side could be up to ${km(w)} (about ${Math.max(1, Math.round(w / 80))} min) further. Units, views and sun come once the brochure is out.</p></div>`
}
function render(c: Ctx | null) {
  let h = siteHtml()
  if (!c) { $('#results').innerHTML = h + '<div class="sec"><p class="note" style="margin:0"><b>Loading what\'s around the site…</b></p></div>'; return }
  const st = stations(c)
  h += `<div class="sec"><h3>MRT</h3>${st.length ? st.slice(0, 3).map((s) => row(s.a, `${km(s.w.dist)} · ${s.w.walkMin} min`)).join('') : '<p class="note" style="margin:0">No station within a 2 km walk.</p>'}
    <p class="note">${openNote(c, st)}Walking from the nearest edge of the site to the station's nearest exit${st.slice(0, 3).some((s) => s.a.sub === 'future') ? ' (a station being built has no exits mapped yet, so to its middle)' : ''}, along paths and streets (OpenStreetMap), at 80 m a minute. Pick one to see the route.</p></div>`
  const kinds: [string, string][] = [['bus', 'Bus interchange'], ['shops', 'Shops and food'], ['park', 'Park'], ['community', 'Community'], ['health', 'Clinic or hospital']]
  const near = kinds.map(([k]) => nearestOf(c, k)).filter((x): x is { a: Amenity; w: Walk } => !!x)
  h += `<div class="sec"><h3>Nearby</h3>${near.map((x) => row(x.a, `${km(x.w.dist)} · ${x.w.walkMin} min`)).join('')}
    <p class="note">Shops, food and facilities planned inside the site itself aren't listed here; see the flat details above.</p></div>`
  const prim = primarySchools(area, c.osm)
  const band = (s: (typeof prim)[number]) => s.within1 === 'all' ? '<span class="pill good">within 1 km</span>' : s.within1 === 'part' ? '<span class="pill warn">partly within 1 km</span>' : s.within2 === 'all' ? '1–2 km' : 'partly within 2 km'
  h += `<div class="sec"><h3>Primary schools within 2 km</h3>${prim.length ? prim.map((s) => row(s.a, `${band(s)} · ${km(s.near)}`, `${s.a.name}: ${km(s.near)} from the nearest edge of the site, ${km(s.far)} from the farthest corner`)).join('') : '<p class="note" style="margin:0">None found.</p>'}
    <p class="note">Primary 1 registration gives priority to homes within 1 km and 2 km of a school. <b>Within 1 km</b>: every part of the site is, so every block will be. <b>Partly within 1 km</b>: only blocks on the near side may be within 1 km; check the brochure's site plan and OneMap's school query once addresses are out. Straight-line distances to the school's map point, shown from the nearest edge of the site.</p></div>`
  const noise = noiseSources(area, c.osm), under = undergroundNear(area, c.osm)
  const what = { expressway: 'expressway', major: 'main road', rail: 'train tracks above ground' } as const
  h += `<div class="sec"><h3>Roads and trains to listen for</h3>${noise.length ? noise.slice(0, 6).map((n) => `<div class="kv"><span>${esc(n.name)} <small style="color:var(--ink2)">(${what[n.kind]}, ${n.side} side)</small>${n.kind !== 'major' && n.dist < 100 ? ' <span class="pill warn">close</span>' : ''}</span><b>${n.dist ? `${n.dist} m` : 'next to it'}</b></div>`).join('') : '<p class="note" style="margin:0">No expressway, main road or above-ground train track within 300 m.</p>'}
    ${noise.length ? `<p class="note key">On the map: ${[noise.some((n) => n.kind === 'expressway') && '<i style="background:#c0392b"></i>expressway', noise.some((n) => n.kind === 'major') && '<i style="background:#e8833a"></i>main road', noise.some((n) => n.kind === 'rail') && '<i class="dash"></i>train tracks'].filter(Boolean).join(' ')}</p>` : ''}
    <p class="note">The closest a block could be, from the edge of the site. ${noise.some((n) => n.kind !== 'major' && n.dist < 100) ? 'Blocks on that side will hear it, more so on upper floors facing it; once the site plan is out, see which stacks face it. ' : ''}Visit at peak hour${noise.some((n) => n.kind === 'rail') ? ', and when trains run early in the morning and late at night' : ''}.${under.map((n) => ` The ${esc(n)} runs underground nearby, so it adds no train noise.`).join('')}</p></div>`
  const rf = resaleOf.get(area.id) ?? null
  h += resaleHtml(rf, rf ? summarise(rf.rows, (x) => edgeDist(x.at, area.outline)) : [], 'the edge of the site')
  h += placesHtml(ll(centroid(area.outline)), reachOf, true)
  h += `<div class="sec"><p class="note" style="margin:0">Site: ${esc(area.source)}, to within about 20 m. Surroundings: ${esc(c.osm.attribution)}, snapshot of ${c.osm.fetched}. A planning aid, not a survey.</p></div>`
  $('#results').innerHTML = h
}

let shownCtx: Ctx | null = null
const resaleOf = new Map<string, ResaleFile | null>()
async function open(a: Area) {
  if (!resaleOf.has(a.id)) { resaleOf.set(a.id, null); loadResale(a.id)?.then((f) => { resaleOf.set(a.id, f); if (area === a && shownCtx) render(shownCtx) }, () => resaleOf.delete(a.id)) }
  area = a
  const u = new URL(location.href); u.search = new URLSearchParams({ site: a.id }).toString(); history.replaceState(null, '', u)
  $<HTMLSelectElement>('#site').value = a.id
  drawSite(); shownCtx = null; render(null)
  let c: Ctx
  try { c = await loadCtx(a) } catch { toast('Could not load what\'s around the site'); return }
  if (area !== a) return
  drawNoise(c)
  const list = [...stations(c).map((s) => ({ a: s.a, w: s.w })), ...primarySchools(a, c.osm).map((s) => ({ a: s.a, w: walk(c, s.a) })),
    ...['bus', 'shops', 'park', 'community', 'health'].map((k) => nearestOf(c, k)).filter((x): x is { a: Amenity; w: Walk } => !!x)]
  drawPlaces(c, list.map((x) => ({ a: x.a, label: `${km(x.w.dist)} · ${x.w.walkMin} min walk` })))
  shownCtx = c
  render(c)
}

const sel = $<HTMLSelectElement>('#site')
for (const launch of new Set(AREAS.map((a) => a.launch))) {
  const g = document.createElement('optgroup'); g.label = launchName(AREAS.find((a) => a.launch === launch)!)
  for (const a of AREAS.filter((x) => x.launch === launch)) { const o = document.createElement('option'); o.value = a.id; o.textContent = a.name; g.append(o) }
  sel.append(g)
}
sel.addEventListener('change', () => open(AREAS.find((a) => a.id === sel.value)!))
$('#results').addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-am]')
  if (!b) return
  const c = await loadCtx(area), a = c.osm.amenities.find((x) => x.name === b.dataset.am)
  if (a) { showRoute(c, a); document.querySelectorAll('#results .am.on').forEach((x) => x.classList.remove('on')); b.classList.add('on') }
})
bindPlaces($('#results'), () => render(shownCtx))
open(area)
