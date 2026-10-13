/**
 * Flat Studio's inspector (right panel): settings for the flat or the selection, the schedule,
 * the budget with quotes, and the checks. Also the selection operations that the keyboard uses
 * (delete, copy, paste, duplicate, rotate, align, group).
 */
import { budgetLines, budgetTotal, money } from './budget'
import { carpHtml, setCfg } from './carpentry'
import { DTYPES, FINS, FLOORS, SW, WALLS, WTYPES } from './catalog'
import { ceilHtml, ceilOf, setCeil } from './ceiling'
import { lightPlan, lightSpots, runChecks } from './checks'
import { $, $$, copyText, esc, target } from './dom'
import { renderOpts } from './leftPanel'
import { applyPreset, PRESETS } from './materials'
import { clamp, rarea, rpts, sn, syncBox, uid, type Dim, type Item, type Opening, type Pt, type Room, type Wall } from './model'
import { parseQuote, quoteDialogHtml, quotesHtml } from './quotes'
import type { App, Sel, SelType, Tab } from './ui'

let app: App
const deep = <T>(o: T): T => JSON.parse(JSON.stringify(o))
const asRec = (o: object) => o as unknown as Record<string, unknown>

/* small form builders */
const num = (k: string, v: number, step = 0.05, min = 0.1, max = 60) => `<input type="number" data-k="${k}" value="${(+v).toFixed(2)}" step="${step}" min="${min}" max="${max}" inputmode="decimal">`
const row = (l: string, h: string) => `<label class="row"><span>${l}</span>${h}</label>`
const sw = (act: string, cols: string[], cur: string) => `<div class="sw">${cols.map((c) => `<button data-act="${act}" data-v="${c}" style="background:${c}" aria-label="Colour ${c}" aria-pressed="${c.toLowerCase() === String(cur).toLowerCase()}"></button>`).join('')}</div>`
const MATS: [string, string][] = [['wood', 'Timber grain'], ['fabric', 'Fabric'], ['leather', 'Leather'], ['metal', 'Metal'], ['gloss', 'Gloss']]

export function renderRight() {
  try { app.fillViews() } catch { /* the 3D bar may not be ready yet */ }
  $$('.tabs [data-rt]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.rt === app.rtab)))
  const el = $('#rbody'), S = app.S
  if (!S) return
  if (app.rtab === 'schedule') { el.innerHTML = scheduleHtml(); return }
  if (app.rtab === 'budget') { el.innerHTML = budgetHtml(); return }
  if (app.rtab === 'checks') { el.innerHTML = checksHtml(); return }
  if (app.ms.length) { el.innerHTML = multiHtml(); return }
  const sel = app.sel, e = sel && app.getE(sel.t, sel.id)
  el.innerHTML = !sel || !e ? flatHtml() : sel.t === 'item' ? itemHtml(e as Item) : sel.t === 'room' ? roomHtml(e as Room) : sel.t === 'wall' ? wallHtml(e as Wall) : sel.t === 'dim' ? dimHtml(e as Dim) : openingHtml(e as Opening)
}

function flatHtml() {
  const S = app.S, tot = S.rooms.reduce((a, r) => a + rarea(r), 0)
  return `<div class="sec"><h3>Flat</h3>${row('Name', `<input type="text" data-k="name" value="${esc(S.name)}" maxlength="60">`)}${row('Ceiling (m)', num('H', S.H, 0.05, 2.2, 3.2))}
    <div style="margin-bottom:6px;color:var(--ink2)">Wall paint (all walls)</div>${sw('wallcol', WALLS, S.wallColor)}
    <div style="margin:12px 0 6px;color:var(--ink2)">Ceiling colour</div>${sw('ceilcol', ['#f8f7f4', '#ece8df', '#dfe6ea', '#f1e6df'], S.ceilCol || '#f8f7f4')}
    <label class="chk"><input type="checkbox" data-act="skirt"${S.skirt ? ' checked' : ''}> Skirting boards</label>
    <div style="height:10px"></div>${row('Style preset', `<select data-preset="1"><option value="">Choose a style…</option>${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.n}</option>`).join('')}</select>`)}<p class="note" style="margin-top:0">Sets walls, floors, carpentry laminate and soft furnishings together. Undo to go back.</p>${S.skirt ? sw('skirtcol', ['#f4f2ee', '#d9d3c5', '#8a6f55', '#3a3d3f'], S.skirtCol || '#f4f2ee') : ''}</div>
    <div class="sec"><h3>Summary</h3><div class="kv"><span>Floor area</span><b>${tot.toFixed(1)} m²</b></div><div class="kv"><span>Rooms</span><b>${S.rooms.length}</b></div>
    <div class="kv"><span>Doors / windows</span><b>${S.openings.filter((o) => o.kind === 'door').length} / ${S.openings.filter((o) => o.kind === 'window').length}</b></div><div class="kv"><span>Furniture items</span><b>${S.items.length}</b></div>
    <p class="note">Click anything on the plan or in 3D to edit it. Hacking or moving a wall in an HDB flat needs an HDB permit and a registered renovation contractor. ${S.walls.some((w) => w.str) ? 'Walls with red dashes are marked structural (from the brochure plan, or by you). Check your unit\'s plan too.' : 'This tool does not know which walls are structural. Mark them in a wall\'s settings.'}</p></div>`
}

function itemHtml(e: Item) {
  const k = app.cat[e.type]
  return `<div class="sec"><h3>${esc(k.n)}</h3>${row('Width (m)', num('w', e.w))}${row('Depth (m)', num('d', e.d))}${k.m ? row('Height (m)', num('h', e.h || k.h || 0.5)) : ''}${row('Rotation °', num('rot', e.rot, 15, 0, 359).replace('.00', ''))}
    ${k.carp ? carpHtml(e, app.S.H) : k.m ? '' : `<div style="margin-bottom:6px;color:var(--ink2)">Colour</div>${sw('col', SW, e.color)}${row('Material', `<select data-k="mt"><option value="">Plain</option>${MATS.map(([v, n]) => `<option value="${v}"${e.mt === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`)}`}
    ${row('Product name', `<input type="text" data-k="nm" value="${esc(e.nm || '')}" maxlength="40" placeholder="optional">`)}${row('Your price ($)', `<input type="number" data-k="pr" value="${e.pr || ''}" min="0" step="any" inputmode="decimal" placeholder="overrides unit price">`)}
    <div class="acts"><button class="btn" data-act="rot90">Rotate 90°</button><button class="btn" data-act="dup">Duplicate</button><button class="btn danger" data-act="del">Delete</button></div>
    <p class="note">Front of the item is marked by the small triangle on the plan.${k.k ? ' Counts as carpentry in the schedule.' : ''}</p></div>`
}

function roomHtml(e: Room) {
  return `<div class="sec"><h3>Room</h3>${row('Name', `<input type="text" data-k="name" value="${esc(e.name)}" maxlength="40">`)}
    ${e.pts ? `<div class="kv"><span>Shape</span><b>Polygon, ${e.pts.length} corners</b></div>` : `<div class="pair">${row('X (m)', num('x', e.x, 0.1, -50, 80))}${row('Y (m)', num('y', e.y, 0.1, -50, 80))}</div><div class="pair">${row('Width', num('w', e.w, 0.1, 0.6))}${row('Depth', num('h', e.h, 0.1, 0.6))}</div>`}
    <div class="kv"><span>Area</span><b>${rarea(e).toFixed(2)} m²</b></div>
    <div style="margin:12px 0 6px;color:var(--ink2)">Floor finish</div><div class="floors">${Object.entries(FLOORS).map(([k, f]) => `<button data-act="floor" data-v="${k}" aria-pressed="${e.floor === k}"><i style="background:${f.c}"></i>${f.n}</button>`).join('')}</div>${ceilHtml(e)}
    <div class="acts">${e.pts ? '<button class="btn" data-act="torect">Use bounding box</button>' : '<button class="btn" data-act="topoly">Edit corners</button>'}<button class="btn danger" data-act="del">Delete room</button></div><p class="note">${e.pts ? 'Drag the corner dots. Drag the faint dots on edges to add a corner. Shift-click a corner to remove it. ' : ''}Deleting a room removes its floor only. Walls and furniture stay.</p></div>`
}

function wallHtml(e: Wall) {
  const S = app.S, wi = app.wallInfo(e), len = wi.b - wi.a, ang = wi.axis === 'a'
  return `<div class="sec"><h3>Wall</h3><div class="kv"><span>Direction</span><b>${ang ? (wi.ang! * 180 / Math.PI).toFixed(1) + '°' : wi.axis === 'h' ? 'East–west' : 'North–south'}</b></div><div class="kv"><span>Length</span><b>${len.toFixed(2)} m</b></div>${row('Thickness (mm)', `<input type="number" data-k="th" value="${Math.round(wi.th * 1000)}" min="60" max="400" step="10" inputmode="numeric">`)}
    <div style="height:10px"></div>${ang ? `<div class="pair">${row('X1', num('x1', e.x1, 0.1, -50, 80))}${row('Y1', num('y1', e.y1, 0.1, -50, 80))}</div><div class="pair">${row('X2', num('x2', e.x2, 0.1, -50, 80))}${row('Y2', num('y2', e.y2, 0.1, -50, 80))}</div>` : `${row('Position (m)', num('c', wi.c, 0.1, -50, 80))}<div class="pair">${row('From', num('a', wi.a, 0.1, -50, 80))}${row('To', num('b', wi.b, 0.1, -50, 80))}</div>`}
    <div style="margin:12px 0 6px;color:var(--ink2)">Finish</div><div class="floors">${Object.entries(FINS).map(([k, n]) => `<button data-act="fin" data-v="${k}" aria-pressed="${(e.fin || 'paint') === k}">${n}</button>`).join('')}</div>
    ${(e.fin || 'paint') === 'paint' ? `<div style="margin:12px 0 6px;color:var(--ink2)">Paint for this wall</div>${sw('wcol', WALLS, e.col || S.wallColor)}<div class="acts"><button class="btn" data-act="wcolclear">Same as flat</button></div>` : ''}
    <label class="chk" style="margin-top:12px"><input type="checkbox" data-act="str"${e.str ? ' checked' : ''}> Structural wall (do not alter)</label>
    <div class="acts" style="align-items:center"><input type="number" id="wpar" value="1.00" step="0.05" style="width:70px" aria-label="Distance for a parallel copy (m)"><button class="btn" data-act="wpar">Copy parallel (m)</button><button class="btn danger" data-act="del">Delete wall</button></div><p class="note">A positive distance copies right or down the plan. Mark walls you know are structural. This tool cannot tell which are. Removing or moving a real wall needs an HDB permit.</p></div>`
}

const dimHtml = (e: Dim) => `<div class="sec"><h3>Dimension</h3><div class="kv"><span>Length</span><b>${Math.hypot(e.x2 - e.x1, e.y2 - e.y1).toFixed(3)} m</b></div>${row('Line offset (m)', num('o', e.o, 0.1, -5, 5))}<div class="acts"><button class="btn" data-act="flipdim">Flip side</button><button class="btn danger" data-act="del">Delete</button></div></div>`

function openingHtml(e: Opening) {
  let h = `<div class="sec"><h3>${e.kind === 'door' ? 'Door' : 'Window'}</h3>${row('Width (m)', num('w', e.w, 0.05, 0.4, 4))}${row('Position (m)', num('p', e.p, 0.05, -50, 80))}`
  if (e.kind === 'window') h += row('Type', `<select data-k="wt">${Object.entries(WTYPES).map(([k, v]) => `<option value="${k}"${e.wt === k ? ' selected' : ''}>${v.n}</option>`).join('')}</select>`)
  else h += row('Type', `<select data-k="dt">${Object.entries(DTYPES).map(([k, v]) => `<option value="${k}"${(e.dt || 'single') === k ? ' selected' : ''}>${v}</option>`).join('')}</select>`)
  h += `<div class="acts">${e.kind === 'door' || e.wt === 'bay' || e.dt === 'slide' ? `<button class="btn" data-act="flip">${e.kind === 'door' ? 'Flip side' : 'Flip outward'}</button>` : ''}<button class="btn danger" data-act="del">Delete</button></div>
    <p class="note">${e.kind === 'door' ? 'Drag the door along its wall on the plan. Doors swing to the side shown by the arc.' : 'Drag the window along its wall on the plan.'}</p></div>`
  return h
}

/** A typed field in the inspector changed (data-k). */
function onField(t: HTMLInputElement) {
  const k = t.dataset.k!, S = app.S
  let v: string | number = t.type === 'number' ? parseFloat(t.value) : t.value
  if (t.type === 'number' && !isFinite(v as number)) { if (k === 'pr') v = 0; else { renderRight(); return } }
  const n = v as number
  app.mut(() => {
    const sel = app.sel
    if (!sel) { if (k === 'name') S.name = String(v).slice(0, 60); if (k === 'H') S.H = clamp(n, 2.2, 3.2); $<HTMLInputElement>('#pname').value = S.name; return }
    const e = app.getE(sel.t, sel.id)
    if (!e) return
    if (sel.t === 'item') {
      const it = e as Item
      if (k === 'rot') it.rot = ((n % 360) + 360) % 360
      else if (k === 'mt') it.mt = String(v)
      else if (k === 'nm') it.nm = String(v).slice(0, 40)
      else if (k === 'pr') it.pr = (isFinite(n) && n > 0) ? Math.min(n, 1e7) : 0
      else asRec(it)[k] = clamp(n, 0.1, 8)
    } else if (sel.t === 'room') {
      const r = e as Room
      if (k === 'name') r.name = String(v).slice(0, 40); else asRec(r)[k] = k === 'w' || k === 'h' ? Math.max(0.6, n) : n
    } else if (sel.t === 'dim') (e as Dim).o = clamp(n, -5, 5)
    else if (sel.t === 'open') { const o = e as Opening; if (k === 'wt') o.wt = String(v); else if (k === 'dt') o.dt = String(v); else asRec(o)[k] = n }
    else if (sel.t === 'wall') {
      const w = e as Wall, wi = app.wallInfo(w), hz = wi.axis === 'h'
      if (k === 'th') { w.th = clamp(Math.round(n) / 1000, 0.06, 0.4); return }
      if (wi.axis === 'a') {
        if (['x1', 'y1', 'x2', 'y2'].includes(k)) { const o = { ...w }; asRec(w)[k] = n; if (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < 0.3) asRec(w)[k] = asRec(o)[k] }
        return
      }
      if (k === 'c') { S.openings.filter((o) => wi.ops.includes(o)).forEach((o) => { o.c = n }); if (hz) w.y1 = w.y2 = n; else w.x1 = w.x2 = n }
      else { const a = k === 'a' ? n : wi.a, b = k === 'b' ? n : wi.b; if (b - a < 0.3) return; if (hz) { w.x1 = a; w.x2 = b } else { w.y1 = a; w.y2 = b } }
    }
  })
}

/** A button or checkbox (data-act) for the flat or the selection. Returns false if it wasn't one of these. */
function onAct(b: HTMLInputElement) {
  const act = b.dataset.act!, v = b.dataset.v!, S = app.S, sel = app.sel, e = sel ? app.getE(sel.t, sel.id) : undefined
  const flatActs: Record<string, () => void> = {
    wallcol: () => { S.wallColor = v; S.walls.forEach((w) => { w.col = '' }) },
    ceilcol: () => { S.ceilCol = v },
    skirt: () => { S.skirt = b.checked },
    skirtcol: () => { S.skirtCol = v },
  }
  if (flatActs[act]) { app.mut(flatActs[act]); return true }
  if (!e || !sel) return false
  const it = e as Item, w = e as Wall, r = e as Room, o = e as Opening, d = e as Dim
  const acts: Record<string, () => void> = {
    fin: () => { w.fin = v }, wcol: () => { w.col = v }, wcolclear: () => { w.col = '' }, str: () => { w.str = b.checked },
    col: () => { it.color = v }, floor: () => { r.floor = v }, rot90: () => { it.rot = (it.rot + 90) % 360 },
    flip: () => { o.flip = o.flip === 1 ? -1 : 1 }, flipdim: () => { d.o = -d.o },
    topoly: () => { r.pts = rpts(r).map((q): Pt => [q[0], q[1]]) },
    torect: () => { syncBox(r); delete r.pts },
    wpar: () => {
      const dd = parseFloat($<HTMLInputElement>('#wpar').value)
      if (!isFinite(dd) || !dd) return
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1, nx = -(w.y2 - w.y1) / L, ny = (w.x2 - w.x1) / L
      const sg = (Math.abs(nx) > Math.abs(ny) ? Math.sign(nx) : Math.sign(ny)) || 1, ox = nx * dd * sg, oy = ny * dd * sg
      const c: Wall = { ...w, id: uid(), x1: +(w.x1 + ox).toFixed(3), y1: +(w.y1 + oy).toFixed(3), x2: +(w.x2 + ox).toFixed(3), y2: +(w.y2 + oy).toFixed(3), str: false }
      S.walls.push(c)
      app.sel = { t: 'wall', id: c.id }
    },
    dup: () => { const c: Item = { ...deep(it), id: uid(), x: it.x + 0.3, y: it.y + 0.3 }; S.items.push(c); app.sel = { t: 'item', id: c.id } },
    del: () => delSel(),
  }
  if (!acts[act]) return false
  app.mut(acts[act])
  return true
}

/* selection operations (also used by the keyboard) */
const KEY: Record<SelType, 'items' | 'rooms' | 'walls' | 'openings' | 'dims'> = { item: 'items', room: 'rooms', wall: 'walls', open: 'openings', dim: 'dims' }
export function delSel() {
  const S = app.S as unknown as Record<string, { id: string }[]>
  if (app.ms.length) { for (const m of app.ms) S[KEY[m.t]] = S[KEY[m.t]].filter((x) => x.id !== m.id); app.ms = []; app.pruneOps(); return }
  const sel = app.sel
  if (!sel) return
  S[KEY[sel.t]] = S[KEY[sel.t]].filter((x) => x.id !== sel.id)
  if (sel.t === 'wall') app.pruneOps()
  app.sel = null
}
export const curList = (): Sel[] => app.ms.length ? app.ms : (app.sel ? [app.sel] : [])
export interface Clip { items: Item[]; walls: Wall[]; rooms: Room[]; dims: Dim[]; ops: Opening[] }
/** Copies of the selected entities (walls bring their doors and windows). */
export function entsOf(list: Sel[]): Clip {
  const o: Clip = { items: [], walls: [], rooms: [], dims: [], ops: [] }, seen = new Set<string>()
  for (const m of list) {
    const e = app.getE(m.t, m.id)
    if (!e) continue
    if (m.t === 'item') o.items.push(deep(e as Item))
    else if (m.t === 'room') o.rooms.push(deep(e as Room))
    else if (m.t === 'dim') o.dims.push(deep(e as Dim))
    else if (m.t === 'wall') { o.walls.push(deep(e as Wall)); for (const p of app.wallInfo(e as Wall).ops) if (!seen.has(p.id)) { seen.add(p.id); o.ops.push(deep(p)) } }
  }
  return o
}
/** Add copies offset by (dx, dy); returns the new selection. Groups stay together under a new group id. */
export function cloneEnts(o: Clip, dx: number, dy: number): Sel[] {
  const S = app.S, out: Sel[] = [], gm: Record<string, string> = {}
  for (const e of o.items) { const n: Item = { ...deep(e), id: uid(), x: sn(e.x + dx, 0.05), y: sn(e.y + dy, 0.05) }; if (e.g) { gm[e.g] = gm[e.g] || ('g' + uid()); n.g = gm[e.g] } S.items.push(n); out.push({ t: 'item', id: n.id }) }
  for (const e of o.walls) { const n: Wall = { ...deep(e), id: uid(), x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy }; S.walls.push(n); out.push({ t: 'wall', id: n.id }) }
  for (const e of o.ops) { const n = deep(e); n.id = uid(); if (e.axis === 'h') { n.p += dx; n.c += dy } else { n.c += dx; n.p += dy } S.openings.push(n) }
  for (const e of o.rooms) { const n = deep(e); n.id = uid(); n.x += dx; n.y += dy; if (n.pts) n.pts = n.pts.map((q): Pt => [q[0] + dx, q[1] + dy]); S.rooms.push(n); out.push({ t: 'room', id: n.id }) }
  for (const e of o.dims) { const n: Dim = { ...deep(e), id: uid(), x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy }; S.dims.push(n); out.push({ t: 'dim', id: n.id }) }
  return out
}
export function setSelQuiet(out: Sel[]) { if (out.length > 1) { app.ms = out; app.sel = null } else { app.ms = []; app.sel = out[0] || null } }
function extentsOf(list: Sel[]) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  for (const m of list) {
    const e = app.getE(m.t, m.id)
    if (!e) continue
    if (m.t === 'item') add((e as Item).x, (e as Item).y)
    else if (m.t === 'room') rpts(e as Room).forEach((q) => add(q[0], q[1]))
    else { const l = e as Wall; add(l.x1, l.y1); add(l.x2, l.y2) }
  }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}
export function multiAct(act: string) {
  const list = app.ms.slice()
  app.mut(() => {
    if (act === 'm_del') delSel()
    else if (act === 'm_dup') setSelQuiet(cloneEnts(entsOf(list), 0.4, 0.4))
    else if (act === 'm_group') { const g = 'g' + uid(); list.forEach((m) => { if (m.t === 'item') (app.getE('item', m.id) as Item).g = g }) }
    else if (act === 'm_ungroup') list.forEach((m) => { if (m.t === 'item') (app.getE('item', m.id) as Item).g = 0 })
    else if (act === 'm_rot') {
      // Rotate the selection 90° about its centre; doors and windows move with their walls.
      const X = extentsOf(list), cx = X.cx, cy = X.cy, R = (x: number, y: number): Pt => [cx - (y - cy), cy + (x - cx)], ops: Opening[] = []
      list.forEach((m) => { if (m.t === 'wall') { const w = app.getE('wall', m.id) as Wall | undefined; if (w) app.wallInfo(w).ops.forEach((o) => { if (!ops.includes(o)) ops.push(o) }) } })
      for (const m of list) {
        const e = app.getE(m.t, m.id)
        if (!e) continue
        if (m.t === 'item') { const it = e as Item, q = R(it.x, it.y); it.x = sn(q[0], 0.05); it.y = sn(q[1], 0.05); it.rot = (it.rot + 90) % 360 }
        else if (m.t === 'room') {
          const r = e as Room
          if (r.pts) { r.pts = r.pts.map((q) => R(q[0], q[1])); syncBox(r) }
          else { const a = R(r.x, r.y), b = R(r.x + r.w, r.y + r.h); r.x = Math.min(a[0], b[0]); r.y = Math.min(a[1], b[1]); r.w = Math.abs(b[0] - a[0]); r.h = Math.abs(b[1] - a[1]) }
        } else { const l = e as Wall, a = R(l.x1, l.y1), b = R(l.x2, l.y2); l.x1 = a[0]; l.y1 = a[1]; l.x2 = b[0]; l.y2 = b[1] }
      }
      for (const o of ops) {
        if (o.axis === 'h') { const c = o.c, p = o.p; o.axis = 'v'; o.c = cx - (c - cy); o.p = cy + (p - cx); o.flip = o.flip === 1 ? -1 : 1 }
        else { const c = o.c, p = o.p; o.axis = 'h'; o.c = cy + (c - cx); o.p = cx - (p - cy) }
      }
    } else if (act.startsWith('m_al_')) {
      const its = list.filter((m) => m.t === 'item').map((m) => app.getE('item', m.id) as Item)
      if (its.length < 2) return
      const ext = (i: Item) => { const a = i.rot * Math.PI / 180; return [(Math.abs(i.w * Math.cos(a)) + Math.abs(i.d * Math.sin(a))) / 2, (Math.abs(i.w * Math.sin(a)) + Math.abs(i.d * Math.cos(a))) / 2] }
      const k = act.slice(5)
      if (k === 'l') { const v = Math.min(...its.map((i) => i.x - ext(i)[0])); its.forEach((i) => { i.x = sn(v + ext(i)[0], 0.05) }) }
      else if (k === 'r') { const v = Math.max(...its.map((i) => i.x + ext(i)[0])); its.forEach((i) => { i.x = sn(v - ext(i)[0], 0.05) }) }
      else if (k === 't') { const v = Math.min(...its.map((i) => i.y - ext(i)[1])); its.forEach((i) => { i.y = sn(v + ext(i)[1], 0.05) }) }
      else if (k === 'b') { const v = Math.max(...its.map((i) => i.y + ext(i)[1])); its.forEach((i) => { i.y = sn(v - ext(i)[1], 0.05) }) }
      else if (k === 'ch') { const v = its.reduce((a, i) => a + i.x, 0) / its.length; its.forEach((i) => { i.x = sn(v, 0.05) }) }
      else if (k === 'cv') { const v = its.reduce((a, i) => a + i.y, 0) / its.length; its.forEach((i) => { i.y = sn(v, 0.05) }) }
    }
  })
}
function multiHtml() {
  const ms = app.ms, c: Record<string, number> = {}
  ms.forEach((m) => { c[m.t] = (c[m.t] || 0) + 1 })
  const nm: Record<string, string> = { item: 'furniture', room: 'rooms', wall: 'walls', dim: 'dimensions' }
  const grouped = ms.some((m) => m.t === 'item' && (app.getE('item', m.id) as Item | undefined)?.g), hasItems = (c.item || 0) > 1
  return `<div class="sec"><h3>${ms.length} selected</h3><p class="note" style="margin-top:0">${Object.entries(c).map(([k, v]) => v + ' ' + nm[k]).join(', ')}</p>
    <div class="acts"><button class="btn" data-act="m_rot">Rotate 90°</button><button class="btn" data-act="m_dup">Duplicate</button><button class="btn danger" data-act="m_del">Delete</button></div>
    ${hasItems ? `<h3 style="margin-top:16px">Align</h3><div class="tools"><button class="tool" data-act="m_al_l">Left</button><button class="tool" data-act="m_al_ch">Centre H</button><button class="tool" data-act="m_al_r">Right</button><button class="tool" data-act="m_al_t">Top</button><button class="tool" data-act="m_al_cv">Centre V</button><button class="tool" data-act="m_al_b">Bottom</button></div>
    <div class="acts" style="margin-top:12px"><button class="btn" data-act="m_group">Group</button>${grouped ? '<button class="btn" data-act="m_ungroup">Ungroup</button>' : ''}</div>` : ''}
    <p class="note">Drag any selected item to move them all. Ctrl or Cmd with C and V copies and pastes.</p></div>`
}

/* schedule */
interface SchedGroup { t: string; w: number; d: number; q: number }
function scheduleData() {
  const { S, cat } = app
  const rooms = S.rooms.map((r) => ({ n: r.name, a: rarea(r), f: FLOORS[r.floor as keyof typeof FLOORS]?.n ?? r.floor }))
  const grp: Record<string, SchedGroup> = {}
  for (const it of S.items) { const key = it.type + '|' + it.w + '|' + it.d; (grp[key] = grp[key] || { t: it.type, w: it.w, d: it.d, q: 0 }).q++ }
  const all = Object.values(grp).filter((g) => cat[g.t]).sort((a, b) => cat[a.t].n.localeCompare(cat[b.t].n))
  return { rooms, carp: all.filter((g) => cat[g.t].k), furn: all.filter((g) => !cat[g.t].k), doors: S.openings.filter((o) => o.kind === 'door').length, wins: S.openings.filter((o) => o.kind === 'window').length }
}
const mm = (v: number) => Math.round(v * 1000)
export function scheduleText() {
  const { S, cat } = app, d = scheduleData(), L = [`${S.name}`, `Floor area ${d.rooms.reduce((a, r) => a + r.a, 0).toFixed(1)} m², ceiling ${S.H.toFixed(2)} m`, '', 'ROOMS']
  d.rooms.forEach((r) => L.push(`  ${r.n}: ${r.a.toFixed(1)} m², ${r.f}`))
  L.push('', `DOORS ${d.doors}   WINDOWS ${d.wins}`, '', 'CARPENTRY (width x depth, mm)')
  d.carp.forEach((g) => L.push(`  ${g.q} x ${cat[g.t].n}  ${mm(g.w)} x ${mm(g.d)}  (run ${(g.q * g.w).toFixed(2)} m)`))
  L.push('', 'FURNITURE & FITTINGS')
  d.furn.forEach((g) => L.push(`  ${g.q} x ${cat[g.t].n}  ${mm(g.w)} x ${mm(g.d)}`))
  L.push('', 'Measure on site before ordering. Dimensions come from this drawing only.')
  return L.join('\n')
}
function scheduleHtml() {
  const d = scheduleData(), line = (g: SchedGroup) => `<div class="kv"><span>${g.q} × ${esc(app.cat[g.t].n)}</span><b>${mm(g.w)}×${mm(g.d)}</b></div>`
  return `<div class="sec sch"><h4>Rooms</h4>${d.rooms.map((r) => `<div class="kv"><span>${esc(r.n)}<br><small style="color:var(--ink2)">${esc(r.f)}</small></span><b>${r.a.toFixed(1)} m²</b></div>`).join('') || '<p class="note">No rooms yet.</p>'}
    <div class="kv"><span>Doors / windows</span><b>${d.doors} / ${d.wins}</b></div>
    <h4>Carpentry (mm)</h4>${d.carp.map((g) => line(g) + `<div class="kv" style="border:0;padding-top:0"><span style="color:var(--ink2)">Run length</span><b>${(g.q * g.w).toFixed(2)} m</b></div>`).join('') || '<p class="note">None placed.</p>'}
    <h4>Furniture (mm)</h4>${d.furn.map(line).join('') || '<p class="note">None placed.</p>'}
    <div class="acts"><button class="btn primary" data-sched="copy">Copy list</button></div>
    <p class="note">Take this to your contractor. Dimensions come from the drawing only, so measure on site before ordering.</p></div>`
}

/* budget */
function budgetHtml() {
  const { S, cat } = app, L = budgetLines(S, cat), tot = budgetTotal(S, cat), cap = S.budget || 0, diff = cap - tot
  return `<div class="sec"><h3>Budget</h3><p class="note" style="margin-top:0">Enter your own unit prices from quotes. Nothing is pre-filled.</p>${row('Budget cap ($)', `<input type="number" data-bcap="1" value="${cap || ''}" min="0" step="any" inputmode="decimal" placeholder="optional">`)}
    <div style="height:8px"></div>${L.map((l) => l.fixed !== undefined ? `<div class="bl"><span>${esc(l.name)}<small>${l.qty} ${l.unit}</small></span><span style="text-align:right;color:var(--ink2)">set on item</span><b>${money(l.fixed)}</b></div>` : `<div class="bl"><span>${esc(l.name)}<small>${l.qty} ${l.unit}</small></span><input type="number" data-bp="${l.key}" value="${S.prices[l.key] ?? ''}" min="0" step="any" inputmode="decimal" placeholder="price" aria-label="Unit price for ${esc(l.name)}"><b>${money(l.qty * (S.prices[l.key] || 0))}</b></div>`).join('') || '<p class="note">Nothing to price yet.</p>'}
    <h3 style="margin-top:16px">Other costs</h3>${S.extras.map((x) => `<div class="bl x"><input type="text" data-bx="name:${x.id}" value="${esc(x.name)}" maxlength="40" placeholder="Item" aria-label="Cost name"><input type="number" data-bx="amt:${x.id}" value="${x.amt || ''}" min="0" step="any" placeholder="$"><button class="btn" data-bxdel="${x.id}" aria-label="Remove line">×</button></div>`).join('')}
    <div class="acts"><button class="btn" data-bxadd="1">Add a cost line</button></div>
    <div class="kv" style="margin-top:12px;font-weight:600"><span>Total</span><b>${money(tot)}</b></div>
    ${cap ? `<div class="kv"><span>${diff >= 0 ? 'Under budget by' : 'Over budget by'}</span><b style="color:var(${diff >= 0 ? '--accent' : '--danger'})">${money(Math.abs(diff))}</b></div>` : ''}
    <p class="note">Quantities come from your design: furniture, flooring, carpentry runs, false ceilings, electrical points, doors, windows and wall finishes. Add hacking, labour and permits as cost lines.</p></div>${quotesHtml(S)}`
}

/* checks */
function lightingHtml() {
  const L = lightPlan(app.S, app.cat)
  if (!L.length) return ''
  return `<div class="sec"><h3>Lighting plan</h3><p class="note" style="margin-top:0">Rough guide only: target light level by room type, an assumed 1000 lumen ceiling light and 50% efficiency. A lighting designer or electrician decides the real layout.</p>` +
    L.map((x) => { const gap = x.want - x.have; return `<div class="chk-i info"><i></i><span><b>${esc(x.r.name)}</b>: ${x.ar.toFixed(1)} m², about ${x.lux} lux for a ${x.kind}. Suggested ${x.want} ceiling light${x.want > 1 ? 's' : ''}, you have ${x.have}${x.lamps ? ` plus ${x.lamps} lamp${x.lamps > 1 ? 's' : ''}` : ''}.${gap > 0 ? ` <button class="btn" data-lt="${x.r.id}" style="margin-left:6px;padding:2px 8px">Add ${gap}</button>` : ''}</span></div>` }).join('') + '</div>'
}
function addLights(id: string) {
  const { S, cat } = app, r = S.rooms.find((x) => x.id === id)
  if (!r) return
  const pl = lightPlan(S, cat).find((x) => x.r.id === id)!, n = pl.want - pl.have
  if (n <= 0) return
  const k = cat.ceilL
  app.mut(() => { lightSpots(r, n).forEach((c) => S.items.push({ id: uid(), type: 'ceilL', x: c[0], y: c[1], rot: 0, w: k.w, d: k.d, color: k.c, g: 0, h: 0, mt: '', nm: '', pr: 0 })) })
  app.toast('Ceiling lights added')
}
function checksHtml() {
  const S = app.S, r = runChecks(S, app.cat, app.checks), warn = r.filter((x) => x.lvl === 'warn'), info = r.filter((x) => x.lvl !== 'warn')
  const li = (x: { lvl: string; msg: string }) => `<div class="chk-i ${x.lvl}"><i></i><span>${esc(x.msg)}</span></div>`
  return `<div class="sec"><h3>Original layout</h3>${S.base ? `<p class="note" style="margin-top:0">Saved ${app.fmtT(S.base.t)}. Changes below are compared with it.</p><div class="acts"><button class="btn" data-base="set">Replace with current</button><button class="btn" data-base="clear">Clear</button></div>` : `<p class="note" style="margin-top:0">Load or draw your flat as it is handed over, then press the button. Later changes to walls and wet areas will be compared against it.</p><div class="acts"><button class="btn primary" data-base="set">Set current as original</button></div>`}</div>
    ${lightingHtml()}
    <div class="sec"><h3>Needs a look (${warn.length})</h3>${warn.map(li).join('') || '<p class="note" style="margin-top:0">Nothing flagged.</p>'}</div>
    <div class="sec"><h3>Notes (${info.length})</h3>${info.map(li).join('') || '<p class="note" style="margin-top:0">None.</p>'}</div>
    <div class="sec"><p class="note" style="margin:0"><b>This is a planning aid, not an approval.</b> It only knows what you tell it: mark structural walls in the wall inspector, and set the original layout. HDB decides which walls, floors and services can be altered and which works need a permit or a registered contractor. Check HDB's current renovation guidelines for your flat type before you start work.</p></div>`
}

/* events: one change handler and one click handler, routed by data attribute */
function onChange(t: HTMLInputElement) {
  const S = app.S, ds = t.dataset, sel = app.sel
  if (ds.k) return onField(t)
  if (ds.preset && t.value) { const k = t.value; app.mut(() => { applyPreset(S, k, new Set(Object.keys(app.cat).filter((x) => app.cat[x].carp))) }); app.toast(PRESETS[k].n + ' style applied'); return }
  if ((ds.ceil || ds.ceilck) && sel?.t === 'room') {
    const r = app.getE('room', sel.id) as Room | undefined
    if (!r) return
    app.mut(() => { setCeil(r, (ds.ceil || ds.ceilck)!, ds.ceilck ? String(t.checked) : t.value); if (ceilOf(r).type !== 'none') S.layers.ceil = 1 })
    renderOpts()
    return
  }
  if ((ds.cfg || ds.cfgck) && sel?.t === 'item') {
    const it = app.getE('item', sel.id) as Item | undefined
    if (it) app.mut(() => setCfg(it, (ds.cfg || ds.cfgck)!, ds.cfgck ? String(t.checked) : t.value, S.H))
    return
  }
  if (ds.bp !== undefined) { const v = parseFloat(t.value), key = ds.bp; app.mut(() => { if (isFinite(v) && v >= 0) S.prices[key] = v; else delete S.prices[key] }); return }
  if (ds.bx) { const [f, id] = ds.bx.split(':'); app.mut(() => { const x = S.extras.find((q) => q.id === id); if (!x) return; if (f === 'name') x.name = t.value.slice(0, 40); else x.amt = Math.max(0, parseFloat(t.value) || 0) }); return }
  if (ds.bcap !== undefined) { app.mut(() => { S.budget = Math.max(0, parseFloat(t.value) || 0) }); return }
  if (ds.act) onAct(t)
}
function onClick(el: HTMLElement) {
  const S = app.S, sel = app.sel
  const b = el.closest<HTMLInputElement>('[data-act],[data-cfgsw],[data-sched],[data-bxadd],[data-bxdel],[data-q],[data-lt],[data-base]')
  if (!b) return
  const ds = b.dataset
  if (ds.cfgsw && sel?.t === 'item') {
    const it = app.getE('item', sel.id) as Item | undefined
    if (it) app.mut(() => { if (ds.cfgsw === 'color') it.color = ds.v!; else setCfg(it, ds.cfgsw!, ds.v!, S.H) })
  } else if (ds.sched) copyText(scheduleText(), b)
  else if (ds.bxadd) app.mut(() => { S.extras.push({ id: uid(), name: '', amt: 0 }) })
  else if (ds.bxdel) { const id = ds.bxdel; app.mut(() => { S.extras = S.extras.filter((q) => q.id !== id) }) }
  else if (ds.q === 'add') app.dialog(quoteDialogHtml())
  else if (ds.q === 'edit') app.dialog(quoteDialogHtml((S.quotes || []).find((q) => q.id === ds.id)))
  else if (ds.q === 'budget') { app.mut(() => { S.budget = +ds.v! }); app.toast('Budget cap set to the lowest quote') }
  else if (ds.lt) addLights(ds.lt)
  else if (ds.base === 'set') { app.mut(() => { S.base = app.snapBase() }); app.toast('Saved as the original layout') }
  else if (ds.base === 'clear') app.mut(() => { S.base = null })
  else if (ds.act?.startsWith('m_')) multiAct(ds.act)
  else if (ds.act && b.type !== 'checkbox') onAct(b)
}
/** Save, edit or delete a quote from its dialog. */
function onQuoteDialog(b: HTMLElement) {
  const S = app.S, a = b.dataset.q, id = b.dataset.id
  if (a === 'del') { app.mut(() => { S.quotes = (S.quotes || []).filter((q) => q.id !== id) }); app.closeDlg(); return }
  if (a !== 'save') return
  const lines = parseQuote($<HTMLTextAreaElement>('#qt').value), name = ($<HTMLInputElement>('#qn').value || '').trim() || 'Quote ' + ((S.quotes || []).length + 1)
  if (!lines.length) { $('#qmsg').textContent = 'No priced lines found. Each line needs an amount, such as $1,200.'; return }
  app.mut(() => {
    S.quotes = S.quotes || []
    const q = S.quotes.find((x) => x.id === id)
    if (q) { q.name = name.slice(0, 40); q.lines = lines } else if (S.quotes.length < 3) S.quotes.push({ id: 'q' + Date.now().toString(36), name: name.slice(0, 40), lines })
  })
  app.closeDlg()
  app.rtab = 'budget'
  renderRight()
  app.toast(`Read ${lines.length} priced lines`)
}

export function initInspector(a: App) {
  app = a
  const body = $('#rbody')
  body.addEventListener('change', (e) => { if (app.S) onChange(target(e)) })
  body.addEventListener('click', (e) => { if (app.S) onClick(e.target as HTMLElement) })
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') (e.target as HTMLElement).blur() })
  $$('.tabs [data-rt]').forEach((b) => b.addEventListener('click', () => { app.rtab = b.dataset.rt as Tab; renderRight() }))
  $('#dcard').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-q]'); if (b && app.S) onQuoteDialog(b) })
}
