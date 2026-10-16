// Snapshot recent HDB resale transactions around each Surroundings site (brochure sites and town-map areas):
//   node scripts/resale-snapshot.mjs              (every site; last 12 months)
//   node scripts/resale-snapshot.mjs --months 18
// Transactions: data.gov.sg "Resale flat prices based on registration date from Jan-2017 onwards" (HDB),
// Singapore Open Data Licence. They have block and street but no position, so each block is placed with
// OpenStreetMap's addressed buildings (one Overpass query per site), and OneMap's address search (SLA) for the few
// that OpenStreetMap doesn't have. OneMap allows few requests without a token, so it's kept to those.
// Answers are cached in .resale-cache/ (git-ignored): re-running carries on, and refreshes only new addresses.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const MONTHS = +(args[args.indexOf('--months') + 1] || 0) || 12
const RESOURCE = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc'
const KEEP_M = 1500 // keep sales within this of any part of a site (pages show within 1 km)
const CACHE = '.resale-cache'
mkdirSync(CACHE, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* sites, as lat/lon points (block outlines, or the town-map site outline) */
const KY = 110574
const sites = []
for (const [dir, area] of [['src/surroundings/sites', false], ['src/surroundings/areas', true]]) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.endsWith('.osm.json'))) {
    const s = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
    const g = s.geo, kx = 111320 * Math.cos(g.lat0 * Math.PI / 180)
    const ll = ([x, y]) => [g.lat0 - (y - g.cy) / KY, g.lon0 + (x - g.cx) / kx]
    const pts = area ? s.outline : s.blocks.flatMap((b) => b.footprint)
    sites.push({ id: f.replace(/\.json$/, ''), dir, geo: g, kx, pts: pts.map(ll) })
  }
}
const dist = (a, b) => { const kx = 111320 * Math.cos(a[0] * Math.PI / 180); return Math.hypot((a[0] - b[0]) * KY, (a[1] - b[1]) * kx) }
const nearSite = (p) => Math.min(...sites.map((s) => Math.min(...s.pts.map((q) => dist(p, q)))))

/* transactions */
async function json(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'bto-money-timeline/1.0 (resale snapshot)' } }).catch(() => null)
    if (r?.ok) { try { return await r.json() } catch { /* rate-limited answers aren't JSON */ } }
    await sleep(3000 * (i + 1))
  }
  throw new Error(`No answer: ${url}`)
}
const now = new Date()
const months = Array.from({ length: MONTHS }, (_, i) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); return d.toISOString().slice(0, 7) })
const rows = []
for (const m of months) {
  const f = `${CACHE}/sales-${m}.json`
  // The current and last month are still being filled in: always fetch them again.
  const recent = m >= months[1]
  let recs
  if (existsSync(f) && !recent) recs = JSON.parse(readFileSync(f, 'utf8'))
  else {
    recs = []
    for (let offset = 0; ; offset += 5000) {
      const u = `https://data.gov.sg/api/action/datastore_search?resource_id=${RESOURCE}&limit=5000&offset=${offset}&filters=${encodeURIComponent(JSON.stringify({ month: m }))}`
      const j = await json(u)
      recs.push(...j.result.records)
      if (j.result.records.length < 5000) break
      await sleep(1500)
    }
    writeFileSync(f, JSON.stringify(recs))
    await sleep(1500)
  }
  console.log(`${m}: ${recs.length} sales`)
  rows.push(...recs)
}

/* OneMap */
const ABBR = { AVE: 'AVENUE', CRES: 'CRESCENT', ST: 'STREET', DR: 'DRIVE', RD: 'ROAD', NTH: 'NORTH', STH: 'SOUTH', UPP: 'UPPER', "C'WEALTH": 'COMMONWEALTH', CTRL: 'CENTRAL', PK: 'PARK', TER: 'TERRACE', CL: 'CLOSE', PL: 'PLACE', BT: 'BUKIT', JLN: 'JALAN', LOR: 'LORONG', KG: 'KAMPONG', TG: 'TANJONG', HTS: 'HEIGHTS', GDNS: 'GARDENS', MKT: 'MARKET', CTR: 'CENTRE', SQ: 'SQUARE', LK: 'LINK', VW: 'VIEW', WAY: 'WAY', BLVD: 'BOULEVARD', CCK: 'CHOA CHU KANG', 'ST.': 'SAINT', MT: 'MOUNT', BRIDGE: 'BRIDGE' }
const expand = (s) => s.split(' ').map((w) => ABBR[w] ?? w).join(' ')
const geoFile = `${CACHE}/onemap.json`
const geo = existsSync(geoFile) ? JSON.parse(readFileSync(geoFile, 'utf8')) : {}
let asked = 0
async function onemap(q) {
  if (q in geo) return geo[q]
  const u = `https://www.onemap.gov.sg/api/common/elastic/search?returnGeom=Y&getAddrDetails=Y&pageNum=1&searchVal=${encodeURIComponent(q)}`
  const j = await json(u)
  geo[q] = (j.results ?? []).slice(0, 5).map((r) => ({ blk: r.BLK_NO, road: r.ROAD_NAME, lat: +r.LATITUDE, lon: +r.LONGITUDE }))
  if (++asked % 50 === 0) { writeFileSync(geoFile, JSON.stringify(geo)); console.log(`OneMap: ${asked} looked up`) }
  await sleep(1200)
  return geo[q]
}
async function block(blk, name) {
  for (const q of [`${blk} ${name}`, `${blk} ${expand(name)}`]) {
    const r = (await onemap(q)).find((x) => x.blk === blk)
    if (r) return [r.lat, r.lon]
  }
  return null
}

/* place blocks: OpenStreetMap's addressed buildings around each site (one query each), then OneMap for the rest */
const norm = (st) => expand(st.toUpperCase().replace(/\s+/g, ' ').trim())
const placed = new Map()
const osmAddr = new Map() // "BLK|STREET" (expanded) → [lat, lon]
async function overpass(q) {
  const body = new URLSearchParams({ data: q }).toString()
  for (let i = 0; i < 4; i++) {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'bto-money-timeline/1.0 (resale snapshot)', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body }).catch(() => null)
    if (r?.ok) return (await r.json()).elements
    // The IPv4 server is sometimes down while IPv6 answers (see the OSM snapshot notes): try curl over IPv6.
    try {
      const out = execFileSync('curl', ['-s', '-6', '-m', '180', '-A', 'bto-money-timeline/1.0 (resale snapshot)', '-H', 'Accept: application/json', '-X', 'POST', 'https://overpass-api.de/api/interpreter', '--data-binary', body], { maxBuffer: 1 << 28 }).toString()
      return JSON.parse(out).elements
    } catch { /* busy: wait and retry */ }
    await sleep(15000 * (i + 1))
  }
  throw new Error('Overpass unavailable')
}
for (const site of sites) {
  const f = `${CACHE}/osm-${site.id}.json`
  let els
  if (existsSync(f)) els = JSON.parse(readFileSync(f, 'utf8'))
  else {
    const pad = (KEEP_M + 300) / KY
    const lat = site.pts.map((p) => p[0]), lon = site.pts.map((p) => p[1]), padLon = (KEEP_M + 300) / site.kx
    const bbox = `${Math.min(...lat) - pad},${Math.min(...lon) - padLon},${Math.max(...lat) + pad},${Math.max(...lon) + padLon}`
    els = await overpass(`[out:json][timeout:120];(way["building"]["addr:housenumber"]["addr:street"](${bbox});node["addr:housenumber"]["addr:street"](${bbox}););out tags center;`)
    writeFileSync(f, JSON.stringify(els))
    await sleep(3000)
  }
  for (const e of els) {
    const c = e.center ?? (e.lat ? { lat: e.lat, lon: e.lon } : null)
    if (!c) continue
    for (const hn of e.tags['addr:housenumber'].split(/[;,]\s*/)) osmAddr.set(`${hn.toUpperCase()}|${norm(e.tags['addr:street'])}`, [c.lat, c.lon])
  }
  console.log(`${site.id}: ${els.length} addressed OpenStreetMap features`)
}
const addrs = [...new Set(rows.map((r) => `${r.block}|${r.street_name}`))]
const unplaced = []
for (const a of addrs) {
  const [b, st] = a.split('|'), p = osmAddr.get(`${b}|${norm(st)}`)
  if (p) placed.set(a, p); else unplaced.push(a)
}
// The rest are mostly far from every site. Look up only those on a street OpenStreetMap places near a site.
const nearStreets = new Set()
for (const [k, p] of osmAddr) if (nearSite(p) <= KEEP_M + 500) nearStreets.add(k.split('|')[1])
const toAsk = unplaced.filter((a) => nearStreets.has(norm(a.split('|')[1])))
console.log(`${placed.size} blocks placed from OpenStreetMap; ${toAsk.length} more to look up on OneMap`)
const missed = []
for (const a of toAsk) { const [b, st] = a.split('|'); const p = await block(b, st); if (p) placed.set(a, p); else missed.push(a) }
writeFileSync(geoFile, JSON.stringify(geo))
if (missed.length) console.warn(`Not found (${missed.length}): ${missed.slice(0, 20).join(', ')}${missed.length > 20 ? ', …' : ''}`)

/* one file per site, in the site's own metres */
const TYPE = { '1 ROOM': '1R', '2 ROOM': '2R', '3 ROOM': '3R', '4 ROOM': '4R', '5 ROOM': '5R', EXECUTIVE: 'Exec', 'MULTI-GENERATION': '3Gen' }
mkdirSync('src/surroundings/resale', { recursive: true })
for (const s of sites) {
  const out = []
  for (const r of rows) {
    const p = placed.get(`${r.block}|${r.street_name}`)
    const d = p && Math.min(...s.pts.map((q) => dist(p, q)))
    if (!p || d > KEEP_M) continue
    const at = [Math.round(s.geo.cx + (p[1] - s.geo.lon0) * s.kx), Math.round(s.geo.cy - (p[0] - s.geo.lat0) * KY)]
    out.push({ m: r.month, t: TYPE[r.flat_type] ?? r.flat_type, b: r.block, s: r.street_name, f: r.storey_range.replace(/^0/, '').replace(' TO 0', '–').replace(' TO ', '–'), a: +r.floor_area_sqm, l: +r.lease_commence_date, p: +r.resale_price, at, d: Math.round(d) })
  }
  out.sort((x, y) => y.m.localeCompare(x.m) || y.p - x.p)
  const file = { fetched: now.toISOString().slice(0, 10), from: months.at(-1), to: months[0], source: 'HDB resale flat prices (data.gov.sg); blocks placed with OpenStreetMap addresses (© OpenStreetMap contributors, ODbL) and OneMap', rows: out }
  writeFileSync(`src/surroundings/resale/${s.id}.json`, JSON.stringify(file))
  console.log(`${s.id}: ${out.length} sales within ${KEEP_M / 1000} km`)
}
