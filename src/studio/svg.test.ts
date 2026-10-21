import { describe, expect, it } from 'vitest'
import { CATALOG } from './catalog'
import { ceilingSvg, setCeil } from './ceiling'
import { electricalSvg } from './electrical'
import { elevPanels, elevSheetSvg } from './elevation'
import { loadState } from './model'

/** Tags with an attribute given twice: browsers refuse to open such an SVG file ("Attribute fill redefined"). */
function duplicateAttrs(svg: string) {
  const bad: string[] = []
  for (const [tag] of svg.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const names = [...tag.matchAll(/\s([a-zA-Z:-]+)="/g)].map((m) => m[1])
    if (new Set(names).size !== names.length) bad.push(tag)
  }
  return bad
}

const S = loadState({
  H: 2.6, skirt: true,
  walls: [{ x1: 0, y1: 0, x2: 4, y2: 0, fin: 'tile' }, { x1: 4, y1: 0, x2: 4, y2: 3 }, { x1: 4, y1: 3, x2: 0, y2: 3 }, { x1: 0, y1: 3, x2: 0, y2: 0 }],
  rooms: [{ name: 'Kitchen', x: 0, y: 0, w: 4, h: 3 }],
  openings: [{ kind: 'window', axis: 'h', c: 0, p: 2, w: 1.6, wt: 'slide' }, { kind: 'door', axis: 'h', c: 3, p: 0.8, w: 0.9, dt: 'slide' }],
  items: ['socket', 'acpt', 'ceilL', 'sw1', 'datapt', 'heater', 'aircon', 'downl'].map((type, i) => ({ type, x: 0.4 + i * 0.4, y: 0.05, rot: 0 }))
    .concat([{ type: 'cbase', x: 2, y: 0.36, rot: 0 }, { type: 'cwall', x: 2, y: 0.2, rot: 0 }, { type: 'ctall', x: 3.66, y: 1.6, rot: 90 }, { type: 'fridge', x: 0.4, y: 2.5, rot: 90 }] as never[]),
}, (i) => CATALOG[i.type])
S.items.find((i) => i.type === 'cwall')!.cfg = { doors: 'glass' }
S.items.find((i) => i.type === 'ctall')!.cfg = { doors: 'slide', handle: 'knob' }
setCeil(S.rooms[0], 'type', 'box'); setCeil(S.rooms[0], 'cove', 'true')

describe('SVG exports open as files', () => {
  it('electrical plan', () => { expect(duplicateAttrs(electricalSvg(S, 1200).svg)).toEqual([]) })
  it('elevations', () => { expect(duplicateAttrs(elevSheetSvg(elevPanels(S, CATALOG, () => [1, 1.1]), 'Test', 1200).svg)).toEqual([]) })
  it('ceiling layer', () => { expect(duplicateAttrs(ceilingSvg(S))).toEqual([]) })
})
