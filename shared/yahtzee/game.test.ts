import { describe, it, expect } from 'vitest'
import { yahtzeeEngine } from './game'
import { createGame, type YahtzeeGameState } from './engine'
import type { Category } from './categories'

/** Build a finished game with the given per-player scores. */
function finishedGame(scores: Record<string, Partial<Record<Category, number>>>): YahtzeeGameState {
  const state = createGame(Object.keys(scores))
  return {
    ...state,
    status: 'finished',
    scorecards: Object.fromEntries(
      Object.entries(scores).map(([id, s]) => [id, { scores: s }])
    )
  }
}

describe('yahtzee getWinnerIds', () => {
  it('returns the single highest-scoring player', () => {
    const state = finishedGame({ a: { chance: 25 }, b: { chance: 10 } })
    expect(yahtzeeEngine.getWinnerIds(state)).toEqual(['a'])
  })

  it('returns every player on a tie for first', () => {
    const state = finishedGame({ a: { chance: 20 }, b: { chance: 20 }, c: { chance: 5 } })
    const winners = yahtzeeEngine.getWinnerIds(state).sort()
    expect(winners).toEqual(['a', 'b'])
  })
})
