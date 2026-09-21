import { describe, it, expect } from 'vitest'
import { connect4Engine } from './game'
import type { Connect4GameState } from './engine'

/** getWinnerIds only reads status/winnerId, so a minimal cast state suffices. */
function stateWithWinner(winnerId?: string): Connect4GameState {
  return { status: 'finished', winnerId } as unknown as Connect4GameState
}

describe('connect4 engine adapter', () => {
  it('reports the single winner id', () => {
    expect(connect4Engine.getWinnerIds(stateWithWinner('a'))).toEqual(['a'])
  })

  it('reports no winner on a draw', () => {
    expect(connect4Engine.getWinnerIds(stateWithWinner(undefined))).toEqual([])
  })

  it('validates a well-formed drop action', () => {
    expect(connect4Engine.validateAction({ type: 'drop_disc', column: 3 })).toEqual({
      type: 'drop_disc',
      column: 3
    })
  })

  it('rejects malformed / out-of-range actions', () => {
    expect(connect4Engine.validateAction(null)).toBeNull()
    expect(connect4Engine.validateAction({ type: 'nope', column: 3 })).toBeNull()
    expect(connect4Engine.validateAction({ type: 'drop_disc', column: 7 })).toBeNull()
    expect(connect4Engine.validateAction({ type: 'drop_disc', column: -1 })).toBeNull()
    expect(connect4Engine.validateAction({ type: 'drop_disc', column: 2.5 })).toBeNull()
    expect(connect4Engine.validateAction({ type: 'drop_disc' })).toBeNull()
  })
})
