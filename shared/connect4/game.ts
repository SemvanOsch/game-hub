/**
 * Connect 4 {@link GameEngine} implementation: the adapter that plugs the pure
 * Connect 4 rules into the game-agnostic multiplayer core.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import {
  createGame,
  dropDiscForPlayer,
  removePlayerFromGame,
  type Connect4GameState
} from './engine'
import { getPlayerView, getResults, type Connect4Results, type Connect4View } from './view'
import { isColumnInRange } from './types'

/** Drop a disc into a column. The colour/owner is decided by the server. */
export interface DropDiscAction {
  type: 'drop_disc'
  column: number
}

export type Connect4Action = DropDiscAction

export const connect4Engine: GameEngine<
  Connect4GameState,
  Connect4View,
  Connect4Action,
  Connect4Results
> = {
  id: 'connect4',
  minPlayers: 2,
  maxPlayers: 2,

  createGame,

  validateAction(raw: unknown): Connect4Action | null {
    if (!raw || typeof raw !== 'object') return null
    const action = raw as Record<string, unknown>
    if (action.type !== 'drop_disc') return null
    const { column } = action
    // Reject anything that is not an in-range integer column (guards negatives,
    // out-of-range, and non-integers before the reducer ever sees it).
    if (!isColumnInRange(column as number)) return null
    return { type: 'drop_disc', column: column as number }
  },

  applyAction(
    state: Connect4GameState,
    playerId: string,
    action: Connect4Action
  ): EngineActionResult<Connect4GameState> {
    switch (action.type) {
      case 'drop_disc':
        return dropDiscForPlayer(state, playerId, action.column)
      default:
        return { ok: false, code: 'INVALID_ACTION', message: 'Unknown action.' }
    }
  },

  removePlayer: removePlayerFromGame,
  getPlayerView,
  isFinished: (state) => state.status === 'finished',
  getResults,
  getWinnerIds: (state) => (state.winnerId ? [state.winnerId] : [])
}
