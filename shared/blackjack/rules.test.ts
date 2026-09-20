import { describe, expect, it } from 'vitest'
import type { Card, Rank } from './cards'
import {
  BASE_BET_UNITS,
  CHIP_UNIT,
  MAX_HANDS_PER_PLAYER,
  calculateBlackjackPayout,
  calculateNormalWinPayout,
  calculatePushPayout,
  cardsFormSplittablePair,
  computeBet,
  formatChips,
  getSplitValue,
  payoutForOutcome,
  resolveOutcome,
  shouldDealerHit,
  unitsToChips
} from './rules'

function hand(...ranks: Rank[]): Card[] {
  const suits = ['hearts', 'spades', 'clubs', 'diamonds'] as const
  return ranks.map((rank, i) => ({ rank, suit: suits[i % suits.length] }))
}

function card(rank: Rank): Card {
  return { rank, suit: 'spades' }
}

const chips = (n: number) => n * CHIP_UNIT

describe('computeBet', () => {
  it('bets the base 100 when the player has enough', () => {
    expect(unitsToChips(computeBet(chips(500)))).toBe(100)
    expect(unitsToChips(computeBet(chips(100)))).toBe(100)
    expect(unitsToChips(computeBet(chips(240)))).toBe(100)
  })

  it('goes all-in when the player has fewer than 100 chips', () => {
    expect(unitsToChips(computeBet(chips(99)))).toBe(99)
    expect(unitsToChips(computeBet(chips(75)))).toBe(75)
    expect(unitsToChips(computeBet(chips(1)))).toBe(1)
  })
})

describe('shouldDealerHit', () => {
  it('hits on 16 or less', () => {
    expect(shouldDealerHit(hand('10', '6'))).toBe(true) // 16
    expect(shouldDealerHit(hand('9', '2'))).toBe(true) // 11
  })

  it('stands on hard 17 and above', () => {
    expect(shouldDealerHit(hand('10', '7'))).toBe(false) // hard 17
    expect(shouldDealerHit(hand('10', '8'))).toBe(false) // 18
    expect(shouldDealerHit(hand('K', 'Q'))).toBe(false) // 20
  })

  it('stands on soft 17 (A + 6)', () => {
    expect(shouldDealerHit(hand('A', '6'))).toBe(false)
  })

  it('handles multi-ace combinations', () => {
    expect(shouldDealerHit(hand('A', 'A'))).toBe(true) // 12 -> hit
    expect(shouldDealerHit(hand('A', 'A', '5'))).toBe(false) // soft 17 -> stand
  })
})

describe('payouts (in half-chip units)', () => {
  it('returns stake + 1:1 winnings on a normal win', () => {
    expect(calculateNormalWinPayout(chips(100))).toBe(chips(200))
  })

  it('returns stake back on a push', () => {
    expect(calculatePushPayout(chips(100))).toBe(chips(100))
  })

  it('pays 3:2 on a Blackjack (100 -> 250 returned)', () => {
    expect(calculateBlackjackPayout(chips(100))).toBe(chips(250))
  })

  it('pays an odd all-in Blackjack exactly (75 -> 187.5 returned)', () => {
    const payout = calculateBlackjackPayout(chips(75))
    expect(Number.isInteger(payout)).toBe(true) // exact in units
    expect(unitsToChips(payout)).toBe(187.5) // 75 stake + 112.5 profit
  })

  it('pays nothing on a loss or a bust', () => {
    expect(payoutForOutcome('lose', chips(100))).toBe(0)
    expect(payoutForOutcome('bust', chips(100))).toBe(0)
  })
})

describe('resolveOutcome', () => {
  const base = {
    playerTotal: 20,
    playerBusted: false,
    playerBlackjack: false,
    dealerTotal: 18,
    dealerBusted: false,
    dealerBlackjack: false
  }

  it('loses when the player busts, regardless of the dealer', () => {
    expect(resolveOutcome({ ...base, playerBusted: true, dealerBusted: true })).toBe('bust')
  })

  it('wins when the player beats the dealer', () => {
    expect(resolveOutcome(base)).toBe('win')
  })

  it('wins when the dealer busts', () => {
    expect(resolveOutcome({ ...base, playerTotal: 15, dealerBusted: true })).toBe('win')
  })

  it('pushes on an equal total', () => {
    expect(resolveOutcome({ ...base, playerTotal: 18 })).toBe('push')
  })

  it('loses on a lower total', () => {
    expect(resolveOutcome({ ...base, playerTotal: 17 })).toBe('lose')
  })

  it('pays Blackjack when only the player has a natural', () => {
    expect(resolveOutcome({ ...base, playerBlackjack: true })).toBe('blackjack')
  })

  it('loses to a dealer natural', () => {
    expect(resolveOutcome({ ...base, dealerBlackjack: true })).toBe('lose')
  })

  it('pushes when both have a natural', () => {
    expect(
      resolveOutcome({ ...base, playerBlackjack: true, dealerBlackjack: true })
    ).toBe('push')
  })
})

describe('formatChips', () => {
  it('shows whole and half chips cleanly', () => {
    expect(formatChips(100)).toBe('100')
    expect(formatChips(187.5)).toBe('187.5')
  })
})

describe('constants', () => {
  it('base bet is 100 chips', () => {
    expect(unitsToChips(BASE_BET_UNITS)).toBe(100)
  })

  it('caps a player at four hands', () => {
    expect(MAX_HANDS_PER_PLAYER).toBe(4)
  })
})

describe('getSplitValue', () => {
  it('treats every ten-value card as 10', () => {
    for (const rank of ['10', 'J', 'Q', 'K'] as const) {
      expect(getSplitValue(card(rank))).toBe(10)
    }
  })

  it('treats an Ace as 11 and pip cards as their number', () => {
    expect(getSplitValue(card('A'))).toBe(11)
    expect(getSplitValue(card('8'))).toBe(8)
  })
})

describe('cardsFormSplittablePair', () => {
  it('accepts equal Blackjack values, including mixed ten-value ranks', () => {
    expect(cardsFormSplittablePair(hand('8', '8'))).toBe(true)
    expect(cardsFormSplittablePair(hand('A', 'A'))).toBe(true)
    expect(cardsFormSplittablePair(hand('K', 'Q'))).toBe(true)
    expect(cardsFormSplittablePair(hand('J', '10'))).toBe(true)
    expect(cardsFormSplittablePair(hand('Q', 'K'))).toBe(true)
  })

  it('rejects unequal values and non-pairs', () => {
    expect(cardsFormSplittablePair(hand('8', '9'))).toBe(false)
    expect(cardsFormSplittablePair(hand('A', 'K'))).toBe(false)
    expect(cardsFormSplittablePair(hand('7', '10'))).toBe(false)
    expect(cardsFormSplittablePair(hand('8'))).toBe(false) // not two cards
    expect(cardsFormSplittablePair(hand('8', '8', '8'))).toBe(false)
  })
})
