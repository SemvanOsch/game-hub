import { describe, it, expect } from 'vitest'
import type { Card, Rank, Suit } from '../blackjack/cards'
import {
  allIn,
  bet,
  call,
  check,
  checkPokerGameWinCondition,
  createGame,
  finishMatch,
  fold,
  nextHand,
  potTotal,
  raise,
  removePlayerFromGame,
  resolveHand,
  BIG_BLIND,
  SMALL_BLIND,
  STARTING_CHIPS,
  TARGET_CHIPS,
  type ActionResult,
  type PokerGameState,
  type PokerPlayer
} from './engine'
import { getLegalActions } from './view'

const SUITS: Record<string, Suit> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
function c(notation: string): Card {
  const rankPart = notation.slice(0, notation.length - 1)
  const suitPart = notation[notation.length - 1]
  const rank = (rankPart === 'T' ? '10' : rankPart) as Rank
  return { rank, suit: SUITS[suitPart] }
}

function unwrap(result: ActionResult): PokerGameState {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`)
  return result.state
}

/** Total chips held by everyone plus everything in the pot — invariant across a hand. */
function chipsInPlay(state: PokerGameState): number {
  return state.playerOrder.reduce((sum, id) => sum + state.players[id].chips, 0) + potTotal(state)
}

/** Everyone checks when they can, otherwise calls — drives a hand to showdown. */
function playPassively(state: PokerGameState): PokerGameState {
  let s = state
  let guard = 0
  while (s.status === 'playing' && guard++ < 500) {
    const pid = s.currentPlayerId as string
    const la = getLegalActions(s, pid)
    s = unwrap(la.canCheck ? check(s, pid) : call(s, pid))
  }
  return s
}

describe('createGame — setup', () => {
  it('deals two hole cards to each player and posts blinds (3 players)', () => {
    const s = createGame(['a', 'b', 'c'])
    expect(s.players.a.holeCards).toHaveLength(2)
    expect(s.players.b.holeCards).toHaveLength(2)
    expect(s.players.c.holeCards).toHaveLength(2)
    expect(s.deck).toHaveLength(52 - 6)
    // Dealer=a, SB=b, BB=c. Blinds committed.
    expect(s.players.b.bet).toBe(SMALL_BLIND)
    expect(s.players.c.bet).toBe(BIG_BLIND)
    expect(s.currentBet).toBe(BIG_BLIND)
    // First to act pre-flop is the seat after the BB — the dealer (a) with 3 players.
    expect(s.currentPlayerId).toBe('a')
    expect(chipsInPlay(s)).toBe(3 * STARTING_CHIPS)
  })

  it('assigns the small blind to the dealer heads-up', () => {
    const s = createGame(['a', 'b'])
    expect(s.players.a.bet).toBe(SMALL_BLIND) // dealer posts SB heads-up
    expect(s.players.b.bet).toBe(BIG_BLIND)
    expect(s.currentPlayerId).toBe('a') // dealer/SB acts first pre-flop heads-up
    expect(chipsInPlay(s)).toBe(2 * STARTING_CHIPS)
  })

  it('exposes the configured target and starting chips in the state', () => {
    const s = createGame(['a', 'b', 'c'])
    expect(s.startingChips).toBe(STARTING_CHIPS)
    expect(s.targetChips).toBe(TARGET_CHIPS)
  })
})

describe('betting legality', () => {
  it('rejects an action from a player when it is not their turn', () => {
    const s = createGame(['a', 'b', 'c']) // current = a
    const res = fold(s, 'b')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NOT_YOUR_TURN')
  })

  it('cannot check when facing a bet', () => {
    const s = createGame(['a', 'b', 'c']) // a faces the big blind
    const res = check(s, 'a')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_ACTION')
  })

  it('rejects a raise below the minimum', () => {
    const s = createGame(['a', 'b', 'c']) // currentBet 20, minRaise 20 -> min raise-to 40
    const res = raise(s, 'a', 30)
    expect(res.ok).toBe(false)
  })

  it('accepts a legal minimum raise', () => {
    const s = createGame(['a', 'b', 'c'])
    const next = unwrap(raise(s, 'a', 40))
    expect(next.currentBet).toBe(40)
    expect(next.players.a.bet).toBe(40)
    expect(chipsInPlay(next)).toBe(3 * STARTING_CHIPS)
  })

  it('cannot bet when a bet already stands (must raise)', () => {
    const s = createGame(['a', 'b', 'c'])
    const res = bet(s, 'a', 60)
    expect(res.ok).toBe(false)
  })

  it('prevents a folded player from acting again', () => {
    let s = createGame(['a', 'b', 'c'])
    s = unwrap(fold(s, 'a')) // a folds, action moves on
    const res = fold(s, 'a')
    expect(res.ok).toBe(false)
  })

  it('rejects all actions once the game is over', () => {
    const over: PokerGameState = { ...createGame(['a', 'b']), status: 'game_over' }
    expect(fold(over, over.currentPlayerId as string).ok).toBe(false)
    const res = call(over, 'a')
    if (!res.ok) expect(res.code).toBe('GAME_OVER')
  })
})

describe('hand flow', () => {
  it('conserves chips playing a whole hand to conclusion', () => {
    const s = createGame(['a', 'b', 'c'])
    const end = playPassively(s)
    expect(['hand_over', 'game_over']).toContain(end.status)
    // Pot fully distributed back into stacks.
    expect(end.playerOrder.reduce((sum, id) => sum + end.players[id].chips, 0)).toBe(
      3 * STARTING_CHIPS
    )
  })

  it('ends the hand immediately when everyone folds to one player', () => {
    let s = createGame(['a', 'b', 'c']) // current a
    s = unwrap(fold(s, 'a'))
    s = unwrap(fold(s, 'b')) // only c remains -> c wins uncontested
    expect(s.status).toBe('hand_over')
    expect(s.lastHand?.showdown).toBe(false)
    // c collects the blinds; total is preserved.
    expect(s.players.c.chips).toBe(STARTING_CHIPS + SMALL_BLIND)
  })

  it('starts the next hand and rotates the dealer button', () => {
    let s = createGame(['a', 'b', 'c'])
    const firstDealer = s.dealerIndex
    s = playPassively(s)
    if (s.status === 'hand_over') {
      s = unwrap(nextHand(s, 'a'))
      expect(s.handNumber).toBe(2)
      expect(s.dealerIndex).not.toBe(firstDealer)
    }
  })
})

// ---------------------------------------------------------------------------
// Showdown / settlement with fully controlled cards.
// ---------------------------------------------------------------------------

function player(id: string, over: Partial<PokerPlayer>): PokerPlayer {
  return {
    id,
    chips: 0,
    bet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    eliminated: false,
    left: false,
    holeCards: [],
    hasActed: false,
    ...over
  }
}

function settledState(
  players: PokerPlayer[],
  community: Card[],
  dealerIndex = 0
): PokerGameState {
  const map: Record<string, PokerPlayer> = {}
  for (const p of players) map[p.id] = p
  return {
    status: 'playing',
    phase: 'river',
    playerOrder: players.map((p) => p.id),
    players: map,
    deck: [],
    communityCards: community,
    currentBet: 0,
    minRaise: BIG_BLIND,
    dealerIndex,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    startingChips: STARTING_CHIPS,
    targetChips: TARGET_CHIPS,
    handNumber: 1,
    actionLog: [],
    logSeq: 0
  }
}

describe('showdown & side pots', () => {
  const board = [c('2h'), c('5d'), c('8c'), c('Js'), c('Qd')]

  it('awards the whole pot to the best hand and eliminates the buster', () => {
    const s = settledState(
      [
        player('a', { chips: 0, totalBet: 100, holeCards: [c('Ah'), c('Ad')] }), // pair aces
        player('b', { chips: 0, totalBet: 100, holeCards: [c('3s'), c('4s')] }) // high card
      ],
      board
    )
    const out = resolveHand(s, true)
    expect(out.players.a.chips).toBe(200)
    expect(out.players.b.chips).toBe(0)
    expect(out.players.b.eliminated).toBe(true)
    // Only 'a' has chips -> last player standing. The match pauses on match_over
    // (final hand still shown) until a player dismisses it.
    expect(out.status).toBe('match_over')
    expect(out.winnerId).toBe('a')
    expect(out.winReason).toBe('last_player_standing')
    // The game only becomes finished after the review is dismissed.
    const finished = finishMatch(out, 'a')
    expect(finished.ok).toBe(true)
    if (finished.ok) expect(finished.state.status).toBe('game_over')
  })

  it('gives a short all-in only the main pot; the side pot goes to the next best', () => {
    const s = settledState(
      [
        player('a', { chips: 0, totalBet: 100, holeCards: [c('Ah'), c('Ac')] }), // AA
        player('b', { chips: 0, totalBet: 300, holeCards: [c('Kh'), c('Kd')] }), // KK
        player('c', { chips: 0, totalBet: 300, holeCards: [c('3s'), c('4s')] }) // high card
      ],
      board
    )
    const out = resolveHand(s, true)
    // Main pot 300 -> a (best), side pot 400 -> b (best of b/c).
    expect(out.players.a.chips).toBe(300)
    expect(out.players.b.chips).toBe(400)
    expect(out.players.c.chips).toBe(0)
    expect(out.players.c.eliminated).toBe(true)
    expect(out.status).toBe('hand_over') // a and b both still have chips
  })

  it('splits a tied pot and gives the odd chip to the first seat left of the dealer', () => {
    const s = settledState(
      [
        player('a', { chips: 0, totalBet: 67, holeCards: [c('Ah'), c('Kd')] }),
        player('b', { chips: 0, totalBet: 67, holeCards: [c('Ac'), c('Ks')] }), // identical strength
        player('c', { chips: 0, totalBet: 67, folded: true, holeCards: [c('2c'), c('3c')] })
      ],
      board,
      0 // dealer = a, so first seat left is b
    )
    const out = resolveHand(s, true)
    expect(out.players.a.chips).toBe(100)
    expect(out.players.b.chips).toBe(101) // odd chip to b
    expect(out.players.a.chips + out.players.b.chips).toBe(201)
  })
})

describe('win conditions', () => {
  it('does NOT end the game for a big stack while others still have chips', () => {
    // a wins a large pot but b and c are still in — the game must continue.
    const s = settledState(
      [
        player('a', { chips: 1900, totalBet: 200, holeCards: [c('Ah'), c('Ad')] }),
        player('b', { chips: 300, totalBet: 200, holeCards: [c('3s'), c('4s')] }),
        player('c', { chips: 500, totalBet: 200, holeCards: [c('5h'), c('7c')] })
      ],
      [c('Ac'), c('9d'), c('Ks'), c('2h'), c('Qd')] // a hits trip aces
    )
    const out = resolveHand(s, true)
    expect(out.players.a.chips).toBe(1900 + 600)
    expect(out.status).toBe('hand_over')
    expect(out.winnerId).toBeUndefined()
  })

  it('ends the match (last player standing) when only one player has chips', () => {
    const s = settledState(
      [
        player('a', { chips: 1900, totalBet: 200, holeCards: [c('Ah'), c('Ad')] }),
        player('b', { chips: 0, totalBet: 200, holeCards: [c('3s'), c('4s')] }),
        player('c', { chips: 0, totalBet: 200, holeCards: [c('5h'), c('7c')] })
      ],
      [c('Ac'), c('9d'), c('Ks'), c('2h'), c('Qd')]
    )
    const out = resolveHand(s, true)
    expect(out.winnerId).toBe('a')
    expect(out.winReason).toBe('last_player_standing')
    expect(out.status).toBe('match_over')
    expect(out.players.b.eliminated).toBe(true)
    expect(out.players.c.eliminated).toBe(true)
  })

  it('checkPokerGameWinCondition: last player standing pauses on match_over', () => {
    const s = settledState(
      [player('a', { chips: 500 }), player('b', { chips: 0, eliminated: true })],
      []
    )
    const out = checkPokerGameWinCondition(s)
    expect(out.status).toBe('match_over')
    expect(out.winnerId).toBe('a')
    expect(out.winReason).toBe('last_player_standing')
  })

  it('checkPokerGameWinCondition: continues while two players still have chips', () => {
    const s = settledState([player('a', { chips: 500 }), player('b', { chips: 500 })], [])
    const out = checkPokerGameWinCondition(s)
    expect(out.status).toBe('hand_over')
    expect(out.winnerId).toBeUndefined()
  })

  it('finishMatch only advances from match_over to game_over', () => {
    const review = settledState([player('a', { chips: 500 })], [])
    review.status = 'match_over'
    review.winnerId = 'a'
    const done = finishMatch(review, 'a')
    expect(done.ok).toBe(true)
    if (done.ok) expect(done.state.status).toBe('game_over')

    // Cannot finish a match that is still in progress.
    const playing = createGame(['a', 'b'])
    expect(finishMatch(playing, 'a').ok).toBe(false)
  })
})

describe('disconnect / leaving', () => {
  it('awards the hand to the last player when the other leaves mid-hand', () => {
    const s = createGame(['a', 'b']) // heads up, a to act
    const out = removePlayerFromGame(s, 'b')
    expect(out).not.toBeNull()
    // Pauses on match_over for review; a finish action completes it.
    expect(out?.status).toBe('match_over')
    expect(out?.winnerId).toBe('a')
  })

  it('returns null when the sole remaining player leaves', () => {
    const single = settledState([player('a', { chips: 500 })], [])
    single.currentPlayerId = 'a'
    expect(removePlayerFromGame(single, 'a')).toBeNull()
  })
})

describe('all-in mechanics', () => {
  it('marks a player all-in and keeps chips conserved', () => {
    const s = createGame(['a', 'b', 'c'])
    const out = unwrap(allIn(s, 'a'))
    expect(out.players.a.allIn).toBe(true)
    expect(out.players.a.chips).toBe(0)
    expect(chipsInPlay(out)).toBe(3 * STARTING_CHIPS)
  })
})
