import { describe, expect, it } from 'vitest'
import { FLOOR_SPECS } from './materials'
import { FLOOR_PHOTO, floorPhoto, recolour } from './textures'

describe('photo textures', () => {
  it('recolours pixels to a target average, keeping their variation', () => {
    const px = new Uint8ClampedArray([100, 80, 60, 255, 140, 120, 100, 255])
    recolour(px, [200, 160, 120], 0)
    expect((px[0] + px[4]) / 2).toBeCloseTo(200, 0)
    expect((px[2] + px[6]) / 2).toBeCloseTo(120, 0)
    expect(px[4]).toBeGreaterThan(px[0])
  })
  it('takes the colour out before tinting', () => {
    const px = new Uint8ClampedArray([200, 100, 50, 255])
    recolour(px, [128, 128, 128], 1)
    expect([px[0], px[1], px[2]]).toEqual([128, 128, 128])
  })
  it('only maps finishes that exist, and does nothing outside a browser', () => {
    for (const k of Object.keys(FLOOR_PHOTO)) expect(FLOOR_SPECS[k], k).toBeDefined()
    expect(floorPhoto('oak')).toBeNull()
  })
})
