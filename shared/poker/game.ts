/**
 * Poker {@link GameEngine} implementation: the adapter that plugs the pure Texas
 * Hold'em rules into the game-agnostic multiplayer core.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import {
  allIn,
  bet,
  call,
  check,
  createGame,
  finishMatch,
  fold,
  nextHand,
  raise,
  removePlayerFromGame,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type PokerGameState
} from './engine'
import { getPlayerView, getResults, type PokerResults, type PokerView } from './view'

export interface FoldAction {
  type: 'fold'
}
export interface CheckAction {
  type: 'check'
}
export interface CallAction {
  type: 'call'
}
export interface BetAction {
  type: 'bet'
  amount: number
}
export interface RaiseAction {
  type: 'raise'
  amount: number
}
export interface AllInAction {
  type: 'all_in'
}
export interface NextHandAction {
  type: 'next_hand'
}
export interface FinishAction {
  type: 'finish'
}

export type PokerAction =
  | FoldAction
  | CheckAction
  | CallAction
  | BetAction
  | RaiseAction
  | AllInAction
  | NextHandAction
  | FinishAction

const AMOUNT_ACTIONS = new Set(['bet', 'raise'])
const NO_AMOUNT_ACTIONS = new Set(['fold', 'check', 'call', 'all_in', 'next_hand', 'finish'])

export const pokerEngine: GameEngine<PokerGameState, PokerView, PokerAction, PokerResults> = {
  id: 'poker',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

  createGame: (playerOrder) => createGame(playerOrder),

  validateAction(raw: unknown): PokerAction | null {
    if (!raw || typeof raw !== 'object') return null
    const action = raw as Record<string, unknown>
    if (typeof action.type !== 'string') return null
    if (NO_AMOUNT_ACTIONS.has(action.type)) {
      return { type: action.type } as PokerAction
    }
    if (AMOUNT_ACTIONS.has(action.type)) {
      if (typeof action.amount !== 'number' || !Number.isFinite(action.amount) || action.amount < 0) {
        return null
      }
      return { type: action.type, amount: Math.floor(action.amount) } as PokerAction
    }
    return null
  },

  applyAction(
    state: PokerGameState,
    playerId: string,
    action: PokerAction
  ): EngineActionResult<PokerGameState> {
    switch (action.type) {
      case 'fold':
        return fold(state, playerId)
      case 'check':
        return check(state, playerId)
      case 'call':
        return call(state, playerId)
      case 'bet':
        return bet(state, playerId, action.amount)
      case 'raise':
        return raise(state, playerId, action.amount)
      case 'all_in':
        return allIn(state, playerId)
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
  isFinished: (state) => state.status === 'game_over',
  getResults,
  getWinnerIds: (state) => (state.winnerId ? [state.winnerId] : [])
}
