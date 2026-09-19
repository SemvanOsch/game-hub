/**
 * Pure playing-card model and hand-value logic for Blackjack.
 *
 * No React, no networking, no I/O beyond Math.random (deck shuffling). These
 * helpers are isomorphic: imported by the server (authoritative rules) and the
 * renderer (display totals). Keep them free of Node/browser-specific imports.
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'

export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'

export interface Card {
  suit: Suit
  rank: Rank
}

/**
 * A card slot as seen by a client: either a fully known card, or a placeholder
 * for a card whose identity the client is not allowed to know yet (the dealer's
 * face-down hole card). The hidden card's real suit/rank is NEVER serialized —
 * hidden information is enforced on the server, not with CSS.
 */
export type CardOrHidden = Card | { hidden: true }

export function isHidden(card: CardOrHidden): card is { hidden: true } {
  return (card as { hidden?: true }).hidden === true
}

export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
export const RANKS: readonly Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K'
]

/** Base value of a rank. Aces count as 11 here; downgraded to 1 as needed. */
export function cardValue(rank: Rank): number {
  if (rank === 'A') return 11
  if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10') return 10
  return Number(rank)
}

/** A fresh, ordered 52-card deck (one of each suit/rank). */
export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank })
    }
  }
  return deck
}

/**
 * Return a new array shuffled with an unbiased Fisher-Yates shuffle. The input
 * is not mutated. The server calls this authoritatively; clients never decide
 * card order.
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const out = input.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Best legal Blackjack value of a hand, treating Aces as 11 where possible
 * without busting and 1 otherwise.
 *
 * `soft` is true when at least one Ace is still counted as 11 (a "soft" hand),
 * which the dealer-stand rules and UI care about.
 */
export function calculateHandValue(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0
  let aces = 0
  for (const card of cards) {
    total += cardValue(card.rank)
    if (card.rank === 'A') aces++
  }
  // Each Ace was added as 11; downgrade to 1 (subtract 10) while busting.
  let softAces = aces
  while (total > 21 && softAces > 0) {
    total -= 10
    softAces--
  }
  return { total, soft: softAces > 0 }
}

/** Convenience: the best total of a hand. */
export function handTotal(cards: readonly Card[]): number {
  return calculateHandValue(cards).total
}

/** A natural Blackjack: exactly two cards totalling 21. */
export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handTotal(cards) === 21
}

/** Whether the hand's best total exceeds 21. */
export function isBust(cards: readonly Card[]): boolean {
  return handTotal(cards) > 21
}

/** Whether the hand is "soft" (an Ace is counted as 11). */
export function isSoftHand(cards: readonly Card[]): boolean {
  return calculateHandValue(cards).soft
}
