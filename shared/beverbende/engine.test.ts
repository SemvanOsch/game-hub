import { describe, it, expect } from 'vitest'
import type { BeverbendeCard } from './cards'
import {
  createGame,
  markReady,
  takeDiscard,
  drawFromPile,
  knock,
  replaceWithDrawn,
  discardDrawn,
  useSpecial,
  peekAt,
  swapCards,
  nextTimeout,
  tick,
  removePlayerFromGame,
  computeWinners,
  HAND_POSITIONS,
  REVEAL_MS,
  TURN_MS,
  DEFAULT_ROUNDS,
  type BeverbendeState
} from './engine'

/** Deterministic mulberry32 PRNG. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let idSeq = 0
const num = (value: number): BeverbendeCard => ({ id: `t${idSeq++}`, type: 'number', value })
const peek = (): BeverbendeCard => ({ id: `t${idSeq++}`, type: 'peek' })
const swap = (): BeverbendeCard => ({ id: `t${idSeq++}`, type: 'swap' })
const drawTwo = (): BeverbendeCard => ({ id: `t${idSeq++}`, type: 'drawTwo' })

/** A player's four-card row from explicit cards, all known-false by default. */
function row(cards: BeverbendeCard[]): { cards: BeverbendeCard[]; known: boolean[] } {
  return { cards, known: cards.map(() => false) }
}

/**
 * Build a controlled `playing`-phase state so reducers can be tested deterministically
 * without fighting the deal RNG. `drawPile` top is its LAST element.
 */
function playing(opts: {
  players: string[]
  rows?: Record<string, BeverbendeCard[]>
  drawPile?: BeverbendeCard[]
  discardPile?: BeverbendeCard[]
  current?: string
  turnsThisRound?: number
  round?: number
  totalRounds?: number
}): BeverbendeState {
  const players: BeverbendeState['players'] = {}
  for (const id of opts.players) {
    const cards = opts.rows?.[id] ?? [num(1), num(2), num(3), num(4)]
    const r = row(cards)
    players[id] = {
      playerId: id,
      cards: r.cards,
      known: r.known,
      ready: true,
      cumulativeScore: 0,
      roundScore: null
    }
  }
  return {
    status: 'playing',
    totalRounds: opts.totalRounds ?? 3,
    round: opts.round ?? 1,
    playerOrder: [...opts.players],
    players,
    drawPile: opts.drawPile ?? [num(5), num(6), num(7)],
    discardPile: opts.discardPile ?? [num(0)],
    currentPlayerId: opts.current ?? opts.players[0],
    pending: null,
    startingPlayerIndex: 0,
    turnsThisRound: opts.turnsThisRound ?? 0,
    roundEndingPlayerId: null,
    finalTurnsLeft: null,
    deadline: TURN_MS,
    turnStartedAt: 0
  }
}

// --- createGame / dealing --------------------------------------------------

describe('createGame / dealing', () => {
  it.each([2, 3, 4, 5, 6])('deals four cards to every player (%i players)', (n) => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`)
    const s = createGame(ids, undefined, 0, seededRng(3))
    for (const id of ids) expect(s.players[id].cards).toHaveLength(HAND_POSITIONS)
  })

  it('leaves the rest as the draw pile with a numeric starting discard', () => {
    const ids = ['a', 'b', 'c']
    const s = createGame(ids, undefined, 0, seededRng(9))
    // 66 total - (4 * 3 dealt) - 1 face-up discard = 53 in the draw pile.
    expect(s.drawPile).toHaveLength(66 - 4 * 3 - 1)
    expect(s.discardPile).toHaveLength(1)
    expect(s.discardPile[0].type).toBe('number')
  })

  it('reveals only the outer two cards to their owner', () => {
    const s = createGame(['a', 'b'], undefined, 0, seededRng(1))
    expect(s.players['a'].known).toEqual([true, false, false, true])
  })

  it('starts in the reveal phase and defaults to five rounds', () => {
    const s = createGame(['a', 'b'], undefined, 0, seededRng(1))
    expect(s.status).toBe('reveal')
    expect(s.totalRounds).toBe(DEFAULT_ROUNDS)
    expect(s.deadline).toBe(REVEAL_MS)
  })

  it('respects and clamps a chosen round count', () => {
    expect(createGame(['a', 'b'], { rounds: 4 }, 0, seededRng(1)).totalRounds).toBe(4)
    expect(createGame(['a', 'b'], { rounds: 99 }, 0, seededRng(1)).totalRounds).toBe(6)
    expect(createGame(['a', 'b'], { rounds: 1 }, 0, seededRng(1)).totalRounds).toBe(2)
  })

  it('never starts the discard with a special card', () => {
    // Run many seeds; the setup rule must always yield a numeric starting discard.
    for (let seed = 0; seed < 40; seed++) {
      const s = createGame(['a', 'b', 'c', 'd'], undefined, 0, seededRng(seed))
      expect(s.discardPile[0].type).toBe('number')
    }
  })
})

// --- reveal phase ----------------------------------------------------------

describe('reveal phase', () => {
  it('starts play once every player is ready', () => {
    let s = createGame(['a', 'b'], undefined, 0, seededRng(1))
    const r1 = markReady(s, 'a', 1)
    expect(r1.ok).toBe(true)
    s = (r1 as { state: BeverbendeState }).state
    expect(s.status).toBe('reveal')
    const r2 = markReady(s, 'b', 2)
    s = (r2 as { state: BeverbendeState }).state
    expect(s.status).toBe('playing')
  })

  it('starts play when the reveal timer expires', () => {
    const s = createGame(['a', 'b'], undefined, 0, seededRng(1))
    expect(nextTimeout(s)).toBe(REVEAL_MS)
    const next = tick(s, REVEAL_MS, seededRng(1))
    expect(next.status).toBe('playing')
  })

  it('rejects turn actions during the reveal phase', () => {
    const s = createGame(['a', 'b'], undefined, 0, seededRng(1))
    expect(drawFromPile(s, 'a', 1).ok).toBe(false)
  })
})

// --- turn ownership & basic flow -------------------------------------------

describe('turn ownership', () => {
  it('rejects actions from a non-active player', () => {
    const s = playing({ players: ['a', 'b'], current: 'a' })
    const r = drawFromPile(s, 'b', 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('NOT_YOUR_TURN')
  })

  it('advances to the next seat after a turn', () => {
    const s = playing({ players: ['a', 'b', 'c'], current: 'a', drawPile: [num(5)] })
    const drew = drawFromPile(s, 'a', 1)
    expect(drew.ok).toBe(true)
    const placed = replaceWithDrawn((drew as { state: BeverbendeState }).state, 'a', 1, 2)
    expect(placed.ok).toBe(true)
    expect((placed as { state: BeverbendeState }).state.currentPlayerId).toBe('b')
  })

  it('rejects a second draw while a drawn card is still pending (no unlimited draws)', () => {
    const s = playing({ players: ['a', 'b'], current: 'a', drawPile: [num(5), num(6)] })
    const drew = drawFromPile(s, 'a', 1)
    const again = drawFromPile((drew as { state: BeverbendeState }).state, 'a', 1)
    expect(again.ok).toBe(false)
  })

  it('rejects actions once the game is finished', () => {
    const s = playing({ players: ['a', 'b'] })
    s.status = 'finished'
    const r = drawFromPile(s, 'a', 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('GAME_OVER')
  })
})

// --- Action A: take the discard --------------------------------------------

describe('Action A — take the discard', () => {
  it('takes the numeric discard top into a position and discards the replaced card', () => {
    const s = playing({
      players: ['a', 'b'],
      rows: { a: [num(9), num(9), num(9), num(9)] },
      discardPile: [num(2)]
    })
    const r = takeDiscard(s, 'a', 1, 100)
    expect(r.ok).toBe(true)
    const ns = (r as { state: BeverbendeState }).state
    expect(ns.players['a'].cards[1]).toMatchObject({ type: 'number', value: 2 })
    expect(ns.players['a'].known[1]).toBe(true)
    expect(ns.discardPile[ns.discardPile.length - 1]).toMatchObject({ value: 9 })
    expect(ns.currentPlayerId).toBe('b') // turn advanced
  })

  it('refuses to take a power card from the discard', () => {
    const s = playing({ players: ['a', 'b'], discardPile: [num(1), swap()] })
    const r = takeDiscard(s, 'a', 0)
    expect(r.ok).toBe(false)
  })

  it('rejects an invalid position', () => {
    const s = playing({ players: ['a', 'b'], discardPile: [num(3)] })
    expect(takeDiscard(s, 'a', 4).ok).toBe(false)
    expect(takeDiscard(s, 'a', -1).ok).toBe(false)
  })
})

// --- Action B: draw & resolve ----------------------------------------------

describe('Action B — draw from the pile', () => {
  it('draws a card into a private pending decision', () => {
    const s = playing({ players: ['a', 'b'], drawPile: [num(8)] })
    const r = drawFromPile(s, 'a', 1)
    expect(r.ok).toBe(true)
    const ns = (r as { state: BeverbendeState }).state
    expect(ns.pending).toMatchObject({ kind: 'decide' })
  })

  it('can replace with a drawn number (old card to discard, position now known)', () => {
    const s = playing({
      players: ['a', 'b'],
      rows: { a: [num(9), num(9), num(9), num(9)] },
      drawPile: [num(0)]
    })
    const drew = drawFromPile(s, 'a', 1)
    const r = replaceWithDrawn((drew as { state: BeverbendeState }).state, 'a', 2, 2)
    expect(r.ok).toBe(true)
    const ns = (r as { state: BeverbendeState }).state
    expect(ns.players['a'].cards[2]).toMatchObject({ value: 0 })
    expect(ns.players['a'].known[2]).toBe(true)
    expect(ns.discardPile[ns.discardPile.length - 1]).toMatchObject({ value: 9 })
  })

  it('can discard a drawn number unused, ending the turn', () => {
    const s = playing({ players: ['a', 'b'], drawPile: [num(4)] })
    const drew = drawFromPile(s, 'a', 1)
    const r = discardDrawn((drew as { state: BeverbendeState }).state, 'a', 2)
    expect(r.ok).toBe(true)
    const ns = (r as { state: BeverbendeState }).state
    expect(ns.discardPile[ns.discardPile.length - 1]).toMatchObject({ value: 4 })
    expect(ns.currentPlayerId).toBe('b')
  })

  it('rejects useSpecial on a number card', () => {
    const s = playing({ players: ['a', 'b'], drawPile: [num(4)] })
    const drew = drawFromPile(s, 'a', 1)
    expect(useSpecial((drew as { state: BeverbendeState }).state, 'a').ok).toBe(false)
  })
})

// --- Peek ------------------------------------------------------------------

describe('Peek', () => {
  it('privately reveals one own card, leaving it in place, and ends the turn', () => {
    const s = playing({
      players: ['a', 'b'],
      rows: { a: [num(1), num(2), num(3), num(4)] },
      drawPile: [peek()]
    })
    const drew = drawFromPile(s, 'a', 1)
    const used = useSpecial((drew as { state: BeverbendeState }).state, 'a')
    expect((used as { state: BeverbendeState }).state.pending).toMatchObject({ kind: 'peek' })
    const r = peekAt((used as { state: BeverbendeState }).state, 'a', 2, 5)
    expect(r.ok).toBe(true)
    const ns = (r as { state: BeverbendeState }).state
    expect(ns.players['a'].known[2]).toBe(true)
    expect(ns.players['a'].cards).toHaveLength(4) // nothing removed
    expect(ns.players['a'].cards[2]).toMatchObject({ value: 3 })
    expect(ns.currentPlayerId).toBe('b')
  })
})

// --- Swap ------------------------------------------------------------------

describe('Swap', () => {
  function swapReady(): BeverbendeState {
    const s = playing({
      players: ['a', 'b'],
      rows: { a: [num(1), num(1), num(1), num(1)], b: [num(9), num(9), num(9), num(9)] },
      drawPile: [swap()]
    })
    s.players['a'].known = [true, true, true, true] // A knew all of its cards
    const drew = drawFromPile(s, 'a', 1)
    return (useSpecial((drew as { state: BeverbendeState }).state, 'a') as { state: BeverbendeState })
      .state
  }

  it('exchanges the two chosen cards', () => {
    const r = swapCards(swapReady(), 'a', 0, 'b', 3, 9)
    expect(r.ok).toBe(true)
    const ns = (r as { state: BeverbendeState }).state
    expect(ns.players['a'].cards[0]).toMatchObject({ value: 9 })
    expect(ns.players['b'].cards[3]).toMatchObject({ value: 1 })
  })

  it('resets positional knowledge for both affected positions', () => {
    const r = swapCards(swapReady(), 'a', 0, 'b', 3, 9)
    const ns = (r as { state: BeverbendeState }).state
    // A knew position 0 before, but must NOT know the incoming card.
    expect(ns.players['a'].known[0]).toBe(false)
    expect(ns.players['b'].known[3]).toBe(false)
    // A's untouched positions keep their prior knowledge.
    expect(ns.players['a'].known[1]).toBe(true)
  })

  it('rejects swapping with yourself and unknown targets/positions', () => {
    expect(swapCards(swapReady(), 'a', 0, 'a', 1).ok).toBe(false)
    expect(swapCards(swapReady(), 'a', 0, 'zzz', 0).ok).toBe(false)
    expect(swapCards(swapReady(), 'a', 9, 'b', 0).ok).toBe(false)
  })
})

// --- Draw Two --------------------------------------------------------------

describe('Draw Two', () => {
  it('draws a first card, lets it be declined, then forces the second to resolve', () => {
    const s = playing({
      players: ['a', 'b'],
      rows: { a: [num(9), num(9), num(9), num(9)] },
      // top (last) is the drawTwo; then first extra = 3, second extra = 0
      drawPile: [num(0), num(3), drawTwo()]
    })
    const drew = drawFromPile(s, 'a', 1)
    // Use the Draw Two → first extra card becomes pending (stage 1).
    const used = useSpecial((drew as { state: BeverbendeState }).state, 'a')
    let ns = (used as { state: BeverbendeState }).state
    expect(ns.pending).toMatchObject({ kind: 'decide', drawTwoStage: 1 })
    expect((ns.pending as { card: BeverbendeCard }).card).toMatchObject({ value: 3 })

    // Decline the first → draw the second (stage 2), still the same turn.
    const declined = discardDrawn(ns, 'a')
    ns = (declined as { state: BeverbendeState }).state
    expect(ns.pending).toMatchObject({ kind: 'decide', drawTwoStage: 2 })
    expect((ns.pending as { card: BeverbendeCard }).card).toMatchObject({ value: 0 })
    expect(ns.currentPlayerId).toBe('a') // still A's turn

    // Resolve the second card.
    const placed = replaceWithDrawn(ns, 'a', 0, 5)
    ns = (placed as { state: BeverbendeState }).state
    expect(ns.players['a'].cards[0]).toMatchObject({ value: 0 })
    expect(ns.currentPlayerId).toBe('b')
  })

  it('lets the first drawn card be kept without drawing the second', () => {
    const s = playing({
      players: ['a', 'b'],
      rows: { a: [num(9), num(9), num(9), num(9)] },
      drawPile: [num(0), num(2), drawTwo()]
    })
    const drew = drawFromPile(s, 'a', 1)
    const used = useSpecial((drew as { state: BeverbendeState }).state, 'a')
    const placed = replaceWithDrawn((used as { state: BeverbendeState }).state, 'a', 0, 5)
    const ns = (placed as { state: BeverbendeState }).state
    expect(ns.players['a'].cards[0]).toMatchObject({ value: 2 }) // kept the FIRST card
    expect(ns.currentPlayerId).toBe('b')
  })
})

// --- Knock / last round ----------------------------------------------------

describe('Knock (last round)', () => {
  it('cannot be called before everyone has had a turn', () => {
    const s = playing({ players: ['a', 'b', 'c'], current: 'a', turnsThisRound: 1 })
    const r = knock(s, 'a')
    expect(r.ok).toBe(false)
  })

  it('gives every other player exactly one final turn, then scores', () => {
    const s = playing({
      players: ['a', 'b', 'c'],
      current: 'a',
      turnsThisRound: 3,
      drawPile: [num(1), num(1), num(1), num(1), num(1), num(1)]
    })
    // A knocks (no further turn for A).
    let r = knock(s, 'a', 10)
    let ns = (r as { state: BeverbendeState }).state
    expect(ns.roundEndingPlayerId).toBe('a')
    expect(ns.currentPlayerId).toBe('b')
    expect(ns.status).toBe('playing')

    // B takes their final turn.
    r = drawFromPile(ns, 'b', 11)
    r = discardDrawn((r as { state: BeverbendeState }).state, 'b', 12)
    ns = (r as { state: BeverbendeState }).state
    expect(ns.currentPlayerId).toBe('c')
    expect(ns.status).toBe('playing')

    // C takes the last final turn → round is scored.
    r = drawFromPile(ns, 'c', 13)
    r = discardDrawn((r as { state: BeverbendeState }).state, 'c', 14)
    ns = (r as { state: BeverbendeState }).state
    expect(ns.status).toBe('roundOver')
  })

  it('cannot be called twice', () => {
    const s = playing({ players: ['a', 'b'], current: 'a', turnsThisRound: 2 })
    const r = knock(s, 'a', 10)
    const ns = (r as { state: BeverbendeState }).state
    // Simulate it coming back around (force current back to a for the test).
    ns.currentPlayerId = 'a'
    ns.pending = null
    expect(knock(ns, 'a', 11).ok).toBe(false)
  })
})

// --- Scoring & multi-round -------------------------------------------------

describe('scoring', () => {
  it('replaces leftover specials with numbers and sums the row', () => {
    const s = playing({
      players: ['a', 'b'],
      current: 'a',
      turnsThisRound: 2,
      rows: { a: [num(3), swap(), num(2), peek()], b: [num(9), num(9), num(9), num(9)] },
      // Pops (top = last): B draws num(2); then A's pos-1 special is replaced by
      // num(4) and pos-3 by num(1). Sized so no refill happens during scoring.
      drawPile: [num(1), num(4), num(2)]
    })
    // Two-player table: A knocks, B takes one turn, then scoring.
    let r = knock(s, 'a', 10)
    let ns = (r as { state: BeverbendeState }).state
    r = drawFromPile(ns, 'b', 11)
    r = discardDrawn((r as { state: BeverbendeState }).state, 'b', 12)
    ns = (r as { state: BeverbendeState }).state
    expect(ns.status).toBe('roundOver')
    // A: 3 + (swap→4) + 2 + (peek→1) = 10; no specials remain.
    expect(ns.players['a'].cards.every((c) => c.type === 'number')).toBe(true)
    expect(ns.players['a'].roundScore).toBe(3 + 4 + 2 + 1)
    expect(ns.players['a'].cumulativeScore).toBe(10)
    // B drew a number and discarded it (no replacement), so B's row stays 9*4 = 36.
    expect(ns.players['b'].roundScore).toBe(36)
  })

  it('computes the lowest cumulative score as the winner, sharing ties', () => {
    const s = playing({ players: ['a', 'b', 'c'] })
    s.players['a'].cumulativeScore = 10
    s.players['b'].cumulativeScore = 5
    s.players['c'].cumulativeScore = 5
    expect(computeWinners(s)).toEqual(['b', 'c'])
  })

  it('advances to the next round on the roundOver timer, rotating the dealer', () => {
    const s = playing({ players: ['a', 'b'], round: 1, totalRounds: 3 })
    s.status = 'roundOver'
    s.deadline = 100
    s.roundScores = { a: 5, b: 7 }
    const next = tick(s, 100, seededRng(2))
    expect(next.round).toBe(2)
    expect(next.startingPlayerIndex).toBe(1)
    expect(next.status).toBe('reveal')
    expect(next.currentPlayerId).toBe('b')
  })

  it('finishes the game after the final round is scored', () => {
    const s = playing({
      players: ['a', 'b'],
      current: 'a',
      turnsThisRound: 2,
      round: 3,
      totalRounds: 3,
      drawPile: [num(1), num(1), num(1), num(1)]
    })
    let r = knock(s, 'a', 10)
    let ns = (r as { state: BeverbendeState }).state
    r = drawFromPile(ns, 'b', 11)
    r = discardDrawn((r as { state: BeverbendeState }).state, 'b', 12)
    ns = (r as { state: BeverbendeState }).state
    expect(ns.status).toBe('finished')
    expect(ns.winnerIds).toBeDefined()
    expect(nextTimeout(ns)).toBeNull()
  })
})

// --- Idle turn timer -------------------------------------------------------

describe('turn timer', () => {
  it('force-ends an idle turn deterministically', () => {
    const s = playing({ players: ['a', 'b'], current: 'a' })
    s.deadline = 1000
    const next = tick(s, 1000, seededRng(1))
    expect(next.currentPlayerId).toBe('b')
  })

  it('discards a pending drawn card when the turn times out', () => {
    const s = playing({ players: ['a', 'b'], current: 'a', drawPile: [num(6)] })
    const drew = drawFromPile(s, 'a', 1)
    const ns = (drew as { state: BeverbendeState }).state
    ns.deadline = 1000
    const timed = tick(ns, 1000, seededRng(1))
    expect(timed.pending).toBeNull()
    expect(timed.currentPlayerId).toBe('b')
  })
})

// --- Disconnect / leave ----------------------------------------------------

describe('removePlayerFromGame', () => {
  it('finishes the game when fewer than two players remain', () => {
    const s = playing({ players: ['a', 'b'], current: 'a' })
    const next = removePlayerFromGame(s, 'b', 5, seededRng(1))
    expect(next).not.toBeNull()
    expect(next!.status).toBe('finished')
    expect(next!.winnerIds).toEqual(['a'])
  })

  it('passes the turn on when the current player leaves', () => {
    const s = playing({ players: ['a', 'b', 'c'], current: 'a' })
    const next = removePlayerFromGame(s, 'a', 5, seededRng(1))
    expect(next).not.toBeNull()
    expect(next!.playerOrder).toEqual(['b', 'c'])
    expect(next!.currentPlayerId).toBe('b')
  })

  it('returns null when the last player leaves', () => {
    const s = playing({ players: ['a', 'b'] })
    const one = removePlayerFromGame(s, 'b', 5, seededRng(1))
    const none = removePlayerFromGame(one!, 'a', 5, seededRng(1))
    expect(none).toBeNull()
  })
})
