/** Flat Studio checks: changes against the original layout, layout clashes, clearances and a rough lighting guide. */
import type { Catalog } from './budget'
import { TALL_CARP } from './carpentry'
import { clamp, itemPoly, pip, polyOverlap, rarea, rcent, rpts, wallCover, wallInfo, type Design, type Item, type Pt, type Room } from './model'

export interface Check { lvl: 'warn' | 'info'; msg: string; cat: 'walls' | 'wet' | 'layout' | 'clear' | 'ceiling' | 'electrical' }

const f1 = (v: number) => v.toFixed(1)

export function runChecks(S: Design, cat: Catalog, extra: ((S: Design) => Check[])[] = []): Check[] {
  const out: Check[] = [], add = (lvl: Check['lvl'], msg: string, c: Check['cat']) => out.push({ lvl, msg, cat: c }), B = S.base
  const nm = (t: string) => cat[t] ? cat[t].n : t
  if (B) {
    for (const b of B.walls) {
      const cv = wallCover(b, S.walls), len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1), isStr = b.str || S.walls.some((w) => w.str && wallCover(b, [w]) > 0.5)
      if (cv < 0.95) add(isStr ? 'warn' : 'info', `${cv < 0.05 ? 'Removed' : 'Shortened'} wall: ${f1(len)} m wall at (${f1(b.x1)}, ${f1(b.y1)}) to (${f1(b.x2)}, ${f1(b.y2)}), ${Math.round((1 - cv) * 100)}% gone.${isStr ? ' You marked this wall structural, so it must stay. Do not hack it.' : ' If it is structural it cannot be removed. Confirm with HDB and a registered contractor before work.'}`, 'walls')
    }
    for (const w of S.walls) { const cv = wallCover(w, B.walls); if (cv < 0.5) add('info', `New wall: ${f1(Math.hypot(w.x2 - w.x1, w.y2 - w.y1))} m at (${f1(w.x1)}, ${f1(w.y1)}). New partitions still need to follow HDB's renovation rules.`, 'walls') }
    const cur = S.items.filter((i) => cat[i.type] && cat[i.type].wet), pool = B.wet.map((x) => ({ ...x, used: false }))
    for (const it of cur) {
      let best: (typeof pool)[number] | null = null, bd = 1e9
      for (const p of pool) { if (p.used || p.type !== it.type) continue; const d = Math.hypot(p.x - it.x, p.y - it.y); if (d < bd) { bd = d; best = p } }
      if (!best) { add('info', `${nm(it.type)} is new, it was not in the original layout.`, 'wet'); continue }
      best.used = true
      if (bd > 0.3) add(bd > 1 ? 'warn' : 'info', `${nm(it.type)} moved ${bd.toFixed(1)} m from its original position. Moving wet fixtures changes pipes and waterproofing, so check what is allowed before you commit.`, 'wet')
    }
    for (const p of pool) if (!p.used) add('info', `${nm(p.type)} from the original layout is no longer in the design.`, 'wet')
    for (const w of S.walls.filter((x) => x.str)) {
      for (const o of wallInfo(w, S.openings).ops) {
        if (!B.ops.some((b) => b.axis === o.axis && Math.abs(b.c - o.c) < 0.1 && Math.abs(b.p - o.p) < 0.3 && b.kind === o.kind)) add('warn', `A new ${o.kind} opening is cut into a wall you marked structural, near (${f1(o.axis === 'h' ? o.p : o.c)}, ${f1(o.axis === 'h' ? o.c : o.p)}).`, 'walls')
      }
    }
  }
  /* design sanity checks */
  const its = S.items.filter((i) => { const k = cat[i.type]; return k && !k.flat && !k.elev && !k.svc && !k.top && !k.missing })
  for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) {
    const A = its[i], Bq = its[j]
    if (Math.hypot(A.x - Bq.x, A.y - Bq.y) > Math.max(A.w, A.d) + Math.max(Bq.w, Bq.d)) continue
    if (cat[A.type].n === 'Dining set' || cat[Bq.type].n === 'Dining set') continue
    if (polyOverlap(itemPoly(A), itemPoly(Bq))) add('warn', `${nm(A.type)} overlaps ${nm(Bq.type)} near (${f1(A.x)}, ${f1(A.y)}).`, 'layout')
  }
  for (const it of its) if (S.rooms.length && !S.rooms.some((r) => pip(it.x, it.y, rpts(r)))) add('warn', `${nm(it.type)} at (${f1(it.x)}, ${f1(it.y)}) is outside every room.`, 'layout')
  for (const o of S.openings) {
    if (o.kind !== 'door' || (o.dt && o.dt !== 'single' && o.dt !== 'double')) continue
    const f = o.flip || -1, half = o.dt === 'double' ? o.w / 2 : o.w, hs: [number, number][] = o.dt === 'double' ? [[o.p - o.w / 2, 1], [o.p + o.w / 2, -1]] : [[o.p - o.w / 2, 1]]
    let hit: Item | null = null
    for (const [hu, dir] of hs) {
      for (let u = 0.05; u <= half && !hit; u += 0.1) for (let n = 0.05; n <= half && !hit; n += 0.1) {
        if (u * u + n * n > half * half) continue
        const uu = hu + dir * u, nn = f * n, px = o.axis === 'h' ? uu : o.c + nn, py = o.axis === 'h' ? o.c + nn : uu
        for (const it of its) if (pip(px, py, itemPoly(it))) { hit = it; break }
      }
    }
    const at = `(${f1(o.axis === 'h' ? o.p : o.c)}, ${f1(o.axis === 'h' ? o.c : o.p)})`
    if (hit) add('warn', `A door near ${at} swings into the ${nm(hit.type).toLowerCase()}. Flip it, resize it or move the furniture.`, 'layout')
    if (o.w < 0.75) add('info', `A door near ${at} is only ${Math.round(o.w * 1000)} mm wide.`, 'layout')
  }
  /* clearance checks */
  const nearWall = (px: number, py: number) => {
    for (const w of S.walls) {
      const T = wallInfo(w, S.openings).th / 2 + 0.03, dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy || 1, t = clamp(((px - w.x1) * dx + (py - w.y1) * dy) / L2, 0, 1)
      if (Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy)) < T) return true
    }
    return false
  }
  const blocked = (px: number, py: number, self: Item) => {
    if (nearWall(px, py)) return true
    for (const o of its) { if (o === self) continue; if (pip(px, py, itemPoly(o))) return true }
    return false
  }
  const sideOpen = (it: Item, sx: number, sy: number, dist: number) => {
    const a = it.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
    let bad = 0
    for (const k of [-0.7, 0, 0.7]) {
      const lx = sx ? sx * (it.w / 2 + dist) : k * it.w / 2, ly = sy ? sy * (it.d / 2 + dist) : k * it.d / 2
      if (blocked(it.x + lx * c - ly * s, it.y + lx * s + ly * c, it)) bad++
    }
    return bad < 2
  }
  for (const it of its) {
    const at = `near (${f1(it.x)}, ${f1(it.y)})`
    if (['bed_q', 'bed_k', 'bed_s', 'bed_ss'].includes(it.type)) {
      const L = sideOpen(it, -1, 0, 0.6), R = sideOpen(it, 1, 0, 0.6), F = sideOpen(it, 0, 1, 0.6)
      if (!L && !R && !F) add('warn', `${nm(it.type)} ${at} has less than 60 cm of free space on every side. There is no way to get into the bed.`, 'clear')
      else if (it.type !== 'bed_s' && it.type !== 'bed_ss' && !L && !R) add('info', `${nm(it.type)} ${at} can only be reached from the foot. Leave 60 cm on at least one long side.`, 'clear')
      else if (it.type !== 'bed_s' && it.type !== 'bed_ss' && (+!L + +!R) === 1 && !F) add('info', `${nm(it.type)} ${at} is tight on two sides. A 60 cm walkway on one long side is the usual minimum.`, 'clear')
    }
    if (['ward', 'wardS', 'dress', 'ctall'].includes(it.type) && !sideOpen(it, 0, 1, it.type === 'dress' ? 0.5 : 0.6)) add('warn', `${nm(it.type)} ${at} has less than ${it.type === 'dress' ? 50 : 60} cm in front, so doors and drawers will be hard to use.`, 'clear')
  }
  const TALL = ['ward', 'wardS', 'bookc', 'shelf', 'fridgeL', 'fridge', 'bunk', ...TALL_CARP]
  for (const o of S.openings) {
    if (o.kind !== 'window') continue
    const mx = o.axis === 'h' ? o.p : o.c, my = o.axis === 'h' ? o.c : o.p
    for (const it of its) {
      if (!TALL.includes(it.type)) continue
      let hit = false
      for (const u of [-0.4, 0, 0.4]) for (const n of [-0.35, 0.35]) {
        const px = o.axis === 'h' ? o.p + u * o.w : o.c + n, py = o.axis === 'h' ? o.c + n : o.p + u * o.w
        if (pip(px, py, itemPoly(it))) hit = true
      }
      if (hit) add('info', `${nm(it.type)} stands in front of the window near (${f1(mx)}, ${f1(my)}). It will block light and make the window hard to open.`, 'clear')
    }
  }
  for (const fn of extra) out.push(...fn(S))
  return out
}

/* lighting guide */
const LUX: [RegExp, number, string][] = [[/bath|toilet|wc/i, 200, 'bathroom'], [/kitchen/i, 300, 'kitchen'], [/study|office|work/i, 300, 'study'], [/living|dining|hall/i, 150, 'living'], [/bed|master/i, 100, 'bedroom'], [/yard|service|store|corridor/i, 100, 'utility']]
export const LM_PER_LIGHT = 1000
export interface LightRow { r: Room; ar: number; lux: number; kind: string; want: number; have: number; lamps: number }
/** Rough guide: target lux by room name, 1000 lm ceiling lights at 50% efficiency. */
export function lightPlan(S: Design, cat: Catalog): LightRow[] {
  return S.rooms.map((r) => {
    const ar = rarea(r), rule = LUX.find((x) => x[0].test(r.name)) || [null, 150, 'general'], lux = rule[1] as number, need = lux * ar / 0.5, want = Math.max(1, Math.round(need / LM_PER_LIGHT))
    const inRoom = (x: number, y: number) => pip(x, y, rpts(r))
    const have = S.items.filter((it) => ['ceilL', 'pendant', 'downl'].includes(it.type) && inRoom(it.x, it.y)).length
    const lamps = S.items.filter((it) => cat[it.type] && cat[it.type].lamp && !['ceilL', 'pendant', 'downl'].includes(it.type) && inRoom(it.x, it.y)).length
    return { r, ar, lux, kind: rule[2] as string, want, have, lamps }
  })
}
/** Grid positions inside a room for `n` more ceiling lights. */
export function lightSpots(r: Room, n: number): Pt[] {
  const pts = rpts(r), xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const cand: Pt[] = [], cols = Math.ceil(Math.sqrt(n * (x1 - x0) / (y1 - y0 || 1))), rows = Math.ceil(n / cols)
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = x0 + (i + 0.5) * (x1 - x0) / cols, y = y0 + (j + 0.5) * (y1 - y0) / rows
    if (pip(x, y, pts)) cand.push([+x.toFixed(2), +y.toFixed(2)])
  }
  if (!cand.length) { const c = rcent(r); cand.push([c.x, c.y]) }
  return cand.slice(0, n)
}

export function checksText(S: Design, cat: Catalog, extra: ((S: Design) => Check[])[] = []) {
  const r = runChecks(S, cat, extra), L = ['CHECKS (planning aid only, not an HDB approval)']
  if (!S.base) L.push('  No original layout was set, so changes to walls and wet areas were not compared.')
  if (!r.length) L.push('  No issues found.')
  r.forEach((x) => L.push(`  [${x.lvl === 'warn' ? 'CHECK' : 'NOTE'}] ${x.msg}`))
  return L.join('\n')
}
