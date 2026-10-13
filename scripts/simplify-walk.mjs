// Shrink a snapshot's walking network: simplify each path to within 2 m, always keeping junctions
// (points shared by more than one path, and path ends) so the network stays connected.
import { readFileSync, writeFileSync } from 'node:fs'

export function simplifyWalk(walk, tol = 2) {
  const { nodes, ways } = walk, uses = new Map()
  for (const w of ways) w.forEach((n, i) => uses.set(n, (uses.get(n) || 0) + (i === 0 || i === w.length - 1 ? 2 : 1)))
  const keep = (n) => (uses.get(n) || 0) > 1
  const P = (n) => [nodes[2 * n], nodes[2 * n + 1]]
  const dp = (list) => {
    if (list.length < 3) return list
    const [ax, ay] = P(list[0]), [bx, by] = P(list[list.length - 1]), L = Math.hypot(bx - ax, by - ay) || 1e-9
    let md = -1, mi = 0
    for (let i = 1; i < list.length - 1; i++) { const [px, py] = P(list[i]), d = Math.abs((px - ax) * (by - ay) - (py - ay) * (bx - ax)) / L; if (d > md) { md = d; mi = i } }
    return md > tol ? [...dp(list.slice(0, mi + 1)).slice(0, -1), ...dp(list.slice(mi))] : [list[0], list[list.length - 1]]
  }
  const outWays = []
  for (const w of ways) {
    // Split at junctions, simplify each piece.
    let piece = [w[0]]
    const res = [w[0]]
    for (let i = 1; i < w.length; i++) {
      piece.push(w[i])
      if (keep(w[i]) || i === w.length - 1) { res.push(...dp(piece).slice(1)); piece = [w[i]] }
    }
    outWays.push(res)
  }
  const remap = new Map(), outNodes = []
  const id = (n) => { if (!remap.has(n)) { remap.set(n, outNodes.length / 2); outNodes.push(nodes[2 * n], nodes[2 * n + 1]) } return remap.get(n) }
  return { nodes: outNodes, ways: outWays.map((w) => w.map(id)) }
}

// Run directly (not when imported by osm-snapshot.mjs): simplify an existing snapshot in place.
if (process.argv[2] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const f = `src/surroundings/sites/${process.argv[2]}.osm.json`, d = JSON.parse(readFileSync(f, 'utf8'))
  const before = d.walk.nodes.length / 2
  d.walk = simplifyWalk(d.walk)
  writeFileSync(f, JSON.stringify(d))
  console.log(`walk nodes ${before} -> ${d.walk.nodes.length / 2}`)
}
