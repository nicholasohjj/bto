/**
 * Brochure import dialog: read an HDB sales brochure PDF, pick a block floor plan page, drag a box
 * around one unit, and get a draft design (walls, doors, windows, rooms) plus the brochure drawing
 * as a to-scale tracing image underneath.
 */
import { findPlanPages, findScale, openPdf, readPage, renderPage, type PlanPage } from './brochure'
import { vectorize, type Box, type VectorizeResult } from './vectorize'

export interface ImportResult {
  name: string
  result: VectorizeResult
  /** The selected part of the page as a JPEG, covering (0,0) to (result.w, result.h) in metres. */
  image: string
}
interface Ui { card: HTMLElement; open: () => void; close: () => void }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const RENDER = 2.5

export async function importBrochure(file: File, ui: Ui): Promise<ImportResult | null> {
  ui.card.innerHTML = `<h2>Reading brochure…</h2><p class="note" id="bi-p">Opening ${esc(file.name)}</p>`
  ui.open()
  let doc
  try { doc = await openPdf(await file.arrayBuffer()) } catch (e) {
    return fail(ui, 'Could not open that PDF', (e as Error).message || 'It may be damaged or password-protected.')
  }
  const prog = ui.card.querySelector('#bi-p')!
  const pages = await findPlanPages(doc, (i, n) => { prog.textContent = `Looking for floor plans: page ${i} of ${n}` })
  if (!pages.length) return fail(ui, 'No block floor plans found', 'This tool looks for HDB block floor plan pages, with a scale bar and unit numbers. For other plans, export the page as an image and use Load plan image.')

  for (;;) {
    const pg = await pickPage(ui, pages)
    if (!pg) { ui.close(); return null }
    ui.card.innerHTML = `<h2>${esc(pg.title || 'Page ' + pg.page)}</h2><p class="note">Drawing the page…</p>`
    const [prims, canvas] = await Promise.all([readPage(doc, pg.page), renderPage(doc, pg.page, RENDER)])
    const ppm = findScale(prims)
    if (!ppm) return fail(ui, 'Could not read the scale', 'The scale bar on this page could not be read. Export the page as an image and use Load plan image, then set the scale by hand.')
    const box = await pickBox(ui, pg, canvas)
    if (box === 'back') continue
    if (!box) { ui.close(); return null }
    const result = vectorize(prims, box, ppm)
    const image = crop(canvas, box)
    const name = [pg.title, result.unit && result.unit.replace(/^UNIT/i, 'unit'), result.type && `(${result.type.toLowerCase()})`].filter(Boolean).join(' ') || 'Imported unit'
    ui.close()
    return { name: name.slice(0, 60), result, image }
  }
}

function fail(ui: Ui, title: string, msg: string): null {
  ui.card.innerHTML = `<h2>${esc(title)}</h2><p class="note">${esc(msg)}</p><div class="acts"><button class="btn" data-bi="x">OK</button></div>`
  ui.card.querySelector('[data-bi="x"]')!.addEventListener('click', ui.close)
  return null
}

function pickPage(ui: Ui, pages: PlanPage[]): Promise<PlanPage | null> {
  return new Promise((res) => {
    ui.card.innerHTML = `<h2>Pick a floor plan</h2><p class="note" style="margin:0 0 10px">Found ${pages.length} block floor plan page${pages.length > 1 ? 's' : ''}. Pick the one with your unit.</p>
      <div style="display:grid;gap:6px;max-height:50vh;overflow:auto">${pages.map((p, i) => `<button class="btn" data-pg="${i}" style="text-align:left"><b>${esc(p.title || 'Page ' + p.page)}</b> <small style="color:var(--ink2)">page ${p.page}</small><br><small style="color:var(--ink2)">${esc(p.units.map((u) => u.label.replace(/^UNIT\s*/i, '')).join(', '))}</small></button>`).join('')}</div>
      <div class="acts"><button class="btn" data-bi="x">Cancel</button></div>`
    ui.card.querySelectorAll<HTMLElement>('[data-pg]').forEach((b) => b.addEventListener('click', () => res(pages[+b.dataset.pg!])))
    ui.card.querySelector('[data-bi="x"]')!.addEventListener('click', () => res(null))
  })
}

/** Show the page and let the user drag a box around their unit (in page points). */
function pickBox(ui: Ui, pg: PlanPage, canvas: HTMLCanvasElement): Promise<Box | null | 'back'> {
  return new Promise((res) => {
    ui.card.style.width = 'min(1100px,100%)'
    ui.card.innerHTML = `<h2>Drag a box around your unit</h2><p class="note" style="margin:0 0 8px">Include its outer walls. Units on this page: ${esc(pg.units.map((u) => u.label.replace(/^UNIT\s*/i, '')).join(', '))}. Pinch or scroll the page to look closer.</p>
      <div id="bi-wrap" style="position:relative;overflow:auto;max-height:62vh;border:1px solid var(--line);border-radius:8px;touch-action:none"><div id="bi-inner" style="position:relative;width:100%"></div></div>
      <p class="note" id="bi-msg"></p><div class="acts"><button class="btn primary" data-bi="ok" disabled>Make the plan</button><button class="btn" data-bi="back">Other page</button><button class="btn" data-bi="x">Cancel</button></div>`
    const inner = ui.card.querySelector<HTMLElement>('#bi-inner')!
    canvas.style.cssText = 'display:block;width:100%;height:auto'
    inner.appendChild(canvas)
    const sel = document.createElement('div')
    sel.style.cssText = 'position:absolute;border:2px solid var(--sel);background:color-mix(in srgb,var(--sel) 15%,transparent);display:none;pointer-events:none'
    inner.appendChild(sel)
    const ok = ui.card.querySelector<HTMLButtonElement>('[data-bi="ok"]')!, msg = ui.card.querySelector('#bi-msg')!
    let box: Box | null = null, start: [number, number] | null = null
    const toPt = (e: PointerEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * canvas.width / RENDER, (e.clientY - r.top) / r.height * canvas.height / RENDER] }
    const draw = () => {
      if (!box) { sel.style.display = 'none'; return }
      const k = canvas.getBoundingClientRect().width / (canvas.width / RENDER)
      Object.assign(sel.style, { display: 'block', left: box.x0 * k + 'px', top: box.y0 * k + 'px', width: (box.x1 - box.x0) * k + 'px', height: (box.y1 - box.y0) * k + 'px' })
    }
    canvas.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; canvas.setPointerCapture(e.pointerId); start = toPt(e); box = null; draw(); e.preventDefault() })
    canvas.addEventListener('pointermove', (e) => {
      if (!start) return
      const p = toPt(e)
      box = { x0: Math.min(start[0], p[0]), y0: Math.min(start[1], p[1]), x1: Math.max(start[0], p[0]), y1: Math.max(start[1], p[1]) }
      draw()
    })
    canvas.addEventListener('pointerup', () => {
      start = null
      const okSize = !!box && box.x1 - box.x0 > 15 && box.y1 - box.y0 > 15
      ok.disabled = !okSize
      msg.textContent = okSize ? '' : 'Drag a bigger box around one whole unit.'
    })
    ok.addEventListener('click', () => { ui.card.style.width = ''; res(box) })
    ui.card.querySelector('[data-bi="back"]')!.addEventListener('click', () => { ui.card.style.width = ''; res('back') })
    ui.card.querySelector('[data-bi="x"]')!.addEventListener('click', () => { ui.card.style.width = ''; res(null) })
  })
}

function crop(canvas: HTMLCanvasElement, box: Box): string {
  const c = document.createElement('canvas'), sx = box.x0 * RENDER, sy = box.y0 * RENDER, sw = (box.x1 - box.x0) * RENDER, sh = (box.y1 - box.y0) * RENDER
  const k = Math.min(1, 2400 / Math.max(sw, sh))
  c.width = Math.round(sw * k); c.height = Math.round(sh * k)
  c.getContext('2d')!.drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}
