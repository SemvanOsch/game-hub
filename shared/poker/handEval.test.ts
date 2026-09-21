import { describe, it, expect } from 'vitest'
import type { Card, Rank, Suit } from '../blackjack/cards'
import {
  comparePokerHands,
  compareEvaluated,
  describeHand,
  evaluatePokerHand,
  evaluateFiveCardHand,
  getBestFiveCardHand
} from './handEval'

// Compact card notation: "As" = Ace spades, "Td" = Ten diamonds, "9c" = Nine clubs.
const SUITS: Record<string, Suit> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
function c(notation: string): Card {
  const rankPart = notation.slice(0, notation.length - 1)
  const suitPart = notation[notation.length - 1]
  const rank = (rankPart === 'T' ? '10' : rankPart) as Rank
  return { rank, suit: SUITS[suitPart] }
}
function hand(...notations: string[]): Card[] {
  return notations.map(c)
}

describe('evaluateFiveCardHand — categories', () => {
  it('detects a royal flush', () => {
    const h = evaluateFiveCardHand(hand('As', 'Ks', 'Qs', 'Js', 'Ts'))
    expect(h.category).toBe('royal_flush')
  })

  it('detects a straight flush (not royal)', () => {
    const h = evaluateFiveCardHand(hand('9h', '8h', '7h', '6h', '5h'))
    expect(h.category).toBe('straight_flush')
    expect(h.tiebreakers[0]).toBe(9)
  })

  it('detects four of a kind with kicker', () => {
    const h = evaluateFiveCardHand(hand('7s', '7h', '7d', '7c', 'Ks'))
    expect(h.category).toBe('four_of_a_kind')
    expect(h.tiebreakers).toEqual([7, 13])
  })

  it('detects a full house', () => {
    const h = evaluateFiveCardHand(hand('Ks', 'Kh', 'Kd', '7c', '7s'))
    expect(h.category).toBe('full_house')
    expect(h.tiebreakers).toEqual([13, 7])
  })

  it('detects a flush', () => {
    const h = evaluateFiveCardHand(hand('Ah', 'Jh', '9h', '6h', '3h'))
    expect(h.category).toBe('flush')
    expect(h.tiebreakers).toEqual([14, 11, 9, 6, 3])
  })

  it('detects a straight', () => {
    const h = evaluateFiveCardHand(hand('9s', '8h', '7d', '6c', '5s'))
    expect(h.category).toBe('straight')
    expect(h.tiebreakers[0]).toBe(9)
  })

  it('detects the A-2-3-4-5 wheel straight (Ace plays low, Five high)', () => {
    const h = evaluateFiveCardHand(hand('As', '2h', '3d', '4c', '5s'))
    expect(h.category).toBe('straight')
    expect(h.tiebreakers[0]).toBe(5)
  })

  it('the wheel straight flush is a straight flush high Five', () => {
    const h = evaluateFiveCardHand(hand('As', '2s', '3s', '4s', '5s'))
    expect(h.category).toBe('straight_flush')
    expect(h.tiebreakers[0]).toBe(5)
  })

  it('detects three of a kind', () => {
    const h = evaluateFiveCardHand(hand('Qs', 'Qh', 'Qd', '9c', '2s'))
    expect(h.category).toBe('three_of_a_kind')
    expect(h.tiebreakers).toEqual([12, 9, 2])
  })

  it('detects two pair', () => {
    const h = evaluateFiveCardHand(hand('Ks', 'Kh', '7d', '7c', 'As'))
    expect(h.category).toBe('two_pair')
    expect(h.tiebreakers).toEqual([13, 7, 14])
  })

  it('detects one pair', () => {
    const h = evaluateFiveCardHand(hand('Ts', 'Th', 'Ad', '8c', '4s'))
    expect(h.category).toBe('pair')
    expect(h.tiebreakers).toEqual([10, 14, 8, 4])
  })

  it('detects high card', () => {
    const h = evaluateFiveCardHand(hand('Ad', 'Jc', '9s', '6h', '2d'))
    expect(h.category).toBe('high_card')
    expect(h.tiebreakers).toEqual([14, 11, 9, 6, 2])
  })
})

describe('category ordering', () => {
  it('ranks every category strictly above the one below it', () => {
    const ordered = [
      hand('7d', '5c', '9s', '2h', 'Jd'), // high card
      hand('Ts', 'Th', 'Ad', '8c', '4s'), // pair
      hand('Ks', 'Kh', '7d', '7c', 'As'), // two pair
      hand('Qs', 'Qh', 'Qd', '9c', '2s'), // trips
      hand('9s', '8h', '7d', '6c', '5s'), // straight
      hand('Ah', 'Jh', '9h', '6h', '3h'), // flush
      hand('Ks', 'Kh', 'Kd', '7c', '7s'), // full house
      hand('7s', '7h', '7d', '7c', 'Ks'), // quads
      hand('9h', '8h', '7h', '6h', '5h'), // straight flush
      hand('As', 'Ks', 'Qs', 'Js', 'Ts') // royal flush
    ].map(evaluateFiveCardHand)
    for (let i = 1; i < ordered.length; i++) {
      expect(compareEvaluated(ordered[i], ordered[i - 1])).toBeGreaterThan(0)
    }
  })
})

describe('kickers and ties', () => {
  it('breaks a tied pair by kicker', () => {
    const better = evaluatePokerHand(hand('As', 'Ah', 'Kd', '3c', '2s'))
    const worse = evaluatePokerHand(hand('Ac', 'Ad', 'Qd', '3h', '2h'))
    expect(compareEvaluated(better, worse)).toBeGreaterThan(0)
  })

  it('treats identical hands (different suits) as an exact tie', () => {
    expect(comparePokerHands(hand('As', 'Ah', 'Kd', 'Qc', 'Js'), hand('Ac', 'Ad', 'Kh', 'Qs', 'Jd'))).toBe(0)
  })

  it('higher two pair beats lower two pair', () => {
    const better = evaluatePokerHand(hand('As', 'Ah', '5d', '5c', '2s'))
    const worse = evaluatePokerHand(hand('Ks', 'Kh', 'Qd', 'Qc', 'As'))
    expect(compareEvaluated(better, worse)).toBeGreaterThan(0)
  })
})

describe('getBestFiveCardHand — best five of seven', () => {
  it('picks the flush out of seven cards', () => {
    const h = getBestFiveCardHand(hand('Ah', 'Kh', 'Qh', '2h', '7h', '9s', '9c'))
    expect(h.category).toBe('flush')
    expect(h.tiebreakers).toEqual([14, 13, 12, 7, 2])
  })

  it('picks a full house over a flush draw when both are available', () => {
    const h = getBestFiveCardHand(hand('Ks', 'Kh', 'Kd', '7c', '7s', '2h', '3h'))
    expect(h.category).toBe('full_house')
    expect(h.tiebreakers).toEqual([13, 7])
  })

  it('finds a straight using the wheel across seven cards', () => {
    const h = getBestFiveCardHand(hand('As', '2h', '3d', '4c', '5s', 'Kh', 'Qd'))
    expect(h.category).toBe('straight')
    expect(h.tiebreakers[0]).toBe(5)
  })

  it('describeHand produces readable labels', () => {
    expect(describeHand(evaluatePokerHand(hand('As', 'Ks', 'Qs', 'Js', 'Ts')))).toBe('Royal Flush')
    expect(describeHand(evaluatePokerHand(hand('Ks', 'Kh', 'Kd', '7c', '7s')))).toBe(
      'Full House, Kings full of Sevens'
    )
    expect(describeHand(evaluatePokerHand(hand('Ts', 'Th', 'Ad', '8c', '4s')))).toBe('Pair of Tens')
  })
})
