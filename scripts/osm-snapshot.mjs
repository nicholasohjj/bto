// Snapshot OpenStreetMap data around a Surroundings site: buildings (with heights), the walking
// network, amenities and railway tracks, converted to the site's metres. Run occasionally to refresh:
//   node scripts/osm-snapshot.mjs berlayar-rise
//   node scripts/osm-snapshot.mjs berlayar-rise --only rail   (redo some parts, keep the rest of the snapshot)
//   node scripts/osm-snapshot.mjs berlayar-rise --fresh       (ignore answers saved by an earlier, interrupted run)
//   node scripts/osm-snapshot.mjs yishun-khatib --area        (a site from a town map, in areas/: no buildings, wider school search)
// Each Overpass answer is saved in .osm-cache/<site>/ as it arrives, so a run that dies on a busy server
// picks up where it stopped. Parts: estate, buildings, walk, amenities, rail, roads.
// Data © OpenStreetMap contributors, ODbL; the page credits this.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { simplifyWalk } from './simplify-walk.mjs'

const args = process.argv.slice(2), flag = (f) => { const i = args.indexOf(f); if (i < 0) return null; args.splice(i, 1); return args[i] && !args[i].startsWith('--') ? args.splice(i, 1)[0] : true }
const fresh = !!flag('--fresh'), only = flag('--only'), area = !!flag('--area')
const id = args[0] || 'berlayar-rise'
const PARTS = ['estate', 'buildings', 'walk', 'amenities', 'rail', 'roads']
// A site known only from a town map has no blocks to shade or fit, so it needs no buildings.
const parts = typeof only === 'string' ? only.split(',') : area ? ['walk', 'amenities', 'rail', 'roads'] : PARTS
for (const p of parts) if (!PARTS.includes(p)) throw new Error(`Unknown part "${p}" (parts: ${PARTS.join(', ')})`)
const dir = area ? 'src/surroundings/areas' : 'src/surroundings/sites'
const outFile = `${dir}/${id}.osm.json`
if (only && !existsSync(outFile)) throw new Error(`--only needs an existing ${outFile}; run without it first`)
const cacheDir = `.osm-cache/${id}`
if (fresh) rmSync(cacheDir, { recursive: true, force: true })
mkdirSync(cacheDir, { recursive: true })
const site = JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8'))
const g = site.geo
if (!g) throw new Error(`${id}.json has no "geo" (lat0, lon0, cx, cy) to place it on the map`)
const KX = 111320 * Math.cos(g.lat0 * Math.PI / 180), KY = 110574
const toSite = (lat, lon) => [+(g.cx + (lon - g.lon0) * KX).toFixed(1), +(g.cy - (lat - g.lat0) * KY).toFixed(1)]
const C = `${g.lat0},${g.lon0}`
/** A south,west,north,east box reaching `m` metres from the site centre (box queries are lighter than "around"). */
const box = (m) => { const dl = m / KY, dn = m / KX; return `${(g.lat0 - dl).toFixed(5)},${(g.lon0 - dn).toFixed(5)},${(g.lat0 + dl).toFixed(5)},${(g.lon0 + dn).toFixed(5)}` }

/** An Overpass query, answered from .osm-cache when an earlier run already got it. */
async function overpass(name, q) {
  const f = `${cacheDir}/${name}.json`
  if (existsSync(f)) { console.log(`${name}: saved answer from an earlier run`); return JSON.parse(readFileSync(f, 'utf8')) }
  const els = await fetchOverpass(q)
  writeFileSync(f, JSON.stringify(els))
  console.log(`${name}: ${els.length} elements`)
  return els
}
async function fetchOverpass(q) {
  // Public servers are often busy: try each a few times, waiting between attempts.
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
      const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'bto-money-timeline/1.0 (surroundings snapshot)', Accept: 'application/json' }, body: new URLSearchParams({ data: q }) }).catch(() => null)
      if (r?.ok) return (await r.json()).elements
      console.warn(url, r?.status ?? 'network error')
    }
    await new Promise((res) => setTimeout(res, 20000 * (attempt + 1)))
  }
  throw new Error('Overpass unavailable')
}

const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < (poly[j][0] - poly[i][0]) * (p[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c }

// The estate itself, which the brochure model covers (OSM has it only as a construction site).
const want = (p) => parts.includes(p)
const old = only ? JSON.parse(readFileSync(outFile, 'utf8')) : {}
const [estateWay] = !want('estate') && !want('buildings') ? [] : await overpass('estate', `[out:json][timeout:60];way["landuse"="construction"]["name"="${site.name}"](around:600,${C});out geom;`)
const estate = estateWay ? estateWay.geometry.map((p) => toSite(p.lat, p.lon)) : old.estate ? [...old.estate, old.estate[0]] : []

// The brochure's own blocks and buildings.
const own = area ? [] : [...site.blocks.flatMap((b) => (b.masses ?? [{ poly: b.footprint }]).map((m) => m.poly)), ...site.buildings.filter((b) => b.poly).map((b) => b.poly)]
// Buildings: height from "height", else storeys from "building:levels" (3 m each), else assumed 2 storeys.
const B = want('buildings') ? await overpass('buildings', `[out:json][timeout:120];way["building"](${box(1300)});out tags geom;`) : []
let known = 0
const buildings = []
for (const w of B) {
  const poly = (w.geometry || []).map((p) => toSite(p.lat, p.lon))
  if (poly.length < 4) continue
  const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0])
  if (estate.length && inside(c, estate)) continue
  // OpenStreetMap may already have the estate's own blocks or carpark: the brochure model has them.
  if (own.some((o) => inside(c, o) || poly.some((p) => inside(p, o)))) continue
  const t = w.tags || {}, h = parseFloat(t.height), lv = parseFloat(t['building:levels'])
  const height = isFinite(h) && h > 0 ? h : isFinite(lv) && lv > 0 ? lv * 3 : 6
  const has = (isFinite(h) && h > 0) || (isFinite(lv) && lv > 0)
  if (has) known++
  poly.pop()   // closed ways repeat the first point
  buildings.push({ h: +height.toFixed(1), ...(has ? {} : { a: 1 }), ...(t.name ? { n: t.name.slice(0, 60) } : {}), p: poly.flat() })
}

// Walking network: footpaths and streets (not expressways), with shared nodes joined.
const W = !want('walk') ? [] : await overpass('walk', `[out:json][timeout:180];way["highway"~"^(footway|path|pedestrian|steps|living_street|residential|service|unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|trunk|trunk_link|cycleway|corridor|track)$"]["access"!~"^(private|no)$"]["foot"!="no"](${box(2600)});out geom;`)
const idx = new Map(), nodes = [], ways = []
for (const w of W) {
  const ids = w.nodes || [], geom = w.geometry || []
  const list = []
  ids.forEach((nid, i) => {
    if (!geom[i]) return
    if (!idx.has(nid)) { idx.set(nid, nodes.length / 2); const [x, y] = toSite(geom[i].lat, geom[i].lon); nodes.push(Math.round(x), Math.round(y)) }
    list.push(idx.get(nid))
  })
  if (list.length > 1) ways.push(list)
}

// Amenities.
// In three smaller queries, each saved as it arrives: a busy server answers these when it times out on one big one.
const AQ = [
  [
    `node["railway"="subway_entrance"](${box(2600)});`,
    `nwr["railway"="station"]["station"="subway"]["name"](${box(3000)});`,
    `nwr["amenity"="school"]["name"](${box(area ? 3200 : 2600)});`,
  ],
  [
    `nwr["leisure"="park"]["name"](${box(2600)});`,
    `nwr["shop"~"^(supermarket|mall)$"]["name"](${box(2600)});`,
    `nwr["amenity"~"^(marketplace|food_court)$"]["name"](${box(2600)});`,
    `nwr["name"~"Food Centre|Hawker"](${box(2600)});`,
  ],
  [
    `nwr["amenity"~"^(clinic|hospital)$"]["name"](${box(2600)});`,
    `nwr["amenity"="community_centre"]["name"](${box(2600)});`,
    `nwr["amenity"="bus_station"]["name"](${box(2600)});`,
    `nwr["amenity"="library"]["name"](${box(2600)});`,
  ],
]
const A = []
if (want('amenities')) for (const [i, q] of AQ.entries()) A.push(...await overpass(`amenities-${i + 1}`, `[out:json][timeout:120];(${q.join('')});out tags center;`))
const kindOf = (t) => {
  if (t.railway === 'subway_entrance') return 'mrt'
  if (t.amenity === 'school') return 'school'
  if (t.leisure === 'park') return 'park'
  if (t.amenity === 'clinic' || t.amenity === 'hospital') return 'health'
  if (t.amenity === 'community_centre' || t.amenity === 'library') return 'community'
  if (t.amenity === 'bus_station') return 'bus'
  return 'shops'
}
// Exits are often unnamed or named "<Station> (<line>) Exit A": name them "<Station> MRT (<line>), exit A",
// taking the station from the nearest station node when the exit has no name.
// Open stations name the exits near them; stations still being built have no exits yet.
const stations = A.filter((e) => e.tags?.railway === 'station' && e.tags.construction !== 'station').map((e) => ({ at: toSite(e.lat ?? e.center.lat, e.lon ?? e.center.lon), name: e.tags.name.replace(/\s+station$/i, ''), line: e.tags.name.match(/\(([^)]+)\)/)?.[1] }))
const mrtName = (t, at) => {
  const m = (t.name || '').match(/^(.*?)\s*\(([^)]+)\)\s*(?:Exit\s*)?([A-Z0-9]{0,3})$/i)
  if (m) return `${m[1].replace(/\s*MRT$/i, '')} MRT (${m[2]})${m[3] ? `, exit ${m[3]}` : ''}`
  // Station areas can be long, so their centre may be a few hundred metres from an exit.
  const st = stations.map((s) => ({ ...s, d: Math.hypot(s.at[0] - at[0], s.at[1] - at[1]) })).sort((a, b) => a.d - b.d)[0]
  const base = st && st.d < 400 ? st.name.replace(/\s*\(.*\)$/, '').replace(/\s*MRT( Station)?$/i, '') + ' MRT' + (st.line ? ` (${st.line})` : '') : 'MRT'
  return `${base}${t.ref ? `, exit ${t.ref}` : t.name ? `, ${t.name}` : ''}`
}
const amenities = [], seen = new Set()
for (const e of A) {
  if (e.tags?.railway === 'station') {
    // A station being built: listed itself (marked "future"), since it has no exits mapped yet.
    const t = e.tags, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon
    if (t.construction === 'station' && lat != null) amenities.push({ name: `${t.name.replace(/\s+station$/i, '')} MRT${t.ref ? ` (${t.ref})` : ''}, being built`, kind: 'mrt', sub: 'future', at: toSite(lat, lon) })
    continue
  }
  const t = e.tags || {}, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon
  if (lat == null) continue
  let name = t.name || ''
  const kind = kindOf(t)
  const at = toSite(lat, lon)
  if (kind === 'mrt') name = mrtName(t, at)
  if (!name) continue
  // Unnamed exits of one station stay apart (each is a way in); named places are listed once.
  const key = kind + name + (kind === 'mrt' && !/exit/i.test(name) ? at.join() : '')
  if (seen.has(key)) continue
  seen.add(key)
  // Schools: primary and secondary matter most (Primary 1 registration uses distance from home).
  const sub = kind === 'school' ? (/primary/i.test(name) ? 'primary' : /secondary|high school/i.test(name) ? 'secondary' : 'other') : undefined
  amenities.push({ name: name.slice(0, 70), kind, at, ...(sub ? { sub } : {}) })
}

// Open stations with no exit mapped (often elevated ones): the station itself is the place to walk to.
for (const st of stations) {
  if (amenities.some((a) => a.kind === 'mrt' && Math.hypot(a.at[0] - st.at[0], a.at[1] - st.at[1]) < 300)) continue
  amenities.push({ name: `${st.name.replace(/\s*\(.*\)$/, '').replace(/\s*MRT( Station)?$/i, '')} MRT${st.line ? ` (${st.line})` : ''}`, kind: 'mrt', at: st.at })
}

// Railway tracks, for train noise: above ground they matter; underground ones are only mentioned. Points
// closer than 5 m are dropped (tracks are long and smooth).
// Lines being built count too (marked f): an elevated one will be heard once it opens.
const R = !want('rail') ? [] : await overpass('rail', `[out:json][timeout:120];(way["railway"~"^(rail|subway|light_rail|monorail)$"](${box(1500)});way["railway"="construction"]["construction"~"^(rail|subway|light_rail|monorail)$"](${box(1500)}););out tags geom;`)
const rail = []
for (const w of R) {
  const t = w.tags || {}, pts = []
  for (const g of w.geometry || []) {
    const p = toSite(g.lat, g.lon), q = pts.at(-1)
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) >= 5) pts.push(p)
  }
  if (pts.length < 2) continue
  const under = t.tunnel === 'yes' || t.location === 'underground' || parseInt(t.layer) < 0
  rail.push({ ...(t.name ? { n: t.name.slice(0, 60) } : {}), ...(under ? { u: 1 } : {}), ...(t.railway === 'construction' ? { f: 1 } : {}), p: pts.map((p) => p.map(Math.round)).flat() })
}

// Roads, for traffic noise: expressways and the bigger streets near the site.
const RD = !want('roads') ? [] : await overpass('roads', `[out:json][timeout:120];way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${box(900)});out tags geom;`)
const roads = []
for (const w of RD) {
  const t = w.tags || {}, pts = []
  for (const g of w.geometry || []) {
    const p = toSite(g.lat, g.lon), q = pts.at(-1)
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) >= 5) pts.push(p)
  }
  if (pts.length < 2) continue
  const k = t.highway === 'motorway' ? 'expressway' : t.highway === 'tertiary' ? 'minor' : 'major'
  const under = t.tunnel === 'yes' || parseInt(t.layer) < 0
  if (under) continue
  roads.push({ ...(t.name ? { n: t.name.slice(0, 60) } : {}), k, p: pts.map((p) => p.map(Math.round)).flat() })
}

// The estate's outline too: walks start anywhere on its edge (its own paths aren't mapped while it's being built).
const out = {
  // A partial run keeps the date of the full snapshot it updates.
  ...old, fetched: old.fetched ?? new Date().toISOString().slice(0, 10), attribution: '© OpenStreetMap contributors (ODbL)',
  ...(want('estate') && estate.length ? { estate: estate.slice(0, -1) } : {}),
  ...(want('buildings') ? { buildings } : {}),
  ...(want('walk') ? { walk: simplifyWalk({ nodes, ways }) } : {}),
  ...(want('amenities') ? { amenities } : {}),
  ...(want('rail') ? { rail } : {}),
  ...(want('roads') ? { roads } : {}),
}
writeFileSync(outFile, JSON.stringify(out))
// The run is complete: the saved answers are no longer needed.
rmSync(cacheDir, { recursive: true, force: true })
console.log(`${(out.buildings ?? []).length} buildings, ${(out.roads ?? []).length} roads, ${out.walk.nodes.length / 2} path nodes in ${out.walk.ways.length} ways, ${out.amenities.length} amenities, ${(out.rail ?? []).length} railway tracks (${(out.rail ?? []).filter((r) => !r.u).length} above ground)${want('buildings') ? `; ${known} buildings have heights` : ''}`)
