import { describe, expect, it } from 'vitest'
import type { Card, Rank } from './cards'
import { CHIP_UNIT } from './rules'
import {
  createGame,
  doubleDown,
  hit,
  nextHand,
  removePlayerFromGame,
  stand,
  type BlackjackGameState,
  type BlackjackServerPlayer
} from './engine'

const chips = (n: number) => n * CHIP_UNIT

function card(rank: Rank, suit: Card['suit'] = 'spades'): Card {
  return { rank, suit }
}

function player(
  id: string,
  over: Partial<BlackjackServerPlayer> = {}
): BlackjackServerPlayer {
  return {
    playerId: id,
    chips: chips(400),
    bet: chips(100),
    cards: [],
    status: 'waiting',
    hasActed: false,
    doubled: false,
    ...over
  }
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
      expect(s.players.a.cards).toHaveLength(2)
      expect(s.players.b.cards).toHaveLength(2)
      expect(s.dealerCards.length).toBeGreaterThanOrEqual(2)
      expect(['player_turns', 'hand_over', 'finished']).toContain(s.status)
      if (s.status === 'player_turns') {
        // Mid-hand (before any payout) the committed bet plus remaining chips
        // equals the starting stack.
        expect(s.players.a.chips + s.players.a.bet).toBe(chips(500))
        expect(s.players.b.chips + s.players.b.bet).toBe(chips(500))
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
    expect(s.players.a.lastResult).toBe('win')
    expect(s.players.a.chips).toBe(chips(600)) // 400 + 200 back on a 100 bet
    expect(s.players.b.lastResult).toBe('lose')
    expect(s.players.b.chips).toBe(chips(400))
    expect(s.dealerRevealed).toBe(true)
  })

  it('pays a natural Blackjack 3:2 and auto-completes that player', () => {
    let s = state({
      players: {
        a: player('a', { cards: [card('A'), card('K')], status: 'blackjack', chips: chips(400) }),
        b: player('b', { cards: [card('9'), card('7')], status: 'playing', chips: chips(400) })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'b',
      dealerCards: [card('10', 'hearts'), card('7', 'clubs')] // 17, no natural
    })
    s = unwrap(stand(s, 'b'))
    expect(s.status).toBe('hand_over')
    expect(s.players.a.lastResult).toBe('blackjack')
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
    expect(s.players.a.status).toBe('busted')
    expect(s.currentPlayerId).toBe('b')
    s = unwrap(stand(s, 'b'))
    expect(s.players.a.lastResult).toBe('bust')
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
    expect(s.players.a.bet).toBe(chips(200))
    expect(s.players.a.chips).toBe(chips(300)) // matched the 100 bet
    expect(s.players.a.cards).toHaveLength(3)
    expect(s.players.a.status).toBe('standing')
    expect(s.currentPlayerId).toBe('b') // turn passed on
  })

  it('rejects a double after the first action', () => {
    const s = state({
      players: {
        a: player('a', { cards: [card('5'), card('6')], status: 'playing', hasActed: true }),
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
        a: player('a', { cards: [card('5'), card('6')], status: 'playing', chips: chips(50), bet: chips(100) }),
        b: player('b', { status: 'waiting' })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    expect(doubleDown(s, 'a').ok).toBe(false)
  })
})

describe('elimination and match winner', () => {
  it('eliminates a player who loses their last chips and ends the match', () => {
    let s = state({
      players: {
        // b is all-in: no chips available, everything on the table.
        a: player('a', { cards: [card('10'), card('Q')], status: 'playing', chips: chips(400) }),
        b: player('b', { cards: [card('9'), card('7')], status: 'waiting', chips: 0, bet: chips(65) })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a'
    })
    s = unwrap(stand(s, 'a'))
    s = unwrap(stand(s, 'b'))
    // b (16) loses to dealer 18, has 0 chips -> eliminated -> a wins the match.
    expect(s.players.b.status).toBe('eliminated')
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
    expect(s.status).toBe('finished')
    expect(s.winnerId).toBe('a')
  })

  it('awards a target win to the richest player when several cross at once', () => {
    let s = state({
      players: {
        a: player('a', { cards: [card('10'), card('9')], status: 'playing', chips: chips(950) }),
        b: player('b', { cards: [card('A'), card('K')], status: 'blackjack', chips: chips(950) })
      },
      playerOrder: ['a', 'b'],
      currentPlayerId: 'a',
      dealerCards: [card('10', 'hearts'), card('8', 'clubs')] // 18, no natural
    })
    s = unwrap(stand(s, 'a'))
    // a: 19 beats 18 -> +200 -> 1150. b: blackjack -> +250 -> 1200. b is richer.
    expect(s.status).toBe('finished')
    expect(s.players.a.chips).toBe(chips(1150))
    expect(s.players.b.chips).toBe(chips(1200))
    expect(s.winnerId).toBe('b')
  })

  it('keeps an all-in winner in the match', () => {
    let s = state({
      players: {
        a: player('a', { cards: [card('9'), card('7')], status: 'playing', chips: chips(400) }),
        b: player('b', { cards: [card('10'), card('Q')], status: 'waiting', chips: 0, bet: chips(65) })
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
      currentPlayerId: 'a'
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
    expect(s.players.a.cards.length).toBeGreaterThanOrEqual(2)
    expect(s.players.c.cards).toHaveLength(0) // eliminated: no cards dealt
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
