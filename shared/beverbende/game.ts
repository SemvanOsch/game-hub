/**
 * Beverbende {@link GameEngine} implementation: the adapter that plugs the pure
 * Beverbende rules into the game-agnostic multiplayer core. Client input is
 * untrusted and narrowed here before ever reaching a reducer. All timing flows
 * through the server clock (`Date.now()`) injected here, so clients cannot
 * influence the phase/turn timers.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import {
  computeWinners,
  createGame,
  discardDrawn,
  drawFromPile,
  knock,
  markReady,
  nextTimeout,
  peekAt,
  removePlayerFromGame,
  replaceWithDrawn,
  swapCards,
  takeDiscard,
  tick,
  useSpecial,
  type BeverbendeState
} from './engine'
import { getPlayerView, getResults, type BeverbendeResults, type BeverbendeView } from './view'

export type BeverbendeAction =
  | { type: 'ready' }
  | { type: 'takeDiscard'; position: number }
  | { type: 'draw' }
  | { type: 'knock' }
  | { type: 'replace'; position: number }
  | { type: 'discardDrawn' }
  | { type: 'useSpecial' }
  | { type: 'peek'; position: number }
  | { type: 'swap'; ownPosition: number; targetId: string; targetPosition: number }

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export const beverbendeEngine: GameEngine<
  BeverbendeState,
  BeverbendeView,
  BeverbendeAction,
  BeverbendeResults
> = {
  id: 'beverbende',
  minPlayers: 2,
  maxPlayers: 6,

  createGame: (playerOrder, options) => createGame(playerOrder, options, Date.now(), Math.random),

  validateAction(raw: unknown): BeverbendeAction | null {
    if (!raw || typeof raw !== 'object') return null
    const a = raw as Record<string, unknown>
    switch (a.type) {
      case 'ready':
        return { type: 'ready' }
      case 'draw':
        return { type: 'draw' }
      case 'knock':
        return { type: 'knock' }
      case 'discardDrawn':
        return { type: 'discardDrawn' }
      case 'useSpecial':
        return { type: 'useSpecial' }
      case 'takeDiscard':
        return isInt(a.position) ? { type: 'takeDiscard', position: a.position } : null
      case 'replace':
        return isInt(a.position) ? { type: 'replace', position: a.position } : null
      case 'peek':
        return isInt(a.position) ? { type: 'peek', position: a.position } : null
      case 'swap':
        return isInt(a.ownPosition) &&
          isInt(a.targetPosition) &&
          typeof a.targetId === 'string' &&
          a.targetId.length > 0
          ? {
              type: 'swap',
              ownPosition: a.ownPosition,
              targetId: a.targetId,
              targetPosition: a.targetPosition
            }
          : null
      default:
        return null
    }
  },

  applyAction(
    state: BeverbendeState,
    playerId: string,
    action: BeverbendeAction
  ): EngineActionResult<BeverbendeState> {
    switch (action.type) {
      case 'ready':
        return markReady(state, playerId, Date.now())
      case 'takeDiscard':
        return takeDiscard(state, playerId, action.position, Date.now(), Math.random)
      case 'draw':
        return drawFromPile(state, playerId, Date.now(), Math.random)
      case 'knock':
        return knock(state, playerId, Date.now(), Math.random)
      case 'replace':
        return replaceWithDrawn(state, playerId, action.position, Date.now(), Math.random)
      case 'discardDrawn':
        return discardDrawn(state, playerId, Date.now(), Math.random)
      case 'useSpecial':
        return useSpecial(state, playerId, Date.now(), Math.random)
      case 'peek':
        return peekAt(state, playerId, action.position, Date.now(), Math.random)
      case 'swap':
        return swapCards(
          state,
          playerId,
          action.ownPosition,
          action.targetId,
          action.targetPosition,
          Date.now(),
          Math.random
        )
      default:
        return { ok: false, code: 'INVALID_ACTION', message: 'Unknown action.' }
    }
  },

  removePlayer: (state, playerId) =>
    removePlayerFromGame(state, playerId, Date.now(), Math.random),
  getPlayerView,
  isFinished: (state) => state.status === 'finished',
  nextTimeout,
  tick: (state, now) => tick(state, now, Math.random),
  getResults,
  getWinnerIds: (state) =>
    state.status === 'finished' ? (state.winnerIds ?? computeWinners(state)) : []
}
