/**
 * Pure Blackjack rules: chip accounting, betting, dealer behaviour and payouts.
 *
 * CHIP REPRESENTATION. All chip amounts inside the engine are integer
 * "half-chip units" (1 chip = {@link CHIP_UNIT} = 2 units). This keeps every
 * calculation exact — including a 3:2 Blackjack payout on an odd all-in bet
 * (75 chips → 112.5 profit) — with no floating-point rounding. Values are only
 * divided down to displayable chips ({@link unitsToChips}) at the view boundary.
 */
import { calculateHandValue, cardValue, isBlackjack, isBust, type Card } from './cards'

/** Half-chip units per whole chip. */
export const CHIP_UNIT = 2
/** Every player starts a match with 500 chips. */
export const STARTING_CHIPS = 500
export const STARTING_UNITS = STARTING_CHIPS * CHIP_UNIT
/** The fixed base bet placed automatically each hand (100 chips). */
export const BASE_BET_CHIPS = 100
export const BASE_BET_UNITS = BASE_BET_CHIPS * CHIP_UNIT
/** A player who reaches this many chips wins the match outright. */
export const WIN_TARGET_CHIPS = 1000
export const WIN_TARGET_UNITS = WIN_TARGET_CHIPS * CHIP_UNIT
/** Reshuffle the shoe before a new hand once fewer than this many cards remain. */
export const RESHUFFLE_THRESHOLD = 15
/** The most hands a single player may hold at once (the original plus 3 splits). */
export const MAX_HANDS_PER_PLAYER = 4

/**
 * A card's Blackjack value for the purpose of matching a splittable pair: all
 * ten-value cards (10/J/Q/K) share the value 10, and an Ace is 11. Two cards may
 * be split when this value is equal — e.g. K+Q and J+10 match, A+K does not.
 * (This is value equivalence, NOT exact-rank equality.)
 */
export function getSplitValue(card: Card): number {
  return cardValue(card.rank)
}

/** Whether a two-card hand is a splittable pair by Blackjack value equivalence. */
export function cardsFormSplittablePair(cards: readonly Card[]): boolean {
  return cards.length === 2 && getSplitValue(cards[0]) === getSplitValue(cards[1])
}

/** Convert internal half-chip units to a (possibly fractional) chip amount. */
export function unitsToChips(units: number): number {
  return units / CHIP_UNIT
}

/** Format a chip amount for display, showing the half only when present. */
export function formatChips(chips: number): string {
  return Number.isInteger(chips) ? String(chips) : chips.toFixed(1)
}

/** Format an internal unit amount straight to a display chip string. */
export function formatUnits(units: number): string {
  return formatChips(unitsToChips(units))
}

/**
 * The bet a player automatically places for a new hand: the base bet, or an
 * all-in of everything they have left if that is less than the base bet.
 * Amounts are in units. Going all-in does not immediately eliminate a player —
 * elimination is only decided after the hand is settled.
 */
export function computeBet(chipsUnits: number): number {
  return Math.min(BASE_BET_UNITS, chipsUnits)
}

/**
 * Dealer policy: hit on 16 or less, stand on 17 or more — including SOFT 17
 * (dealer stands on soft 17). Because a soft 17 still totals 17, standing on
 * every 17+ implements the soft-17 stand rule directly.
 */
export function shouldDealerHit(cards: readonly Card[]): boolean {
  return calculateHandValue(cards).total < 17
}

/** Total returned on a standard 1:1 win: the stake back plus equal winnings. */
export function calculateNormalWinPayout(betUnits: number): number {
  return betUnits * 2
}

/**
 * Total returned on a natural Blackjack at 3:2: the stake back plus 1.5× the
 * stake in winnings. Bets are always an even number of units (a whole number of
 * chips), so `betUnits * 5 / 2` is always an exact integer.
 */
export function calculateBlackjackPayout(betUnits: number): number {
  return (betUnits * 5) / 2
}

/** Total returned on a push: just the stake back, no winnings. */
export function calculatePushPayout(betUnits: number): number {
  return betUnits
}

/** The outcome of a single player's hand versus the dealer. */
export type HandOutcome = 'win' | 'lose' | 'push' | 'blackjack' | 'bust'

export interface ResolveParams {
  playerTotal: number
  playerBusted: boolean
  playerBlackjack: boolean
  dealerTotal: number
  dealerBusted: boolean
  dealerBlackjack: boolean
}

/**
 * Resolve one player's hand against the dealer, returning the outcome that
 * drives the payout. Pure and total: given the summarised hand facts it never
 * inspects the cards again.
 */
export function resolveOutcome(p: ResolveParams): HandOutcome {
  if (p.playerBusted) return 'bust'
  if (p.playerBlackjack && p.dealerBlackjack) return 'push'
  if (p.playerBlackjack) return 'blackjack'
  if (p.dealerBlackjack) return 'lose'
  if (p.dealerBusted) return 'win'
  if (p.playerTotal > p.dealerTotal) return 'win'
  if (p.playerTotal === p.dealerTotal) return 'push'
  return 'lose'
}

/** Total returned to the player for a resolved outcome (0 on a loss/bust). */
export function payoutForOutcome(outcome: HandOutcome, betUnits: number): number {
  switch (outcome) {
    case 'win':
      return calculateNormalWinPayout(betUnits)
    case 'blackjack':
      return calculateBlackjackPayout(betUnits)
    case 'push':
      return calculatePushPayout(betUnits)
    case 'lose':
    case 'bust':
      return 0
  }
}

/** Convenience wrappers used by the engine and its tests. */
export function playerIsBlackjack(cards: readonly Card[]): boolean {
  return isBlackjack(cards)
}
export function playerIsBust(cards: readonly Card[]): boolean {
  return isBust(cards)
}
