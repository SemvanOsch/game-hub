import { describe, expect, it } from 'vitest'
import {
  firstInvalidGroup,
  groupValue,
  isValidGroup,
  isValidRun,
  isValidSet,
  orderRunTiles,
  resolveGroup
} from './rules'
import type { RummikubColor, RummikubGroup, RummikubTile } from './types'

let seq = 0
function t(color: RummikubColor, value: number): RummikubTile {
  return { id: `t${seq++}`, color, value, isJoker: false }
}
function joker(): RummikubTile {
  return { id: `j${seq++}`, isJoker: true }
}

describe('isValidRun', () => {
  it('accepts a 3-tile same-colour ascending run', () => {
    expect(isValidRun([t('red', 3), t('red', 4), t('red', 5)])).toBe(true)
  })
  it('accepts a longer run', () => {
    expect(isValidRun([t('blue', 8), t('blue', 9), t('blue', 10), t('blue', 11)])).toBe(true)
  })
  it('rejects a gap', () => {
    expect(isValidRun([t('red', 3), t('red', 5), t('red', 6)])).toBe(false)
  })
  it('rejects mixed colours', () => {
    expect(isValidRun([t('red', 3), t('blue', 4), t('red', 5)])).toBe(false)
  })
  it('rejects a wrap-around (1 is low only)', () => {
    expect(isValidRun([t('red', 13), t('red', 1), t('red', 2)])).toBe(false)
  })
  it('rejects duplicate values in the same colour', () => {
    expect(isValidRun([t('red', 5), t('red', 5), t('red', 6)])).toBe(false)
  })
  it('accepts a run with a joker filling the gap', () => {
    expect(isValidRun([t('red', 5), t('red', 6), joker(), t('red', 8)])).toBe(true)
  })
  it('accepts a joker leading the run', () => {
    expect(isValidRun([joker(), t('red', 6), t('red', 7)])).toBe(true)
  })
  it('rejects fewer than 3 tiles', () => {
    expect(isValidRun([t('red', 4), t('red', 5)])).toBe(false)
  })
  it('is order-independent (tiles form a run in any order)', () => {
    expect(isValidRun([t('red', 5), t('red', 3), t('red', 4)])).toBe(true)
  })
  it('accepts two jokers extending a short run', () => {
    // red 4,5 + 2 jokers -> a 4-tile run (e.g. 4,5,6,7)
    expect(isValidRun([t('red', 4), t('red', 5), joker(), joker()])).toBe(true)
  })
})

describe('isValidSet', () => {
  it('accepts a 3-tile set of one number, distinct colours', () => {
    expect(isValidSet([t('red', 7), t('blue', 7), t('black', 7)])).toBe(true)
  })
  it('accepts a 4-tile set', () => {
    expect(isValidSet([t('red', 7), t('blue', 7), t('black', 7), t('orange', 7)])).toBe(true)
  })
  it('rejects a duplicate colour', () => {
    expect(isValidSet([t('red', 7), t('red', 7), t('blue', 7)])).toBe(false)
  })
  it('rejects mixed numbers', () => {
    expect(isValidSet([t('red', 7), t('blue', 8), t('black', 7)])).toBe(false)
  })
  it('rejects more than 4 tiles', () => {
    expect(
      isValidSet([t('red', 7), t('blue', 7), t('black', 7), t('orange', 7), joker()])
    ).toBe(false)
  })
  it('accepts a set completed by a joker', () => {
    expect(isValidSet([t('red', 9), t('blue', 9), joker()])).toBe(true)
  })
})

describe('resolveGroup / groupValue', () => {
  it('values a run as the sum of its numbers', () => {
    expect(groupValue([t('red', 10), t('red', 11), t('red', 12)])).toBe(33)
  })
  it('values a run joker as the number it represents', () => {
    // red 5,6,[7],8 -> 26
    expect(groupValue([t('red', 5), t('red', 6), joker(), t('red', 8)])).toBe(26)
  })
  it('values a set as the number times the tile count', () => {
    expect(groupValue([t('red', 7), t('blue', 7), t('black', 7)])).toBe(21)
  })
  it('values a set joker as the common number', () => {
    expect(groupValue([t('red', 9), t('blue', 9), joker()])).toBe(27)
  })
  it('returns null for an invalid group', () => {
    expect(resolveGroup([t('red', 3), t('blue', 4), t('red', 5)])).toBeNull()
  })
})

describe('orderRunTiles', () => {
  it('sorts an out-of-order run ascending (8 6 7 -> 6 7 8)', () => {
    const eight = t('red', 8)
    const six = t('red', 6)
    const seven = t('red', 7)
    const ordered = orderRunTiles([eight, six, seven])
    expect(ordered?.map((t) => t.value)).toEqual([6, 7, 8])
  })
  it('places a joker in the gap it fills', () => {
    const five = t('red', 5)
    const j = joker()
    const seven = t('red', 7)
    const ordered = orderRunTiles([seven, five, j])
    expect(ordered?.map((t) => (t.isJoker ? 'J' : t.value))).toEqual([5, 'J', 7])
  })
  it('returns null for a non-run', () => {
    expect(orderRunTiles([t('red', 7), t('blue', 7), t('black', 7)])).toBeNull()
  })
})

describe('isValidGroup / firstInvalidGroup', () => {
  it('accepts either a run or a set', () => {
    expect(isValidGroup([t('red', 3), t('red', 4), t('red', 5)])).toBe(true)
    expect(isValidGroup([t('red', 7), t('blue', 7), t('black', 7)])).toBe(true)
  })

  it('finds the first invalid group on a table', () => {
    const a = t('red', 3)
    const b = t('red', 4)
    const c = t('red', 5)
    const x = t('red', 3)
    const y = t('blue', 8)
    const z = t('black', 3)
    const byId = new Map([a, b, c, x, y, z].map((tile) => [tile.id, tile]))
    const table: RummikubGroup[] = [
      { id: 'g1', tileIds: [a.id, b.id, c.id] }, // valid run
      { id: 'g2', tileIds: [x.id, y.id, z.id] } // invalid (mixed)
    ]
    expect(firstInvalidGroup(table, byId)).toBe('g2')
  })

  it('treats an empty table as valid', () => {
    expect(firstInvalidGroup([], new Map())).toBeNull()
  })
})
