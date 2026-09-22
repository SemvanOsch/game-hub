import { describe, expect, it } from 'vitest'
import type { Card, Rank } from './cards'
import { isHidden } from './cards'
import { CHIP_UNIT } from './rules'
import {
  split,
  stand,
  type BlackjackGameState,
  type BlackjackHand,
  type BlackjackServerPlayer
} from './engine'
import { getPlayerView } from './view'

const chips = (n: number) => n * CHIP_UNIT
const card = (rank: Rank, suit: Card['suit'] = 'spades'): Card => ({ rank, suit })

let handSeq = 0
function hand(cards: Card[], over: Partial<BlackjackHand> = {}): BlackjackHand {
  return {
    id: `t${handSeq++}`,
    cards,
    bet: chips(100),
    status: 'playing',
    doubled: false,
    fromSplit: false,
    splitAce: false,
    ...over
  }
}

function player(
  id: string,
  over: Partial<BlackjackServerPlayer> & { cards?: Card[] } = {}
): BlackjackServerPlayer {
  const { cards, ...rest } = over
  return {
    playerId: id,
    chips: chips(400),
    hands: over.hands ?? [hand(cards ?? [card('9'), card('7')])],
    activeHandIndex: 0,
    status: 'waiting',
    ...rest
  }
}

/** A `player_turns` state with a KNOWN hole card and a KNOWN deck to leak-check. */
function baseState(): BlackjackGameState {
  return {
    status: 'player_turns',
    endMode: 'target',
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
    handIdSeq: 1000,
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
    expect(self?.hands[0].total).toBe(20)
    const other = view.players.find((p) => !p.isSelf)
    expect(other?.hands[0].cards).toHaveLength(2) // player hands are public
  })

  it('reports chip and bet amounts in whole chips', () => {
    const view = getPlayerView(baseState(), 'a')
    const self = view.players.find((p) => p.isSelf)!
    expect(self.chips).toBe(400)
    expect(self.hands[0].bet).toBe(100)
  })

  it('marks the local player’s active hand and exposes split hands publicly', () => {
    // a holds a pair of 8s; split into two hands and check the view.
    let s = baseState()
    s.players.a = player('a', {
      status: 'playing',
      cards: [card('8', 'spades'), card('8', 'hearts')]
    })
    s.deck = [card('K', 'clubs'), card('3', 'diamonds')]
    const r = split(s, 'a')
    if (!r.ok) throw new Error('split failed')
    s = r.state

    const selfView = getPlayerView(s, 'a')
    const self = selfView.players.find((p) => p.isSelf)!
    expect(self.hands).toHaveLength(2)
    expect(self.hands[0].isActive).toBe(true)
    expect(self.hands[1].isActive).toBe(false)
    expect(selfView.canHit).toBe(true)

    // The opponent also sees a's two hands (player hands are public).
    const oppView = getPlayerView(s, 'b')
    const aFromB = oppView.players.find((p) => p.playerId === 'a')!
    expect(aFromB.hands).toHaveLength(2)
  })

  it('never leaks hidden info even after a split', () => {
    let s = baseState()
    s.players.a = player('a', {
      status: 'playing',
      cards: [card('8', 'spades'), card('8', 'clubs')]
    })
    // Split will draw these; the remaining deck cards must never appear.
    s.deck = [card('4', 'hearts'), card('3', 'hearts')]
    const r = split(s, 'a')
    if (!r.ok) throw new Error('split failed')
    s = r.state

    const view = getPlayerView(s, 'a')
    const json = JSON.stringify(view)
    // Hole card (King of diamonds) still hidden.
    expect(json).not.toContain('diamonds')
    expect(view.dealer.revealed).toBe(false)
    expect(view as object).not.toHaveProperty('deck')
  })
})
