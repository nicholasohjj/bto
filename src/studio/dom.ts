/** Small DOM helpers shared by Flat Studio's panels. */

export const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T
export const $$ = <T extends Element = HTMLElement>(s: string) => [...document.querySelectorAll(s)] as T[]

export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Copy text, showing "Copied" on the button; falls back to execCommand where the clipboard API is blocked. */
export function copyText(txt: string, btn: HTMLElement) {
  const ok = () => { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = o }, 1400) }
  const fb = () => {
    const t = document.createElement('textarea')
    t.value = txt; t.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(t); t.select()
    try { if (document.execCommand('copy')) ok() } catch { /* nothing to fall back to */ }
    t.remove()
  }
  try { navigator.clipboard.writeText(txt).then(ok, fb) } catch { fb() }
}

/** The element an event came from, typed for reading dataset and value. */
export const target = (e: Event) => e.target as HTMLInputElement
