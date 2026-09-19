/**
 * Battleships {@link GameEngine} implementation: the adapter that plugs the pure
 * Battleships rules into the game-agnostic multiplayer core.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import {
  createGame,
  fireShot,
  removePlayerFromGame,
  type BattleshipsGameState
} from './engine'
import { getPlayerView, getResults, type BattleshipsResults, type BattleshipsView } from './view'
import { BOARD_SIZE, type Coordinate } from './types'

export interface FireShotAction {
  type: 'fire_shot'
  coordinate: Coordinate
}

export type BattleshipsAction = FireShotAction

function parseCoordinate(value: unknown): Coordinate | null {
  if (!value || typeof value !== 'object') return null
  const { row, col } = value as Record<string, unknown>
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  const r = row as number
  const c = col as number
  if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null
  return { row: r, col: c }
}

export const battleshipsEngine: GameEngine<
  BattleshipsGameState,
  BattleshipsView,
  BattleshipsAction,
  BattleshipsResults
> = {
  id: 'battleships',
  minPlayers: 2,
  maxPlayers: 2,

  createGame,

  validateAction(raw: unknown): BattleshipsAction | null {
    if (!raw || typeof raw !== 'object') return null
    const action = raw as Record<string, unknown>
    if (action.type !== 'fire_shot') return null
    const coordinate = parseCoordinate(action.coordinate)
    if (!coordinate) return null
    return { type: 'fire_shot', coordinate }
  },

  applyAction(
    state: BattleshipsGameState,
    playerId: string,
    action: BattleshipsAction
  ): EngineActionResult<BattleshipsGameState> {
    switch (action.type) {
      case 'fire_shot':
        return fireShot(state, playerId, action.coordinate)
      default:
        return { ok: false, code: 'INVALID_ACTION', message: 'Unknown action.' }
    }
  },

  removePlayer: removePlayerFromGame,
  getPlayerView,
  isFinished: (state) => state.status === 'finished',
  getResults
}
