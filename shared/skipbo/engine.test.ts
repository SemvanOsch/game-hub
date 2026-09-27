import { describe, it, expect } from 'vitest'
import type { SkipBoCard } from './cards'
import {
  createGame,
  discard,
  playCard,
  removePlayerFromGame,
  nextTimeout,
  tickMatch,
  stockSize,
  HAND_SIZE,
  TURN_MS,
  type SkipBoGameState
} from './engine'

// --- helpers ---------------------------------------------------------------

/** Deterministic mulberry32 PRNG for reproducible deals/shuffles. */
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

function newGame(players: string[], now = 0): SkipBoGameState {
  return createGame(players, undefined, now, seededRng(7))
}

let idSeq = 0
function num(value: number): SkipBoCard {
  return { id: `t${idSeq++}`, type: 'number', value }
}
function wild(): SkipBoCard {
  return { id: `t${idSeq++}`, type: 'skipbo', value: null }
}

// --- dealing ---------------------------------------------------------------

describe('createGame / dealing', () => {
  it('deals 30 stock cards each for 2–4 players and 20 for 5–6 (long game)', () => {
    expect(stockSize(2)).toBe(30)
    expect(stockSize(4)).toBe(30)
    expect(stockSize(5)).toBe(20)
    expect(stockSize(6)).toBe(20)
    // Explicit long is the same as the default.
    expect(stockSize(2, 'long')).toBe(30)
    expect(stockSize(5, 'long')).toBe(20)
  })

  it('deals 20/15 stock cards for a short game', () => {
    expect(stockSize(2, 'short')).toBe(20)
    expect(stockSize(4, 'short')).toBe(20)
    expect(stockSize(5, 'short')).toBe(15)
    expect(stockSize(6, 'short')).toBe(15)
  })

  it('honours the gameLength option when creating a match', () => {
    const long = createGame(['a', 'b'], { gameLength: 'long' }, 0, seededRng(7))
    const short = createGame(['a', 'b'], { gameLength: 'short' }, 0, seededRng(7))
    expect(long.gameLength).toBe('long')
    expect(long.players.a.stock).toHaveLength(30)
    expect(short.gameLength).toBe('short')
    expect(short.players.a.stock).toHaveLength(20)
    // A 5–6 player short game uses 15-card stocks.
    const short6 = createGame(['a', 'b', 'c', 'd', 'e', 'f'], { gameLength: 'short' }, 0, seededRng(7))
    expect(short6.players.a.stock).toHaveLength(15)
  })

  it('defaults to a long game when no/invalid options are given', () => {
    expect(newGame(['a', 'b']).gameLength).toBe('long')
    expect(createGame(['a', 'b'], { gameLength: 'weird' }, 0, seededRng(1)).gameLength).toBe('long')
  })

  it('sets up stocks, a full opening hand, and empty piles', () => {
    const g = newGame(['a', 'b'])
    expect(g.players.a.stock).toHaveLength(30)
    expect(g.players.b.stock).toHaveLength(30)
    // Only the starting player has drawn their hand.
    expect(g.players.a.hand).toHaveLength(HAND_SIZE)
    expect(g.players.b.hand).toHaveLength(0)
    expect(g.buildingPiles).toHaveLength(4)
    expect(g.buildingPiles.every((p) => p.length === 0)).toBe(true)
    expect(g.players.a.discards).toHaveLength(4)
    expect(g.currentPlayerId).toBe('a')
    expect(g.status).toBe('playing')
  })

  it('conserves the full 162-card deck with no duplicates or losses', () => {
    const g = newGame(['a', 'b', 'c'])
    const all: string[] = []
    for (const id of g.playerOrder) {
      all.push(...g.players[id].stock.map((c) => c.id))
      all.push(...g.players[id].hand.map((c) => c.id))
      all.push(...g.players[id].discards.flat().map((c) => c.id))
    }
    all.push(...g.drawPile.map((c) => c.id))
    all.push(...g.completed.map((c) => c.id))
    all.push(...g.buildingPiles.flat().map((c) => c.id))
    expect(all).toHaveLength(162)
    expect(new Set(all).size).toBe(162)
  })
})

// --- building piles --------------------------------------------------------

describe('building pile sequencing', () => {
  it('accepts 1 on an empty pile and rejects anything else', () => {
    const g = newGame(['a', 'b'])
    g.players.a.hand = [num(1), num(2)]
    const bad = playCard(g, 'a', { source: 'hand', cardId: g.players.a.hand[1].id }, 0)
    expect(bad.ok).toBe(false)
    const good = playCard(g, 'a', { source: 'hand', cardId: g.players.a.hand[0].id }, 0)
    expect(good.ok).toBe(true)
    if (good.ok) expect(good.state.buildingPiles[0].map((c) => c.playedAs)).toEqual([1])
  })

  it('builds sequentially 1→2→3 and rejects out-of-sequence plays', () => {
    let g = newGame(['a', 'b'])
    g.players.a.hand = [num(1), num(2), num(3), num(5)]
    for (const v of [1, 2, 3]) {
      const card = g.players.a.hand.find((c) => c.value === v)!
      const r = playCard(g, 'a', { source: 'hand', cardId: card.id }, 0)
      expect(r.ok).toBe(true)
      if (r.ok) g = r.state
    }
    expect(g.buildingPiles[0].map((c) => c.playedAs)).toEqual([1, 2, 3])
    // A 5 cannot go on a pile that needs a 4.
    const five = g.players.a.hand.find((c) => c.value === 5)!
    expect(playCard(g, 'a', { source: 'hand', cardId: five.id }, 0).ok).toBe(false)
  })

  it('completes a pile at 12 and reopens the slot', () => {
    let g = newGame(['a', 'b'])
    // Give a 12-card run and pre-fill the pile to 11.
    g.buildingPiles[0] = Array.from({ length: 11 }, (_, i) => ({
      ...num(i + 1),
      playedAs: i + 1
    }))
    g.players.a.hand = [num(12)]
    const r = playCard(g, 'a', { source: 'hand', cardId: g.players.a.hand[0].id }, 0)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.buildingPiles[0]).toHaveLength(0) // slot reopened
      expect(r.state.completed).toHaveLength(12) // cards set aside
      expect(r.state.stats.a.buildingPilesCompleted).toBe(1)
    }
  })
})

// --- Skip-Bo wilds ---------------------------------------------------------

describe('Skip-Bo wilds', () => {
  it('can represent the required number and records playedAs', () => {
    const g = newGame(['a', 'b'])
    g.buildingPiles[0] = [
      { ...num(1), playedAs: 1 },
      { ...num(2), playedAs: 2 },
      { ...num(3), playedAs: 3 }
    ]
    g.players.a.hand = [wild()]
    const r = playCard(g, 'a', { source: 'hand', cardId: g.players.a.hand[0].id }, 0)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const top = r.state.buildingPiles[0].at(-1)!
      expect(top.type).toBe('skipbo') // still a wild
      expect(top.value).toBeNull()
      expect(top.playedAs).toBe(4) // stands in for a 4
      expect(r.state.stats.a.skipBosPlayed).toBe(1)
    }
  })

  it('cannot bypass the sequence — a wild on a pile needing 4 becomes exactly 4', () => {
    const g = newGame(['a', 'b'])
    g.buildingPiles[0] = [{ ...num(1), playedAs: 1 }]
    g.players.a.hand = [wild(), num(3)]
    // Wild becomes the required 2; the pile then needs 3 (so the 3 is legal, 5 is not).
    const r1 = playCard(g, 'a', { source: 'hand', cardId: g.players.a.hand[0].id }, 0)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    expect(r1.state.buildingPiles[0].at(-1)!.playedAs).toBe(2)
    const three = r1.state.players.a.hand.find((c) => c.value === 3)!
    const r2 = playCard(r1.state, 'a', { source: 'hand', cardId: three.id }, 0)
    expect(r2.ok).toBe(true)
  })
})

// --- discard piles & turns -------------------------------------------------

describe('discard piles and turns', () => {
  it('only the top discard card is playable', () => {
    const g = newGame(['a', 'b'])
    g.players.a.discards[2] = [num(9), num(1)] // top is the 1
    g.players.a.hand = []
    // Top (a 1) plays onto an empty pile.
    const good = playCard(g, 'a', { source: 'discard', discardIndex: 2 }, 0)
    expect(good.ok).toBe(true)
    if (good.ok) {
      // The buried 9 is now the top; it cannot go on the pile needing a 2.
      expect(good.state.players.a.discards[2].map((c) => c.value)).toEqual([9])
    }
  })

  it('discarding ends the turn and advances to the next player, drawing them to 5', () => {
    const g = newGame(['a', 'b'], 1000)
    const card = g.players.a.hand[0]
    const r = discard(g, 'a', card.id, 1, 5000, seededRng(3))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.currentPlayerId).toBe('b')
      expect(r.state.players.b.hand).toHaveLength(HAND_SIZE)
      expect(r.state.players.a.discards[1].map((c) => c.id)).toContain(card.id)
      expect(r.state.turnNumber).toBe(2)
      expect(r.state.turnDeadline).toBe(5000 + TURN_MS)
    }
  })

  it('allows multiple plays in one turn without ending it', () => {
    let g = newGame(['a', 'b'])
    g.players.a.hand = [num(1), num(2)]
    const r1 = playCard(g, 'a', { source: 'hand', cardId: g.players.a.hand[0].id }, 0)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    g = r1.state
    expect(g.currentPlayerId).toBe('a') // still a's turn
    const r2 = playCard(g, 'a', { source: 'hand', cardId: g.players.a.hand[0].id }, 0)
    expect(r2.ok).toBe(true)
    if (r2.ok) expect(r2.state.currentPlayerId).toBe('a')
  })

  it('refills the hand to 5 when the whole hand is played to building piles', () => {
    let g = newGame(['a', 'b'])
    // Hand of five that plays out as 1..5 on one pile.
    g.players.a.hand = [num(1), num(2), num(3), num(4), num(5)]
    for (let i = 0; i < 5; i++) {
      const card = g.players.a.hand[0]
      const r = playCard(g, 'a', { source: 'hand', cardId: card.id }, 0)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      g = r.state
    }
    expect(g.players.a.hand).toHaveLength(HAND_SIZE) // redrawn
    expect(g.currentPlayerId).toBe('a') // same turn continues
  })
})

// --- win condition ---------------------------------------------------------

describe('win condition', () => {
  it('wins immediately when the last stock card is played', () => {
    const g = newGame(['a', 'b'])
    g.players.a.stock = [num(1)] // single stock card, plays as a 1
    g.players.a.hand = []
    const r = playCard(g, 'a', { source: 'stock' }, 0)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.status).toBe('finished')
      expect(r.state.winnerId).toBe('a')
      expect(r.state.players.a.stock).toHaveLength(0)
    }
  })

  it('rejects any action after the game is finished', () => {
    const g = newGame(['a', 'b'])
    g.players.a.stock = [num(1)]
    g.players.a.hand = [num(7)]
    const win = playCard(g, 'a', { source: 'stock' }, 0)
    expect(win.ok).toBe(true)
    if (!win.ok) return
    const after = discard(win.state, 'a', g.players.a.hand[0].id, 0)
    expect(after.ok).toBe(false)
    if (!after.ok) expect(after.code).toBe('GAME_OVER')
  })
})

// --- security --------------------------------------------------------------

describe('security / authoritative validation', () => {
  it('rejects a play from a non-current player', () => {
    const g = newGame(['a', 'b'])
    g.players.b.hand = [num(1)]
    const r = playCard(g, 'b', { source: 'hand', cardId: g.players.b.hand[0].id }, 0)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('NOT_YOUR_TURN')
  })

  it('rejects playing a card the player does not hold', () => {
    const g = newGame(['a', 'b'])
    const r = playCard(g, 'a', { source: 'hand', cardId: 'does-not-exist' }, 0)
    expect(r.ok).toBe(false)
  })

  it('rejects discarding to an out-of-range pile', () => {
    const g = newGame(['a', 'b'])
    const r = discard(g, 'a', g.players.a.hand[0].id, 99)
    expect(r.ok).toBe(false)
  })

  it('rejects playing from an empty stock', () => {
    const g = newGame(['a', 'b'])
    g.players.a.stock = []
    const r = playCard(g, 'a', { source: 'stock' }, 0)
    expect(r.ok).toBe(false)
  })

  it('does not mutate the input state on a successful action', () => {
    const g = newGame(['a', 'b'])
    g.players.a.hand = [num(1)]
    const handBefore = g.players.a.hand.length
    const r = playCard(g, 'a', { source: 'hand', cardId: g.players.a.hand[0].id }, 0)
    expect(r.ok).toBe(true)
    expect(g.players.a.hand.length).toBe(handBefore) // original untouched
  })
})

// --- draw-pile recycling ---------------------------------------------------

describe('draw-pile recycling', () => {
  it('rebuilds the draw pile from completed cards when it empties', () => {
    const g = newGame(['a', 'b'], 0)
    g.drawPile = [] // exhausted
    g.completed = [num(1), num(2), num(3), num(4), num(5)]
    g.players.a.hand = [] // force a full redraw on next turn
    // b discards to end their turn... actually make it a's turn end so b draws.
    const card = g.players.a.stock.at(-1)!
    // Simplest: advance to b by discarding from a; but a's hand is empty.
    // Instead advance via discard requires a hand card; give a a throwaway.
    g.players.a.hand = [num(9)]
    const r = discard(g, 'a', g.players.a.hand[0].id, 0, 10, seededRng(1))
    expect(r.ok).toBe(true)
    if (r.ok) {
      // b was drawn to 5 from the recycled completed cards.
      expect(r.state.players.b.hand).toHaveLength(HAND_SIZE)
      expect(r.state.completed).toHaveLength(0)
      void card
    }
  })

  it('does not block when both draw pile and completed reservoir are empty', () => {
    const g = newGame(['a', 'b'], 0)
    g.drawPile = []
    g.completed = []
    g.players.a.hand = [num(9)]
    const r = discard(g, 'a', g.players.a.hand[0].id, 0, 10, seededRng(1))
    expect(r.ok).toBe(true)
    if (r.ok) {
      // b simply plays with a smaller (empty) hand — the game is not stuck.
      expect(r.state.players.b.hand).toHaveLength(0)
      expect(r.state.currentPlayerId).toBe('b')
    }
  })
})

// --- turn timer ------------------------------------------------------------

describe('turn timer', () => {
  it('exposes the turn deadline while playing and null when finished', () => {
    const g = newGame(['a', 'b'], 1000)
    expect(nextTimeout(g)).toBe(1000 + TURN_MS)
    g.status = 'finished'
    expect(nextTimeout(g)).toBeNull()
  })

  it('is not extended by making plays (a client cannot lengthen its turn)', () => {
    const g = newGame(['a', 'b'], 1000)
    const deadline = g.turnDeadline
    g.players.a.hand = [num(1)]
    const r = playCard(g, 'a', { source: 'hand', cardId: g.players.a.hand[0].id }, 0)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state.turnDeadline).toBe(deadline)
  })

  it('auto-discards the first hand card and advances when the deadline passes', () => {
    const g = newGame(['a', 'b'], 0)
    const first = g.players.a.hand[0]
    const ticked = tickMatch(g, TURN_MS + 1, seededRng(2))
    expect(ticked.currentPlayerId).toBe('b')
    expect(ticked.players.a.discards[0].map((c) => c.id)).toContain(first.id)
    expect(ticked.players.b.hand).toHaveLength(HAND_SIZE)
  })

  it('does nothing before the deadline', () => {
    const g = newGame(['a', 'b'], 0)
    const ticked = tickMatch(g, 100, seededRng(2))
    expect(ticked).toEqual(g)
  })
})

// --- multiplayer counts & disconnect --------------------------------------

describe('multiplayer & disconnect', () => {
  it.each([2, 3, 4, 5, 6])('creates a valid game for %i players', (n) => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`)
    const g = newGame(ids)
    expect(g.playerOrder).toHaveLength(n)
    const expectedStock = n <= 4 ? 30 : 20
    for (const id of ids) expect(g.players[id].stock).toHaveLength(expectedStock)
  })

  it('passes the turn to the next seat when the current player leaves', () => {
    const g = newGame(['a', 'b', 'c'], 0)
    const next = removePlayerFromGame(g, 'a', 500, seededRng(4))
    expect(next).not.toBeNull()
    if (next) {
      expect(next.playerOrder).toEqual(['b', 'c'])
      expect(next.currentPlayerId).toBe('b')
      expect(next.players.b.hand).toHaveLength(HAND_SIZE)
      expect(next.turnDeadline).toBe(500 + TURN_MS)
    }
  })

  it('ends the match with the last player standing', () => {
    const g = newGame(['a', 'b'], 0)
    const next = removePlayerFromGame(g, 'b', 0, seededRng(4))
    expect(next).not.toBeNull()
    if (next) {
      expect(next.status).toBe('finished')
      expect(next.winnerId).toBe('a')
    }
  })

  it('returns null when the last player leaves', () => {
    let g: SkipBoGameState | null = newGame(['a'], 0)
    g = removePlayerFromGame(g, 'a')
    expect(g).toBeNull()
  })
})
