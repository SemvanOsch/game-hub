import { describe, expect, it } from 'vitest'
import type { Card, Rank } from './cards'
import { isHidden } from './cards'
import { CHIP_UNIT } from './rules'
import { stand, type BlackjackGameState, type BlackjackServerPlayer } from './engine'
import { getPlayerView } from './view'

const chips = (n: number) => n * CHIP_UNIT
const card = (rank: Rank, suit: Card['suit'] = 'spades'): Card => ({ rank, suit })

function player(id: string, over: Partial<BlackjackServerPlayer> = {}): BlackjackServerPlayer {
  return {
    playerId: id,
    chips: chips(400),
    bet: chips(100),
    cards: [card('9'), card('7')],
    status: 'waiting',
    hasActed: false,
    doubled: false,
    ...over
  }
}

/** A `player_turns` state with a KNOWN hole card and a KNOWN deck to leak-check. */
function baseState(): BlackjackGameState {
  return {
    status: 'player_turns',
    playerOrder: ['a', 'b'],
    players: {
      a: player('a', { status: 'playing', cards: [card('10', 'hearts'), card('Q', 'clubs')] }),
      b: player('b', { status: 'waiting', cards: [card('9', 'clubs'), card('7', 'spades')] })
    },
    // Up card is the 6 of spades; the HOLE card is the King of diamonds (secret).
    // Diamonds and the rank K appear ONLY on the hole card, so a leak is easy to spot.
    dealerCards: [card('6', 'spades'), card('K', 'diamonds')],
    dealerRevealed: false,
    currentPlayerId: 'a',
    handNumber: 1,
    // Undrawn deck the client must never see.
    deck: [card('2', 'hearts'), card('3', 'hearts'), card('4', 'hearts')]
  }
}

describe('getPlayerView – information security', () => {
  it("never serializes the dealer's hole card before reveal", () => {
    const view = getPlayerView(baseState(), 'a')
    const json = JSON.stringify(view)
    // The hole card is King of diamonds — its exact suit+rank must be absent.
    expect(json).not.toContain('"rank":"K"')
    expect(json).not.toContain('diamonds') // diamonds appears only on the hidden hole card
  })

  it('exposes the up card but hides the hole card as a placeholder', () => {
    const view = getPlayerView(baseState(), 'a')
    expect(view.dealer.cards).toHaveLength(2)
    expect(view.dealer.cards[0]).toEqual({ rank: '6', suit: 'spades' })
    expect(isHidden(view.dealer.cards[1])).toBe(true)
    expect(view.dealer.revealed).toBe(false)
    // Only the up card contributes to the visible total.
    expect(view.dealer.visibleTotal).toBe(6)
  })

  it('never serializes the undealt deck', () => {
    const view = getPlayerView(baseState(), 'a')
    expect(view as object).not.toHaveProperty('deck')
    const json = JSON.stringify(view)
    // The deck's 2/3/4 of hearts must not appear anywhere in the view.
    expect(json).not.toContain('"rank":"2"')
    expect(json).not.toContain('"rank":"3"')
    expect(json).not.toContain('"rank":"4"')
  })

  it('reveals the full dealer hand only once the hand is over', () => {
    let s = baseState()
    // Move b into play, then have both stand to reach the dealer's reveal.
    s.players.a.status = 'playing'
    const r1 = stand(s, 'a')
    if (!r1.ok) throw new Error('a stand failed')
    s = r1.state
    const r2 = stand(s, 'b')
    if (!r2.ok) throw new Error('b stand failed')
    s = r2.state

    const view = getPlayerView(s, 'a')
    expect(view.dealer.revealed).toBe(true)
    // Now the hole card (King of diamonds) is legitimately part of the view.
    expect(view.dealer.cards.some((c) => !isHidden(c) && c.rank === 'K')).toBe(true)
  })

  it('gives every player their own and opponents’ public hands', () => {
    const view = getPlayerView(baseState(), 'a')
    expect(view.players).toHaveLength(2)
    const self = view.players.find((p) => p.isSelf)
    expect(self?.playerId).toBe('a')
    expect(self?.total).toBe(20)
    const other = view.players.find((p) => !p.isSelf)
    expect(other?.cards).toHaveLength(2) // player hands are public
  })

  it('reports chip and bet amounts in whole chips', () => {
    const view = getPlayerView(baseState(), 'a')
    const self = view.players.find((p) => p.isSelf)!
    expect(self.chips).toBe(400)
    expect(self.bet).toBe(100)
  })
})
