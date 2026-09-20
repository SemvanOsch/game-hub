import { describe, expect, it } from 'vitest'
import { headToHeadScore } from './friends'

describe('headToHeadScore', () => {
  it('is zero for both when no games are recorded', () => {
    expect(headToHeadScore([])).toEqual({ mine: 0, theirs: 0 })
  })

  it('awards a point to whoever has more wins in a game', () => {
    const score = headToHeadScore([{ gameId: 'yahtzee', wins: 3, losses: 1 }])
    expect(score).toEqual({ mine: 1, theirs: 0 })
  })

  it('awards the friend the point when they win more', () => {
    const score = headToHeadScore([{ gameId: 'battleships', wins: 2, losses: 5 }])
    expect(score).toEqual({ mine: 0, theirs: 1 })
  })

  it('awards no points to either side on a tie', () => {
    const score = headToHeadScore([{ gameId: 'yahtzee', wins: 4, losses: 4 }])
    expect(score).toEqual({ mine: 0, theirs: 0 })
  })

  it('sums one point per game across games', () => {
    const score = headToHeadScore([
      { gameId: 'yahtzee', wins: 5, losses: 2 }, // mine
      { gameId: 'battleships', wins: 1, losses: 3 }, // theirs
      { gameId: 'rummikub', wins: 2, losses: 2 } // tie
    ])
    expect(score).toEqual({ mine: 1, theirs: 1 })
  })
})
