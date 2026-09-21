/**
 * Pure Texas Hold'em hand evaluation — no React, no networking, no I/O.
 *
 * The 52-card model (suits/ranks/deck/shuffle) is shared with Blackjack; only
 * the *evaluation* differs, so we import {@link Card} from there rather than
 * defining a second card type.
 *
 * The public surface:
 *   - {@link evaluatePokerHand} / {@link getBestFiveCardHand} — best 5-card hand
 *     from 5–7 cards.
 *   - {@link comparePokerHands} — total ordering used to pick pot winners.
 *   - {@link describeHand} — a human label ("Full House, Kings full of Sevens").
 *
 * These are the single source of truth for hand strength; UI code must never
 * re-implement ranking — it only *displays* what these functions return.
 */
import type { Card, Rank } from '../blackjack/cards'

/** Poker hand categories, weakest → strongest. The numeric value doubles as the
 *  primary comparison key (higher wins). Royal Flush is a distinct category from
 *  Straight Flush purely for presentation; strength-wise a royal is just the
 *  best straight flush. */
export type HandCategory =
  | 'high_card'
  | 'pair'
  | 'two_pair'
  | 'three_of_a_kind'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'four_of_a_kind'
  | 'straight_flush'
  | 'royal_flush'

export const CATEGORY_RANK: Record<HandCategory, number> = {
  high_card: 1,
  pair: 2,
  two_pair: 3,
  three_of_a_kind: 4,
  straight: 5,
  flush: 6,
  full_house: 7,
  four_of_a_kind: 8,
  straight_flush: 9,
  royal_flush: 10
}

export const CATEGORY_LABEL: Record<HandCategory, string> = {
  high_card: 'High Card',
  pair: 'Pair',
  two_pair: 'Two Pair',
  three_of_a_kind: 'Three of a Kind',
  straight: 'Straight',
  flush: 'Flush',
  full_house: 'Full House',
  four_of_a_kind: 'Four of a Kind',
  straight_flush: 'Straight Flush',
  royal_flush: 'Royal Flush'
}

export interface EvaluatedHand {
  category: HandCategory
  /** Primary comparison key (CATEGORY_RANK). */
  rank: number
  /** Secondary keys compared left-to-right when categories tie (all descending). */
  tiebreakers: number[]
  /** The exact best five cards forming this hand (for highlighting at showdown). */
  cards: Card[]
}

/** Numeric value of a rank with Ace high (Ace-low handling is local to straights). */
export function rankValue(rank: Rank): number {
  switch (rank) {
    case 'A':
      return 14
    case 'K':
      return 13
    case 'Q':
      return 12
    case 'J':
      return 11
    case '10':
      return 10
    default:
      return Number(rank)
  }
}

const RANK_NAME: Record<number, string> = {
  14: 'Ace',
  13: 'King',
  12: 'Queen',
  11: 'Jack',
  10: 'Ten',
  9: 'Nine',
  8: 'Eight',
  7: 'Seven',
  6: 'Six',
  5: 'Five',
  4: 'Four',
  3: 'Three',
  2: 'Two'
}

const RANK_NAME_PLURAL: Record<number, string> = {
  14: 'Aces',
  13: 'Kings',
  12: 'Queens',
  11: 'Jacks',
  10: 'Tens',
  9: 'Nines',
  8: 'Eights',
  7: 'Sevens',
  6: 'Sixes',
  5: 'Fives',
  4: 'Fours',
  3: 'Threes',
  2: 'Twos'
}

/** Every k-sized combination of `items` (used to pick the best 5 of 7 cards). */
function combinations<T>(items: T[], k: number): T[][] {
  const result: T[][] = []
  const combo: T[] = []
  const recurse = (start: number): void => {
    if (combo.length === k) {
      result.push(combo.slice())
      return
    }
    for (let i = start; i < items.length; i++) {
      combo.push(items[i])
      recurse(i + 1)
      combo.pop()
    }
  }
  recurse(0)
  return result
}

/**
 * Evaluate exactly five cards. Detects the highest category the five cards form
 * and records tiebreakers so two hands of the same category order correctly.
 */
export function evaluateFiveCardHand(cards: Card[]): EvaluatedHand {
  if (cards.length !== 5) {
    throw new Error(`evaluateFiveCardHand expects 5 cards, got ${cards.length}`)
  }

  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a)
  const isFlush = cards.every((c) => c.suit === cards[0].suit)

  // Straight detection over distinct values, including the A-2-3-4-5 "wheel"
  // where the Ace plays low and the straight's high card is the Five.
  const distinct = [...new Set(values)].sort((a, b) => b - a)
  let straightHigh = 0
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) {
      straightHigh = distinct[0]
    } else if (
      distinct[0] === 14 &&
      distinct[1] === 5 &&
      distinct[2] === 4 &&
      distinct[3] === 3 &&
      distinct[4] === 2
    ) {
      straightHigh = 5
    }
  }
  const isStraight = straightHigh > 0

  // Rank multiplicities, ordered by count then value (so [count,value] pairs
  // read naturally into pair/trips/quads tiebreakers).
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const groupCounts = groups.map((g) => g[1])
  const groupValues = groups.map((g) => g[0])

  const make = (category: HandCategory, tiebreakers: number[]): EvaluatedHand => ({
    category,
    rank: CATEGORY_RANK[category],
    tiebreakers,
    cards
  })

  if (isStraight && isFlush) {
    // Ace-high straight flush is the Royal Flush.
    if (straightHigh === 14) return make('royal_flush', [14])
    return make('straight_flush', [straightHigh])
  }
  if (groupCounts[0] === 4) {
    return make('four_of_a_kind', [groupValues[0], groupValues[1]])
  }
  if (groupCounts[0] === 3 && groupCounts[1] === 2) {
    return make('full_house', [groupValues[0], groupValues[1]])
  }
  if (isFlush) {
    return make('flush', values)
  }
  if (isStraight) {
    return make('straight', [straightHigh])
  }
  if (groupCounts[0] === 3) {
    return make('three_of_a_kind', [groupValues[0], groupValues[1], groupValues[2]])
  }
  if (groupCounts[0] === 2 && groupCounts[1] === 2) {
    // groupValues[0],[1] are the two pairs (already sorted high→low), [2] kicker.
    return make('two_pair', [groupValues[0], groupValues[1], groupValues[2]])
  }
  if (groupCounts[0] === 2) {
    return make('pair', [groupValues[0], groupValues[1], groupValues[2], groupValues[3]])
  }
  return make('high_card', values)
}

/**
 * Best five-card hand from 5, 6 or 7 cards (hole + community), by brute-forcing
 * every 5-card subset. Correct and simple; 7-choose-5 = 21 evaluations.
 */
export function getBestFiveCardHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    throw new Error(`getBestFiveCardHand needs at least 5 cards, got ${cards.length}`)
  }
  if (cards.length === 5) return evaluateFiveCardHand(cards)
  let best: EvaluatedHand | null = null
  for (const combo of combinations(cards, 5)) {
    const evaluated = evaluateFiveCardHand(combo)
    if (!best || compareEvaluated(evaluated, best) > 0) best = evaluated
  }
  return best as EvaluatedHand
}

/** Public alias matching the naming in the spec. */
export function evaluatePokerHand(cards: Card[]): EvaluatedHand {
  return getBestFiveCardHand(cards)
}

/** Compare two already-evaluated hands: >0 if `a` is stronger, <0 if weaker, 0 if tied. */
export function compareEvaluated(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.rank !== b.rank) return a.rank - b.rank
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length)
  for (let i = 0; i < len; i++) {
    const av = a.tiebreakers[i] ?? 0
    const bv = b.tiebreakers[i] ?? 0
    if (av !== bv) return av - bv
  }
  return 0
}

/** Compare two hands given as raw card sets (each evaluated to its best five). */
export function comparePokerHands(a: Card[], b: Card[]): number {
  return compareEvaluated(getBestFiveCardHand(a), getBestFiveCardHand(b))
}

/** A concise human label for an evaluated hand, e.g. "Two Pair, Kings and Sevens". */
export function describeHand(hand: EvaluatedHand): string {
  const t = hand.tiebreakers
  switch (hand.category) {
    case 'royal_flush':
      return 'Royal Flush'
    case 'straight_flush':
      return `Straight Flush, ${RANK_NAME[t[0]]}-high`
    case 'four_of_a_kind':
      return `Four of a Kind, ${RANK_NAME_PLURAL[t[0]]}`
    case 'full_house':
      return `Full House, ${RANK_NAME_PLURAL[t[0]]} full of ${RANK_NAME_PLURAL[t[1]]}`
    case 'flush':
      return `Flush, ${RANK_NAME[t[0]]}-high`
    case 'straight':
      return `Straight, ${RANK_NAME[t[0]]}-high`
    case 'three_of_a_kind':
      return `Three of a Kind, ${RANK_NAME_PLURAL[t[0]]}`
    case 'two_pair':
      return `Two Pair, ${RANK_NAME_PLURAL[t[0]]} and ${RANK_NAME_PLURAL[t[1]]}`
    case 'pair':
      return `Pair of ${RANK_NAME_PLURAL[t[0]]}`
    case 'high_card':
      return `${RANK_NAME[t[0]]}-high`
  }
}
