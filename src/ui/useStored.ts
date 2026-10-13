import { useEffect, useState } from 'react'

/**
 * A value another page on this site (Flat Studio, Surroundings) keeps in localStorage. Read again when
 * this tab comes back into view and when another tab changes it.
 */
export function useStored<T>(key: string, read: () => T): T {
  const [value, setValue] = useState(read)
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setValue(read()) }
    const onStorage = (e: StorageEvent) => { if (e.key === key) setValue(read()) }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [key, read])
  return value
}
