/**
 * Walking routes over the OpenStreetMap footpath and street network (snapshot in sites/<id>.osm.json).
 * Shortest paths from a block to every point at once, so all amenities cost one run.
 */
import type { Pt } from './analysis'

export interface WalkData { nodes: number[]; ways: number[][] }
export interface Graph { xy: Float64Array; adj: { to: number; w: number }[][] }

/** Build the graph (node coordinates are whole metres). */
export function buildGraph(d: WalkData): Graph {
  const n = d.nodes.length / 2, xy = new Float64Array(n * 2), adj: Graph['adj'] = Array.from({ length: n }, () => [])
  for (let i = 0; i < d.nodes.length; i++) xy[i] = d.nodes[i]
  for (const w of d.ways) for (let k = 1; k < w.length; k++) {
    const a = w[k - 1], b = w[k], len = Math.hypot(xy[2 * a] - xy[2 * b], xy[2 * a + 1] - xy[2 * b + 1])
    adj[a].push({ to: b, w: len }); adj[b].push({ to: a, w: len })
  }
  return { xy, adj }
}

/** The nearest `k` graph nodes within `max` metres of a point, with their straight-line distance. */
export function nearestNodes(g: Graph, p: Pt, k = 4, max = 250): { i: number; d: number }[] {
  const out: { i: number; d: number }[] = []
  for (let i = 0; i < g.adj.length; i++) {
    if (!g.adj[i].length) continue
    const d = Math.hypot(g.xy[2 * i] - p[0], g.xy[2 * i + 1] - p[1])
    if (d <= max) out.push({ i, d })
  }
  out.sort((a, b) => a.d - b.d)
  // Only points nearly as close as the nearest one, so a route can't skip the paths with a long straight hop.
  return out.filter((e) => e.d <= out[0].d + 40).slice(0, k)
}

/** Convex hull of points (monotone chain), counter-clockwise. */
export function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Pt[] = [], hi: Pt[] = []
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q) }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)]
}
function distToPoly(p: Pt, poly: Pt[]) {
  let inside = false, d = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i]
    if ((b[1] > p[1]) !== (a[1] > p[1]) && p[0] < (a[0] - b[0]) * (p[1] - b[1]) / (a[1] - b[1]) + b[0]) inside = !inside
    const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    d = Math.min(d, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]))
  }
  return inside ? 0 : d
}

/** Detour factor for walking across the estate on its own paths (not mapped while it's being built). */
export const ESTATE_DETOUR = 1.3
/**
 * Start points for a walk from a block: any path point in or within `margin` metres of the estate,
 * reached across the estate at straight-line distance × ESTATE_DETOUR. Falls back to the nearest points.
 */
export function estateStarts(g: Graph, from: Pt, estate: Pt[], margin = 40): { i: number; d: number }[] {
  const out: { i: number; d: number }[] = []
  for (let i = 0; i < g.adj.length; i++) {
    if (!g.adj[i].length) continue
    const q: Pt = [g.xy[2 * i], g.xy[2 * i + 1]]
    if (distToPoly(q, estate) <= margin) out.push({ i, d: Math.hypot(q[0] - from[0], q[1] - from[1]) * ESTATE_DETOUR })
  }
  return out.length ? out : nearestNodes(g, from, 4, 400).map((e) => ({ ...e, d: e.d * ESTATE_DETOUR }))
}

/** Shortest walking distance from the start points to every node (Dijkstra with a binary heap). */
export function fromStarts(g: Graph, starts: { i: number; d: number }[]) {
  const n = g.adj.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1)
  const heap: [number, number][] = []
  const push = (d: number, i: number) => { heap.push([d, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p } }
  const pop = () => {
    const top = heap[0], last = heap.pop()!
    if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m } }
    return top
  }
  for (const s of starts) if (s.d < dist[s.i]) { dist[s.i] = s.d; push(s.d, s.i) }
  while (heap.length) {
    const [d, i] = pop()
    if (d > dist[i]) continue
    for (const e of g.adj[i]) { const nd = d + e.w; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = i; push(nd, e.to) } }
  }
  return { dist, prev }
}

export interface Route { dist: number; walkMin: number; line: Pt[] }
/** The walking route from the start points (already run through `fromStarts`) to a destination point. */
export function routeTo(g: Graph, run: ReturnType<typeof fromStarts>, from: Pt, to: Pt): Route | null {
  let best: { i: number; total: number } | null = null
  for (const e of nearestNodes(g, to, 6, 300)) { const total = run.dist[e.i] + e.d; if (isFinite(total) && (!best || total < best.total)) best = { i: e.i, total } }
  if (!best) return null
  const line: Pt[] = [to]
  for (let i = best.i; i >= 0; i = run.prev[i]) line.push([g.xy[2 * i], g.xy[2 * i + 1]])
  line.push(from)
  line.reverse()
  return { dist: Math.round(best.total), walkMin: Math.max(1, Math.round(best.total / 80)), line }
}
