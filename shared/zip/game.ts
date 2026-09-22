/**
 * Zip Battle Royale {@link GameEngine} implementation: the adapter that plugs the
 * pure match rules into the game-agnostic multiplayer core. All official timing
 * flows through the server clock (`Date.now()`) injected here, so clients can
 * neither fake completion times nor advance the match on their own.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import {
  advanceRound,
  createMatch,
  getWinnerIds,
  isMatchFinished,
  nextTimeout,
  removePlayerFromMatch,
  submitSolution,
  tickMatch,
  type ZipMatchState
} from './engine'
import { getPlayerView, getResults, type ZipResults, type ZipView } from './view'

/** Submit a completed path for a specific round. */
export interface SubmitSolutionAction {
  type: 'submit_solution'
  round: number
  path: number[]
}
/** Host-only: continue from the round results to the next round (or final results). */
export interface AdvanceAction {
  type: 'advance'
}

export type ZipAction = SubmitSolutionAction | AdvanceAction

/** Narrow an untrusted path payload to a clean array of non-negative integers. */
function parsePath(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  // Guard against absurd payloads before the reducer/validator sees them.
  if (raw.length === 0 || raw.length > 2000) return null
  const out: number[] = []
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null
    out.push(v)
  }
  return out
}

export const zipEngine: GameEngine<ZipMatchState, ZipView, ZipAction, ZipResults> = {
  id: 'zip',
  minPlayers: 2,
  maxPlayers: 6,

  createGame(playerOrder: string[], options?: unknown): ZipMatchState {
    return createMatch(playerOrder, options, Date.now(), Math.random)
  },

  validateAction(raw: unknown): ZipAction | null {
    if (!raw || typeof raw !== 'object') return null
    const action = raw as Record<string, unknown>
    if (action.type === 'advance') return { type: 'advance' }
    if (action.type === 'submit_solution') {
      const { round } = action
      if (typeof round !== 'number' || !Number.isInteger(round) || round < 0) return null
      const path = parsePath(action.path)
      if (!path) return null
      return { type: 'submit_solution', round, path }
    }
    return null
  },

  applyAction(
    state: ZipMatchState,
    playerId: string,
    action: ZipAction
  ): EngineActionResult<ZipMatchState> {
    switch (action.type) {
      case 'submit_solution':
        return submitSolution(state, playerId, action.round, action.path, Date.now())
      case 'advance':
        return advanceRound(state, playerId, Date.now())
      default:
        return { ok: false, code: 'INVALID_ACTION', message: 'Unknown action.' }
    }
  },

  removePlayer: removePlayerFromMatch,
  getPlayerView,
  isFinished: isMatchFinished,
  getResults,
  getWinnerIds,
  nextTimeout,
  tick: tickMatch
}
