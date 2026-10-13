/** The real map (OneMap or OpenStreetMap) with the estate, your unit, walking rings, amenities and routes. */
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ellipsePoly, toLatLng, type Amenity, type Pt, type Site, type UnitPos } from './analysis'

export const KIND: Record<string, { c: string; l: string; n: string }> = {
  mrt: { c: '#d22f45', l: 'M', n: 'MRT' }, bus: { c: '#7a5aa6', l: 'B', n: 'Bus interchange' }, school: { c: '#2f6db5', l: 'S', n: 'School' },
  park: { c: '#3f8f4e', l: 'P', n: 'Park' }, shops: { c: '#c07a14', l: '$', n: 'Shops and food' }, community: { c: '#5a7380', l: 'C', n: 'Community' },
  health: { c: '#c0392b', l: '+', n: 'Health' },
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export interface MapAmenity { a: Amenity; label: string }
export function createMap(el: HTMLElement, onPick: (a: Amenity) => void) {
  const map = L.map(el, { zoomControl: true, attributionControl: true, minZoom: 12, maxZoom: 19 })
  const onemap = L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', {
    minZoom: 11, maxZoom: 19,
    attribution: '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> © contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>',
  })
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' })
  onemap.addTo(map)
  const estate = L.layerGroup().addTo(map), unitL = L.layerGroup().addTo(map), amenL = L.layerGroup().addTo(map), routeL = L.layerGroup().addTo(map)
  L.control.layers({ OneMap: onemap, OpenStreetMap: osm }, { 'Estate (from the brochure)': estate, Amenities: amenL, 'Walking route': routeL }, { collapsed: true }).addTo(map)
  L.control.scale({ metric: true, imperial: false }).addTo(map)

  let site: Site | null = null, future = 40
  /** What the map should frame once it's visible (it can't measure itself while its tab is hidden). */
  let frame: L.LatLngBounds | null = null
  const fit = () => { if (frame && el.clientWidth) map.fitBounds(frame, { maxZoom: 18 }) }
  const ll = (p: Pt) => toLatLng(site!, p)
  const poly = (p: Pt[]) => p.map(ll)

  function drawEstate() {
    estate.clearLayers()
    if (!site) return
    for (const z of site.zones) L.polygon(poly(z.poly), { color: z.kind === 'park' ? '#3f8f4e' : '#5d7891', weight: 1, dashArray: z.kind === 'future' ? '5 4' : undefined, fillOpacity: z.kind === 'park' ? 0.25 : future > 0 ? 0.18 : 0.06 }).bindTooltip(esc(z.name)).addTo(estate)
    for (const b of site.buildings) L.polygon(poly(b.poly ?? ellipsePoly(...b.ellipse!)), { color: '#8d8a85', weight: 1, fillColor: '#d8d2c6', fillOpacity: 0.8 }).bindTooltip(esc(b.name)).addTo(estate)
  }
  function drawBlocks(u: UnitPos | null) {
    unitL.clearLayers()
    if (!site) return
    for (const b of site.blocks) {
      const mine = u?.block.id === b.id
      L.polygon(poly(b.footprint), { color: mine ? '#d98c00' : '#6b6760', weight: mine ? 2.5 : 1, fillColor: mine ? '#f6e7b8' : '#efece6', fillOpacity: 0.95 }).bindPopup(`Block ${b.id}, ${b.storeys} storeys`)
        .bindTooltip(b.id, { permanent: true, direction: 'center', className: 'blk' }).addTo(unitL)
    }
    if (!u) return
    const fp = u.block.footprint, c: Pt = [fp.reduce((s, p) => s + p[0], 0) / fp.length, fp.reduce((s, p) => s + p[1], 0) / fp.length]
    for (const [r, t] of [[400, '400 m'], [1000, '1 km']] as const) {
      L.circle(ll(c), { radius: r, color: '#17707a', weight: 1.5, dashArray: '6 5', fill: false, interactive: false }).addTo(unitL)
      L.tooltip({ permanent: true, direction: 'center', className: 'ring' }).setLatLng(ll([c[0], c[1] - r])).setContent(t).addTo(unitL)
    }
    L.polyline([ll([u.eye[0], u.eye[1]]), ll([u.eye[0] + u.n[0] * 45, u.eye[1] + u.n[1] * 45])], { color: '#ff8a00', weight: 5 }).addTo(unitL)
    L.circleMarker(ll([u.eye[0], u.eye[1]]), { radius: 7, color: '#fff', weight: 2, fillColor: '#ff8a00', fillOpacity: 1 }).bindTooltip(`Your unit #${String(u.storey).padStart(2, '0')}-${u.unit.no}, facing ${u.facing}`).addTo(unitL)
  }
  function drawAmenities(list: MapAmenity[]) {
    amenL.clearLayers()
    for (const { a, label } of list) {
      const k = KIND[a.kind] ?? KIND.community
      L.marker(ll(a.at), { icon: L.divIcon({ className: 'amk', html: `<i style="background:${k.c}">${esc(k.l)}</i>`, iconSize: [20, 20], iconAnchor: [10, 10] }), title: a.name })
        .bindTooltip(`${esc(a.name)}<br><small>${esc(label)}</small>`).on('click', () => onPick(a)).addTo(amenL)
    }
  }
  return {
    setSite(s: Site) {
      site = s
      drawEstate()
      const fp = s.blocks.flatMap((b) => b.footprint)
      frame = L.latLngBounds(fp.map(ll)).pad(1.2)
      map.setView(frame.getCenter(), 16)
      fit()
    },
    setUnit(u: UnitPos | null) { drawBlocks(u) },
    setFuture(st: number) { future = st; drawEstate() },
    setAmenities: drawAmenities,
    showRoute(line: Pt[] | null, label = '') {
      routeL.clearLayers()
      if (!line) return
      const pl = L.polyline(line.map(ll), { color: '#17707a', weight: 5, opacity: 0.85 }).bindTooltip(esc(label), { sticky: true }).addTo(routeL)
      frame = pl.getBounds().pad(0.25)
      fit()
    },
    redraw() { map.invalidateSize(); fit() },
  }
}
