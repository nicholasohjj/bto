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
