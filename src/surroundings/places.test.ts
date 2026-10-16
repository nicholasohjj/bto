import { describe, expect, it } from 'vitest'
import { distanceM, nearParents, parseLatLon, transitUrl } from './places'

describe('your places', () => {
  it('measures distances on the ground', () => {
    // Raffles Place MRT to Tampines MRT: about 12.9 km in a straight line.
    const d = distanceM(1.28393, 103.85148, 1.35345, 103.94503)
    expect(d).toBeGreaterThan(12800)
    expect(d).toBeLessThan(13000)
    expect(distanceM(1.3, 103.8, 1.3, 103.8)).toBe(0)
  })

  it('reads a pasted latitude and longitude in Singapore only', () => {
    expect(parseLatLon('1.3521, 103.8198')).toEqual({ lat: 1.3521, lon: 103.8198 })
    expect(parseLatLon(' 1.3521 103.8198 ')).toEqual({ lat: 1.3521, lon: 103.8198 })
    expect(parseLatLon('520123')).toBeNull()
    expect(parseLatLon('51.5, -0.12')).toBeNull()
  })

  it('says whether all, part or none of a site is within 4 km', () => {
    expect(nearParents({ near: 3200, far: 3900 })).toBe('all')
    expect(nearParents({ near: 3800, far: 4300 })).toBe('part')
    expect(nearParents({ near: 4100, far: 4500 })).toBe('none')
  })

  it('links a public-transport trip', () => {
    const u = new URL(transitUrl([1.3, 103.8], { id: 'a', name: 'Work', kind: 'work', lat: 1.28, lon: 103.85, address: '' }))
    expect(u.searchParams.get('travelmode')).toBe('transit')
    expect(u.searchParams.get('destination')).toBe('1.280000,103.850000')
  })
})
