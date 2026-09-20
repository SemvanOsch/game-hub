import { describe, expect, it } from 'vitest'
import type { Card, Rank } from './cards'
import { CHIP_UNIT } from './rules'
import {
  createGame,
  doubleDown,
  finishMatch,
  hit,
  nextHand,
  removePlayerFromGame,
  split,
  stand,
  type BlackjackGameState,
  type BlackjackHand,
  type BlackjackHandStatus,
  type BlackjackPlayerStatus,
  type BlackjackServerPlayer
} from './engine'

const chips = (n: number) => n * CHIP_UNIT

function card(rank: Rank, suit: Card['suit'] = 'spades'): Card {
  return { rank, suit }
}

let handSeq = 0
function makeHand(cards: Card[], bet: number, over: Partial<BlackjackHand> = {}): BlackjackHand {
  return {
    id: `t${handSeq++}`,
    cards,
    bet,
    status: 'playing',
    doubled: false,
    fromSplit: false,
    splitAce: false,
    ...over
  }
}

interface PlayerOpts {
  chips?: number
  bet?: number
  cards?: Card[]
  /** Player-level turn status. */
  status?: BlackjackPlayerStatus
  /** Status of the single default hand. */
  handStatus?: BlackjackHandStatus
  doubled?: boolean
  /** Fully-specified hands, overriding the single default hand. */
  hands?: BlackjackHand[]
  activeHandIndex?: number
}

function player(id: string, over: PlayerOpts = {}): BlackjackServerPlayer {
  const hands =
    over.hands ??
    [
      makeHand(over.cards ?? [], over.bet ?? chips(100), {
        status: over.handStatus ?? 'playing',
        doubled: over.doubled ?? false
      })
    ]
  return {
    playerId: id,
    chips: over.chips ?? chips(400),
    hands,
    activeHandIndex: over.activeHandIndex ?? 0,
    status: over.status ?? 'waiting'
  }
}

/** The (single) default hand of a player, for concise assertions. */
function h0(p: BlackjackServerPlayer): BlackjackHand {
  return p.hands[0]
}

/**
 * Build a `player_turns` state directly (bypassing the random deal) so tests can
 * control every card. `deck` is drawn from the END, so the last entry is drawn
 * first.
 */
function state(over: Partial<BlackjackGameState> & {
  players: Record<string, BlackjackServerPlayer>
  playerOrder: string[]
}): BlackjackGameState {
  return {
    status: 'player_turns',
    deck: [],
    dealerCards: [card('10', 'hearts'), card('8', 'clubs')], // 18, dealer stands
    dealerRevealed: false,
    currentPlayerId: over.playerOrder[0],
    handNumber: 1,
    handIdSeq: 1000,
    ...over
  }
}

function unwrap(result: ReturnType<typeof stand>): BlackjackGameState {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`)
  return result.state
}

describe('createGame', () => {
  it('deals a first hand: two cards per player and to the dealer', () => {
    // The deal is random; run several to cover the natural-Blackjack branches.
    for (let i = 0; i < 20; i++) {
      const s = createGame(['a', 'b'])
      expect(h0(s.players.a).cards).toHaveLength(2)
      expect(h0(s.players.b).cards).toHaveLength(2)
      expect(s.dealerCards.length).toBeGreaterThanOrEqual(2)
      expect(['player_turns', 'hand_over', 'finished']).toContain(s.status)
      if (s.status === 'player_turns') {
        // Mid-hand (before any payout) the committed bet plus remaining chips
        // equals the starting stack.
        expect(s.players.a.chips + h0(s.players.a).bet).toBe(chips(500))
        expect(s.players.b.chips + h0(s.players.b).bet).toBe(chips(500))
      }
    }
  })
})

describe('turn flow and settlement', () => {
  it('pays a standard win and keeps both players in the match', () => {
    let s = state({
      players: {
        a: player('a', { cards: [card('10'), card('Q')], status: 'playing', chips: chips(400) }),
        b: player('b', { cards: [card('9'), card('7')], status: 'waiting', chips: chips(400) })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    s = unwrap(stand(s, 'a'))
    expect(s.currentPlayerId).toBe('b')
    s = unwrap(stand(s, 'b'))

    // Dealer stands on 18: a (20) wins, b (16) loses.
    expect(s.status).toBe('hand_over')
    expect(h0(s.players.a).lastResult).toBe('win')
    expect(s.players.a.chips).toBe(chips(600)) // 400 + 200 back on a 100 bet
    expect(h0(s.players.b).lastResult).toBe('lose')
    expect(s.players.b.chips).toBe(chips(400))
    expect(s.dealerRevealed).toBe(true)
  })

  it('pays a natural Blackjack 3:2 and auto-completes that player', () => {
    let s = state({
      players: {
        a: player('a', {
          cards: [card('A'), card('K')],
          status: 'done',
          handStatus: 'blackjack',
          chips: chips(400)
        }),
        b: player('b', { cards: [card('9'), card('7')], status: 'playing', chips: chips(400) })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'b',
      dealerCards: [card('10', 'hearts'), card('7', 'clubs')] // 17, no natural
    })
    s = unwrap(stand(s, 'b'))
    expect(s.status).toBe('hand_over')
    expect(h0(s.players.a).lastResult).toBe('blackjack')
    expect(s.players.a.chips).toBe(chips(650)) // 400 + 250 on a 100 bet
  })

  it('busts a player who hits over 21 and ends their turn', () => {
    let s = state({
      players: {
        a: player('a', { cards: [card('K'), card('Q')], status: 'playing', chips: chips(400) }),
        b: player('b', { cards: [card('9'), card('7')], status: 'waiting', chips: chips(400) })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a',
      deck: [card('5', 'diamonds')] // a draws a 5 -> 25 bust
    })
    s = unwrap(hit(s, 'a'))
    expect(h0(s.players.a).status).toBe('busted')
    expect(s.currentPlayerId).toBe('b')
    s = unwrap(stand(s, 'b'))
    expect(h0(s.players.a).lastResult).toBe('bust')
    expect(s.players.a.chips).toBe(chips(400)) // bet lost, nothing returned
  })
})

describe('double down', () => {
  it('doubles the bet, draws one card and stands', () => {
    let s = state({
      players: {
        a: player('a', { cards: [card('5'), card('6')], status: 'playing', chips: chips(400) }),
        b: player('b', { cards: [card('9'), card('7')], status: 'waiting', chips: chips(400) })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a',
      deck: [card('9', 'diamonds')] // a draws a 9 -> 20, stands
    })
    s = unwrap(doubleDown(s, 'a'))
    expect(h0(s.players.a).bet).toBe(chips(200))
    expect(s.players.a.chips).toBe(chips(300)) // matched the 100 bet
    expect(h0(s.players.a).cards).toHaveLength(3)
    expect(h0(s.players.a).status).toBe('standing')
    expect(h0(s.players.a).doubled).toBe(true)
    expect(s.currentPlayerId).toBe('b') // turn passed on
  })

  it('rejects a double after taking a hit (three cards)', () => {
    const s = state({
      players: {
        a: player('a', { cards: [card('5'), card('6'), card('2')], status: 'playing' }),
        b: player('b', { status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    const res = doubleDown(s, 'a')
    expect(res.ok).toBe(false)
  })

  it('rejects a double without enough chips to match the bet', () => {
    const s = state({
      players: {
        a: player('a', {
          cards: [card('5'), card('6')],
          status: 'playing',
          chips: chips(50),
          bet: chips(100)
        }),
        b: player('b', { status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    expect(doubleDown(s, 'a').ok).toBe(false)
  })
})

describe('split', () => {
  it('splits a pair of 8s into two hands, deals one card each, deducts a bet', () => {
    const s = state({
      players: {
        a: player('a', {
          cards: [card('8', 'spades'), card('8', 'hearts')],
          status: 'playing',
          chips: chips(400),
          bet: chips(100)
        }),
        b: player('b', { cards: [card('9'), card('7')], status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a',
      // Original hand draws the 3 (last), the new hand draws the K.
      deck: [card('K', 'clubs'), card('3', 'diamonds')]
    })
    const next = unwrap(split(s, 'a'))
    const p = next.players.a
    expect(p.hands).toHaveLength(2)
    expect(p.hands[0].cards).toEqual([card('8', 'spades'), card('3', 'diamonds')])
    expect(p.hands[1].cards).toEqual([card('8', 'hearts'), card('K', 'clubs')])
    expect(p.hands[0].bet).toBe(chips(100))
    expect(p.hands[1].bet).toBe(chips(100))
    expect(p.hands[0].fromSplit).toBe(true)
    expect(p.hands[1].fromSplit).toBe(true)
    expect(p.chips).toBe(chips(300)) // an extra 100 committed
    expect(next.currentPlayerId).toBe('a') // still a's turn, first hand active
    expect(p.activeHandIndex).toBe(0)
  })

  it('splits ten-value cards of different ranks (K + Q)', () => {
    const s = state({
      players: {
        a: player('a', {
          cards: [card('K', 'spades'), card('Q', 'hearts')],
          status: 'playing',
          chips: chips(400)
        }),
        b: player('b', { status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a',
      deck: [card('2', 'clubs'), card('5', 'diamonds')]
    })
    const next = unwrap(split(s, 'a'))
    expect(next.players.a.hands).toHaveLength(2)
  })

  it('rejects splitting a non-pair (8 + 9)', () => {
    const s = state({
      players: {
        a: player('a', { cards: [card('8'), card('9')], status: 'playing' }),
        b: player('b', { status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    expect(split(s, 'a').ok).toBe(false)
  })

  it('rejects splitting an Ace and a King (unequal Blackjack value)', () => {
    const s = state({
      players: {
        a: player('a', { cards: [card('A'), card('K')], status: 'playing' }),
        b: player('b', { status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    expect(split(s, 'a').ok).toBe(false)
  })

  it('rejects a split when the player cannot match the bet', () => {
    const s = state({
      players: {
        a: player('a', {
          cards: [card('8'), card('8')],
          status: 'playing',
          chips: chips(75),
          bet: chips(100)
        }),
        b: player('b', { status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    expect(split(s, 'a').ok).toBe(false)
  })

  it('rejects a split that would exceed the four-hand maximum', () => {
    const fourHands: BlackjackHand[] = [
      makeHand([card('8', 'spades'), card('8', 'hearts')], chips(100), { fromSplit: true }),
      makeHand([card('5')], chips(100), { fromSplit: true, status: 'standing' }),
      makeHand([card('6')], chips(100), { fromSplit: true, status: 'standing' }),
      makeHand([card('7')], chips(100), { fromSplit: true, status: 'standing' })
    ]
    const s = state({
      players: {
        a: player('a', { hands: fourHands, status: 'playing', chips: chips(400), activeHandIndex: 0 }),
        b: player('b', { status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    expect(split(s, 'a').ok).toBe(false)
  })

  it('plays the first split hand fully before the second, then the next player', () => {
    let s = state({
      players: {
        a: player('a', {
          cards: [card('8', 'spades'), card('8', 'hearts')],
          status: 'playing',
          chips: chips(400)
        }),
        b: player('b', { cards: [card('9'), card('7')], status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a',
      // original -> 3 (11), new hand -> 9 (17); both remain playable.
      deck: [card('9', 'clubs'), card('3', 'diamonds')]
    })
    s = unwrap(split(s, 'a'))
    expect(s.currentPlayerId).toBe('a')
    expect(s.players.a.activeHandIndex).toBe(0)

    // Stand the first hand: control stays with a, now on the second hand.
    s = unwrap(stand(s, 'a'))
    expect(s.currentPlayerId).toBe('a')
    expect(s.players.a.activeHandIndex).toBe(1)

    // Stand the second hand: only now does control move to b.
    s = unwrap(stand(s, 'a'))
    expect(s.currentPlayerId).toBe('b')
  })

  it('settles each split hand independently against the dealer', () => {
    // a already split: hand1 = 20 (win), hand2 = 18 (lose) vs dealer 19.
    const s = state({
      players: {
        a: player('a', {
          hands: [
            makeHand([card('10'), card('10', 'hearts')], chips(100), {
              status: 'standing',
              fromSplit: true
            }),
            makeHand([card('10', 'clubs'), card('8')], chips(100), {
              status: 'standing',
              fromSplit: true
            })
          ],
          status: 'done',
          chips: chips(300)
        }),
        b: player('b', { cards: [card('9'), card('7')], status: 'playing', chips: chips(400) })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'b',
      dealerCards: [card('10', 'hearts'), card('9', 'clubs')] // 19
    })
    const next = unwrap(stand(s, 'b'))
    expect(next.players.a.hands[0].lastResult).toBe('win')
    expect(next.players.a.hands[1].lastResult).toBe('lose')
    // 300 + 200 (hand1 win) + 0 (hand2 lose) = 500.
    expect(next.players.a.chips).toBe(chips(500))
  })

  it('treats a 21 made from a split as a normal 21, not a natural Blackjack', () => {
    // a split Aces earlier: hand1 = A + K = 21 (fromSplit), hand2 = A + 7 = 18.
    const s = state({
      players: {
        a: player('a', {
          hands: [
            makeHand([card('A'), card('K')], chips(100), {
              status: 'standing',
              fromSplit: true,
              splitAce: true
            }),
            makeHand([card('A', 'hearts'), card('7')], chips(100), {
              status: 'standing',
              fromSplit: true,
              splitAce: true
            })
          ],
          status: 'done',
          chips: chips(300)
        }),
        b: player('b', { cards: [card('9'), card('7')], status: 'playing', chips: chips(400) })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'b',
      dealerCards: [card('10', 'hearts'), card('8', 'clubs')] // 18
    })
    const next = unwrap(stand(s, 'b'))
    // The split 21 is a normal win (1:1), NOT a 3:2 blackjack.
    expect(next.players.a.hands[0].lastResult).toBe('win')
    // 300 + 200 (hand1 win 1:1) + 100 (hand2 push at 18) = 600.
    expect(next.players.a.chips).toBe(chips(600))
  })

  it('splits Aces: one card each, both auto-stand, and control moves on', () => {
    const s = state({
      players: {
        a: player('a', {
          cards: [card('A', 'spades'), card('A', 'hearts')],
          status: 'playing',
          chips: chips(400)
        }),
        b: player('b', { cards: [card('9'), card('7')], status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a',
      // original Ace -> K (21), new Ace -> 7 (18).
      deck: [card('7', 'clubs'), card('K', 'diamonds')]
    })
    const next = unwrap(split(s, 'a'))
    const p = next.players.a
    expect(p.hands).toHaveLength(2)
    expect(p.hands[0].cards).toHaveLength(2)
    expect(p.hands[1].cards).toHaveLength(2)
    expect(p.hands[0].status).toBe('standing')
    expect(p.hands[1].status).toBe('standing')
    expect(p.hands[0].splitAce).toBe(true)
    expect(p.status).toBe('done')
    // Both hands finished immediately — control passes to b.
    expect(next.currentPlayerId).toBe('b')

    // No further hits are possible on a split-Ace hand (it is not a's turn, and
    // the hands are standing anyway).
    expect(hit(next, 'a').ok).toBe(false)
  })

  it('allows Double Down on an eligible split hand', () => {
    let s = state({
      players: {
        a: player('a', {
          cards: [card('8', 'spades'), card('8', 'hearts')],
          status: 'playing',
          chips: chips(400)
        }),
        b: player('b', { cards: [card('9'), card('7')], status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a',
      // Pops in order: original hand -> 3, new hand -> K, double draw -> 7.
      deck: [card('7', 'clubs'), card('K', 'diamonds'), card('3', 'diamonds')]
    })
    s = unwrap(split(s, 'a'))
    expect(s.players.a.hands[0].cards).toEqual([card('8', 'spades'), card('3', 'diamonds')])

    s = unwrap(doubleDown(s, 'a'))
    const first = s.players.a.hands[0]
    expect(first.bet).toBe(chips(200))
    expect(first.doubled).toBe(true)
    expect(first.cards).toHaveLength(3) // 8 + 3 + 7 = 18
    expect(first.status).toBe('standing')
    expect(s.players.a.chips).toBe(chips(200)) // 400 - 100 split - 100 double
    // Control stays with a on the second hand.
    expect(s.currentPlayerId).toBe('a')
    expect(s.players.a.activeHandIndex).toBe(1)
  })
})

describe('elimination and match winner', () => {
  it('eliminates a player who loses their last chips and ends the match', () => {
    let s = state({
      players: {
        // b is all-in: no chips available, everything on the table.
        a: player('a', { cards: [card('10'), card('Q')], status: 'playing', chips: chips(400) }),
        b: player('b', {
          cards: [card('9'), card('7')],
          status: 'waiting',
          chips: 0,
          bet: chips(65)
        })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    s = unwrap(stand(s, 'a'))
    s = unwrap(stand(s, 'b'))
    // b (16) loses to dealer 18, has 0 chips -> eliminated -> a wins the match.
    // The match pauses on the review phase (last hand still shown) before ending.
    expect(s.players.b.status).toBe('eliminated')
    expect(s.status).toBe('match_over')
    expect(s.winnerId).toBe('a')

    // Dismissing the review finishes the match.
    s = unwrap(finishMatch(s, 'a'))
    expect(s.status).toBe('finished')
    expect(s.winnerId).toBe('a')
  })

  it('ends the match when a player reaches the 1000-chip target', () => {
    let s = state({
      players: {
        // a is on 900 available + 100 bet; a win pushes them to 1000.
        a: player('a', { cards: [card('10'), card('Q')], status: 'playing', chips: chips(900) }),
        b: player('b', { cards: [card('9'), card('7')], status: 'waiting', chips: chips(400) })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    s = unwrap(stand(s, 'a'))
    s = unwrap(stand(s, 'b'))
    // a (20) beats dealer 18 -> 900 + 200 = 1100 chips (>= 1000) -> a wins.
    expect(s.players.a.chips).toBe(chips(1100))
    expect(s.status).toBe('match_over')
    expect(s.winnerId).toBe('a')
  })

  it('awards a target win to the richest player when several cross at once', () => {
    let s = state({
      players: {
        a: player('a', { cards: [card('10'), card('9')], status: 'playing', chips: chips(950) }),
        b: player('b', {
          cards: [card('A'), card('K')],
          status: 'done',
          handStatus: 'blackjack',
          chips: chips(950)
        })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a',
      dealerCards: [card('10', 'hearts'), card('8', 'clubs')] // 18, no natural
    })
    s = unwrap(stand(s, 'a'))
    // a: 19 beats 18 -> +200 -> 1150. b: blackjack -> +250 -> 1200. b is richer.
    expect(s.status).toBe('match_over')
    expect(s.players.a.chips).toBe(chips(1150))
    expect(s.players.b.chips).toBe(chips(1200))
    expect(s.winnerId).toBe('b')
  })

  it('keeps an all-in winner in the match', () => {
    let s = state({
      players: {
        a: player('a', { cards: [card('9'), card('7')], status: 'playing', chips: chips(400) }),
        b: player('b', {
          cards: [card('10'), card('Q')],
          status: 'waiting',
          chips: 0,
          bet: chips(65)
        })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    s = unwrap(stand(s, 'a'))
    s = unwrap(stand(s, 'b'))
    // b (20) beats dealer 18 -> wins 1:1, back to 130 chips, still in.
    expect(s.players.b.status).not.toBe('eliminated')
    expect(s.players.b.chips).toBe(chips(130))
    expect(s.status).toBe('hand_over')
  })
})

describe('next hand', () => {
  it('deals a fresh hand and skips eliminated players', () => {
    let s = state({
      players: {
        a: player('a', { cards: [card('10'), card('Q')], status: 'playing', chips: chips(400) }),
        b: player('b', { cards: [card('9'), card('7')], status: 'waiting', chips: chips(400) }),
        c: player('c', { status: 'eliminated', chips: 0, cards: [card('K'), card('K')] })
      },
      playerOrder: ['a', 'b', 'c'],
      currentPlayerId: 'a',
      // A controlled deck of 5s (>= RESHUFFLE_THRESHOLD so the next hand doesn't
      // reshuffle) guarantees a deterministic, natural-free deal.
      deck: Array.from({ length: 20 }, () => card('5', 'hearts'))
    })
    s = unwrap(stand(s, 'a'))
    s = unwrap(stand(s, 'b'))
    expect(s.status).toBe('hand_over')

    s = unwrap(nextHand(s, 'a'))
    expect(s.handNumber).toBe(2)
    // The new hand must re-enter the playing phase with a live current player,
    // otherwise the whole table is stuck unable to act.
    expect(s.status).toBe('player_turns')
    expect(s.currentPlayerId).toBeDefined()
    expect(s.players[s.currentPlayerId!].status).toBe('playing')
    expect(h0(s.players.a).cards.length).toBeGreaterThanOrEqual(2)
    expect(s.players.c.hands).toHaveLength(0) // eliminated: no cards dealt
    expect(s.players.c.status).toBe('eliminated')
  })

  it('rejects starting the next hand while a hand is in progress', () => {
    const s = state({
      players: { a: player('a', { status: 'playing' }), b: player('b') },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    expect(nextHand(s, 'a').ok).toBe(false)
  })
})

describe('match-over review phase', () => {
  /** Reach a match-ending settlement: a busts b out (b all-in), leaving a. */
  function reachMatchOver(): BlackjackGameState {
    let s = state({
      players: {
        a: player('a', { cards: [card('10'), card('Q')], status: 'playing', chips: chips(400) }),
        b: player('b', {
          cards: [card('9'), card('7')],
          status: 'waiting',
          chips: 0,
          bet: chips(65)
        })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    s = unwrap(stand(s, 'a'))
    s = unwrap(stand(s, 'b'))
    return s
  }

  it('pauses on match_over with the last hand still fully settled and revealed', () => {
    const s = reachMatchOver()
    expect(s.status).toBe('match_over')
    expect(s.winnerId).toBe('a')
    // The final hand is settled and shown: dealer revealed, per-hand results set.
    expect(s.dealerRevealed).toBe(true)
    expect(h0(s.players.a).lastResult).toBe('win')
    expect(h0(s.players.b).lastResult).toBe('lose')
    // Not yet finished — the client stays on the table until dismissed.
    expect(s.currentPlayerId).toBeUndefined()
  })

  it('lets an eliminated player dismiss the review too', () => {
    let s = reachMatchOver()
    expect(s.players.b.status).toBe('eliminated')
    s = unwrap(finishMatch(s, 'b'))
    expect(s.status).toBe('finished')
    expect(s.winnerId).toBe('a')
  })

  it('rejects finishing outside the match-over phase', () => {
    const s = state({
      players: { a: player('a', { status: 'playing' }), b: player('b') },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    expect(finishMatch(s, 'a').ok).toBe(false)
  })

  it('rejects finishing from someone not in the match', () => {
    const s = reachMatchOver()
    const res = finishMatch(s, 'zzz')
    expect(res.ok).toBe(false)
  })
})

describe('removePlayerFromGame (disconnect)', () => {
  it('ends the match when only one player remains', () => {
    const s = state({
      players: { a: player('a', { status: 'playing' }), b: player('b') },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    const next = removePlayerFromGame(s, 'b')
    expect(next).not.toBeNull()
    expect(next!.status).toBe('finished')
    expect(next!.winnerId).toBe('a')
  })

  it('advances the turn when the acting player disconnects', () => {
    const s = state({
      players: {
        a: player('a', { status: 'playing' }),
        b: player('b', { status: 'waiting' }),
        c: player('c', { status: 'waiting' })
      },
      playerOrder: ['a', 'b', 'c'],
      currentPlayerId: 'a'
    })
    const next = removePlayerFromGame(s, 'a')!
    expect(next.playerOrder).toEqual(['b', 'c'])
    expect(next.currentPlayerId).toBe('b')
  })

  it('returns null when the last player leaves', () => {
    const s = state({
      players: { a: player('a', { status: 'playing' }) },
      playerOrder: ['a'],
      currentPlayerId: 'a'
    })
    expect(removePlayerFromGame(s, 'a')).toBeNull()
  })
})

describe('action guards', () => {
  it('rejects acting out of turn', () => {
    const s = state({
      players: { a: player('a', { status: 'playing' }), b: player('b', { status: 'waiting' }) },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    const res = hit(s, 'b')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NOT_YOUR_TURN')
  })
})
