/** Flat Studio's left panel: drawing tools, options and layers, the traced image, and the catalogue. */
import { GROUPS } from './catalog'
import { $, $$, esc, target } from './dom'
import { clamp, sn, uid, type Item } from './model'
import type { App } from './ui'

export const TOOLS: [string, string][] = [['select', 'Select'], ['wall', 'Wall'], ['room', 'Room'], ['poly', 'Polygon'], ['dim', 'Dimension'], ['door', 'Door'], ['window', 'Window']]
export const HINTS: Record<string, string> = {
  select: 'Click to select. Shift-click adds to the selection, Shift-drag draws a box. Drag handles to reshape; drag furniture to move it. Hold Alt to skip wall snapping.',
  wall: 'Drag to draw a wall, and type a length such as 3.2 then Enter to set it exactly. Locks to 90 degrees unless Free angle is on.',
  poly: 'Click each corner of the room. Click the first point or double-click to finish.',
  dim: 'Drag between two points to add a dimension line.',
  room: 'Click inside a closed set of walls to fill a room, or drag a rectangle.',
  calib: 'Click two points on the image whose real distance you know, such as the ends of a printed dimension. Zoom in first for accuracy.',
  imove: 'Drag to move the image. Pick Select when it sits where you want it.',
  door: 'Click on a wall to place a door.',
  window: 'Click on a wall to place a window.',
}
export const LAYERS: [string, string][] = [['furn', 'Furniture'], ['labels', 'Labels'], ['dims', 'Dimensions'], ['grid', 'Grid'], ['ceil', 'Ceilings']]

let app: App

const catBtn = (k: string, n: string, w: number, d: number) => `<button class="ci" data-add="${k}"><span>${esc(n)}</span><em>${Math.round(w * 1000)}×${Math.round(d * 1000)}</em></button>`

export function buildLeft() {
  const { cat, tool } = app
  let h = '<div class="sec"><h3>Draw</h3><div class="tools">' + TOOLS.map(([k, n]) => `<button class="tool" data-tool="${k}" aria-pressed="${k === tool}">${n}</button>`).join('') + '</div></div><div class="sec" id="opts"></div><div class="sec" id="trace"></div>'
  h += '<div class="sec" style="padding-bottom:8px"><input id="catq" type="search" placeholder="Search furniture and fittings" aria-label="Search the catalogue" style="width:100%;background:var(--field);border:1px solid var(--line);border-radius:6px;padding:6px 8px"></div>'
  for (const g of GROUPS) h += `<div class="sec cg"><h3>${g}</h3><div class="cat">` + Object.entries(cat).filter(([, v]) => v.g === g).map(([k, v]) => catBtn(k, v.n, v.w, v.d)).join('') + '</div></div>'
  const mods = Object.entries(cat).filter(([, v]) => v.g === 'My models' && !v.missing)
  h += `<div class="sec"><h3>My models</h3>${mods.length ? '<div class="cat">' + mods.map(([k, v]) => catBtn(k, v.n, v.w, v.d)).join('') + '</div>' : ''}
    <p class="note" style="margin:8px 0 10px">Import a GLB, GLTF or OBJ file. It is scaled to real size and kept in this browser.</p><button class="btn" data-model="load" style="width:100%">Import 3D model</button>${mods.length ? '<button class="btn" data-model="manage" style="width:100%;margin-top:8px">Remove a model…</button>' : ''}</div>`
  $('#left').innerHTML = h
  renderTrace()
  renderOpts()
}

export function renderOpts() {
  const el = $('#opts')
  if (!el) return
  el.innerHTML = `<h3>Options</h3><div class="tools"><button class="tool" data-opt="free" aria-pressed="${app.freeAng}">Free angle</button><button class="tool" data-opt="flush" aria-pressed="${app.flush}">Flush snap</button></div><div style="height:8px"></div><div class="lays">${LAYERS.map(([k, n]) => `<label><input type="checkbox" data-lay="${k}"${app.S.layers[k] ? ' checked' : ''}> ${n}</label>`).join('')}</div>`
}

export function renderTrace() {
  const el = $('#trace'), u = app.under
  if (!el) return
  if (!u) {
    el.innerHTML = `<h3>Trace a paper plan</h3><p class="note" style="margin:0 0 10px">Load a photo, scan or HDB brochure PDF of your floor plan. Brochures are read automatically; for images, set the scale, then draw walls over it.</p><button class="btn primary" data-tr="load" style="width:100%">Load plan image</button>`
    return
  }
  el.innerHTML = `<h3>Trace a paper plan</h3><div class="tools"><button class="tool" data-tool="calib" aria-pressed="${app.tool === 'calib'}">Set scale</button><button class="tool" data-tool="imove" aria-pressed="${app.tool === 'imove'}">Move</button><button class="tool" data-tr="toggle" aria-pressed="${!u.show}">${u.show ? 'Hide' : 'Show'}</button></div>
    <div style="height:10px"></div><label class="row"><span>Opacity</span><input type="range" id="uop" min="10" max="100" value="${Math.round(u.op * 100)}"></label>
    <label class="row"><span>Rotate °</span><input type="number" id="urot" step="0.1" min="-180" max="180" value="${(u.rot || 0).toFixed(1)}" inputmode="decimal"></label>
    <div class="kv"><span>Image width</span><b>${u.w.toFixed(2)} m</b></div>
    <p class="note">1. Rotate until printed walls run level. 2. Set scale from one known dimension. 3. Draw walls over it, then click inside each space with the Room tool.</p>
    <div class="acts"><button class="btn" data-tr="load">Replace</button><button class="btn danger" data-tr="remove">Remove</button></div>`
}

/** Add a catalogue item in the selected room, or in the middle of the view. */
function addItem(type: string) {
  const { cat, S, sel, view } = app, k = cat[type]
  const r = sel && sel.t === 'room' ? app.getE('room', sel.id) as { x: number; y: number; w: number; h: number } | undefined : undefined
  const cx = r ? r.x + r.w / 2 : view.cx, cy = r ? r.y + r.h / 2 : view.cy
  app.checkpoint()
  const it: Item = { id: uid(), type, x: sn(cx, 0.05), y: sn(cy, 0.05), rot: 0, w: k.w, d: k.d, color: k.c, g: 0, h: k.h || 0, mt: '', nm: '', pr: 0 }
  S.items.push(it)
  app.sel = { t: 'item', id: it.id }
  app.ms = []
  app.setTool('select')
  app.changed()
  app.setTab('plan')
}

export function initLeftPanel(a: App) {
  app = a
  const left = $('#left')
  left.addEventListener('input', (e) => {
    const t = target(e)
    if (t.id === 'catq') {
      const q = t.value.trim().toLowerCase()
      $$('#left .cg').forEach((sec) => {
        let any = false
        sec.querySelectorAll<HTMLElement>('.ci').forEach((b) => { const on = !q || (b.textContent || '').toLowerCase().includes(q); b.hidden = !on; any = any || on })
        sec.hidden = !any
      })
    } else if (t.id === 'uop' && app.under) { app.under.op = +t.value / 100; app.renderUnder(); app.saveUnder() }
  })
  left.addEventListener('change', (e) => {
    const t = target(e)
    if (t.id === 'urot' && app.under) {
      const v = parseFloat(t.value)
      if (isFinite(v)) { app.under.rot = clamp(v, -180, 180); app.renderUnder(); app.saveUnder() }
    } else if (t.dataset.lay) { app.S.layers[t.dataset.lay] = t.checked ? 1 : 0; app.changed({ ui: false }) }
  })
  left.addEventListener('click', (e) => {
    const el = e.target as HTMLElement
    const opt = el.closest<HTMLElement>('[data-opt]')
    if (opt) { if (opt.dataset.opt === 'free') app.freeAng = !app.freeAng; else app.flush = !app.flush; renderOpts(); return }
    const tr = el.closest<HTMLElement>('[data-tr]')
    if (tr) {
      const a2 = tr.dataset.tr
      if (a2 === 'load') app.pickImage()
      else if (a2 === 'toggle' && app.under) { app.under.show = !app.under.show; app.renderUnder(); renderTrace(); app.saveUnder() }
      else if (a2 === 'remove') app.removeUnder()
      return
    }
    const tool = el.closest<HTMLElement>('[data-tool]')
    if (tool) {
      if ((tool.dataset.tool === 'calib' || tool.dataset.tool === 'imove') && !app.under) return
      app.setTool(tool.dataset.tool!)
      renderTrace()
      return
    }
    const model = el.closest<HTMLElement>('[data-model]')
    if (model) { if (model.dataset.model === 'load') app.importModel(); else app.manageModels(); return }
    const add = el.closest<HTMLElement>('[data-add]')
    if (add) addItem(add.dataset.add!)
  })
}
