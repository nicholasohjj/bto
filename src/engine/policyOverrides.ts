import { DEFAULT_POLICY, type Policy } from '../config/policy'
import type { PolicyOverrides } from './types'

/** Every numeric leaf of a policy as path -> value (arrays use numeric segments). */
export function flattenPolicy(policy: Policy = DEFAULT_POLICY): Record<string, number> {
  const out: Record<string, number> = {}
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'number') {
      out[path] = node
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k)
    }
  }
  walk(policy, '')
  return out
}

/** Default policy with the scenario's overrides applied. Unknown paths are ignored. */
export function resolvePolicy(overrides: PolicyOverrides = {}): Policy {
  const policy: Policy = structuredClone(DEFAULT_POLICY)
  for (const [path, value] of Object.entries(overrides)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const keys = path.split('.')
    let node: Record<string, unknown> = policy as unknown as Record<string, unknown>
    let ok = true
    for (const key of keys.slice(0, -1)) {
      const next = node[key]
      if (!next || typeof next !== 'object') { ok = false; break }
      node = next as Record<string, unknown>
    }
    const last = keys[keys.length - 1]
    if (ok && typeof node[last] === 'number') node[last] = value
  }
  return policy
}
