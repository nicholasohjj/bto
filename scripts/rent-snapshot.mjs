// Median declared rents by town and flat type, from data.gov.sg "Median Rent by Town and
// Flat Type" (HDB, quarterly, Open Data Licence; figures suppressed under 20 rentals a
// quarter). Writes src/surroundings/../config/rents.json with the latest quarter that has
// figures, falling back one quarter per town/type where the latest is suppressed ("na").
//
//   node scripts/rent-snapshot.mjs

import { writeFileSync } from 'node:fs'

const RESOURCE = 'd_23000a00c52996c55106084ed0339566'
const TYPE = { '1-RM': null, '2-RM': '2R', '3-RM': '3R', '4-RM': '4R', '5-RM': '5R', EXEC: 'Exec' }

const rows = []
for (let offset = 0; ; offset += 10000) {
  const u = `https://data.gov.sg/api/action/datastore_search?resource_id=${RESOURCE}&limit=10000&offset=${offset}`
  const r = await (await fetch(u)).json()
  const page = r.result?.records ?? []
  rows.push(...page)
  if (rows.length >= (r.result?.total ?? 0) || !page.length) break
}
console.log(`${rows.length} rows`)

const quarters = [...new Set(rows.map((r) => r.quarter))].sort()
const latest = quarters.at(-1)
const prev = quarters.at(-2)
const towns = {}
for (const q of [prev, latest]) { // latest last, so it wins where both have figures
  for (const r of rows) {
    if (r.quarter !== q) continue
    const type = TYPE[r.flat_type]
    const rent = Number(r.median_rent)
    if (!type || !isFinite(rent) || rent <= 0) continue
    ;(towns[r.town] ??= {})[type] = rent
  }
}
const out = {
  quarter: latest,
  fetched: new Date().toISOString().slice(0, 10),
  source: `HDB median rent by town and flat type, data.gov.sg (declared rents, ${latest}; a figure missing that quarter falls back to ${prev})`,
  towns: Object.fromEntries(Object.entries(towns).sort(([a], [b]) => a.localeCompare(b))),
}
writeFileSync(new URL('../src/config/rents.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
console.log(`${latest}: ${Object.keys(towns).length} towns → src/config/rents.json`)
