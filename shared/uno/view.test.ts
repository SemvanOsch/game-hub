import { describe, it, expect } from 'vitest'
import type { UnoCard, UnoColor } from './cards'
import { createGame, playCard, type UnoGameState, type UnoServerPlayer } from './engine'
import { getPlayerView } from './view'

const num = (id: string, color: UnoColor, value: number): UnoCard => ({
  id,
  color,
  type: 'number',
  value
})

function player(id: string, hand: UnoCard[]): UnoServerPlayer {
  return { playerId: id, hand, saidUno: false, unoPenaltyPending: false }
}

function stateWithHands(): UnoGameState {
  return {
    status: 'playing',
    stacking: false,
    pendingDraw: 0,
    pendingDrawType: null,
    playerOrder: ['a', 'b', 'c'],
    players: {
      a: player('a', [num('SECRET_A1', 'red', 3), num('SECRET_A2', 'green', 7)]),
      b: player('b', [num('SECRET_B1', 'blue', 4), num('SECRET_B2', 'yellow', 8)]),
      c: player('c', [num('SECRET_C1', 'red', 1)])
    },
    drawPile: [num('DECK_1', 'blue', 2), num('DECK_2', 'green', 9)],
    discardPile: [num('t', 'red', 9)],
    activeColor: 'red',
    direction: 1,
    currentPlayerId: 'a'
  }
}

/** Every card id present in a serialized value. */
function idsIn(value: unknown): string[] {
  const json = JSON.stringify(value)
  return ['SECRET_A1', 'SECRET_A2', 'SECRET_B1', 'SECRET_B2', 'SECRET_C1', 'DECK_1', 'DECK_2'].filter(
    (id) => json.includes(id)
  )
}

describe('getPlayerView – information security', () => {
  it("includes the recipient's own hand in full", () => {
    const viewA = getPlayerView(stateWithHands(), 'a')
    expect(viewA.hand.map((c) => c.id).sort()).toEqual(['SECRET_A1', 'SECRET_A2'])
  })

  it("never serializes another player's cards", () => {
    const state = stateWithHands()
    const viewA = getPlayerView(state, 'a')
    // No B or C card ids anywhere in A's view.
    expect(idsIn(viewA)).toEqual(expect.arrayContaining([]))
    expect(idsIn(viewA).some((id) => id.startsWith('SECRET_B'))).toBe(false)
    expect(idsIn(viewA).some((id) => id.startsWith('SECRET_C'))).toBe(false)
  })

  it('never serializes the draw pile order', () => {
    const viewA = getPlayerView(stateWithHands(), 'a')
    expect(idsIn(viewA).some((id) => id.startsWith('DECK_'))).toBe(false)
  })

  it('exposes only card COUNTS for opponents', () => {
    const viewA = getPlayerView(stateWithHands(), 'a')
    const b = viewA.players.find((p) => p.playerId === 'b')
    const c = viewA.players.find((p) => p.playerId === 'c')
    expect(b?.cardCount).toBe(2)
    expect(c?.cardCount).toBe(1)
    expect(b as object).not.toHaveProperty('hand')
  })

  it('does not leak opponent hands after a play/draw update', () => {
    let state = stateWithHands()
    const r = playCard(state, 'a', 'SECRET_A1', undefined, false)
    if (!r.ok) throw new Error('expected play to succeed')
    state = r.state
    // Now it is b's turn. SECRET_A1 is legitimately public (it is the top
    // discard), but a's REMAINING card (SECRET_A2), c's cards and the deck must
    // never reach b.
    const viewB = getPlayerView(state, 'b')
    const leaked = idsIn(viewB)
    expect(leaked).not.toContain('SECRET_A2')
    expect(leaked.some((id) => id.startsWith('SECRET_C'))).toBe(false)
    expect(leaked.some((id) => id.startsWith('DECK_'))).toBe(false)
  })

  it('a freshly created game leaks no other hand to any player', () => {
    const state = createGame(['a', 'b', 'c'])
    const viewA = getPlayerView(state, 'a')
    const ownIds = new Set(state.players.a.hand.map((c) => c.id))
    const json = JSON.stringify(viewA)
    for (const id of ['b', 'c']) {
      for (const card of state.players[id].hand) {
        // Ids are globally unique, so an opponent card id never collides with A's
        // own. Match the exact quoted id (`"u10"`) to avoid substring false
        // positives (`u1` inside `u10`).
        if (!ownIds.has(card.id)) expect(json.includes(`"${card.id}"`)).toBe(false)
      }
    }
  })
})
