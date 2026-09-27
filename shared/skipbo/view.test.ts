import { describe, it, expect } from 'vitest'
import { createGame, type SkipBoGameState } from './engine'
import { getPlayerView, getResults } from './view'

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

function newGame(players: string[]): SkipBoGameState {
  return createGame(players, undefined, 0, seededRng(9))
}

/** The exact set of card ids present anywhere in a serialized view. */
function idsIn(view: unknown): Set<string> {
  const serialized = JSON.stringify(view)
  return new Set(Array.from(serialized.matchAll(/"id":"([^"]+)"/g), (m) => m[1]))
}

describe('getPlayerView — hidden information', () => {
  it('serializes only the recipient’s own hand', () => {
    const g = newGame(['a', 'b'])
    const view = getPlayerView(g, 'a')
    expect(view.hand.map((c) => c.id).sort()).toEqual(g.players.a.hand.map((c) => c.id).sort())
    // No `hand` array is exposed for opponents at all.
    for (const p of view.players) {
      expect(p).not.toHaveProperty('hand')
    }
  })

  it('never leaks another player’s hand card ids anywhere in the view', () => {
    const g = newGame(['a', 'b'])
    const view = getPlayerView(g, 'a')
    const present = idsIn(view)
    for (const card of g.players.b.hand) {
      expect(present.has(card.id)).toBe(false)
    }
  })

  it('never leaks buried stock cards (only the top is public)', () => {
    const g = newGame(['a', 'b'])
    const view = getPlayerView(g, 'a')
    const present = idsIn(view)
    // Every stock card EXCEPT each player's visible top must be absent.
    for (const id of ['a', 'b']) {
      const stock = g.players[id].stock
      const top = stock[stock.length - 1]
      for (const card of stock) {
        if (card.id === top.id) continue
        expect(present.has(card.id)).toBe(false)
      }
    }
  })

  it('never serializes the draw pile or completed reservoir order', () => {
    const g = newGame(['a', 'b'])
    const view = getPlayerView(g, 'a')
    // Collect the exact set of card ids present in the serialized view.
    const serialized = JSON.stringify(view)
    const present = new Set(Array.from(serialized.matchAll(/"id":"([^"]+)"/g), (m) => m[1]))
    for (const card of g.drawPile) expect(present.has(card.id)).toBe(false)
    // Counts are exposed, but not the cards themselves.
    expect(view.drawPileCount).toBe(g.drawPile.length)
    expect(view.completedCount).toBe(g.completed.length)
  })

  it('exposes public counts, stock tops and building requirements', () => {
    const g = newGame(['a', 'b'])
    const view = getPlayerView(g, 'a')
    const opp = view.players.find((p) => p.playerId === 'b')!
    expect(opp.stockCount).toBe(30)
    expect(opp.stockTop?.id).toBe(g.players.b.stock.at(-1)!.id)
    expect(opp.discardTops).toHaveLength(4)
    expect(view.buildingPiles.every((p) => p.required === 1)).toBe(true)
    expect(view.yourTurn).toBe(true)
  })
})

describe('getResults', () => {
  it('reports the winner, per-player stats and stock left', () => {
    const g = newGame(['a', 'b'])
    g.status = 'finished'
    g.winnerId = 'a'
    g.players.a.stock = []
    const results = getResults(g)
    expect(results.winnerId).toBe('a')
    expect(results.stockLeft.a).toBe(0)
    expect(results.stockLeft.b).toBe(30)
    expect(results.stats.a).toBeDefined()
  })
})
