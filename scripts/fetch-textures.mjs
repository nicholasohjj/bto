// Downloads Flat Studio's photo textures (CC0, from Poly Haven) into public/studio/tex/.
// Run: node scripts/fetch-textures.mjs. The files are committed; rerun only to change the set.
// Floor variants (light oak, walnut, …) are recoloured in the browser from one source each.
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

// Poly Haven asset → maps to fetch (col = colour, nrm = OpenGL normal, rgh = roughness).
const SETS = {
  laminate_floor_02: ['col', 'nrm', 'rgh'],
  herringbone_parquet: ['col', 'nrm', 'rgh'],
  marble_01: ['col', 'nrm', 'rgh'],
  scuffed_cement: ['col', 'nrm', 'rgh'],
  painted_plaster_wall: ['nrm', 'rgh'],
  rough_linen: ['nrm'],
  oak_veneer_01: ['col', 'nrm'],
}
const KEY = { col: 'Diffuse', nrm: 'nor_gl', rgh: 'Rough' }
const out = new URL('../public/studio/tex/', import.meta.url)
await mkdir(out, { recursive: true })
for (const [id, maps] of Object.entries(SETS)) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json()
  for (const m of maps) {
    const f = files[KEY[m]]['1k'].jpg
    const buf = Buffer.from(await (await fetch(f.url)).arrayBuffer())
    if (createHash('md5').update(buf).digest('hex') !== f.md5) throw new Error(`${id} ${m}: checksum mismatch`)
    await writeFile(new URL(`${id}_${m}.jpg`, out), buf)
    console.log(`${id}_${m}.jpg ${(buf.length / 1024).toFixed(0)} KB`)
  }
}
