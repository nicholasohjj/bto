/**
 * "Your places": a workplace, parents' home or other address the user cares about, saved in this browser
 * and shared by the Surroundings pages. Shows the straight-line distance from a unit or upcoming site,
 * whether it's within HDB's 4 km for living near parents or a married child, and a link to plan the trip.
 */

export type PlaceKind = 'parents' | 'work' | 'other'
export interface MyPlace { id: string; name: string; kind: PlaceKind; lat: number; lon: number; address: string }
/** How far a place is from what's being looked at: the same for a unit; nearest and farthest edge for a site. */
export interface Reach { near: number; far: number }

export const NEAR_PARENTS_M = 4000
export const MAX_PLACES = 3
const KEY = 'bto.myPlaces'
const KIND_LABEL: Record<PlaceKind, string> = { parents: "Parents' or child's home", work: 'Work or school', other: 'Other' }

export function loadPlaces(): MyPlace[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v.filter(isPlace).slice(0, MAX_PLACES) : []
  } catch { return [] }
}
export function savePlaces(list: MyPlace[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_PLACES))) } catch { /* private mode */ }
}
function isPlace(p: unknown): p is MyPlace {
  const o = p as MyPlace
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && Number.isFinite(o.lat) && Number.isFinite(o.lon) && o.kind in KIND_LABEL
}

/** Great-circle distance in metres. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h))
}

/** "1.3521, 103.8198" (as copied from Google Maps or OneMap), within Singapore. */
export function parseLatLon(s: string): { lat: number; lon: number } | null {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const lat = +m[1], lon = +m[2]
  return lat > 1.1 && lat < 1.5 && lon > 103.5 && lon < 104.1 ? { lat, lon } : null
}

export interface Found { name: string; address: string; lat: number; lon: number }
/** OneMap's address and postal code search (public; no sign-in needed). */
export async function searchAddress(q: string, signal?: AbortSignal): Promise<Found[]> {
  const u = new URL('https://www.onemap.gov.sg/api/common/elastic/search')
  u.search = new URLSearchParams({ searchVal: q, returnGeom: 'Y', getAddrDetails: 'Y', pageNum: '1' }).toString()
  const r = await fetch(u, { signal })
  if (!r.ok) throw new Error(`OneMap search failed (${r.status})`)
  const j = await r.json() as { results?: { SEARCHVAL: string; ADDRESS: string; LATITUDE: string; LONGITUDE: string }[] }
  return (j.results ?? []).slice(0, 8).map((x) => ({ name: title(x.SEARCHVAL), address: title(x.ADDRESS), lat: +x.LATITUDE, lon: +x.LONGITUDE }))
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon))
}
/** OneMap answers in capitals. */
const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export const kmText = (m: number) => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
export const transitUrl = (from: [number, number], p: MyPlace) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from[0].toFixed(6)},${from[1].toFixed(6)}&destination=${p.lat.toFixed(6)},${p.lon.toFixed(6)}&travelmode=transit`

/** Within 4 km of the place: every part of what's measured, part of it, or none. */
export function nearParents(r: Reach): 'all' | 'part' | 'none' {
  return r.far <= NEAR_PARENTS_M ? 'all' : r.near <= NEAR_PARENTS_M ? 'part' : 'none'
}

/**
 * The "Your places" section. `from` is where trips start (the block, or the middle of a site);
 * `reach` measures each place. `site` says distances are to a whole site rather than a block.
 */
export function placesHtml(from: [number, number], reach: (p: MyPlace) => Reach, site = false): string {
  const list = loadPlaces()
  const rows = list.map((p) => {
    const r = reach(p), np = p.kind === 'parents' ? nearParents(r) : null
    const dist = site && r.far - r.near > 150 ? `${kmText(r.near)}–${kmText(r.far)}` : kmText(r.near)
    const pill = np === 'all' ? ' <span class="pill good">within 4 km</span>' : np === 'part' ? ' <span class="pill warn">partly within 4 km</span>' : np === 'none' ? ' <span class="pill">over 4 km</span>' : ''
    return `<div class="mp"><div class="mp-top"><span><b>${esc(p.name)}</b> <small>${esc(KIND_LABEL[p.kind])}</small></span><b>${dist}${pill}</b></div>
      <div class="mp-act"><a href="${transitUrl(from, p)}" target="_blank" rel="noopener" title="Opens Google Maps with this trip by public transport">Trip by bus and MRT ↗</a><button type="button" class="linkbtn" data-place-rm="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">Remove</button></div></div>`
  }).join('')
  const parents = list.some((p) => p.kind === 'parents')
  return `<div class="sec"><h3>Your places</h3>${rows || '<p class="note" style="margin:0">Add your workplace, your parents\' home or anywhere you go often to see how far it is from here.</p>'}
    ${list.length < MAX_PLACES ? `<p style="margin:8px 0 0"><button type="button" class="btn" data-place-add>+ Add a place</button></p>` : ''}
    ${list.length ? `<p class="note">Straight-line distance${site ? ' from the nearest and farthest edge of the site (the blocks aren\'t known yet)' : ' from the block'}. For travel time, open the trip in Google Maps.${parents ? ' <b>Within 4 km</b>: HDB treats homes within 4 km as living near parents or a married child, for priority when applying for a new flat and for the Proximity Housing Grant on a resale flat. HDB checks this from the two addresses itself, so treat this as a guide, especially near 4 km.' : ''} Your places stay in this browser.</p>` : ''}</div>`
}

/** Wire up add/remove inside `root` (re-rendered by the page); `onChange` redraws. */
export function bindPlaces(root: HTMLElement, onChange: () => void) {
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    const rm = t.closest<HTMLElement>('[data-place-rm]')
    if (rm) { savePlaces(loadPlaces().filter((p) => p.id !== rm.dataset.placeRm)); onChange(); return }
    if (t.closest('[data-place-add]')) openDialog(onChange)
  })
  // Another tab (say, the other Surroundings page) changed them.
  addEventListener('storage', (e) => { if (e.key === KEY) onChange() })
}

let dlg: HTMLDialogElement | null = null
function openDialog(onChange: () => void) {
  if (!dlg) {
    dlg = document.createElement('dialog')
    dlg.className = 'mpd'
    dlg.innerHTML = `<form method="dialog" class="mpd-form">
      <h3>Add a place</h3>
      <label>Postal code, address or building<input name="q" autocomplete="off" placeholder="e.g. 520123 or Raffles Place" required></label>
      <label>What it is<select name="kind"><option value="work">Work or school</option><option value="parents">Parents' or child's home</option><option value="other">Other</option></select></label>
      <label>Name (optional)<input name="name" autocomplete="off" placeholder="e.g. Office, Mum and Dad"></label>
      <div class="mpd-res" aria-live="polite"></div>
      <p class="note">Searches OneMap (Singapore Land Authority) for the address. You can also paste a latitude and longitude, such as <code>1.3521, 103.8198</code>.</p>
      <div class="mpd-btns"><button type="button" class="btn" value="cancel" data-close>Cancel</button><button type="submit" class="btn primary" value="search">Search</button></div></form>`
    document.body.append(dlg)
    dlg.querySelector('[data-close]')!.addEventListener('click', () => dlg!.close())
  }
  const d = dlg, form = d.querySelector('form')!, res = d.querySelector<HTMLElement>('.mpd-res')!
  form.reset(); res.innerHTML = ''
  let ctl: AbortController | null = null
  const add = (f: Found) => {
    const kind = (form.elements.namedItem('kind') as HTMLSelectElement).value as PlaceKind
    const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim() || (kind === 'parents' ? "Parents' home" : kind === 'work' ? 'Work' : f.name)
    savePlaces([...loadPlaces(), { id: Math.random().toString(36).slice(2, 10), name: name.slice(0, 40), kind, lat: f.lat, lon: f.lon, address: f.address }])
    d.close(); onChange()
  }
  form.onsubmit = async (e) => {
    e.preventDefault()
    const q = (form.elements.namedItem('q') as HTMLInputElement).value.trim()
    const ll = parseLatLon(q)
    if (ll) { add({ name: q, address: q, ...ll }); return }
    ctl?.abort(); ctl = new AbortController()
    res.innerHTML = '<p class="note">Searching…</p>'
    try {
      const found = await searchAddress(q, ctl.signal)
      res.innerHTML = found.length
        ? found.map((f, i) => `<button type="button" class="am link" data-i="${i}"><i aria-hidden="true" style="background:var(--accent)">+</i><span>${esc(f.address)}</span><b></b></button>`).join('')
        : '<p class="note">Nothing found. Try a postal code.</p>'
      res.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.addEventListener('click', () => add(found[+b.dataset.i!])))
    } catch (err) {
      if ((err as Error).name !== 'AbortError') res.innerHTML = '<p class="note">Couldn\'t reach OneMap. Check your connection, or paste a latitude and longitude instead.</p>'
    }
  }
  d.showModal()
  ;(form.elements.namedItem('q') as HTMLInputElement).focus()
}
