/**
 * Battleships {@link GameEngine} implementation: the adapter that plugs the pure
 * Battleships rules into the game-agnostic multiplayer core.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import {
  createGame,
  fireShot,
  removePlayerFromGame,
  useAbility,
  type BattleshipsGameState
} from './engine'
import { getPlayerView, getResults, type BattleshipsResults, type BattleshipsView } from './view'
import { isAbilityType, type AbilityType } from './abilities'
import { BOARD_SIZE, type Coordinate } from './types'

export interface FireShotAction {
  type: 'fire_shot'
  coordinate: Coordinate
}

/**
 * Use a special ability. The client sends ONLY the ability id and the selected
 * target cell — never the affected cells or (for Scatter Missile) the random
 * targets. The server derives those authoritatively.
 */
export interface UseAbilityAction {
  type: 'use_ability'
  ability: AbilityType
  target: Coordinate
}

export type BattleshipsAction = FireShotAction | UseAbilityAction

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
    if (action.type === 'fire_shot') {
      const coordinate = parseCoordinate(action.coordinate)
      if (!coordinate) return null
      return { type: 'fire_shot', coordinate }
    }
    if (action.type === 'use_ability') {
      if (!isAbilityType(action.ability)) return null
      const target = parseCoordinate(action.target)
      if (!target) return null
      // NOTE: any client-supplied `targets`/affected cells are deliberately
      // ignored — the server alone decides which cells an ability strikes.
      return { type: 'use_ability', ability: action.ability, target }
    }
    return null
  },

  applyAction(
    state: BattleshipsGameState,
    playerId: string,
    action: BattleshipsAction
  ): EngineActionResult<BattleshipsGameState> {
    switch (action.type) {
      case 'fire_shot':
        return fireShot(state, playerId, action.coordinate)
      case 'use_ability':
        return useAbility(state, playerId, action.ability, action.target)
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
