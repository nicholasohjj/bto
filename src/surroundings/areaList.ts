/**
 * Upcoming sites known from HDB's town maps (areas/<id>.json), with their OpenStreetMap snapshots
 * (areas/<id>.osm.json) loaded on demand. A site is listed once its snapshot is there.
 */
import type { Area, AreaOsm } from './area'

const files = import.meta.glob<{ default: unknown }>(['./areas/*.json', '!./areas/*.osm.json'], { eager: true })
const snapshots = import.meta.glob<{ default: unknown }>('./areas/*.osm.json')
const idOf = (path: string) => path.replace(/^.*\//, '').replace(/(\.osm)?\.json$/, '')

export const AREA_OSM: Record<string, () => Promise<AreaOsm>> = Object.fromEntries(
  Object.entries(snapshots).map(([path, load]) => [idOf(path), () => load().then((m) => m.default as AreaOsm)]),
)
/** By launch, then town and name. */
export const AREAS: Area[] = Object.values(files).map((m) => m.default as Area).filter((a) => AREA_OSM[a.id])
  .sort((a, b) => a.launch.localeCompare(b.launch) || a.town.localeCompare(b.town) || a.name.localeCompare(b.name))
