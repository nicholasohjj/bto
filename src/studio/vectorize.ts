/**
 * Turn the vector drawing of one HDB unit (from a brochure block plan) into a Flat Studio design:
 * - solid dark rectangles are structural walls,
 * - bands of 2 parallel lines are partitions; a band with a line in the middle is a window,
 * - quarter-circle curves are door swings,
 * - room labels (BEDROOM, KITCHEN, ...) are flood-filled into named rooms.
 * The result is a first draft: the brochure's own drawing goes underneath so it can be checked and fixed.
 */
import type { Curve, PagePrims } from './brochure'
import { detectRoom, rarea, type Opening, type Pt, type Room, type Wall } from './model'

export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface VectorizeResult {
  walls: Omit<Wall, 'id'>[]
  openings: Omit<Opening, 'id'>[]
  rooms: Omit<Room, 'id'>[]
  /** Unit label inside the box ("UNIT 101") and the flat type label ("3 ROOM"), if found. */
  unit: string
  type: string
  /** Size of the selected box in metres (the underlay image covers 0,0 to w,h). */
  w: number; h: number
  stats: { structural: number; partitions: number; doors: number; windows: number; rooms: number }
}

const r3 = (v: number) => +v.toFixed(3)
interface Line { axis: 'h' | 'v'; c: number; a: number; b: number }
interface WallDraft { axis: 'h' | 'v'; c: number; a: number; b: number; th: number; str: boolean }

/** Room label words → display name and floor. */
const ROOMS: [RegExp, string, string][] = [
  [/MAIN\s*BED/i, 'Master Bedroom', 'oak'], [/BED\s*ROOM/i, 'Bedroom', 'oak'], [/LIVING|DINING/i, 'Living & Dining', 'oak'],
  [/DRY\s*KITCHEN/i, 'Dry Kitchen', 'tile'], [/KITCHEN/i, 'Kitchen', 'tile'], [/BATH|W\.?C\b|TOILET/i, 'Bathroom', 'tile'],
  [/HOUSE\s*-?\s*HOLD|SHELTER/i, 'Household Shelter', 'tile'], [/SERVICE\s*YARD|\bYARD\b/i, 'Service Yard', 'tile'],
  [/AIR\s*-?\s*CON|LEDGE/i, 'Air-con Ledge', 'tile'], [/STUDY/i, 'Study', 'oak'], [/STORE/i, 'Store', 'tile'], [/FLEXI/i, 'Flexible Space', 'oak'],
  [/BALCONY/i, 'Balcony', 'tile'], [/UTILITY/i, 'Utility', 'tile'],
]

export function vectorize(P: PagePrims, box: Box, ptPerM: number): VectorizeResult {
  const k = 1 / ptPerM, M = (x: number, y: number): Pt => [(x - box.x0) * k, (y - box.y0) * k]
  const inside = (x: number, y: number, tol = 1) => x >= box.x0 - tol && x <= box.x1 + tol && y >= box.y0 - tol && y <= box.y1 + tol

  /* 1. structural walls from solid dark rectangles */
  const rects: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (const f of P.fills) {
    if (!f.dark || !f.pts.every((p) => inside(p[0], p[1]))) continue
    const q = f.pts.map((p) => M(p[0], p[1])), xs = q.map((p) => p[0]), ys = q.map((p) => p[1])
    const r = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
    const w = r.x1 - r.x0, h = r.y1 - r.y0
    // Skip slivers (door jambs, ticks) and big blocks.
    if (Math.max(w, h) < 0.15 || Math.min(w, h) < 0.08 || Math.min(w, h) > 0.8) continue
    // Only near-rectangles: every corner sits on the bounding box.
    if (!q.every((p) => Math.min(Math.abs(p[0] - r.x0), Math.abs(p[0] - r.x1)) < 0.02 && Math.min(Math.abs(p[1] - r.y0), Math.abs(p[1] - r.y1)) < 0.02)) continue
    if (!rects.some((o) => Math.abs(o.x0 - r.x0) < 0.01 && Math.abs(o.y0 - r.y0) < 0.01 && Math.abs(o.x1 - r.x1) < 0.01 && Math.abs(o.y1 - r.y1) < 0.01)) rects.push(r)
  }
  const inRect = (x: number, y: number, pad = 0.02) => rects.some((r) => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad)
  let drafts: WallDraft[] = rects.map((r) => {
    const w = r.x1 - r.x0, h = r.y1 - r.y0
    return w >= h ? { axis: 'h', c: (r.y0 + r.y1) / 2, a: r.x0 + h / 2, b: r.x1 - h / 2, th: h, str: true } : { axis: 'v', c: (r.x0 + r.x1) / 2, a: r.y0 + w / 2, b: r.y1 - w / 2, th: w, str: true }
  })

  /* 2. partitions and windows from bands of parallel lines */
  const lines: Line[] = []
  for (const s of P.segs) {
    if (!inside(s.x1, s.y1) || !inside(s.x2, s.y2)) continue
    const [x1, y1] = M(s.x1, s.y1), [x2, y2] = M(s.x2, s.y2)
    if (Math.abs(y1 - y2) < 0.01 && Math.abs(x2 - x1) >= 0.25) lines.push({ axis: 'h', c: (y1 + y2) / 2, a: Math.min(x1, x2), b: Math.max(x1, x2) })
    else if (Math.abs(x1 - x2) < 0.01 && Math.abs(y2 - y1) >= 0.25) lines.push({ axis: 'v', c: (x1 + x2) / 2, a: Math.min(y1, y2), b: Math.max(y1, y2) })
  }
  const windows: { axis: 'h' | 'v'; c: number; p: number; w: number }[] = []
  for (const axis of ['h', 'v'] as const) {
    const L = lines.filter((l) => l.axis === axis).sort((p, q) => p.c - q.c)
    // Union lines that are close across (≤ 0.2 m) and overlap along.
    const par = L.map((_, i) => i), find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i])))
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length && L[j].c - L[i].c <= 0.2; j++) {
      if (Math.min(L[i].b, L[j].b) - Math.max(L[i].a, L[j].a) >= 0.15) par[find(j)] = find(i)
    }
    const groups = new Map<number, Line[]>()
    L.forEach((l, i) => { const r = find(i); groups.set(r, [...(groups.get(r) || []), l]) })
    for (const g of groups.values()) {
      const cs = [...new Set(g.map((l) => +l.c.toFixed(2)))].sort((p, q) => p - q)
      if (cs.length < 2) continue
      const lo = cs[0], hi = cs[cs.length - 1], spread = hi - lo
      if (spread < 0.04 || spread > 0.27) continue
      const outer = (c: number) => g.filter((l) => Math.abs(l.c - c) < 0.006)
      const span = (ls: Line[]) => [Math.min(...ls.map((l) => l.a)), Math.max(...ls.map((l) => l.b))]
      const [a1, b1] = span(outer(lo)), [a2, b2] = span(outer(hi)), a = Math.max(a1, a2), b = Math.min(b1, b2)
      if (b - a < 0.2) continue
      const c = (lo + hi) / 2
      const midPt = (u: number): Pt => (axis === 'h' ? [u, c] : [c, u])
      if (inRect(...midPt((a + b) / 2), 0)) continue
      drafts.push({ axis, c, a, b, th: Math.max(0.06, spread), str: false })
      // A line between the outer two is glass: a window over the stretch where it runs.
      const mid = g.filter((l) => l.c > lo + 0.015 && l.c < hi - 0.015 && l.b - l.a >= 0.3)
      if (mid.length) {
        const spans = mid.map((l) => [Math.max(a, l.a), Math.min(b, l.b)]).filter(([p, q]) => q - p >= 0.3).sort((p, q) => p[0] - q[0])
        // Merge overlapping glass runs into windows.
        const merged: number[][] = []
        for (const sp of spans) { const last = merged[merged.length - 1]; if (last && sp[0] <= last[1] + 0.05) last[1] = Math.max(last[1], sp[1]); else merged.push([...sp]) }
        for (const [p, q] of merged) windows.push({ axis, c, p: (p + q) / 2, w: q - p })
      }
    }
  }

  /* 3. doors from quarter-circle swings */
  const arcs = joinCurves(P.curves.filter((cv) => [cv.p0, cv.p1, cv.p2, cv.p3].every((p) => inside(p[0], p[1]))).map((cv) => ({ p0: M(...cv.p0), p1: M(...cv.p1), p2: M(...cv.p2), p3: M(...cv.p3) })))
    .map(arcFromCurve).filter((a): a is Arc => !!a)
  // Dashed swings are often drawn as many short straight dashes: chain them and fit a circle.
  const dashes = P.segs.filter((s) => inside(s.x1, s.y1) && inside(s.x2, s.y2)).map((s): [Pt, Pt] => [M(s.x1, s.y1), M(s.x2, s.y2)]).filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3)
  const arcHints: Pt[] = []
  arcs.push(...dashedArcs(dashes, arcHints))
  for (const a of arcs) arcHints.push(a.a, a.b)
  const doors: { axis: 'h' | 'v'; c: number; p: number; w: number; flip: 1 | -1 }[] = []
  for (const arc of arcs) {
    const d = doorFromArc(arc, drafts)
    if (d && !doors.some((o) => o.axis === d.axis && Math.abs(o.c - d.c) < 0.1 && Math.abs(o.p - d.p) < 0.3)) doors.push(d)
  }
  // Bridge each door gap with a wall so the door sits on one and rooms close.
  for (const d of doors) {
    const near = drafts.filter((w) => w.axis === d.axis && Math.abs(w.c - d.c) < 0.15 && (Math.abs(w.a - (d.p + d.w / 2)) < 0.4 || Math.abs(w.b - (d.p - d.w / 2)) < 0.4 || (w.a < d.p && w.b > d.p)))
    const th = near.length ? Math.min(...near.map((w) => w.th)) : 0.1
    if (near.length) d.c = near.reduce((s, w) => s + w.c, 0) / near.length
    drafts.push({ axis: d.axis, c: d.c, a: d.p - d.w / 2 - 0.05, b: d.p + d.w / 2 + 0.05, th, str: false })
  }

  /* 4. tidy: merge collinear walls, join ends to perpendicular walls, close door-sized gaps */
  drafts = mergeWalls(drafts)
  joinEnds(drafts)
  drafts = mergeWalls(drafts)
  for (const g of closeGaps(drafts, arcHints)) {
    if (!doors.some((d) => d.axis === g.axis && Math.abs(d.c - g.c) < 0.15 && Math.abs(d.p - g.p) < 0.4)) doors.push({ axis: g.axis, c: g.c, p: g.p, w: Math.min(1, g.w - 0.1), flip: -1 })
    drafts.push(g.wall)
  }
  drafts = mergeWalls(drafts)
  const walls: Omit<Wall, 'id'>[] = drafts.filter((w) => w.b - w.a >= 0.1).map((w) => (w.axis === 'h'
    ? { x1: r3(w.a), y1: r3(w.c), x2: r3(w.b), y2: r3(w.c), th: r3(Math.min(0.4, Math.max(0.06, w.th))), str: w.str, fin: 'paint', col: '' }
    : { x1: r3(w.c), y1: r3(w.a), x2: r3(w.c), y2: r3(w.b), th: r3(Math.min(0.4, Math.max(0.06, w.th))), str: w.str, fin: 'paint', col: '' }))

  /* openings snap onto the final walls */
  const onWall = (axis: 'h' | 'v', c: number, p: number) => drafts.find((w) => w.axis === axis && Math.abs(w.c - c) < 0.12 && p > w.a - 0.01 && p < w.b + 0.01)
  const openings: Omit<Opening, 'id'>[] = []
  for (const d of doors) { const w = onWall(d.axis, d.c, d.p); if (w) openings.push({ kind: 'door', axis: d.axis, c: r3(w.c), p: r3(d.p), w: r3(Math.min(1.2, Math.max(0.6, d.w))), flip: d.flip, wt: 'std', dt: 'single' }) }
  const label = (re: RegExp, x: number, y: number) => P.texts.some((t) => re.test(t.s) && inside(t.x, t.y, 40) && Math.hypot(M(t.x, t.y)[0] - x, M(t.x, t.y)[1] - y) < 1.6)
  for (const wd of windows) {
    const w = onWall(wd.axis, wd.c, wd.p)
    if (!w || openings.some((o) => o.axis === wd.axis && Math.abs(o.c - w.c) < 0.12 && Math.abs(o.p - wd.p) < (o.w + wd.w) / 2)) continue
    const [mx, my] = wd.axis === 'h' ? [wd.p, wd.c] : [wd.c, wd.p]
    openings.push({ kind: 'window', axis: wd.axis, c: r3(w.c), p: r3(wd.p), w: r3(Math.min(5, wd.w)), flip: -1, wt: label(/^W1$/, mx, my) ? 'tall' : 'std', dt: 'single' })
  }

  /* 5. rooms from labels */
  const full: Wall[] = walls.map((w, i) => ({ ...w, id: 'v' + i }))
  const rooms: Omit<Room, 'id'>[] = []
  for (const lb of roomLabels(P, box, k)) {
    const kind = ROOMS.find(([re]) => re.test(lb.s))
    if (!kind) continue
    const pts = detectRoom(full, { x: lb.x, y: lb.y }, true)
    if (!pts) continue
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const room: Omit<Room, 'id'> = { name: kind[1], floor: kind[2], x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), pts }
    if (rarea(room) < 0.4 || rooms.some((r) => Math.abs(rarea(r) - rarea(room)) < 0.05 && Math.abs(r.x - room.x) < 0.05 && Math.abs(r.y - room.y) < 0.05)) continue
    rooms.push(room)
  }
  numberRooms(rooms)

  const unitT = P.texts.find((t) => /^UNIT\s*\d+/i.test(t.s.trim()) && inside(t.x, t.y, 30))
  const typeT = unitT && P.texts.find((t) => /ROOM|FLEXI|EXEC|3GEN/i.test(t.s) && Math.abs(t.x - unitT.x) < 40 && Math.abs(t.y - unitT.y) < 24 && !/BED|LIVING|BATH/i.test(t.s))
  return {
    walls, openings, rooms, unit: unitT?.s.trim() ?? '', type: typeT?.s.trim() ?? '',
    w: (box.x1 - box.x0) * k, h: (box.y1 - box.y0) * k,
    stats: { structural: walls.filter((w) => w.str).length, partitions: walls.filter((w) => !w.str).length, doors: openings.filter((o) => o.kind === 'door').length, windows: openings.filter((o) => o.kind === 'window').length, rooms: rooms.length },
  }
}

/** Join curves that continue one another (a quarter circle is often drawn as 1 or 2 Béziers). */
function joinCurves(cs: Curve[]): { a: Pt; b: Pt; ctrl: Pt[] }[] {
  const out: { a: Pt; b: Pt; ctrl: Pt[] }[] = []
  for (const c of cs) {
    const last = out[out.length - 1]
    if (last && Math.hypot(last.b[0] - c.p0[0], last.b[1] - c.p0[1]) < 0.01) { last.b = c.p3; last.ctrl.push(c.p1, c.p2) }
    else out.push({ a: c.p0, b: c.p3, ctrl: [c.p1, c.p2] })
  }
  return out
}

/** A swing arc: centre (the hinge), radius and its two ends. */
interface Arc { H: Pt; r: number; a: Pt; b: Pt }

/** A quarter-circle Bézier arc → its centre: the control points bulge away from it. */
function arcFromCurve(arc: { a: Pt; b: Pt; ctrl: Pt[] }): Arc | null {
  const [ax, ay] = arc.a, [bx, by] = arc.b, ch = Math.hypot(bx - ax, by - ay)
  if (ch < 1e-3) return null
  const mx = (ax + bx) / 2, my = (ay + by) / 2, ux = (bx - ax) / ch, uy = (by - ay) / ch, nx = -uy, ny = ux
  const cx = arc.ctrl.reduce((s, p) => s + p[0], 0) / arc.ctrl.length, cy = arc.ctrl.reduce((s, p) => s + p[1], 0) / arc.ctrl.length
  const side = (cx - mx) * nx + (cy - my) * ny > 0 ? -1 : 1
  return { H: [mx + side * nx * ch / 2, my + side * ny * ch / 2], r: ch / Math.SQRT2, a: arc.a, b: arc.b }
}

/** Least-squares circle through points (Kåsa fit); null if they're nearly straight. */
function fitCircle(pts: Pt[]): { cx: number; cy: number; r: number; err: number } | null {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0
  const n = pts.length
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z }
  // Solve [sxx sxy sx; sxy syy sy; sx sy n] [D E F] = -[sxz syz sz]
  const A = [[sxx, sxy, sx, -sxz], [sxy, syy, sy, -syz], [sx, sy, n, -sz]]
  for (let i = 0; i < 3; i++) {
    let piv = i
    for (let j = i + 1; j < 3; j++) if (Math.abs(A[j][i]) > Math.abs(A[piv][i])) piv = j
    ;[A[i], A[piv]] = [A[piv], A[i]]
    if (Math.abs(A[i][i]) < 1e-12) return null
    for (let j = 0; j < 3; j++) if (j !== i) { const f = A[j][i] / A[i][i]; for (let k = i; k < 4; k++) A[j][k] -= f * A[i][k] }
  }
  const D = A[0][3] / A[0][0], E = A[1][3] / A[1][1], F = A[2][3] / A[2][2], cx = -D / 2, cy = -E / 2, r2 = cx * cx + cy * cy - F
  if (!(r2 > 0)) return null
  const r = Math.sqrt(r2), err = Math.max(...pts.map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r)))
  return { cx, cy, r, err }
}

/** Chain dashes that continue one another (small gap, smooth turn) and keep chains that fit a door-sized quarter circle. */
function dashedArcs(dashes: [Pt, Pt][], hints: Pt[] = []): Arc[] {
  const n = dashes.length, used = new Uint8Array(n), out: Arc[] = []
  const dir = (d: [Pt, Pt]) => Math.atan2(d[1][1] - d[0][1], d[1][0] - d[0][0])
  const link = (i: number, j: number) => {
    const [a0, a1] = dashes[i], [b0, b1] = dashes[j]
    const gap = Math.min(Math.hypot(a1[0] - b0[0], a1[1] - b0[1]), Math.hypot(a0[0] - b1[0], a0[1] - b1[1]), Math.hypot(a0[0] - b0[0], a0[1] - b0[1]), Math.hypot(a1[0] - b1[0], a1[1] - b1[1]))
    let da = Math.abs(dir(dashes[i]) - dir(dashes[j])) % Math.PI
    da = Math.min(da, Math.PI - da)
    return gap < 0.25 && da < 0.6
  }
  for (let s = 0; s < n; s++) {
    if (used[s]) continue
    const chain = [s]
    used[s] = 1
    for (let q = 0; q < chain.length; q++) for (let j = 0; j < n; j++) if (!used[j] && link(chain[q], j)) { used[j] = 1; chain.push(j) }
    if (chain.length < 4) continue
    const pts = chain.flatMap((i) => dashes[i])
    const c = fitCircle(pts)
    if (!c || c.r < 0.35 || c.r > 1.3 || c.err > 0.08) continue
    // Curved, door-sized dashes: evidence of a door here even if it isn't a clean quarter circle.
    hints.push(...pts.filter((_, i) => i % 4 === 0))
    if (c.err > 0.04) continue
    // The arc's ends are its extreme angles.
    const ang = pts.map(([x, y]) => Math.atan2(y - c.cy, x - c.cx)), base = ang[0]
    const rel = ang.map((a) => { let d = a - base; while (d <= -Math.PI) d += 2 * Math.PI; while (d > Math.PI) d -= 2 * Math.PI; return d })
    const lo = Math.min(...rel), hi = Math.max(...rel), sweep = hi - lo
    if (sweep < 1.2 || sweep > 1.95) continue
    const at = (d: number): Pt => [c.cx + c.r * Math.cos(base + d), c.cy + c.r * Math.sin(base + d)]
    out.push({ H: [c.cx, c.cy], r: c.r, a: at(lo), b: at(hi) })
  }
  return out
}

/** A door from a swing arc: the hinge is the arc's centre, the door lies along the wall through it. */
function doorFromArc(arc: Arc, walls: WallDraft[]) {
  const { H, r } = arc
  if (r < 0.35 || r > 1.3) return null
  // Both radii must be roughly axis-aligned (a quarter circle on a straight wall).
  const radii = [arc.a, arc.b].map((p) => ({ p, dx: p[0] - H[0], dy: p[1] - H[1] }))
  if (!radii.every((q) => Math.min(Math.abs(q.dx), Math.abs(q.dy)) < 0.12 * r)) return null
  // The radius that runs along a wall is the closed door; the other is the open leaf.
  let best: { axis: 'h' | 'v'; c: number; p: number; flip: 1 | -1; d: number } | null = null
  for (const [i, q] of radii.entries()) {
    const other = radii[1 - i], axis: 'h' | 'v' = Math.abs(q.dx) > Math.abs(q.dy) ? 'h' : 'v'
    const c = axis === 'h' ? H[1] : H[0], p = axis === 'h' ? H[0] + q.dx / 2 : H[1] + q.dy / 2
    const near = walls.filter((w) => w.axis === axis && Math.abs(w.c - c) < 0.2)
    if (!near.length) continue
    const d = Math.min(...near.map((w) => Math.abs(w.c - c) + Math.max(0, w.a - p - r, p - r - w.b)))
    const flip: 1 | -1 = (axis === 'h' ? other.dy : other.dx) > 0 ? 1 : -1
    if (!best || d < best.d) best = { axis, c, p, flip, d }
  }
  return best ? { axis: best.axis, c: best.c, p: best.p, w: r, flip: best.flip } : null
}

/** Merge walls on the same line that touch or overlap (keeping structural and partition walls apart). */
function mergeWalls(ws: WallDraft[]): WallDraft[] {
  const out: WallDraft[] = []
  for (const w of [...ws].sort((p, q) => (p.axis === q.axis ? (Math.abs(p.c - q.c) < 0.04 ? p.a - q.a : p.c - q.c) : p.axis < q.axis ? -1 : 1))) {
    const m = out.find((o) => o.axis === w.axis && o.str === w.str && Math.abs(o.c - w.c) < 0.04 && w.a <= o.b + 0.06 && w.b >= o.a - 0.06)
    if (m) { const len = m.b - m.a, wl = w.b - w.a; m.c = (m.c * len + w.c * wl) / (len + wl || 1); m.a = Math.min(m.a, w.a); m.b = Math.max(m.b, w.b); m.th = Math.max(m.th, w.th) }
    else out.push({ ...w })
  }
  return out
}

/** Extend or trim wall ends onto the centre line of a perpendicular wall they nearly meet. */
function joinEnds(ws: WallDraft[]) {
  for (const w of ws) for (const end of ['a', 'b'] as const) {
    let best: number | null = null, bd = 0.35
    for (const o of ws) {
      if (o.axis === w.axis) continue
      // o's centre line is at o.c along w's axis; w's line (w.c) must fall within o's extent.
      if (w.c < o.a - (w.th / 2 + 0.15) || w.c > o.b + (w.th / 2 + 0.15)) continue
      const d = Math.abs(o.c - w[end])
      if (d < bd) { bd = d; best = o.c }
    }
    if (best !== null) w[end] = best
  }
  for (const w of ws) if (w.a > w.b) [w.a, w.b] = [w.b, w.a]
}

/**
 * Gaps a door could fill: a wall end facing another wall 0.45–1.3 m away along its line. Returns a
 * bridging wall for each, so rooms close, and the gap as a door position.
 */
function closeGaps(ws: WallDraft[], hints: Pt[]) {
  const out: { axis: 'h' | 'v'; c: number; p: number; w: number; wall: WallDraft }[] = []
  // An end is joined if another wall carries on from it or runs through it.
  const joined = (w: WallDraft, end: number) => ws.some((o) => o !== w && (o.axis === w.axis
    ? Math.abs(o.c - w.c) < 0.06 && end >= o.a - 0.03 && end <= o.b + 0.03
    : Math.abs(o.c - end) < o.th / 2 + 0.03 && w.c >= o.a - o.th / 2 - 0.03 && w.c <= o.b + o.th / 2 + 0.03))
  for (const w of ws) for (const dirn of [-1, 1] as const) {
    const end = dirn > 0 ? w.b : w.a
    if (joined(w, end)) continue
    let best: { d: number; to: number; perp: boolean } | null = null
    for (const o of ws) {
      if (o === w) continue
      if (o.axis === w.axis) {
        if (Math.abs(o.c - w.c) > 0.06) continue
        const d = dirn > 0 ? o.a - end : end - o.b
        if (d > 0.02 && (!best || d < best.d)) best = { d, to: dirn > 0 ? o.a : o.b, perp: false }
      } else {
        // Gaps to a crossing wall need a door swing drawn nearby; without one it's an open passage.
        if (w.str || w.c < o.a - o.th / 2 - 0.02 || w.c > o.b + o.th / 2 + 0.02) continue

        const face = o.c - dirn * o.th / 2, d = (face - end) * dirn
        if (d > 0.02 && (!best || d < best.d)) best = { d, to: o.c, perp: true }
      }
    }
    if (!best || best.d < 0.45 || best.d > 1.3) continue
    const a = Math.min(end, best.to), b = Math.max(end, best.to), p = dirn > 0 ? end + best.d / 2 : end - best.d / 2
    const mid: Pt = w.axis === 'h' ? [p, w.c] : [w.c, p]
    if (best.perp && !hints.some((h) => Math.hypot(h[0] - mid[0], h[1] - mid[1]) < 1.1)) continue
    if (out.some((g) => g.axis === w.axis && Math.abs(g.c - w.c) < 0.06 && Math.abs(g.p - p) < 0.2)) continue
    out.push({ axis: w.axis, c: w.c, p, w: best.d, wall: { axis: w.axis, c: w.c, a, b, th: w.str ? 0.1 : w.th, str: false } })
  }
  return out
}

/** Room labels in the box, joining labels split over lines ("HOUSE-" / "HOLD" / "SHELTER"). Positions in metres. */
function roomLabels(P: PagePrims, box: Box, k: number) {
  const ts = P.texts.filter((t) => t.x >= box.x0 && t.x <= box.x1 && t.y >= box.y0 && t.y <= box.y1 && /[A-Z]{2,}/.test(t.s) && !/^UNIT|^W\d$|SCALE|METRE|^\d/.test(t.s.trim()))
    .map((t) => ({ s: t.s.trim(), x: (t.x - box.x0) * k, y: (t.y - box.y0) * k, h: t.size * k, used: false }))
  ts.sort((p, q) => p.y - q.y)
  const out: { s: string; x: number; y: number }[] = []
  for (const t of ts) {
    if (t.used) continue
    t.used = true
    let s = t.s, y = t.y
    const xs = [t.x]
    for (const u of ts) {
      if (u.used || u.y <= y || u.y - y > Math.max(0.45, t.h * 1.8) || Math.abs(u.x - t.x) > 0.5) continue
      if (!/-$/.test(s) && ROOMS.some(([re]) => re.test(s)) && !/^(CON|LEDGE|HOLD|SHELTER|YARD|UTILITY|KITCHEN|WC|DINING)$/i.test(u.s)) continue
      s = /-$/.test(s) ? s.slice(0, -1) + u.s : s + ' ' + u.s
      y = u.y; u.used = true; xs.push(u.x)
    }
    // The label's middle, nudged up from the text baseline.
    out.push({ s, x: Math.min(...xs) + 0.25, y: (t.y + y) / 2 - t.h * 0.35 })
  }
  return out
}

/** "Bedroom", "Bedroom" → "Bedroom 2", "Bedroom 3"; two bathrooms → "Common Bath" and "Master Bath" by size. */
function numberRooms(rooms: Omit<Room, 'id'>[]) {
  const beds = rooms.filter((r) => r.name === 'Bedroom')
  if (beds.length > 1 || rooms.some((r) => r.name === 'Master Bedroom')) beds.sort((p, q) => p.x - q.x || p.y - q.y).forEach((r, i) => { r.name = `Bedroom ${i + 2}` })
  const baths = rooms.filter((r) => r.name === 'Bathroom')
  if (baths.length === 2) {
    const master = rooms.find((r) => r.name === 'Master Bedroom')
    const dist = (r: Omit<Room, 'id'>) => (master ? Math.hypot(r.x + r.w / 2 - (master.x + master.w / 2), r.y + r.h / 2 - (master.y + master.h / 2)) : -rarea(r))
    const [m, c] = [...baths].sort((p, q) => dist(p) - dist(q))
    m.name = 'Master Bath'; c.name = 'Common Bath'
  }
}

export const _test = { closeGaps, mergeWalls, joinEnds, joinCurves, doorFromArc, fitCircle, dashedArcs, arcFromCurve }
