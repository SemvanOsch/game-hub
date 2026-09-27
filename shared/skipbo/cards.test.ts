import { describe, it, expect } from 'vitest'
import {
  cardSatisfies,
  createSkipBoDeck,
  isSkipBo,
  requiredValue,
  shuffle
} from './cards'

describe('createSkipBoDeck', () => {
  it('builds the standard 162-card deck', () => {
    const deck = createSkipBoDeck()
    expect(deck).toHaveLength(162)
    const numbers = deck.filter((c) => c.type === 'number')
    const wilds = deck.filter((c) => c.type === 'skipbo')
    expect(numbers).toHaveLength(144)
    expect(wilds).toHaveLength(18)
  })

  it('has exactly twelve of each value 1–12', () => {
    const deck = createSkipBoDeck()
    for (let v = 1; v <= 12; v++) {
      expect(deck.filter((c) => c.type === 'number' && c.value === v)).toHaveLength(12)
    }
  })

  it('gives every card a unique id', () => {
    const deck = createSkipBoDeck()
    const ids = new Set(deck.map((c) => c.id))
    expect(ids.size).toBe(deck.length)
  })

  it('leaves wilds with a null value', () => {
    const deck = createSkipBoDeck()
    for (const wild of deck.filter((c) => c.type === 'skipbo')) {
      expect(wild.value).toBeNull()
      expect(isSkipBo(wild)).toBe(true)
    }
  })
})

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const deck = createSkipBoDeck()
    const before = deck.map((c) => c.id)
    const shuffled = shuffle(deck, () => 0.5)
    expect(deck.map((c) => c.id)).toEqual(before) // input untouched
    expect([...shuffled].map((c) => c.id).sort()).toEqual([...before].sort())
  })

  it('is deterministic given a seeded rng', () => {
    const deck = createSkipBoDeck()
    const rng1 = seededRng(42)
    const rng2 = seededRng(42)
    expect(shuffle(deck, rng1).map((c) => c.id)).toEqual(shuffle(deck, rng2).map((c) => c.id))
  })
})

describe('requiredValue / cardSatisfies', () => {
  it('requires 1 on an empty pile and n+1 otherwise', () => {
    expect(requiredValue(0)).toBe(1)
    expect(requiredValue(3)).toBe(4)
    expect(requiredValue(11)).toBe(12)
  })

  it('only accepts the exact number a pile requires', () => {
    const four = { id: 'a', type: 'number' as const, value: 4 }
    expect(cardSatisfies(four, 4)).toBe(true)
    expect(cardSatisfies(four, 3)).toBe(false)
    expect(cardSatisfies(four, 5)).toBe(false)
  })

  it('lets a Skip-Bo wild satisfy any value 1–12', () => {
    const wild = { id: 'w', type: 'skipbo' as const, value: null }
    for (let v = 1; v <= 12; v++) expect(cardSatisfies(wild, v)).toBe(true)
    expect(cardSatisfies(wild, 13)).toBe(false)
    expect(cardSatisfies(wild, 0)).toBe(false)
  })
})

/** Tiny deterministic PRNG (mulberry32) for reproducible shuffle tests. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
