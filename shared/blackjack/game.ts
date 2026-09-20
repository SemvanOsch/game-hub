/**
 * Blackjack {@link GameEngine} implementation: the adapter that plugs the pure
 * Blackjack rules into the game-agnostic multiplayer core.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import {
  createGame,
  doubleDown,
  finishMatch,
  hit,
  nextHand,
  removePlayerFromGame,
  split,
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
export interface SplitAction {
  type: 'split'
}
export interface NextHandAction {
  type: 'next_hand'
}
export interface FinishAction {
  type: 'finish'
}

export type BlackjackAction =
  | HitAction
  | StandAction
  | DoubleAction
  | SplitAction
  | NextHandAction
  | FinishAction

const ACTION_TYPES = new Set(['hit', 'stand', 'double', 'split', 'next_hand', 'finish'])

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
      case 'split':
        return split(state, playerId)
      case 'next_hand':
        return nextHand(state, playerId)
      case 'finish':
        return finishMatch(state, playerId)
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
