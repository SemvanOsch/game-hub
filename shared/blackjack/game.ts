/**
 * Blackjack {@link GameEngine} implementation: the adapter that plugs the pure
 * Blackjack rules into the game-agnostic multiplayer core.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import {
  createGame,
  doubleDown,
  hit,
  nextHand,
  removePlayerFromGame,
  stand,
  type BlackjackGameState
} from './engine'
import { getPlayerView, getResults, type BlackjackResults, type BlackjackView } from './view'

export interface HitAction {
  type: 'hit'
}
export interface StandAction {
  type: 'stand'
}
export interface DoubleAction {
  type: 'double'
}
export interface NextHandAction {
  type: 'next_hand'
}

export type BlackjackAction = HitAction | StandAction | DoubleAction | NextHandAction

const ACTION_TYPES = new Set(['hit', 'stand', 'double', 'next_hand'])

export const blackjackEngine: GameEngine<
  BlackjackGameState,
  BlackjackView,
  BlackjackAction,
  BlackjackResults
> = {
  id: 'blackjack',
  minPlayers: 2,
  maxPlayers: 6,

  createGame,

  validateAction(raw: unknown): BlackjackAction | null {
    if (!raw || typeof raw !== 'object') return null
    const action = raw as Record<string, unknown>
    if (typeof action.type !== 'string' || !ACTION_TYPES.has(action.type)) return null
    return { type: action.type } as BlackjackAction
  },

  applyAction(
    state: BlackjackGameState,
    playerId: string,
    action: BlackjackAction
  ): EngineActionResult<BlackjackGameState> {
    switch (action.type) {
      case 'hit':
        return hit(state, playerId)
      case 'stand':
        return stand(state, playerId)
      case 'double':
        return doubleDown(state, playerId)
      case 'next_hand':
        return nextHand(state, playerId)
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
