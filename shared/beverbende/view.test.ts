import { describe, it, expect } from 'vitest'
import type { BeverbendeCard } from './cards'
import type { BeverbendeState } from './engine'
import { drawFromPile, useSpecial } from './engine'
import { getPlayerView, getResults } from './view'

let idSeq = 0
const num = (value: number): BeverbendeCard => ({ id: `v${idSeq++}`, type: 'number', value })
const peek = (): BeverbendeCard => ({ id: `v${idSeq++}`, type: 'peek' })

/** A controlled two-player playing state. */
function state(): BeverbendeState {
  return {
    status: 'playing',
    totalRounds: 3,
    round: 1,
    playerOrder: ['a', 'b'],
    players: {
      a: {
        playerId: 'a',
        cards: [num(1), num(2), num(3), num(4)],
        known: [true, false, false, true],
        ready: true,
        cumulativeScore: 0,
        roundScore: null
      },
      b: {
        playerId: 'b',
        cards: [num(5), num(6), num(7), num(8)],
        known: [true, false, false, true],
        ready: true,
        cumulativeScore: 0,
        roundScore: null
      }
    },
    // Top of the draw pile is the LAST element, so num(0) is drawn first.
    drawPile: [peek(), num(0)],
    discardPile: [num(9)],
    currentPlayerId: 'a',
    pending: null,
    startingPlayerIndex: 0,
    turnsThisRound: 0,
    roundEndingPlayerId: null,
    finalTurnsLeft: null,
    deadline: 1000,
    turnStartedAt: 0
  }
}

describe('getPlayerView — own cards', () => {
  it('reveals only the positions the owner knows, omitting the rest', () => {
    const view = getPlayerView(state(), 'a')
    const self = view.players.find((p) => p.isSelf)!
    expect(self.cards[0]).toEqual({ card: { id: expect.any(String), type: 'number', value: 1 }, known: true })
    expect(self.cards[1]).toEqual({ card: null, known: false })
    expect(self.cards[2]).toEqual({ card: null, known: false })
    expect(self.cards[3].known).toBe(true)
  })
})

describe('getPlayerView — opponents (no leaks)', () => {
  it('never serializes an opponent card identity during play', () => {
    const view = getPlayerView(state(), 'a')
    const opp = view.players.find((p) => p.playerId === 'b')!
    for (const slot of opp.cards) {
      expect(slot.card).toBeNull()
      expect(slot.known).toBe(false)
    }
  })

  it('does not expose the draw pile order — only a count', () => {
    const view = getPlayerView(state(), 'a')
    expect(view.drawPileCount).toBe(2)
    expect((view as unknown as Record<string, unknown>).drawPile).toBeUndefined()
  })

  it('exposes only the face-up discard top', () => {
    const view = getPlayerView(state(), 'a')
    expect(view.discardTop).toMatchObject({ value: 9 })
  })
})

describe('getPlayerView — private drawn card', () => {
  it('sends the pending drawn card only to the acting player', () => {
    const s = state()
    const drew = drawFromPile(s, 'a', 1)
    const ns = (drew as { state: BeverbendeState }).state

    const actorView = getPlayerView(ns, 'a')
    expect(actorView.pending).toMatchObject({ kind: 'decide' })
    expect((actorView.pending as { card: BeverbendeCard }).card).toMatchObject({ value: 0 })

    const otherView = getPlayerView(ns, 'b')
    expect(otherView.pending).toBeNull() // opponent never receives the drawn card
    expect(otherView.currentActionKind).toBe('decide') // but may see that A is deciding
  })

  it('does not leak the peek target card to opponents', () => {
    const s = state()
    // Draw the peek (top of pile is peek here) and use it.
    s.drawPile = [num(0), peek()]
    const drew = drawFromPile(s, 'a', 1)
    const used = useSpecial((drew as { state: BeverbendeState }).state, 'a')
    const ns = (used as { state: BeverbendeState }).state
    const otherView = getPlayerView(ns, 'b')
    // B sees A is peeking, but no card identity of A's row is exposed.
    expect(otherView.currentActionKind).toBe('peek')
    const aFromB = otherView.players.find((p) => p.playerId === 'a')!
    for (const slot of aFromB.cards) expect(slot.card).toBeNull()
  })
})

describe('getPlayerView — end-of-round reveal', () => {
  it('reveals every card to everyone once the round is scored', () => {
    const s = state()
    s.status = 'roundOver'
    const view = getPlayerView(s, 'a')
    for (const p of view.players) {
      for (const slot of p.cards) {
        expect(slot.card).not.toBeNull()
        expect(slot.known).toBe(true)
      }
    }
  })
})

describe('getResults', () => {
  it('ranks players by ascending cumulative score', () => {
    const s = state()
    s.players['a'].cumulativeScore = 12
    s.players['b'].cumulativeScore = 4
    s.winnerIds = ['b']
    s.status = 'finished'
    const results = getResults(s)
    expect(results.standings.map((r) => r.playerId)).toEqual(['b', 'a'])
    expect(results.winnerIds).toEqual(['b'])
    expect(results.cumulative).toEqual({ a: 12, b: 4 })
  })
})
