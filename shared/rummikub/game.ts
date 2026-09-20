/**
 * Rummikub {@link GameEngine} implementation: the adapter that plugs the pure
 * Rummikub rules into the game-agnostic multiplayer core. Also parses untrusted
 * client actions into the strongly-typed action union.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import {
  createGame,
  drawTile,
  finishTurn,
  removePlayerFromGame,
  type RummikubGameState
} from './engine'
import { getPlayerView, getResults, type RummikubResults, type RummikubView } from './view'
import type { RummikubGroup } from './types'

/** Commit the whole proposed end-of-turn state (table + remaining rack). */
export interface FinishTurnAction {
  type: 'finish_turn'
  table: RummikubGroup[]
  rack: string[]
}
/** Draw one tile and end the turn. */
export interface DrawAction {
  type: 'draw'
}

export type RummikubAction = FinishTurnAction | DrawAction

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

/** Parse an untrusted proposed table: an array of `{ id, tileIds[] }` groups. */
function parseTable(value: unknown): RummikubGroup[] | null {
  if (!Array.isArray(value)) return null
  const groups: RummikubGroup[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null
    const g = raw as Record<string, unknown>
    if (typeof g.id !== 'string') return null
    if (!isStringArray(g.tileIds)) return null
    groups.push({ id: g.id, tileIds: g.tileIds })
  }
  return groups
}

export const rummikubEngine: GameEngine<
  RummikubGameState,
  RummikubView,
  RummikubAction,
  RummikubResults
> = {
  id: 'rummikub',
  minPlayers: 2,
  maxPlayers: 4,

  createGame,

  validateAction(raw: unknown): RummikubAction | null {
    if (!raw || typeof raw !== 'object') return null
    const action = raw as Record<string, unknown>
    if (action.type === 'draw') return { type: 'draw' }
    if (action.type === 'finish_turn') {
      const table = parseTable(action.table)
      if (!table) return null
      if (!isStringArray(action.rack)) return null
      return { type: 'finish_turn', table, rack: action.rack }
    }
    return null
  },

  applyAction(
    state: RummikubGameState,
    playerId: string,
    action: RummikubAction
  ): EngineActionResult<RummikubGameState> {
    switch (action.type) {
      case 'draw':
        return drawTile(state, playerId)
      case 'finish_turn':
        return finishTurn(state, playerId, action.table, action.rack)
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
