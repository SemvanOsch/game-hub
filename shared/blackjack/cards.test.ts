import { describe, expect, it } from 'vitest'
import {
  cardValue,
  createDeck,
  handTotal,
  isBlackjack,
  isBust,
  isSoftHand,
  type Card,
  type Rank
} from './cards'

function hand(...ranks: Rank[]): Card[] {
  // Suit is irrelevant to value; alternate to keep cards distinct.
  const suits = ['hearts', 'spades', 'clubs', 'diamonds'] as const
  return ranks.map((rank, i) => ({ rank, suit: suits[i % suits.length] }))
}

describe('cardValue', () => {
  it('scores numeric, face and ace cards', () => {
    expect(cardValue('2')).toBe(2)
    expect(cardValue('10')).toBe(10)
    expect(cardValue('J')).toBe(10)
    expect(cardValue('Q')).toBe(10)
    expect(cardValue('K')).toBe(10)
    expect(cardValue('A')).toBe(11)
  })
})

describe('createDeck', () => {
  it('builds a standard 52-card deck of unique cards', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(52)
    const unique = new Set(deck.map((c) => `${c.rank}${c.suit}`))
    expect(unique.size).toBe(52)
  })
})

describe('calculateHandValue – aces', () => {
  it('counts an ace as 11 when it does not bust', () => {
    expect(handTotal(hand('A', '7'))).toBe(18)
    expect(isSoftHand(hand('A', '7'))).toBe(true)
  })

  it('makes A + K a natural 21', () => {
    expect(handTotal(hand('A', 'K'))).toBe(21)
    expect(isBlackjack(hand('A', 'K'))).toBe(true)
  })

  it('downgrades an ace to 1 to avoid a bust', () => {
    expect(handTotal(hand('A', '7', '8'))).toBe(16)
    expect(isSoftHand(hand('A', '7', '8'))).toBe(false)
  })

  it('handles two aces (12), and 21 with more cards', () => {
    expect(handTotal(hand('A', 'A'))).toBe(12)
    expect(handTotal(hand('A', 'A', '9'))).toBe(21)
    expect(handTotal(hand('A', 'A', '9', 'K'))).toBe(21)
  })

  it('distinguishes soft 17 (A+6) from hard 17 (A+6+10)', () => {
    expect(handTotal(hand('A', '6'))).toBe(17)
    expect(isSoftHand(hand('A', '6'))).toBe(true)
    expect(handTotal(hand('A', '6', '10'))).toBe(17)
    expect(isSoftHand(hand('A', '6', '10'))).toBe(false)
  })
})

describe('bust and blackjack', () => {
  it('detects a bust over 21', () => {
    expect(isBust(hand('K', 'Q', '5'))).toBe(true)
    expect(isBust(hand('K', 'Q'))).toBe(false)
  })

  it('only counts exactly two cards as a natural', () => {
    expect(isBlackjack(hand('A', 'Q'))).toBe(true)
    expect(isBlackjack(hand('7', '7', '7'))).toBe(false) // 21 but 3 cards
  })
})
