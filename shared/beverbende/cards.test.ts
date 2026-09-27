import { describe, it, expect } from 'vitest'
import {
  createBeverbendeDeck,
  shuffle,
  cardPoints,
  isSpecial,
  DECK_SIZE,
  NUMBER_CARD_COUNT,
  SPECIAL_CARD_COUNT,
  SWAP_COPIES,
  PEEK_COPIES,
  DRAW_TWO_COPIES,
  NINE_COPIES,
  LOW_VALUE_COPIES
} from './cards'

/** Deterministic mulberry32 PRNG for reproducible shuffles. */
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

describe('createBeverbendeDeck', () => {
  const deck = createBeverbendeDeck()

  it('has exactly 66 cards (45 number + 21 special)', () => {
    expect(deck).toHaveLength(66)
    expect(DECK_SIZE).toBe(66)
    expect(NUMBER_CARD_COUNT).toBe(45)
    expect(SPECIAL_CARD_COUNT).toBe(21)
  })

  it('has values 0–8 four times each and nine 9s', () => {
    const numbers = deck.filter((c) => c.type === 'number') as Array<{ value: number }>
    expect(numbers).toHaveLength(45)
    for (let v = 0; v <= 8; v++) {
      expect(numbers.filter((c) => c.value === v)).toHaveLength(LOW_VALUE_COPIES)
    }
    expect(numbers.filter((c) => c.value === 9)).toHaveLength(NINE_COPIES)
  })

  it('has 9 swap, 7 peek and 5 draw-two special cards', () => {
    expect(deck.filter((c) => c.type === 'swap')).toHaveLength(SWAP_COPIES)
    expect(deck.filter((c) => c.type === 'peek')).toHaveLength(PEEK_COPIES)
    expect(deck.filter((c) => c.type === 'drawTwo')).toHaveLength(DRAW_TWO_COPIES)
  })

  it('gives every card a unique id', () => {
    const ids = new Set(deck.map((c) => c.id))
    expect(ids.size).toBe(deck.length)
  })
})

describe('cardPoints', () => {
  it('scores a number card as its value and specials as 0', () => {
    expect(cardPoints({ id: 'a', type: 'number', value: 7 })).toBe(7)
    expect(cardPoints({ id: 'b', type: 'number', value: 0 })).toBe(0)
    expect(cardPoints({ id: 'c', type: 'peek' })).toBe(0)
    expect(cardPoints({ id: 'd', type: 'swap' })).toBe(0)
    expect(cardPoints({ id: 'e', type: 'drawTwo' })).toBe(0)
  })

  it('classifies specials correctly', () => {
    expect(isSpecial({ id: 'a', type: 'number', value: 3 })).toBe(false)
    expect(isSpecial({ id: 'b', type: 'peek' })).toBe(true)
    expect(isSpecial({ id: 'c', type: 'swap' })).toBe(true)
    expect(isSpecial({ id: 'd', type: 'drawTwo' })).toBe(true)
  })
})

describe('shuffle', () => {
  it('does not mutate the source and preserves the multiset', () => {
    const deck = createBeverbendeDeck()
    const before = deck.map((c) => c.id)
    const out = shuffle(deck, seededRng(1))
    // Source untouched.
    expect(deck.map((c) => c.id)).toEqual(before)
    // Same cards, (very likely) different order.
    expect(new Set(out.map((c) => c.id))).toEqual(new Set(before))
    expect(out).toHaveLength(deck.length)
  })

  it('is deterministic for a fixed seed', () => {
    const a = shuffle(createBeverbendeDeck(), seededRng(42)).map((c) => c.id)
    const b = shuffle(createBeverbendeDeck(), seededRng(42)).map((c) => c.id)
    expect(a).toEqual(b)
  })
})
