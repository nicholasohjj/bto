import type { Scenario } from '../engine/types'
import { isScenario } from './storage'

/**
 * Share a scenario by link: JSON → deflate → base64url, in the URL hash
 * (`#s=…`). The hash never reaches the server, so the numbers stay between
 * the two phones. Uses the browser's built-in CompressionStream.
 */
const PREFIX = 's='

export async function encodeScenario(s: Scenario): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(s))
  return toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))
}

export async function decodeScenario(code: string): Promise<Scenario> {
  let json: unknown
  try {
    const bytes = await pipe(fromBase64Url(code), new DecompressionStream('deflate-raw'))
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('The link looks cut off or damaged.')
  }
  if (!isScenario(json)) throw new Error('The link doesn’t contain a plan.')
  return json
}

export async function shareUrl(s: Scenario, base = location.href): Promise<string> {
  const url = new URL(base)
  url.hash = PREFIX + await encodeScenario(s)
  return url.toString()
}

/** The encoded scenario in a location hash, if there is one. */
export function sharedCode(hash: string): string | null {
  const h = hash.replace(/^#/, '')
  return h.startsWith(PREFIX) ? h.slice(PREFIX.length) : null
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
