import { describe, it, expect } from 'vitest'
import { battleshipsEngine } from './game'
import type { BattleshipsGameState } from './engine'

/** getWinnerIds only reads status/winnerId, so a minimal cast state suffices. */
function stateWithWinner(winnerId?: string): BattleshipsGameState {
  return { status: 'finished', winnerId } as unknown as BattleshipsGameState
}

describe('battleships getWinnerIds', () => {
  it('returns the single winner id', () => {
    expect(battleshipsEngine.getWinnerIds(stateWithWinner('a'))).toEqual(['a'])
  })

  it('returns an empty array when there is no winner', () => {
    expect(battleshipsEngine.getWinnerIds(stateWithWinner(undefined))).toEqual([])
  })
})
