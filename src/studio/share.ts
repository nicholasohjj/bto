/**
 * Share a Flat Studio design by link: the design is compressed into the URL hash (#d=…), which never
 * reaches the server. Prices, budget, quotes and the tracing image stay out of shared links.
 */
import { packJson, unpackJson } from '../state/share'
import type { Design } from './model'

const PREFIX = 'd='

/** The design without the owner's own figures. */
export function shareable(S: Design): Partial<Design> {
  const { prices: _p, extras: _e, budget: _b, quotes: _q, cid: _c, ...rest } = S
  void _p; void _e; void _b; void _q; void _c
  return { ...rest, items: S.items.map((i) => ({ ...i, pr: 0, nm: '' })) }
}

export async function designLink(S: Design, base = location.origin + '/studio/'): Promise<string> {
  const url = new URL(base)
  url.hash = PREFIX + await packJson(shareable(S))
  return url.toString()
}

export function sharedDesignCode(hash: string): string | null {
  const h = hash.replace(/^#/, '')
  return h.startsWith(PREFIX) ? h.slice(PREFIX.length) : null
}

export async function readSharedDesign(code: string): Promise<unknown> {
  const o = await unpackJson(code)
  if (!o || typeof o !== 'object' || !Array.isArray((o as { walls?: unknown }).walls)) throw new Error('The link doesn’t contain a design.')
  return o
}
