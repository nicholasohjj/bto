import { useEffect, useState } from 'react'
import type { Launch } from '../config/launches'
import { currentYm } from '../engine/dates'
import { fromHdb, liveRatesPath, wantsLiveRates, type HdbAppRates, type LiveRates } from '../engine/liveRates'

/** One fetch per launch per page view, shared by every component that asks. */
const cache = new Map<string, LiveRates | null | Promise<LiveRates | null>>()

/**
 * Live application rates for a launch that is (or was just) open and has none baked in yet.
 * Null while loading, if HDB hasn't published the file, or offline.
 */
export function useLiveRates(launch: Launch | null | undefined): LiveRates | null {
  const want = !!launch && wantsLiveRates(launch, currentYm())
  const key = want && launch ? liveRatesPath(launch) : ''
  const [, bump] = useState(0)
  useEffect(() => {
    if (!key || !launch) return
    const hit = cache.get(key)
    if (hit === undefined) {
      const p = fetch(key)
        .then(async (r) => (r.ok ? fromHdb((await r.json()) as HdbAppRates, launch) : null))
        .catch(() => null)
        .then((v) => { cache.set(key, v); bump((n) => n + 1); return v })
      cache.set(key, p)
    } else if (hit instanceof Promise) {
      let on = true
      hit.then(() => { if (on) bump((n) => n + 1) })
      return () => { on = false }
    }
  }, [key, launch])
  const v = key ? cache.get(key) : undefined
  return v === undefined || v instanceof Promise ? null : v
}
