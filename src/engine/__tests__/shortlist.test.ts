import { describe, expect, it } from 'vitest'
import { addToShortlist, moveInShortlist, parseShortlist, SHORTLIST_MAX } from '../../state/shortlist'

const u = (storey: number) => ({ site: 'berlayar-rise', block: '200B', unit: '129', storey, type: '4R', facing: 'north' })

describe('the unit shortlist', () => {
  it('reads it back, dropping bad entries and repeats', () => {
    expect(parseShortlist(JSON.stringify([u(7), { ...u(8), block: '' }, u(7), { ...u(9), at: 5 }]))).toEqual([u(7), u(9)])
    expect(parseShortlist('{}')).toEqual([])
    expect(parseShortlist(null)).toEqual([])
  })
  it('adds at the bottom, once, up to the limit', () => {
    let list = addToShortlist([], u(7)).list
    list = addToShortlist(list, u(8)).list
    expect(addToShortlist(list, u(7)).added).toBe(false)
    expect(list).toEqual([u(7), u(8)])
    const full = Array.from({ length: SHORTLIST_MAX }, (_, i) => u(i + 2))
    expect(addToShortlist(full, u(40)).added).toBe(false)
  })
  it('moves units up and down the ranking', () => {
    const list = [u(2), u(3), u(4)]
    expect(moveInShortlist(list, 2, -1)).toEqual([u(2), u(4), u(3)])
    expect(moveInShortlist(list, 0, -1)).toBe(list)
    expect(moveInShortlist(list, 2, 1)).toBe(list)
  })
})
