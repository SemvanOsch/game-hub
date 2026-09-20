import { describe, expect, it } from 'vitest'
import { createTileSet, deal, shuffle, tilePenalty } from './tiles'
import { JOKER_PENALTY, RUMMIKUB_COLORS } from './types'

describe('createTileSet', () => {
  const tiles = createTileSet()

  it('has 106 tiles total', () => {
    expect(tiles).toHaveLength(106)
  })

  it('has exactly 2 jokers', () => {
    expect(tiles.filter((t) => t.isJoker)).toHaveLength(2)
  })

  it('has two copies of every colour/number combination', () => {
    for (const color of RUMMIKUB_COLORS) {
      for (let value = 1; value <= 13; value++) {
        const matches = tiles.filter((t) => !t.isJoker && t.color === color && t.value === value)
        expect(matches).toHaveLength(2)
      }
    }
  })

  it('has 104 numbered tiles', () => {
    expect(tiles.filter((t) => !t.isJoker)).toHaveLength(104)
  })

  it('gives every tile a unique id', () => {
    const ids = new Set(tiles.map((t) => t.id))
    expect(ids.size).toBe(106)
  })
})

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = createTileSet()
    const shuffled = shuffle(input)
    expect(shuffled).toHaveLength(input.length)
    expect(new Set(shuffled.map((t) => t.id))).toEqual(new Set(input.map((t) => t.id)))
    // Original order preserved (not mutated).
    expect(input[0].id).toBe('t-red-1-0')
  })
})

describe('deal', () => {
  it('deals 14 tiles to each player and pools the rest', () => {
    const bag = createTileSet()
    const { racks, pool } = deal(bag, 4)
    expect(racks).toHaveLength(4)
    for (const rack of racks) expect(rack).toHaveLength(14)
    expect(pool).toHaveLength(106 - 4 * 14) // 50
  })

  it('produces no duplicate tile ids across racks and pool', () => {
    const bag = createTileSet()
    const { racks, pool } = deal(bag, 3)
    const all = [...racks.flat(), ...pool].map((t) => t.id)
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(106)
  })
})

describe('tilePenalty', () => {
  it('scores a numbered tile at face value', () => {
    expect(tilePenalty({ id: 'x', color: 'red', value: 9, isJoker: false })).toBe(9)
  })
  it('scores a joker at the high penalty', () => {
    expect(tilePenalty({ id: 'j', isJoker: true })).toBe(JOKER_PENALTY)
  })
})
