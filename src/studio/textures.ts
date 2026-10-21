/**
 * Photo textures (CC0, from Poly Haven; fetched by scripts/fetch-textures.mjs into public/studio/tex/).
 * Floors get colour, normal and roughness maps; painted walls, fabric and timber get surface detail.
 * Sets load on first use: until then the procedural finishes in materials.ts stand in, and `onLoad`
 * tells the 3D view to rebuild. Floor variants share one photo, recoloured here to each finish's colour.
 */
import * as THREE from 'three'
import { FLOOR_SPECS } from './materials'

const BASE = '/studio/tex/'

/** A photo set: its maps and the real-world size one texture covers, metres. */
interface Src { id: string; size: number; col?: boolean; rgh?: boolean }
const SRC: Record<string, Src> = {
  plank: { id: 'laminate_floor_02', size: 1.7, col: true, rgh: true },
  herr: { id: 'herringbone_parquet', size: 3.4, col: true, rgh: true },
  marble: { id: 'marble_01', size: 1.5, col: true, rgh: true },
  cement: { id: 'scuffed_cement', size: 1.62, col: true, rgh: true },
  plaster: { id: 'painted_plaster_wall', size: 2, rgh: true },
  linen: { id: 'rough_linen', size: 0.27 },
  oak: { id: 'oak_veneer_01', size: 1.83, col: true },
}
/** Floor finish → photo set and how much colour to take out before tinting (0 keeps the photo's colour). */
export const FLOOR_PHOTO: Record<string, { src: keyof typeof SRC; desat: number }> = {
  oak: { src: 'plank', desat: 0.2 }, loak: { src: 'plank', desat: 0.35 }, goak: { src: 'plank', desat: 0.75 },
  walnut: { src: 'plank', desat: 0.2 }, vinyl: { src: 'plank', desat: 0.55 },
  herr: { src: 'herr', desat: 0.2 }, marble: { src: 'marble', desat: 0.85 }, cement: { src: 'cement', desat: 0.9 },
}

export interface Loaded { map?: THREE.Texture; normalMap: THREE.Texture; roughnessMap?: THREE.Texture; size: number; /** Mean of the roughness map (0–1). */ rMean: number }

/**
 * Recolour pixels so their average matches `target`, after taking out `desat` of their saturation.
 * Works in place on RGBA data. Exported for tests.
 */
export function recolour(px: Uint8ClampedArray, target: [number, number, number], desat: number) {
  const n = px.length / 4
  let sr = 0, sg = 0, sb = 0
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
    px[i] += (l - px[i]) * desat; px[i + 1] += (l - px[i + 1]) * desat; px[i + 2] += (l - px[i + 2]) * desat
    sr += px[i]; sg += px[i + 1]; sb += px[i + 2]
  }
  const g = [target[0] / (sr / n || 1), target[1] / (sg / n || 1), target[2] / (sb / n || 1)]
  for (let i = 0; i < px.length; i += 4) { px[i] *= g[0]; px[i + 1] *= g[1]; px[i + 2] *= g[2] }
}
const hexRgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }

const imgs: Record<string, Promise<HTMLImageElement>> = {}
function img(url: string) {
  return imgs[url] ??= new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Could not load ' + url)); im.src = url })
}
function tex(src: CanvasImageSource, srgb: boolean) {
  const t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src as HTMLImageElement)
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}
function canvasOf(im: HTMLImageElement) {
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight
  const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(im, 0, 0)
  return { c, x }
}
/** Mean green channel of a roughness map (three.js reads roughness from green). */
function meanG(im: HTMLImageElement) {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s
  const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(im, 0, 0, s, s)
  const d = x.getImageData(0, 0, s, s).data
  let t = 0
  for (let i = 1; i < d.length; i += 4) t += d[i]
  return t / (s * s) / 255 || 1
}

const cache: Record<string, Loaded | null | undefined> = {}
const pending: Record<string, Promise<void>> = {}
let listener: () => void = () => {}
/** Called once each time a set finishes loading, so the 3D view can rebuild with it. */
export function onLoad(fn: () => void) { listener = fn }

async function load(key: string, srcKey: string, tint?: { c: string; desat: number }) {
  const s = SRC[srcKey], u = (m: string) => `${BASE}${s.id}_${m}.jpg`
  try {
    const [col, nrm, rgh] = await Promise.all([s.col ? img(u('col')) : null, img(u('nrm')), s.rgh ? img(u('rgh')) : null])
    let map: THREE.Texture | undefined
    if (col && tint) {
      const { c, x } = canvasOf(col), d = x.getImageData(0, 0, c.width, c.height)
      recolour(d.data, hexRgb(tint.c), tint.desat); x.putImageData(d, 0, 0)
      map = tex(c, true)
    } else if (col) map = tex(col, true)
    cache[key] = { map, normalMap: tex(nrm, false), roughnessMap: rgh ? tex(rgh, false) : undefined, size: s.size, rMean: rgh ? meanG(rgh) : 1 }
  } catch { cache[key] = null }
  listener()
}

/** A floor's photo set if loaded (starting the load otherwise), or null when it has none or it failed. */
export function floorPhoto(floor: string): Loaded | null {
  const f = FLOOR_PHOTO[floor], sp = FLOOR_SPECS[floor]
  if (!f || !sp || typeof document === 'undefined') return null
  const key = 'floor:' + floor
  if (cache[key] !== undefined) return cache[key]!
  pending[key] ??= load(key, f.src, { c: sp.c, desat: f.desat })
  return null
}

/** Surface detail for painted walls, fabric and timber, if loaded (starting the load otherwise). */
export function detail(kind: 'plaster' | 'linen' | 'oak'): Loaded | null {
  if (typeof document === 'undefined') return null
  const key = 'detail:' + kind
  if (cache[key] !== undefined) return cache[key]!
  // Timber is tinted by the item's own colour, so its photo goes grey and bright (multiplied by the colour).
  pending[key] ??= load(key, kind, kind === 'oak' ? { c: '#e6e6e6', desat: 1 } : undefined)
  return null
}

/** A copy of a texture repeated to cover w × h metres at the set's size. */
export function rep(t: THREE.Texture, w: number, h: number, size: number) {
  const c = t.clone(); c.repeat.set(w / size, h / size); c.needsUpdate = true
  return c
}
