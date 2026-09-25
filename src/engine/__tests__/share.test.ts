import { describe, expect, it } from 'vitest'
import { decodeScenario, encodeScenario, sharedCode, shareUrl } from '../../state/share'
import { seedScenario } from '../../state/defaults'

describe('share by link', () => {
  it('round-trips a scenario', async () => {
    const s = seedScenario()
    expect(await decodeScenario(await encodeScenario(s))).toEqual(s)
  })

  it('builds a URL-safe link that is reasonably short', async () => {
    const url = await shareUrl(seedScenario(), 'https://example.com/app?x=1#old')
    const code = sharedCode(new URL(url).hash)!
    expect(url.startsWith('https://example.com/app?x=1#s=')).toBe(true)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(url.length).toBeLessThan(4000)
  })

  it('ignores other hashes', () => {
    expect(sharedCode('#top')).toBeNull()
    expect(sharedCode('')).toBeNull()
  })

  it('rejects damaged links', async () => {
    const code = await encodeScenario(seedScenario())
    await expect(decodeScenario(code.slice(0, 40))).rejects.toThrow(/cut off/)
    await expect(decodeScenario('!!!')).rejects.toThrow()
  })
})
