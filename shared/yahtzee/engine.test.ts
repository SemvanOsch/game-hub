import { describe, expect, it } from 'vitest'
import {
  calculateFinalScores,
  createGame,
  currentPlayerId,
  keepDieAction,
  rollDiceAction,
  submitScoreAction
} from './engine'
import { ALL_CATEGORIES } from './categories'

describe('createGame', () => {
  it('initializes turn order, empty scorecards and no rolls', () => {
    const game = createGame(['a', 'b'])
    expect(game.status).toBe('playing')
    expect(game.playerOrder).toEqual(['a', 'b'])
    expect(currentPlayerId(game)).toBe('a')
    expect(game.rollsUsed).toBe(0)
    expect(Object.keys(game.scorecards)).toEqual(['a', 'b'])
  })
})

describe('turn validation', () => {
  it('rejects actions from a player when it is not their turn', () => {
    const game = createGame(['a', 'b'])
    const res = rollDiceAction(game, 'b')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NOT_YOUR_TURN')
  })

  it('does not allow more than three rolls', () => {
    let game = createGame(['a', 'b'])
    for (let i = 0; i < 3; i++) {
      const res = rollDiceAction(game, 'a')
      expect(res.ok).toBe(true)
      if (res.ok) game = res.state
    }
    expect(game.rollsUsed).toBe(3)
    const fourth = rollDiceAction(game, 'a')
    expect(fourth.ok).toBe(false)
    if (!fourth.ok) expect(fourth.code).toBe('INVALID_ACTION')
  })

  it('cannot hold a die before rolling', () => {
    const game = createGame(['a', 'b'])
    const res = keepDieAction(game, 'a', 0)
    expect(res.ok).toBe(false)
  })

  it('cannot score before rolling', () => {
    const game = createGame(['a', 'b'])
    const res = submitScoreAction(game, 'a', 'chance')
    expect(res.ok).toBe(false)
  })
})

describe('scoring advances turns', () => {
  it('records a score and passes to the next player', () => {
    let game = createGame(['a', 'b'])
    const rolled = rollDiceAction(game, 'a')
    expect(rolled.ok).toBe(true)
    if (rolled.ok) game = rolled.state

    const scored = submitScoreAction(game, 'a', 'chance')
    expect(scored.ok).toBe(true)
    if (scored.ok) game = scored.state

    expect(game.scorecards.a.scores.chance).toBeDefined()
    expect(currentPlayerId(game)).toBe('b')
    expect(game.rollsUsed).toBe(0)
  })

  it('rejects scoring a category twice', () => {
    let game = createGame(['a'])
    const rolled = rollDiceAction(game, 'a')
    if (rolled.ok) game = rolled.state
    const first = submitScoreAction(game, 'a', 'chance')
    if (first.ok) game = first.state
    // 'a' is a solo game so it is still a's turn on round 2.
    const rolled2 = rollDiceAction(game, 'a')
    if (rolled2.ok) game = rolled2.state
    const dup = submitScoreAction(game, 'a', 'chance')
    expect(dup.ok).toBe(false)
  })
})

describe('game completion', () => {
  it('finishes once all categories are filled and ranks players', () => {
    let game = createGame(['a', 'b'])
    // Fill every category for both players.
    for (const category of ALL_CATEGORIES) {
      for (const player of ['a', 'b']) {
        expect(currentPlayerId(game)).toBe(player)
        const rolled = rollDiceAction(game, player)
        if (rolled.ok) game = rolled.state
        const scored = submitScoreAction(game, player, category)
        if (scored.ok) game = scored.state
      }
    }
    expect(game.status).toBe('finished')

    const results = calculateFinalScores(game)
    expect(results).toHaveLength(2)
    expect(results[0].rank).toBe(1)
    // Sorted descending by grand total.
    expect(results[0].totals.grandTotal).toBeGreaterThanOrEqual(results[1].totals.grandTotal)
  })
})
